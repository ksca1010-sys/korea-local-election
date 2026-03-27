#!/bin/bash
# =============================================================
# nec_auto_update.sh — 선관위 API 전용 자동 업데이트 (비용 0원)
#
# 실행: bash scripts/nec_auto_update.sh
# 1회 실행 후 종료 (crontab에 등록하여 주기적 실행)
#
# crontab 예시 (매일 09:00, 18:00):
#   0 9,18 * * * cd /path/to/korea-local-election && bash scripts/nec_auto_update.sh
# =============================================================

set -euo pipefail
cd "$(dirname "$0")/.."

LOGDIR="logs"
mkdir -p "$LOGDIR"
LOGFILE="$LOGDIR/nec_update_$(date +%Y%m%d_%H%M%S).log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOGFILE"
}

# .env 파일에서 환경변수 로드
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

log "===== 선관위 API 자동 업데이트 시작 ====="

ERRORS=0

# 1. 예비후보 등록현황 동기화 (광역+기초 전체)
log ">>> [1/4] 예비후보 등록현황 동기화..."
if python3 scripts/candidate_pipeline/nec_precand_sync.py >> "$LOGFILE" 2>&1; then
    log "    완료"
else
    log "    [오류] nec_precand_sync 실패"
    ERRORS=$((ERRORS + 1))
fi

# 2. 광역의원 후보 수집
log ">>> [2/4] 광역의원 후보 수집..."
if python3 scripts/candidate_pipeline/fetch_council_candidates_nec.py >> "$LOGFILE" 2>&1; then
    log "    완료"
else
    log "    [오류] fetch_council_candidates_nec 실패"
    ERRORS=$((ERRORS + 1))
fi

# 3. 현직자 정보 보강
log ">>> [3/4] 현직자 정보 보강..."
if python3 scripts/candidate_pipeline/enrich_incumbents.py >> "$LOGFILE" 2>&1; then
    log "    완료"
else
    log "    [오류] enrich_incumbents 실패"
    ERRORS=$((ERRORS + 1))
fi

# 4. 재보궐 당선자 동기화
log ">>> [4/4] 재보궐 동기화..."
if python3 scripts/candidate_pipeline/sync_byelection_winners.py >> "$LOGFILE" 2>&1; then
    log "    완료"
else
    log "    [오류] sync_byelection_winners 실패"
    ERRORS=$((ERRORS + 1))
fi

# git 커밋 (변경이 있으면)
CHANGED=$(git diff --name-only data/candidates/ data/static/incumbents.json 2>/dev/null | wc -l | tr -d ' ')
if [ "$CHANGED" -gt 0 ]; then
    log ">>> [커밋] 변경된 파일 ${CHANGED}개..."
    git add data/candidates/ data/static/incumbents.json >> "$LOGFILE" 2>&1
    git commit -m "chore: NEC API auto-update $(date +%Y-%m-%d\ %H:%M)" >> "$LOGFILE" 2>&1 || true
    log "    커밋 완료"
else
    log "    변경 없음 — 커밋 생략"
fi

log "===== 완료 (오류: ${ERRORS}건) ====="
