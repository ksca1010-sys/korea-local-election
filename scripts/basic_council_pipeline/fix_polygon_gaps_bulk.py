#!/usr/bin/env python3
"""
기초의원 선거구 GeoJSON 폴리곤 갭 일괄 수정

문제: basic_district_mapping_*.json의 dongs 배열이 파싱 오류로
      "읍면(리1,리2,...)" 형식 대신 ["읍면(리1", "리2", ..., "마지막리)"] 처럼 쪼개져 있음

수정 대상:
  jeonnam  - 순천시 자선거구, 장흥군 가/나선거구
  chungnam - 예산군 가선거구, 아산시 라/마선거구
  gyeongnam - 거창군 가선거구
  chungbuk - 증평군 가/나/다선거구
  gyeonggi - 화성시 가선거구
  gangwon  - 영월군 가/나선거구
"""

import json
import os
import re
import ssl
import subprocess
import sys
import urllib.parse
import urllib.request
from pathlib import Path

_SSL_CTX = ssl.create_default_context()
_SSL_CTX.check_hostname = False
_SSL_CTX.verify_mode = ssl.CERT_NONE

import geopandas as gpd
from shapely.ops import unary_union
from shapely.validation import make_valid

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
DATA_DIR = PROJECT_ROOT / "data" / "basic_council"

# ============================================================
# 수정 대상 정의
# ============================================================
# 각 항목: (region, sigungu, district_suffix, bbox, parsed_dongs)
# parsed_dongs: 파싱 복원된 올바른 dongs 목록 (문자열 그대로 또는 {eup_myeon, ri_list})
# bbox: (lat_min, lon_min, lat_max, lon_max) EPSG:4326

TARGETS = [
    {
        "region": "jeonnam",
        "sigungu": "순천시",
        "district_suffix": "자선거구",
        "bbox": "34.85,127.45,34.98,127.62",
        # 해룡면(대안리,남가리,...,복성리,상삼리) - 단일 읍면+리 목록
        "eup_myeon_groups": [
            {
                "eup_myeon": "해룡면",
                "ri_list": ["대안리","남가리","월전리","성산리","선월리","신성리","호두리","용전리","도롱리","중흥리","해창리","선학리","농주리","상내리","하사리","복성리","상삼리"],
            }
        ],
        "other_dongs": [],  # 읍면 전체 (리 목록 없이)
    },
    {
        "region": "chungnam",
        "sigungu": "예산군",
        "district_suffix": "가선거구",
        "bbox": "36.64,126.80,36.75,126.95",
        "eup_myeon_groups": [
            {
                "eup_myeon": "예산읍",
                "ri_list": ["예산리","대회리","주교리","산성리","발연리","석양리","관작리","창소리","신례원리","간양리","궁평리","수철리"],
            }
        ],
        "other_dongs": [],
    },
    {
        "region": "gyeongnam",
        "sigungu": "거창군",
        "district_suffix": "가선거구",
        "bbox": "35.65,127.86,35.75,127.98",
        "eup_myeon_groups": [
            {
                "eup_myeon": "거창읍",
                # 마지막 항목 '상림리원상동)' -> 상림리로 처리
                "ri_list": ["중앙리","대동리","대평리","김천리","송정리","정장리","장팔리","서변리","동변리","학리","양평리","가지리","상림리"],
            }
        ],
        "other_dongs": [],
    },
    {
        "region": "chungbuk",
        "sigungu": "증평군",
        "district_suffix": "가선거구",
        "bbox": "36.76,127.52,36.88,127.62",
        "eup_myeon_groups": [
            {
                "eup_myeon": "증평읍",
                "ri_list": ["창동리","중동리","교동리","초중리","대동리","증평리","신동리"],
            }
        ],
        "other_dongs": [],
    },
    {
        "region": "chungbuk",
        "sigungu": "증평군",
        "district_suffix": "나선거구",
        "bbox": "36.76,127.52,36.88,127.62",
        "eup_myeon_groups": [
            {
                "eup_myeon": "증평읍",
                "ri_list": ["내성리","증천리","남하리","용강리","죽리","덕상리","남차리","율리","장동리"],
            }
        ],
        "other_dongs": [],
    },
    {
        "region": "chungbuk",
        "sigungu": "증평군",
        "district_suffix": "다선거구",
        "bbox": "36.76,127.52,36.88,127.62",
        # 도안면(연탄리, 송산리, 미암리) - '증평읍' 접두어 파싱 오류 제거
        "eup_myeon_groups": [
            {
                "eup_myeon": "도안면",
                "ri_list": ["연탄리","송산리","미암리"],
            }
        ],
        "other_dongs": [],
    },
    {
        "region": "jeonnam",
        "sigungu": "장흥군",
        "district_suffix": "가선거구",
        "bbox": "34.65,126.88,34.80,126.98",
        "eup_myeon_groups": [
            {
                "eup_myeon": "장흥읍",
                "ri_list": ["기양리","예양리","건산리","상리","축내리","관덕리","원도리","행원리","연산리","성불리","사안리","영전리","송암리","충열리","교촌리","동동리","남동리","향양리","삼산리","금산리","해당리","우산리"],
            }
        ],
        "other_dongs": ["장동면","장평면","유치면","부산면"],
    },
    {
        "region": "jeonnam",
        "sigungu": "장흥군",
        "district_suffix": "나선거구",
        "bbox": "34.55,126.78,34.70,126.98",
        "eup_myeon_groups": [
            {
                "eup_myeon": "장흥읍",
                "ri_list": ["평화리","평장리","덕제리","순지리","남외리"],
            }
        ],
        "other_dongs": ["관산읍","대덕읍","용산면","안양면","회진면"],
    },
    {
        "region": "chungnam",
        "sigungu": "아산시",
        "district_suffix": "마선거구",
        "bbox": "36.72,126.90,36.85,127.05",
        "eup_myeon_groups": [
            {
                "eup_myeon": "배방읍",
                "ri_list": ["갈매리","공수리","구령리","북수리","세출리","수철리","신흥리","중리","회룡리"],
            }
        ],
        "other_dongs": ["송악면"],
    },
    {
        "region": "chungnam",
        "sigungu": "아산시",
        "district_suffix": "라선거구",
        "bbox": "36.72,126.90,36.85,127.05",
        "eup_myeon_groups": [
            {
                "eup_myeon": "배방읍",
                "ri_list": ["세교리","장재리","휴대리"],
            }
        ],
        "other_dongs": ["염치읍","탕정면"],
    },
    {
        "region": "gyeonggi",
        "sigungu": "화성시",
        "district_suffix": "가선거구",
        "bbox": "37.14,126.90,37.28,127.02",
        "eup_myeon_groups": [
            {
                "eup_myeon": "봉담읍",
                "ri_list": ["분천리","왕림리","세곡리","당하리","마하리","유리","덕리","덕우리","하가등리","상기리"],
            }
        ],
        "other_dongs": ["향남읍","팔탄면","양감면","정남면"],
    },
    {
        "region": "gangwon",
        "sigungu": "영월군",
        "district_suffix": "가선거구",
        "bbox": "37.12,128.42,37.22,128.55",
        "eup_myeon_groups": [
            {
                "eup_myeon": "영월읍",
                "ri_list": ["영흥리","하송리","방절리","삼옥리","거운리","문산리","연하리"],
            }
        ],
        "other_dongs": ["상동읍","산솔면","김삿갓면"],
    },
    {
        "region": "gangwon",
        "sigungu": "영월군",
        "district_suffix": "나선거구",
        "bbox": "37.05,128.35,37.28,128.60",
        "eup_myeon_groups": [
            {
                "eup_myeon": "영월읍",
                "ri_list": ["흥월리","팔괴리","정양리","덕포리"],
            }
        ],
        "other_dongs": ["북면","남면","한반도면","주천면","무릉도원면"],
    },
]


# ============================================================
# 유틸리티
# ============================================================

def load_vworld_key():
    env_path = PROJECT_ROOT / ".env"
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line.startswith("VWORLD_API_KEY="):
                return line.split("=", 1)[1].strip()
    raise RuntimeError(".env에 VWORLD_API_KEY 없음")


def normalize_name(s: str) -> str:
    """공백, 특수문자 제거 소문자 정규화"""
    return re.sub(r"[\s\-_·]", "", s).lower()


def fetch_vworld_features(api_key: str, bbox: str, sigungu: str) -> list:
    """VWorld WFS lt_c_adri에서 특정 시군구 법정리 경계 조회"""
    params = {
        "service": "WFS",
        "version": "1.1.0",
        "request": "GetFeature",
        "typename": "lt_c_adri",
        "output": "application/json",
        "key": api_key,
        "domain": "korea-local-election.pages.dev",
        "srsName": "EPSG:4326",
        "maxFeatures": "500",
        "bbox": f"{bbox},EPSG:4326",
    }
    url = "https://api.vworld.kr/req/wfs?" + urllib.parse.urlencode(params)
    print(f"    VWorld WFS 요청: bbox={bbox} ...")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30, context=_SSL_CTX) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    all_features = data.get("features", [])
    print(f"    → 전체 {len(all_features)}개 피처 수신")

    # 시군구 필터
    filtered = [
        f for f in all_features
        if sigungu in f.get("properties", {}).get("full_nm", "")
    ]
    print(f"    → {sigungu} 포함 {len(filtered)}개 피처")
    return filtered


def filter_features_by_eup_myeon_ri(features: list, eup_myeon: str, ri_list: list[str]) -> list:
    """읍면 + 리 목록으로 피처 필터"""
    norm_eup_myeon = normalize_name(eup_myeon)
    norm_ri_set = {normalize_name(r) for r in ri_list}

    matched = []
    for f in features:
        props = f.get("properties", {})
        full_nm = props.get("full_nm", "")
        li_kor_nm = props.get("li_kor_nm", "")

        # full_nm에 읍면 포함 확인
        if norm_eup_myeon not in normalize_name(full_nm):
            continue

        # 리 이름 매칭 (부분 일치 포함)
        norm_li = normalize_name(li_kor_nm)
        is_match = False
        for nr in norm_ri_set:
            if nr == norm_li or nr in norm_li or norm_li in nr:
                is_match = True
                break
        # '리' 없는 경우 처리: "율리" -> "율"
        if not is_match:
            li_no_suffix = re.sub(r"리$", "", norm_li)
            for nr in norm_ri_set:
                nr_no_suffix = re.sub(r"리$", "", nr)
                if nr_no_suffix == li_no_suffix or (len(nr_no_suffix) >= 2 and nr_no_suffix in li_no_suffix):
                    is_match = True
                    break

        if is_match:
            matched.append(f)

    return matched


def filter_features_by_eup_myeon_all(features: list, eup_myeon: str) -> list:
    """읍면 전체 피처 필터 (리 목록 없음)"""
    norm_eup_myeon = normalize_name(eup_myeon)
    return [
        f for f in features
        if norm_eup_myeon in normalize_name(f.get("properties", {}).get("full_nm", ""))
    ]


def dissolve_features(features: list):
    """피처 목록 dissolve"""
    if not features:
        return None
    gdf = gpd.GeoDataFrame.from_features(features, crs="EPSG:4326")
    buf = 0.0001
    geom = unary_union(gdf.geometry.buffer(buf)).buffer(-buf)
    return make_valid(geom)


def geom_to_geojson_dict(geom) -> dict:
    return json.loads(gpd.GeoSeries([geom]).to_json())["features"][0]["geometry"]


def get_geojson_bbox(geometry: dict) -> tuple:
    """geometry에서 (min_lon, min_lat, max_lon, max_lat) 반환"""
    coords = []
    if geometry["type"] == "Polygon":
        coords = geometry["coordinates"][0]
    elif geometry["type"] == "MultiPolygon":
        for poly in geometry["coordinates"]:
            coords.extend(poly[0])
    if not coords:
        return (0, 0, 0, 0)
    lons = [c[0] for c in coords]
    lats = [c[1] for c in coords]
    return (min(lons), min(lats), max(lons), max(lats))


# ============================================================
# 매핑 파일 수정
# ============================================================

def fix_mapping_dongs(region: str, sigungu: str, district_suffix: str,
                      eup_myeon_groups: list, other_dongs: list):
    """매핑 파일의 dongs 배열을 올바른 형식으로 수정"""
    mapping_path = DATA_DIR / f"basic_district_mapping_{region}.json"
    with open(mapping_path, encoding="utf-8") as f:
        mapping = json.load(f)

    fixed = False
    for dist in mapping["districts"]:
        if dist.get("sigungu") == sigungu and dist.get("name", "").endswith(district_suffix):
            old_dongs = dist["dongs"][:]
            # 올바른 dongs 재구성
            new_dongs = []
            for group in eup_myeon_groups:
                em = group["eup_myeon"]
                ri = group["ri_list"]
                if ri:
                    new_dongs.append(f"{em}({','.join(ri)})")
                else:
                    new_dongs.append(em)
            new_dongs.extend(other_dongs)
            dist["dongs"] = new_dongs
            print(f"    매핑 수정: {old_dongs[:2]}... → {new_dongs[:2]}...")
            fixed = True
            break

    if not fixed:
        print(f"    경고: {sigungu} {district_suffix} 매핑 항목 미발견")
        return

    with open(mapping_path, "w", encoding="utf-8") as f:
        json.dump(mapping, f, ensure_ascii=False, indent=2)
    print(f"    ✓ 매핑 저장: {mapping_path.name}")


# ============================================================
# GeoJSON 폴리곤 수정
# ============================================================

def update_geojson_polygon(region: str, sigungu: str, district_suffix: str,
                           new_geom, ri_total_count: int, other_dong_count: int):
    """per-city GeoJSON의 해당 선거구 geometry를 union으로 확장"""
    geojson_path = DATA_DIR / region / f"basic_{sigungu}.geojson"
    if not geojson_path.exists():
        print(f"    경고: {geojson_path} 없음 - 스킵")
        return False

    with open(geojson_path, encoding="utf-8") as f:
        geojson = json.load(f)

    target_idx = None
    district_name = f"{sigungu} {district_suffix}"
    for i, feat in enumerate(geojson["features"]):
        if feat["properties"].get("district_name") == district_name:
            target_idx = i
            break

    if target_idx is None:
        print(f"    경고: {district_name} 피처 미발견 in {geojson_path.name}")
        return False

    feat = geojson["features"][target_idx]
    old_geom_json = feat["geometry"]
    old_bbox = get_geojson_bbox(old_geom_json)

    # 기존 geometry와 새 geometry union
    if old_geom_json and old_geom_json.get("coordinates"):
        gdf_existing = gpd.GeoDataFrame.from_features(
            [{"type": "Feature", "geometry": old_geom_json, "properties": {}}],
            crs="EPSG:4326"
        )
        existing_geom = gdf_existing.geometry[0]
        buf = 0.0001
        combined = unary_union([
            existing_geom.buffer(buf),
            new_geom.buffer(buf)
        ]).buffer(-buf)
        combined = make_valid(combined)
    else:
        combined = new_geom

    feat["geometry"] = geom_to_geojson_dict(combined)
    new_bbox = get_geojson_bbox(feat["geometry"])

    # matched_count, dong_count 업데이트
    total = ri_total_count + other_dong_count
    feat["properties"]["matched_count"] = total
    feat["properties"]["dong_count"] = total

    geojson["features"][target_idx] = feat
    with open(geojson_path, "w", encoding="utf-8") as f:
        json.dump(geojson, f, ensure_ascii=False, indent=2)

    print(f"    ✓ GeoJSON 업데이트: {geojson_path.name}")
    print(f"      bbox 변화: lat=[{old_bbox[1]:.4f},{old_bbox[3]:.4f}] → lat=[{new_bbox[1]:.4f},{new_bbox[3]:.4f}]")
    print(f"      lon 변화: [{old_bbox[0]:.4f},{old_bbox[2]:.4f}] → [{new_bbox[0]:.4f},{new_bbox[2]:.4f}]")
    return True


def rebuild_topojson(region: str, sigungu: str):
    """per-city TopoJSON 재생성"""
    geojson_path = DATA_DIR / region / f"basic_{sigungu}.geojson"
    topo_path = DATA_DIR / region / f"basic_{sigungu}_topo.json"
    if not geojson_path.exists():
        print(f"    경고: {geojson_path} 없음 - TopoJSON 스킵")
        return

    cmd = [
        "geo2topo",
        f"districts={geojson_path}",
        "-o", str(topo_path),
        "--quantization", "1e5",
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"    ✗ TopoJSON 생성 실패: {result.stderr[:200]}")
    else:
        print(f"    ✓ TopoJSON 재생성: {topo_path.name}")


# ============================================================
# 메인
# ============================================================

def process_target(target: dict, api_key: str) -> bool:
    region = target["region"]
    sigungu = target["sigungu"]
    district_suffix = target["district_suffix"]
    bbox = target["bbox"]
    eup_myeon_groups = target["eup_myeon_groups"]
    other_dongs = target["other_dongs"]

    print(f"\n{'='*60}")
    print(f"처리 중: {sigungu} {district_suffix} ({region})")
    print(f"{'='*60}")

    # Step 1: 매핑 파일 수정
    print("[1] 매핑 파일 dongs 수정")
    fix_mapping_dongs(region, sigungu, district_suffix, eup_myeon_groups, other_dongs)

    # Step 2: VWorld WFS에서 폴리곤 수집
    print("[2] VWorld WFS 폴리곤 조회")
    try:
        all_features = fetch_vworld_features(api_key, bbox, sigungu)
    except Exception as e:
        print(f"    ✗ VWorld 요청 실패: {e} - 이 선거구 스킵")
        return False

    if not all_features:
        print(f"    ✗ 피처 없음 - 스킵")
        return False

    # Step 3: 각 읍면 그룹에서 피처 필터 및 dissolve
    print("[3] 폴리곤 dissolve")
    geoms_to_union = []
    ri_total = 0

    for group in eup_myeon_groups:
        eup_myeon = group["eup_myeon"]
        ri_list = group["ri_list"]
        ri_total += len(ri_list)

        matched = filter_features_by_eup_myeon_ri(all_features, eup_myeon, ri_list)
        print(f"    {eup_myeon}: {len(ri_list)}개 리 요청 → {len(matched)}개 피처 매칭")

        if matched:
            geom = dissolve_features(matched)
            if geom:
                geoms_to_union.append(geom)
                print(f"    → dissolve 성공")
        else:
            # fallback: 읍면 전체 bbox로 union
            print(f"    → 리 매칭 실패, {eup_myeon} 전체 fallback")
            fallback = filter_features_by_eup_myeon_all(all_features, eup_myeon)
            print(f"    → fallback 피처 {len(fallback)}개")
            if fallback:
                geom = dissolve_features(fallback)
                if geom:
                    geoms_to_union.append(geom)

    if not geoms_to_union:
        print(f"    ✗ 유효한 폴리곤 없음 - 스킵")
        return False

    # 모든 읍면 그룹 union
    if len(geoms_to_union) > 1:
        buf = 0.0001
        combined_new = unary_union([g.buffer(buf) for g in geoms_to_union]).buffer(-buf)
        combined_new = make_valid(combined_new)
    else:
        combined_new = geoms_to_union[0]

    # Step 4: GeoJSON 업데이트
    print("[4] GeoJSON 폴리곤 업데이트")
    ok = update_geojson_polygon(
        region, sigungu, district_suffix,
        combined_new, ri_total, len(other_dongs)
    )

    return ok


def main():
    print("=== 기초의원 선거구 폴리곤 갭 일괄 수정 ===\n")
    print(f"프로젝트: {PROJECT_ROOT}")

    api_key = load_vworld_key()
    print(f"VWorld API key: {api_key[:8]}...")

    # per-city 디렉토리 존재 확인
    results = {}
    processed_regions = set()  # TopoJSON은 같은 sigungu 마지막에 1회만

    topo_queue = {}  # {(region, sigungu): True}

    for target in TARGETS:
        region = target["region"]
        sigungu = target["sigungu"]
        try:
            ok = process_target(target, api_key)
            key = f"{sigungu} {target['district_suffix']}"
            results[key] = "OK" if ok else "SKIP"
            if ok:
                topo_queue[(region, sigungu)] = True
        except Exception as e:
            key = f"{sigungu} {target['district_suffix']}"
            results[key] = f"ERROR: {e}"
            print(f"    ✗ 예외 발생: {e}")

    # TopoJSON 재생성 (sigungu별 1회)
    print(f"\n{'='*60}")
    print("TopoJSON 재생성")
    print(f"{'='*60}")
    for (region, sigungu) in sorted(topo_queue.keys()):
        print(f"  {sigungu} ({region})")
        rebuild_topojson(region, sigungu)

    # 결과 요약
    print(f"\n{'='*60}")
    print("처리 결과 요약")
    print(f"{'='*60}")
    for name, status in results.items():
        icon = "✓" if status == "OK" else ("~" if status == "SKIP" else "✗")
        print(f"  {icon} {name}: {status}")

    ok_count = sum(1 for s in results.values() if s == "OK")
    print(f"\n완료: {ok_count}/{len(results)} 선거구 업데이트")


if __name__ == "__main__":
    os.chdir(PROJECT_ROOT)
    main()
