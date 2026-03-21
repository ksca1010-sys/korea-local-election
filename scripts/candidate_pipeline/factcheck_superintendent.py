#!/usr/bin/env python3
"""
교육감 후보자 상태 자동 팩트체크 파이프라인

뉴스 기반으로 교육감 출마 선언·사퇴·성향 변경 등을 자동 감지하여
superintendent.json에 반영합니다.


sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from election_overview_utils import call_claude_json
사용법:
  python scripts/candidate_pipeline/factcheck_superintendent.py
  python scripts/candidate_pipeline/factcheck_superintendent.py --dry-run

환경변수:
  ANTHROPIC_API_KEY: Anthropic API 키
"""

import json
import os
import sys
import time
import re
from datetime import datetime, date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from election_overview_utils import call_claude_json

BASE_DIR = Path(__file__).resolve().parent.parent.parent
CANDIDATES_PATH = BASE_DIR / "data" / "candidates" / "superintendent.json"
STATUS_PATH = BASE_DIR / "data" / "candidates" / "superintendent_status.json"
ENV_FILE = BASE_DIR / ".env"


REGION_NAMES = {
    "seoul": "서울특별시", "busan": "부산광역시", "daegu": "대구광역시",
    "incheon": "인천광역시", "gwangju": "광주광역시", "daejeon": "대전광역시",
    "ulsan": "울산광역시", "sejong": "세종특별자치시", "gyeonggi": "경기도",
    "gangwon": "강원특별자치도", "chungbuk": "충청북도", "chungnam": "충청남도",
    "jeonbuk": "전북특별자치도", "jeonnam": "전라남도", "gyeongbuk": "경상북도",
    "gyeongnam": "경상남도", "jeju": "제주특별자치도",
}

STANCE_MAP = {
    "진보": "진보", "보수": "보수", "중도": "중도",
    "진보성향": "진보", "보수성향": "보수", "중도성향": "중도",
}


def load_env():
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, val = line.partition("=")
                os.environ.setdefault(key.strip(), val.strip().strip("'\""))


def load_candidates():
    if CANDIDATES_PATH.exists():
        return json.loads(CANDIDATES_PATH.read_text(encoding="utf-8"))
    # 초기 데이터: 현직 교육감을 기반으로 생성
    return init_from_status()


def init_from_status():
    """superintendent_status.json에서 현직 교육감 정보로 초기 데이터 생성"""
    data = {"_meta": {"lastUpdated": date.today().isoformat(), "source": "auto-init from superintendent_status.json"}, "candidates": {}}
    if STATUS_PATH.exists():
        status = json.loads(STATUS_PATH.read_text(encoding="utf-8"))
        for rk, info in status.get("superintendents", {}).items():
            data["candidates"][rk] = [{
                "id": f"{rk}-1",
                "name": info.get("name", ""),
                "stance": info.get("stance", "중도"),
                "career": f"현 {REGION_NAMES.get(rk, rk)} 교육감",
                "status": "EXPECTED",
                "dataSource": "incumbent",
                "pledges": [],
            }]
    return data


from local_news_search import fetch_superintendent_news
from verify_changes import verify_changes_against_news


def build_prompt_for_region(region_key, region_name, candidates, news):
    today_str = date.today().isoformat()

    lines = []
    for c in candidates:
        stance = c.get("stance", "미분류")
        status_map = {"DECLARED": "출마선언", "EXPECTED": "출마거론", "RUMORED": "하마평", "WITHDRAWN": "사퇴"}
        status_label = status_map.get(c.get("status", ""), c.get("status", ""))
        lines.append(f"- {c['name']} (성향:{stance}) [{status_label}]: {c.get('career', '')}")
    candidate_text = "\n".join(lines) if lines else "(현재 등록된 후보 없음)"

    news_text = "\n".join(f"- {n}" for n in news) if news else "(뉴스 검색 결과 없음)"

    return f"""당신은 2026년 6.3 지방선거 교육감 선거 전문가입니다. 오늘: {today_str}

{region_name} 교육감 후보 현황을 아래 최신 뉴스와 비교하여 변경사항을 찾으세요.

## 현재 데이터 ({region_name})
{candidate_text}

## 최신 뉴스 ({region_name} 교육감 관련)
{news_text}

## 찾아야 할 변경사항
1. 뉴스에는 나오지만 현재 데이터에 없는 새 후보 (출마 선언, 예비후보 등록 등)
2. 사퇴·불출마 선언
3. 상태 변경 (거론 → 출마선언 등)

## 출력 형식 (JSON)
변경이 필요한 건만 JSON 배열로 출력. 없으면 []. JSON만 출력.

[
  {{
    "region": "{region_key}",
    "name": "후보 이름",
    "changeType": "new_candidate|status_change|withdrawn",
    "oldStatus": "이전 상태",
    "newStatus": "새 상태 (DECLARED|EXPECTED|RUMORED|WITHDRAWN)",
    "stance": "성향 (진보|보수|중도)",
    "career": "경력 1줄 (새 후보 시)",
    "detail": "변경 근거 (뉴스 제목 인용)",
    "sourceUrl": "근거 뉴스 URL (반드시 포함)",
    "sourceLabel": "언론사명",
    "sourcePublishedAt": "뉴스 발행일 (YYYY-MM-DD)"
  }}
]

## 주의사항
- 뉴스에서 확인되는 사실만 반영. 추측 금지
- {region_name} 교육감만 해당. 도지사/시장/국회의원 제외
- 교육감은 무소속(정당공천 없음). 진보/보수/중도 성향으로만 분류

## ⚠️ status 판정 기준 (엄격 적용)
- DECLARED: 본인이 직접 출마를 공식 선언한 경우만
- RUMORED: "~출마 확실시", "~거론", "~관측" 수준은 모두 RUMORED
- WITHDRAWN: 본인이 직접 불출마/사퇴를 선언한 경우만
- "~확실", "~유력" 같은 표현은 절대 DECLARED로 판정하지 말 것"""



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


def apply_changes(data, changes, dry_run=False):
    applied = 0
    candidates = data.get("candidates", {})

    for change in changes:
        region = change.get("region", "")
        name = change.get("name", "")
        change_type = change.get("changeType", "")
        region_name = REGION_NAMES.get(region, region)

        if region not in candidates:
            candidates[region] = []

        region_list = candidates[region]
        existing = next((c for c in region_list if c["name"] == name), None)

        if change_type == "new_candidate":
            if existing:
                print(f"  [건너뜀] {region_name}: {name} 이미 존재")
                continue
            stance = STANCE_MAP.get(change.get("stance", ""), "중도")
            new_id = f"{region}-{len(region_list)+1}"
            new_candidate = {
                "id": new_id,
                "name": name,
                "stance": stance,
                "career": change.get("career", ""),
                "status": change.get("newStatus", "DECLARED"),
                "dataSource": "claude",
                "pledges": [],
                "sourceUrl": change.get("sourceUrl"),
                "sourceLabel": change.get("sourceLabel"),
                "sourcePublishedAt": change.get("sourcePublishedAt"),
            }
            label = f"[신규] {region_name}: {name} ({stance}) - {change.get('detail', '')}"
            if dry_run:
                print(f"  [DRY] {label}")
            else:
                region_list.append(new_candidate)
                print(f"  {label}")
            applied += 1

        elif change_type in ("status_change", "withdrawn"):
            if not existing:
                print(f"  [경고] {region_name}: {name} 없음")
                continue
            old_status = existing.get("status", "?")
            new_status = change.get("newStatus", "WITHDRAWN" if change_type == "withdrawn" else "DECLARED")
            if old_status == new_status:
                continue
            label = f"[상태변경] {region_name}: {name} {old_status} → {new_status} - {change.get('detail', '')}"
            if dry_run:
                print(f"  [DRY] {label}")
            else:
                existing["status"] = new_status
                existing["_lastChange"] = {
                    "date": date.today().isoformat(),
                    "type": change_type,
                    "detail": change.get("detail", ""),
                    "previous": old_status,
                    "sourceUrl": change.get("sourceUrl"),
                    "sourceLabel": change.get("sourceLabel"),
                    "sourcePublishedAt": change.get("sourcePublishedAt"),
                }
                print(f"  {label}")
            applied += 1

    return applied


def main():
    load_env()
    llm_key = os.environ.get("ANTHROPIC_API_KEY", "")
    dry_run = "--dry-run" in sys.argv
    target_region = None
    for arg in sys.argv[1:]:
        if arg.startswith("--region"):
            target_region = arg.split("=")[-1] if "=" in arg else (sys.argv[sys.argv.index(arg) + 1] if sys.argv.index(arg) + 1 < len(sys.argv) else None)

    if not llm_key:
        print("[오류] ANTHROPIC_API_KEY 미설정")
        sys.exit(1)

    print("=" * 60)
    print("교육감 후보자 상태 자동 팩트체크 파이프라인 (시도별 + 뉴스 연동)")
    print(f"실행: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    if dry_run:
        print("[DRY RUN]")
    if target_region:
        print(f"[대상: {REGION_NAMES.get(target_region, target_region)}]")
    print("=" * 60)

    data = load_candidates()
    candidates = data.get("candidates", {})
    total = sum(len(v) for v in candidates.values())
    print(f"\n현재 후보: {total}명 ({len(candidates)}개 시도)")

    regions_to_process = [target_region] if target_region else sorted(REGION_NAMES.keys())
    total_applied = 0

    for rk in regions_to_process:
        region_name = REGION_NAMES.get(rk, rk)
        region_cands = candidates.get(rk, [])

        # 뉴스 검색 (지역신문 우선)
        news = fetch_superintendent_news(rk, region_name)
        print(f"\n[{rk}] {region_name} 교육감 (뉴스 {len(news)}건, 현재 후보 {len(region_cands)}명)")

        prompt = build_prompt_for_region(rk, region_name, region_cands, news)

        try:
            raw = call_claude_json(prompt, llm_key)
            changes = parse_changes(raw)

            if not changes:
                print("  → 변경 없음")
            else:
                print(f"  → {len(changes)}건 감지 (Gemini)")
                changes = verify_changes_against_news(changes, news)
                print(f"  → {len(changes)}건 검증 통과")
                applied = apply_changes(data, changes, dry_run)
                total_applied += applied
        except Exception as e:
            print(f"  [오류] {e}")

        time.sleep(1)

    print(f"\n총 {total_applied}건 적용")

    if not dry_run:
        data["_meta"]["lastFactCheck"] = datetime.now().isoformat()
        data["_meta"]["lastUpdated"] = date.today().isoformat()
        CANDIDATES_PATH.write_text(
            json.dumps(data, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        print(f"\n[저장] {CANDIDATES_PATH}")


if __name__ == "__main__":
    main()
