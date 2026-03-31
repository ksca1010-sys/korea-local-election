#!/usr/bin/env python3
"""
잔여 3개 선거구 VWorld WFS 기반 geometry 보완

- 예산군 나선거구: 예산읍 내 향천리 (법정리)
- 거창군 나선거구: 거창읍 내 상림리 (법정리, 상동 구역)
- 포항시 마선거구: 장량동 내 양덕동 (법정동)

기존 feature에 누락된 geometry를 union으로 추가한다.

사용법:
    python fix_vworld_remaining.py
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

PROJECT_ROOT = Path(__file__).resolve().parent.parent
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


def filter_by_name(features, keywords, city_filter=""):
    """동/리 이름으로 필터링"""
    matched = []
    all_names = set()
    for f in features:
        props = f.get("properties", {})
        full_nm = props.get("full_nm", "")
        li_nm = props.get("li_kor_nm", "") or ""
        dong_kor = props.get("dong_kor_nm", "") or ""
        all_names.add(full_nm.split()[-1] if full_nm else "")

        if city_filter and city_filter not in full_nm:
            continue

        for kw in keywords:
            if kw in li_nm or kw in dong_kor or kw in full_nm:
                matched.append(f)
                break

    print(f"  수신된 전체 동/리: {sorted(all_names - {''})}")
    return matched


def dissolve_features(matched_features, label=""):
    if not matched_features:
        print(f"  ✗ {label} 매칭 없음")
        return None
    print(f"  → {label} 매칭 {len(matched_features)}개 피처")
    gdf = gpd.GeoDataFrame.from_features(matched_features, crs="EPSG:4326")
    buf = 0.0001
    geom = make_valid(unary_union(gdf.geometry.buffer(buf)).buffer(-buf))
    return geom


def geom_to_geojson_dict(geom):
    return json.loads(gpd.GeoSeries([geom]).to_json())["features"][0]["geometry"]


def update_district_geometry(geojson_path, district_name, new_geom, new_mc, new_dc, buf=0.001):
    """기존 feature의 geometry를 union으로 업데이트"""
    with open(geojson_path, encoding="utf-8") as f:
        data = json.load(f)

    changed = False
    for feat in data["features"]:
        p = feat["properties"]
        if p.get("district_name") != district_name:
            continue

        old_geom_json = feat.get("geometry")
        if old_geom_json and old_geom_json.get("coordinates"):
            old_gdf = gpd.GeoDataFrame.from_features(
                [{"type": "Feature", "geometry": old_geom_json, "properties": {}}],
                crs="EPSG:4326"
            )
            combined = make_valid(
                unary_union([old_gdf.geometry[0].buffer(buf), new_geom.buffer(buf)]).buffer(-buf)
            )
        else:
            combined = new_geom

        feat["geometry"] = geom_to_geojson_dict(combined)
        old_mc = p.get("matched_count", 0)
        old_dc = p.get("dong_count", 0)
        p["matched_count"] = new_mc
        p["dong_count"] = new_dc
        print(f"    {district_name}: mc={old_mc}→{new_mc}, dc={old_dc}→{new_dc}")
        changed = True
        break

    if not changed:
        print(f"  ✗ {district_name} 미발견 in {geojson_path.name}")
        return False

    with open(geojson_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    return True


def rebuild_topojson(geojson_path, topo_path):
    cmd = (
        f"geo2topo districts={geojson_path} | "
        f"topoquantize 1e6 | "
        f"toposimplify -p 0.00001 > {topo_path}"
    )
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if r.returncode != 0:
        print(f"  ✗ TopoJSON 생성 실패: {r.stderr}")
    else:
        print(f"  ✓ {topo_path.name} 재생성")


def main():
    print("=== 잔여 3개 선거구 VWorld 기반 geometry 보완 ===\n")
    api_key = load_vworld_key()
    print(f"  API 키 로드 완료\n")

    modified = []

    # ──────────────────────────────────────────
    # 1. 포항시 마선거구 — 장량동 내 양덕동 (법정동)
    # ──────────────────────────────────────────
    print("[1] 포항시 마선거구 — 장량동 내 양덕동")
    bbox_pohang = "36.00,129.33,36.07,129.43,EPSG:4326"
    features_pohang = fetch_features_by_bbox(api_key, bbox_pohang, "포항 장량동")

    pohang_feat = [f for f in features_pohang
                   if "포항" in f.get("properties", {}).get("full_nm", "")]
    matched_pohang = filter_by_name(pohang_feat, ["양덕동"], city_filter="포항")
    geom_pohang = dissolve_features(matched_pohang, "포항 양덕동")
    if geom_pohang:
        geojson_path = BASIC_DIR / "gyeongbuk" / "basic_포항시.geojson"
        topo_path = BASIC_DIR / "gyeongbuk" / "basic_포항시_topo.json"
        ok = update_district_geometry(geojson_path, "포항시 마선거구", geom_pohang, 3, 3)
        if ok:
            modified.append((geojson_path, topo_path))

    # ──────────────────────────────────────────
    # 2. 예산군 나선거구 — 예산읍 내 향천리 (법정리)
    # ──────────────────────────────────────────
    print("\n[2] 예산군 나선거구 — 예산읍 내 향천리")
    # 예산읍 일대 BBOX (가선거구 coords 기반)
    bbox_yesan = "36.63,126.79,36.77,126.93,EPSG:4326"
    features_yesan = fetch_features_by_bbox(api_key, bbox_yesan, "예산읍")

    yesan_feat = [f for f in features_yesan
                  if "예산" in f.get("properties", {}).get("full_nm", "")]
    matched_yesan = filter_by_name(yesan_feat, ["향천리"], city_filter="예산")
    geom_yesan = dissolve_features(matched_yesan, "예산 향천리")
    if geom_yesan:
        geojson_path = BASIC_DIR / "chungnam" / "basic_예산군.geojson"
        topo_path = BASIC_DIR / "chungnam" / "basic_예산군_topo.json"
        ok = update_district_geometry(geojson_path, "예산군 나선거구", geom_yesan, 4, 4)
        if ok:
            modified.append((geojson_path, topo_path))

    # ──────────────────────────────────────────
    # 3. 거창군 나선거구 — 거창읍 내 상림리 (법정리)
    #    "거창읍(상림리상동)"은 상림리의 일부이나,
    #    법정리 단위로 전체 상림리를 포함하여 처리
    # ──────────────────────────────────────────
    print("\n[3] 거창군 나선거구 — 거창읍 내 상림리")
    # 거창읍 일대 BBOX
    bbox_geochang = "35.61,127.85,35.77,127.97,EPSG:4326"
    features_geochang = fetch_features_by_bbox(api_key, bbox_geochang, "거창읍")

    geochang_feat = [f for f in features_geochang
                     if "거창" in f.get("properties", {}).get("full_nm", "")]
    matched_geochang = filter_by_name(geochang_feat, ["상림리"], city_filter="거창")
    geom_geochang = dissolve_features(matched_geochang, "거창 상림리")
    if geom_geochang:
        geojson_path = BASIC_DIR / "gyeongnam" / "basic_거창군.geojson"
        topo_path = BASIC_DIR / "gyeongnam" / "basic_거창군_topo.json"
        # dong_count=7 유지 (상림리상동 포함), matched_count=7로 교정
        ok = update_district_geometry(geojson_path, "거창군 나선거구", geom_geochang, 7, 7)
        if ok:
            modified.append((geojson_path, topo_path))
    else:
        # VWorld에서 상림리를 못 찾을 경우 dong_count=6으로 교정 (상림리상동 제외)
        print("  → 상림리 VWorld 불가 - dong_count=6 교정으로 대체")
        geojson_path = BASIC_DIR / "gyeongnam" / "basic_거창군.geojson"
        topo_path = BASIC_DIR / "gyeongnam" / "basic_거창군_topo.json"
        with open(geojson_path, encoding="utf-8") as f:
            data = json.load(f)
        for feat in data["features"]:
            p = feat["properties"]
            if p.get("district_name") == "거창군 나선거구":
                p["dong_count"] = 6
                p["matched_count"] = 6
                print(f"    거창군 나선거구: dong_count→6, matched_count→6")
                break
        with open(geojson_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        modified.append((geojson_path, topo_path))

    # ──────────────────────────────────────────
    # TopoJSON 재생성
    # ──────────────────────────────────────────
    print(f"\n{'='*50}")
    print("TopoJSON 재생성")
    for geojson_path, topo_path in modified:
        rebuild_topojson(geojson_path, topo_path)

    print(f"\n완료. 수정된 파일:")
    for geojson_path, topo_path in modified:
        print(f"  {geojson_path}")
        print(f"  {topo_path}")


if __name__ == "__main__":
    main()
