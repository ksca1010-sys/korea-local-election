#!/usr/bin/env python3
"""Static guardrails for election automation workflows.

This catches the class of regressions where a workflow step is allowed to fail
but its outcome is never surfaced, or where a new data workflow is not watched
by the failure monitor.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
WORKFLOW_DIR = ROOT / ".github" / "workflows"
MONITOR_WORKFLOW = WORKFLOW_DIR / "monitor-failures.yml"
MONITOR_SCRIPT = ROOT / "scripts" / "monitor_failures.py"
QUALITY_GATE = ROOT / "scripts" / "run_quality_gate.js"
DEPLOY_SCRIPT = ROOT / "deploy.sh"

ALLOW_COMMENT = "automation-guard: allow-continue-on-error"

IGNORED_WORKFLOWS = {
    "monitor-failures.yml",
}

NO_AUTO_RETRY_NAMES = {
    "Data Health Check",
}

CRITICAL_DATA_FILES = {
    "data/static/gallup_national_poll.json",
    "data/candidates/governor.json",
    "data/candidates/superintendent.json",
    "data/candidates/mayor_candidates.json",
    "data/candidates/byelection.json",
    "data/election_stats.json",
    "data/candidates/governor_status.json",
    "data/candidates/mayor_status.json",
    "data/candidates/superintendent_status.json",
    "data/election_overview.json",
}


def workflow_name(text: str) -> str | None:
    match = re.search(r"(?m)^name:\s*(.+?)\s*$", text)
    if not match:
        return None
    return match.group(1).strip().strip('"').strip("'")


def monitored_names() -> set[str]:
    text = MONITOR_WORKFLOW.read_text(encoding="utf-8")
    return set(re.findall(r'^\s*-\s+"([^"]+)"\s*$', text, flags=re.MULTILINE))


def retry_map_names() -> set[str]:
    text = MONITOR_SCRIPT.read_text(encoding="utf-8")
    return set(re.findall(r'"([^"]+)":\s*"[^"]+\.yml"', text))


def step_blocks(lines: list[str]) -> list[tuple[int, int, list[str]]]:
    starts = [i for i, line in enumerate(lines) if re.match(r"^\s+- name:\s+", line)]
    blocks: list[tuple[int, int, list[str]]] = []
    for index, start in enumerate(starts):
        end = starts[index + 1] if index + 1 < len(starts) else len(lines)
        blocks.append((start + 1, end, lines[start:end]))
    return blocks


def step_name(block: list[str]) -> str:
    for line in block:
        match = re.match(r"^\s+- name:\s*(.+?)\s*$", line)
        if match:
            return match.group(1).strip()
    return "(unknown step)"


def step_id(block: list[str]) -> str | None:
    for line in block:
        match = re.match(r"^\s+id:\s*([A-Za-z0-9_-]+)\s*$", line)
        if match:
            return match.group(1)
    return None


def has_allow_comment(block: list[str]) -> bool:
    return any(ALLOW_COMMENT in line for line in block)


def check_continue_on_error_gates(errors: list[str]) -> None:
    for path in sorted(WORKFLOW_DIR.glob("*.yml")):
        if path.name in IGNORED_WORKFLOWS:
            continue

        text = path.read_text(encoding="utf-8")
        lines = text.splitlines()
        for start, _end, block in step_blocks(lines):
            if not any("continue-on-error: true" in line for line in block):
                continue
            if has_allow_comment(block):
                continue

            sid = step_id(block)
            name = step_name(block)
            if not sid:
                errors.append(
                    f"{path.relative_to(ROOT)}:{start}: '{name}' uses "
                    "continue-on-error without an id or allow comment"
                )
                continue

            if f"steps.{sid}.outcome" not in text:
                errors.append(
                    f"{path.relative_to(ROOT)}:{start}: '{name}' outcome "
                    f"({sid}) is not checked later in the workflow"
                )


def check_monitor_coverage(errors: list[str]) -> None:
    watched = monitored_names()
    retryable = retry_map_names()

    for path in sorted(WORKFLOW_DIR.glob("*.yml")):
        if path.name in IGNORED_WORKFLOWS:
            continue
        text = path.read_text(encoding="utf-8")
        name = workflow_name(text)
        if not name:
            errors.append(f"{path.relative_to(ROOT)}: missing workflow name")
            continue

        if "schedule:" in text or "workflow_dispatch:" in text:
            if name not in watched:
                errors.append(
                    f"{path.relative_to(ROOT)}: workflow '{name}' is not "
                    "listed in monitor-failures.yml"
                )
            if name not in NO_AUTO_RETRY_NAMES and name not in retryable:
                errors.append(
                    f"{path.relative_to(ROOT)}: workflow '{name}' is monitored "
                    "but has no auto-retry mapping in monitor_failures.py"
                )


def check_shared_guards(errors: list[str]) -> None:
    quality_text = QUALITY_GATE.read_text(encoding="utf-8")
    deploy_text = DEPLOY_SCRIPT.read_text(encoding="utf-8")
    health_text = (ROOT / "scripts" / "data_health_check.py").read_text(encoding="utf-8")
    freshness_text = (ROOT / "scripts" / "check_deploy_freshness.py").read_text(
        encoding="utf-8"
    )

    if "check_automation_guards.py" not in quality_text:
        errors.append("scripts/run_quality_gate.js does not run check_automation_guards.py")
    if "check_deploy_freshness.py" not in deploy_text:
        errors.append("deploy.sh does not run check_deploy_freshness.py")
    if "raise SystemExit(main())" not in health_text:
        errors.append("scripts/data_health_check.py does not propagate failure exit codes")

    missing_health = sorted(
        path
        for path in CRITICAL_DATA_FILES
        if path.removeprefix("data/") not in health_text
    )
    if missing_health:
        errors.append(
            "scripts/data_health_check.py freshness rules missing: "
            + ", ".join(missing_health)
        )

    missing_deploy = sorted(path for path in CRITICAL_DATA_FILES if path not in freshness_text)
    allowed_absent = {"data/candidates/byelection.json"}
    missing_deploy = [path for path in missing_deploy if path not in allowed_absent]
    if missing_deploy:
        errors.append(
            "scripts/check_deploy_freshness.py watched files missing: "
            + ", ".join(missing_deploy)
        )


def check_nec_secret_usage(errors: list[str]) -> None:
    legacy_secret_names = ("NECDC_CODE", "NDCDC_LOCAL", "NDCDC_PAPER", "NDCDC_PERSON")
    for path in sorted(WORKFLOW_DIR.glob("*.yml")):
        text = path.read_text(encoding="utf-8")
        uses_nec = any(name in text for name in legacy_secret_names)
        if not uses_nec:
            continue
        if "NEC_API_KEY: ${{ secrets.NEC_API_KEY }}" not in text:
            errors.append(
                f"{path.relative_to(ROOT)}: NEC workflow must expose "
                "secrets.NEC_API_KEY"
            )
        if 'KEY="${NEC_API_KEY:-' not in text:
            errors.append(
                f"{path.relative_to(ROOT)}: NEC workflow must prefer NEC_API_KEY "
                "before legacy keys"
            )


def main() -> int:
    errors: list[str] = []
    check_continue_on_error_gates(errors)
    check_monitor_coverage(errors)
    check_shared_guards(errors)
    check_nec_secret_usage(errors)

    if errors:
        print("automation guard failed:")
        for error in errors:
            print(f"  - {error}")
        return 1

    print("automation guard passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
