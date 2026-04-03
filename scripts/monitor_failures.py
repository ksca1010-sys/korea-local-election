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
from datetime import date, datetime
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
FAILURE_COUNTS_PATH = BASE_DIR / "data" / ".failure_counts.json"

ALERT_THRESHOLD = 2   # 연속 N회 실패 시 Issue 생성


def load_counts() -> dict:
    if FAILURE_COUNTS_PATH.exists():
        try:
            return json.loads(FAILURE_COUNTS_PATH.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def save_counts(counts: dict):
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


def handle_success(workflow_name: str, counts: dict):
    rec = counts.get(workflow_name, {})
    prev = rec.get("consecutive", 0)
    if prev > 0:
        print(f"  {workflow_name} — 성공, 연속 실패 카운트 초기화 ({prev}회 → 0)")
    counts[workflow_name] = {
        "consecutive": 0,
        "first_failed_at": None,
        "last_failed_at": None,
        "issue_created": False,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--workflow", required=True, help="워크플로우 이름")
    parser.add_argument("--run-id", required=True, help="GitHub Run ID")
    parser.add_argument("--conclusion", required=True,
                        choices=["success", "failure", "cancelled", "skipped"])
    parser.add_argument("--run-url", default="", help="Run 페이지 URL")
    args = parser.parse_args()

    print("=" * 55)
    print(f"  자동화 실패 모니터")
    print(f"  워크플로우: {args.workflow}")
    print(f"  결과: {args.conclusion}")
    print(f"  실행: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 55)

    counts = load_counts()

    if args.conclusion == "failure":
        handle_failure(args.workflow, args.run_id, args.run_url, counts)
    elif args.conclusion == "success":
        handle_success(args.workflow, counts)
    else:
        print(f"  결과 '{args.conclusion}' — 카운트 변경 없음")

    save_counts(counts)
    print("완료")


if __name__ == "__main__":
    main()
