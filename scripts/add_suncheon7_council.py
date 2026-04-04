#!/usr/bin/env python3
"""
순천시 제7선거구(광역의원) 폴리곤 추가
해룡면 신대리 단일 리 → council_districts_jeonnam.geojson에 추가
"""

import json
import ssl
import subprocess
import urllib.parse
import urllib.request
from pathlib import Path

import geopandas as gpd
from shapely.ops import unary_union
from shapely.validation import make_valid

PROJECT_ROOT = Path(__file__).resolve().parent.parent
GEOJSON_PATH = PROJECT_ROOT / "data" / "council" / "council_districts_jeonnam.geojson"
TOPO_PATH    = PROJECT_ROOT / "data" / "council" / "council_districts_jeonnam_topo.json"

_SSL_CTX = ssl.create_default_context()
_SSL_CTX.check_hostname = False
_SSL_CTX.verify_mode = ssl.CERT_NONE

DISTRICT_NAME = "순천시 제7선거구"
SIGUNGU       = "순천시"
BBOX          = "34.83,127.51,34.97,127.60,EPSG:4326"
PARENT_FILTER = "순천시 해룡면"
TARGET_RI     = "신대리"


def load_vworld_key():
    env_path = PROJECT_ROOT / ".env"
    with open(env_path) as f:
        for line in f:
            if line.strip().startswith("VWORLD_API_KEY="):
                val = line.split("=", 1)[1].strip()
                if val:
                    return val
    raise RuntimeError(".env에 VWORLD_API_KEY 없음")


def fetch_haeryong(api_key):
    params = {
        "service": "WFS", "version": "1.1.0", "request": "GetFeature",
        "typename": "lt_c_adri", "output": "application/json",
        "key": api_key, "domain": "korea-local-eletion.pages.dev",
        "srsName": "EPSG:4326", "maxFeatures": "300",
        "bbox": BBOX,
    }
    url = "https://api.vworld.kr/req/wfs?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30, context=_SSL_CTX) as resp:
        data = json.loads(resp.read().decode("utf-8"))

    if data.get("type") == "error":
        raise RuntimeError(f"VWorld 오류: {data}")

    all_feats = data.get("features", [])
    haeryong = [f for f in all_feats if PARENT_FILTER in f["properties"].get("full_nm", "")]
    print(f"  해룡면 피처: {len(haeryong)}개")

    sindae = [f for f in haeryong if f["properties"].get("li_kor_nm", "").strip() == TARGET_RI]
    print(f"  신대리 피처: {len(sindae)}개")

    if not sindae:
        raise RuntimeError(f"신대리 피처 없음 — BBOX 확인 필요")

    return sindae


def build_geom(features):
    gdf = gpd.GeoDataFrame.from_features(features, crs="EPSG:4326")
    buf = 0.0001
    geom = unary_union(gdf.geometry.buffer(buf)).buffer(-buf)
    return make_valid(geom)


def geom_to_geojson_dict(geom):
    return json.loads(gpd.GeoSeries([geom]).to_json())["features"][0]["geometry"]


def check_existing():
    with open(GEOJSON_PATH, encoding="utf-8") as f:
        data = json.load(f)
    existing = [f for f in data["features"] if f["properties"].get("district_name") == DISTRICT_NAME]
    if existing:
        print(f"  ⚠ {DISTRICT_NAME} 이미 존재함 — 덮어쓸까요? 스크립트 종료.")
        return True
    return False


def insert_feature(geom):
    """순천시 제7선거구를 제6선거구 바로 다음에 삽입"""
    with open(GEOJSON_PATH, encoding="utf-8") as f:
        data = json.load(f)

    features = data["features"]
    new_feat = {
        "type": "Feature",
        "properties": {
            "district_name": DISTRICT_NAME,
            "sigungu": SIGUNGU,
            "dong_count": 1,
            "matched_count": 1,
        },
        "geometry": geom_to_geojson_dict(geom),
    }

    # 순천시 제6선거구 다음 위치에 삽입
    idx6 = next(
        (i for i, f in enumerate(features)
         if f["properties"].get("district_name") == "순천시 제6선거구"),
        None,
    )
    if idx6 is not None:
        features.insert(idx6 + 1, new_feat)
        print(f"  → 순천시 제6선거구(idx={idx6}) 다음에 삽입")
    else:
        features.append(new_feat)
        print(f"  → 맨 뒤에 추가 (제6선거구 못 찾음)")

    data["features"] = features
    with open(GEOJSON_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"  ✓ {GEOJSON_PATH.name} 저장 ({len(features)}개 선거구)")


def rebuild_topo():
    cmd = (
        f"geo2topo districts={GEOJSON_PATH} "
        f"--quantization 1e5 "
        f"-o {TOPO_PATH}"
    )
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"  ✗ TopoJSON 실패: {result.stderr}")
    else:
        print(f"  ✓ {TOPO_PATH.name} 재생성")


def main():
    print("=== 순천시 제7선거구(광역의원) 폴리곤 추가 ===\n")

    if check_existing():
        return

    api_key = load_vworld_key()
    print(f"  VWorld 키 로드 완료\n")

    # 1. VWorld에서 신대리 폴리곤 수신
    sindae_feats = fetch_haeryong(api_key)

    # 2. Dissolve
    geom = build_geom(sindae_feats)
    area_deg2 = geom.area
    print(f"  → 면적: {area_deg2:.6f} deg² (≈ {area_deg2 * 111000**2 / 1e6:.2f} km²)")

    # 3. 면적 합리성 검증 (신대리 = 약 5~15 km²)
    area_km2 = area_deg2 * 111000**2 / 1e6
    if not (1 < area_km2 < 50):
        raise RuntimeError(f"면적이 비정상: {area_km2:.2f} km² — 폴리곤 확인 필요")
    print(f"  ✓ 면적 합리성 검증 통과 ({area_km2:.2f} km²)")

    # 4. GeoJSON 삽입
    insert_feature(geom)

    # 5. TopoJSON 재생성
    print()
    rebuild_topo()

    print("\n=== 완료 ===")
    print(f"  {DISTRICT_NAME} 폴리곤이 {GEOJSON_PATH.name}에 추가되었습니다.")


if __name__ == "__main__":
    main()
