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

# 사람 이름이 아닌 것 필터
NOT_NAMES = {
    "야당", "여당", "선거는", "구청장", "군수", "시장", "후보", "현직",
    "반면", "동시에", "내부에서", "민의힘의", "복수", "보좌관을", "재선에",
    "야권", "여권", "민주당", "국민의힘", "무소속", "조국혁신당",
    "진보당", "개혁신당", "현직자", "도전자", "주민들",
}

# 사람 이름 패턴 (2~3글자 한글, 성+이름)
NAME_PATTERN = re.compile(r'^[가-힣]{2,4}$')
COMMON_SURNAMES = set("김이박최정강조윤장임한오서신권황안송류전홍고문양손배백허유남심노하주우구신임나탁변")


def is_valid_name(name):
    """사람 이름인지 판별"""
    if name in NOT_NAMES:
        return False
    if not NAME_PATTERN.match(name):
        return False
    if len(name) < 2 or len(name) > 4:
        return False
    # 첫 글자가 한국 성씨인지 확인
    if name[0] not in COMMON_SURNAMES:
        return False
    return True


def extract_candidates_from_narrative(narrative):
    """narrative 텍스트에서 후보자 이름+역할 추출"""
    candidates = []

    # 패턴 1: "OOO 예비후보", "OOO 전 시장" 등
    patterns = [
        (r'([가-힣]{2,4})\s+(예비후보|예비 후보)', "DECLARED"),
        (r'([가-힣]{2,4})\s+전\s*(구청장|군수|시장|의원|의장|교육감)', "EXPECTED"),
        (r'([가-힣]{2,4})\s+현\s*(구청장|군수|시장)', None),  # 현직 → 이미 있을 것
        (r'([가-힣]{2,4})\s+(?:국민의힘|민주당|더불어민주당)\s*(?:후보|예비후보)', "DECLARED"),
    ]

    for pat, status in patterns:
        for m in re.finditer(pat, narrative):
            name = m.group(1)
            if is_valid_name(name) and status:  # 현직은 스킵
                candidates.append({"name": name, "status": status, "context": m.group(0)})

    # 패턴 2: "OOO(국민의힘)" "OOO(민주당)"
    party_pattern = r'([가-힣]{2,4})\s*\((국민의힘|민주당|더불어민주당|무소속|조국혁신당|개혁신당|진보당)\)'
    PARTY_MAP = {
        "국민의힘": "ppp", "민주당": "democratic", "더불어민주당": "democratic",
        "무소속": "independent", "조국혁신당": "reform", "개혁신당": "newReform", "진보당": "progressive",
    }
    for m in re.finditer(party_pattern, narrative):
        name = m.group(1)
        party = m.group(2)
        if is_valid_name(name):
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
