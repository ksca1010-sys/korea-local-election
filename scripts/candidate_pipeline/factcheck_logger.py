"""팩트체크 파이프라인 구조화 로그

logs/factcheck-{stage}-{YYYY-MM-DD}.jsonl 에 라인별 JSON을 append 한다.
이벤트: run_start / region / run_end

사용법:
    from factcheck_logger import FactcheckLogger
    log = FactcheckLogger("mayor", dry_run=False)
    log.region("seoul", candidate_count=25, news_count=30,
               changes_detected=4, changes_verified=3, applied=3)
    log.run_end(total_applied=12)
"""

import json
from datetime import date, datetime
from pathlib import Path

LOG_DIR = Path(__file__).resolve().parent.parent.parent / "logs"


class FactcheckLogger:
    def __init__(self, stage: str, dry_run: bool = False):
        self.stage = stage
        self.dry_run = dry_run
        self.started_at = datetime.now().isoformat(timespec="seconds")
        self.regions: list[dict] = []
        self.errors: list[dict] = []
        self.llm_calls = 0
        self.llm_failures = 0
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        self.path = LOG_DIR / f"factcheck-{stage}-{date.today().isoformat()}.jsonl"
        self._emit({
            "event": "run_start",
            "stage": stage,
            "dryRun": dry_run,
            "timestamp": self.started_at,
        })

    def _emit(self, obj: dict) -> None:
        with self.path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(obj, ensure_ascii=False) + "\n")

    def region(
        self,
        region_key: str,
        *,
        candidate_count: int = 0,
        news_count: int = 0,
        changes_detected: int = 0,
        changes_verified: int = 0,
        applied: int = 0,
        error: str | None = None,
    ) -> None:
        record = {
            "event": "region",
            "stage": self.stage,
            "region": region_key,
            "candidates": candidate_count,
            "news": news_count,
            "detected": changes_detected,
            "verified": changes_verified,
            "applied": applied,
            "error": error,
            "timestamp": datetime.now().isoformat(timespec="seconds"),
        }
        self.regions.append(record)
        if error:
            self.errors.append({"region": region_key, "error": error})
            self.llm_failures += 1
        else:
            self.llm_calls += 1
        self._emit(record)

    def run_end(self, total_applied: int = 0) -> None:
        summary = {
            "event": "run_end",
            "stage": self.stage,
            "dryRun": self.dry_run,
            "startedAt": self.started_at,
            "endedAt": datetime.now().isoformat(timespec="seconds"),
            "regionsProcessed": len(self.regions),
            "llmCalls": self.llm_calls,
            "llmFailures": self.llm_failures,
            "errors": self.errors,
            "totalApplied": total_applied,
        }
        self._emit(summary)
        print(
            f"[factcheck-log] {self.path.name}: "
            f"{self.llm_calls}성공 / {self.llm_failures}실패, 적용 {total_applied}건"
        )
