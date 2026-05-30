#!/usr/bin/env python3
"""
monitor_failures.py — 자동화 실패 감지 및 GitHub Issue 알림

workflow_run 이벤트로 호출됨:
  python scripts/monitor_failures.py \
    --workflow "Update Candidate Data" \
    --run-id 12345678 \
    --conclusion failure \
    --run-url https://github.com/...

역할:
  - 연속 실패 횟수를 data/.failure_counts.json 에 기록
  - 연속 2회 이상 실패 시 → GitHub Issue 자동 생성
  - 성공 시 → 해당 워크플로우 카운트 초기화
  - 중복 Issue 방지 (열린 Issue가 이미 있으면 댓글만 추가)
"""

import argparse
import json
import os
import subprocess
import sys
from datetime import date, datetime, timezone
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
FAILURE_COUNTS_PATH = BASE_DIR / "data" / ".failure_counts.json"

ALERT_THRESHOLD = 2   # 연속 N회 실패 시 Issue 생성
AUTO_RETRY_THRESHOLD = 1  # 연속 N회 실패 시 워크플로우 자동 재시도

# 자동 재시도 제외 워크플로우 (재시도해도 의미 없는 것)
NO_AUTO_RETRY = {
    "CI",
    "Monitor Automation Failures",
    "Data Health Check",
}

SCHEDULE_FRESHNESS_CHECKS = [
    {
        "name": "Data Health Check",
        "workflow": "data-health-check.yml",
        "max_age_hours": 30,
        "auto_trigger": True,
    },
    {
        "name": "Poll Sync (NESDC)",
        "workflow": "update-polls.yml",
        "max_age_hours": 30,
        "auto_trigger": True,
    },
    {
        "name": "Update Election Stats",
        "workflow": "update-election-stats.yml",
        "max_age_hours": 30,
        "auto_trigger": True,
    },
]

FAILURE_CONCLUSIONS = {
    "failure",
    "cancelled",
    "timed_out",
    "action_required",
    "startup_failure",
}


def load_counts() -> dict:
    if FAILURE_COUNTS_PATH.exists():
        try:
            return json.loads(FAILURE_COUNTS_PATH.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def save_counts(counts: dict):
    if not counts and not FAILURE_COUNTS_PATH.exists():
        return
    FAILURE_COUNTS_PATH.write_text(
        json.dumps(counts, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def gh(*args) -> tuple[int, str, str]:
    """gh CLI 실행, (returncode, stdout, stderr) 반환"""
    result = subprocess.run(
        ["gh", *args],
        capture_output=True, text=True, cwd=str(BASE_DIR),
    )
    return result.returncode, result.stdout.strip(), result.stderr.strip()


def get_failed_step_log(run_id: str) -> str:
    """실패한 Run의 오류 로그 마지막 30줄 추출"""
    rc, out, _ = gh("run", "view", run_id, "--log-failed")
    if rc != 0 or not out:
        return "(로그 조회 실패)"
    lines = out.splitlines()
    # 실제 에러 메시지 라인만 필터링
    error_lines = [
        l for l in lines
        if any(k in l for k in ["Error", "error", "KeyError", "Exception",
                                  "Traceback", "##[error]", "exit code"])
    ]
    if error_lines:
        return "\n".join(error_lines[-15:])
    return "\n".join(lines[-30:])


def find_open_issue(workflow_name: str) -> str | None:
    """같은 워크플로우에 대해 이미 열린 Issue 번호 반환 (없으면 None)"""
    label = "automation-failure"
    rc, out, _ = gh(
        "issue", "list",
        "--label", label,
        "--state", "open",
        "--json", "number,title",
        "--limit", "20",
    )
    if rc != 0:
        return None
    try:
        issues = json.loads(out)
    except Exception:
        return None
    for issue in issues:
        if workflow_name in issue.get("title", ""):
            return str(issue["number"])
    return None


def ensure_label_exists():
    """automation-failure 라벨이 없으면 생성"""
    gh("label", "create", "automation-failure",
       "--color", "d93f0b",
       "--description", "자동화 워크플로우 반복 실패 알림")


def create_issue(workflow_name: str, run_url: str, consecutive: int,
                 error_log: str, first_failed_at: str) -> str | None:
    """GitHub Issue 생성, 생성된 Issue URL 반환"""
    ensure_label_exists()
    today_str = date.today().isoformat()
    body = f"""## 자동화 반복 실패 감지

**워크플로우**: `{workflow_name}`
**연속 실패**: {consecutive}회 (첫 실패: {first_failed_at})
**최근 실패 Run**: {run_url}
**감지 일시**: {today_str}

---

### 마지막 오류 로그

```
{error_log}
```

---

### 대응 방법

1. 위 로그에서 오류 원인 확인
2. 코드 버그라면 관련 스크립트 수정 후 커밋
3. 일시적 외부 오류(API 타임아웃 등)라면 Actions 탭에서 수동 재실행
4. 해결 완료 후 이 Issue를 닫으면 카운트가 초기화됨

> 이 Issue는 `scripts/monitor_failures.py`가 자동 생성했습니다.
"""
    rc, out, err = gh(
        "issue", "create",
        "--title", f"[자동화 실패] {workflow_name} — {consecutive}회 연속 실패",
        "--body", body,
        "--label", "automation-failure",
    )
    if rc == 0:
        return out
    print(f"  [Issue 생성 실패] {err}")
    return None


def add_comment(issue_number: str, workflow_name: str, run_url: str,
                consecutive: int, error_log: str):
    """기존 Issue에 댓글 추가"""
    today_str = date.today().isoformat()
    body = f"""### {today_str} — {consecutive}회째 연속 실패

**Run**: {run_url}

```
{error_log}
```
"""
    gh("issue", "comment", issue_number, "--body", body)


def trigger_retry(workflow_name: str):
    """워크플로우를 자동 재시도로 트리거"""
    # gh workflow run 은 workflow file name이 필요 — name으로 매핑
    WORKFLOW_FILE_MAP = {
        "Update Candidate Data": "update-candidates.yml",
        "Update Gallup National Poll": "update-gallup.yml",
        "Poll Sync (NESDC)": "update-polls.yml",
        "Update Election Overview": "update-overview.yml",
        "Update Election Stats": "update-election-stats.yml",
        "Update Governor Status": "update-governor-status.yml",
        "Update Mayor Status": "update-mayor-status.yml",
        "Update Superintendent Status": "update-superintendent-status.yml",
        "Update By-Election Data": "update-byelection.yml",
        "공보물 데이터 수집 (선관위 API)": "fetch-disclosures.yml",
        "Update Local Council Members": "update-local-council.yml",
        "Update Local Media Pool": "update-local-media.yml",
        "Sync NEC Official Candidates": "sync-official-candidates.yml",
    }
    wf_file = WORKFLOW_FILE_MAP.get(workflow_name)
    if not wf_file:
        print(f"  자동 재시도: 워크플로우 파일명 매핑 없음 — 건너뜀")
        return
    rc, out, err = gh("workflow", "run", wf_file)
    if rc == 0:
        print(f"  자동 재시도 트리거됨: {wf_file}")
    else:
        print(f"  자동 재시도 실패: {err}")


def trigger_workflow_file(workflow_file: str):
    rc, _, err = gh("workflow", "run", workflow_file)
    if rc == 0:
        print(f"  워크플로우 수동 실행 트리거됨: {workflow_file}")
        return True
    print(f"  워크플로우 수동 실행 실패: {err}")
    return False


def parse_github_datetime(value: str) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def get_latest_workflow_run(workflow_file: str) -> dict | None:
    rc, out, err = gh(
        "run", "list",
        "--workflow", workflow_file,
        "--limit", "1",
        "--json", "conclusion,createdAt,databaseId,status,url",
    )
    if rc != 0:
        print(f"  {workflow_file} 최근 실행 조회 실패: {err}")
        return None
    try:
        runs = json.loads(out)
    except json.JSONDecodeError:
        return None
    return runs[0] if runs else None


def handle_schedule_success(workflow_name: str, counts: dict):
    monitor_name = f"{workflow_name} schedule"
    if monitor_name in counts:
        handle_success(monitor_name, counts)


def handle_schedule_miss(check: dict, counts: dict, reason: str, run_url: str = ""):
    workflow_name = f"{check['name']} schedule"
    rec = counts.setdefault(workflow_name, {
        "consecutive": 0,
        "first_failed_at": None,
        "last_failed_at": None,
        "issue_created": False,
    })
    rec["consecutive"] += 1
    rec["last_failed_at"] = date.today().isoformat()
    if not rec.get("first_failed_at"):
        rec["first_failed_at"] = date.today().isoformat()

    consecutive = rec["consecutive"]
    print(f"  스케줄 누락 감지: {check['name']} ({reason}) — {consecutive}회")

    if consecutive == 1 and check.get("auto_trigger"):
        trigger_workflow_file(check["workflow"])

    if consecutive < ALERT_THRESHOLD:
        print(f"  임계치({ALERT_THRESHOLD}회) 미달 — Issue 생성 보류")
        return

    error_log = (
        f"Scheduled workflow heartbeat failed.\n"
        f"Workflow file: {check['workflow']}\n"
        f"Reason: {reason}\n"
        f"Max age: {check['max_age_hours']}h"
    )
    existing = find_open_issue(workflow_name)
    if existing:
        add_comment(existing, workflow_name, run_url, consecutive, error_log)
    else:
        create_issue(workflow_name, run_url or "(no recent run)", consecutive, error_log, rec["first_failed_at"])


def check_schedule_freshness(counts: dict) -> int:
    failures = 0
    now = datetime.now(timezone.utc)
    print("\n[스케줄 heartbeat 점검]")
    for check in SCHEDULE_FRESHNESS_CHECKS:
        latest = get_latest_workflow_run(check["workflow"])
        if not latest:
            failures += 1
            handle_schedule_miss(check, counts, "최근 실행 없음")
            continue

        created_at = parse_github_datetime(latest.get("createdAt", ""))
        if not created_at:
            failures += 1
            handle_schedule_miss(check, counts, f"createdAt 파싱 실패: {latest.get('createdAt')}", latest.get("url", ""))
            continue

        age_hours = (now - created_at).total_seconds() / 3600
        status = latest.get("status") or "-"
        conclusion = latest.get("conclusion") or "-"
        if status == "completed" and conclusion != "success":
            failures += 1
            handle_schedule_miss(
                check,
                counts,
                f"마지막 실행 실패 (status={status}, conclusion={conclusion})",
                latest.get("url", ""),
            )
            continue

        if age_hours > check["max_age_hours"]:
            failures += 1
            handle_schedule_miss(
                check,
                counts,
                f"마지막 실행 {age_hours:.1f}시간 전 (status={status}, conclusion={conclusion})",
                latest.get("url", ""),
            )
            continue

        print(f"  ✓ {check['name']} — 마지막 실행 {age_hours:.1f}시간 전 ({status}/{conclusion})")
        handle_schedule_success(check["name"], counts)
    return failures


def handle_failure(workflow_name: str, run_id: str, run_url: str, counts: dict):
    rec = counts.setdefault(workflow_name, {
        "consecutive": 0,
        "first_failed_at": None,
        "last_failed_at": None,
        "issue_created": False,
    })

    rec["consecutive"] += 1
    rec["last_failed_at"] = date.today().isoformat()
    if not rec.get("first_failed_at"):
        rec["first_failed_at"] = date.today().isoformat()

    consecutive = rec["consecutive"]
    print(f"  연속 실패 {consecutive}회 ({workflow_name})")

    # 첫 번째 실패: 자동 재시도 시도 (Issue 생성 전)
    if consecutive == AUTO_RETRY_THRESHOLD and workflow_name not in NO_AUTO_RETRY:
        print(f"  첫 실패 감지 — 자동 재시도 트리거")
        trigger_retry(workflow_name)

    if consecutive < ALERT_THRESHOLD:
        print(f"  임계치({ALERT_THRESHOLD}회) 미달 — Issue 생성 보류")
        return

    # 오류 로그 수집
    print("  오류 로그 수집 중...")
    error_log = get_failed_step_log(run_id)

    # 열린 Issue 확인
    existing = find_open_issue(workflow_name)
    if existing:
        print(f"  기존 Issue #{existing}에 댓글 추가")
        add_comment(existing, workflow_name, run_url, consecutive, error_log)
    else:
        print(f"  GitHub Issue 생성 중...")
        url = create_issue(
            workflow_name, run_url, consecutive,
            error_log, rec["first_failed_at"]
        )
        if url:
            print(f"  Issue 생성됨: {url}")
            rec["issue_created"] = True


def close_issue(issue_number: str, workflow_name: str):
    """Issue를 성공 복구 댓글과 함께 닫기"""
    today_str = date.today().isoformat()
    body = f"✅ **{today_str} — 워크플로우 성공적으로 복구됨**\n\n`{workflow_name}` 실행이 정상 완료되었습니다. Issue를 자동으로 닫습니다."
    gh("issue", "comment", issue_number, "--body", body)
    rc, _, err = gh("issue", "close", issue_number)
    if rc == 0:
        print(f"  Issue #{issue_number} 자동 닫힘")
    else:
        print(f"  Issue #{issue_number} 닫기 실패: {err}")


def handle_success(workflow_name: str, counts: dict):
    rec = counts.get(workflow_name, {})
    prev = rec.get("consecutive", 0)
    if prev > 0:
        print(f"  {workflow_name} — 성공, 연속 실패 카운트 초기화 ({prev}회 → 0)")
        # 열린 Issue가 있으면 자동으로 닫기
        existing = find_open_issue(workflow_name)
        if existing:
            close_issue(existing, workflow_name)
    counts[workflow_name] = {
        "consecutive": 0,
        "first_failed_at": None,
        "last_failed_at": None,
        "issue_created": False,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check-schedules", action="store_true", help="스케줄 workflow heartbeat 점검")
    parser.add_argument("--workflow", help="워크플로우 이름")
    parser.add_argument("--run-id", help="GitHub Run ID")
    parser.add_argument("--conclusion")
    parser.add_argument("--run-url", default="", help="Run 페이지 URL")
    args = parser.parse_args()

    if not args.check_schedules and (not args.workflow or not args.run_id or not args.conclusion):
        parser.error("--workflow, --run-id, --conclusion are required unless --check-schedules is used")

    print("=" * 55)
    print(f"  자동화 실패 모니터")
    print(f"  워크플로우: {args.workflow}")
    print(f"  결과: {args.conclusion}")
    print(f"  실행: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 55)

    counts = load_counts()

    if args.check_schedules:
        failures = check_schedule_freshness(counts)
        save_counts(counts)
        if failures:
            print(f"완료 — 스케줄 이상 {failures}건")
            return 1
        print("완료")
        return 0

    if args.conclusion in FAILURE_CONCLUSIONS:
        handle_failure(args.workflow, args.run_id, args.run_url, counts)
    elif args.conclusion == "success":
        handle_success(args.workflow, counts)
    else:
        print(f"  결과 '{args.conclusion}' — 카운트 변경 없음")

    save_counts(counts)
    print("완료")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
