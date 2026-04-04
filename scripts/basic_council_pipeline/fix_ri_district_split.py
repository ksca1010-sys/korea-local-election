#!/usr/bin/env python3
"""
읍면 내 리(里) 단위 선거구 분리 교정 — 범용 스크립트

문제 유형:
  같은 읍면 내 여러 선거구가 각자 다른 리 집합으로 구성될 때,
  이전 파이프라인이 읍면 전체 폴리곤을 각 선거구에 중복 할당하는 버그가 있었음.
  → 두 선거구 폴리곤이 90% 이상 겹치는 케이스를 탐지·교정.

대상 케이스:
  순천  — 해룡면 아선거구(신대리) / 자선거구(나머지 17개 리)
  증평  — 증평읍 가선거구(7개 리)  / 나선거구(9개 리)

사용법:
  python fix_ri_district_split.py            # 모든 케이스
  python fix_ri_district_split.py 순천       # 순천만
  python fix_ri_district_split.py 증평       # 증평만
  python fix_ri_district_split.py --dry-run  # 조회·검증만 (파일 저장 안 함)
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

# ──────────────────────────────────────────────────────────────
# 케이스 설정
# ──────────────────────────────────────────────────────────────
CASES = {
    "순천": {
        "sigungu": "순천시",
        "region": "jeonnam",
        # VWorld WFS BBOX (lat_min, lon_min, lat_max, lon_max)
        "bbox": "34.83,127.51,34.97,127.60,EPSG:4326",
        # full_nm 포함 필터 (해당 읍면만 추출)
        "parent_filter": "순천시 해룡면",
        "districts": [
            {
                "name": "순천시 아선거구",
                "ris": {"신대리"},
                "seats": 2,
            },
            {
                "name": "순천시 자선거구",
                "ris": {
                    "대안리", "남가리", "월전리", "성산리", "선월리", "신성리",
                    "호두리", "용전리", "도롱리", "중흥리", "해창리", "선학리",
                    "농주리", "상내리", "하사리", "복성리", "상삼리",
                },
                "seats": 2,
            },
        ],
    },
    "증평": {
        "sigungu": "증평군",
        "region": "chungbuk",
        "bbox": "36.70,127.53,36.83,127.67,EPSG:4326",
        "parent_filter": "증평군 증평읍",
        "districts": [
            {
                "name": "증평군 가선거구",
                "ris": {"창동리", "중동리", "교동리", "초중리", "대동리", "증평리", "신동리"},
                "seats": 2,
            },
            {
                "name": "증평군 나선거구",
                "ris": {"내성리", "증천리", "남하리", "용강리", "죽리", "덕상리", "남차리", "율리", "장동리"},
                "seats": 2,
            },
        ],
    },
}

OVERLAP_THRESHOLD = 0.9   # 이 비율 이상 겹치면 저장 중단
AREA_RATIO_WARN   = 5.0   # 리 수 대비 면적 비율이 이 배수 이상이면 경고


# ──────────────────────────────────────────────────────────────
# VWorld 조회
# ──────────────────────────────────────────────────────────────

def load_vworld_key():
    env_path = PROJECT_ROOT / ".env"
    if not env_path.exists():
        raise RuntimeError(f".env 파일 없음: {env_path}")
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line.startswith("VWORLD_API_KEY="):
                val = line.split("=", 1)[1].strip()
                if not val:
                    raise RuntimeError(".env에 VWORLD_API_KEY 값이 비어 있음")
                return val
    raise RuntimeError(".env에 VWORLD_API_KEY 항목 없음")


def check_vworld(api_key):
    """
    실제 요청으로 VWorld 상태를 사전 진단.
    키 유효성과 서비스 가용성을 구분해서 출력.
    """
    print("  [사전 진단] VWorld API 상태 확인 중...")
    params = {
        "service": "WFS", "version": "1.1.0", "request": "GetFeature",
        "typename": "lt_c_adri", "output": "application/json",
        "key": api_key, "domain": "korea-local-eletion.pages.dev",
        "srsName": "EPSG:4326", "maxFeatures": "1",
        "bbox": "37.56,126.97,37.57,126.98,EPSG:4326",  # 서울 도심 — 항상 결과 있음
    }
    url = "https://api.vworld.kr/req/wfs?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=10, context=_SSL_CTX) as resp:
            code = resp.status
            data = json.loads(resp.read().decode("utf-8"))

        if data.get("type") == "error" or "error" in data:
            err = data.get("error", data)
            # VWorld 에러코드: 100번대 = 인증/키, 200번대 = 요청 오류
            raise RuntimeError(f"키 인증 실패 (VWorld 에러): {err}")

        features = data.get("features", [])
        print(f"  ✓ VWorld 정상 (HTTP {code}, 피처 {len(features)}개 수신)")

    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            raise RuntimeError(
                f"키 인증 오류 (HTTP {e.code}) — .env의 VWORLD_API_KEY 값을 확인하세요"
            )
        elif e.code == 503:
            raise RuntimeError(
                f"VWorld 서비스 일시 중단 (HTTP 503) — 키 문제 아님, 잠시 후 재시도하세요"
            )
        else:
            raise RuntimeError(f"VWorld HTTP 오류 {e.code}: {e.reason}")
    except TimeoutError:
        raise RuntimeError("VWorld 응답 타임아웃 — 서비스 점검 중이거나 네트워크 문제, 키 문제 아님")
    except OSError as e:
        raise RuntimeError(f"네트워크 연결 실패: {e} — 키 문제 아님")


def fetch_ri_features(api_key, bbox, parent_filter, label=""):
    """VWorld WFS lt_c_adri 레이어에서 리 단위 경계 조회 및 필터링"""
    params = {
        "service":    "WFS",
        "version":    "1.1.0",
        "request":    "GetFeature",
        "typename":   "lt_c_adri",
        "output":     "application/json",
        "key":        api_key,
        "domain":     "korea-local-eletion.pages.dev",
        "srsName":    "EPSG:4326",
        "maxFeatures": "300",
        "bbox":       bbox,
    }
    url = "https://api.vworld.kr/req/wfs?" + urllib.parse.urlencode(params)
    print(f"  VWorld WFS 요청 중 ({label})...")

    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30, context=_SSL_CTX) as resp:
        data = json.loads(resp.read().decode("utf-8"))

    if "error" in data or data.get("type") == "error":
        raise RuntimeError(f"VWorld 오류: {data}")

    all_features = data.get("features", [])
    print(f"  → 수신 {len(all_features)}개 피처 (BBOX 전체)")

    # 읍면 필터링
    features = [
        f for f in all_features
        if parent_filter in f.get("properties", {}).get("full_nm", "")
    ]
    print(f"  → '{parent_filter}' 필터 후 {len(features)}개")

    if not features:
        raise RuntimeError(f"'{parent_filter}' 해당 피처 없음 — BBOX 또는 parent_filter 확인 필요")

    # 수신된 리 목록 출력 (디버깅)
    ri_names = sorted(set(
        _ri_name(f["properties"]) for f in features
    ))
    print(f"  → 리 목록 ({len(ri_names)}개): {ri_names}")

    return features


def _ri_name(props):
    """properties에서 리 이름 추출"""
    v = props.get("li_kor_nm", "").strip()
    if v:
        return v
    full = props.get("full_nm", "").strip()
    if full:
        return full.split()[-1]
    return ""


# ──────────────────────────────────────────────────────────────
# Dissolve
# ──────────────────────────────────────────────────────────────

def dissolve_ris(features, ri_set, label=""):
    """지정 리 집합에 해당하는 피처를 dissolve하여 shapely geometry 반환"""
    matched = [f for f in features if _ri_name(f.get("properties", {})) in ri_set]

    unmatched = ri_set - {_ri_name(f.get("properties", {})) for f in matched}
    if unmatched:
        print(f"  ⚠ {label}: 매칭 안 된 리 {sorted(unmatched)}")

    if not matched:
        raise RuntimeError(f"{label}: 매칭된 피처 없음 — ri_set={sorted(ri_set)}")

    print(f"  → {label}: {len(matched)}개 피처 dissolve")
    gdf = gpd.GeoDataFrame.from_features(matched, crs="EPSG:4326")
    buf = 0.0001
    geom = unary_union(gdf.geometry.buffer(buf)).buffer(-buf)
    return make_valid(geom)


# ──────────────────────────────────────────────────────────────
# 검증
# ──────────────────────────────────────────────────────────────

def validate(district_geoms, ris_counts):
    """
    두 가지 검증:
    1. 폴리곤 쌍별 중복 비율 — OVERLAP_THRESHOLD 이상이면 RuntimeError
    2. 리 수 대비 면적 비율 — AREA_RATIO_WARN 배수 이상이면 경고
    """
    names = list(district_geoms.keys())
    total_area = sum(g.area for g in district_geoms.values())
    total_ris  = sum(ris_counts.values())

    # 1. 중복 검사
    print("  [검증] 폴리곤 중복 검사...")
    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            n1, n2 = names[i], names[j]
            g1, g2 = district_geoms[n1], district_geoms[n2]
            try:
                inter_area = g1.intersection(g2).area
            except Exception:
                inter_area = 0
            smaller = min(g1.area, g2.area)
            ratio = inter_area / smaller if smaller > 0 else 0
            if ratio > OVERLAP_THRESHOLD:
                raise RuntimeError(
                    f"검증 실패: {n1}과 {n2}의 폴리곤이 {ratio*100:.1f}% 겹칩니다.\n"
                    f"  → VWorld가 리 단위 경계 대신 읍면 전체를 반환했을 가능성 높음.\n"
                    f"  → 수신된 리 목록을 확인하고, parent_filter/bbox를 조정하세요.\n"
                    f"  → 파일은 저장되지 않았습니다."
                )
            print(f"    {n1} ∩ {n2}: {ratio*100:.1f}% 중복 — OK")

    # 2. 면적 비율 경고
    print("  [검증] 면적/리 수 비율 검사...")
    for name, geom in district_geoms.items():
        expected = ris_counts[name] / total_ris
        actual   = geom.area / total_area if total_area > 0 else 0
        ratio    = actual / expected if expected > 0 else 0
        flag = "⚠" if ratio > AREA_RATIO_WARN or ratio < 1 / AREA_RATIO_WARN else "✓"
        print(f"    {flag} {name}: 리 비율={expected:.1%}, 면적 비율={actual:.1%} (배수={ratio:.1f})")

    print("  → 검증 완료")


# ──────────────────────────────────────────────────────────────
# GeoJSON / TopoJSON 업데이트
# ──────────────────────────────────────────────────────────────

def geom_to_geojson_dict(geom):
    return json.loads(gpd.GeoSeries([geom]).to_json())["features"][0]["geometry"]


def update_geojson(geojson_path, districts_update):
    """
    districts_update: {district_name: (geom, seats)} dict
    기존 선거구가 있으면 geometry 교체, 없으면 추가.
    """
    with open(geojson_path, encoding="utf-8") as f:
        data = json.load(f)

    features = data["features"]
    pending = dict(districts_update)  # 아직 처리 안 된 것

    for feat in features:
        name = feat["properties"].get("district_name", "")
        if name in pending:
            geom, seats = pending.pop(name)
            feat["geometry"] = geom_to_geojson_dict(geom)
            feat["properties"]["seats"] = seats
            print(f"  ✓ {name} geometry 교체")

    # 기존에 없던 선거구는 추가 (순서 유지를 위해 알파벳 순 삽입)
    for name, (geom, seats) in pending.items():
        new_feat = {
            "type": "Feature",
            "properties": {
                "district_name": name,
                "sigungu": name.split()[0],
                "seats": seats,
                "dong_count": 1,
                "matched_count": 1,
            },
            "geometry": geom_to_geojson_dict(geom),
        }
        features.append(new_feat)
        print(f"  ✓ {name} 신규 추가")

    data["features"] = features
    with open(geojson_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"  ✓ {geojson_path.name} 저장 ({len(features)}개 선거구)")


def rebuild_topo(geojson_path, topo_path):
    cmd = (
        f"geo2topo districts={geojson_path} "
        f"--quantization 1e5 "
        f"-o {topo_path}"
    )
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"  ✗ TopoJSON 생성 실패: {result.stderr}")
    else:
        print(f"  ✓ {topo_path.name} 재생성")


# ──────────────────────────────────────────────────────────────
# 케이스 실행
# ──────────────────────────────────────────────────────────────

def run_case(case_name, cfg, api_key, dry_run=False):
    print(f"\n{'='*60}")
    print(f"  케이스: {case_name} ({cfg['sigungu']})")
    print(f"{'='*60}")

    # 1. VWorld 조회
    features = fetch_ri_features(
        api_key,
        cfg["bbox"],
        cfg["parent_filter"],
        label=cfg["sigungu"],
    )

    # 2. 선거구별 dissolve
    district_geoms = {}
    ris_counts = {}
    for d in cfg["districts"]:
        geom = dissolve_ris(features, d["ris"], label=d["name"])
        district_geoms[d["name"]] = geom
        ris_counts[d["name"]] = len(d["ris"])

    # 3. 검증 — 실패 시 RuntimeError 발생, 파일 미저장
    validate(district_geoms, ris_counts)

    if dry_run:
        print("  [dry-run] 검증 통과 — 파일 저장 스킵")
        return

    # 4. GeoJSON 업데이트
    region = cfg["region"]
    sigungu = cfg["sigungu"]
    geojson_path = BASIC_DIR / region / f"basic_{sigungu}.geojson"
    topo_path    = BASIC_DIR / region / f"basic_{sigungu}_topo.json"

    updates = {d["name"]: (district_geoms[d["name"]], d["seats"]) for d in cfg["districts"]}
    update_geojson(geojson_path, updates)

    # 5. TopoJSON 재생성
    rebuild_topo(geojson_path, topo_path)

    print(f"  → {case_name} 완료")


# ──────────────────────────────────────────────────────────────
# main
# ──────────────────────────────────────────────────────────────

def main():
    args = sys.argv[1:]
    dry_run = "--dry-run" in args
    args = [a for a in args if a != "--dry-run"]

    # 실행할 케이스 결정
    if args:
        targets = {}
        for a in args:
            if a in CASES:
                targets[a] = CASES[a]
            else:
                print(f"알 수 없는 케이스: {a}. 사용 가능: {list(CASES.keys())}")
                sys.exit(1)
    else:
        targets = CASES

    print("=== 리 단위 선거구 분리 교정 ===")
    if dry_run:
        print("    [dry-run 모드: 파일 저장 안 함]")
    print(f"    대상: {list(targets.keys())}\n")

    api_key = load_vworld_key()
    print(f"  VWorld API 키 로드 완료")
    check_vworld(api_key)  # 키 유효성 + 서비스 가용성 사전 확인

    errors = []
    for case_name, cfg in targets.items():
        try:
            run_case(case_name, cfg, api_key, dry_run=dry_run)
        except Exception as e:
            print(f"\n  ✗ {case_name} 실패: {e}")
            errors.append(case_name)

    print(f"\n{'='*60}")
    if errors:
        print(f"  실패한 케이스: {errors}")
        sys.exit(1)
    else:
        print("  모든 케이스 완료")


if __name__ == "__main__":
    main()
