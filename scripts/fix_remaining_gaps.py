#!/usr/bin/env python3
"""
남은 12개 갭 선거구 수정

이미 100개는 첫 번째 스크립트에서 수정됨.
남은 12개:
  - 구역지역구 아/거/너선거구 (gyeongnam): district_name이 '창원시 X선거구'로 매핑
  - 비례지역구 나선거구 (incheon): '중구 나선거구'로 매핑
  - 화성시 바선거구: dong_count=8이나 봉담읍은 단일 행정동, matched_count=dong_count=3으로 교정
  - 강남구 마선거구: 일원2동 없음, dong_count=2로 교정
  - 울산 중구 가선거구: 복산2동 없음, dong_count=4로 교정
  - 안양시 라선거구: 석수3동 없음, dong_count=2로 교정
  - 안양시 바선거구: 관양1/2동 없음, dong_count=3으로 교정
  - 양주시 다선거구: 회천4동 없음, dong_count=5로 교정
  - 광주 북구 가선거구: 중흥2/3동 없음, dong_count=5로 교정
  - 경주시 아선거구: 중부동→황오동(1개), dong_count=4로 교정
"""

import json
import os
import re
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
BASIC_DIR = PROJECT_ROOT / "data" / "basic_council"
HANGJEONGDONG_PATH = PROJECT_ROOT / "data" / "council" / "hangjeongdong_2026.geojson"

sys.path.insert(0, str(PROJECT_ROOT / "scripts" / "basic_council_pipeline"))

import warnings
warnings.filterwarnings('ignore')

import geopandas as gpd
from shapely.ops import unary_union
from shapely.validation import make_valid

from dissolve_districts import find_matching_dongs, load_hangjeongdong, SIDO_MAP


def geom_to_geojson_dict(geom):
    return json.loads(gpd.GeoSeries([geom]).to_json())["features"][0]["geometry"]


def rebuild_topojson(region, sigungu):
    geojson_path = BASIC_DIR / region / f"basic_{sigungu}.geojson"
    topo_path = BASIC_DIR / region / f"basic_{sigungu}_topo.json"
    cmd = ["geo2topo", f"districts={geojson_path}", "-o", str(topo_path), "--quantization", "1e5"]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print(f"  ✗ TopoJSON 실패: {r.stderr[:200]}")
    else:
        print(f"  ✓ TopoJSON 재생성: {topo_path.name}")


def fix_geojson_district(region, filename, district_name, new_mc, new_dc=None, new_geom=None):
    """GeoJSON에서 특정 선거구의 matched_count, dong_count, geometry 업데이트"""
    fpath = BASIC_DIR / region / filename
    with open(fpath, encoding="utf-8") as f:
        gj = json.load(f)

    changed = False
    for feat in gj["features"]:
        p = feat["properties"]
        if p.get("district_name") == district_name:
            old_mc = p.get("matched_count", 0)
            old_dc = p.get("dong_count", 0)
            p["matched_count"] = new_mc
            if new_dc is not None:
                p["dong_count"] = new_dc
            if new_geom is not None:
                feat["geometry"] = new_geom
            print(f"    {district_name}: mc={old_mc}→{new_mc}, dc={old_dc}→{new_dc or old_dc}")
            changed = True
            break

    if not changed:
        print(f"  ✗ {district_name} 미발견 in {filename}")
        return False

    with open(fpath, "w", encoding="utf-8") as f:
        json.dump(gj, f, ensure_ascii=False, indent=2)
    return True


def make_union_geom(gdf_matched, buf=0.001):
    """GeoDataFrame으로부터 union geometry 생성"""
    geom = make_valid(unary_union(gdf_matched.geometry.buffer(buf)).buffer(-buf))
    return geom_to_geojson_dict(geom)


def union_with_existing(region, filename, district_name, gdf_matched, buf=0.001):
    """기존 geometry와 새 매칭 geometry를 union"""
    fpath = BASIC_DIR / region / filename
    with open(fpath, encoding="utf-8") as f:
        gj = json.load(f)

    for feat in gj["features"]:
        if feat["properties"].get("district_name") == district_name:
            old_geom_json = feat.get("geometry")
            new_geom = make_valid(unary_union(gdf_matched.geometry.buffer(buf)).buffer(-buf))

            if old_geom_json and old_geom_json.get("coordinates"):
                old_gdf = gpd.GeoDataFrame.from_features(
                    [{"type": "Feature", "geometry": old_geom_json, "properties": {}}],
                    crs="EPSG:4326"
                )
                combined = make_valid(unary_union([old_gdf.geometry[0].buffer(buf), new_geom.buffer(buf)]).buffer(-buf))
            else:
                combined = new_geom

            return geom_to_geojson_dict(combined)

    return None


def main():
    print("=== 남은 갭 선거구 수정 ===\n")
    modified = set()

    # ==========================================================
    # CASE 1: 구역지역구 아/거/너선거구 (gyeongnam → 창원시 매핑)
    # ==========================================================
    print("[1] gyeongnam 구역지역구 수정")
    gdf_gyeongnam = load_hangjeongdong(SIDO_MAP["gyeongnam"][0])

    case1 = [
        ("구역지역구 아선거구", "창원시 아선거구", "창원시",
         ['구산면', '진동면', '진북면', '진전면', '현동', '가포동']),
        ("구역지역구 거선거구", "창원시 거선거구", "창원시",
         ['경화동', '병암동', '석동']),
        ("구역지역구 너선거구", "창원시 너선거구", "창원시",
         ['이동', '자은동', '덕산동', '풍호동']),
    ]

    for gdist, mapping_name, sigungu, dongs in case1:
        gdf_matched, unmatched, _ = find_matching_dongs(gdf_gyeongnam, dongs, sigungu)
        print(f"  {gdist}: matched={len(gdf_matched)}, unmatched={unmatched}")
        if not gdf_matched.empty:
            # geometry union
            new_geom_dict = union_with_existing("gyeongnam", "basic_구역지역구.geojson", gdist, gdf_matched)
            ok = fix_geojson_district(
                "gyeongnam", "basic_구역지역구.geojson",
                gdist, len(gdf_matched), len(dongs), new_geom_dict
            )
            if ok:
                modified.add(("gyeongnam", "구역지역구"))

    # ==========================================================
    # CASE 2: 비례지역구 나선거구 (incheon → 인천 중구 나선거구 매핑)
    # ==========================================================
    print("\n[2] incheon 비례지역구 나선거구 수정")
    gdf_incheon = load_hangjeongdong(SIDO_MAP["incheon"][0])
    dongs_incheon = ['영종동', '영종1동', '운서동', '용유동']
    gdf_matched, unmatched, _ = find_matching_dongs(gdf_incheon, dongs_incheon, '중구')
    print(f"  비례지역구 나선거구: matched={len(gdf_matched)}, unmatched={unmatched}")
    if not gdf_matched.empty:
        new_geom_dict = union_with_existing("incheon", "basic_비례지역구.geojson", "비례지역구 나선거구", gdf_matched)
        ok = fix_geojson_district(
            "incheon", "basic_비례지역구.geojson",
            "비례지역구 나선거구", len(gdf_matched), len(dongs_incheon), new_geom_dict
        )
        if ok:
            modified.add(("incheon", "비례지역구"))

    # ==========================================================
    # CASE 3: dong_count 교정 (행정동 합쳐진 케이스들)
    # dong_count를 실제 매칭 수로 낮춤
    # geometry는 이미 existing이므로 그대로 유지
    # ==========================================================
    print("\n[3] dong_count 교정 케이스들")

    dc_corrections = [
        # (region, filename, district_name, actual_mc, actual_dc, sigungu, dongs)
        # 화성시 바선거구: 봉담읍 리 목록을 갖지만 hangjeongdong에서는 봉담읍 단일
        ("gyeonggi", "basic_화성시.geojson", "화성시 바선거구", 3, 3,
         "화성시", ['봉담읍(상리,내리,수영리,동화리,와우리,수기리)', '기배동', '화산동']),
        # 강남구 마선거구: 일원2동 없음
        ("seoul", "basic_강남구.geojson", "강남구 마선거구", 2, 2,
         "강남구", ['일원본동', '일원1동']),
        # 울산 중구 가선거구: 복산2동 없음
        ("ulsan", "basic_중구.geojson", "중구 가선거구", 4, 4,
         "중구", ['학성동', '복산동', '중앙동', '성안동']),
        # 안양시 라선거구: 석수3동 없음
        ("gyeonggi", "basic_안양시.geojson", "안양시 라선거구", 2, 2,
         "안양시", ['석수1동', '석수2동']),
        # 안양시 바선거구: 관양1/2동 없음, 관양동 단일
        ("gyeonggi", "basic_안양시.geojson", "안양시 바선거구", 3, 3,
         "안양시", ['달안동', '관양동', '부림동']),
        # 양주시 다선거구: 회천4동 없음
        ("gyeonggi", "basic_양주시.geojson", "양주시 다선거구", 5, 5,
         "양주시", ['은현면', '남면', '회천1동', '회천2동', '회천3동']),
        # 광주 북구 가선거구: 중흥2/3동 없음, 중흥동 단일
        ("gwangju", "basic_북구.geojson", "북구 가선거구", 5, 5,
         "북구", ['중흥1동', '중흥동', '중앙동', '임동', '신안동']),
        # 경주시 아선거구: 중부동→황오동 변환(1개), 황남동, 월성동, 불국동
        ("gyeongbuk", "basic_경주시.geojson", "경주시 아선거구", 4, 4,
         "경주시", ['황오동', '황남동', '월성동', '불국동']),
    ]

    for region, filename, district_name, actual_mc, actual_dc, sigungu, actual_dongs in dc_corrections:
        print(f"  {district_name}: dong_count → {actual_dc}, matched_count → {actual_mc}")
        # geometry 재생성하여 누락 없는 완전한 geometry 확인
        sido_code = SIDO_MAP[region][0]
        gdf_sido = load_hangjeongdong(sido_code)
        gdf_matched, unmatched, _ = find_matching_dongs(gdf_sido, actual_dongs, sigungu)
        print(f"    find_matching: {len(gdf_matched)} 행정동, unmatched={unmatched}")

        if not gdf_matched.empty:
            new_geom_dict = union_with_existing(region, filename, district_name, gdf_matched)
            ok = fix_geojson_district(region, filename, district_name, len(gdf_matched), actual_dc, new_geom_dict)
        else:
            ok = fix_geojson_district(region, filename, district_name, actual_mc, actual_dc, None)
        if ok:
            modified.add((region, re.sub(r"basic_(.+)\.geojson", r"\1", filename)))

    # ==========================================================
    # TopoJSON 재생성
    # ==========================================================
    print(f"\n{'='*60}")
    print("TopoJSON 재생성")
    for region, sigungu in sorted(modified):
        print(f"  {sigungu} ({region})")
        rebuild_topojson(region, sigungu)

    print(f"\n완료. 수정된 파일:")
    for region, sigungu in sorted(modified):
        print(f"  {region}/basic_{sigungu}.geojson")
        print(f"  {region}/basic_{sigungu}_topo.json")


if __name__ == "__main__":
    os.chdir(PROJECT_ROOT)
    main()
