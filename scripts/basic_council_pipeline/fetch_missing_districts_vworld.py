#!/usr/bin/env python3
"""
포항시 바선거구 / 양산시 가선거구 / 광양시 다선거구 VWorld WFS 기반 GeoJSON 생성

- 포항시 바선거구 (2석): 장량동 내 장성동 법정동
- 양산시 가선거구 (2석): 물금읍 내 범어리 법정리
- 광양시 다선거구 (3석): 중마동 내 중동 법정동

VWorld WFS lt_c_adri 레이어에서 BBOX 조회 후 Python에서 필터링하여
각 basic_*.geojson 및 topo.json을 업데이트한다.

사용법:
    python fetch_missing_districts_vworld.py
"""

import json
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
BASIC_DIR = PROJECT_ROOT / "data" / "basic_council"


def load_vworld_key():
    env_path = PROJECT_ROOT / ".env"
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line.startswith("VWORLD_API_KEY="):
                return line.split("=", 1)[1].strip()
    raise RuntimeError(".env에 VWORLD_API_KEY 없음")


def fetch_features_by_bbox(api_key, bbox, label=""):
    """VWorld WFS lt_c_adri 레이어 BBOX 조회"""
    params = {
        "service": "WFS",
        "version": "1.1.0",
        "request": "GetFeature",
        "typename": "lt_c_adri",
        "output": "application/json",
        "key": api_key,
        "domain": "korea-local-eletion.pages.dev",
        "srsName": "EPSG:4326",
        "maxFeatures": "300",
        "bbox": bbox,
    }
    url = "https://api.vworld.kr/req/wfs?" + urllib.parse.urlencode(params)
    print(f"  VWorld WFS 요청 중 ({label}, lt_c_adri)...")

    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30, context=_SSL_CTX) as resp:
        raw = resp.read().decode("utf-8")

    data = json.loads(raw)
    if "error" in data or data.get("type") == "error":
        raise RuntimeError(f"VWorld 오류: {data}")

    features = data.get("features", [])
    print(f"  → 수신 {len(features)}개 피처")
    return features


def dissolve_by_dong_name(features, dong_nm, city_filter=""):
    """dong_kor_nm 또는 full_nm에서 특정 동/리 이름으로 필터링 후 dissolve"""
    matched = []
    for f in features:
        props = f.get("properties", {})
        full_nm = props.get("full_nm", "")
        li_nm = props.get("li_kor_nm", "")
        dong_kor = props.get("dong_kor_nm", "")

        # city_filter가 있으면 시 이름도 확인
        if city_filter and city_filter not in full_nm:
            continue

        # 리 이름 또는 동 이름 매칭
        if dong_nm in li_nm or dong_nm in dong_kor or dong_nm in full_nm.split()[-1:]:
            matched.append(f)

    if not matched:
        print(f"  ✗ '{dong_nm}' 매칭 없음")
        # 디버그: 수신된 전체 목록
        names = sorted(set(
            f.get("properties", {}).get("full_nm", "").split()[-1]
            for f in features
        ))
        print(f"  수신된 동/리: {names}")
        return None

    print(f"  → '{dong_nm}' 매칭 {len(matched)}개 피처")
    gdf = gpd.GeoDataFrame.from_features(matched, crs="EPSG:4326")
    buf = 0.0001
    geom = unary_union(gdf.geometry.buffer(buf)).buffer(-buf)
    geom = make_valid(geom)
    return geom


def geom_to_geojson(geom):
    return json.loads(gpd.GeoSeries([geom]).to_json())["features"][0]["geometry"]


def add_district_to_geojson(geojson_path, district_name, sigungu, seats, geom, insert_before=None):
    """geojson에 새 선거구 feature 추가"""
    with open(geojson_path, encoding="utf-8") as f:
        data = json.load(f)

    features = data["features"]

    # 이미 있으면 스킵
    for feat in features:
        if feat["properties"]["district_name"] == district_name:
            print(f"  ⚠ {district_name} 이미 존재 - 스킵")
            return False

    new_feature = {
        "type": "Feature",
        "properties": {
            "district_name": district_name,
            "sigungu": sigungu,
            "seats": seats,
            "dong_count": 1,
            "matched_count": 1,
        },
        "geometry": geom_to_geojson(geom),
    }

    if insert_before:
        idx = next((i for i, f in enumerate(features)
                    if f["properties"]["district_name"] == insert_before), len(features))
        features.insert(idx, new_feature)
    else:
        features.append(new_feature)

    data["features"] = features
    with open(geojson_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"  ✓ {district_name} 추가 → {geojson_path.name}")
    return True


def rebuild_topojson(geojson_path, topo_path):
    """geo2topo + topoquantize로 TopoJSON 재생성"""
    cmd_topo = (
        f"geo2topo districts={geojson_path} | "
        f"topoquantize 1e6 | "
        f"toposimplify -p 0.00001 > {topo_path}"
    )
    result = subprocess.run(cmd_topo, shell=True, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"  ✗ TopoJSON 생성 실패: {result.stderr}")
    else:
        print(f"  ✓ {topo_path.name} 재생성")


def main():
    print("=== 포항바/양산가/광양다 선거구 VWorld WFS 기반 생성 ===\n")
    api_key = load_vworld_key()
    print(f"  API 키 로드 완료\n")

    # ──────────────────────────────────────────
    # 1. 포항시 바선거구 — 장성동 (법정동)
    # ──────────────────────────────────────────
    print("[1] 포항시 바선거구 — 장량동 내 장성동")
    # 포항시 북구 장량동 일대 BBOX (lat_min, lon_min, lat_max, lon_max)
    bbox_pohang = "36.00,129.33,36.07,129.43,EPSG:4326"
    features_pohang = fetch_features_by_bbox(api_key, bbox_pohang, "포항 장량동")

    # 포항시 장성동 필터링
    pohang_feat = [f for f in features_pohang
                   if "포항" in f.get("properties", {}).get("full_nm", "")]
    names_pohang = sorted(set(
        f["properties"].get("full_nm", "").split()[-1] for f in pohang_feat
    ))
    print(f"  포항시 동/리 목록: {names_pohang}")

    geom_pohang_ba = dissolve_by_dong_name(pohang_feat, "장성동", city_filter="포항")
    if geom_pohang_ba:
        geojson_path = BASIC_DIR / "gyeongbuk" / "basic_포항시.geojson"
        topo_path = BASIC_DIR / "gyeongbuk" / "basic_포항시_topo.json"
        add_district_to_geojson(
            geojson_path, "포항시 바선거구", "포항시", 2, geom_pohang_ba,
            insert_before="포항시 사선거구"
        )
        rebuild_topojson(geojson_path, topo_path)

    # ──────────────────────────────────────────
    # 2. 양산시 가선거구 — 범어리 (법정리)
    # ──────────────────────────────────────────
    print("\n[2] 양산시 가선거구 — 물금읍 내 범어리")
    bbox_yangsan = "35.27,128.93,35.35,129.01,EPSG:4326"
    features_yangsan = fetch_features_by_bbox(api_key, bbox_yangsan, "양산 물금읍")

    yangsan_feat = [f for f in features_yangsan
                    if "양산" in f.get("properties", {}).get("full_nm", "")]
    names_yangsan = sorted(set(
        f["properties"].get("full_nm", "").split()[-1] for f in yangsan_feat
    ))
    print(f"  양산시 리/동 목록: {names_yangsan}")

    geom_yangsan_ga = dissolve_by_dong_name(yangsan_feat, "범어리", city_filter="양산")
    if geom_yangsan_ga:
        geojson_path = BASIC_DIR / "gyeongnam" / "basic_양산시.geojson"
        topo_path = BASIC_DIR / "gyeongnam" / "basic_양산시_topo.json"
        add_district_to_geojson(
            geojson_path, "양산시 가선거구", "양산시", 2, geom_yangsan_ga,
            insert_before="양산시 나선거구"
        )
        rebuild_topojson(geojson_path, topo_path)

    # ──────────────────────────────────────────
    # 3. 광양시 다선거구 — 중동 (법정동)
    # ──────────────────────────────────────────
    print("\n[3] 광양시 다선거구 — 중마동 내 중동")
    bbox_gwangyang = "34.92,127.63,34.98,127.72,EPSG:4326"
    features_gwangyang = fetch_features_by_bbox(api_key, bbox_gwangyang, "광양 중마동")

    gwangyang_feat = [f for f in features_gwangyang
                      if "광양" in f.get("properties", {}).get("full_nm", "")]
    names_gwangyang = sorted(set(
        f["properties"].get("full_nm", "").split()[-1] for f in gwangyang_feat
    ))
    print(f"  광양시 동/리 목록: {names_gwangyang}")

    geom_gwangyang_da = dissolve_by_dong_name(gwangyang_feat, "중동", city_filter="광양")
    if geom_gwangyang_da:
        geojson_path = BASIC_DIR / "jeonnam" / "basic_광양시.geojson"
        topo_path = BASIC_DIR / "jeonnam" / "basic_광양시_topo.json"
        add_district_to_geojson(
            geojson_path, "광양시 다선거구", "광양시", 3, geom_gwangyang_da,
            insert_before="광양시 라선거구"
        )
        rebuild_topojson(geojson_path, topo_path)

    print("\n=== 완료 ===")


if __name__ == "__main__":
    main()
