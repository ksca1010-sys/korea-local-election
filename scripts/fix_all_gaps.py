#!/usr/bin/env python3
"""
기초의원 선거구 폴리곤 갭 112건 일괄 수정

dong_count > matched_count 인 선거구를 전수 스캔하여
hangjeongdong_2026.geojson에서 빠진 행정동을 찾아 geometry에 union한다.

VWorld 고정 파일의 수정된 선거구(원래 VWorld bbox로 geometry 교체된 것들)는
geometry를 건드리지 않고 matched_count만 메타데이터 정합성 교정한다.

사용법:
    cd /Users/isawufo/Desktop/AI-cording-project/korea-local-election
    python3 scripts/fix_all_gaps.py
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

try:
    import geopandas as gpd
    from shapely.ops import unary_union
    from shapely.validation import make_valid
    import pandas as pd
except ImportError as e:
    print(f"✗ 의존성 없음: {e}")
    sys.exit(1)

# ============================================================
# VWorld 고정 파일 — geometry 교체하지 말 것
# (주의: 파일 자체가 VWorld 고정이더라도, 해당 선거구가 VWorld로 교정된 것만)
# ============================================================
# 이 목록의 선거구들은 이미 VWorld bbox로 geometry가 교체되어 있으므로
# geometry union 금지, matched_count만 dong_count와 동일하게 맞춤
VWORLD_FIXED_DISTRICTS = {
    # (region, district_name): True
    ("jeonnam", "순천시 자선거구"),
    ("jeonnam", "장흥군 가선거구"),
    ("jeonnam", "장흥군 나선거구"),
    ("chungnam", "예산군 가선거구"),
    ("chungnam", "아산시 라선거구"),
    ("chungnam", "아산시 마선거구"),
    ("gyeongnam", "거창군 가선거구"),
    ("chungbuk", "증평군 가선거구"),
    ("chungbuk", "증평군 나선거구"),
    ("chungbuk", "증평군 다선거구"),
    ("gyeonggi", "화성시 가선거구"),
    ("gangwon", "영월군 가선거구"),
    ("gangwon", "영월군 나선거구"),
    ("jeonnam", "광양시 다선거구"),
    ("jeonnam", "광양시 라선거구"),
    # 양산시 나선거구도 이전에 수동 수정됨
    ("gyeongnam", "양산시 나선거구"),
}

REGIONS = ["busan","chungbuk","chungnam","daegu","daejeon","gangwon",
           "gwangju","gyeongbuk","gyeonggi","gyeongnam","incheon",
           "jeonbuk","jeonnam","seoul","ulsan"]

SIDO_MAP = {
    "seoul": "11",
    "busan": "26",
    "daegu": "27",
    "incheon": "28",
    "gwangju": "29",
    "daejeon": "30",
    "ulsan": "31",
    "gyeonggi": "41",
    "chungbuk": "43",
    "chungnam": "44",
    "jeonbuk": "52",
    "jeonnam": "46",
    "gyeongbuk": "47",
    "gyeongnam": "48",
    "gangwon": "51",
}

# ============================================================
# dissolve_districts.py 핵심 로직 복사
# ============================================================

DONG_EXPAND_MAP = {
    "부천동": ["도당동", "춘의동", "역곡1동", "역곡2동", "원미1동"],
    "신중동": ["약대동", "중1동", "중2동", "중3동", "중4동"],
    "대산동": ["송내1동", "송내2동", "심곡본동", "심곡본1동"],
    "범안동": ["괴안동", "역곡3동", "범박동"],
    "용신동": ["용두동"],
    "중부동": ["황오동"],
    "금수면": ["금수강산면"],
}


def normalize_dong_name(name):
    name = name.strip()
    name = re.sub(r"\(.*?\)", "", name)
    name = re.sub(r"[()]", "", name)
    name = re.sub(r"제(\d+)동", r"\1동", name)
    name = re.sub(r"제(\d+)", r"\1", name)
    name = name.replace("\u2027", "·").replace("ㆍ", "·").replace("•", "·").replace("\u2024", "·")
    name = re.sub(r"(\d+),(\d+)", r"\1·\2", name)
    return name.strip()


_gdf_all = None

def load_all_hangjeongdong():
    global _gdf_all
    if _gdf_all is None:
        _gdf_all = gpd.read_file(HANGJEONGDONG_PATH)
    return _gdf_all


def filter_sigungu(gdf, sigungu):
    gdf_sgg = gdf[gdf["sggnm"] == sigungu]
    if len(gdf_sgg) > 0:
        return gdf_sgg
    gdf_sgg = gdf[gdf["sggnm"].str.startswith(sigungu)]
    if len(gdf_sgg) > 0:
        return gdf_sgg
    gdf_sgg = gdf[gdf["sggnm"].str.endswith(sigungu)]
    if len(gdf_sgg) > 0:
        return gdf_sgg
    base = re.sub(r"시$", "", sigungu)
    if base and len(base) >= 2:
        gdf_sgg = gdf[gdf["sggnm"].str.contains(base)]
    return gdf_sgg


def find_matching_dongs(gdf_sido, district_dongs, sigungu):
    matched = []
    unmatched = []
    gdf_all = load_all_hangjeongdong()
    gdf_sgg = filter_sigungu(gdf_sido, sigungu)
    if len(gdf_sgg) == 0:
        gdf_sgg = filter_sigungu(gdf_all, sigungu)

    processed_dongs = []
    i = 0
    while i < len(district_dongs):
        dong = district_dongs[i].strip()
        eup_paren = re.match(r"^(.+(?:읍|면))\(", dong)
        if eup_paren:
            eup_name = eup_paren.group(1)
            while i < len(district_dongs) and ")" not in district_dongs[i]:
                i += 1
            i += 1
            processed_dongs.append(eup_name)
            continue
        if re.match(r".+리\)?$", dong) and not re.search(r"(동|읍|면)", dong):
            i += 1
            continue
        processed_dongs.append(dong)
        i += 1

    expanded_dongs = []
    for dong in processed_dongs:
        norm = normalize_dong_name(dong)
        if norm in DONG_EXPAND_MAP:
            expanded_dongs.extend(DONG_EXPAND_MAP[norm])
        else:
            expanded_dongs.append(dong)

    for dong_name in expanded_dongs:
        norm_name = normalize_dong_name(dong_name.strip())
        if not norm_name:
            continue
        if norm_name.endswith("일원") and norm_name != "일원":
            if len(gdf_sgg) > 0:
                matched.append(gdf_sgg)
            continue

        gu_name = None
        actual_dong = norm_name
        gu_match = re.match(r"(.{2,}[구])[\s]*(.+동.*)$", norm_name)
        if gu_match:
            candidate_gu = gu_match.group(1)
            candidate_dong = gu_match.group(2)
            gdf_gu_check = gdf_sgg[gdf_sgg["sggnm"].str.contains(candidate_gu)]
            if len(gdf_gu_check) > 0:
                gu_name = candidate_gu
                actual_dong = normalize_dong_name(candidate_dong)
                gdf_target = gdf_gu_check
            else:
                gdf_target = gdf_sgg
        else:
            gdf_target = gdf_sgg

        actual_dong_nodot = actual_dong.replace("·", "").replace(",", "")

        def match_dong(geojson_name, target, target_nodot):
            norm = normalize_dong_name(geojson_name.split(" ")[-1])
            if norm == target:
                return True
            norm_nodot = norm.replace("·", "").replace(",", "")
            if norm_nodot == target_nodot:
                return True
            target_nonum = re.sub(r"\d+동$", "동", target)
            norm_nonum = re.sub(r"\d+동$", "동", norm)
            if target_nonum == norm_nonum and target_nonum != target:
                return True
            return False

        found = gdf_target[gdf_target["adm_nm"].apply(
            lambda x: match_dong(x, actual_dong, actual_dong_nodot)
        )]

        if len(found) == 0 and (actual_dong.endswith("면") or actual_dong.endswith("읍")):
            alt = actual_dong[:-1] + ("읍" if actual_dong.endswith("면") else "면")
            alt_nodot = alt.replace("·", "")
            found = gdf_target[gdf_target["adm_nm"].apply(
                lambda x: match_dong(x, alt, alt_nodot)
            )]

        if len(found) == 0 and (actual_dong.endswith("읍") or actual_dong.endswith("면")):
            eup_base = re.sub(r"(읍|면)$", "", actual_dong)
            if eup_base and len(eup_base) >= 2:
                found = gdf_target[gdf_target["adm_nm"].apply(
                    lambda x: normalize_dong_name(x.split(" ")[-1]).replace("·", "").startswith(eup_base)
                    and ("동" in x.split(" ")[-1])
                )]

        if len(found) > 0:
            matched.append(found)
        else:
            base = re.sub(r"(\d+가)?동$", "", actual_dong_nodot)
            if not base:
                base = re.sub(r"(읍|면)$", "", actual_dong_nodot)
            if base and len(base) >= 2:
                found_partial = gdf_target[gdf_target["adm_nm"].apply(
                    lambda x: base in normalize_dong_name(x.split(" ")[-1]).replace("·", "").replace(",", "")
                )]
                if len(found_partial) > 0:
                    matched.append(found_partial)
                else:
                    found_wide = gdf_all[gdf_all["adm_nm"].apply(
                        lambda x: match_dong(x, actual_dong, actual_dong_nodot)
                    )]
                    if len(found_wide) > 0:
                        matched.append(found_wide)
                    else:
                        found_wide_partial = gdf_sgg[gdf_sgg["adm_nm"].apply(
                            lambda x: base in normalize_dong_name(x.split(" ")[-1]).replace("·", "").replace(",", "")
                        )]
                        if len(found_wide_partial) > 0:
                            matched.append(found_wide_partial)
                        else:
                            unmatched.append(dong_name)
            else:
                unmatched.append(dong_name)

    if matched:
        result = pd.concat(matched).drop_duplicates(subset=["adm_cd2"])
    else:
        result = gpd.GeoDataFrame()
    return result, unmatched


def geom_to_geojson_dict(geom):
    return json.loads(gpd.GeoSeries([geom]).to_json())["features"][0]["geometry"]


def rebuild_topojson(region, sigungu):
    geojson_path = BASIC_DIR / region / f"basic_{sigungu}.geojson"
    topo_path = BASIC_DIR / region / f"basic_{sigungu}_topo.json"
    cmd = ["geo2topo", f"districts={geojson_path}", "-o", str(topo_path), "--quantization", "1e5"]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print(f"    ✗ TopoJSON 실패: {r.stderr[:200]}")
    else:
        print(f"    ✓ TopoJSON 재생성: {topo_path.name}")


# ============================================================
# 매핑 파일에서 선거구 dongs 로드
# ============================================================

_mappings = {}

def load_mapping(region):
    if region not in _mappings:
        p = BASIC_DIR / f"basic_district_mapping_{region}.json"
        if p.exists():
            with open(p, encoding="utf-8") as f:
                _mappings[region] = json.load(f)
        else:
            _mappings[region] = None
    return _mappings[region]


def get_district_dongs(region, district_name):
    mapping = load_mapping(region)
    if not mapping:
        return None
    for d in mapping["districts"]:
        if d.get("name") == district_name:
            return d.get("dongs", [])
    return None


# 화성시 바선거구 매핑 수정 (파싱 오류 수정)
def fix_hwaseong_ba_mapping():
    p = BASIC_DIR / "basic_district_mapping_gyeonggi.json"
    with open(p, encoding="utf-8") as f:
        m = json.load(f)
    for d in m["districts"]:
        if d["sigungu"] == "화성시" and "바선거구" in d["name"]:
            old = d["dongs"][:]
            # 파싱 오류 수정: ['봉담읍(상리', '내리', ..., '수기리)', '기배동', '화산동']
            # → ['봉담읍(상리,내리,수영리,동화리,와우리,수기리)', '기배동', '화산동']
            # 현재 dongs에서 '봉담읍(' 로 시작하는 항목과 ')' 로 끝나는 항목 찾기
            new_dongs = []
            eup_parts = []
            in_eup = False
            eup_name = None
            for item in old:
                item = item.strip()
                if re.match(r"^(.+(?:읍|면))\(", item) and ")" not in item:
                    m2 = re.match(r"^(.+(?:읍|면))\((.*)$", item)
                    eup_name = m2.group(1)
                    ri_part = m2.group(2)
                    if ri_part:
                        eup_parts.append(ri_part)
                    in_eup = True
                elif in_eup and ")" in item:
                    ri_part = item.rstrip(")")
                    if ri_part:
                        eup_parts.append(ri_part)
                    new_dongs.append(f"{eup_name}({','.join(eup_parts)})")
                    in_eup = False
                    eup_parts = []
                elif in_eup:
                    eup_parts.append(item.strip(","))
                else:
                    new_dongs.append(item)
            d["dongs"] = new_dongs
            print(f"  화성시 바선거구 매핑 수정: {old[:3]}... → {new_dongs}")
            break
    with open(p, "w", encoding="utf-8") as f:
        json.dump(m, f, ensure_ascii=False, indent=2)
    # 캐시 갱신
    if "gyeonggi" in _mappings:
        del _mappings["gyeonggi"]


# ============================================================
# 메인 수정 로직
# ============================================================

def fix_district_gap(region, geojson_path, feat_idx, feature, gdf_sido):
    """
    단일 선거구의 갭을 수정.
    1. 매핑 파일에서 dongs 목록 읽기
    2. hangjeongdong에서 찾은 gdf로 geometry union
    3. matched_count 업데이트
    Returns: (success, old_mc, new_mc)
    """
    props = feature["properties"]
    district_name = props.get("district_name", "")
    sigungu_in_props = props.get("sigungu", "")
    old_mc = props.get("matched_count", 0)
    dong_count = props.get("dong_count", 0)

    is_vworld_fixed = (region, district_name) in VWORLD_FIXED_DISTRICTS

    # 매핑에서 dongs 가져오기 (sigungu_in_props로 먼저 시도)
    dongs = get_district_dongs(region, district_name)

    # 구역지역구/비례지역구는 실제 시군구명으로 district_name 재검색
    if dongs is None and sigungu_in_props not in ("구역지역구", "비례지역구"):
        # 직접 매핑에서 찾기 실패 — 다른 region 매핑은 없으므로 skip
        pass

    if dongs is None:
        # 특수 파일명 케이스: sigungu_in_props가 '구역지역구' 등인 경우
        # 실제 지도 위치에서 창원시로 매핑된 경우 등
        # 매핑 파일의 어떤 sigungu에 이 district_name이 있는지 검색
        mapping = load_mapping(region)
        if mapping:
            for d in mapping["districts"]:
                if d.get("name") == district_name:
                    dongs = d.get("dongs", [])
                    sigungu_in_props = d.get("sigungu", sigungu_in_props)
                    break

    if dongs is None:
        return False, old_mc, old_mc, f"매핑 항목 없음"

    if is_vworld_fixed:
        # VWorld 고정 파일: geometry 건드리지 말고 matched_count만 dong_count로 맞춤
        props["matched_count"] = dong_count
        return True, old_mc, dong_count, "VWorld 고정 (메타 교정만)"

    # hangjeongdong에서 행정동 찾기
    gdf_matched, unmatched = find_matching_dongs(gdf_sido, dongs, sigungu_in_props)

    if gdf_matched.empty:
        return False, old_mc, old_mc, f"행정동 매칭 실패 (unmatched={unmatched})"

    new_mc = len(gdf_matched)

    if new_mc <= old_mc:
        # 매칭 수가 줄거나 같으면 matched_count만 업데이트
        props["matched_count"] = new_mc
        return True, old_mc, new_mc, "matched_count 교정 (geometry 변경 없음)"

    # geometry union
    try:
        buf = 0.001
        new_geom = make_valid(unary_union(gdf_matched.geometry.buffer(buf)).buffer(-buf))

        old_geom_json = feature.get("geometry")
        if old_mc == 0 or not old_geom_json or not old_geom_json.get("coordinates"):
            # 기존 geometry 없음 → 교체
            combined = new_geom
        else:
            old_gdf = gpd.GeoDataFrame.from_features(
                [{"type": "Feature", "geometry": old_geom_json, "properties": {}}],
                crs="EPSG:4326"
            )
            old_geom = old_gdf.geometry[0]
            combined = make_valid(unary_union([old_geom.buffer(buf), new_geom.buffer(buf)]).buffer(-buf))

        feature["geometry"] = geom_to_geojson_dict(combined)
        props["matched_count"] = new_mc
        return True, old_mc, new_mc, f"geometry union (unmatched={unmatched})"
    except Exception as e:
        return False, old_mc, old_mc, f"geometry union 실패: {e}"


def main():
    print("=== 기초의원 선거구 폴리곤 갭 일괄 수정 ===")
    print(f"프로젝트 루트: {PROJECT_ROOT}\n")

    # 화성시 바선거구 매핑 파싱 오류 먼저 수정
    print("[사전 작업] 화성시 바선거구 매핑 파싱 오류 수정")
    fix_hwaseong_ba_mapping()

    print("[행정동 GeoJSON 로딩]")
    gdf_all = load_all_hangjeongdong()
    print(f"  → {len(gdf_all)}개 행정동 로드됨\n")

    results = []
    modified_files = set()  # (region, sigungu) — TopoJSON 재생성 대상

    for region in REGIONS:
        region_dir = BASIC_DIR / region
        if not region_dir.is_dir():
            continue
        sido_code = SIDO_MAP.get(region, "")
        if sido_code:
            gdf_sido = gdf_all[gdf_all["sido"] == sido_code].copy()
        else:
            gdf_sido = gdf_all.copy()

        for fname in sorted(os.listdir(region_dir)):
            if not fname.endswith(".geojson"):
                continue
            fpath = region_dir / fname
            with open(fpath, encoding="utf-8") as f:
                try:
                    gj = json.load(f)
                except Exception as e:
                    print(f"  ERROR {fpath}: {e}")
                    continue

            changed = False
            for i, feat in enumerate(gj.get("features", [])):
                props = feat.get("properties", {})
                dc = props.get("dong_count", 0)
                mc = props.get("matched_count", 0)
                if dc <= mc:
                    continue

                district_name = props.get("district_name", "")
                sigungu = re.sub(r"basic_(.+)\.geojson", r"\1", fname)

                print(f"  [{region}] {fname} | {district_name} | {mc}/{dc}")
                ok, old_mc, new_mc, note = fix_district_gap(region, fpath, i, feat, gdf_sido)
                status = "OK" if ok else "FAIL"
                print(f"    → {status}: {old_mc} → {new_mc}  ({note})")
                results.append({
                    "region": region,
                    "file": fname,
                    "district": district_name,
                    "old_mc": old_mc,
                    "new_mc": new_mc,
                    "dong_count": dc,
                    "status": status,
                    "note": note,
                })
                if ok:
                    changed = True

            if changed:
                with open(fpath, "w", encoding="utf-8") as f:
                    json.dump(gj, f, ensure_ascii=False, indent=2)
                sigungu_key = re.sub(r"basic_(.+)\.geojson", r"\1", fname)
                modified_files.add((region, sigungu_key))
                print(f"  ✓ 저장: {fpath.name}")

    # TopoJSON 재생성
    print(f"\n{'='*60}")
    print("TopoJSON 재생성")
    print(f"{'='*60}")
    for region, sigungu in sorted(modified_files):
        print(f"  {sigungu} ({region})")
        rebuild_topojson(region, sigungu)

    # 결과 요약
    print(f"\n{'='*60}")
    print("수정 결과 요약")
    print(f"{'='*60}")
    ok_count = sum(1 for r in results if r["status"] == "OK")
    fail_count = sum(1 for r in results if r["status"] == "FAIL")
    print(f"\n총 {len(results)}건 처리: 성공 {ok_count}, 실패 {fail_count}\n")

    print("=== 성공 목록 ===")
    for r in results:
        if r["status"] == "OK":
            print(f"  [{r['region']}] {r['district']} | {r['old_mc']} → {r['new_mc']}/{r['dong_count']} | {r['note']}")

    if fail_count > 0:
        print("\n=== 실패 목록 ===")
        for r in results:
            if r["status"] == "FAIL":
                print(f"  [{r['region']}] {r['district']} | {r['old_mc']}/{r['dong_count']} | {r['note']}")

    print(f"\n수정된 파일 목록:")
    for region, sigungu in sorted(modified_files):
        print(f"  {region}/basic_{sigungu}.geojson")
        print(f"  {region}/basic_{sigungu}_topo.json")


if __name__ == "__main__":
    os.chdir(PROJECT_ROOT)
    main()
