#!/bin/bash
# =============================================================
# overnight_runner.sh — 밤새 자동 데이터 업데이트
#
# 실행: bash scripts/overnight_runner.sh
# 로그: logs/overnight_YYYYMMDD.log
# 종료: Ctrl+C
# =============================================================

set -euo pipefail
cd "$(dirname "$0")/.."

LOGDIR="logs"
mkdir -p "$LOGDIR"
LOGFILE="$LOGDIR/overnight_$(date +%Y%m%d_%H%M%S).log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOGFILE"
}

log "===== overnight_runner 시작 ====="
log "로그: $LOGFILE"

# 실행 간격 설정
FACTCHECK_INTERVAL=1800    # 팩트체크: 30분마다
CAREER_INTERVAL=7200       # 경력 보강: 2시간마다
MEDIA_DONE=false           # 언론사 풀: 한 번만

last_factcheck=0
last_career=0
run_count=0
TOTAL_FACTCHECK=0
TOTAL_CAREER=0

while true; do
    NOW=$(date +%s)

    # ── 언론사 풀 탐색 (한 번만) ──────────────────────────
    if [ "$MEDIA_DONE" = "false" ]; then
        log ">>> [언론사 풀] discover_local_media.py 시작..."
        if python3 scripts/discover_local_media.py >> "$LOGFILE" 2>&1; then
            log "    완료"
        else
            log "    [오류] discover_local_media 실패"
        fi
        MEDIA_DONE=true
    fi

    # ── 팩트체크 (30분마다) ───────────────────────────────
    SINCE_FACTCHECK=$((NOW - last_factcheck))
    if [ $SINCE_FACTCHECK -ge $FACTCHECK_INTERVAL ]; then
        run_count=$((run_count + 1))
        log ">>> [팩트체크 #${run_count}] factcheck_mayor.py 시작..."
        if python3 scripts/candidate_pipeline/factcheck_mayor.py >> "$LOGFILE" 2>&1; then
            TOTAL_FACTCHECK=$((TOTAL_FACTCHECK + 1))
            log "    완료 (누적 ${TOTAL_FACTCHECK}회)"
        else
            log "    [오류] factcheck_mayor 실패"
        fi
        last_factcheck=$(date +%s)
    fi

    # ── 경력 보강 (2시간마다) ─────────────────────────────
    SINCE_CAREER=$((NOW - last_career))
    if [ $SINCE_CAREER -ge $CAREER_INTERVAL ]; then
        log ">>> [경력 보강] fill_missing_careers.py 시작..."
        if python3 scripts/candidate_pipeline/fill_missing_careers.py >> "$LOGFILE" 2>&1; then
            TOTAL_CAREER=$((TOTAL_CAREER + 1))
            log "    완료 (누적 ${TOTAL_CAREER}회)"
        else
            log "    [오류] fill_missing_careers 실패"
        fi
        last_career=$(date +%s)
    fi

    # ── git 커밋 (변경이 있으면) ──────────────────────────
    CHANGED=$(git diff --name-only data/candidates/ data/local_media_pool.json 2>/dev/null | wc -l | tr -d ' ')
    if [ "$CHANGED" -gt 0 ]; then
        log ">>> [커밋] 변경된 파일 ${CHANGED}개 커밋..."
        git add data/candidates/ data/local_media_pool.json >> "$LOGFILE" 2>&1
        git commit -m "chore: overnight auto-update $(date +%Y-%m-%d\ %H:%M)" >> "$LOGFILE" 2>&1 || true
        log "    커밋 완료"
    fi

    log "    다음 팩트체크까지 $((FACTCHECK_INTERVAL - ($(date +%s) - last_factcheck)))초 대기..."
    sleep 60  # 1분마다 루프 체크
done
