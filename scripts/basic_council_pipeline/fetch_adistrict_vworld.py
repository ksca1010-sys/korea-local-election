#!/usr/bin/env python3
"""
순천시 아선거구/자선거구 VWorld WFS 기반 GeoJSON 생성

- 아선거구 (2석): 해룡면 신대리
- 자선거구 (2석): 해룡면 대안리 외 17개 리

VWorld WFS에서 해룡면 법정리 경계를 가져와 dissolve 후
basic_순천시.geojson 및 TopoJSON을 업데이트한다.

사용법:
    python fetch_adistrict_vworld.py
"""

import json
import os
import ssl
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.request
from pathlib import Path

# VWorld 등 한국 공공 API는 self-signed 체인 사용
_SSL_CTX = ssl.create_default_context()
_SSL_CTX.check_hostname = False
_SSL_CTX.verify_mode = ssl.CERT_NONE

import geopandas as gpd
from shapely.ops import unary_union
from shapely.validation import make_valid

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
BASIC_DIR = PROJECT_ROOT / "data" / "basic_council" / "jeonnam"
MAPPING_PATH = PROJECT_ROOT / "data" / "basic_council" / "basic_district_mapping_jeonnam.json"
GEOJSON_PATH = BASIC_DIR / "basic_순천시.geojson"
TOPO_PATH = BASIC_DIR / "basic_순천시_topo.json"

# .env에서 키 로드
def load_vworld_key():
    env_path = PROJECT_ROOT / ".env"
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line.startswith("VWORLD_API_KEY="):
                return line.split("=", 1)[1].strip()
    raise RuntimeError(".env에 VWORLD_API_KEY 없음")


# 자선거구 17개 리
JA_RIS = {
    "대안리", "남가리", "월전리", "성산리", "선월리", "신성리",
    "호두리", "용전리", "도롱리", "중흥리", "해창리", "선학리",
    "농주리", "상내리", "하사리", "복성리", "상삼리"
}
# 아선거구 리
A_RIS = {"신대리"}


def fetch_haeryong_ris(api_key):
    """VWorld WFS lt_c_adri 레이어에서 해룡면 법정리 경계 조회
    - WFS 1.1.0 + EPSG:4326은 BBOX 좌표가 lat,lon 순서
    - CQL filter가 서버에서 무시되므로 BBOX 후 Python에서 필터링
    """
    # 해룡면 전체 포함 BBOX (lat_min, lon_min, lat_max, lon_max)
    bbox = "34.83,127.38,35.05,127.65,EPSG:4326"
    params = {
        "service": "WFS",
        "version": "1.1.0",
        "request": "GetFeature",
        "typename": "lt_c_adri",
        "output": "application/json",
        "key": api_key,
        "domain": "korea-local-election.pages.dev",
        "srsName": "EPSG:4326",
        "maxFeatures": "300",
        "bbox": bbox,
    }
    url = "https://api.vworld.kr/req/wfs?" + urllib.parse.urlencode(params)
    print(f"  VWorld WFS 요청 중 (lt_c_adri, BBOX)...")

    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30, context=_SSL_CTX) as resp:
        raw = resp.read().decode("utf-8")

    data = json.loads(raw)

    if "error" in data or data.get("type") == "error":
        raise RuntimeError(f"VWorld 오류: {data}")

    all_features = data.get("features", [])
    if not all_features:
        raise RuntimeError("BBOX 범위 내 데이터 없음")

    # Python에서 순천시 해룡면만 필터링
    features = [
        f for f in all_features
        if "순천시 해룡면" in f.get("properties", {}).get("full_nm", "")
    ]
    if not features:
        raise RuntimeError("해룡면 법정리 데이터 없음")

    li_names = sorted(set(f["properties"]["li_kor_nm"] for f in features))
    print(f"  → 해룡면 법정리 {len(li_names)}개 고유 리:")
    for n in li_names:
        print(f"    {n}")

    return features


def fetch_haeryong_ris_alt(api_key):
    """대체 레이어 lt_c_bnd_lga 시도"""
    filter_xml = (
        '<Filter xmlns="http://www.opengis.net/ogc">'
        '<And>'
        '<PropertyIsEqualTo><PropertyName>sig_nm</PropertyName><Literal>순천시</Literal></PropertyIsEqualTo>'
        '<PropertyIsEqualTo><PropertyName>emd_nm</PropertyName><Literal>해룡면</Literal></PropertyIsEqualTo>'
        '</And>'
        "</Filter>"
    )
    params = {
        "service": "WFS",
        "version": "2.0.0",
        "request": "GetFeature",
        "typename": "lt_c_bnd_lga",
        "outputFormat": "application/json",
        "key": api_key,
        "filter": filter_xml,
        "srsName": "EPSG:4326",
        "count": "200",
    }
    url = "https://api.vworld.kr/req/wfs?" + urllib.parse.urlencode(params)
    print(f"  VWorld WFS 요청 중 (lt_c_bnd_lga)...")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30, context=_SSL_CTX) as resp:
        raw = resp.read().decode("utf-8")
    data = json.loads(raw)
    features = data.get("features", [])
    print(f"  → {len(features)}개 피처 수신")
    for f in features:
        props = f.get("properties", {})
        print(f"    {props}")
    return features


def ri_name_from_props(props):
    """properties에서 리 이름 추출 — lt_c_adri 레이어는 li_kor_nm 사용"""
    # lt_c_adri 레이어 우선
    v = props.get("li_kor_nm", "")
    if v:
        return v.strip()
    # fallback: full_nm 마지막 토큰
    full = props.get("full_nm", "")
    if full:
        return full.strip().split()[-1]
    return ""


def dissolve_features(features, ri_set):
    """주어진 리 이름 집합에 해당하는 피처들을 dissolve"""
    matched = []
    for f in features:
        ri_name = ri_name_from_props(f.get("properties", {}))
        if ri_name in ri_set:
            matched.append(f)

    if not matched:
        return None

    gdf = gpd.GeoDataFrame.from_features(matched, crs="EPSG:4326")
    buf = 0.0001
    geom = unary_union(gdf.geometry.buffer(buf)).buffer(-buf)
    geom = make_valid(geom)
    return geom


def geom_to_geojson(geom):
    """shapely geometry → GeoJSON dict"""
    return json.loads(gpd.GeoSeries([geom]).to_json())["features"][0]["geometry"]


def update_geojson(a_geom, ja_geom):
    """basic_순천시.geojson 업데이트: 아선거구 추가, 자선거구 경계 교체"""
    with open(GEOJSON_PATH, encoding="utf-8") as f:
        geojson = json.load(f)

    features = geojson["features"]

    # 자선거구 경계 교체 (인덱스 찾기)
    ja_idx = None
    for i, feat in enumerate(features):
        if feat["properties"]["district_name"] == "순천시 자선거구":
            ja_idx = i
            break

    if ja_geom is not None and ja_idx is not None:
        features[ja_idx]["geometry"] = geom_to_geojson(ja_geom)
        print("  ✓ 자선거구 경계 교체")
    else:
        print("  ⚠ 자선거구 업데이트 스킵")

    # 아선거구 추가 (자선거구 바로 앞에 삽입)
    if a_geom is not None:
        a_feature = {
            "type": "Feature",
            "properties": {
                "district_name": "순천시 아선거구",
                "sigungu": "순천시",
                "seats": 2,
                "dong_count": 1,
                "matched_count": 1,
            },
            "geometry": geom_to_geojson(a_geom),
        }
        insert_at = ja_idx if ja_idx is not None else len(features)
        features.insert(insert_at, a_feature)
        print("  ✓ 아선거구 추가")

    # 메타데이터 업데이트
    geojson["properties"]["total_districts"] = 9
    geojson["properties"]["generated_districts"] = len(features)
    geojson["features"] = features

    with open(GEOJSON_PATH, "w", encoding="utf-8") as f:
        json.dump(geojson, f, ensure_ascii=False, indent=2)
    print(f"  ✓ {GEOJSON_PATH.name} 저장")


def update_mapping():
    """매핑 JSON에 아선거구 추가"""
    with open(MAPPING_PATH, encoding="utf-8") as f:
        mapping = json.load(f)

    # 이미 있는지 확인
    for d in mapping["districts"]:
        if d["name"] == "순천시 아선거구":
            print("  ⚠ 매핑에 아선거구 이미 존재 - 스킵")
            return

    # 자선거구 앞에 삽입
    new_district = {
        "sigungu": "순천시",
        "name": "순천시 아선거구",
        "seats": 2,
        "dongs": ["해룡면(신대리)"],
    }
    ja_idx = next(
        (i for i, d in enumerate(mapping["districts"]) if d["name"] == "순천시 자선거구"),
        len(mapping["districts"])
    )
    mapping["districts"].insert(ja_idx, new_district)
    mapping["total_districts"] = len(mapping["districts"])

    with open(MAPPING_PATH, "w", encoding="utf-8") as f:
        json.dump(mapping, f, ensure_ascii=False, indent=2)
    print(f"  ✓ {MAPPING_PATH.name} 업데이트 (아선거구 추가)")


def rebuild_topojson():
    """geo2topo로 TopoJSON 재생성"""
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
    print("=== 순천시 아선거구 VWorld WFS 기반 생성 ===\n")

    api_key = load_vworld_key()
    print(f"  API 키 로드 완료\n")

    print("[1] VWorld WFS에서 해룡면 법정리 경계 조회")
    features = fetch_haeryong_ris(api_key)

    if not features:
        print("  ✗ 법정리 데이터를 가져오지 못했습니다.")
        sys.exit(1)

    print("\n[2] 리별 dissolve")
    a_geom = dissolve_features(features, A_RIS)
    ja_geom = dissolve_features(features, JA_RIS)

    if a_geom is None:
        print("  ✗ 신대리를 찾지 못했습니다. properties 키를 확인하세요.")
        # 디버그: 수신된 properties 모두 출력
        for f in features[:5]:
            print(f"    props: {f.get('properties', {})}")
        sys.exit(1)

    print(f"  ✓ 아선거구(신대리) dissolve 완료")
    if ja_geom:
        print(f"  ✓ 자선거구(17개 리) dissolve 완료")
    else:
        print(f"  ⚠ 자선거구 리 매칭 실패 - 아선거구만 추가")

    print("\n[3] GeoJSON 업데이트")
    update_geojson(a_geom, ja_geom)

    print("\n[4] 매핑 파일 업데이트")
    update_mapping()

    print("\n[5] TopoJSON 재생성")
    rebuild_topojson()

    print("\n=== 완료 ===")


if __name__ == "__main__":
    main()
