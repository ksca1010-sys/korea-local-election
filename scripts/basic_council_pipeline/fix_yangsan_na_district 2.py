#!/usr/bin/env python3
"""
양산시 기초의원 나선거구 폴리곤 교정

나선거구 구성: 물금읍(물금리+증산리+가촌리) + 원동면
현재 문제: 매핑 파일 파싱 오류로 물금리/증산리/가촌리 누락, 원동면만 포함됨

수정:
1. VWorld WFS에서 물금리, 증산리, 가촌리 경계 조회
2. 기존 나선거구(원동면) 폴리곤과 union
3. GeoJSON + TopoJSON 업데이트
4. 매핑 파일 수정
"""

import json
import os
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
GEOJSON_PATH = PROJECT_ROOT / "data" / "basic_council" / "basic_districts_gyeongnam.geojson"
TOPO_PATH = PROJECT_ROOT / "data" / "basic_council" / "basic_districts_gyeongnam_topo.json"
MAPPING_PATH = PROJECT_ROOT / "data" / "basic_council" / "basic_district_mapping_gyeongnam.json"

# 나선거구 물금읍 구성 리
NA_MULGEUM_RIS = {"물금리", "증산리", "가촌리"}

def load_vworld_key():
    env_path = PROJECT_ROOT / ".env"
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line.startswith("VWORLD_API_KEY="):
                return line.split("=", 1)[1].strip()
    raise RuntimeError(".env에 VWORLD_API_KEY 없음")


def fetch_mulgeum_ris(api_key):
    """VWorld WFS lt_c_adri에서 물금읍 법정리 경계 조회"""
    # 물금읍 전체 포함 BBOX (lat_min, lon_min, lat_max, lon_max)
    bbox = "35.26,128.86,35.38,129.06,EPSG:4326"
    params = {
        "service": "WFS",
        "version": "1.1.0",
        "request": "GetFeature",
        "typename": "lt_c_adri",
        "output": "application/json",
        "key": api_key,
        "domain": "korea-local-election.pages.dev",
        "srsName": "EPSG:4326",
        "maxFeatures": "200",
        "bbox": bbox,
    }
    url = "https://api.vworld.kr/req/wfs?" + urllib.parse.urlencode(params)
    print(f"  VWorld WFS 요청 중 (물금읍 BBOX)...")

    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30, context=_SSL_CTX) as resp:
        data = json.loads(resp.read().decode("utf-8"))

    all_features = data.get("features", [])
    print(f"  → 총 {len(all_features)}개 피처 수신")

    # 양산시 물금읍만 필터
    features = [
        f for f in all_features
        if "양산시 물금읍" in f.get("properties", {}).get("full_nm", "")
    ]
    li_names = sorted(set(f["properties"]["li_kor_nm"] for f in features))
    print(f"  → 양산시 물금읍 법정리 {len(li_names)}개: {li_names}")
    return features


def dissolve_features(features, ri_set):
    """주어진 리 이름 집합에 해당하는 피처들을 dissolve"""
    matched = [
        f for f in features
        if f.get("properties", {}).get("li_kor_nm", "") in ri_set
    ]
    if not matched:
        return None
    gdf = gpd.GeoDataFrame.from_features(matched, crs="EPSG:4326")
    buf = 0.0001
    geom = unary_union(gdf.geometry.buffer(buf)).buffer(-buf)
    return make_valid(geom)


def geom_to_geojson(geom):
    return json.loads(gpd.GeoSeries([geom]).to_json())["features"][0]["geometry"]


def update_geojson(mulgeum_geom):
    """나선거구 폴리곤에 물금리+증산리+가촌리 union"""
    with open(GEOJSON_PATH, encoding="utf-8") as f:
        geojson = json.load(f)

    features = geojson["features"]
    na_idx = None
    for i, feat in enumerate(features):
        if feat["properties"]["district_name"] == "양산시 나선거구":
            na_idx = i
            break

    if na_idx is None:
        raise RuntimeError("양산시 나선거구 피처를 찾지 못했습니다")

    # 기존 나선거구 geometry (원동면)
    existing_geom_json = features[na_idx]["geometry"]
    gdf_existing = gpd.GeoDataFrame.from_features(
        [{"type": "Feature", "geometry": existing_geom_json, "properties": {}}],
        crs="EPSG:4326"
    )
    existing_geom = gdf_existing.geometry[0]

    # union: 원동면 + 물금읍(물금리+증산리+가촌리)
    buf = 0.0001
    combined = unary_union([existing_geom.buffer(buf), mulgeum_geom.buffer(buf)]).buffer(-buf)
    combined = make_valid(combined)

    features[na_idx]["geometry"] = geom_to_geojson(combined)
    features[na_idx]["properties"]["matched_count"] = 4
    features[na_idx]["properties"]["dong_count"] = 4

    geojson["features"] = features
    with open(GEOJSON_PATH, "w", encoding="utf-8") as f:
        json.dump(geojson, f, ensure_ascii=False, indent=2)
    print(f"  ✓ {GEOJSON_PATH.name} 업데이트")

    # 새 bbox 확인
    coords_all = []
    geom_new = features[na_idx]["geometry"]
    if geom_new["type"] == "Polygon":
        coords_all = geom_new["coordinates"][0]
    else:
        for ring in geom_new["coordinates"]:
            coords_all.extend(ring[0])
    lons = [c[0] for c in coords_all]
    lats = [c[1] for c in coords_all]
    print(f"  → 새 bbox: lon=[{min(lons):.4f},{max(lons):.4f}], lat=[{min(lats):.4f},{max(lats):.4f}]")


def update_mapping():
    """매핑 파일의 나선거구 dongs 수정 (파싱 오류 수정)"""
    with open(MAPPING_PATH, encoding="utf-8") as f:
        mapping = json.load(f)

    for dist in mapping["districts"]:
        if dist.get("sigungu") == "양산시" and "나선거구" in dist.get("name", ""):
            old_dongs = dist["dongs"]
            dist["dongs"] = ["물금읍(물금리,증산리,가촌리)", "원동면"]
            print(f"  ✓ 매핑 수정: {old_dongs} → {dist['dongs']}")
            break

    with open(MAPPING_PATH, "w", encoding="utf-8") as f:
        json.dump(mapping, f, ensure_ascii=False, indent=2)
    print(f"  ✓ {MAPPING_PATH.name} 저장")


def rebuild_topojson():
    cmd = [
        "geo2topo",
        f"districts={GEOJSON_PATH}",
        "-o", str(TOPO_PATH),
        "--quantization", "1e5",
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"  ✗ TopoJSON 생성 실패: {result.stderr}")
    else:
        print(f"  ✓ {TOPO_PATH.name} 재생성")


def main():
    print("=== 양산시 기초의원 나선거구 폴리곤 교정 ===\n")

    api_key = load_vworld_key()

    print("[1] VWorld WFS에서 물금읍 법정리 조회")
    features = fetch_mulgeum_ris(api_key)

    print("\n[2] 물금리+증산리+가촌리 dissolve")
    mulgeum_geom = dissolve_features(features, NA_MULGEUM_RIS)
    if mulgeum_geom is None:
        print("  ✗ 물금리/증산리/가촌리를 찾지 못했습니다")
        sys.exit(1)
    print(f"  ✓ dissolve 완료")

    print("\n[3] GeoJSON 업데이트 (원동면 + 물금읍 3개 리 union)")
    update_geojson(mulgeum_geom)

    print("\n[4] 매핑 파일 수정")
    update_mapping()

    print("\n[5] TopoJSON 재생성")
    rebuild_topojson()

    print("\n=== 완료 ===")


if __name__ == "__main__":
    main()
