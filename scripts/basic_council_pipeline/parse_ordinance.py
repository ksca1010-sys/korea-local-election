#!/usr/bin/env python3
"""
기초의원 선거구 조례 파싱 파이프라인

15개 시도 조례에서 기초의원 선거구별 관할 읍면동 목록 + 정수를 추출하여
basic_district_mapping_{sido_key}.json 파일로 저장한다.

사용법:
    python parse_ordinance.py --sido seoul
    python parse_ordinance.py --sido all
    python parse_ordinance.py --fetch-list   # 법제처 API에서 조례 목록 조회
"""

import json
import re
import sys
import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
DATA_DIR = PROJECT_ROOT / "data" / "basic_council"
COUNCIL_DATA_DIR = PROJECT_ROOT / "data" / "council"

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

# 조례 검색 키워드 (시도별)
ORDINANCE_KEYWORDS = {
    "seoul": "서울특별시 자치구의회의원 지역구·선거구 획정 조례",
    "busan": "부산광역시 자치구·군의회의원 선거구에 관한 조례",
    "daegu": "대구광역시 자치구·군의회의원 선거구에 관한 조례",
    "incheon": "인천광역시 자치구·군의회의원 선거구에 관한 조례",
    "gwangju": "광주광역시 자치구의회의원 선거구에 관한 조례",
    "daejeon": "대전광역시 자치구의회의원 선거구에 관한 조례",
    "ulsan": "울산광역시 자치구·군의회의원 선거구에 관한 조례",
    "gyeonggi": "경기도 시·군의회 의원정수와 지역구 시·군의원 선거구에 관한 조례",
    "chungbuk": "충청북도 시·군의회의원 선거구에 관한 조례",
    "chungnam": "충청남도 시·군의회의원 선거구에 관한 조례",
    "jeonbuk": "전북특별자치도 시·군의회의원 선거구에 관한 조례",
    "jeonnam": "전라남도 시·군의회의원 선거구에 관한 조례",
    "gyeongbuk": "경상북도 시·군의회의원 선거구에 관한 조례",
    "gyeongnam": "경상남도 시·군의회의원 선거구에 관한 조례",
    "gangwon": "강원특별자치도 시·군의회의원 선거구에 관한 조례",
}


def fetch_ordinance_list():
    """법제처 API에서 시도별 기초의원 선거구 조례 목록 조회"""
    import urllib.request
    import urllib.parse

    results = {}
    for sido_key, (code, name) in SIDO_MAP.items():
        # 시도별 검색어
        queries = [
            f"{name} 의회의원 선거구",
            f"{name} 시군의회",
        ]
        for query in queries:
            encoded = urllib.parse.quote(query)
            url = f"https://www.law.go.kr/DRF/lawSearch.do?OC=test&target=ordin&type=JSON&query={encoded}"
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
                with urllib.request.urlopen(req, timeout=10) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                    if "OrdinSearch" in data:
                        items = data["OrdinSearch"]
                        if isinstance(items, dict):
                            items = [items]
                        for item in items:
                            mst = item.get("조례규칙ID", "")
                            name_ord = item.get("조례규칙명", "")
                            if "선거구" in name_ord and "의원" in name_ord:
                                results[sido_key] = {
                                    "mst": mst,
                                    "name": name_ord,
                                    "sido": name,
                                }
                                print(f"  ✓ {name}: {name_ord} (MST: {mst})")
                                break
                        if sido_key in results:
                            break
            except Exception as e:
                print(f"  ✗ {name} 검색 실패: {e}")
                continue

        if sido_key not in results:
            print(f"  ⚠ {name}: 조례 미발견")

    return results


def parse_ordinance_text(text, sido_key):
    """조례 텍스트에서 선거구별 읍면동 + 정수 추출

    일반적인 조례 별표 형식:
    시군구명 | 선거구명 | 정수 | 관할 읍면동
    영암군  | 가선거구 | 3   | 영암읍
    영암군  | 나선거구 | 2   | 삼호읍, 학산면
    """
    districts = []
    current_sigungu = None

    lines = text.split("\n")
    for line in lines:
        line = line.strip()
        if not line:
            continue

        # 시군구명 감지 (XX시, XX군, XX구)
        sgg_match = re.match(r"^([\uac00-\ud7af]+(?:시|군|구))\s", line)
        if sgg_match:
            current_sigungu = sgg_match.group(1)

        # 선거구 패턴: "가선거구", "제1선거구", "나선거구" 등
        dist_match = re.search(
            r"((?:가|나|다|라|마|바|사|아|자|차|카|타|파|하|제?\d+)\s*선거구)",
            line,
        )
        if dist_match and current_sigungu:
            dist_name = dist_match.group(1).strip()

            # 정수 추출
            seats_match = re.search(r"(\d+)\s*(?:인|명|석)", line)
            seats = int(seats_match.group(1)) if seats_match else 2

            # 읍면동 추출 (선거구명 뒤의 텍스트에서)
            after = line[dist_match.end() :]
            # 정수 부분 제거
            after = re.sub(r"\d+\s*(?:인|명|석)", "", after)
            dongs = [
                d.strip()
                for d in re.split(r"[,，、·ㆍ]", after)
                if d.strip() and re.search(r"(동|읍|면|리|가|로)$", d.strip())
            ]

            if dongs:
                districts.append(
                    {
                        "sigungu": current_sigungu,
                        "name": f"{current_sigungu} {dist_name}",
                        "seats": seats,
                        "dongs": dongs,
                    }
                )

    return districts


def load_manual_mapping(sido_key):
    """수동 매핑 JSON 로드 (조례 API 접근 불가 시 대안)"""
    path = DATA_DIR / f"basic_district_mapping_{sido_key}.json"
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return None


def save_mapping(sido_key, data):
    """매핑 데이터 저장"""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    path = DATA_DIR / f"basic_district_mapping_{sido_key}.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"  → 저장: {path.name}")


def main():
    import argparse

    parser = argparse.ArgumentParser(description="기초의원 선거구 조례 파싱")
    parser.add_argument(
        "--sido", default="seoul", help="시도 키 (예: seoul, all)"
    )
    parser.add_argument(
        "--fetch-list", action="store_true", help="법제처 API에서 조례 목록 조회"
    )
    args = parser.parse_args()

    if args.fetch_list:
        print("법제처 API 조례 목록 조회 중...")
        results = fetch_ordinance_list()
        save_path = DATA_DIR / "ordinance_list.json"
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        with open(save_path, "w", encoding="utf-8") as f:
            json.dump(results, f, ensure_ascii=False, indent=2)
        print(f"\n총 {len(results)}개 시도 조례 발견 → {save_path}")
        return

    print("기초의원 선거구 조례 파싱")
    print("=" * 60)
    if args.sido == "all":
        for key in SIDO_MAP:
            mapping = load_manual_mapping(key)
            if mapping:
                print(f"  ✓ {SIDO_MAP[key][1]}: {len(mapping.get('districts', []))}개 선거구")
            else:
                print(f"  ⚠ {SIDO_MAP[key][1]}: 매핑 파일 없음")
    else:
        if args.sido not in SIDO_MAP:
            print(f"✗ 알 수 없는 시도: {args.sido}")
            sys.exit(1)
        mapping = load_manual_mapping(args.sido)
        if mapping:
            print(f"매핑 로드 완료: {len(mapping.get('districts', []))}개 선거구")
        else:
            print(f"매핑 파일 없음. --fetch-list로 조례 목록을 먼저 조회하세요.")


if __name__ == "__main__":
    main()
