#!/usr/bin/env python3
"""
기초의원 현직 의원 데이터 2단계 검증 파이프라인

[1단계] 선관위 당선인 API → 2,601명 기초의원 당선인 (공식 베이스라인)
[2단계] Gemini → 당선 이후 변경사항만 검증 (탈당, 입당, 사퇴, 궐위, 제명 등)


sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from election_overview_utils import call_claude_json
사용법:
  python scripts/candidate_pipeline/fetch_local_council_members.py
  python scripts/candidate_pipeline/fetch_local_council_members.py --baseline-only
  python scripts/candidate_pipeline/fetch_local_council_members.py --gemini-only
  python scripts/candidate_pipeline/fetch_local_council_members.py --dry-run

환경변수:
  NEC_API_KEY:   공공데이터포털 인증키 (1단계)
  GEMINI_API_KEY: Gemini API 키 (2단계)
"""

import json
import os
import sys
import time
import re
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import datetime, date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from election_overview_utils import call_claude_json

BASE_DIR = Path(__file__).resolve().parent.parent.parent
OUTPUT_PATH = BASE_DIR / "data" / "candidates" / "local_council_members.json"
ENV_FILE = BASE_DIR / ".env"


NEC_API_BASE = "http://apis.data.go.kr/9760000"
WINNER_SERVICE = f"{NEC_API_BASE}/WinnerInfoInqireService2"
SG_ID = "20220601"
SG_TYPECODE = "6"  # 구·시·군의회의원

REGION_MAP = {
    "서울특별시": "seoul", "부산광역시": "busan", "대구광역시": "daegu",
    "인천광역시": "incheon", "광주광역시": "gwangju", "대전광역시": "daejeon",
    "울산광역시": "ulsan", "세종특별자치시": "sejong", "경기도": "gyeonggi",
    "강원특별자치도": "gangwon", "강원도": "gangwon",
    "충청북도": "chungbuk", "충청남도": "chungnam",
    "전북특별자치도": "jeonbuk", "전라북도": "jeonbuk",
    "전라남도": "jeonnam", "경상북도": "gyeongbuk",
    "경상남도": "gyeongnam", "제주특별자치도": "jeju",
}

REGION_NAMES = {
    "seoul": "서울특별시", "busan": "부산광역시", "daegu": "대구광역시",
    "incheon": "인천광역시", "gwangju": "광주광역시", "daejeon": "대전광역시",
    "ulsan": "울산광역시", "sejong": "세종특별자치시", "gyeonggi": "경기도",
    "gangwon": "강원특별자치도", "chungbuk": "충청북도", "chungnam": "충청남도",
    "jeonbuk": "전북특별자치도", "jeonnam": "전라남도", "gyeongbuk": "경상북도",
    "gyeongnam": "경상남도", "jeju": "제주특별자치도",
}

PARTY_MAP = {
    "더불어민주당": "democratic", "국민의힘": "ppp",
    "무소속": "independent", "진보당": "progressive",
    "정의당": "justice", "조국혁신당": "reform",
}

PARTY_NAMES = {
    "democratic": "더불어민주당", "ppp": "국민의힘",
    "independent": "무소속", "progressive": "진보당",
    "justice": "정의당", "reform": "조국혁신당",
}


def load_env():
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, val = line.partition("=")
                os.environ.setdefault(key.strip(), val.strip().strip("'\""))


def load_current():
    if OUTPUT_PATH.exists():
        return json.loads(OUTPUT_PATH.read_text(encoding="utf-8"))
    return {"_meta": {}, "sigungus": {}}


def normalize_party(name):
    if not name:
        return "independent"
    for k, v in PARTY_MAP.items():
        if k in name:
            return v
    return "independent"


# ============================================
# 1단계: 선관위 당선인 API
# ============================================
def fetch_all_winners(api_key):
    all_items = []
    for page in range(1, 30):
        params = {
            "sgId": SG_ID, "sgTypecode": SG_TYPECODE,
            "numOfRows": "100", "pageNo": str(page), "resultType": "xml",
        }
        qs = urllib.parse.urlencode(params)
        url = f"{WINNER_SERVICE}/getWinnerInfoInqire?serviceKey={urllib.parse.quote(api_key, safe='')}&{qs}"

        try:
            resp = urllib.request.urlopen(url, timeout=30)
            root = ET.fromstring(resp.read().decode("utf-8"))
            items = list(root.iter("item"))
            all_items.extend(items)
            if len(items) < 100:
                break
        except Exception as e:
            print(f"  [오류] 페이지 {page}: {e}")
            break

    return all_items


def build_sigungu_data(items):
    sigungus = {}
    for it in items:
        name = it.findtext("name", "").strip()
        sgg = it.findtext("sggName", "").strip()
        party = it.findtext("jdName", "").strip()
        sd = it.findtext("sdName", "").strip()

        rk = REGION_MAP.get(sd, "")
        if not rk:
            continue
        pk = PARTY_MAP.get(party, "independent")
        key = f"{rk}_{sgg}"

        if key not in sigungus:
            sigungus[key] = {
                "region": rk, "sigungu": sgg,
                "members": [], "parties": {},
            }

        sigungus[key]["members"].append({
            "name": name,
            "party": pk,
            "electedParty": pk,
        })
        sigungus[key]["parties"][pk] = sigungus[key]["parties"].get(pk, 0) + 1

    return sigungus


def merge_baseline(nec_sigungus, existing):
    """NEC 베이스라인과 기존 데이터 병합 — 기존 변경사항 보존"""
    if not nec_sigungus:
        return existing

    merged = {"_meta": existing.get("_meta", {}), "sigungus": {}}
    existing_sgg = existing.get("sigungus", {})

    for key, nec_entry in nec_sigungus.items():
        prev = existing_sgg.get(key, {})
        entry = dict(nec_entry)

        # 기존에 변경사항이 있으면 보존
        if prev.get("_lastFactCheck"):
            # 기존 members의 변경사항 보존
            prev_members = {m["name"]: m for m in prev.get("members", [])}
            for member in entry["members"]:
                pm = prev_members.get(member["name"])
                if pm and pm.get("party") != pm.get("electedParty"):
                    # 정당 변경이 있었으면 보존
                    member["party"] = pm["party"]
                if pm and pm.get("status") == "resigned":
                    member["status"] = "resigned"
            entry["_lastFactCheck"] = prev["_lastFactCheck"]

        merged["sigungus"][key] = entry

    # 기존에만 있는 시군구 보존
    for key in existing_sgg:
        if key not in merged["sigungus"]:
            merged["sigungus"][key] = existing_sgg[key]

    return merged


# ============================================
# 2단계: Gemini 변경사항 탐지 (시도별)
# ============================================
def build_gemini_prompt(region_key, sigungus_in_region):
    today_str = date.today().isoformat()
    region_name = REGION_NAMES.get(region_key, region_key)

    lines = []
    for key, sg in sorted(sigungus_in_region.items()):
        sgg_name = sg["sigungu"]
        members_str = ", ".join(
            f"{m['name']}({PARTY_NAMES.get(m.get('party',''), m.get('party',''))})"
            for m in sg["members"]
            if m.get("status") != "resigned"
        )
        lines.append(f"- {sgg_name}: {members_str}")

    member_text = "\n".join(lines)
    total = sum(len(sg["members"]) for sg in sigungus_in_region.values())

    return f"""당신은 대한민국 지방의회 전문가입니다. 오늘: {today_str}

아래는 {region_name} 기초의원(구·시·군의회의원) 현황입니다.
2022년 제8회 지방선거 당선인 기준이며, 이후 변경사항만 팩트체크하세요:

1. 탈당·입당 등 소속정당 변경
2. 사퇴·제명·당선무효 등으로 궐위
3. 보궐선거로 새 의원 당선

## 현재 데이터 ({total}명)
{member_text}

## 출력 형식 (JSON)
변경이 필요한 건만 JSON 배열로 출력. 없으면 []. JSON만 출력.

[
  {{
    "sigungu": "시군구선거구 (예: 종로구가선거구)",
    "name": "의원 이름",
    "changeType": "party_change|resigned|expelled|by_election",
    "oldParty": "이전 정당명 (한글)",
    "newParty": "새 정당명 (한글, 사퇴/제명 시 null)",
    "detail": "변경 내용 (날짜 포함)"
  }}
]

## 주의사항
- 확인되지 않은 사실 절대 포함 금지
- 이미 반영된 변경사항은 출력 금지
- 2026 지방선거 출마를 위한 사퇴도 포함
- 소속정당 변경만 확인 (직책 변경은 제외)"""



def parse_changes(text):
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()
    try:
        result = json.loads(text)
        return result if isinstance(result, list) else []
    except json.JSONDecodeError:
        return []


def apply_changes(data, changes, region_key):
    applied = 0
    sigungus = data.get("sigungus", {})

    for change in changes:
        sgg_raw = change.get("sigungu", "")
        name = change.get("name", "")
        change_type = change.get("changeType", "")

        # 키 매칭: region_sigungu
        key = f"{region_key}_{sgg_raw}"
        if key not in sigungus:
            # 공백 제거해서 재시도
            key_nospace = f"{region_key}_{sgg_raw.replace(' ', '')}"
            if key_nospace in sigungus:
                key = key_nospace
            else:
                print(f"    [경고] '{sgg_raw}' 매칭 실패")
                continue

        sg = sigungus[key]
        member = next((m for m in sg["members"] if m["name"] == name), None)
        if not member:
            if change_type == "by_election":
                # 보궐당선: 새 의원 추가
                new_party = normalize_party(change.get("newParty", ""))
                sg["members"].append({
                    "name": name,
                    "party": new_party,
                    "electedParty": new_party,
                    "status": "by_election",
                })
                sg["parties"][new_party] = sg["parties"].get(new_party, 0) + 1
                region_name = REGION_NAMES.get(region_key, region_key)
                print(f"    [보궐] {region_name} {sgg_raw}: +{name}({new_party})")
                applied += 1
            else:
                print(f"    [경고] '{name}' in '{sgg_raw}' 없음")
            continue

        old_party = member.get("party", "?")

        if change_type == "party_change":
            new_party = normalize_party(change.get("newParty", ""))
            if new_party and new_party != old_party:
                member["party"] = new_party
                # 정당 카운트 업데이트
                sg["parties"][old_party] = max(0, sg["parties"].get(old_party, 1) - 1)
                if sg["parties"].get(old_party) == 0:
                    del sg["parties"][old_party]
                sg["parties"][new_party] = sg["parties"].get(new_party, 0) + 1
                region_name = REGION_NAMES.get(region_key, region_key)
                print(f"    [정당변경] {region_name} {sgg_raw}: {name} {PARTY_NAMES.get(old_party, old_party)} → {PARTY_NAMES.get(new_party, new_party)}")
                applied += 1

        elif change_type in ("resigned", "expelled"):
            member["status"] = "resigned"
            member["party"] = "vacant"
            sg["parties"][old_party] = max(0, sg["parties"].get(old_party, 1) - 1)
            if sg["parties"].get(old_party) == 0:
                del sg["parties"][old_party]
            sg["parties"]["vacant"] = sg["parties"].get("vacant", 0) + 1
            region_name = REGION_NAMES.get(region_key, region_key)
            reason = change.get("detail", change_type)
            print(f"    [궐위] {region_name} {sgg_raw}: {name} ({reason})")
            applied += 1

    return applied


def save_compact(data, path):
    lines = ["{"]
    lines.append('  "_meta": ' + json.dumps(data["_meta"], ensure_ascii=False) + ",")
    lines.append('  "sigungus": {')
    entries = list(data["sigungus"].items())
    for i, (key, sg) in enumerate(entries):
        comma = "," if i < len(entries) - 1 else ""
        lines.append(f'    "{key}": {json.dumps(sg, ensure_ascii=False)}{comma}')
    lines.append("  }")
    lines.append("}")
    path.write_text("\n".join(lines), encoding="utf-8")


def main():
    load_env()
    nec_key = os.environ.get("NEC_API_KEY", "")
    llm_key = os.environ.get("GEMINI_API_KEY", "")
    dry_run = "--dry-run" in sys.argv
    baseline_only = "--baseline-only" in sys.argv
    gemini_only = "--gemini-only" in sys.argv

    print("=" * 60)
    print("기초의원 현직 의원 데이터 2단계 검증 파이프라인")
    print(f"실행: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    if dry_run:
        print("[DRY RUN]")
    print("=" * 60)

    existing = load_current()

    # ── 1단계 ──
    if not gemini_only:
        print("\n[1단계] 선관위 당선인정보 API (공식 베이스라인)")
        if not nec_key:
            print("  [건너뜀] NEC_API_KEY 미설정")
            data = existing
        else:
            print("  조회 중...")
            items = fetch_all_winners(nec_key)
            if items:
                print(f"  → {len(items)}명 당선인 조회 완료")
                nec_sigungus = build_sigungu_data(items)
                print(f"  → {len(nec_sigungus)}개 시군구 집계")
                data = merge_baseline(nec_sigungus, existing)
            else:
                print("  [오류] NEC API 실패, 기존 데이터 사용")
                data = existing
    else:
        data = existing

    if baseline_only:
        total_members = sum(len(sg["members"]) for sg in data.get("sigungus", {}).values())
        data["_meta"].update({
            "lastUpdated": date.today().isoformat(),
            "source": "중앙선거관리위원회 당선인정보 API (공식)",
            "totalMembers": total_members,
            "totalSigungu": len(data.get("sigungus", {})),
        })
        if not dry_run:
            save_compact(data, OUTPUT_PATH)
            print(f"\n[저장] {OUTPUT_PATH}")
        return

    # ── 2단계 ──
    if not llm_key:
        print("  [건너뜀] GEMINI_API_KEY 미설정")
    else:
        total_changes = 0
        sigungus = data.get("sigungus", {})

        # 시도별로 분할
        regions = {}
        for key, sg in sigungus.items():
            rk = sg.get("region", key.split("_")[0])
            if rk not in regions:
                regions[rk] = {}
            regions[rk][key] = sg

        for rk in sorted(regions.keys()):
            region_name = REGION_NAMES.get(rk, rk)
            region_sgungus = regions[rk]
            member_count = sum(len(sg["members"]) for sg in region_sgungus.values())
            print(f"\n  [{region_name}] {len(region_sgungus)}개 시군구, {member_count}명")

            prompt = build_gemini_prompt(rk, region_sgungus)
            try:
                raw = call_claude_json(prompt, llm_key)
                changes = parse_changes(raw)

                if not changes:
                    print(f"    → 변경 없음")
                else:
                    print(f"    → {len(changes)}건 변경 감지")
                    if dry_run:
                        for c in changes:
                            print(f"      [DRY] {c.get('sigungu','?')}: {c.get('name','?')} {c.get('changeType','')} - {c.get('detail','')}")
                    else:
                        applied = apply_changes(data, changes, rk)
                        total_changes += applied
            except Exception as e:
                print(f"    [오류] {e}")

            # Rate limit 방지
            time.sleep(2)

        print(f"\n  → 총 {total_changes}건 변경 적용")

    # ── 저장 ──
    total_members = sum(len(sg["members"]) for sg in data.get("sigungus", {}).values())
    vacant_count = sum(
        sum(1 for m in sg["members"] if m.get("status") == "resigned")
        for sg in data.get("sigungus", {}).values()
    )
    data["_meta"].update({
        "lastUpdated": date.today().isoformat(),
        "lastFactCheck": datetime.now().isoformat(),
        "source": "중앙선거관리위원회 당선인정보 API + Gemini 변경사항 검증",
        "totalMembers": total_members,
        "totalSigungu": len(data.get("sigungus", {})),
        "vacantCount": vacant_count,
    })

    if not dry_run:
        save_compact(data, OUTPUT_PATH)
        size = OUTPUT_PATH.stat().st_size / 1024
        print(f"\n[저장] {OUTPUT_PATH} ({size:.0f}KB)")

    print("\n" + "=" * 60)
    print(f"완료! (총 {total_members}명, 궐위 {vacant_count}명)")
    print("=" * 60)


if __name__ == "__main__":
    main()
