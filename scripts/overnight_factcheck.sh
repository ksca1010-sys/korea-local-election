#!/bin/bash
# =============================================================
# overnight_factcheck.sh — 6.3 지방선거 전체 팩트체크 20라운드
#
# 커버리지:
#   ① 광역단체장 17명    (factcheck_candidates.py)
#   ② 교육감 17명        (factcheck_superintendent.py)
#   ③ 기초단체장 786명+  (factcheck_mayor.py)
#   ④ 광역의원 777명+    (factcheck_council.py)
#   ⑤ 기초의원 2614명+   (factcheck_local_council.py)
#   ⑥ 보궐선거           (factcheck_byelection.py)
#   ⑦ 경력 보강          (fill_missing_careers.py)
#
# 실행: bash scripts/overnight_factcheck.sh
# 중단: Ctrl+C
# 로그: logs/overnight_factcheck_YYYYMMDD_HHMMSS.log
# =============================================================

set -uo pipefail
cd "$(dirname "$0")/.."

# ── 설정 ──────────────────────────────────────────────────────
TOTAL_ROUNDS=20
ROUND_SLEEP=600          # 라운드 사이 최소 대기 10분 (실행시간 포함 ~25-30분/라운드)

LOGDIR="logs"
mkdir -p "$LOGDIR"
LOGFILE="$LOGDIR/overnight_factcheck_$(date +%Y%m%d_%H%M%S).log"

# 기초의원 시도 순환 배열 (15개 시도)
LOCAL_COUNCIL_REGIONS=(seoul busan daegu incheon gwangju daejeon ulsan
                        gyeonggi gangwon chungbuk chungnam jeonbuk jeonnam
                        gyeongbuk gyeongnam)

# ── 유틸 ──────────────────────────────────────────────────────
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOGFILE"
}

run_py() {
    local label="$1"; shift
    local timeout_sec="${STEP_TIMEOUT:-1200}"   # 기본 20분 타임아웃
    log "  ▶ $label 시작 (최대 ${timeout_sec}초)"

    # macOS 호환 타임아웃: 백그라운드 + 킬 타이머
    python3 "$@" >> "$LOGFILE" 2>&1 &
    local PY_PID=$!
    # 타이머: timeout_sec 후 강제 종료
    ( sleep "$timeout_sec" && kill "$PY_PID" 2>/dev/null && \
      echo "[$(date '+%Y-%m-%d %H:%M:%S')]   ⏱ $label 타임아웃 강제종료" >> "$LOGFILE" ) &
    local TIMER_PID=$!
    wait "$PY_PID"
    local code=$?
    kill "$TIMER_PID" 2>/dev/null
    wait "$TIMER_PID" 2>/dev/null

    if [ $code -eq 0 ]; then
        log "  ✓ $label 완료"
        return 0
    elif [ $code -eq 143 ] || [ $code -eq 137 ]; then
        log "  ⏱ $label 타임아웃 (${timeout_sec}초) — 다음 단계로"
        return 1
    else
        log "  ✗ $label 오류(exit $code) — 다음 단계로"
        return 1
    fi
}

commit_if_changed() {
    local round="$1"
    CHANGED=$(git diff --name-only data/candidates/ 2>/dev/null | wc -l | tr -d ' ')
    if [ "$CHANGED" -gt 0 ]; then
        log "  [커밋] 변경 파일 ${CHANGED}개..."
        git add data/candidates/ >> "$LOGFILE" 2>&1
        git commit -m "chore: overnight factcheck round ${round} — $(date '+%Y-%m-%d %H:%M')" \
            >> "$LOGFILE" 2>&1 || true
        log "  [커밋] 완료"
    fi
}

# ── 시작 ──────────────────────────────────────────────────────
log "============================================================"
log "  6.3 지방선거 전체 팩트체크 — ${TOTAL_ROUNDS}라운드"
log "  로그: $LOGFILE"
log "============================================================"
log ""
log "커버리지:"
log "  ① 광역단체장 17명  ② 교육감 17명  ③ 기초단체장 786명+"
log "  ④ 광역의원 777명+  ⑤ 기초의원 2614명+  ⑥ 보궐선거  ⑦ 경력보강"
log ""

# ── 20라운드 루프 ─────────────────────────────────────────────
for (( ROUND=1; ROUND<=TOTAL_ROUNDS; ROUND++ )); do
    ROUND_START=$(date +%s)
    log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log "  ROUND ${ROUND} / ${TOTAL_ROUNDS}  시작"
    log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    # ① 광역단체장 — 매 라운드
    run_py "광역단체장" scripts/candidate_pipeline/factcheck_candidates.py

    # ② 교육감 — 매 라운드
    run_py "교육감" scripts/candidate_pipeline/factcheck_superintendent.py

    # ③ 기초단체장 — 매 라운드 (핵심)
    run_py "기초단체장" scripts/candidate_pipeline/factcheck_mayor.py

    # ④ 광역의원 — 홀수 라운드 (1, 3, 5 ...)
    if (( ROUND % 2 == 1 )); then
        run_py "광역의원" scripts/candidate_pipeline/factcheck_council.py
    else
        log "  ⓘ 광역의원 — 이번 라운드 스킵 (짝수)"
    fi

    # ⑤ 기초의원 — 매 라운드 시도 순환 (15개 시도 / 20라운드)
    LC_IDX=$(( (ROUND - 1) % ${#LOCAL_COUNCIL_REGIONS[@]} ))
    LC_REGION="${LOCAL_COUNCIL_REGIONS[$LC_IDX]}"
    run_py "기초의원(${LC_REGION})" \
        scripts/candidate_pipeline/factcheck_local_council.py --region "$LC_REGION"

    # ⑥ 보궐선거 — 매 라운드
    run_py "보궐선거" scripts/candidate_pipeline/factcheck_byelection.py

    # ⑦ 경력 보강 — 4라운드마다 (5, 10, 15, 20라운드)
    if (( ROUND % 4 == 0 )); then
        run_py "경력보강" scripts/candidate_pipeline/fill_missing_careers.py
    else
        log "  ⓘ 경력보강 — 이번 라운드 스킵 (${ROUND}라운드, 4의 배수만)"
    fi

    # ── 커밋 ──────────────────────────────────────────────────
    commit_if_changed "$ROUND"

    # ── 다음 라운드까지 대기 ──────────────────────────────────
    ROUND_END=$(date +%s)
    ELAPSED=$(( ROUND_END - ROUND_START ))
    REMAINING=$(( ROUND_SLEEP - ELAPSED ))
    log ""
    log "  ROUND ${ROUND} 완료 (소요: ${ELAPSED}초)"

    if [ "$ROUND" -lt "$TOTAL_ROUNDS" ]; then
        if [ "$REMAINING" -gt 0 ]; then
            log "  다음 라운드까지 ${REMAINING}초 대기..."
            sleep "$REMAINING"
        else
            log "  (대기 없이 바로 다음 라운드)"
        fi
    fi
    log ""
done

# ── 최종 집계 ─────────────────────────────────────────────────
log "============================================================"
log "  전체 ${TOTAL_ROUNDS}라운드 완료!"
log ""
log "  최종 후보자 현황:"
python3 - >> "$LOGFILE" 2>&1 <<'PYEOF'
import json, glob

def count(pattern):
    total, expected, declared = 0, 0, 0
    for f in glob.glob(pattern):
        d = json.loads(open(f).read())
        cands = d.get("candidates", d)
        if isinstance(cands, dict):
            for v in cands.values():
                items = v if isinstance(v, list) else []
                for c in items:
                    total += 1
                    s = c.get("status", "")
                    if s == "EXPECTED": expected += 1
                    elif s in ("DECLARED", "NOMINATED"): declared += 1
    return total, expected, declared

labels = [
    ("광역단체장", "data/candidates/governor.json"),
    ("교육감",     "data/candidates/superintendent.json"),
    ("기초단체장", "data/candidates/mayor_candidates.json"),
    ("광역의원",   "data/candidates/council/*.json"),
    ("기초의원",   "data/candidates/local_council/*.json"),
]
for label, pat in labels:
    if "*" in pat:
        t, e, d = count(pat)
    else:
        try:
            data = json.loads(open(pat).read())
            cands = data.get("candidates", data)
            t = sum(len(v) if isinstance(v, list) else 0 for v in cands.values()) if isinstance(cands, dict) else 0
            e = sum(1 for v in (cands.values() if isinstance(cands,dict) else []) for c in (v if isinstance(v,list) else []) if c.get("status")=="EXPECTED")
            d = sum(1 for v in (cands.values() if isinstance(cands,dict) else []) for c in (v if isinstance(v,list) else []) if c.get("status") in ("DECLARED","NOMINATED"))
        except:
            t, e, d = 0, 0, 0
    print(f"  {label:10}: 총 {t:4}명  출마선언/공천 {d:3}명  현직예상 {e:4}명")
PYEOF

log "============================================================"
log "  로그 저장: $LOGFILE"
