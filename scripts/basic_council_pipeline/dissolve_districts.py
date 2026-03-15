#!/usr/bin/env python3
"""
기초의원 선거구 GeoJSON 생성 파이프라인

행정동 경계 GeoJSON + 기초의원 선거구-행정동 매핑 →
시군구별 선거구 단위로 dissolve하여 선거구 폴리곤 GeoJSON 생성

광역의원 dissolve_districts.py의 핵심 로직을 재사용하되,
시군구별 파일 분리 (lazy loading용) 및 정수(seats) 속성을 추가

사용법:
    python dissolve_districts.py --sido seoul
    python dissolve_districts.py --sido all
"""

import json
import sys
import re
from pathlib import Path

import geopandas as gpd
import pandas as pd
from shapely.ops import unary_union

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
COUNCIL_DATA_DIR = PROJECT_ROOT / "data" / "council"
BASIC_DATA_DIR = PROJECT_ROOT / "data" / "basic_council"
HANGJEONGDONG_PATH = COUNCIL_DATA_DIR / "hangjeongdong_2026.geojson"

# 15개 시도 (세종/제주 제외)
SIDO_MAP = {
    "seoul": ("11", "서울특별시"),
    "busan": ("26", "부산광역시"),
    "daegu": ("27", "대구광역시"),
    "incheon": ("28", "인천광역시"),
    "gwangju": ("29", "광주광역시"),
    "daejeon": ("30", "대전광역시"),
    "ulsan": ("31", "울산광역시"),
    "gyeonggi": ("41", "경기도"),
    "chungbuk": ("43", "충청북도"),
    "chungnam": ("44", "충청남도"),
    "jeonbuk": ("52", "전북특별자치도"),
    "jeonnam": ("46", "전라남도"),
    "gyeongbuk": ("47", "경상북도"),
    "gyeongnam": ("48", "경상남도"),
    "gangwon": ("51", "강원특별자치도"),
}

# === 광역의원 dissolve 로직 재사용 ===
# council_pipeline/dissolve_districts.py에서 가져온 핵심 함수들

_gdf_all = None

def load_all_hangjeongdong():
    global _gdf_all
    if _gdf_all is None:
        print("  전체 행정동 GeoJSON 로딩...")
        _gdf_all = gpd.read_file(HANGJEONGDONG_PATH)
        print(f"  → {len(_gdf_all)}개 행정동 로드됨")
    return _gdf_all


def load_hangjeongdong(sido_code):
    gdf = load_all_hangjeongdong()
    return gdf[gdf["sido"] == sido_code].copy()


# 행정동 통합/명칭변경 매핑 (신설 행정동 → 구 행정동 목록)
DONG_EXPAND_MAP = {
    # 부천시 2019 광역동 통합
    "부천동": ["도당동", "춘의동", "역곡1동", "역곡2동", "원미1동"],
    "신중동": ["약대동", "중1동", "중2동", "중3동", "중4동"],
    "대산동": ["송내1동", "송내2동", "심곡본동", "심곡본1동"],
    "범안동": ["괴안동", "역곡3동", "범박동"],
    # 서울 동대문구 (용신동 → 용두동으로 통합)
    "용신동": ["용두동"],
    # 경주시 (중부동 → 2025.09 황오동으로 통합)
    "중부동": ["황오동"],
    # 성주군 (금수면 → 금수강산면 개명)
    "금수면": ["금수강산면"],
}


def normalize_dong_name(name):
    name = name.strip()
    name = re.sub(r"^(?:[\uac00-\ud7af]\s){2,4}제?\s*", "", name) if re.match(r"^[\uac00-\ud7af]\s[\uac00-\ud7af]\s", name) else name
    name = re.sub(r"\(.*?\)", "", name)
    name = re.sub(r"[()]", "", name)
    name = re.sub(r"제(\d+)동", r"\1동", name)
    name = re.sub(r"제(\d+)", r"\1", name)
    # 모든 중간점 유니코드를 통일 (U+2027 ‧, U+318D ㆍ, U+2022 •, U+00B7 ·, U+2024 ․)
    name = name.replace("\u2027", "·").replace("ㆍ", "·").replace("•", "·").replace("\u2024", "·")
    name = re.sub(r"(\d+),(\d+)", r"\1·\2", name)
    return name.strip()


def filter_sigungu(gdf_sido, sigungu):
    gdf_sgg = gdf_sido[gdf_sido["sggnm"] == sigungu]
    if len(gdf_sgg) > 0:
        return gdf_sgg
    gdf_sgg = gdf_sido[gdf_sido["sggnm"].str.startswith(sigungu)]
    if len(gdf_sgg) > 0:
        return gdf_sgg
    gdf_sgg = gdf_sido[gdf_sido["sggnm"].str.endswith(sigungu)]
    if len(gdf_sgg) > 0:
        return gdf_sgg
    # "전주시" → "전주시완산구", "전주시덕진구" 등 포함 검색
    base = re.sub(r"시$", "", sigungu)
    if base and len(base) >= 2:
        gdf_sgg = gdf_sido[gdf_sido["sggnm"].str.contains(base)]
    return gdf_sgg


def find_matching_dongs(gdf_sido, district_dongs, sigungu):
    matched = []
    unmatched = []
    gdf_all = load_all_hangjeongdong()
    gdf_sgg = filter_sigungu(gdf_sido, sigungu)
    if len(gdf_sgg) == 0:
        gdf_sgg = filter_sigungu(gdf_all, sigungu)

    # 전처리: "읍(리1, 리2...)" 패턴을 읍 단위로 변환
    processed_dongs = []
    i = 0
    while i < len(district_dongs):
        dong = district_dongs[i].strip()
        # "예산읍(예산리" 같은 패턴 감지 → 읍 이름만 추출
        eup_paren = re.match(r"^(.+(?:읍|면))\(", dong)
        if eup_paren:
            eup_name = eup_paren.group(1)
            # 괄호가 닫힐 때까지 skip
            while i < len(district_dongs) and ")" not in district_dongs[i]:
                i += 1
            i += 1  # 닫는 괄호 포함 항목도 skip
            processed_dongs.append(eup_name)
            continue
        # 단독 리(里)는 skip (읍/면 분할 내의 리)
        if re.match(r".+리\)?$", dong) and not re.search(r"(동|읍|면)", dong):
            i += 1
            continue
        processed_dongs.append(dong)
        i += 1

    # DONG_EXPAND_MAP 적용: 통합 행정동을 구 행정동 목록으로 확장
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
        # 구 이름 분리: "완산구중앙동" → 완산구 + 중앙동
        # 단, "청구동", "선두구동" 등 동 이름 자체에 "구"가 포함된 경우 제외
        # 실제 구 이름은 2글자 이상 + 구 (완산구, 덕진구, 만안구 등)
        gu_match = re.match(r"(.{2,}[구])[\s]*(.+동.*)$", norm_name)
        if gu_match:
            candidate_gu = gu_match.group(1)
            candidate_dong = gu_match.group(2)
            # sggnm에 실제 해당 구가 존재하는지 확인
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
            # 번호 제거 fallback: "복산1동" → "복산동" == "복산동"
            target_nonum = re.sub(r"\d+동$", "동", target)
            norm_nonum = re.sub(r"\d+동$", "동", norm)
            if target_nonum == norm_nonum and target_nonum != target:
                return True
            return False

        found = gdf_target[gdf_target["adm_nm"].apply(
            lambda x: match_dong(x, actual_dong, actual_dong_nodot)
        )]

        # 읍/면 교차 매칭
        if len(found) == 0 and (actual_dong.endswith("면") or actual_dong.endswith("읍")):
            alt = actual_dong[:-1] + ("읍" if actual_dong.endswith("면") else "면")
            alt_nodot = alt.replace("·", "")
            found = gdf_target[gdf_target["adm_nm"].apply(
                lambda x: match_dong(x, alt, alt_nodot)
            )]

        # 읍/면이 동으로 전환된 경우: "오포읍" → "오포1동", "오포2동"
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
                    # 전체 GeoJSON에서 검색
                    found_wide = gdf_all[gdf_all["adm_nm"].apply(
                        lambda x: match_dong(x, actual_dong, actual_dong_nodot)
                    )]
                    if len(found_wide) > 0:
                        matched.append(found_wide)
                    else:
                        # 전체에서 부분 매칭
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

# === 기초의원 전용 로직 ===

def load_basic_mapping(sido_key):
    """기초의원 선거구 매핑 JSON 로드"""
    path = BASIC_DATA_DIR / f"basic_district_mapping_{sido_key}.json"
    if not path.exists():
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def process_sido(sido_key):
    """시도 단위 기초의원 선거구 GeoJSON 생성 — 시군구별 파일 분리"""
    sido_code, sido_name = SIDO_MAP[sido_key]
    print(f"\n{'='*60}")
    print(f"처리 중: {sido_name} ({sido_key})")
    print(f"{'='*60}")

    mapping = load_basic_mapping(sido_key)
    if not mapping:
        print(f"  ✗ 매핑 파일 없음")
        return False

    gdf_sido = load_hangjeongdong(sido_code)
    if gdf_sido.empty:
        print(f"  ✗ 행정동 데이터 없음")
        return False

    # 시군구별로 그룹화
    districts_by_sgg = {}
    for d in mapping["districts"]:
        sgg = d["sigungu"]
        if sgg not in districts_by_sgg:
            districts_by_sgg[sgg] = []
        districts_by_sgg[sgg].append(d)

    total = len(mapping["districts"])
    success = 0
    sgg_count = 0

    # 시도 전체 통합 파일용
    all_features = []

    from shapely.validation import make_valid

    for sgg_name, sgg_districts in districts_by_sgg.items():
        features = []
        warnings = []

        # 1단계: 각 선거구별 매칭 수행
        matched_results = []
        for district in sgg_districts:
            dist_name = district["name"]
            sigungu = district["sigungu"]
            dong_list = district["dongs"]
            seats = district.get("seats", 2)

            gdf_matched, unmatched = find_matching_dongs(gdf_sido, dong_list, sigungu)

            if unmatched:
                warnings.append(f"    ⚠ {dist_name}: 미매칭 {unmatched}")

            matched_results.append({
                "name": dist_name, "sigungu": sigungu, "seats": seats,
                "dong_list": dong_list, "gdf_matched": gdf_matched,
            })

        # 2단계: 중복 매칭된 행정동 제거 (겹침 방지)
        # 각 행정동이 몇 개 선거구에 매칭되었는지 확인
        dong_to_districts = {}  # adm_cd2 → [(district_idx, total_matched)]
        for idx, mr in enumerate(matched_results):
            if mr["gdf_matched"].empty:
                continue
            for _, row in mr["gdf_matched"].iterrows():
                cd = row["adm_cd2"]
                if cd not in dong_to_districts:
                    dong_to_districts[cd] = []
                dong_to_districts[cd].append((idx, len(mr["gdf_matched"])))

        # 중복 행정동: 매칭 수가 적은 선거구에서 제거 (동점이면 전체 동 수가 적은 쪽 유지)
        for cd, dist_list in dong_to_districts.items():
            if len(dist_list) <= 1:
                continue
            # winner = 매칭 수가 적은 쪽 (해당 동만 있는 선거구 보호)
            dist_list.sort(key=lambda x: (len(matched_results[x[0]]["gdf_matched"]), len(matched_results[x[0]]["dong_list"])))
            winner_idx = dist_list[0][0]
            for loser_idx, _ in dist_list[1:]:
                mr = matched_results[loser_idx]
                if not mr["gdf_matched"].empty:
                    remaining = mr["gdf_matched"][mr["gdf_matched"]["adm_cd2"] != cd]
                    if not remaining.empty:
                        mr["gdf_matched"] = remaining

        # 3단계: dissolve + feature 생성
        for mr in matched_results:
            if mr["gdf_matched"].empty:
                continue

            buf = 0.001
            buffered = mr["gdf_matched"].geometry.buffer(buf)
            geom = unary_union(buffered).buffer(-buf)
            geom = make_valid(geom)
            feature = {
                "type": "Feature",
                "properties": {
                    "district_name": mr["name"],
                    "sigungu": mr["sigungu"],
                    "seats": mr["seats"],
                    "dong_count": len(mr["dong_list"]),
                    "matched_count": len(mr["gdf_matched"]),
                },
                "geometry": json.loads(gpd.GeoSeries([geom]).to_json())["features"][0]["geometry"]
            }
            features.append(feature)
            all_features.append(feature)
            success += 1

        for w in warnings:
            print(w)

        if features:
            # 시군구별 파일 저장 (lazy loading용)
            sgg_key = re.sub(r"\s+", "", sgg_name)
            output = {
                "type": "FeatureCollection",
                "properties": {
                    "sido": sido_name,
                    "sigungu": sgg_name,
                    "total_districts": len(sgg_districts),
                    "generated_districts": len(features),
                },
                "features": features,
            }
            out_dir = BASIC_DATA_DIR / sido_key
            out_dir.mkdir(parents=True, exist_ok=True)
            out_path = out_dir / f"basic_{sgg_key}.geojson"
            with open(out_path, "w", encoding="utf-8") as f:
                json.dump(output, f, ensure_ascii=False, indent=2)
            sgg_count += 1

    # 시도 전체 통합 파일도 저장
    if all_features:
        all_output = {
            "type": "FeatureCollection",
            "properties": {
                "sido": sido_name,
                "sido_code": sido_code,
                "total_districts": total,
                "generated_districts": success,
            },
            "features": all_features,
        }
        all_path = BASIC_DATA_DIR / f"basic_districts_{sido_key}.geojson"
        with open(all_path, "w", encoding="utf-8") as f:
            json.dump(all_output, f, ensure_ascii=False, indent=2)

    print(f"\n  결과: {success}/{total}개 선거구 생성 ({sgg_count}개 시군구 파일)")
    return True


def main():
    import argparse
    parser = argparse.ArgumentParser(description="기초의원 선거구 GeoJSON 생성")
    parser.add_argument("--sido", default="seoul", help="시도 키 (예: seoul, all)")
    args = parser.parse_args()

    if not HANGJEONGDONG_PATH.exists():
        print(f"✗ 행정동 GeoJSON 없음: {HANGJEONGDONG_PATH}")
        sys.exit(1)

    BASIC_DATA_DIR.mkdir(parents=True, exist_ok=True)

    if args.sido == "all":
        for key in SIDO_MAP:
            mapping_path = BASIC_DATA_DIR / f"basic_district_mapping_{key}.json"
            if mapping_path.exists():
                process_sido(key)
            else:
                print(f"\n  ⏭ {SIDO_MAP[key][1]}: 매핑 파일 없음")
    else:
        if args.sido not in SIDO_MAP:
            print(f"✗ 알 수 없는 시도: {args.sido}")
            sys.exit(1)
        process_sido(args.sido)


if __name__ == "__main__":
    main()
