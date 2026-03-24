#!/usr/bin/env python3
"""
데이터 품질 자동 점검 + 자동 복구

매일 실행되어:
1. 각 데이터 파일의 신선도(lastUpdated)를 확인
2. 오래된 데이터 → 해당 워크플로우를 자동 재실행
3. 데이터 무결성 검증 → 문제 있으면 자동 수정
4. 재실행 루프 방지 (heal_state.json으로 하루 1회만)
"""

import json
import os
import subprocess
import sys
from datetime import datetime, date, timedelta
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
CANDIDATES_DIR = DATA_DIR / "candidates"
HEAL_STATE_PATH = DATA_DIR / ".heal_state.json"

TODAY = date.today()


# ── 신선도 기준: (파일, 메타키, 허용일수, 복구 워크플로우) ──
FRESHNESS_RULES = [
    # 매일 갱신 대상
    ("candidates/governor.json", "_meta.lastUpdated", 2, "update-candidates.yml"),
    ("candidates/superintendent.json", "_meta.lastUpdated", 2, "update-candidates.yml"),
    ("candidates/mayor_candidates.json", "_meta.lastUpdated", 2, "update-candidates.yml"),
    ("candidates/byelection.json", "_meta.lastUpdated", 2, "update-candidates.yml"),
    ("election_stats.json", "_meta.lastUpdated", 3, "update-election-stats.yml"),
    # 주간 갱신 대상
    ("candidates/governor_status.json", "_meta.lastUpdated", 9, "update-governor-status.yml"),
    ("candidates/mayor_status.json", "_meta.lastUpdated", 9, "update-mayor-status.yml"),
    ("candidates/superintendent_status.json", "_meta.lastUpdated", 9, "update-superintendent-status.yml"),
    # 개요 (meta, not _meta)
    ("election_overview.json", "meta.lastUpdated", 2, "update-overview.yml"),
]


def load_heal_state():
    if HEAL_STATE_PATH.exists():
        return json.loads(HEAL_STATE_PATH.read_text(encoding="utf-8"))
    return {}


def save_heal_state(state):
    HEAL_STATE_PATH.write_text(
        json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def get_meta_date(data, meta_path):
    """중첩 키 경로로 날짜 추출 (예: '_meta.lastUpdated')"""
    obj = data
    for key in meta_path.split("."):
        if isinstance(obj, dict) and key in obj:
            obj = obj[key]
        else:
            return None
    if isinstance(obj, str):
        # "2026-03-22" 또는 "2026-03-22T09:06:59.696613" 모두 처리
        try:
            return datetime.fromisoformat(obj.replace("Z", "+00:00")).date()
        except ValueError:
            try:
                return datetime.strptime(obj[:10], "%Y-%m-%d").date()
            except ValueError:
                return None
    return None


def trigger_workflow(workflow_file):
    """GitHub Actions 워크플로우를 원격으로 재실행"""
    print(f"  → 워크플로우 재실행: {workflow_file}")
    result = subprocess.run(
        ["gh", "workflow", "run", workflow_file],
        capture_output=True, text=True, cwd=str(BASE_DIR)
    )
    if result.returncode == 0:
        print(f"  ✓ 성공")
        return True
    else:
        print(f"  ✗ 실패: {result.stderr.strip()}")
        return False


# ── 1. 신선도 점검 ──

def check_freshness(heal_state):
    """데이터 파일 신선도 확인, 오래되면 워크플로우 재실행"""
    print("\n[1] 데이터 신선도 점검")
    print("=" * 50)
    stale_count = 0
    healed_count = 0

    # 같은 워크플로우를 중복 실행하지 않기 위한 세트
    triggered_today = set()

    for rel_path, meta_path, max_days, workflow in FRESHNESS_RULES:
        full_path = DATA_DIR / rel_path
        if not full_path.exists():
            print(f"  ⚠️  {rel_path} — 파일 없음")
            continue

        data = json.loads(full_path.read_text(encoding="utf-8"))
        last_date = get_meta_date(data, meta_path)

        if last_date is None:
            print(f"  ⚠️  {rel_path} — {meta_path} 없음")
            continue

        age = (TODAY - last_date).days
        if age <= max_days:
            print(f"  ✓ {rel_path} — {age}일 전 ({last_date})")
            continue

        stale_count += 1
        print(f"  ✗ {rel_path} — {age}일 전 ({last_date}, 기준: {max_days}일)")

        # 오늘 이미 복구 시도했는지 확인
        heal_key = f"freshness:{workflow}"
        last_heal = heal_state.get(heal_key, "")
        if last_heal == str(TODAY):
            print(f"    (오늘 이미 재실행 시도함 — 건너뜀)")
            continue

        # 같은 워크플로우 중복 방지
        if workflow in triggered_today:
            continue

        if os.environ.get("DRY_RUN"):
            print(f"    [DRY] {workflow} 재실행 예정")
        else:
            if trigger_workflow(workflow):
                healed_count += 1
            heal_state[heal_key] = str(TODAY)
            triggered_today.add(workflow)

    print(f"\n  결과: {stale_count}건 오래됨, {healed_count}건 복구 시도")
    return stale_count


# ── 2. 데이터 무결성 점검 ──

def check_integrity(heal_state):
    """데이터 구조/내용 무결성 검증 + 자동 수정"""
    print("\n[2] 데이터 무결성 점검")
    print("=" * 50)
    issues = 0
    fixed = 0

    # 2-1. 후보자 파일: 빈 후보 목록 체크
    for fname in ("governor.json", "superintendent.json"):
        path = CANDIDATES_DIR / fname
        if not path.exists():
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        candidates = data.get("candidates", {})
        empty_regions = [r for r, cands in candidates.items() if not cands]
        if empty_regions:
            print(f"  ⚠️  {fname} — 빈 후보 지역: {', '.join(empty_regions)}")
            issues += 1

    # 2-2. 재보궐: 중복 인물 체크 (cross_validate 보완)
    bye_path = CANDIDATES_DIR / "byelection.json"
    if bye_path.exists():
        bye = json.loads(bye_path.read_text(encoding="utf-8"))
        name_map = {}
        for key, dist in bye.get("districts", {}).items():
            for c in dist.get("candidates", []):
                if c.get("status") == "WITHDRAWN":
                    continue
                name = c["name"]
                name_map.setdefault(name, []).append(key)

        dupes = {n: keys for n, keys in name_map.items() if len(keys) > 1}
        if dupes:
            print(f"  ✗ 재보궐 중복 인물: {len(dupes)}건")
            for name, keys in dupes.items():
                print(f"    {name}: {', '.join(keys)}")
            issues += len(dupes)

            # 자동 수정: cross_validate --fix 실행
            heal_key = "integrity:byelection_dup"
            if heal_state.get(heal_key) != str(TODAY):
                if not os.environ.get("DRY_RUN"):
                    print("  → cross_validate.py --fix 실행")
                    result = subprocess.run(
                        [sys.executable, "scripts/candidate_pipeline/cross_validate.py", "--fix"],
                        capture_output=True, text=True, cwd=str(BASE_DIR)
                    )
                    if result.returncode == 0:
                        fixed += len(dupes)
                        print("  ✓ 중복 자동 수정 완료")
                    else:
                        print(f"  ✗ 수정 실패: {result.stderr[-200:]}")
                    heal_state[heal_key] = str(TODAY)

    # 2-3. 후보자 정당 일관성 (governor vs byelection)
    gov_path = CANDIDATES_DIR / "governor.json"
    if gov_path.exists() and bye_path.exists():
        gov = json.loads(gov_path.read_text(encoding="utf-8"))
        bye = json.loads(bye_path.read_text(encoding="utf-8"))

        # 광역 후보 정당 맵
        known = {}
        for region, cands in gov.get("candidates", {}).items():
            for c in cands:
                if c.get("status") != "WITHDRAWN":
                    pk = c.get("partyKey", c.get("party", ""))
                    if pk:
                        known[c["name"]] = pk

        # 재보궐에서 정당 불일치 찾기
        dirty = False
        for key, dist in bye.get("districts", {}).items():
            for c in dist.get("candidates", []):
                if c.get("status") == "WITHDRAWN":
                    continue
                name = c["name"]
                pk = c.get("partyKey", c.get("party", ""))
                if name in known and pk != known[name]:
                    print(f"  ✗ 정당 불일치: {name} — 재보궐({pk}) vs 광역({known[name]})")
                    issues += 1
                    if not os.environ.get("DRY_RUN"):
                        c["party"] = known[name]
                        c["partyKey"] = known[name]
                        dirty = True
                        fixed += 1
                        print(f"    → 자동 보정: {pk} → {known[name]}")

        if dirty:
            bye_path.write_text(
                json.dumps(bye, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
            )

    # 2-4. JSON 파싱 가능 여부 (전체 data/ 폴더)
    for json_file in DATA_DIR.rglob("*.json"):
        if json_file.name.startswith("."):
            continue
        try:
            json.loads(json_file.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError) as e:
            print(f"  ✗ JSON 파싱 오류: {json_file.relative_to(BASE_DIR)} — {e}")
            issues += 1

    print(f"\n  결과: {issues}건 발견, {fixed}건 자동 수정")
    return issues


# ── 3. 워크플로우 실패 감지 + 재실행 ──

def check_workflow_failures(heal_state):
    """최근 워크플로우 실패를 감지하고 재실행"""
    print("\n[3] 워크플로우 실패 감지")
    print("=" * 50)

    workflows = [
        "update-candidates.yml",
        "update-overview.yml",
        "update-election-stats.yml",
    ]
    retried = 0

    for wf in workflows:
        heal_key = f"workflow_retry:{wf}"
        if heal_state.get(heal_key) == str(TODAY):
            continue

        result = subprocess.run(
            ["gh", "run", "list", "--workflow", wf, "--limit", "1", "--json", "conclusion,createdAt"],
            capture_output=True, text=True, cwd=str(BASE_DIR)
        )
        if result.returncode != 0:
            print(f"  ⚠️  {wf} — gh 명령 실패")
            continue

        try:
            runs = json.loads(result.stdout)
        except json.JSONDecodeError:
            continue

        if not runs:
            continue

        run = runs[0]
        conclusion = run.get("conclusion", "")

        if conclusion == "failure":
            print(f"  ✗ {wf} — 마지막 실행 실패")
            if not os.environ.get("DRY_RUN"):
                if trigger_workflow(wf):
                    retried += 1
                heal_state[heal_key] = str(TODAY)
        else:
            print(f"  ✓ {wf} — {conclusion}")

    print(f"\n  결과: {retried}건 재실행")
    return retried


def main():
    print("=" * 55)
    print("데이터 품질 자동 점검")
    print(f"실행: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    if os.environ.get("DRY_RUN"):
        print("[DRY RUN — 실제 수정/재실행 안 함]")
    print("=" * 55)

    heal_state = load_heal_state()

    stale = check_freshness(heal_state)
    issues = check_integrity(heal_state)
    retried = check_workflow_failures(heal_state)

    save_heal_state(heal_state)

    print("\n" + "=" * 55)
    print(f"종합: 오래된 데이터 {stale}건 | 무결성 이슈 {issues}건 | 재실행 {retried}건")
    print("=" * 55)


if __name__ == "__main__":
    main()
