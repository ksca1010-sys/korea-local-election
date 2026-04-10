#!/usr/bin/env python3
"""
개요 narrative에서 발견된 후보자 — 갭 리포트 (기본 dry-run)

용도:
  개요 AI가 생성한 narrative를 정규식으로 스캔해서,
  현재 mayor_candidates.json에 없는 인물을 "발견 리포트"로 출력.
  어떤 후보가 팩트체크 레이더에서 누락됐는지 운영자가 확인하는 도구.

⚠ 헌법 §2 경고
  narrative는 LLM(Claude)이 생성한 텍스트이므로, 여기서 뽑은 이름은
  사실관계가 보장되지 않는다. --apply 경로로 DB에 직접 주입하면
  "개요 → 후보 → 다음 개요" 피드백 루프로 허위가 자기강화될 수 있다.
  따라서 CI에서는 기본(dry-run)으로만 실행하고, --apply는 운영자가
  수동으로 NEC 또는 공식 언론 소스와 교차검증한 뒤에만 사용한다.

사용법:
  python scripts/sync_overview_candidates.py
      → 발견 리포트만 출력 (DB 수정 없음)
  python scripts/sync_overview_candidates.py --apply --i-verified-with-nec
      → 운영자가 NEC 교차검증을 마쳤다고 선언한 경우에만 실제 적용
"""

import argparse
import json
import re
from datetime import date
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
OVERVIEW_PATH = BASE_DIR / "data" / "election_overview.json"
MAYOR_CANDIDATES_PATH = BASE_DIR / "data" / "candidates" / "mayor_candidates.json"

# 사람 이름이 아닌 것 필터 (false positive 방지용 블록리스트)
NOT_NAMES = {
    # 기존
    "야당", "여당", "선거는", "구청장", "군수", "시장", "후보", "현직",
    "반면", "동시에", "내부에서", "민의힘의", "복수", "보좌관을", "재선에",
    "야권", "여권", "민주당", "국민의힘", "무소속", "조국혁신당",
    "진보당", "개혁신당", "현직자", "도전자", "주민들",
    # 조사 후 normalize 결과로 자주 걸리는 일반명사
    "조사", "선거", "후보자", "시민", "국민", "의원", "대표",
    "위원", "당원", "주민", "유권자", "전직", "예비", "공천", "경선",
    "지지율", "지지도", "유력", "확실", "거론", "관측", "전망",
    "결과", "발표", "이번", "최근", "지난", "다음", "올해", "작년",
    "지역", "현안", "쟁점", "공약", "정책", "구도", "판세",
}

# 한국인 이름은 거의 2~3글자. 성(姓)으로 쓰이는 한글 문자 집합
COMMON_SURNAMES = set("김이박최정강조윤장임한오서신권황안송류전홍고문양손배백허유남심노하주우구신임나탁변")

# 이름 뒤에 자주 붙는 조사 — clean_name 에서 벗겨냄
NAME_PARTICLES_SINGLE = set("이가은는을를의도만")
NAME_PARTICLES_MULTI = ("에서", "에게", "부터", "까지", "으로", "처럼", "보다", "마저")


def clean_name(raw: str) -> str | None:
    """캡처된 문자열 뒤의 조사를 벗겨 2~3자 이름을 만들어 반환.

    "정성철이" → "정성철"    ("이" 주격조사)
    "황양득도" → "황양득"    ("도" 보조사)
    "조사에서" → "조사"      (→ 이후 NOT_NAMES/성씨 검사에서 탈락)
    "김영" → "김영"          (2자, 그대로)
    길이가 2~3자가 아니거나 불가능한 형태면 None.
    """
    if not raw:
        return None
    name = raw
    # 다자 조사 (에서, 에게 등) 먼저 — strip 후 최소 2자 남아야 함
    for p in NAME_PARTICLES_MULTI:
        if len(name) >= len(p) + 2 and name.endswith(p):
            name = name[:-len(p)]
            break
    # 단자 조사 — 오직 4자일 때만 벗김.
    # 이유: 한국 이름은 2~3자가 대부분이고 3자 이름의 마지막 글자가
    # "도/만" 같은 흔한 글자인 경우가 많아 (예: 김영만, 우건도) 3자에서
    # 단자 조사를 벗기면 멀쩡한 이름이 깎임.
    if len(name) == 4 and name[-1] in NAME_PARTICLES_SINGLE:
        name = name[:-1]
    if len(name) not in (2, 3):
        return None
    return name


def is_valid_name(raw: str) -> tuple[bool, str | None]:
    """(valid, cleaned_name) 반환. cleaned_name 은 조사 제거 후 값."""
    cleaned = clean_name(raw)
    if not cleaned:
        return False, None
    if cleaned in NOT_NAMES:
        return False, None
    if cleaned[0] not in COMMON_SURNAMES:
        return False, None
    return True, cleaned


def extract_candidates_from_narrative(narrative):
    """narrative 텍스트에서 후보자 이름+역할 추출"""
    candidates = []

    # 패턴 1: "OOO 예비후보", "OOO 전 시장" 등
    # 2~4자로 넓게 캡처한 뒤 clean_name 에서 조사 제거.
    patterns = [
        (r'([가-힣]{2,4})\s+(예비후보|예비 후보)', "DECLARED"),
        (r'([가-힣]{2,4})\s+전\s*(구청장|군수|시장|의원|의장|교육감)', "EXPECTED"),
        (r'([가-힣]{2,4})\s+현\s*(구청장|군수|시장)', None),  # 현직 → 이미 있을 것
        (r'([가-힣]{2,4})\s+(?:국민의힘|민주당|더불어민주당)\s*(?:후보|예비후보)', "DECLARED"),
    ]

    for pat, status in patterns:
        for m in re.finditer(pat, narrative):
            raw = m.group(1)
            valid, name = is_valid_name(raw)
            if valid and status:  # 현직은 스킵
                candidates.append({"name": name, "status": status, "context": m.group(0)})

    # 패턴 2: "OOO(국민의힘)" "OOO(민주당)"
    party_pattern = r'([가-힣]{2,4})\s*\((국민의힘|민주당|더불어민주당|무소속|조국혁신당|개혁신당|진보당)\)'
    PARTY_MAP = {
        "국민의힘": "ppp", "민주당": "democratic", "더불어민주당": "democratic",
        "무소속": "independent", "조국혁신당": "reform", "개혁신당": "newReform", "진보당": "progressive",
    }
    for m in re.finditer(party_pattern, narrative):
        raw = m.group(1)
        party = m.group(2)
        valid, name = is_valid_name(raw)
        if valid:
            candidates.append({
                "name": name, "status": "EXPECTED",
                "party": PARTY_MAP.get(party, "independent"),
                "context": m.group(0),
            })

    # 중복 제거 (이름 기준, 첫 번째 우선)
    seen = set()
    unique = []
    for c in candidates:
        if c["name"] not in seen:
            seen.add(c["name"])
            unique.append(c)
    return unique


def main():
    parser = argparse.ArgumentParser(
        description="개요 narrative 갭 리포트 — 기본 dry-run. "
                    "--apply는 헌법 §2 준수 선언(--i-verified-with-nec) 필요."
    )
    parser.add_argument("--apply", action="store_true",
                        help="실제 적용 (NEC 교차검증 선언 필요)")
    parser.add_argument("--i-verified-with-nec", action="store_true",
                        help="NEC 또는 공식 소스로 발견 후보를 교차검증했음을 선언")
    args = parser.parse_args()

    if args.apply and not args.i_verified_with_nec:
        print("[거부] --apply 는 --i-verified-with-nec 와 함께만 사용 가능합니다.")
        print("       이유: narrative는 LLM 생성물이라 헌법 §2에 따라 기본 불신.")
        print("       절차: 1) dry-run으로 발견 리포트 출력 →")
        print("             2) NEC 예비후보 API / 공식 언론사로 교차검증 →")
        print("             3) 검증된 경우에만 --apply --i-verified-with-nec 사용.")
        raise SystemExit(2)

    if args.apply and args.i_verified_with_nec:
        print("[경고] --apply 모드: narrative에서 추출한 후보를 DB에 주입합니다.")
        print("       운영자가 NEC 교차검증을 마쳤다고 선언했습니다.")

    overview = json.loads(OVERVIEW_PATH.read_text(encoding="utf-8"))
    mayor_data = json.loads(MAYOR_CANDIDATES_PATH.read_text(encoding="utf-8"))
    cands = mayor_data.get("candidates", {})

    total_found = 0
    total_added = 0

    for rk, districts in overview.get("mayor", {}).items():
        for dist, obj in districts.items():
            narr = obj.get("narrative", "")
            if not narr:
                continue

            # 현재 후보자 이름
            existing = {c["name"] for c in cands.get(rk, {}).get(dist, [])}

            # narrative에서 후보 추출
            found = extract_candidates_from_narrative(narr)
            new_candidates = [c for c in found if c["name"] not in existing]

            if not new_candidates:
                continue

            total_found += len(new_candidates)

            for nc in new_candidates:
                title = "구청장" if dist.endswith("구") else ("군수" if dist.endswith("군") else "시장")
                entry = {
                    "name": nc["name"],
                    "party": nc.get("party", "independent"),
                    "career": "",
                    "status": nc["status"],
                    "dataSource": "overview_narrative",
                    "pledges": [],
                }

                if args.apply:
                    if rk not in cands:
                        cands[rk] = {}
                    if dist not in cands[rk]:
                        cands[rk][dist] = []
                    cands[rk][dist].append(entry)
                    total_added += 1
                    print(f"  [추가] {rk}/{dist}: {nc['name']} ({nc['status']}) ← \"{nc['context']}\"")
                else:
                    print(f"  [발견] {rk}/{dist}: {nc['name']} ({nc['status']}) ← \"{nc['context']}\"")

    print(f"\n총 발견: {total_found}건")

    if args.apply and total_added > 0:
        mayor_data["_meta"]["lastUpdated"] = date.today().isoformat()
        mayor_data["_meta"]["lastSyncFromOverview"] = date.today().isoformat()
        MAYOR_CANDIDATES_PATH.write_text(
            json.dumps(mayor_data, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8"
        )
        print(f"적용: {total_added}건 → {MAYOR_CANDIDATES_PATH}")
    elif not args.apply:
        print("(dry-run 모드. 실제 적용: --apply --i-verified-with-nec 필요, "
              "발견 후보는 반드시 NEC/공식 소스로 교차검증 후 진행.)")


if __name__ == "__main__":
    main()
