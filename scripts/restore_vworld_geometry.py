#!/usr/bin/env python3
"""
VWorld-fixed 선거구 geometry 복원 스크립트

dissolve_districts.py --sido all 실행 후,
백업에서 VWorld-corrected geometry를 새 dissolve 파일에 주입한다.
VWorld-fixed가 아닌 선거구의 dissolve 결과는 그대로 유지.

사용법:
    python3 scripts/restore_vworld_geometry.py
"""
import json
import subprocess
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
BASIC_DIR = PROJECT_ROOT / "data" / "basic_council"
BACKUP_DIR = Path("/tmp/vworld_backup")

# VWORLD_FIXED_DISTRICTS와 동일 (fix_all_gaps.py 참조)
VWORLD_FIXED = [
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
    ("gyeongnam", "양산시 나선거구"),
]

def get_sigungu_from_district_name(district_name):
    """'순천시 자선거구' → '순천시'"""
    return district_name.rsplit(" ", 1)[0]

def get_sgg_key(sgg_name):
    """파일명용 키: 공백 제거"""
    import re
    return re.sub(r"\s+", "", sgg_name)

def restore_vworld(region, district_name, backup_feature):
    """dissolve 결과 파일에서 VWorld geometry로 해당 선거구 교체"""
    sgg = get_sigungu_from_district_name(district_name)
    sgg_key = get_sgg_key(sgg)
    geojson_path = BASIC_DIR / region / f"basic_{sgg_key}.geojson"

    if not geojson_path.exists():
        print(f"  ✗ 파일 없음: {geojson_path}")
        return False

    with open(geojson_path, encoding="utf-8") as f:
        gj = json.load(f)

    replaced = False
    for feat in gj["features"]:
        if feat["properties"].get("district_name") == district_name:
            old_geom = feat["geometry"]["type"]
            feat["geometry"] = backup_feature["geometry"]
            # matched_count를 dong_count와 동일하게
            feat["properties"]["matched_count"] = feat["properties"]["dong_count"]
            replaced = True
            print(f"  ✓ [{region}] {district_name}: geometry 교체 ({old_geom} → {backup_feature['geometry']['type']})")
            break

    if not replaced:
        print(f"  ⚠ [{region}] {district_name}: 선거구 없음 in {geojson_path.name}")
        return False

    with open(geojson_path, "w", encoding="utf-8") as f:
        json.dump(gj, f, ensure_ascii=False, indent=2)
    return True


def rebuild_sido_integrated(region):
    """per-city geojson 파일들에서 시도 통합 파일 재생성"""
    region_dir = BASIC_DIR / region
    if not region_dir.exists():
        return

    all_features = []
    for fname in sorted(region_dir.iterdir()):
        if not fname.name.endswith(".geojson"):
            continue
        with open(fname, encoding="utf-8") as f:
            gj = json.load(f)
        all_features.extend(gj.get("features", []))

    if not all_features:
        return

    integrated_path = BASIC_DIR / f"basic_districts_{region}.geojson"
    existing = {}
    if integrated_path.exists():
        with open(integrated_path, encoding="utf-8") as f:
            ex = json.load(f)
        existing = ex.get("properties", {})

    output = {
        "type": "FeatureCollection",
        "properties": existing,
        "features": all_features,
    }
    with open(integrated_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f"  → 통합 파일 재생성: basic_districts_{region}.geojson ({len(all_features)}개 선거구)")


def regen_topo(region, sgg_key):
    """topo 파일 재생성"""
    geojson_path = BASIC_DIR / region / f"basic_{sgg_key}.geojson"
    topo_path = BASIC_DIR / region / f"basic_{sgg_key}_topo.json"
    cmd = ["geo2topo", f"districts={geojson_path}", "-o", str(topo_path),
           "--quantization", "1e5"]
    r = subprocess.run(cmd, capture_output=True, text=True, cwd=str(PROJECT_ROOT))
    if r.returncode != 0:
        print(f"  ✗ TopoJSON 실패 ({sgg_key}): {r.stderr[:100]}")
    else:
        print(f"  ✓ TopoJSON 재생성: basic_{sgg_key}_topo.json")


def main():
    # region → set of sigungu keys (업데이트된 파일들)
    updated = {}

    for region, district_name in VWORLD_FIXED:
        sgg = get_sigungu_from_district_name(district_name)
        sgg_key = get_sgg_key(sgg)
        backup_file = BACKUP_DIR / region / f"basic_{sgg_key}.geojson"

        if not backup_file.exists():
            print(f"✗ 백업 없음: {backup_file}")
            continue

        with open(backup_file, encoding="utf-8") as f:
            backup_gj = json.load(f)

        # 백업에서 해당 선거구 feature 찾기
        backup_feature = None
        for feat in backup_gj.get("features", []):
            if feat["properties"].get("district_name") == district_name:
                backup_feature = feat
                break

        if backup_feature is None:
            print(f"✗ 백업에서 선거구 없음: {district_name}")
            continue

        ok = restore_vworld(region, district_name, backup_feature)
        if ok:
            if region not in updated:
                updated[region] = set()
            updated[region].add(sgg_key)

    print("\n--- topo 재생성 ---")
    for region, sgg_keys in updated.items():
        for sgg_key in sorted(sgg_keys):
            regen_topo(region, sgg_key)

    print("\n--- 시도 통합 파일 재생성 ---")
    for region in updated:
        rebuild_sido_integrated(region)

    print("\n완료!")


if __name__ == "__main__":
    main()
