#!/usr/bin/env python3
"""
광양시 기초의원 다선거구 폴리곤 교정 — SGIS API 활용

다선거구 구성: 중마동(중동) — 법정동 단위 분리 필요
라선거구 구성: 골약동 + 중마동(마동) + 태인동 + 금호동

SGIS API로 중동/마동 법정동 경계 조회 후:
1. 다선거구 = 중동 경계
2. 라선거구 = 기존(골약동+태인동+금호동) + 마동 경계
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
GEOJSON_PATH = PROJECT_ROOT / "data" / "basic_council" / "basic_districts_jeonnam.geojson"
TOPO_PATH = PROJECT_ROOT / "data" / "basic_council" / "basic_districts_jeonnam_topo.json"


def load_env():
    env = {}
    with open(PROJECT_ROOT / ".env") as f:
        for line in f:
            line = line.strip()
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    return env


def get_sgis_token(sgis_id, sgis_secret):
    url = (
        "https://sgisapi.kostat.go.kr/OpenAPI3/auth/authentication.json"
        f"?consumer_key={sgis_id}&consumer_secret={sgis_secret}"
    )
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=15, context=_SSL_CTX) as resp:
        data = json.loads(resp.read())
    if data.get("errCd") != 0:
        raise RuntimeError(f"SGIS 인증 실패: {data}")
    token = data["result"]["accessToken"]
    print(f"  ✓ SGIS 토큰 발급: {token[:20]}...")
    return token


def get_sgis_stages(token, cd, level):
    """SGIS 단계별 코드 조회"""
    params = {
        "accessToken": token,
        "cd": cd,
        "pg_yn": "0",
    }
    url = "https://sgisapi.kostat.go.kr/OpenAPI3/addr/stage.json?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=15, context=_SSL_CTX) as resp:
        data = json.loads(resp.read())
    if data.get("errCd") != 0:
        raise RuntimeError(f"SGIS stage 조회 실패: {data}")
    return data.get("result", [])


def get_sgis_boundary(token, cd, year="2023"):
    """SGIS 법정동 경계 GeoJSON 조회"""
    params = {
        "accessToken": token,
        "year": year,
        "cd": cd,
        "low_search": "1",
    }
    url = "https://sgisapi.kostat.go.kr/OpenAPI3/boundary/hadmarea.geojson?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30, context=_SSL_CTX) as resp:
        data = json.loads(resp.read())
    if data.get("errCd") != 0:
        raise RuntimeError(f"SGIS boundary 조회 실패: {data}")
    return data


def find_gwangyang_codes(token):
    """광양시 → 중마동 법정동 코드 조회"""
    print("  전남 코드 조회...")
    # 전라남도: 46000000000
    sido_list = get_sgis_stages(token, "", 1)
    jeonnam = next((s for s in sido_list if "전라남도" in s.get("addr_name", "")), None)
    if not jeonnam:
        raise RuntimeError("전라남도를 찾지 못했습니다")
    jeonnam_cd = jeonnam["cd"]
    print(f"  전라남도 코드: {jeonnam_cd}")

    print("  광양시 코드 조회...")
    sgg_list = get_sgis_stages(token, jeonnam_cd, 2)
    gwangyang = next((s for s in sgg_list if "광양" in s.get("addr_name", "")), None)
    if not gwangyang:
        raise RuntimeError("광양시를 찾지 못했습니다")
    gwangyang_cd = gwangyang["cd"]
    print(f"  광양시 코드: {gwangyang_cd}")

    print("  중마동 법정동 코드 조회...")
    dong_list = get_sgis_stages(token, gwangyang_cd, 3)
    print(f"  광양시 읍면동 목록:")
    for d in dong_list:
        print(f"    {d.get('addr_name')} → {d.get('cd')}")

    jungma_dongs = [d for d in dong_list if "중마동" in d.get("addr_name", "") or
                    "중동" in d.get("addr_name", "") or
                    "마동" in d.get("addr_name", "")]
    return dong_list, gwangyang_cd


def geom_to_geojson(geom):
    return json.loads(gpd.GeoSeries([geom]).to_json())["features"][0]["geometry"]


def update_geojson(da_geom, ma_geom):
    """다선거구 = 중동, 라선거구 기존 + 마동 union"""
    with open(GEOJSON_PATH, encoding="utf-8") as f:
        geojson = json.load(f)

    features = geojson["features"]
    da_idx = la_idx = None
    for i, feat in enumerate(features):
        name = feat["properties"].get("district_name", "")
        if name == "광양시 다선거구":
            da_idx = i
        elif name == "광양시 라선거구":
            la_idx = i

    buf = 0.0001

    # 다선거구: 중동 경계로 교체
    if da_idx is not None and da_geom is not None:
        features[da_idx]["geometry"] = geom_to_geojson(make_valid(da_geom))
        features[da_idx]["properties"]["matched_count"] = 1
        print("  ✓ 다선거구 → 중동 경계 교체")

    # 라선거구: 기존 폴리곤 + 마동 union
    if la_idx is not None and ma_geom is not None:
        existing_geom_json = features[la_idx]["geometry"]
        gdf_ex = gpd.GeoDataFrame.from_features(
            [{"type": "Feature", "geometry": existing_geom_json, "properties": {}}],
            crs="EPSG:4326"
        )
        combined = unary_union([gdf_ex.geometry[0].buffer(buf), ma_geom.buffer(buf)]).buffer(-buf)
        features[la_idx]["geometry"] = geom_to_geojson(make_valid(combined))
        features[la_idx]["properties"]["matched_count"] = 4
        print("  ✓ 라선거구 → 기존 + 마동 union")

    geojson["features"] = features
    with open(GEOJSON_PATH, "w", encoding="utf-8") as f:
        json.dump(geojson, f, ensure_ascii=False, indent=2)
    print(f"  ✓ {GEOJSON_PATH.name} 저장")


def rebuild_topojson():
    cmd = ["geo2topo", f"districts={GEOJSON_PATH}", "-o", str(TOPO_PATH), "--quantization", "1e5"]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"  ✗ TopoJSON 실패: {result.stderr}")
    else:
        print(f"  ✓ {TOPO_PATH.name} 재생성")


def sgis_features_to_geom(sgis_data):
    """SGIS GeoJSON 응답에서 shapely geometry 추출"""
    features = sgis_data.get("result", {}).get("features", [])
    if not features:
        return None
    gdf = gpd.GeoDataFrame.from_features(features, crs="EPSG:5179")
    gdf = gdf.to_crs("EPSG:4326")
    buf = 0.0001
    geom = unary_union(gdf.geometry.buffer(buf)).buffer(-buf)
    return make_valid(geom)


def main():
    print("=== 광양시 기초의원 다/라선거구 법정동 교정 (SGIS API) ===\n")

    env = load_env()
    sgis_id = env.get("SGIS_ID")
    sgis_secret = env.get("SGIS_SECRET")
    if not sgis_id or not sgis_secret:
        print("✗ .env에 SGIS_ID, SGIS_SECRET 없음")
        sys.exit(1)

    print("[1] SGIS 인증 토큰 발급")
    token = get_sgis_token(sgis_id, sgis_secret)

    print("\n[2] 광양시 법정동 코드 조회")
    dong_list, gwangyang_cd = find_gwangyang_codes(token)

    # 중동, 마동 코드 찾기
    jungdong = next((d for d in dong_list if d.get("addr_name") in ["중동", "중마동"]), None)

    # 코드 목록에서 중동/마동 직접 찾기 (하위 레벨 조회 필요할 수 있음)
    print(f"\n[3] 중마동 하위 법정동 조회")
    # 중마동 행정동 코드를 찾아 하위 법정동 조회
    jungma = next((d for d in dong_list if "중마" in d.get("addr_name", "")), None)
    if jungma:
        print(f"  중마동 코드: {jungma['cd']}")
        sub_list = get_sgis_stages(token, jungma["cd"], 4)
        print(f"  중마동 하위 법정동:")
        for s in sub_list:
            print(f"    {s.get('addr_name')} → {s.get('cd')}")
    else:
        print("  중마동을 동 목록에서 직접 찾지 못함 — 광양시 전체 하위 동 조회")
        # 광양시 코드로 법정동 직접 조회
        sub_list = get_sgis_stages(token, gwangyang_cd, 4)
        print(f"  광양시 법정동 목록 ({len(sub_list)}개):")
        for s in sub_list:
            print(f"    {s.get('addr_name')} → {s.get('cd')}")

    # 중동, 마동 코드 식별
    jungdong_cd = next((s["cd"] for s in sub_list if s.get("addr_name") == "중동"), None)
    madong_cd = next((s["cd"] for s in sub_list if s.get("addr_name") == "마동"), None)

    print(f"\n  중동 코드: {jungdong_cd}")
    print(f"  마동 코드: {madong_cd}")

    if not jungdong_cd:
        print("✗ 중동 코드를 찾지 못했습니다")
        sys.exit(1)

    print("\n[4] 중동 경계 조회")
    jungdong_data = get_sgis_boundary(token, jungdong_cd)
    jungdong_geom = sgis_features_to_geom(jungdong_data)
    if jungdong_geom:
        print(f"  ✓ 중동 경계 취득")
    else:
        print("  ✗ 중동 경계 취득 실패")
        sys.exit(1)

    madong_geom = None
    if madong_cd:
        print("\n[5] 마동 경계 조회")
        madong_data = get_sgis_boundary(token, madong_cd)
        madong_geom = sgis_features_to_geom(madong_data)
        if madong_geom:
            print(f"  ✓ 마동 경계 취득")
        else:
            print("  ⚠ 마동 경계 취득 실패 — 라선거구 업데이트 스킵")

    print("\n[6] GeoJSON 업데이트")
    update_geojson(jungdong_geom, madong_geom)

    print("\n[7] TopoJSON 재생성")
    rebuild_topojson()

    print("\n=== 완료 ===")


if __name__ == "__main__":
    main()
