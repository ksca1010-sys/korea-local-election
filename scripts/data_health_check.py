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
import argparse
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
CANDIDATES_DIR = DATA_DIR / "candidates"
HEAL_STATE_PATH = DATA_DIR / ".heal_state.json"

KST = timezone(timedelta(hours=9))
TODAY = datetime.now(KST).date()


def parse_args(argv):
    parser = argparse.ArgumentParser(
        description="데이터 품질 자동 점검 + 자동 복구"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="파일 저장과 GitHub Actions 재실행 없이 점검만 수행",
    )
    return parser.parse_args(argv)


ARGS = parse_args(sys.argv[1:])
DRY_RUN = ARGS.dry_run or os.environ.get("DRY_RUN", "").lower() in {"1", "true", "yes", "on"}

FAILURE_CONCLUSIONS = {
    "failure",
    "cancelled",
    "timed_out",
    "action_required",
    "startup_failure",
}


# ── 신선도 기준: (파일, 메타키, 허용일수, 복구 워크플로우) ──
FRESHNESS_RULES = [
    # 매일 갱신 대상
    ("candidates/governor.json", "_meta.lastUpdated", 2, "update-candidates.yml"),
    ("candidates/superintendent.json", "_meta.lastUpdated", 2, "update-candidates.yml"),
    ("candidates/mayor_candidates.json", "_meta.lastUpdated", 2, "update-candidates.yml"),
    ("candidates/byelection.json", "_meta.lastUpdated", 2, "update-candidates.yml"),
    ("candidates/council/*.json", "_meta.lastOfficialSync", 2, "sync-official-candidates.yml"),
    ("candidates/local_council/*.json", "_meta.lastOfficialSync", 2, "sync-official-candidates.yml"),
    ("election_stats.json", "_meta.lastUpdated", 3, "update-election-stats.yml"),
    ("polls/polls.json", "generated", 2, "update-polls.yml"),
    ("static/gallup_national_poll.json", "publishDate", 9, "update-gallup.yml"),
    # 주간 갱신 대상
    ("candidates/governor_status.json", "_meta.lastUpdated", 9, "update-governor-status.yml"),
    ("candidates/mayor_status.json", "_meta.lastUpdated", 9, "update-mayor-status.yml"),
    ("candidates/superintendent_status.json", "_meta.lastUpdated", 9, "update-superintendent-status.yml"),
    # 개요 (meta, not _meta)
    ("election_overview.json", "meta.lastUpdated", 2, "update-overview.yml"),
]

# ── 워크플로우 실패 감지: (워크플로우 파일, 자동 재시도 여부) ──
WORKFLOW_FAILURE_CHECKS = [
    ("update-candidates.yml", False),  # Gemini-backed stages
    ("update-overview.yml", False),  # optional Gemini narrative stages
    ("update-election-stats.yml", True),
    ("update-gallup.yml", True),
    ("update-polls.yml", True),
    ("update-governor-status.yml", True),
    ("update-mayor-status.yml", True),
    ("update-superintendent-status.yml", True),
    ("update-byelection.yml", False),  # Gemini-backed factcheck stages
    ("fetch-disclosures.yml", True),
    ("update-local-council.yml", False),  # Gemini-backed factcheck
    ("update-local-media.yml", True),
    ("sync-official-candidates.yml", True),
]

WORKFLOW_AUTO_RETRY = dict(WORKFLOW_FAILURE_CHECKS)


def workflow_retry_label(workflow_file):
    return "auto-retry enabled" if WORKFLOW_AUTO_RETRY.get(workflow_file, True) else "auto-retry disabled"


def workflow_allows_auto_retry(workflow_file):
    return WORKFLOW_AUTO_RETRY.get(workflow_file, True)


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


def iter_freshness_files(rel_path):
    if "*" in rel_path:
        matches = sorted(DATA_DIR.glob(rel_path))
        if not matches:
            yield rel_path, None
            return
        for path in matches:
            yield str(path.relative_to(DATA_DIR)), path
        return
    yield rel_path, DATA_DIR / rel_path


def candidate_identity_key(candidate):
    """NEC huboid 기준으로 후보 신원을 식별하고, 없을 때만 이름으로 후퇴."""
    huboid = str(candidate.get("huboid") or "").strip()
    if huboid:
        return ("huboid", huboid)
    return ("name", str(candidate.get("name") or "").strip())


def candidate_party_key(candidate):
    return str(candidate.get("partyKey") or candidate.get("party") or "").strip()


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
        for display_path, full_path in iter_freshness_files(rel_path):
            if full_path is None or not full_path.exists():
                print(f"  ⚠️  {display_path} — 파일 없음")
                continue

            data = json.loads(full_path.read_text(encoding="utf-8"))
            last_date = get_meta_date(data, meta_path)

            if last_date is None:
                print(f"  ⚠️  {display_path} — {meta_path} 없음")
                continue

            age = (TODAY - last_date).days
            if age <= max_days:
                print(f"  ✓ {display_path} — {age}일 전 ({last_date})")
                continue

            stale_count += 1
            print(f"  ✗ {display_path} — {age}일 전 ({last_date}, 기준: {max_days}일)")

            # 오늘 이미 복구 시도했는지 확인
            heal_key = f"freshness:{workflow}"
            last_heal = heal_state.get(heal_key, "")
            if last_heal == str(TODAY):
                print(f"    (오늘 이미 재실행 시도함 — 건너뜀)")
                continue

            # 같은 워크플로우 중복 방지
            if workflow in triggered_today:
                continue

            if not workflow_allows_auto_retry(workflow):
                print(f"    ({workflow_retry_label(workflow)} — 수동 승인 필요)")
                triggered_today.add(workflow)
                continue

            if DRY_RUN:
                print(f"    [DRY] {workflow} 재실행 예정")
                triggered_today.add(workflow)
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

    def merged_empty_regions(data):
        meta = data.get("_meta") or data.get("meta") or {}
        merged = meta.get("mergedRegions") or {}
        return set(merged.keys())

    # 2-1. 후보자 파일: 빈 후보 목록 체크
    for fname in ("governor.json", "superintendent.json"):
        path = CANDIDATES_DIR / fname
        if not path.exists():
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        candidates = data.get("candidates", {})
        expected_empty = merged_empty_regions(data)
        empty_regions = [
            r for r, cands in candidates.items()
            if not cands and r not in expected_empty
        ]
        if empty_regions:
            print(f"  ⚠️  {fname} — 빈 후보 지역: {', '.join(empty_regions)}")
            issues += 1

    # 2-2. 재보궐: 중복 인물 체크 (cross_validate 보완)
    bye_path = CANDIDATES_DIR / "byelection.json"
    if bye_path.exists():
        bye = json.loads(bye_path.read_text(encoding="utf-8"))
        identity_map = {}
        for key, dist in bye.get("districts", {}).items():
            for c in dist.get("candidates", []):
                if c.get("status") == "WITHDRAWN":
                    continue
                name = c.get("name", "")
                if not name:
                    print(f"[WARN] name 키 누락 레코드 스킵: {list(c.keys())[:5]}")
                    continue
                identity = candidate_identity_key(c)
                identity_map.setdefault(identity, {"name": name, "districts": []})
                identity_map[identity]["districts"].append(key)

        dupes = {
            identity: entry
            for identity, entry in identity_map.items()
            if len(entry["districts"]) > 1
        }
        if dupes:
            print(f"  ✗ 재보궐 중복 인물: {len(dupes)}건")
            for identity, entry in dupes.items():
                identity_label = f"{identity[0]}:{identity[1]}"
                print(f"    {entry['name']} ({identity_label}): {', '.join(entry['districts'])}")
            issues += len(dupes)

            # 자동 수정: cross_validate --fix 실행
            heal_key = "integrity:byelection_dup"
            if heal_state.get(heal_key) != str(TODAY):
                if not DRY_RUN:
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
                    pk = candidate_party_key(c)
                    if pk:
                        identity = candidate_identity_key(c)
                        if identity[1]:
                            known[identity] = pk

        # 재보궐에서 정당 불일치 찾기
        dirty = False
        for key, dist in bye.get("districts", {}).items():
            for c in dist.get("candidates", []):
                if c.get("status") == "WITHDRAWN":
                    continue
                name = c.get("name", "")
                if not name:
                    print(f"[WARN] name 키 누락 레코드 스킵: {list(c.keys())[:5]}")
                    continue
                identity = candidate_identity_key(c)
                pk = candidate_party_key(c)
                if identity in known and pk != known[identity]:
                    print(f"  ✗ 정당 불일치: {name} — 재보궐({pk}) vs 광역({known[identity]})")
                    issues += 1
                    if not DRY_RUN:
                        c["party"] = known[identity]
                        c["partyKey"] = known[identity]
                        dirty = True
                        fixed += 1
                        print(f"    → 자동 보정: {pk} → {known[identity]}")
                    else:
                        print(f"    [DRY] 자동 보정 예정: {pk} → {known[identity]}")

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

    retried = 0

    for wf, allow_retry in WORKFLOW_FAILURE_CHECKS:
        heal_key = f"workflow_retry:{wf}"

        result = subprocess.run(
            ["gh", "run", "list", "--workflow", wf, "--limit", "1", "--json", "conclusion,createdAt,status"],
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
        status = run.get("status", "")
        if not conclusion:
            print(f"  • {wf} — {status or 'unknown'}")
            continue

        if conclusion in FAILURE_CONCLUSIONS:
            retry_label = "auto-retry enabled" if allow_retry else "auto-retry disabled"
            print(f"  ✗ {wf} — 마지막 실행 {conclusion} ({retry_label})")

            if not allow_retry:
                continue
            if heal_state.get(heal_key) == str(TODAY):
                print("    (오늘 이미 재실행 시도함 — 건너뜀)")
                continue
            if DRY_RUN:
                print(f"    [DRY] {wf} 재실행 예정")
                continue

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
    print(f"실행: {datetime.now(KST).strftime('%Y-%m-%d %H:%M:%S')} KST")
    if DRY_RUN:
        print("[DRY RUN — 실제 수정/재실행 안 함]")
    print("=" * 55)

    heal_state = load_heal_state()

    stale = check_freshness(heal_state)
    issues = check_integrity(heal_state)
    retried = check_workflow_failures(heal_state)

    if DRY_RUN:
        print("\n[DRY RUN] heal_state 저장 생략")
    else:
        save_heal_state(heal_state)

    print("\n" + "=" * 55)
    print(f"종합: 오래된 데이터 {stale}건 | 무결성 이슈 {issues}건 | 재실행 {retried}건")
    print("=" * 55)
    if stale or issues:
        print("상태 점검 실패: stale/무결성 이슈가 남아 있어 자동화 모니터에 노출합니다.")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
