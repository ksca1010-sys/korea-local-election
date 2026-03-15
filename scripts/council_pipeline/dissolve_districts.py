#!/usr/bin/env python3
"""
광역의원 선거구 GeoJSON 생성 파이프라인

행정동 경계 GeoJSON + 선거구-행정동 매핑(district_mapping) →
선거구 단위로 dissolve하여 선거구 폴리곤 GeoJSON 생성

사용법:
    python dissolve_districts.py --sido seoul
    python dissolve_districts.py --sido all
"""

import json
import sys
import os
import re
from pathlib import Path

import geopandas as gpd
import pandas as pd
from shapely.ops import unary_union

# 프로젝트 루트
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
DATA_DIR = PROJECT_ROOT / "data" / "council"
HANGJEONGDONG_PATH = DATA_DIR / "hangjeongdong_2026.geojson"

# 시도 코드 매핑
SIDO_MAP = {
    "seoul": ("11", "서울특별시"),
    "busan": ("26", "부산광역시"),
    "daegu": ("27", "대구광역시"),
    "incheon": ("28", "인천광역시"),
    "gwangju": ("29", "광주광역시"),
    "daejeon": ("30", "대전광역시"),
    "ulsan": ("31", "울산광역시"),
    "sejong": ("36", "세종특별자치시"),
    "gyeonggi": ("41", "경기도"),
    "chungbuk": ("43", "충청북도"),
    "chungnam": ("44", "충청남도"),
    "jeonbuk": ("52", "전북특별자치도"),
    "jeonnam": ("46", "전라남도"),
    "gyeongbuk": ("47", "경상북도"),
    "gyeongnam": ("48", "경상남도"),
    "gangwon": ("51", "강원특별자치도"),
    "jeju": ("50", "제주특별자치도"),
}


_gdf_all = None  # 전체 GeoJSON 캐시

def load_all_hangjeongdong():
    """전체 행정동 GeoJSON 로드 (캐시)"""
    global _gdf_all
    if _gdf_all is None:
        print("  전체 행정동 GeoJSON 로딩...")
        _gdf_all = gpd.read_file(HANGJEONGDONG_PATH)
        print(f"  → {len(_gdf_all)}개 행정동 로드됨")
    return _gdf_all

def load_hangjeongdong(sido_code):
    """행정동 GeoJSON에서 특정 시도의 행정동만 로드"""
    gdf = load_all_hangjeongdong()
    gdf_sido = gdf[gdf["sido"] == sido_code].copy()
    print(f"  → {sido_code} 시도: {len(gdf_sido)}개 행정동")
    return gdf_sido


def load_district_mapping(sido_key):
    """선거구-행정동 매핑 JSON 로드"""
    mapping_path = DATA_DIR / f"district_mapping_{sido_key}.json"
    if not mapping_path.exists():
        print(f"  ✗ 매핑 파일 없음: {mapping_path}")
        return None
    with open(mapping_path, "r", encoding="utf-8") as f:
        return json.load(f)


# 행정동 명칭 변경 / 통합 매핑 (새이름 → [구이름 리스트])
# GeoJSON이 구 행정동 기준이므로, 매핑 데이터의 새 이름을 구 이름으로 확장
DONG_ALIASES = {
    # 부천시 2024 행정동 재편
    "부천동": ["원미1동", "원미2동", "도당동", "약대동", "춘의동"],
    "신중동": ["중1동", "중2동", "중3동", "중4동"],
    "대산동": ["소사동", "역곡1동", "역곡2동"],
    "범안동": ["범박동", "옥길동", "역곡3동", "괴안동"],
    # 안양시
    "관양1동": ["관양동"],
    "관양2동": ["인덕원동"],
    "석수3동": ["충훈동"],
    "박달1동": ["박달동"],
    "박달2동": ["호현동"],
    # 울산 중구
    "복산1동": ["복산동"],
    "복산2동": [],
    # 서울 동대문구
    "용신동": ["신설동", "용두동"],
    # 정읍시 (GeoJSON에 없는 新동)
    # 광주시(경기)
    "오포읍": ["오포1동", "오포2동"],
    # 양주시
    "회천4동": ["옥정1동", "옥정2동"],
    # 전주시
    "금암1동": ["금암동"],
    "금암2동": [],
}


def normalize_dong_name(name):
    """행정동 이름 정규화 (별표2 ↔ GeoJSON 이름 불일치 해소)"""
    name = name.strip()
    # 파싱 아티팩트 제거: "종 로 구 제 " 등 spaced prefix (2~4글자)
    name = re.sub(r"^(?:[\uac00-\ud7af]\s){2,4}제?\s*", "", name) if re.match(r"^[\uac00-\ud7af]\s[\uac00-\ud7af]\s", name) else name
    # 괄호 내용 제거: "중마동(중동)" → "중마동", "봉담읍(분천리,...)" → "봉담읍"
    name = re.sub(r"\(.*?\)", "", name)
    # 잔여 괄호 제거: "상기리)" → "상기리"
    name = re.sub(r"[()]", "", name)
    # '제1동' → '1동' 변환
    name = re.sub(r"제(\d+)동", r"\1동", name)
    # 홍제제1동 → 홍제1동
    name = re.sub(r"제(\d+)", r"\1", name)
    # ㆍ (U+318D) → · (U+00B7) 통일
    name = name.replace("ㆍ", "·")
    # 쉼표 → · 통일 (두류1,2동 → 두류1·2동)
    name = re.sub(r"(\d+),(\d+)", r"\1·\2", name)
    return name.strip()


def extract_eup_myeon_ri(dong_list, sigungu=None):
    """동 목록에서 읍/면(리1, 리2, ...) 또는 동(하위동) 패턴을 파싱하여 상위단위별 하위 개수 추출.

    데이터 형식 예: ['장흥읍(기양리', '예양리', '건산리', '우산리)', '장동면', ...]
    → {'장흥읍': 4}

    동 분할 예: ['중마동(중동)'] → {'중마동': 1}
              ['장량동(양덕동)'] → {'장량동': 1}

    sigungu가 지정되면, 다른 시군구의 파싱 아티팩트(예: "화 성 시 제 봉담읍")를 제외.
    """
    eup_myeon_ri = {}  # {읍/면/동이름: 하위 개수}
    current_eup = None

    for dong in dong_list:
        dong_orig = dong.strip()

        # 다른 시군구의 파싱 아티팩트 감지 및 스킵
        spaced_match = re.match(r"^((?:[\uac00-\ud7af]\s){2,4})제?\s*", dong_orig)
        if spaced_match and sigungu:
            prefix_chars = spaced_match.group(1).replace(" ", "")
            if prefix_chars not in sigungu and sigungu not in prefix_chars:
                current_eup = None  # 다른 시군구 → 리 시퀀스 중단
                continue

        # 파싱 아티팩트 제거: "장 흥 군 제 " 등
        dong = re.sub(r"^(?:[\uac00-\ud7af]\s){2,4}제?\s*", "", dong_orig) if re.match(r"^[\uac00-\ud7af]\s[\uac00-\ud7af]\s", dong_orig) else dong_orig

        # 패턴: 동(하위동) - 동 단위 분할 (예: "중마동(중동)", "장량동(양덕동)")
        m_dong = re.match(r"(.+동)\((.+동)\)$", dong)
        if m_dong:
            parent = m_dong.group(1)
            if parent not in eup_myeon_ri:
                eup_myeon_ri[parent] = 0
            eup_myeon_ri[parent] += 1
            continue

        # 패턴: 읍/면(리... - 분할 시작 (예: "거창읍(상림리 상동)", "장흥읍(기양리")
        m = re.match(r"(.+[읍면])\((.+리.*)\)?$", dong)
        if m:
            current_eup = m.group(1)
            if current_eup not in eup_myeon_ri:
                eup_myeon_ri[current_eup] = 0
            eup_myeon_ri[current_eup] += 1
            # 닫는 괄호가 있으면 이 읍/면은 리 1개
            if dong.endswith(")"):
                current_eup = None
            continue

        # 패턴: 리) - 분할 끝
        if current_eup and re.match(r".+리\)$", dong):
            eup_myeon_ri[current_eup] += 1
            current_eup = None
            continue

        # 패턴: 순수 리 - 분할 중간
        if current_eup and re.match(r".+리$", dong):
            eup_myeon_ri[current_eup] += 1
            continue

        # 다른 패턴 → 현재 읍/면 분할 종료
        # 마침표 포함 리 처리: "상리. 축내리" 등
        if current_eup and "리" in dong:
            # 마침표/쉼표로 분리된 복수 리
            ri_count = len(re.findall(r"[\uac00-\ud7af]+리", dong))
            if ri_count > 0:
                eup_myeon_ri[current_eup] += ri_count
                continue

        current_eup = None

    return eup_myeon_ri


def resolve_split_eup_myeon(mapping):
    """리 단위로 기술된 읍/면을 감지하고, 해당 선거구에 읍/면 폴리곤 배정.

    케이스 1: 같은 읍/면이 여러 선거구에 리 단위로 분할 → 다수 리 선거구에 배정
    케이스 2: 읍/면이 한 선거구에서만 리로 기술 → 해당 선거구에 배정

    Returns: {district_name: [추가할 읍/면 이름 리스트]}
    """
    # 시군구별로 선거구 그룹핑
    sigungu_districts = {}
    for district in mapping["districts"]:
        sgg = district["sigungu"]
        eup_ri = extract_eup_myeon_ri(district["dongs"], district["sigungu"])
        if eup_ri:
            if sgg not in sigungu_districts:
                sigungu_districts[sgg] = {}
            sigungu_districts[sgg][district["name"]] = eup_ri

    additions = {}   # {district_name: [읍/면/동]} — 추가 매칭할 항목
    exclusions = {}  # {district_name: [읍/면]} — normalize 매칭에서 제외할 항목

    for sgg, districts_ri in sigungu_districts.items():
        # 이 시군구의 모든 읍/면 수집
        all_eup = set()
        for d_ri in districts_ri.values():
            all_eup.update(d_ri.keys())

        for eup in all_eup:
            districts_with_eup = {d: ri[eup] for d, ri in districts_ri.items() if eup in ri}
            if len(districts_with_eup) > 1:
                # 분할: 다수 하위 보유 선거구에 배정
                # 동점이면 다른 동이 적은 선거구 우선 (빈 선거구 방지)
                max_count = max(districts_with_eup.values())
                tied = [d for d, c in districts_with_eup.items() if c == max_count]
                if len(tied) > 1:
                    # 동점: 전체 동 개수가 적은 선거구 우선 (해당 동만 있는 선거구)
                    dist_dong_counts = {}
                    for d_name in tied:
                        d_entry = next((x for x in mapping["districts"] if x["name"] == d_name), None)
                        dist_dong_counts[d_name] = len(d_entry["dongs"]) if d_entry else 999
                    winner = min(tied, key=lambda d: dist_dong_counts[d])
                else:
                    winner = tied[0]
                if winner not in additions:
                    additions[winner] = []
                additions[winner].append(eup)
                # 패자 선거구에서 이 동/읍/면을 제외 (normalize 매칭 방지)
                for loser in districts_with_eup:
                    if loser != winner:
                        if loser not in exclusions:
                            exclusions[loser] = []
                        exclusions[loser].append(eup)
                label = "동" if eup.endswith("동") else "읍/면"
                print(f"  ※ 분할 {label}: {sgg} {eup} → {winner} 배정 (하위 수: {districts_with_eup})")
            else:
                # 케이스 2: 단일 선거구에서 리로만 기술 → 해당 선거구에 배정
                winner = list(districts_with_eup.keys())[0]
                print(f"  ※ 리 기술 읍/면: {sgg} {eup} → {winner} 배정 (리 {districts_with_eup[winner]}개)")
                if winner not in additions:
                    additions[winner] = []
                additions[winner].append(eup)

    return additions, exclusions


def filter_sigungu(gdf_sido, sigungu):
    """시군구 필터 - 일반구 포함 도시 처리 (수원시 → 수원시장안구, 수원시권선구 등)"""
    # 1차: 정확히 일치
    gdf_sgg = gdf_sido[gdf_sido["sggnm"] == sigungu]
    if len(gdf_sgg) > 0:
        return gdf_sgg

    # 2차: 시/군 이름으로 시작하는 일반구 포함 (수원시 → 수원시장안구 등)
    gdf_sgg = gdf_sido[gdf_sido["sggnm"].str.startswith(sigungu)]
    if len(gdf_sgg) > 0:
        return gdf_sgg

    # 3차: 일반구 이름이 직접 들어온 경우 (장안구 → 수원시장안구)
    gdf_sgg = gdf_sido[gdf_sido["sggnm"].str.endswith(sigungu)]
    return gdf_sgg


def find_matching_dongs(gdf_sido, district_dongs, sigungu):
    """선거구의 행정동 목록으로 GeoJSON에서 일치하는 폴리곤 찾기"""
    matched = []
    unmatched = []
    gdf_all = load_all_hangjeongdong()

    # 해당 시군구 행정동 필터 (일반구 포함 도시 처리)
    gdf_sgg = filter_sigungu(gdf_sido, sigungu)

    # 시군구 필터 실패 시 전체에서 검색 (군위군 → 대구 편입 등)
    if len(gdf_sgg) == 0:
        gdf_sgg = filter_sigungu(gdf_all, sigungu)

    for dong_name in district_dongs:
        dong_raw = dong_name.strip()

        # 다른 시군구의 파싱 아티팩트 감지 및 스킵
        # 예: "정 읍 시 제 신태인읍" → 정읍시 데이터가 익산시에 섞인 경우
        spaced_prefix = re.match(r"^((?:[\uac00-\ud7af]\s){2,4})제?\s*", dong_raw)
        if spaced_prefix:
            prefix_chars = spaced_prefix.group(1).replace(" ", "")
            if prefix_chars not in sigungu and sigungu not in prefix_chars:
                continue  # 다른 시군구 아티팩트 → 스킵

        norm_name = normalize_dong_name(dong_raw)

        # 빈 이름 스킵
        if not norm_name:
            continue

        # 동(하위동) 패턴 스킵: split resolution이 처리 (예: "장량동(양덕동)", "북구 장량동(장성동)")
        # 읍/면(리) 패턴은 스킵하지 않음: normalize로 읍/면 전체가 매칭되어야 빈 선거구 방지
        if re.search(r"동\(.+동\)\s*$", dong_raw.strip()):
            continue

        # 행정동 명칭 변경 별칭 확장 (새이름 → 구이름들)
        if norm_name in DONG_ALIASES:
            aliases = DONG_ALIASES[norm_name]
            if aliases:
                for alias in aliases:
                    # 별칭 각각을 dong_list에 추가하여 매칭
                    alias_found = gdf_sgg[gdf_sgg["adm_nm"].apply(
                        lambda x: normalize_dong_name(x.split(" ")[-1]) == alias
                    )]
                    if len(alias_found) > 0:
                        matched.append(alias_found)
            continue  # 원래 이름은 스킵

        # 특수 패턴: "XX시/군 일원" → 해당 시군구 전체 행정동
        # 주의: "일원동", "일원본동", "일원1동" 등 실제 행정동 이름과 구별
        if norm_name.endswith("일원") and norm_name != "일원":
            if len(gdf_sgg) > 0:
                matched.append(gdf_sgg)
            else:
                unmatched.append(dong_name)
            continue

        # 리 단위는 행정동 GeoJSON에 없으므로 스킵 (읍면 단위로 매칭)
        if re.match(r".+리$", norm_name) and not norm_name.endswith("동"):
            continue

        # 구 이름 포함 패턴: "장안구 파장동" → 구 필터 + 동 매칭
        gu_name = None
        actual_dong = norm_name
        gu_match = re.match(r"(.+[구])[\s]+(.+)", norm_name)
        if gu_match:
            gu_name = gu_match.group(1)
            actual_dong = normalize_dong_name(gu_match.group(2))
            # 해당 구에 속하는 행정동만 필터
            gdf_target = gdf_sgg[gdf_sgg["sggnm"].str.contains(gu_name)]
            if len(gdf_target) == 0:
                gdf_target = gdf_sgg  # fallback
        else:
            gdf_target = gdf_sgg

        # 가운데점/쉼표 제거 버전 (탑대성동 ↔ 탑·대성동, 두류1,2동 ↔ 두류1·2동)
        actual_dong_nodot = actual_dong.replace("·", "").replace(",", "")

        def match_dong(geojson_name, target, target_nodot):
            """GeoJSON 동이름과 매핑 동이름 비교"""
            norm = normalize_dong_name(geojson_name.split(" ")[-1])
            if norm == target:
                return True
            if norm.replace("·", "").replace(",", "") == target_nodot:
                return True
            return False

        # 1차: 정확 매칭 + 가운데점/쉼표 무시 매칭
        found = gdf_target[gdf_target["adm_nm"].apply(
            lambda x: match_dong(x, actual_dong, actual_dong_nodot)
        )]

        # 1-2차: 읍↔면 교차 매칭 (양지면 → 양지읍)
        if len(found) == 0 and (actual_dong.endswith("면") or actual_dong.endswith("읍")):
            alt = actual_dong[:-1] + ("읍" if actual_dong.endswith("면") else "면")
            alt_nodot = alt.replace("·", "")
            found = gdf_target[gdf_target["adm_nm"].apply(
                lambda x: match_dong(x, alt, alt_nodot)
            )]

        if len(found) > 0:
            matched.append(found)
        else:
            # 2차: 부분 매칭 (예: '금호동' → '금호1가동', '금호2가동' 등)
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
                    # 3차: 시군구 전체에서 재검색 (gdf_sgg 범위 내)
                    # 넓은 범위(gdf_sido/gdf_all) 검색은 다른 시군구 폴리곤 혼입 위험
                    found_sgg = gdf_sgg[gdf_sgg["adm_nm"].apply(
                        lambda x: match_dong(x, actual_dong, actual_dong_nodot)
                    )]
                    if len(found_sgg) > 0:
                        matched.append(found_sgg)
                    else:
                        unmatched.append(dong_name)
            else:
                unmatched.append(dong_name)

    if matched:
        result = pd.concat(matched).drop_duplicates(subset=["adm_cd2"])
    else:
        result = gpd.GeoDataFrame()

    return result, unmatched


def dissolve_district(gdf_matched, district_name):
    """매칭된 행정동 폴리곤을 하나의 선거구 폴리곤으로 dissolve.

    행정동 경계 데이터의 미세 갭(50~110m)을 buffer(0.0005)로 메운 뒤
    결과 폴리곤의 작은 내부 구멍을 제거.
    """
    from shapely.validation import make_valid
    if gdf_matched.empty:
        return None
    # 1단계: 갭 메우기 - 확장 후 동량 축소 (형태 보존)
    buf = 0.001
    buffered = gdf_matched.geometry.buffer(buf)
    merged_geom = unary_union(buffered)
    merged_geom = merged_geom.buffer(-buf)
    merged_geom = make_valid(merged_geom)
    # 내부 구멍 메우기 (행정동 경계 갭으로 인한 작은 구멍)
    merged_geom = _fill_small_holes(merged_geom, max_hole_area=0.00005)
    return merged_geom


def _fill_small_holes(geom, max_hole_area=0.00005):
    """폴리곤 내부의 작은 구멍(갭) 메우기."""
    from shapely import Polygon as ShapelyPolygon, MultiPolygon
    if geom.geom_type == 'Polygon':
        kept = [ring for ring in geom.interiors
                if ShapelyPolygon(ring).area > max_hole_area]
        return ShapelyPolygon(geom.exterior, kept)
    elif geom.geom_type == 'MultiPolygon':
        parts = [_fill_small_holes(p, max_hole_area) for p in geom.geoms]
        return MultiPolygon(parts)
    return geom


def process_sido(sido_key):
    """시도 단위로 선거구 GeoJSON 생성"""
    sido_code, sido_name = SIDO_MAP[sido_key]
    print(f"\n{'='*60}")
    print(f"처리 중: {sido_name} ({sido_key})")
    print(f"{'='*60}")

    # 1. 매핑 데이터 로드
    mapping = load_district_mapping(sido_key)
    if not mapping:
        return False

    # 2. 행정동 GeoJSON 로드
    gdf_sido = load_hangjeongdong(sido_code)
    if gdf_sido.empty:
        print(f"  ✗ 행정동 데이터 없음")
        return False

    # 2.5. 분할 읍/면 감지 및 배정
    split_additions, split_exclusions = resolve_split_eup_myeon(mapping)

    # 3. 각 선거구별 dissolve
    features = []
    total = len(mapping["districts"])
    success = 0
    warnings = []

    for i, district in enumerate(mapping["districts"]):
        dist_name = district["name"]
        sigungu = district["sigungu"]
        dong_list = list(district["dongs"])  # 복사본

        # 분할 읍/면 배정: 승자 선거구에 읍/면 이름 추가
        if dist_name in split_additions:
            dong_list.extend(split_additions[dist_name])

        gdf_matched, unmatched = find_matching_dongs(gdf_sido, dong_list, sigungu)

        # 분할 읍/면 패자: normalize로 매칭된 읍/면 폴리곤 제거
        if dist_name in split_exclusions and not gdf_matched.empty:
            for excl in split_exclusions[dist_name]:
                excl_mask = gdf_matched["adm_nm"].apply(
                    lambda x: normalize_dong_name(x.split(" ")[-1]) == excl
                )
                if excl_mask.any():
                    gdf_matched = gdf_matched[~excl_mask]

        if unmatched:
            warnings.append(f"  ⚠ {dist_name}: 미매칭 행정동 {unmatched}")

        geom = dissolve_district(gdf_matched, dist_name)
        if geom:
            props = {
                "district_name": dist_name,
                "sigungu": sigungu,
                "dong_count": len(dong_list),
                "matched_count": len(gdf_matched),
            }
            # 분할 읍/면 패자: 폴리곤은 winner의 것과 동일 (리 단위 분할 불가)
            if dist_name in split_exclusions:
                props["shared_with"] = "리 단위 분할"
            features.append({
                "type": "Feature",
                "properties": props,
                "geometry": json.loads(gpd.GeoSeries([geom]).to_json())["features"][0]["geometry"]
            })
            success += 1
        elif dist_name in split_exclusions:
            # 폴리곤 없는 분할 패자: winner 선거구의 읍/면을 참조
            excl_list = split_exclusions[dist_name]
            # winner의 폴리곤에서 해당 읍/면의 centroid를 가져와 Point로 대체
            winner_name = None
            for eup in excl_list:
                for other in features:
                    if other["properties"]["sigungu"] == sigungu and eup in str(split_additions.get(other["properties"]["district_name"], [])):
                        winner_name = other["properties"]["district_name"]
                        break
            print(f"  ※ {dist_name}: 리 단위 분할로 폴리곤 없음 (배경으로 표시)")
            success += 1  # 성공으로 카운트

    # 4. 경고 출력
    for w in warnings:
        print(w)

    # 5. GeoJSON 저장
    output = {
        "type": "FeatureCollection",
        "properties": {
            "sido": sido_name,
            "sido_code": sido_code,
            "total_districts": total,
            "generated_districts": success
        },
        "features": features
    }

    output_path = DATA_DIR / f"council_districts_{sido_key}.geojson"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    file_size = output_path.stat().st_size / 1024
    print(f"\n  결과: {success}/{total}개 선거구 생성")
    print(f"  파일: {output_path.name} ({file_size:.0f}KB)")

    return True


def main():
    import argparse
    parser = argparse.ArgumentParser(description="광역의원 선거구 GeoJSON 생성")
    parser.add_argument("--sido", default="seoul", help="시도 키 (예: seoul, busan, all)")
    args = parser.parse_args()

    if not HANGJEONGDONG_PATH.exists():
        print(f"✗ 행정동 GeoJSON 파일이 없습니다: {HANGJEONGDONG_PATH}")
        print("  vuski/admdongkor에서 다운로드 필요")
        sys.exit(1)

    if args.sido == "all":
        results = {}
        for key in SIDO_MAP:
            mapping_path = DATA_DIR / f"district_mapping_{key}.json"
            if mapping_path.exists():
                results[key] = process_sido(key)
            else:
                print(f"\n  ⏭ {SIDO_MAP[key][1]}: 매핑 파일 없음, 건너뜀")
        print(f"\n{'='*60}")
        print("전체 결과:")
        for k, v in results.items():
            status = "✓" if v else "✗"
            print(f"  {status} {SIDO_MAP[k][1]}")
    else:
        if args.sido not in SIDO_MAP:
            print(f"✗ 알 수 없는 시도: {args.sido}")
            print(f"  사용 가능: {', '.join(SIDO_MAP.keys())}")
            sys.exit(1)
        process_sido(args.sido)


if __name__ == "__main__":
    main()
