#!/usr/bin/env python3
"""
공직선거법 별표2 (시·도의회의원지역선거구구역표) PDF 텍스트 파싱

pdftotext -layout 으로 추출한 텍스트를 파싱하여
시도별 district_mapping JSON 파일 생성

핵심 패턴 (레이아웃 텍스트):
  테이블에서 선거구명(왼쪽 컬럼)과 행정동(오른쪽 컬럼)이 교차 배치됨.
  행정동이 선거구번호보다 먼저 나오는 경우가 많음.

  패턴A: "시군구명" → "행정동목록" → "제N선거구"
  패턴B: "시군구명 제" → "N선거구" + "행정동목록"
  패턴C: "시군구 제 행정동1, 행정동2,..." → "N선거구  행정동3, 행정동4"

사용법:
    pdftotext -layout 별표2.pdf /tmp/byulpyo2_layout.txt
    python parse_byulpyo2.py /tmp/byulpyo2_layout.txt
"""

import json
import re
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
OUTPUT_DIR = PROJECT_ROOT / "data" / "council"

SIDO_HEADERS = {
    "서울특별시의회의원": ("seoul", "서울특별시"),
    "부산광역시의회의원": ("busan", "부산광역시"),
    "대구광역시의회의원": ("daegu", "대구광역시"),
    "인천광역시의회의원": ("incheon", "인천광역시"),
    "광주광역시의회의원": ("gwangju", "광주광역시"),
    "대전광역시의회의원": ("daejeon", "대전광역시"),
    "울산광역시의회의원": ("ulsan", "울산광역시"),
    "경기도의회의원": ("gyeonggi", "경기도"),
    "강원도의회의원": ("gangwon", "강원특별자치도"),
    "충청북도의회의원": ("chungbuk", "충청북도"),
    "충청남도의회의원": ("chungnam", "충청남도"),
    "전북특별자치도의회의원": ("jeonbuk", "전북특별자치도"),
    "전라남도의회의원": ("jeonnam", "전라남도"),
    "경상북도의회의원": ("gyeongbuk", "경상북도"),
    "경상남도의회의원": ("gyeongnam", "경상남도"),
}

SIDO_CODES = {
    "seoul": "11", "busan": "26", "daegu": "27", "incheon": "28",
    "gwangju": "29", "daejeon": "30", "ulsan": "31",
    "gyeonggi": "41", "gangwon": "51", "chungbuk": "43", "chungnam": "44",
    "jeonbuk": "52", "jeonnam": "46", "gyeongbuk": "47", "gyeongnam": "48",
}


def collapse_spaces(text):
    """한글 글자 사이 단일 공백 제거"""
    return re.sub(r"(?<=[\uac00-\ud7af])\s(?=[\uac00-\ud7af])", "", text)


def classify_line(line):
    """줄 분류: 'name_part', 'dong', 'mixed', 'header', 'empty'"""
    stripped = line.strip()
    if not stripped:
        return "empty", stripped

    collapsed = collapse_spaces(stripped)

    # 시도 헤더
    for h in SIDO_HEADERS:
        if h in collapsed:
            return "header", stripped
    if collapsed in ("선거구명", "선거구역"):
        return "header", stripped

    # 공백 완전 제거 버전 (숫자+한글 사이 공백도 처리)
    no_space = re.sub(r"\s+", "", stripped)
    has_num = bool(re.search(r"\d+선거구", no_space))
    # 숫자 없는 "선거구" (예: "화천군 선거구", "선 거 구")
    has_plain_sgg = bool(re.search(r"선거구$", no_space)) and not has_num
    has_comma = "," in stripped
    has_ilwon = "일원" in stripped

    if has_num and (has_comma or has_ilwon):
        return "mixed", stripped
    if has_num:
        return "name_num", stripped
    if has_plain_sgg:
        # "선거구" 단독 또는 "거구" (줄바꿈으로 "선\n거 구" 됨)
        return "name_plain_sgg", stripped
    if has_comma or has_ilwon:
        return "dong", stripped
    # "거 구" 같은 줄바꿈 잔재 체크
    if re.match(r"^\s*거\s*구\s*$", stripped):
        return "name_plain_sgg", stripped
    # 들여쓰기가 8칸 이상이면 행정동 (단일 동, 콤마 없음)
    indent = len(line) - len(line.lstrip()) if line else 0
    if indent >= 8:
        return "dong", stripped
    # 시군구명 또는 시군구명+제/선 (예: "종 로 구", "인 제 군 선")
    return "name_sgg", stripped


def parse_dong_text(text):
    """콤마 구분 행정동 텍스트를 리스트로"""
    dongs = []
    for item in text.split(","):
        item = item.strip()
        if item:
            dongs.append(item)
    return dongs


def parse_layout_text(filepath):
    """메인 파싱"""
    with open(filepath, "r", encoding="utf-8") as f:
        lines = f.readlines()

    # 시도별 라인 범위
    sido_ranges = []
    for i, line in enumerate(lines):
        nospace = line.replace(" ", "")
        for header_key in SIDO_HEADERS:
            if header_key in nospace:
                m = re.search(r"지역구\s*[:：]\s*(\d+)", line)
                seats = int(m.group(1)) if m else 0
                sido_ranges.append((i, header_key, seats))
                break

    all_results = {}
    for idx, (start_line, header_key, seats) in enumerate(sido_ranges):
        end_line = sido_ranges[idx + 1][0] if idx + 1 < len(sido_ranges) else len(lines)
        sido_key, sido_name = SIDO_HEADERS[header_key]
        block = lines[start_line + 1:end_line]
        districts = parse_block(block)

        all_results[sido_key] = {
            "sido": sido_name,
            "sido_code": SIDO_CODES[sido_key],
            "total_seats": seats,
            "districts": districts,
        }
        diff = seats - len(districts)
        status = "✓" if diff == 0 else f"⚠ 누락 {diff}"
        print(f"  {sido_name}: {len(districts)}/{seats} {status}")

    return all_results


def parse_block(lines):
    """
    상태 기계로 선거구-행정동 파싱.

    핵심 관찰:
    - 각 선거구는 (시군구명, 번호, 행정동목록) 3요소로 구성
    - 시군구명은 name_sgg 라인으로 나옴
    - 번호는 name_num 라인에 "N선거구" 형태
    - 행정동은 dong 라인에 콤마 구분
    - mixed 라인은 name_num + dong이 합쳐진 것

    줄 순서 패턴 (가장 흔한):
      name_sgg → dong → name_num   (시군구명 → 행정동 → 번호)
      name_sgg → name_num → dong   (시군구명 → 번호 → 행정동)
      mixed (번호+행정동이 한 줄)

    전략:
    - name_sgg가 나오면 현재 시군구 업데이트
    - dong이 나오면 현재 행정동 버퍼에 추가
    - name_num이 나오면: 시군구 + 번호 = 선거구명 완성, 버퍼의 행정동과 매칭
    """
    districts = []
    current_sgg = ""        # 현재 시군구명
    pending_sgg = ""        # 다음 선거구의 시군구명 (아직 번호 안 나옴)
    pending_dongs = []      # 번호 나오기 전 수집된 행정동
    last_type = ""

    for line in lines:
        ltype, content = classify_line(line)

        if ltype == "empty" or ltype == "header":
            continue

        if ltype == "name_sgg":
            # 시군구명 (혹은 시군구명+제/선)
            collapsed = collapse_spaces(content)
            # "제" 또는 "선" 으로 끝나면 제거 (다음 줄에 이어짐)
            collapsed = re.sub(r"[제선]$", "", collapsed).strip()
            if collapsed:
                pending_sgg = collapsed
                current_sgg = collapsed
            last_type = "name_sgg"
            continue

        if ltype == "name_plain_sgg":
            # 숫자 없는 "선거구" 또는 "거구" (XX군 선거구 패턴)
            # 이전 pending_dongs를 이 선거구에 연결
            sgg = pending_sgg or current_sgg
            name = f"{sgg} 선거구"
            dongs = pending_dongs

            if dongs:
                districts.append({
                    "name": name,
                    "sigungu": sgg,
                    "dongs": dongs,
                })

            pending_dongs = []
            last_type = "name_plain_sgg"
            continue

        if ltype == "dong":
            # 행정동 목록
            dong_list = parse_dong_text(content)
            if last_type in ("name_num", "name_plain_sgg"):
                # 이전 선거구 번호 이후의 dong → 이전 선거구에 추가
                if districts:
                    districts[-1]["dongs"].extend(dong_list)
                else:
                    pending_dongs.extend(dong_list)
            else:
                # 번호 전에 나온 dong → 버퍼에 저장
                pending_dongs.extend(dong_list)
            last_type = "dong"
            continue

        if ltype == "name_num":
            # "제N선거구" 또는 "N선거구" 또는 "제 1선 거 구"
            no_sp = re.sub(r"\s+", "", content)
            # 번호 추출
            m = re.search(r"(?:제)?(\d+)선거구", no_sp)
            num = m.group(1) if m else ""

            # 번호 뒤에 행정동이 붙어있을 수 있음 (원본 content에서 "선거구" 이후)
            sgg_pos = content.find("선")
            # 원본에서 마지막 "구" 이후의 텍스트를 행정동으로
            after_match = ""
            for ci in range(len(content)-1, -1, -1):
                if content[ci] == '구' and ci > 0:
                    after_match = content[ci+1:].strip()
                    break
            extra_dongs = parse_dong_text(after_match) if "," in after_match else []

            # 선거구 확정
            sgg = pending_sgg or current_sgg
            name = f"{sgg} 제{num}선거구" if num else f"{sgg} 선거구"
            dongs = pending_dongs + extra_dongs

            if dongs:
                districts.append({
                    "name": name,
                    "sigungu": sgg,
                    "dongs": dongs,
                })
                pending_dongs = []
            else:
                # 행정동이 아직 안 나옴 → 다음 dong 줄을 기다림
                # 미리 선거구 등록하고 다음 dong에서 추가
                districts.append({
                    "name": name,
                    "sigungu": sgg,
                    "dongs": [],
                })
                pending_dongs = []

            last_type = "name_num"
            continue

        if ltype == "mixed":
            # 선거구번호 + 행정동이 한 줄에 혼재
            # 예: "종 로 구 제 종로1ㆍ2ㆍ3ㆍ4가동, 종로5ㆍ6가동, ..."
            # 또는: " 2선거구   창신제3동, 숭인제1동"
            collapsed = collapse_spaces(content)

            # 번호 찾기
            m = re.search(r"(?:제)?(\d+)선거구", collapsed)
            if not m:
                continue
            num = m.group(1)

            # 번호 앞부분에서 시군구명 추출 시도
            before = collapsed[:m.start()].strip()
            before_clean = re.sub(r"제$", "", before).strip()
            if before_clean and len(before_clean) >= 2:
                # "종로구" 같은 시군구명
                pending_sgg = before_clean
                current_sgg = before_clean

            # 번호 뒤에서 행정동 추출
            after = content[content.find("선거구") + 3:].strip() if "선거구" in content else ""
            dong_list = parse_dong_text(after) if "," in after else []

            # 번호 앞(원래 content 기준)에서도 행정동 추출
            # mixed에서는 before 부분에 행정동이 섞여있을 수 있음
            # 콤마가 있으면 시군구명+행정동 혼재
            raw_before_num = content[:content.find(m.group(0))].strip()
            if "," in raw_before_num:
                # 시군구명 제거 후 행정동만 추출
                # "종 로 구 제 종로1ㆍ2ㆍ3ㆍ4가동, 종로5ㆍ6가동, 이화동"
                # → 시군구: "종로구", 행정동: "종로1ㆍ2ㆍ3ㆍ4가동, 종로5ㆍ6가동, ..."
                # 첫 번째 콤마 위치 이전에서 시군구 + 첫 번째 동을 분리
                first_comma = raw_before_num.find(",")
                first_part = raw_before_num[:first_comma].strip()
                rest = raw_before_num[first_comma + 1:].strip()
                # first_part에서 시군구명과 첫 번째 동 분리
                # 행정동은 보통 "동", "읍", "면", "리"로 끝남
                dm = re.search(r"([\uac00-\ud7af0-9ㆍ·]+(?:동|읍|면|리|가동|원))\s*$", first_part)
                if dm:
                    first_dong = dm.group(1)
                    pre_dongs = [first_dong] + parse_dong_text(rest)
                else:
                    pre_dongs = parse_dong_text(raw_before_num)
                pending_dongs.extend(pre_dongs)

            sgg = pending_sgg or current_sgg
            name = f"{sgg} 제{num}선거구"
            dongs = pending_dongs + dong_list

            if dongs:
                districts.append({
                    "name": name,
                    "sigungu": sgg,
                    "dongs": dongs,
                })

            pending_dongs = []
            last_type = "mixed"
            continue

    # 마지막 미처리 데이터
    if pending_dongs and current_sgg:
        # "XX군 선거구" 같은 단일 선거구 케이스
        name = f"{current_sgg} 선거구"
        districts.append({
            "name": name,
            "sigungu": current_sgg,
            "dongs": pending_dongs,
        })

    return districts


def save_results(all_results):
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for sido_key, data in all_results.items():
        output_path = OUTPUT_DIR / f"district_mapping_{sido_key}.json"
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"  저장: {output_path.name} ({len(data['districts'])}개)")


def main():
    if len(sys.argv) < 2:
        print("사용법: python parse_byulpyo2.py <별표2_layout_텍스트파일>")
        print("  먼저: pdftotext -layout 별표2.pdf output.txt")
        sys.exit(1)

    filepath = sys.argv[1]
    print(f"파싱 시작: {filepath}")
    print("=" * 60)

    all_results = parse_layout_text(filepath)

    print()
    print("=" * 60)
    print("JSON 저장 중...")
    save_results(all_results)

    print()
    total = sum(len(d["districts"]) for d in all_results.values())
    total_seats = sum(d["total_seats"] for d in all_results.values())
    print("=" * 60)
    print(f"완료: {len(all_results)}개 시도, 총 {total}/{total_seats} 선거구 파싱")
    if total != total_seats:
        print(f"  ⚠ {total_seats - total}개 누락")


if __name__ == "__main__":
    main()
