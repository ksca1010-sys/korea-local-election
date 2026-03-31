# Phase 9: 본후보 실수집 - Research

**Researched:** 2026-03-31
**Domain:** NEC 본후보 API 실행 / 후보 데이터 병합 검증 / 기호순 정렬 전환
**Confidence:** HIGH (코드베이스 직접 분석 기반 — API 실제 응답 필드명 일부는 5/14 이전 확인 불가)

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DATA-01 | 운영자가 2026-05-14에 `fetch_nec_candidates.py --log-raw`를 실행하여 NEC 본후보 API로부터 실제 후보자 데이터를 수집한다 | fetch_nec_candidates.py 완전 구현됨. 날짜 게이팅 (5/14 이전 API 미호출), --log-raw 플래그, PYTHONPATH 설정 필요 |
| DATA-02 | 수집된 본후보 데이터가 기존 예비후보 데이터와 병합·검증되어 `data/candidates/` JSON에 반영된다 | merge_governor/superintendent/mayor_candidates() 3개 함수 구현됨. validate() 검증 함수 존재. unmatched_candidates.json 미매핑 보관 |
</phase_requirements>

---

## Summary

Phase 9는 2026-05-14 단 하루 실행하는 운영 Phase다. 지금(2026-03-31) 코드와 문서를 준비하고, 5/14 당일에 체크리스트를 따라 실행하는 구조다.

핵심 파이프라인인 `scripts/candidate_pipeline/fetch_nec_candidates.py`는 Phase 6에서 완전히 구현되어 있다. 날짜 게이팅(5/14 이전 API 미호출), `--log-raw` 플래그, 광역단체장/교육감/기초단체장 3개 선거 유형 병합, unmatched 보관, validate() 검증까지 모두 작동 중이다. 프론트엔드의 기호순 정렬 전환(5/15 18:00 이후 ballot_number 모드)도 Phase 6에서 완료됐다.

따라서 Phase 9에서 새로 코드를 작성할 필요는 거의 없다. 5/14 당일 실행 절차, 병합 검증 리포트 생성, 불일치 수동 처리 방법을 명확하게 정리한 체크리스트 문서가 핵심 산출물이다.

유일한 미지수는 ballotNumber 필드명이다. NEC API 응답에서 기호에 해당하는 필드가 `giho`, `gihoSn`, `candidateNo`, `huboNo` 중 무엇인지 5/14 이전에는 테스트 불가다. `_extract_ballot_number()` 함수가 4개 필드명을 순서대로 시도하고 WARN을 출력하도록 구현되어 있으므로, 5/14 당일 raw 로그에서 즉시 확인 후 필요 시 패치 가능하다.

**Primary recommendation:** 5/14 당일 실행 체크리스트를 Plan 01로 작성하고, ballotNumber 필드명 확인 및 불일치 수동 처리를 Plan 02로 구성한다. Plan 01은 자동화 스크립트 실행 순서와 검증 명령어, Plan 02는 raw 로그 분석 및 수동 패치 절차를 담는다.

---

## 기존 코드 구조 분석

### scripts/candidate_pipeline/fetch_nec_candidates.py (완전 구현됨)

**실행 진입점:** `main()` — 4단계 파이프라인

```
[PHASE 1] fetch_nec_official(log_raw) → NEC API 호출 (sgTypecode 3/10/4)
[PHASE 2] merge_governor_candidates() → governor.json 병합
[PHASE 3] merge_superintendent_candidates() → superintendent.json 병합
[PHASE 4] merge_mayor_candidates() → mayor_candidates.json 병합
→ apply_status_updates() → status_updates.json 수동 오버라이드
→ validate() → 중복/필수필드 검증
→ save_unmatched() → unmatched_candidates.json 저장
```

**CLI 플래그:**
- `--log-raw`: 각 typecode별 첫 번째 raw 응답 아이템을 `data/candidates/nec_raw_sample.json`에 저장
- `--dry-run`: API 호출 + 변환 + 검증까지만 실행, 파일 저장 건너뜀

**날짜 게이팅:**
```python
if now < datetime(2026, 5, 14, 0, 0):
    print("[GATE] 본후보 등록 개시일(2026-05-14) 이전입니다.")
    return {}  # API 미호출, 기존 데이터 검증만
```
5/14 이전 실행 시 안전하게 빈 dict 반환 — cron이 매일 실행해도 무방.

**PYTHONPATH 요구사항:**
```
PYTHONPATH=scripts:scripts/candidate_pipeline python scripts/candidate_pipeline/fetch_nec_candidates.py --log-raw
```
`nec_precand_sync.py` import를 위한 경로 설정 필수. GitHub Actions `update-candidates.yml` step에 이미 `PYTHONPATH: scripts:scripts/candidate_pipeline` 설정됨.

### NEC API 엔드포인트 (확인된 정보)

| 서비스 | URL | sgTypecode | 선거 유형 |
|--------|-----|-----------|-----------|
| PofelcddInfoInqireService | `http://apis.data.go.kr/9760000/PofelcddInfoInqireService/getPoelpcddRegistSttusInfoInqire` | `3` | 광역단체장 |
| 동일 | 동일 | `10` | 교육감 |
| 동일 | 동일 | `4` | 기초단체장 |

**sgId:** `20260603` (nec_precand_sync.py line 21에 고정)

**페이지네이션:** 100건/페이지, totalCount 기준 루프 (fetch_precandidates() 내장)

### NEC API 응답 필드

**확인된 필드 (예비후보 API 실전 사용 기반, MEDIUM confidence):**
| 필드명 | 내용 | 비고 |
|--------|------|------|
| `sdName` | 시도명 (e.g., "서울특별시") | SIDO_MAP으로 regionKey 변환 |
| `name` | 후보자 성명 | 병합 키 |
| `jdName` | 정당명 | _normalize_party()로 partyKey 변환 |
| `career1` | 경력 | |
| `regdate` | 등록일 | |
| `wiwName` | 구시군명 | 기초단체장 전용 |

**불확실한 필드 (LOW confidence — 5/14 이전 테스트 불가):**
| 시도 필드명 | 내용 | 처리 방식 |
|-------------|------|-----------|
| `giho` | 기호 (1순위 시도) | `_extract_ballot_number()`가 순서대로 시도 |
| `gihoSn` | 기호 순번 (2순위) | |
| `candidateNo` | 후보번호 (3순위) | |
| `huboNo` | 후보번호 (4순위) | |

**절대 사용 금지:** `huboCnt` — 후보자 수 필드이며 기호가 아님 (코드 주석에 명시됨)

---

## 데이터 파일 구조

### 현재 상태 (2026-03-31 기준)

| 파일 | 후보 수 | status 분포 | ballotNumber |
|------|---------|------------|--------------|
| `data/candidates/governor.json` | 124명 | DECLARED 102 / NOMINATED 6 / EXPECTED 7 / RUMORED 5 / WITHDRAWN 3 | 0명 (미설정) |
| `data/candidates/superintendent.json` | 83명 | DECLARED 65 / EXPECTED 12 / WITHDRAWN 3 / RUMORED 2 | 0명 (미설정) |
| `data/candidates/mayor_candidates.json` | 1,389명 | (혼합) | 0명 (미설정) |
| `data/candidates/unmatched_candidates.json` | 0명 | — | — |

**본후보 등록 후 예상 변화:**
- 전체 후보 수 감소 (예비후보 → 본후보 선별 등록)
- DECLARED/EXPECTED/RUMORED → NOMINATED (등록한 후보)
- DECLARED/EXPECTED/RUMORED → WITHDRAWN (등록하지 않은 후보)
- ballotNumber 0 → 모두 채워짐 (기호 배정)

### 데이터 스키마 (후보 객체)

**예비후보 → 본후보 전환 시 변경 필드:**
```json
{
  "name": "홍길동",
  "party": "democratic",
  "partyKey": "democratic",
  "partyName": "더불어민주당",
  "career": "3선 국회의원 (서울 종로)",
  "status": "NOMINATED",          // DECLARED/EXPECTED/RUMORED → NOMINATED
  "ballotNumber": 1,              // null → 기호 번호 (int)
  "dataSource": "nec_official",   // "news" → "nec_official"
  "pledges": [...],               // 기존 값 보존
  "photo": null                   // 기존 값 보존
}
```

**병합 규칙 (세 함수 공통):**
1. NEC에 있고 기존에도 있음 → status=NOMINATED, ballotNumber/party/career 업데이트, pledges/photo/stance 기존 값 보존
2. NEC에 없고 기존에만 있음 → status=WITHDRAWN, `_autoWithdrawn=true`, `_withdrawnDate=날짜`
3. NEC에 새로 등장한 후보 → 추가 (pledges=[], photo=null 초기화)

---

## 병합 로직 상세

### merge_governor_candidates() — 광역단체장

- 구조: `governor.json.candidates["seoul"] = [후보 배열]`
- 병합 키: `candidate.name` (이름 일치)
- regionKey 매핑: SIDO_MAP ("서울특별시" → "seoul")
- 이름 불일치 리스크: 예비후보 등록과 본후보 등록 시 이름 표기 차이 가능 (예: 띄어쓰기, 한자/한글 혼용)

### merge_superintendent_candidates() — 교육감

- 구조: `superintendent.json.candidates["seoul"] = [후보 배열]`
- 병합 키: `candidate.name`
- stance 필드: NEC API에 없으므로 기존 값 보존 (코드 주석에 명시)
- 교육감은 무소속이 많아 partyKey="independent" 다수

### merge_mayor_candidates() — 기초단체장

- 구조: `mayor_candidates.json.candidates["seoul"]["종로구"] = [후보 배열]` (2단계 중첩)
- 병합 키: (regionKey, wiwName) + 후보 이름
- **wiwName 매핑 로직:** 직접 일치 → 접미사 변형(시/군/구 탈락/추가) → 부분 일치 → unmatched
- 230개 선거구 × 평균 6명 = ~1,380명 처리

### validate() 검증 함수

검증 항목:
1. 중복 이름 체크 (같은 region/district 내)
2. `name` 필드 누락 체크
3. `party` 필드 누락 체크

`기초단체장은 구조 복잡 — validate 생략` 주석이 코드에 있음 (is_valid_mayor = True 하드코딩).

### status_updates.json 수동 오버라이드

`data/candidates/status_updates.json` 파일로 병합 후 개별 후보 상태를 수동 교정 가능:
```json
{
  "updates": [
    {"region": "seoul", "name": "홍길동", "status": "WITHDRAWN", "reason": "후보 사퇴 선언"}
  ]
}
```
광역단체장에만 적용됨 (merge 로직 내 apply_status_updates 호출 위치 기준).

---

## 프론트엔드 기호순 정렬

### getCandidateSortMode() — election-calendar.js

```javascript
const getCandidateSortMode = () => {
    const now = getKST();
    // CANDIDATE_REG_END = new Date('2026-05-15T18:00:00+09:00')
    return now > DATES.CANDIDATE_REG_END ? 'ballot_number' : 'status_priority';
};
```

**전환 시점:** 2026-05-15 18:00 KST (후보자 등록 마감)

### render() — candidate-tab.js

```javascript
if (sortMode === 'ballot_number') {
    // D-07: 본후보 등록 마감 후 NOMINATED만 표시
    model.candidates = model.candidates.filter(c => c.status === 'NOMINATED');
    // D-10: ballotNumber 없는 NOMINATED 후보는 999 폴백
    model.candidates.sort((a, b) => (a.ballotNumber || 999) - (b.ballotNumber || 999));
} else {
    // status_priority 모드: WITHDRAWN만 제거, 나머지 상태 우선순위 정렬
    model.candidates = model.candidates.filter(c => c.status !== 'WITHDRAWN');
    const statusOrder = { NOMINATED: 0, DECLARED: 1, EXPECTED: 2, RUMORED: 3 };
    model.candidates.sort((a, b) => { ... });
}
```

**5/14 시점 상태:** 아직 status_priority 모드 (CANDIDATE_REG_END는 5/15 18:00)
- 5/14에 NEC 데이터 수집 후 governor.json에 NOMINATED + ballotNumber 저장해도 UI는 아직 status_priority 모드
- 5/15 18:00 이후 자동으로 ballot_number 모드로 전환되며 NOMINATED 후보만 표시됨
- **코드 변경 불필요** — 타임스탬프 기반으로 자동 전환

### disclosures 공보물 연동

ballot_number 모드에서만 공보물 섹션 표시:
```javascript
${sortMode === 'ballot_number' ? buildDisclosureSection(
    ElectionData.getDisclosure(electionType, regionKey, candidate.name, districtName)
) : ''}
```
`data/candidates/disclosures.json` 파일이 있음 (fetch_candidate_disclosures.py로 수집).

---

## GitHub Actions 워크플로우

**파일:** `.github/workflows/update-candidates.yml`

**실행 일정:** 매일 09:00 KST (cron: `'0 0 * * *'`), workflow_dispatch 수동 실행 가능

**0.5단계 (NEC 본후보):**
```yaml
- name: Fetch NEC official candidates
  env:
    PYTHONPATH: scripts:scripts/candidate_pipeline
  run: |
    KEY="${NECDC_CODE:-${NDCDC_LOCAL:-${NDCDC_PAPER:-$NDCDC_PERSON}}}"; export NEC_API_KEY="$KEY"
    python scripts/candidate_pipeline/fetch_nec_candidates.py --log-raw
```

5/14 이전에는 날짜 게이팅으로 자동 건너뜀 → 5/14 부터 실제 실행됨.

**비밀값:** `NECDC_CODE`, `NDCDC_LOCAL`, `NDCDC_PAPER`, `NDCDC_PERSON` — 우선순위 폴백으로 NEC_API_KEY 설정

**git 커밋:** `data/candidates/` 변경 시 자동 커밋 (`chore: auto-update candidate data YYYY-MM-DD`)

---

## 5/14 당일 실행 리스크 및 대응

### 리스크 1: ballotNumber 필드명 불일치 (HIGH 리스크)
**상황:** NEC 본후보 API 응답에서 기호 필드명이 giho/gihoSn/candidateNo/huboNo 중 무엇인지 5/14 이전 확인 불가
**증상:** `[WARN] ballotNumber 필드를 찾지 못함: [...]` 출력, 모든 후보 ballotNumber=null
**대응:** `--log-raw` 플래그로 `nec_raw_sample.json` 저장 → 실제 필드명 확인 → `_extract_ballot_number()` 함수 상단에 올바른 필드명을 1순위로 추가 → 재실행

### 리스크 2: 이름 불일치로 WITHDRAWN 과다 발생 (MEDIUM 리스크)
**상황:** 예비후보 등록 이름과 본후보 등록 이름이 다를 경우 (한자 표기, 이름 변경 등)
**증상:** `unmatched_candidates.json`에 후보가 쌓이거나, 기존 후보가 WITHDRAWN으로 처리됨
**대응:** `data/candidates/status_updates.json`으로 수동 교정

### 리스크 3: wiwName 매핑 실패 (MEDIUM 리스크)
**상황:** 기초단체장 230개 선거구 중 wiwName이 mayor_candidates.json 키와 불일치
**증상:** `[WARN] 기초단체장 district 미매핑: gyeonggi/수원시장 — unmatched로 보관`
**대응:** unmatched_candidates.json 확인 → 선거구 이름 매핑 규칙 추가 or 수동 status_updates

### 리스크 4: NEC API 응답 구조 변경 (LOW 리스크)
**상황:** PofelcddInfoInqireService가 예비후보→본후보 전환 시 다른 서비스로 분리될 가능성
**증상:** API 오류 코드 반환 또는 items 빈 배열
**대응:** `nec_raw_sample.json` + 공공데이터포털 API 명세서 재확인

### 리스크 5: NEC_API_KEY 환경변수 미설정 (HIGH 리스크 — 로컬 실행 시)
**상황:** 로컬에서 수동 실행 시 환경변수 미설정
**증상:** `[NEC] NEC_API_KEY 미설정 — 건너뜀`
**대응:** 실행 전 `export NEC_API_KEY=<키값>` 필수

### 리스크 6: 재보궐 선거구 혼입 (LOW 리스크 — 헌법 제4조)
**상황:** sgId=20260603이 재보궐 데이터를 포함할 가능성
**증상:** 비정상적인 지역 후보 등장
**대응:** raw 로그에서 sdName/wiwName 확인 후 교차검증

---

## 병합 검증 리포트 구조

validate() 함수 출력 예시:
```
[VALIDATE] Total: XXX candidates across 17 regions
[VALIDATE] No issues found ✓
# 또는
[VALIDATE] 3 issues found:
  seoul: duplicate names {'홍길동'}
  busan: 박철수 missing party
```

unmatched_candidates.json 확인으로 추가 검증:
```json
{
  "_meta": {"lastUpdated": "2026-05-14"},
  "candidates": [
    {"reason": "district '수원시' (gyeonggi) mayor_candidates.json에 없음", "candidate": {...}}
  ]
}
```

**5/14 실행 기준:** `unmatched_candidates.json.candidates.length === 0` 이면 완전 자동 처리. 0보다 크면 수동 검토 필요.

---

## 현재 인프라 상태 확인

| 항목 | 상태 | 비고 |
|------|------|------|
| `fetch_nec_candidates.py` 구현 | 완료 | Phase 6에서 구현됨 |
| `update-candidates.yml` NEC 단계 | 완료 | 0.5단계로 이미 삽입됨 |
| `unmatched_candidates.json` 초기 파일 | 존재 | 빈 candidates 배열 |
| `candidate-tab.js` NOMINATED 필터 | 완료 | Phase 6에서 구현됨 |
| `getCandidateSortMode()` 전환 | 완료 | 5/15 18:00 KST 자동 전환 |
| `ballotNumber` 전달 (buildModel) | 완료 | Phase 6에서 구현됨 |
| `NEC_API_KEY` 로컬 환경변수 | 미설정 | 5/14 실행 전 설정 필요 |
| `nec_raw_sample.json` | 없음 | 5/14 `--log-raw` 실행 시 생성됨 |

---

## 권장 Plan 구성

### Plan 01: 5/14 당일 실행 체크리스트 (type: checklist/manual)
**내용:** 5/14 당일 운영자가 순서대로 따라 실행할 수 있는 명령어 체크리스트
- 사전 확인 (환경변수, 의존성)
- dry-run 실행 (저장 없이 API 호출 확인)
- `--log-raw` 본 실행 + raw 필드명 확인
- validate 결과 확인 + unmatched 검토
- git commit + push

### Plan 02: 불일치 수동 처리 SOP (type: checklist/manual)
**내용:** 검증 리포트에 불일치가 발견됐을 때의 처리 절차
- ballotNumber 필드명 패치 방법
- status_updates.json으로 이름 불일치 교정 방법
- wiwName 매핑 실패 후보 처리 방법
- 검증 통과 후 최종 커밋

두 Plan 모두 `autonomous: false` (수동 실행 체크리스트), 코드 변경 없이 실행 절차만 문서화.

---

## 환경 가용성

| 의존성 | 필요 항목 | 가용 여부 | 비고 |
|--------|-----------|-----------|------|
| Python 3.11 | 스크립트 실행 | 로컬: 확인 필요 / GitHub Actions: 설정됨 | |
| `NEC_API_KEY` | NEC API 호출 | GitHub Actions: Secrets 설정됨 / 로컬: 수동 설정 필요 | |
| `data/candidates/*.json` | 병합 대상 파일 | 존재함 | governor/superintendent/mayor |
| `nec_precand_sync.py` | fetch_precandidates() 재사용 | 존재함 | PYTHONPATH 설정 필요 |
| NEC API (5/14 이후) | 본후보 데이터 제공 | 5/14 이전 미제공 | 날짜 게이팅으로 안전 처리됨 |

---

## 열린 질문

1. **ballotNumber 실제 필드명**
   - 알고 있는 것: giho/gihoSn/candidateNo/huboNo 중 하나 (4개 후보)
   - 불명확한 것: 5/14 이전 실제 API 응답 확인 불가
   - 대응: 5/14 raw 로그 확인 후 즉시 판단 가능. Plan 01에 raw 로그 확인 단계 포함 필수

2. **PofelcddInfoInqireService가 본후보 API와 동일한지**
   - 알고 있는 것: Phase 6 Research에서 "5/14부터 동일 엔드포인트에서 본후보 데이터 반환" 확인
   - 불명확한 것: 별도 서비스(`CndaSrchService`)가 병행 제공될 수 있음
   - 대응: PofelcddInfoInqireService 먼저 시도, 실패 시 CndaSrchService로 전환 고려

3. **기초단체장 1,389명 병합 완료 시간**
   - 알고 있는 것: 100건/페이지, 230개 선거구
   - 불명확한 것: API 응답 속도 (페이지당 ~1초 가정 시 15분 소요 예상)
   - 대응: 타임아웃 15초 per request 설정됨 (nec_precand_sync.py). GitHub Actions 최대 6시간

---

## 프로젝트 제약 (CLAUDE.md)

- 바닐라 HTML/CSS/JS 유지 — 프레임워크 도입 없음 (Phase 9는 Python 스크립트만 실행, 해당 없음)
- `data/*.json`에 함수/로직 불가 — 순수 데이터만
- 탭 파일 간 독립성 유지 — candidate-tab.js만 수정 가능 (Phase 9에서 탭 수정 불필요)
- 허위 데이터 헌법 제1~5조 엄수 — NEC API 데이터만 사용, LLM 수치 불가
- 여론조사 수치 변경 불가 — Phase 9와 무관
- 선거 유형 혼입 방지 — sgTypecode 3/10/4 분리 처리 코드에 명시됨

---

## Sources

### Primary (HIGH confidence)
- `scripts/candidate_pipeline/fetch_nec_candidates.py` 직접 분석 — 전체 구현 확인
- `scripts/candidate_pipeline/nec_precand_sync.py` 직접 분석 — NEC API 호출 패턴, SIDO_MAP
- `js/tabs/candidate-tab.js` 직접 분석 — NOMINATED 필터, ballotNumber 정렬
- `js/election-calendar.js` 직접 분석 — getCandidateSortMode() 전환 시점
- `.github/workflows/update-candidates.yml` 직접 분석 — 0.5단계 NEC 수집 확인

### Secondary (MEDIUM confidence)
- `.planning/phases/06-본후보-등록-대응/06-RESEARCH.md` — Phase 6 리서치 결과 (NEC API 엔드포인트 확인)
- `.planning/phases/06-본후보-등록-대응/06-01-PLAN.md` — 구현 계획 및 결정 사항

### Tertiary (LOW confidence)
- ballotNumber 필드명 (giho/gihoSn/candidateNo/huboNo) — 5/14 이전 실제 API 호출 불가, Phase 6 Research 추정

---

## Metadata

**Confidence breakdown:**
- fetch_nec_candidates.py 구현 완료 여부: HIGH — 직접 코드 분석
- 데이터 스키마: HIGH — 직접 파일 분석
- ballotNumber 필드명: LOW — 5/14 이전 API 응답 확인 불가
- 프론트엔드 기호순 정렬: HIGH — 코드 직접 확인
- GitHub Actions 연동: HIGH — 워크플로우 파일 직접 확인

**Research date:** 2026-03-31
**Valid until:** 2026-05-14 (실행일까지 유효)
