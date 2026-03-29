# Phase 5: 여론조사 보완 - Research

**Researched:** 2026-03-29
**Domain:** Python PDF 파싱(pdfplumber), GitHub Actions cron, 공직선거법 공표금지 브라우저 검증
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**A. 빈값 채우기 (POLL-01)**
- D-01: `python scripts/reparse_pdfs.py` 실행 — PDF가 모두 `data/polls/pdfs/{nttId}.pdf`에 존재하므로 자동 파싱 우선
- D-02: 파싱 실패 건(pdfplumber 추출 불가)은 NESDC 원본 페이지 수동 확인 후 수치 기입
  - 실패 건 기준: `reparse_pdfs.py` 실행 후 `results: []` 남은 항목
  - 수동 확인 출처: `sourceUrl` 필드의 NESDC 상세 페이지 → PDF 결과표 직접 열람
- D-03: Gemini PDF 폴백(`gemini_parse_polls.py`)은 사용하지 않음 (헌법 제2조: LLM 생성 수치 불신)
- D-04: 처리 완료 기준: `data/polls/polls.json` 기준 32건 모두 `results` 비어있지 않음

**B. 파이프라인 지속 수집 운영 (POLL-02)**
- D-05: GitHub Actions daily cron으로 자동화
  - 파일: `.github/workflows/poll-sync.yml`
  - 스케줄: 매일 KST 09:00 (UTC 00:00) — 전날 등록 여론조사 수집
  - 실행 순서: `nesdc_poll_pipeline.py` → `reparse_pdfs.py` → 변경 있으면 `git commit && git push`
  - Cloudflare Pages가 push 감지 → 자동 배포
- D-06: GitHub Secrets에 필요한 값:
  - `CLOUDFLARE_API_TOKEN` — Pages 배포 트리거용 (이미 있으면 재사용)
  - GitHub Actions 기본 `GITHUB_TOKEN`으로 commit/push 가능
- D-07: 커밋 메시지 형식: `data: poll sync {날짜} — {신규 N건, 업데이트 M건}`
- D-08: 5/27 이후(공표금지 직전) 마지막 실행 후 workflow를 수동으로 disable — 공표금지 기간 중 자동 수집 불필요

**C. Audit 오류 처리**
- D-09: Phase 5 범위 밖 — pre_phase_action으로 즉시 hotfix 처리
- D-10: Phase 5 플래너는 hotfix 완료를 전제로 계획 수립

**D. 공표금지 자동 숨김 검증**
- D-11: 날짜 mock 브라우저 테스트로 검증
  - `js/election-calendar.js`의 `getKST()` 함수를 임시로 `2026-05-28T01:00:00+09:00` 반환하도록 수정
  - 로컬 브라우저에서 여론조사 탭 열어 빈 상태(`공표금지 기간` 메시지) 확인
  - 테스트 후 원복 커밋
- D-12: 검증 항목:
  1. 여론조사 탭: 데이터 숨김 + 공표금지 안내 메시지 표시
  2. 경계값: 5/27 23:59 → 정상 표시, 5/28 00:00 → 숨김
  3. 종료 경계: 6/3 17:59 → 숨김, 6/3 18:00 → 정상 표시 (법적 요건)

### Claude's Discretion
- GitHub Actions workflow 세부 구현 (steps, Python 버전, pip cache 등)
- `reparse_pdfs.py` 실패 건 수동 확인 시 어떤 형식으로 수치를 입력할지
- Cloudflare Pages 자동 배포 연동 방식 (webhook vs API 직접 호출)
- `poll-sync.yml` 실패 시 알림 방법 (GitHub Actions 기본 이메일 알림으로 충분)

### Deferred Ideas (OUT OF SCOPE)
- 새로운 UI 기능, 여론조사 탭 디자인 변경
- 파이프라인 이외 스크립트 수정
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| POLL-01 | 사용자가 여론조사 빈값(지지율 누락) 15건을 채운 최신 데이터를 볼 수 있다 | PDF 파싱 실패 원인 규명 완료: 32건 분류(설문지-only 9건, 보고서형 23건). 파싱 로직이 다중-헤더 교차분석표 포맷 인식 못하는 것이 주요 원인. `reparse_pdfs.py` 실행 후 잔여 실패 건 수동 확인 절차 확인 |
| POLL-02 | 선거일까지 신규 여론조사를 파이프라인으로 지속 추가할 수 있다 (수동 재실행 가능) | 기존 `update-polls.yml` 워크플로우 존재 확인. D-05의 `poll-sync.yml`은 기존 워크플로우를 대체하거나 통합하는 방향으로 구현 가능 |
</phase_requirements>

---

## Summary

Phase 5는 세 개의 독립적인 작업 묶음으로 구성된다.

**POLL-01 (빈값 채우기):** 현재 `data/polls/polls.json`에 36건 빈값이 존재한다 (REQUIREMENTS.md는 15건이지만 실측은 36건 — party_support 4건 제외 시 지방선거 지역조사 32건). `reparse_pdfs.py` 실행 결과 32건 모두 PDF 파일이 존재하지만 자동 파싱이 실패한다. 원인 분류: (1) 설문지-only PDF 9건 — 결과표가 별도 첨부로 존재하거나 NESDC 상세 페이지에서 직접 확인 필요, (2) 보고서형 PDF 23건 — 결과표 텍스트가 존재하지만 `parse_pdf_results` 로직이 다중-행 헤더(후보명이 여러 줄에 걸쳐 분할된 교차분석표 포맷)를 인식하지 못하여 파싱 실패. D-01/D-02 결정대로 `reparse_pdfs.py` 먼저 실행하고 남은 건 수동 확인이 현실적인 접근이다.

**POLL-02 (파이프라인 지속 운영):** 기존 `.github/workflows/update-polls.yml`이 이미 존재한다 (KST 09:00, 18:00 두 번 실행). D-05가 요구하는 `poll-sync.yml`은 새 파일로 만들되 기존 `update-polls.yml`과 중복을 피하도록 기존 워크플로우를 리네임하거나 D-05 규격(단 1회 실행, 커밋 메시지 형식 준수)으로 교체하는 것이 깔끔하다. `reparse_pdfs.py`를 파이프라인 직후에 실행하는 단계 추가가 필요하다.

**공표금지 브라우저 검증:** `js/election-calendar.js`의 `isPublicationBanned()` 함수와 `poll-tab.js`의 공표금지 분기가 이미 구현되어 있다. D-11/D-12의 날짜 mock 테스트는 `getKST()` 함수 1줄 수정으로 가능하며, 세 경계값(5/27 23:59, 5/28 00:00, 6/3 18:00)을 순서대로 검증하면 된다.

**Primary recommendation:** `reparse_pdfs.py` 실행 → 잔여 실패건 수동 확인 → 기존 `update-polls.yml`을 D-05 규격으로 교체(또는 rename) → 공표금지 경계값 3개 mock 테스트 순으로 진행한다.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| pdfplumber | 0.11.9 | PDF 텍스트/표 추출 | 이미 설치됨, 파이프라인 전체에서 사용 중 |
| httpx | 0.28.1 | NESDC 웹 크롤링 | 이미 설치됨, `nesdc_poll_pipeline.py` 의존성 |
| beautifulsoup4 | 설치됨 | HTML 파싱 | 이미 설치됨, 파이프라인 전체에서 사용 중 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| GitHub Actions | — | daily cron 자동화 | POLL-02 파이프라인 스케줄링 |
| Cloudflare Pages | — | push 감지 자동 배포 | GitHub push 후 자동 트리거됨 |

**버전 확인 (실측):**
- Python: 3.14.2 (로컬), GitHub Actions는 3.11 사용 (기존 `update-polls.yml` 기준)
- pdfplumber: 0.11.9
- httpx: 0.28.1

---

## Architecture Patterns

### 현재 데이터 플로우

```
NESDC 사이트
  → nesdc_poll_pipeline.py (증분 수집, last_id 기준)
  → data/polls/state.json (작업 상태: polls[] 배열 + last_id)
  → export_frontend_json() 호출
  → data/polls/polls.json (프론트엔드 서빙)
      구조: {generated, totalCount, source, national:[], regions:{}}
```

### reparse_pdfs.py 동작 구조

`reparse_pdfs.py`는 `state.json`의 `polls[]` 배열을 직접 수정한다:
1. `state.json` 로드
2. `results: []` 인 항목 필터링
3. 각 항목에 대해 PDF 재파싱 (`parse_pdf_results()`)
4. 성공 시 `poll["results"]` 업데이트
5. 완료 후 `save_state()` + `export_frontend_json()` 호출 → `state.json` + `polls.json` 동시 갱신

### 기존 GitHub Actions 워크플로우 현황

`.github/workflows/update-polls.yml`이 이미 존재하며 다음을 수행한다:
- 스케줄: KST 09:00 (UTC 00:00), KST 18:00 (UTC 09:00) — 하루 두 번
- 실행: `nesdc_poll_pipeline.py` 만 실행 (reparse_pdfs.py 미포함)
- 커밋: `chore: auto-update poll data {YYYY-MM-DD}` 형식

D-05는 `poll-sync.yml`이라는 새 이름을 명시하지만, 기존 `update-polls.yml`을 수정하거나 교체하는 것이 더 명확하다. 두 파일을 동시에 두면 중복 실행된다.

### 공표금지 로직 현재 구현 위치

```
js/election-calendar.js
  getKST()              — 시간 기준점 (mock 수정 대상)
  DATES.PUBLICATION_BAN_START = 2026-05-28T00:00:00+09:00
  DATES.VOTE_END         = 2026-06-03T18:00:00+09:00
  isPublicationBanned() — now >= BAN_START && now < VOTE_END

js/tabs/poll-tab.js
  renderPollTab() 내부 (라인 ~486)
    if (ElectionCalendar.isPublicationBanned()) {
        → 섹션 숨김 + 안내 메시지 표시
    }
```

### 빈값 32건 분류 (실측)

| 분류 | 건수 | 설명 | 처리 방법 |
|------|------|------|-----------|
| 설문지-only PDF (2페이지 이하) | 9건 | 결과표 미첨부 — 설문지만 등록 | NESDC 상세 페이지에서 별도 결과표 PDF 또는 HTML 직접 확인 |
| 보고서형 PDF (3페이지+) 파싱 실패 | 23건 | 결과표 있으나 다중-행 헤더 포맷 | `reparse_pdfs.py` 재실행 후 잔여건은 수동 확인 |
| party_support (전국 정당조사) | 4건 | 지방선거 후보 없는 전국 조사 — 빈값 정상 | 처리 불필요 (정상 상태) |

**중요:** REQUIREMENTS.md의 "15건"과 실제 빈값 수(32건 지역조사)가 불일치한다. D-04 완료 기준은 "32건 모두 results 비어있지 않음"으로 해석하되, party_support 4건은 제외한다.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 여론조사 PDF 결과 추출 | 직접 정규식/테이블 파서 작성 | `parse_pdf_results()` 기존 함수 + pdfplumber | 기존 파이프라인에 4가지 전략 내장됨 |
| NESDC 증분 수집 | 새 크롤러 작성 | `nesdc_poll_pipeline.py` 기존 스크립트 | last_id 기반 상태 관리 이미 구현됨 |
| GitHub Actions cron | 별도 외부 스케줄러 | `.github/workflows/*.yml` 기존 패턴 | 프로젝트에 이미 12개 워크플로우 존재 |
| 공표금지 날짜 판정 | 날짜 문자열 비교 | `ElectionCalendar.isPublicationBanned()` | CLAUDE.md 규칙: 문자열 날짜 비교 금지 |

**Key insight:** 스크립트, 파서, 워크플로우 인프라가 이미 갖춰져 있다. 새로 만드는 것보다 기존 코드를 실행하거나 소폭 수정하는 것이 이 Phase의 핵심 작업이다.

---

## Common Pitfalls

### Pitfall 1: reparse_pdfs.py가 state.json 기준으로 동작함
**What goes wrong:** `data/polls/polls.json`에는 36건 빈값이 보이지만, `reparse_pdfs.py`는 `data/polls/state.json`의 `polls[]` 배열을 수정하고 완료 후 `export_frontend_json()`으로 `polls.json`을 재생성한다. `polls.json` 직접 수정은 다음 파이프라인 실행 시 `state.json`으로 덮어씌워진다.
**Why it happens:** `export_frontend_json()`이 항상 `state.json`의 polls를 기준으로 `polls.json`을 생성한다.
**How to avoid:** 수동으로 results를 입력할 때도 반드시 `state.json`의 `polls[]` 배열을 수정한 뒤 `export_frontend_json(polls)` 또는 `reparse_pdfs.py`의 저장 로직을 통해 `polls.json`을 재생성해야 한다.

### Pitfall 2: party_support 4건을 "해결해야 할 빈값"으로 처리
**What goes wrong:** 전국 정당지지도 조사(electionType=party_support)는 지방선거 후보가 없어서 results가 빈배열인 것이 정상이다. 이 건들에 수치를 채우려고 시도하면 LLM 생성 수치를 넣게 될 위험이 있다.
**How to avoid:** `reparse_pdfs.py --dry-run`으로 처리 대상 확인 시 party_support 항목은 스킵 처리되는지 확인. 스킵 안 되면 filter 추가 필요.

### Pitfall 3: 기존 update-polls.yml과 새 poll-sync.yml 중복 실행
**What goes wrong:** 두 workflow가 동시에 존재하면 하루 3번 파이프라인이 실행되고, push 충돌 가능성이 생긴다.
**How to avoid:** D-05는 `poll-sync.yml`이라는 이름을 명시하지만, 기존 `update-polls.yml`을 rename + 수정하는 것이 더 안전하다. 또는 `update-polls.yml`을 disabled로 설정하고 `poll-sync.yml` 신규 생성.

### Pitfall 4: D-11 날짜 mock 테스트 후 원복 누락
**What goes wrong:** `getKST()` 하드코딩 후 원복 커밋을 잊으면 실제 서비스에서 날짜 판단이 고정된다.
**How to avoid:** mock 수정 → 테스트 → 즉시 `git stash` 또는 원복 커밋. Wave에 "원복 확인" 단계를 명시적으로 포함해야 한다.

### Pitfall 5: 2페이지 이하 설문지-only PDF에 결과표가 없을 수 있음
**What goes wrong:** 설문지-only PDF(9건)는 결과표가 아예 없거나 별도 PDF로 첨부된 경우다. NESDC 상세 페이지를 열어봐야 결과표 존재 여부를 알 수 있다. 결과표가 없는 조사는 "아직 결과 미공개"일 수 있다.
**How to avoid:** 수동 확인 시 상세 페이지의 첨부파일 목록을 먼저 확인. 결과표 PDF가 별도로 있으면 다운로드 후 직접 수치 기입. 결과표 자체가 없으면 해당 nttId는 채울 수 없음으로 기록.

### Pitfall 6: 수동 기입 수치를 검증 없이 커밋
**What goes wrong:** 헌법 제2조 위반 — NESDC PDF 원본 수치를 직접 입력해도 "스스로 옮긴 수치"에 대한 교차 검증이 없으면 오류 가능성이 있다.
**How to avoid:** 수동 기입 후 `poll_audit_pdf.py`로 PDF vs state.json 수치 대조 실행.

---

## Code Examples

### reparse_pdfs.py 실행 방법
```bash
# dry-run: 처리 대상 건수 확인 (PDF 다운로드 없음)
python scripts/reparse_pdfs.py --dry-run

# 전체 실행
python scripts/reparse_pdfs.py

# 제한 실행 (테스트용)
python scripts/reparse_pdfs.py --limit 5
```

### 빈값 현황 확인 스크립트
```python
import json
with open('data/polls/state.json') as f:
    state = json.load(f)
polls = state.get('polls', [])
empty = [p for p in polls if not p.get('results')]
regional_empty = [p for p in empty if p.get('electionType') != 'party_support']
print(f'전체 빈값: {len(empty)}건, 지역조사 빈값: {len(regional_empty)}건')
```

### 수동 results 기입 후 polls.json 재생성 패턴
```python
import sys, json
sys.path.insert(0, 'scripts')
from nesdc_poll_pipeline import load_state, save_state, export_frontend_json

state = load_state()
polls = state['polls']

# nttId 17892 수동 기입 예시
for p in polls:
    if p.get('nttId') == 17892:
        p['results'] = [
            {'candidateName': '홍길동', 'party': 'democratic', 'support': 45.2},
            {'candidateName': '김철수', 'party': 'ppp', 'support': 32.1},
        ]
        break

save_state({'last_id': state['last_id'], 'polls': polls})
export_frontend_json(polls)
```

### D-11 날짜 mock 테스트용 getKST() 수정
```javascript
// js/election-calendar.js — 테스트용 임시 수정 (반드시 원복 필요)
const getKST = () => {
    // [TEST ONLY] 공표금지 시작 직후
    return new Date('2026-05-28T01:00:00+09:00');
    // 원래 코드:
    // const now = new Date();
    // const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    // return new Date(utc + (9 * 3600000));
};
```

### poll-sync.yml (D-05 규격)
```yaml
# .github/workflows/poll-sync.yml
name: Poll Sync (NESDC)

on:
  schedule:
    - cron: '0 0 * * *'   # KST 09:00 (UTC 00:00) 1회
  workflow_dispatch:

jobs:
  sync:
    runs-on: ubuntu-latest
    permissions:
      contents: write

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
          cache: 'pip'

      - name: Install dependencies
        run: pip install httpx beautifulsoup4 pdfplumber

      - name: Run NESDC pipeline
        run: python scripts/nesdc_poll_pipeline.py

      - name: Reparse empty results
        run: python scripts/reparse_pdfs.py

      - name: Check for changes
        id: diff
        run: git diff --quiet data/polls/ || echo "changed=true" >> $GITHUB_OUTPUT

      - name: Commit and push
        if: steps.diff.outputs.changed == 'true'
        env:
          DATE: ${{ github.run_started_at }}
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add data/polls/
          # 신규/업데이트 건수 계산
          NEW=$(git diff --cached data/polls/polls.json | grep '^\+' | grep '"nttId"' | wc -l | tr -d ' ')
          git commit -m "data: poll sync $(date +%Y-%m-%d) — 신규 ${NEW}건"
          git pull --rebase origin main && git push
```

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python | reparse_pdfs.py, nesdc_poll_pipeline.py | ✓ | 3.14.2 (로컬) | — |
| pdfplumber | PDF 파싱 | ✓ | 0.11.9 | — |
| httpx | NESDC 크롤링 | ✓ | 0.28.1 | — |
| beautifulsoup4 | HTML 파싱 | ✓ | 설치됨 | — |
| GitHub Actions | poll-sync.yml | ✓ (기존 12개 워크플로우 운영 중) | — | — |
| Cloudflare Pages | push 후 자동 배포 | ✓ (기존 연동 확인) | — | — |
| NESDC 사이트 (nesdc.go.kr) | 신규 여론조사 수집 | 접근 가능 (파이프라인 운영 중) | — | 수동 수집 |

**Missing dependencies with no fallback:** 없음

---

## Validation Architecture

> nyquist_validation 설정 미확인. 프로젝트 REQUIREMENTS.md에서 "자동화 테스트 인프라 — 바닐라 JS 수동 검증 유지"가 Out of Scope로 명시됨. 이 Phase는 브라우저 수동 검증으로 완료 기준을 충족한다.

### Phase Requirements → 검증 방법

| Req ID | 검증 방법 | 명령 / 절차 |
|--------|-----------|-------------|
| POLL-01 | 스크립트 실행 후 상태 확인 | `python3 -c "import json; s=json.load(open('data/polls/state.json')); empty=[p for p in s['polls'] if not p.get('results') and p.get('electionType')!='party_support']; print(f'잔여 빈값: {len(empty)}건')"` |
| POLL-02 | GitHub Actions 수동 트리거 | workflow_dispatch 실행 후 Actions 탭에서 성공 확인 |
| 공표금지(D-11/D-12) | 브라우저 수동 검증 | getKST() mock → 로컬 서버에서 여론조사 탭 확인 |

**자동화 가능 검증 (Wave 완료 후):**
```bash
# POLL-01 완료 확인
python3 -c "
import json
with open('data/polls/state.json') as f:
    state = json.load(f)
polls = state.get('polls', [])
empty = [p for p in polls if not p.get('results') and p.get('electionType') != 'party_support']
print('POLL-01:', 'PASS' if not empty else f'FAIL — 잔여 {len(empty)}건')
"
```

---

## Open Questions

1. **reparse_pdfs.py가 party_support를 자동으로 스킵하는가?**
   - What we know: 현재 `reparse_pdfs.py`는 `results` 빈 항목 전체를 대상으로 실행한다.
   - What's unclear: `parse_pdf_results()`가 party_support PDF에서 빈배열을 반환하므로 실질적으로 업데이트가 안 됨 — 하지만 "failed" 카운트에 잡혀서 로그가 지저분해진다.
   - Recommendation: 플래너는 reparse_pdfs.py에 `electionType != 'party_support'` 필터를 추가하는 소폭 수정 task를 포함할 수 있다.

2. **설문지-only 9건의 NESDC 상세 페이지에 별도 결과표가 있는가?**
   - What we know: 설문지 PDF(2페이지 이하) 9건의 sourceUrl이 있다.
   - What's unclear: NESDC 사이트에서 결과표 PDF가 별도 첨부로 있는지는 실제 방문 전까지 알 수 없다.
   - Recommendation: 수동 확인 task에서 9건 sourceUrl을 순서대로 열어 결과표 첨부 여부를 먼저 체크한다. 없는 경우 해당 nttId는 "미공개" 상태로 기록하고 REQUIREMENTS.md 빈값 수를 업데이트.

3. **기존 update-polls.yml을 교체할 것인가, 신규 poll-sync.yml을 추가할 것인가?**
   - What we know: `update-polls.yml`은 현재 `nesdc_poll_pipeline.py`만 실행하고, D-05는 `reparse_pdfs.py`도 포함해야 한다.
   - Recommendation: `update-polls.yml`의 내용을 D-05 규격으로 수정 후 rename (또는 내용만 교체). 중복 workflow를 피한다.

---

## Project Constraints (from CLAUDE.md)

- **허위 데이터 절대 금지 (헌법 제1~5조):** 모든 results 수치는 NESDC 공식 PDF 원본으로만 확인. LLM 생성/추정 수치 사용 금지 (D-03 근거).
- **탭 파일 수정 범위 제한:** 여론조사 탭 작업은 `js/tabs/poll-tab.js`만 허용. 다른 탭 파일 미수정.
- **날짜 비교 방식:** 문자열 날짜 비교 금지. `ElectionCalendar.getKST()` + Date 객체만 사용.
- **data.js 수정 금지:** 새 데이터는 `data/*.json`에만 추가.
- **여론조사 공표금지:** `isPublicationBanned()` 함수로만 판정. 직접 날짜 비교 로직 추가 금지.
- **여론조사 수치 소스 확인 의무:** 수치 변경 시 커밋 메시지에 출처 명시.

---

## Sources

### Primary (HIGH confidence)
- 직접 코드 분석: `scripts/reparse_pdfs.py`, `scripts/nesdc_poll_pipeline.py` — 동작 로직 확인
- 직접 데이터 분석: `data/polls/state.json` (743건, 36건 빈값), `data/polls/polls.json` (동일)
- 직접 파일 확인: `data/polls/pdfs/` (910개 PDF 파일)
- PDF 내용 분석: nttId 17880, 17892, 17914, 17906, 17925 샘플 5건 직접 파싱 결과
- 직접 코드 분석: `.github/workflows/update-polls.yml` — 기존 워크플로우 구조
- 직접 코드 분석: `js/election-calendar.js` — isPublicationBanned(), getKST() 구현
- 직접 코드 분석: `js/tabs/poll-tab.js` 라인 486 — 공표금지 분기 구현 확인

### Secondary (MEDIUM confidence)
- REQUIREMENTS.md "15건" vs 실측 "32건" 불일치: 요구사항 작성 시점(2026-03-25) 이후 신규 빈값이 추가된 것으로 추정

---

## Metadata

**Confidence breakdown:**
- 빈값 현황 및 분류: HIGH — 실측 데이터 직접 확인
- PDF 파싱 실패 원인: HIGH — 실제 PDF 내용 및 파싱 로직 코드 직접 분석
- GitHub Actions 패턴: HIGH — 기존 워크플로우 12개 코드 확인
- 공표금지 로직 구현 위치: HIGH — 소스코드 직접 확인
- NESDC 설문지-only 9건의 별도 결과표 존재 여부: LOW — 실제 사이트 방문 전 미확인

**Research date:** 2026-03-29
**Valid until:** 2026-05-27 (공표금지 전까지 유효)
