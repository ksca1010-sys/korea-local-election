# Phase 6: 본후보 등록 대응 - Research

**Researched:** 2026-03-30
**Domain:** NEC 공식 후보자 API 전환 / candidate-tab.js NOMINATED 필터 / GitHub Actions cron
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: GitHub Actions cron 완전 자동화 — 별도 `update-candidates.yml` 워크플로우 생성 (update-polls.yml과 분리)
- D-02: 수집 주기 1회/일. 5/14~15 등록 기간 중 수동 dispatch도 지원
- D-03: NEC 공식 후보자 API 사용 (공공데이터포털). `fetch_nec_candidates.py`의 TODO 전환 포인트를 이 페이즈에서 구현
- D-04: 기존 update-polls.yml 패턴 그대로 준용 (pip cache, git pull --rebase, commit 형식)
- D-05: 광역단체장(17개), 교육감(17개), 기초단체장(251개) 모두 포함
- D-06: 광역의원/기초의원은 제외
- D-07: 5/15 18:00 이후 DECLARED / EXPECTED / RUMORED 후보를 탭에서 완전히 숨김 — NOMINATED만 표시
- D-08: 기준 판정은 `ElectionCalendar.getCandidateSortMode() === 'ballot_number'` 활용. 별도 함수 추가하지 않음
- D-09: 등록 취소·무효 후보는 기존 WITHDRAWN 상태 유지
- D-10: 기호 없는 NOMINATED 후보는 기존 `(a.ballotNumber || 999)` 폴백 유지 — candidate-tab.js 수정 불필요
- D-11: NEC API 수집 시 `ballotNumber` 필드 포함하여 저장
- D-12: NEC API 응답에서 기존 선거구 코드와 매핑이 안 되는 후보는 `data/candidates/unmatched_candidates.json`에 별도 보관
- D-13: 선거구 확정 시 cron 재실행으로 자동 리맵
- D-14: 미확정 선거구 클릭 시 "공식 후보 등록 마감 후 선거구 확정 중입니다" 안내 문구 표시

### Claude's Discretion
- NEC API 엔드포인트 URL 및 파라미터
- `update-candidates.yml` 내부 단계 설계
- 각 선거 유형별 JSON 구조 변경 범위 (기존 구조 최대한 유지)

### Deferred Ideas (OUT OF SCOPE)
- 광역의원/기초의원 후보 데이터 수집 — 후보 탭 미표시, REQUIREMENTS.md Future(v1.2+)로 분류
- 선거구 획정 모니터링 자동화 — 페이즈 6 이후
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CAND-01 | 본후보 등록 후 candidates 데이터가 공식 후보(NOMINATED)로 자동 전환된다 | NEC PofelcddInfoInqireService API → fetch_nec_candidates.py의 fetch_nec_preliminary() 함수 교체로 구현 |
| CAND-02 | 후보 기호가 배정되면 기호순 정렬이 올바르게 적용된다 (5/15 18:00 이후) | getCandidateSortMode() + candidate-tab.js line 277-278 이미 구현 완료. ballotNumber 필드 저장이 핵심 |
| CAND-03 | 등록 취소·무효 후보가 목록에서 제거된다 | WITHDRAWN 필터는 byElection에만 있음(line 57). governor/superintendent/mayor 분기에 추가 필요 — buildModel()에 필터 주입 |
</phase_requirements>

---

## Summary

5/14~15 본후보 등록 기간에 NEC 공식 후보자 API(`PofelcddInfoInqireService`)가 개방된다. 현재 `fetch_nec_candidates.py`의 `fetch_nec_preliminary()` 함수(line 72~87)는 완전한 placeholder로, API 호출 로직이 없다. 이 함수를 NEC API 호출로 교체하는 것이 이 페이즈의 핵심 파이프라인 작업이다.

프론트엔드 측은 이미 대부분 준비돼 있다. `getCandidateSortMode()`(election-calendar.js line 128~131)와 `ballotNumber` 정렬 로직(candidate-tab.js line 277~278)이 작동 중이다. 누락된 부분은 두 가지다: (1) `buildModel()`의 governor/superintendent/mayor 분기에 NOMINATED 전용 필터 추가, (2) NEC API 응답에서 `ballotNumber` 필드를 JSON에 저장하는 파이프라인 구현.

`update-candidates.yml`은 이미 존재하며 현재 뉴스 기반 팩트체크 파이프라인을 실행한다. 5/14 이후에는 이 워크플로우에 NEC API 수집 단계를 추가하거나, NEC API 전용 스텝을 삽입하는 방식으로 확장한다.

**Primary recommendation:** `fetch_nec_candidates.py`의 `fetch_nec_preliminary()` 함수를 `nec_precand_sync.py`의 `fetch_precandidates()` 패턴(이미 실전 검증됨)을 참조하여 본후보 API 호출로 교체하고, 반환 데이터에 `ballotNumber` 필드를 포함시킨다.

---

## Standard Stack

### Core
| 라이브러리/모듈 | 버전/위치 | 용도 | 비고 |
|---------------|-----------|-----|------|
| `nec_precand_sync.py` | `scripts/candidate_pipeline/` | NEC API 호출 공통 모듈 (이미 실전 가동 중) | `fetch_precandidates()` 패턴 재사용 |
| `fetch_nec_candidates.py` | `scripts/candidate_pipeline/` | 본후보 수집 진입점 — TODO 포인트가 있는 파일 | `fetch_nec_preliminary()` 교체 대상 |
| `ElectionCalendar.getCandidateSortMode()` | `js/election-calendar.js` line 128 | ballot_number 모드 전환 판정 | 이미 완성됨 |
| `CandidateTab.buildModel()` | `js/tabs/candidate-tab.js` line 49 | 후보 데이터 모델 빌드 | NOMINATED 필터 추가 포인트 |

### NEC API 엔드포인트
| 서비스 | URL | sgTypecode | 용도 |
|--------|-----|-----------|------|
| 예비/본후보 등록현황 | `http://apis.data.go.kr/9760000/PofelcddInfoInqireService/getPoelpcddRegistSttusInfoInqire` | `3` | 광역단체장 |
| 예비/본후보 등록현황 | 동일 | `4` | 기초단체장 |
| 예비/본후보 등록현황 | 동일 | `10` | 교육감 |
| 후보자 통합검색 | `https://apis.data.go.kr/9760000/CndaSrchService/getCndaSrchInqire` | — | 기호 조회 보조 |

**중요 주석 (공식 문서 확인):** `PofelcddInfoInqireService`는 예비후보 데이터도 동일 엔드포인트에서 제공하되, "예비후보자 정보는 후보자등록 개시일(5/14)부터 조회되지 않음"이라는 공식 안내가 있다. 즉 5/14 이후 동일 엔드포인트에서 본후보 데이터가 반환된다.

**sgId:** `20260603` (이미 `nec_precand_sync.py` line 21에 정의됨)

### NEC API 응답 필드 (이미 검증된 필드명)
`nec_precand_sync.py`의 실전 코드에서 확인된 필드:
- `item.get("sdName")` — 시도명
- `item.get("name")` — 후보자 성명
- `item.get("jdName")` — 정당명
- `item.get("career1")` — 경력
- `item.get("regdate")` — 등록일
- `item.get("wiwName")` — 구시군명 (기초단체장)

**본후보 추가 필드 (확인 필요):**
- 기호(ballotNumber)에 해당하는 필드명: `CndaSrchService` 응답에서 "기호" 필드 존재 확인됨. `PofelcddInfoInqireService` 응답에서의 정확한 필드명은 5/14 이후 API 실제 호출로 확인 필요 (LOW confidence — 등록 전이라 현재 테스트 불가)

---

## Architecture Patterns

### 현재 파이프라인 구조 (update-candidates.yml)
```
0-a: 재보궐 뉴스 자동감지
0-b: 재보궐 선거구 감지 (NEC API)
0-c: 재보궐 당선 결과 동기화 (NEC API)
1: 광역단체장 팩트체크 (Claude + 뉴스)
2: 교육감 팩트체크
3: 기초단체장 팩트체크
4: 재보궐 후보 팩트체크
4.5: 기초단체장 공약 수집
4.9: 전남광주통합특별시 병합
5: overview narrative 동기화
6: 다중 교차검증
→ diff check → commit & push
```

### Phase 6에서 추가할 단계 (5/14 이후 활성화)
```
[새 단계]: fetch_nec_candidates.py 실행
  → PofelcddInfoInqireService 호출 (typecode 3, 4, 10)
  → 기존 후보와 병합 (status → NOMINATED, ballotNumber 저장)
  → 매핑 실패 → unmatched_candidates.json
  → 기존 팩트체크 단계들 이어서 실행
```

### Pattern 1: NEC API fetch (기존 nec_precand_sync.py 패턴)
**What:** 페이지네이션 루프로 전체 후보 수집
**When to use:** fetch_nec_candidates.py의 fetch_nec_preliminary() 교체 시
```python
# Source: scripts/candidate_pipeline/nec_precand_sync.py line 52-105
NEC_SERVICE = "http://apis.data.go.kr/9760000/PofelcddInfoInqireService/getPoelpcddRegistSttusInfoInqire"
SG_ID = "20260603"

def fetch_nec_candidates_official(sg_typecode, nec_key=None):
    # nec_precand_sync.fetch_precandidates() 와 동일한 구조
    # numOfRows=100, 페이지네이션
    # resultCode "INFO-00" 성공 판정
    # items가 dict인 경우 리스트로 변환 (단일 항목 대응)
    pass
```

### Pattern 2: buildModel() NOMINATED 필터 (CAND-01, CAND-03)
**What:** ballot_number 모드일 때 NOMINATED 이외 후보 숨김
**When to use:** 5/15 18:00 이후 getCandidateSortMode() === 'ballot_number' 반환 시
**변경 위치:** candidate-tab.js의 render() 함수 (line 264~), 정렬 직전

```javascript
// Source: js/tabs/candidate-tab.js line 271-286
// 현재 코드:
const model = buildModel(regionKey, electionType, districtName);
const sortMode = typeof ElectionCalendar !== 'undefined'
    ? ElectionCalendar.getCandidateSortMode()
    : 'status_priority';

if (sortMode === 'ballot_number') {
    model.candidates.sort((a, b) => (a.ballotNumber || 999) - (b.ballotNumber || 999));
}

// 추가할 코드 (sortMode 판정 직후):
if (sortMode === 'ballot_number') {
    model.candidates = model.candidates.filter(c => c.status === 'NOMINATED');
    model.candidates.sort((a, b) => (a.ballotNumber || 999) - (b.ballotNumber || 999));
}
```

**주의:** 현재 byElection 분기(line 57)에만 WITHDRAWN 필터가 있다. governor/superintendent/mayor 분기의 `buildModel()` 내부에는 없다. D-07 요건 충족을 위해 render() 단에서 필터링하는 것이 올바른 접근이다 (buildModel을 건드리지 않고 render에서 처리 — 단일 변경점).

### Pattern 3: JSON 데이터 구조 (기존 구조 유지)
**governor.json 구조:**
```json
{
  "_meta": { "version", "lastUpdated", "lastPipelineRun", ... },
  "candidates": {
    "seoul": [
      {
        "id": "seoul-1",
        "name": "...",
        "party": "democratic",
        "age": 57,
        "career": "...",
        "status": "DECLARED",  // → "NOMINATED"으로 교체
        "ballotNumber": null,   // → 기호 배정 시 숫자 (신규 필드)
        "dataSource": "nec",
        "pledges": [],
        "sourceUrl": null
      }
    ]
  }
}
```

**superintendent.json 구조:** governor.json과 동일. `stance` 필드 추가 (`"진보"/"보수"`)

**mayor_candidates.json 구조:** 2단계 중첩 — `candidates["seoul"]["종로구"]` = 배열

### Anti-Patterns to Avoid
- **buildModel() 내부에서 NOMINATED 필터 추가 금지:** 각 분기(governor/superintendent/mayor)에 중복 코드가 생긴다. render() 단에서 한 번만 처리할 것
- **ballotNumber를 문자열로 저장 금지:** NEC API 응답에서 문자열로 올 경우 `int()` 변환 후 저장. candidate-tab.js의 정렬 로직이 숫자 비교를 전제함
- **status_updates.json을 통한 일괄 NOMINATED 전환 금지:** 251개 기초단체장을 수동 업데이트하는 것은 비현실적. API 파이프라인이 자동 처리해야 함

---

## Don't Hand-Roll

| 문제 | 직접 만들지 말 것 | 사용할 것 | 이유 |
|------|----------------|----------|------|
| NEC API 페이지네이션 | 새 HTTP 클라이언트 | `nec_precand_sync.fetch_precandidates()` 패턴 복사 | 단일 항목 dict 대응, 에러 핸들링 이미 구현됨 |
| 시도명 → regionKey 변환 | 새 매핑 dict | `nec_precand_sync.SIDO_MAP` (line 31~40) | 강원특별자치도/강원도 등 변형명 이미 처리됨 |
| 정당명 → partyKey 변환 | 새 정규화 함수 | `nec_precand_sync._normalize_party()` | PARTY_MAP 동일, 수입 패턴 공유 |
| 후보 병합 로직 | 새 머지 함수 | `fetch_nec_candidates.merge_candidates()` (line 90~144) | 기존/신규/WITHDRAWN 처리 로직 완비 |
| ballot_number 기반 정렬 | 새 정렬 구현 | candidate-tab.js line 278의 `(a.ballotNumber || 999) - (b.ballotNumber || 999)` | 이미 완성됨, D-10 확정 |

---

## Common Pitfalls

### Pitfall 1: PofelcddInfoInqireService — 본후보 등록 개시 전 API 미응답
**What goes wrong:** 5/14 09:00 전에 API를 호출하면 후보 데이터가 없거나 예비후보 데이터가 반환될 수 있다.
**Why it happens:** 선관위 공식 문서에 "예비후보자 정보는 후보자등록 개시일부터 조회되지 않음"이라고 명시돼 있다.
**How to avoid:** 워크플로우에 날짜 게이팅 추가. `if datetime.now() >= datetime(2026, 5, 14, 9, 0)` 조건 후 API 호출
**Warning signs:** API는 성공(INFO-00)을 반환하지만 items 배열이 비어 있는 경우

### Pitfall 2: ballotNumber 필드명 불확실
**What goes wrong:** NEC API 응답의 기호 필드명이 `ballotNumber`가 아닌 다른 이름일 수 있다.
**Why it happens:** 현재(3월 말)는 본후보 등록 전이라 실제 API 응답을 확인할 수 없다.
**How to avoid:** 5/14 첫 수집 시 원본 응답 전체를 로깅. `CndaSrchService` 응답에서 "기호" 필드가 확인됐으므로, `PofelcddInfoInqireService` 응답의 기호 필드도 유사 이름일 가능성이 높음. 실제 필드명 확인 후 매핑
**Warning signs:** ballotNumber가 모두 null인 채로 NOMINATED 처리됨

### Pitfall 3: mayor_candidates.json의 2단계 중첩 구조
**What goes wrong:** `candidates["seoul"]`이 배열이 아니라 `{"종로구": [...], "중구": [...]}` dict다.
**Why it happens:** governor.json(`candidates["seoul"]` = 배열)과 구조가 다름.
**How to avoid:** 기초단체장 수집 시 반드시 `nec_precand_sync.sync_mayor()` 로직(line 175~) 참조. `wiwName` 필드로 시군구 매핑 후 해당 배열에만 append
**Warning signs:** TypeError: 'list' object is not subscriptable

### Pitfall 4: candidate-tab.js에서 ballotNumber 필드 미전달
**What goes wrong:** buildModel()이 candidate 객체를 재구성할 때 `ballotNumber`를 spread하지 않으면 정렬이 항상 999가 된다.
**Why it happens:** governor 분기(line 92~104)의 `.map()` 에서 명시적으로 나열된 필드만 전달한다. ballotNumber가 없으면 누락된다.
**How to avoid:** buildModel() 각 분기의 `.map()` 에 `ballotNumber: candidate.ballotNumber || null` 추가
**Warning signs:** 모든 후보가 동일 순서로 나열되고 ballot_number 모드에서도 원본 순서가 유지됨

### Pitfall 5: update-candidates.yml의 5/14 이전 NEC API 실행
**What goes wrong:** cron이 매일 실행되므로 5/14 전에도 NEC 본후보 API 단계가 실행된다.
**Why it happens:** 날짜 조건 없이 스텝을 추가하면 항상 실행됨.
**How to avoid:** 스텝에 `if: ${{ github.event_name == 'workflow_dispatch' || github.event.schedule > '2026-05-14' }}` 조건 추가 또는 Python 스크립트 내에서 날짜 게이팅

---

## Code Examples

### 1. fetch_nec_candidates.py — fetch_nec_preliminary() 교체 대상 (현재 상태)
```python
# Source: scripts/candidate_pipeline/fetch_nec_candidates.py line 72-87
def fetch_nec_preliminary():
    """
    TODO: 선관위 API가 공개되면 이 함수를 교체
    현재는 placeholder - 수동 업데이트 또는 뉴스 크롤링으로 대체
    """
    print("[INFO] 선관위 예비후보 API는 아직 미공개 상태입니다.")
    # ...
    return None  # ← 항상 None 반환 → 병합 로직 건너뜀
```

### 2. nec_precand_sync.py — 재사용할 fetch 패턴
```python
# Source: scripts/candidate_pipeline/nec_precand_sync.py line 52-105
NEC_SERVICE = "http://apis.data.go.kr/9760000/PofelcddInfoInqireService/getPoelpcddRegistSttusInfoInqire"
SG_ID = "20260603"

def fetch_precandidates(sg_typecode, nec_key=None):
    all_items = []
    page = 1
    while True:
        params = urllib.parse.urlencode({
            "serviceKey": nec_key,
            "pageNo": str(page),
            "numOfRows": "100",
            "sgId": SG_ID,
            "sgTypecode": sg_typecode,
            "resultType": "json",
        })
        # ... 페이지네이션 루프
        header = data.get("response", {}).get("header", {})
        if header.get("resultCode") != "INFO-00":
            break
        items = body.get("items", {}).get("item", [])
        if isinstance(items, dict):
            items = [items]  # 단일 항목 대응
```

### 3. candidate-tab.js — getCandidateSortMode() 사용 위치
```javascript
// Source: js/tabs/candidate-tab.js line 272-286
const sortMode = typeof ElectionCalendar !== 'undefined'
    ? ElectionCalendar.getCandidateSortMode()
    : 'status_priority';

if (sortMode === 'ballot_number') {
    // D-07: NOMINATED 이외 필터 추가 위치
    model.candidates = model.candidates.filter(c => c.status === 'NOMINATED');
    // D-10: ballotNumber 없으면 999 폴백 (기존 코드)
    model.candidates.sort((a, b) => (a.ballotNumber || 999) - (b.ballotNumber || 999));
} else {
    const statusOrder = { NOMINATED: 0, DECLARED: 1, EXPECTED: 2, RUMORED: 3, WITHDRAWN: 4 };
    model.candidates.sort((a, b) => {
        const sa = statusOrder[a.status] ?? 2.5;
        const sb = statusOrder[b.status] ?? 2.5;
        return sa - sb;
    });
}
```

### 4. getCandidateSortMode() — 전환 기준
```javascript
// Source: js/election-calendar.js line 128-131
const getCandidateSortMode = () => {
    const now = getKST();
    // CANDIDATE_REG_END = new Date('2026-05-15T18:00:00+09:00')
    return now > DATES.CANDIDATE_REG_END ? 'ballot_number' : 'status_priority';
};
```

### 5. update-candidates.yml — NEC API 단계 삽입 위치
```yaml
# Source: .github/workflows/update-candidates.yml (기존 구조)
# 기존 1단계(factcheck_candidates.py) 앞에 삽입:

      - name: Fetch NEC official candidates (5/14~15 등록기간)
        env:
          NECDC_CODE: ${{ secrets.NECDC_CODE }}
          NDCDC_LOCAL: ${{ secrets.NDCDC_LOCAL }}
          NDCDC_PAPER: ${{ secrets.NDCDC_PAPER }}
          NDCDC_PERSON: ${{ secrets.NDCDC_PERSON }}
        run: |
          KEY="${NECDC_CODE:-${NDCDC_LOCAL:-${NDCDC_PAPER:-$NDCDC_PERSON}}}"; export NEC_API_KEY="$KEY"
          python scripts/candidate_pipeline/fetch_nec_candidates.py
```

---

## State of the Art

| 현재 상태 | Phase 6 이후 | 전환 시점 | 영향 |
|----------|------------|---------|------|
| fetch_nec_candidates.py: placeholder (항상 None 반환) | NEC API 호출로 교체, NOMINATED + ballotNumber 저장 | 5/14 09:00 | 자동 수집 활성화 |
| candidate-tab.js: NOMINATED 필터 없음 (전체 상태 표시) | ballot_number 모드 시 NOMINATED만 표시 | 5/15 18:00 | 비공식 후보 자동 숨김 |
| unmatched_candidates.json: 존재하지 않음 | 선거구 미매핑 후보 보관 | Phase 6 구현 후 | 누락 방지 |
| update-candidates.yml: 뉴스 기반만 | NEC API 단계 추가 | Phase 6 구현 후 | 공식 데이터 우선 |

---

## Environment Availability

| 의존성 | 필요 기능 | 가용 여부 | 비고 |
|-------|---------|---------|------|
| NEC_API_KEY (공공데이터포털 인증키) | NEC API 호출 | ✓ (GitHub Secrets: NECDC_CODE 등) | update-candidates.yml에서 이미 사용 중 |
| Python 3.11 | 파이프라인 스크립트 | ✓ | actions/setup-python@v5로 설치 |
| urllib (표준라이브러리) | HTTP 호출 | ✓ | nec_precand_sync.py 패턴 동일 |
| NEC 본후보 API 실제 데이터 | ballotNumber 필드명 확인 | ✗ (5/14 이전) | 5/14 첫 수집 시 원본 로깅 필수 |

**Missing dependencies with no fallback:**
- NEC 본후보 API 응답의 기호(ballotNumber) 정확한 필드명: 5/14 이전에는 확인 불가. 5/14 첫 실행 시 raw response를 로깅하여 확인해야 함.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | 없음 (바닐라 JS, 테스트 프레임워크 미설치) |
| Config file | 없음 |
| Quick run command | `python scripts/candidate_pipeline/fetch_nec_candidates.py --dry-run` (Python 스크립트) |
| Full suite command | `python scripts/candidate_pipeline/cross_validate.py --fix` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CAND-01 | NOMINATED 자동 전환 | integration | `python scripts/candidate_pipeline/fetch_nec_candidates.py --dry-run` | ✅ (--dry-run 플래그 추가 필요) |
| CAND-02 | 기호순 정렬 | manual-only | 브라우저에서 5/15 18:00 이후 후보 탭 확인 | — |
| CAND-03 | WITHDRAWN 후보 제거 | manual-only | 브라우저에서 등록취소 후보 숨김 확인 | — |

**CAND-02, CAND-03이 manual-only인 이유:** 바닐라 JS 프로젝트에 JS 테스트 프레임워크가 없음. ElectionCalendar 날짜 조작 없이 자동 검증 불가.

### Wave 0 Gaps
- [ ] `fetch_nec_candidates.py` — `--dry-run` 플래그 추가 (실제 저장 없이 API 응답 검증)
- [ ] `unmatched_candidates.json` — 초기 빈 파일 생성 (`{"_meta": {}, "candidates": []}`)

---

## Open Questions

1. **NEC PofelcddInfoInqireService의 기호(ballotNumber) 필드명**
   - What we know: `CndaSrchService` 응답에 "기호" 필드 존재 확인. `PofelcddInfoInqireService` 예비후보 응답에서는 기호 필드가 없을 가능성이 높음 (기호는 본후보 등록 후 배정)
   - What's unclear: 본후보 등록 후 동일 엔드포인트에서 기호 필드가 반환되는지, 필드명이 `jdNo`, `cddRgtRsnCode`, `sn` 중 무엇인지
   - Recommendation: 5/14 첫 실행 시 `--log-raw` 옵션으로 원본 JSON을 `data/candidates/nec_raw_sample.json`에 저장. 필드명 확인 후 mapper 완성

2. **교육감(sgTypecode=10) API 지원 여부**
   - What we know: `nec_precand_sync.py`의 `fetch_precandidates()` 주석에 `"10"=교육감` 이라고 명시됨
   - What's unclear: 교육감이 무소속/정당 없는 선거라 `jdName` 필드 대신 `stance` 매핑이 필요함. API에 stance/성향 필드가 없을 수 있음
   - Recommendation: 교육감은 정당 없이 이름만 수집 후 기존 superintendent.json의 stance는 유지 (덮어쓰지 않음)

3. **5/14~15 등록 기간 중 cron 빈도 충분성**
   - What we know: D-02에서 1회/일 + 수동 dispatch 결정됨
   - What's unclear: 등록 기간이 이틀(5/14~15)이고 기호 배정이 즉시 되지 않을 수 있음
   - Recommendation: 5/14~15 기간에는 수동 dispatch 안내를 README 또는 GitHub Actions 설명에 명시

---

## Sources

### Primary (HIGH confidence)
- `scripts/candidate_pipeline/nec_precand_sync.py` — NEC API URL, 파라미터, 응답 파싱 패턴 (실전 가동 코드)
- `scripts/candidate_pipeline/fetch_nec_candidates.py` — TODO 포인트 위치, merge_candidates() 로직
- `js/tabs/candidate-tab.js` — buildModel() 구조, 정렬 로직 line 277-278, WITHDRAWN 패턴 line 57
- `js/election-calendar.js` — getCandidateSortMode() line 128-131, DATES.CANDIDATE_REG_END
- `.github/workflows/update-candidates.yml` — 기존 Actions 구조, 시크릿 패턴
- `.github/workflows/update-polls.yml` — pip cache, git pull --rebase 패턴

### Secondary (MEDIUM confidence)
- [공공데이터포털 — 중앙선거관리위원회_후보자 정보](https://www.data.go.kr/data/15000908/openapi.do) — PofelcddInfoInqireService 공식 문서, "예비후보 정보는 후보자등록 개시일부터 조회되지 않음" 명시
- [공공데이터포털 — 후보자 통합검색](https://www.data.go.kr/data/15140045/openapi.do) — CndaSrchService 엔드포인트, 기호 필드 존재 확인

### Tertiary (LOW confidence)
- ballotNumber 정확한 필드명: 5/14 이전 확인 불가. 첫 실행 후 raw log로 확인 필요

---

## Project Constraints (from CLAUDE.md)

**플래너가 반드시 준수해야 할 제약:**

1. **헌법 제1조 (출처 의무):** 모든 수치 데이터는 NEC 공식 API로 검증. 1순위: `apis.data.go.kr/9760000`
2. **헌법 제2조 (LLM 생성 데이터 불신):** 후보 기호, 등록 여부를 LLM이 추정하는 것 금지. API 또는 공식 소스로만 확정
3. **헌법 제3조 (자동화 안전장치):** fetch_nec_candidates.py에 검증 단계 필수. `validate()` 함수(line 196) 이미 존재 — 반드시 호출
4. **헌법 제4조 (혼입 방지):** sgTypecode 구분 필수. 광역단체장=3, 기초=4, 교육감=10. 혼용 금지
5. **절대금지 제5조:** data/*.json에 함수나 로직 불가 (순수 데이터만)
6. **절대금지 제6조:** LLM이 생성한 수치 검증 없이 커밋 금지
7. **수정 범위:** 여론조사탭 수정 시 — data/candidates/, js/tabs/candidate-tab.js만 건드릴 것. 다른 파일 금지
8. **바닐라 JS 프레임워크 없음:** import/require 불가. 모든 JS는 전역 스코프 기반

---

## Metadata

**Confidence breakdown:**
- NEC API 엔드포인트/파라미터: HIGH — 공식 문서 + 실전 가동 코드로 확인
- fetch_nec_candidates.py TODO 포인트: HIGH — 직접 코드 읽음
- candidate-tab.js 변경 위치: HIGH — 직접 코드 읽음, line 번호 확인
- ballotNumber 정확한 필드명: LOW — 5/14 이전 API 실제 응답 확인 불가
- 교육감 API stance 필드: LOW — 추론, 실제 응답 미확인

**Research date:** 2026-03-30
**Valid until:** 2026-05-13 (본후보 등록 전날까지 유효. 5/14 첫 API 응답 확인 후 ballotNumber 필드명 업데이트 필요)
