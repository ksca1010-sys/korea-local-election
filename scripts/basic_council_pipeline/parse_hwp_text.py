#!/usr/bin/env python3
"""
기초의원 선거구 조례 HWP 텍스트 파서 (v4 - 통합)

HWP에서 추출한 별표2 텍스트 파일을 파싱하여
basic_district_mapping_{sido_key}.json 파일로 저장

각 시도별 텍스트 형식 차이를 통합 처리:
- 부산: "중구가선거구" (시군구+가선거구 결합)
- 대구: "중구 가선거구" (시군구 + 가선거구 분리)
- 경기: 별도 줄 형식 (시군명/선거구명/정수/구역)
- 인천: "(7) (1) (6)" 총계 라인 + "가선거구 3 동..."
- 광주/대전: 테이블 형식 + 소계/합계
- 충북/경북: '"가"선거구' 따옴표 형식
- 충남: "천안시 가" (시군 + 가/나)
- 전북: "전주시가선거구" (시+가선거구 결합) + 의회의원 헤더
- 전남/경남: 기존 파서로 처리 완료
- 강원: "가선거구" (시군명 별도 줄)
- 울산: 시군구명 + "가선거구" 형식

사용법:
    python parse_hwp_text.py --sido all
    python parse_hwp_text.py --sido gyeonggi
"""

import json
import re
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
DATA_DIR = PROJECT_ROOT / "data" / "basic_council"
TXT_DIR = DATA_DIR / "ordinances" / "attachments" / "txt"

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

# 선거구 가나다 패턴
GANADARA = "가나다라마바사아자차카타파하"

def is_sigungu_name(text):
    """시군구명 여부 판별"""
    text = text.strip().replace(" ", "").replace("·", "").replace("‧", "").replace("․", "")
    if re.match(r'^[가-힣]+(시|군|구)$', text):
        # 선거구명 아닌지 확인
        if '선거구' in text:
            return False
        if len(text) <= 1:
            return False
        return True
    return False


def is_district_line(text):
    """선거구명 포함 여부"""
    return '선거구' in text and ('가선거구' in text or '나선거구' in text or
           '다선거구' in text or '라선거구' in text or '마선거구' in text or
           '바선거구' in text or '사선거구' in text or '아선거구' in text or
           '자선거구' in text or '차선거구' in text or '카선거구' in text or
           '타선거구' in text or '파선거구' in text or '하선거구' in text or
           re.search(r'제?\d+선거구', text))


def is_header_line(text):
    """헤더/메타 라인 여부"""
    keywords = ['별표', '선거구명', '의원정수', '선거구역', '구 분', '구분',
                '비 고', '비고', '합 계', '합계', '총계', '총 계',
                '선출인원', '계\n', '단위', '명칭', '구역표',
                '지역선거구', '조례', '관련', '개정', '시군명',
                '시군별', '자치구별', '의원 정수', '시·군', '시․군',
                '선 거 구 역', '지역구선출']
    for kw in keywords:
        if kw in text:
            return True
    return False


def is_number_only(text):
    """숫자만 있는 라인"""
    return bool(re.match(r'^\d+$', text.strip()))


def is_sokeye_line(text):
    """소계 라인"""
    return bool(re.match(r'^소\s*계', text.strip()))


def is_dong_list(text):
    """읍면동 목록인지"""
    text = text.strip()
    if not text:
        return False
    # 동, 읍, 면으로 끝나는 단어가 있으면
    parts = re.split(r'[,，、·ㆍ\s]+', text)
    dong_count = sum(1 for p in parts if p.strip() and
                     re.search(r'(동|읍|면|가|리|로)$', p.strip()))
    return dong_count > 0


def extract_dong_names(text):
    """텍스트에서 읍면동 이름 추출"""
    text = text.strip().rstrip(',').rstrip('，')
    parts = re.split(r'[,，、]+', text)
    dongs = []
    for p in parts:
        p = p.strip()
        if not p:
            continue
        # 괄호 내용 처리 (ex: "장량동(양덕동)")
        p = re.sub(r'\s+', '', p)
        if re.search(r'(동|읍|면|가|리|로)[\)）]?$', p):
            dongs.append(p)
        elif re.search(r'(동|읍|면|가|리|로)\(', p):
            dongs.append(p)
    return dongs


def extract_district_name_parts(text):
    """선거구명에서 시군구명과 선거구 분리

    Returns: (sigungu, district_letter, full_name) or None
    """
    text = text.strip().replace('"', '').replace('"', '').replace('"', '').replace("'", '')

    # "전주시가선거구", "중구가선거구", "해운대구가선거구"
    m = re.match(r'^([가-힣]+(?:시|군|구))\s*["\']?\s*([가-힣])\s*["\']?\s*선거구', text)
    if m:
        return m.group(1), m.group(2), f"{m.group(1)} {m.group(2)}선거구"

    # "포항시"가"선거구", 청주시 "가"선거구
    m = re.match(r'^([가-힣]+(?:시|군|구))\s*[""「]\s*([가-힣])\s*[""」]\s*선거구', text)
    if m:
        return m.group(1), m.group(2), f"{m.group(1)} {m.group(2)}선거구"

    # "천안시 가" (충남 스타일 - 선거구 없이)
    m = re.match(r'^([가-힣]+(?:시|군|구))\s+([가-힣])$', text)
    if m and m.group(2) in GANADARA:
        return m.group(1), m.group(2), f"{m.group(1)} {m.group(2)}선거구"

    # "가선거구" (시군구명 없음 - context에서 가져옴)
    m = re.match(r'^([가-힣])\s*선거구', text)
    if m and m.group(1) in GANADARA:
        return None, m.group(1), f"{m.group(1)}선거구"

    # 제N선거구
    m = re.match(r'^([가-힣]+(?:시|군|구))?\s*제?(\d+)\s*선거구', text)
    if m:
        sgg = m.group(1)
        num = m.group(2)
        name = f"제{num}선거구"
        if sgg:
            name = f"{sgg} {name}"
        return sgg, f"제{num}", name

    return None


def parse_text_universal(lines, sido_key):
    """통합 텍스트 파서

    모든 시도의 텍스트 형식을 처리하는 상태 머신 기반 파서
    """
    districts = []
    current_sigungu = None
    current_district = None
    current_seats = None
    current_dongs = []

    # 멀티라인 시군구명 버퍼 (부산: "해운\n대구" → "해운대구")
    pending_sigungu_fragment = None

    # 전처리: 특수 따옴표 정규화
    lines = [l.replace('\u201c', '"').replace('\u201d', '"')
              .replace('\u2018', "'").replace('\u2019', "'")
              .replace('\u300c', '"').replace('\u300d', '"')
             for l in lines]

    i = 0
    while i < len(lines):
        line = lines[i].strip()
        i += 1

        if not line:
            continue

        # 헤더/메타 라인 스킵
        if is_header_line(line):
            pending_sigungu_fragment = None
            continue

        # "소 계" 또는 "소계" 라인 - 다음 숫자도 스킵
        if is_sokeye_line(line):
            # 소계 뒤에 숫자가 같은 줄에 있을 수 있음
            if i < len(lines) and is_number_only(lines[i].strip()):
                i += 1  # 소계 숫자 스킵
            # 추가로 "N개 선거구" 같은 설명도 스킵
            if i < len(lines) and re.match(r'^\d+개\s*선거구', lines[i].strip()):
                i += 1
            continue

        # 비례/지역구 총계 라인 스킵 (인천: "(7) (1) (6)")
        if re.match(r'^\(\d+\)$', line):
            continue
        if re.match(r'^\(\d+\)\s+\(\d+\)\s+\(\d+\)', line):
            continue

        # "의원정수 N (지역구 N, 비례대표 N)" 스킵
        if re.match(r'^의원정수\s+\d+', line):
            continue

        # "N개 읍·면·동" 스킵
        if re.match(r'^\d+개\s*(읍|면|동)', line):
            continue

        # 의회의원 헤더 (전북: "전주시의회의원(지역구 : 31)")
        m = re.match(r'^([가-힣]+(?:시|군))\s*의회의원', line)
        if m:
            # 이전 선거구 저장
            _save_district(districts, current_sigungu, current_district, current_seats, current_dongs)
            current_district = None
            current_seats = None
            current_dongs = []
            current_sigungu = m.group(1)
            continue

        # 시도 의원정수 헤더 (경북: "포항시 의원정수 33명(비례대표 4, 지역구 29)")
        m = re.match(r'^([가-힣]+(?:시|군))\s*의원정수', line)
        if m:
            _save_district(districts, current_sigungu, current_district, current_seats, current_dongs)
            current_district = None
            current_seats = None
            current_dongs = []
            current_sigungu = m.group(1)
            continue

        # 선거구명 탐지
        # 먼저 "시군구선거구 N 동목록" 인라인 패턴 (광주/대전/인천 등)
        inline_match = re.match(
            r'^(?:([가-힣]+(?:시|군|구))\s*)?["""]?\s*([가-힣])\s*["""]?\s*선거구\s+(\d+)\s+(.+)',
            line
        )
        if not inline_match:
            # "가선거구\n3\n동목록" 분리 패턴
            inline_match = re.match(
                r'^(?:([가-힣]+(?:시|군|구))\s*)?["""]?\s*([가-힣])\s*["""]?\s*선거구\s+(\d+)\s*$',
                line
            )
            if inline_match:
                # 정수만 같은 줄, 동 목록은 다음 줄
                pass

        # 선거구명 감지 (다양한 형식)
        dist_parts = None

        # 인라인 전체 (광주/대전: "가선거구 3 동1, 동2, 동3")
        m_full = re.match(
            r'^(?:([가-힣]+(?:시|군|구))\s*)?["""\']?\s*([가-힣])\s*["""\']?\s*선거구\s+(\d+)\s+(.+)',
            line
        )
        if m_full:
            _save_district(districts, current_sigungu, current_district, current_seats, current_dongs)
            sgg = m_full.group(1)
            if sgg:
                current_sigungu = sgg
            letter = m_full.group(2)
            current_seats = int(m_full.group(3))
            dong_text = m_full.group(4).strip()
            if current_sigungu:
                current_district = f"{current_sigungu} {letter}선거구"
            else:
                current_district = f"{letter}선거구"
            current_dongs = extract_dong_names(dong_text)
            continue

        # "충남 스타일" 인라인: "천안시 가 2 동1, 동2"
        m_chungnam = re.match(
            r'^([가-힣]+(?:시|군|구))\s+([가-힣])\s+(\d+)\s+(.+)',
            line
        )
        if m_chungnam and m_chungnam.group(2) in GANADARA:
            _save_district(districts, current_sigungu, current_district, current_seats, current_dongs)
            current_sigungu = m_chungnam.group(1)
            letter = m_chungnam.group(2)
            current_seats = int(m_chungnam.group(3))
            dong_text = m_chungnam.group(4).strip()
            current_district = f"{current_sigungu} {letter}선거구"
            current_dongs = extract_dong_names(dong_text)
            continue

        # "충남 스타일" 분리: "천안시 가\n2\n동목록"
        m_chungnam2 = re.match(r'^([가-힣]+(?:시|군|구))\s+([가-힣])\s*$', line)
        if m_chungnam2 and m_chungnam2.group(2) in GANADARA:
            _save_district(districts, current_sigungu, current_district, current_seats, current_dongs)
            current_sigungu = m_chungnam2.group(1)
            letter = m_chungnam2.group(2)
            current_district = f"{current_sigungu} {letter}선거구"
            current_seats = None
            current_dongs = []
            continue

        # 선거구명만 있는 줄 ("가선거구", "중구가선거구", '포항시"가"선거구' 등)
        line_cleaned = line.replace('"', '"').replace('"', '"').replace("'", '"')
        m_dist = re.match(
            r'^([가-힣]+(?:시|군|구))?\s*"?\s*([가-힣])\s*"?\s*선거구\s*$',
            line_cleaned
        )
        if not m_dist:
            # 제N선거구
            m_dist = re.match(r'^([가-힣]+(?:시|군|구))?\s*제?(\d+)\s*선거구\s*$', line_cleaned)

        if m_dist:
            _save_district(districts, current_sigungu, current_district, current_seats, current_dongs)
            sgg = m_dist.group(1)
            if sgg:
                current_sigungu = sgg
            letter = m_dist.group(2)
            if current_sigungu:
                current_district = f"{current_sigungu} {letter}선거구"
            else:
                current_district = f"{letter}선거구"
            current_seats = None
            current_dongs = []
            continue

        # "다선거거" 오타 (강원: "다선거거")
        m_typo = re.match(r'^([가-힣]+(?:시|군|구))?\s*([가-힣])\s*선거거\s*$', line)
        if m_typo:
            _save_district(districts, current_sigungu, current_district, current_seats, current_dongs)
            sgg = m_typo.group(1)
            if sgg:
                current_sigungu = sgg
            letter = m_typo.group(2)
            if current_sigungu:
                current_district = f"{current_sigungu} {letter}선거구"
            else:
                current_district = f"{letter}선거구"
            current_seats = None
            current_dongs = []
            continue

        # 시군구명 단독 줄 감지 (선거구명이 아닌 경우)
        # 멀티라인 시군구 처리 (부산: "해운\n대구", "부산\n진구")
        clean = line.replace(" ", "").replace("·", "").replace("‧", "").replace("․", "")

        # 멀티라인 시군구 pending 처리 (부산: "해운\n대구" → "해운대구")
        if pending_sigungu_fragment:
            combined = pending_sigungu_fragment + clean
            if is_sigungu_name(combined):
                _save_district(districts, current_sigungu, current_district, current_seats, current_dongs)
                current_district = None
                current_seats = None
                current_dongs = []
                current_sigungu = combined
                pending_sigungu_fragment = None
                continue
            else:
                pending_sigungu_fragment = None

        # 시군구명 먼저 체크 (fragment보다 우선)
        if is_sigungu_name(clean) and not is_district_line(line):
            _save_district(districts, current_sigungu, current_district, current_seats, current_dongs)
            current_district = None
            current_seats = None
            current_dongs = []
            current_sigungu = clean
            pending_sigungu_fragment = None
            continue

        # 1-3글자 한글 fragment 후보 (시군구 접미사 없는 경우만)
        if re.match(r'^[가-힣]{1,3}$', clean) and not is_dong_list(line) and current_district is None:
            if not re.match(r'^(계|명|인|석)$', clean) and not is_sigungu_name(clean):
                pending_sigungu_fragment = clean
                continue

        # 숫자만 있는 줄 - 정수 또는 스킵 대상
        if is_number_only(line):
            num = int(line.strip())
            if current_district and current_seats is None and 1 <= num <= 6:
                current_seats = num
                continue
            # 소계 숫자 등은 무시
            continue

        # 동 목록 줄 (현재 선거구가 있으면 추가)
        if current_district and is_dong_list(line):
            new_dongs = extract_dong_names(line)
            if new_dongs:
                current_dongs.extend(new_dongs)
            continue

        # 구역 데이터가 아닌 기타 텍스트 (비고 등) → 무시

    # 마지막 선거구 저장
    _save_district(districts, current_sigungu, current_district, current_seats, current_dongs)

    return districts


def _save_district(districts, sigungu, district_name, seats, dongs):
    """선거구 데이터 저장"""
    if not district_name or not dongs:
        return
    if not sigungu:
        return

    # 시군구명 정규화
    sigungu = sigungu.replace(" ", "")

    # 정수 기본값
    if seats is None:
        seats = 2

    districts.append({
        "sigungu": sigungu,
        "name": district_name.replace("  ", " "),
        "seats": seats,
        "dongs": dongs,
    })


def parse_sido(sido_key):
    """시도별 텍스트 파싱"""
    txt_path = TXT_DIR / f"{sido_key}_byulpyo2.txt"
    if not txt_path.exists():
        print(f"  ✗ 텍스트 파일 없음: {txt_path.name}")
        return None

    with open(txt_path, "r", encoding="utf-8") as f:
        text = f.read()

    lines = text.split("\n")
    districts = parse_text_universal(lines, sido_key)

    if not districts:
        print(f"  ✗ {SIDO_MAP[sido_key][1]}: 파싱 결과 없음")
        return None

    # 시군구 목록
    sigungus = sorted(set(d["sigungu"] for d in districts))
    total_seats = sum(d["seats"] for d in districts)

    result = {
        "sido": SIDO_MAP[sido_key][1],
        "sido_code": SIDO_MAP[sido_key][0],
        "total_districts": len(districts),
        "total_sigungus": len(sigungus),
        "total_seats": total_seats,
        "sigungus": sigungus,
        "districts": districts,
    }

    return result


def save_mapping(sido_key, data):
    """매핑 데이터 저장"""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    path = DATA_DIR / f"basic_district_mapping_{sido_key}.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def main():
    import argparse
    parser = argparse.ArgumentParser(description="기초의원 선거구 HWP 텍스트 파서 v4")
    parser.add_argument("--sido", default="all", help="시도 키 (예: gyeonggi, all)")
    parser.add_argument("--dry-run", action="store_true", help="저장 없이 결과만 출력")
    args = parser.parse_args()

    targets = list(SIDO_MAP.keys()) if args.sido == "all" else [args.sido]

    total_districts = 0
    total_seats = 0
    success_count = 0

    for sido_key in targets:
        if sido_key == "seoul":
            # 서울은 XML 파싱 결과 사용
            existing = DATA_DIR / f"basic_district_mapping_seoul.json"
            if existing.exists():
                with open(existing) as f:
                    data = json.load(f)
                n = len(data.get("districts", []))
                s = sum(d.get("seats", 2) for d in data.get("districts", []))
                print(f"  ✓ 서울특별시: {n}개 선거구, {s}석 (기존 XML 파싱)")
                total_districts += n
                total_seats += s
                success_count += 1
            continue

        if sido_key not in SIDO_MAP:
            print(f"  ✗ 알 수 없는 시도: {sido_key}")
            continue

        result = parse_sido(sido_key)
        if result:
            n = result["total_districts"]
            s = result["total_seats"]
            sgg = result["total_sigungus"]
            print(f"  ✓ {result['sido']}: {n}개 선거구, {s}석 ({sgg}개 시군구)")

            if not args.dry_run:
                save_mapping(sido_key, result)

            total_districts += n
            total_seats += s
            success_count += 1
        else:
            print(f"  ✗ {SIDO_MAP[sido_key][1]}: 실패")

    print(f"\n{'='*60}")
    print(f"합계: {success_count}/{len(targets)}개 시도, {total_districts}개 선거구, {total_seats}석")


if __name__ == "__main__":
    main()
