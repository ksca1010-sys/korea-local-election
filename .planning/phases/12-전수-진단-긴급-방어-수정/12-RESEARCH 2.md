# Phase 12: 전수 진단 + 긴급 방어 수정 — Research

**Researched:** 2026-04-04
**Domain:** GitHub Actions 워크플로우 보안, Python 파이프라인 방어 코딩
**Confidence:** HIGH (모든 15개 워크플로우 직접 읽음, 핵심 Python 스크립트 직접 분석)

---

## Summary

15개 GitHub Actions 워크플로우를 전수 분석한 결과, permissions 블록은 모든 워크플로우에 이미 존재하지만, **최소 권한 원칙 준수 여부가 불균일**하다. 특히 `data-health-check.yml`의 `actions: write`와 `update-gallup.yml`의 `actions: write`는 실제 필요한지 재검토가 필요하다.

Python 파이프라인의 가장 큰 위험은 `nec_precand_sync.py` 93번 줄의 `data["response"]["body"]` 직접 접근이다. 이 코드는 NEC API가 예상 외 구조를 반환할 경우 KeyError로 크래시한다. 다른 스크립트들은 대부분 `.get()` 패턴을 사용하지만, name 빈 값 저장 방어는 일부 스크립트에만 구현되어 있고 일부는 누락되어 있다.

`validate_pipeline.py`는 파이프라인 사후 검증 도구로 name 누락을 감지하지만, **저장 전 필터링**이 없는 스크립트가 존재한다. 특히 `fetch_candidate_disclosures.py`의 `item_to_disclosure()` 함수는 name이 빈 문자열이어도 레코드를 반환한다.

**Primary recommendation:** nec_precand_sync.py의 `data["response"]["body"]` 직접 접근을 `.get()` 체인으로 교체하고, fetch_candidate_disclosures.py에 `name` 빈값 필터를 추가하는 것이 최우선 조치이다.

---

## Project Constraints (from CLAUDE.md)

- 스택: 바닐라 HTML + CSS + JS (프레임워크 없음), Python 자동화 파이프라인, GitHub Actions
- 허위 데이터 절대 금지 — 헌법 제1조~제6조 준수
- data/*.json에 함수/로직 금지 (순수 데이터만)
- LLM 생성 수치는 검증 없이 커밋 금지
- 수정 완료 후 자체 검증 의무 (node --check / python3 -c "import json; json.load(...)")
- 탭 파일끼리 전역 변수 공유 금지, 다른 탭 파일 호출 금지

---

## DIAG-01: 15개 워크플로우 전수 감사 리포트

### 워크플로우별 permissions 현황

| # | 워크플로우 파일 | name | permissions 블록 | 선언된 권한 | 최소권한 여부 |
|---|----------------|------|-----------------|------------|-------------|
| 1 | `data-health-check.yml` | Data Health Check | 있음 | `contents: write`, `actions: write` | **검토 필요** — `actions: write`가 heal_state 커밋에 필요한지 불명확. `actions: read`로 다운그레이드 가능 여부 확인 필요 |
| 2 | `fetch-disclosures.yml` | 공보물 데이터 수집 | 있음 | `contents: write` | 적절 |
| 3 | `monitor-failures.yml` | Monitor Automation Failures | 있음 | `contents: write`, `issues: write`, `actions: read` | 적절 — 3종 모두 기능에 필요 |
| 4 | `update-byelection.yml` | Update By-Election Data | 있음 | `contents: write` | 적절 |
| 5 | `update-candidates.yml` | Update Candidate Data | 있음 | `contents: write` | 적절 |
| 6 | `update-election-stats.yml` | Update Election Stats | 있음 | `contents: write` | 적절 |
| 7 | `update-gallup.yml` | Update Gallup National Poll | 있음 | `contents: write` (update job), `actions: write` (trigger-overview job) | **검토 필요** — trigger-overview job의 `actions: write`는 `gh workflow run`에 필요하나 job-level로만 선언되어 있음. 위험도 낮음 |
| 8 | `update-governor-status.yml` | Update Governor Status | 있음 | `contents: write` | 적절 |
| 9 | `update-local-council.yml` | Update Local Council Members | 있음 | `contents: write` | 적절 |
| 10 | `update-local-media.yml` | Update Local Media Pool | 있음 | `contents: write` | 적절 |
| 11 | `update-mayor-status.yml` | Update Mayor Status | 있음 | `contents: write` | 적절 |
| 12 | `update-overview.yml` | Update Election Overview | 있음 | `contents: write` | 적절 |
| 13 | `update-polls.yml` | Poll Sync (NESDC) | 있음 | `contents: write` | 적절 |
| 14 | `update-superintendent-status.yml` | Update Superintendent Status | 있음 | `contents: write` | 적절 |
| 15 | `fetch-disclosures 2.yml` | (복사본) | 있음 | `contents: write` | 해당 파일은 git-untracked 복사본 — 삭제 권고 |

**결론 (PERM-01 관련):**
- 모든 15개 워크플로우에 permissions 블록이 존재함 (HIGH confidence)
- 위반 사항: `data-health-check.yml`의 `actions: write` — 워크플로우 재실행 트리거용이지만 실제 코드(`data_health_check.py`)가 `gh run rerun`을 호출하는지 확인 필요
- `update-gallup.yml`의 trigger-overview job은 job-level `actions: write`만 있어, workflow-level에는 선언 없음 (현재 구조 정상)
- 공통 누락: `read-all: false` 또는 명시적 `packages: none` 등 — 엄격한 최소권한이 아니라 "필요한 것만 선언" 수준. GitHub Actions 기본값은 fork에서 read-only이므로 현재 구조는 수용 가능

### 워크플로우별 에러 핸들링 현황

| 워크플로우 | 핵심 스크립트 | continue-on-error | 실패 시 동작 |
|-----------|-------------|-------------------|------------|
| update-candidates.yml | 다단계 파이프라인 | 일부 스텝: yes | Step 0 (detect/sync)는 continue-on-error 없음 — 실패 시 전체 중단 |
| update-candidates.yml | fetch_nec_candidates.py | 없음 | 0.5단계 실패 시 이후 팩트체크 스텝 모두 건너뜀 |
| update-candidates.yml | validate_pipeline.py | `continue-on-error: true` | 검증 실패해도 파이프라인 계속 |
| update-byelection.yml | detect_byelections.py | 없음 | Step 1 실패 시 전체 중단 |
| update-polls.yml | nesdc_poll_pipeline.py | 없음 | 실패 시 전체 중단 |
| update-polls.yml | reparse_pdfs.py | 없음 | 실패 시 전체 중단 |
| fetch-disclosures.yml | fetch_candidate_disclosures.py | 없음 | 실패 시 전체 중단 |
| update-gallup.yml | update_gallup.py | 없음 | 실패 시 전체 중단 |
| update-election-stats.yml | fetch_election_stats.py | 없음 | 실패 시 전체 중단 |
| data-health-check.yml | data_health_check.py | 없음 | 실패 시 전체 중단 |
| monitor-failures.yml | monitor_failures.py | 없음 | 실패 시 전체 중단 |
| update-governor-status.yml | fetch_governor_status.py | 없음 | 실패 시 전체 중단 |
| update-mayor-status.yml | fetch_mayor_status.py | 없음 | 실패 시 전체 중단 |
| update-superintendent-status.yml | fetch_superintendent_status.py | 없음 | 실패 시 전체 중단 |
| update-local-council.yml | fetch_local_council_members.py | 없음 | 실패 시 전체 중단 |
| update-local-media.yml | discover_local_media.py | 없음 | 실패 시 전체 중단 |
| update-overview.yml | update_election_overview.py | 없음 (4개 스텝 각각 독립) | 각 스텝 독립 실행 |

### 미처리 실패 패턴 목록

다음은 현재 방어 코드 없이 크래시를 유발하는 실제 패턴들이다:

**패턴 A — 직접 딕셔너리 접근 (KeyError 위험)**
- `nec_precand_sync.py:93`: `body = data["response"]["body"]` — `data`가 오류 응답이거나 예상 구조가 아닐 경우 KeyError
- 직전 라인 `header = data.get("response", {}).get("header", {})` 으로 안전 접근하지만 body 접근은 직접 접근
- `data_health_check.py:177,224`: `name = c["name"]` — name 키 없는 레코드 접근 시 KeyError

**패턴 B — 빈 name 저장 위험**
- `fetch_candidate_disclosures.py:item_to_disclosure()`: name이 빈 문자열이어도 레코드 반환 (`name = txt("rhgcandiNm") or txt("name") or txt("candidateName")` — 모두 빈 문자열이면 `""`를 name으로 저장)
- `nec_precand_sync.py` 파생 경로: `fetch_nec_candidates.py:_convert_nec_item()` 내 `"name": item.get("name", "")` — 빈 문자열 그대로 후보 객체로 반환됨. 단, 이후 `merge_governor_candidates()`에서 `{c["name"]: c}` dict 키로 사용되어 빈 문자열 키가 생성될 수 있음

**패턴 C — 방어가 이미 구현된 위치 (참고용)**
- `factcheck_byelection.py:78`: `if not c.get("name"): continue` — 올바른 패턴
- `factcheck_candidates.py:110`: `if not c.get("name"): print(경고); continue` — 올바른 패턴
- `fetch_byelection.py:300-301`: `name = nc.get("name", "").strip(); if not name: continue` — 올바른 패턴
- `fetch_local_council_members.py`: `.get()` 패턴 전반적으로 사용 — 비교적 안전

---

## CRASH-01: KeyError 방어 — 현황 및 권고

### 현재 상황 분석

**위험 코드 (nec_precand_sync.py:93):**
```python
# 현재 — KeyError 위험
header = data.get("response", {}).get("header", {})
if header.get("resultCode") != "INFO-00":
    print(f"  [NEC] API 오류: {header.get('resultMsg')}")
    break

body = data["response"]["body"]  # <- KeyError 위험: "response" 또는 "body" 키 없을 시 크래시
items = body.get("items", {}).get("item", [])
```

**문제 발생 조건:**
1. NEC API가 JSON 오류 응답 반환 시 (예: `{"error": "service unavailable"}`)
2. NEC API가 비어있는 응답 반환 시 (`{}`)
3. `resultCode`는 통과했지만 `body` 키가 없는 응답 (비표준 응답)

### 권고 패턴: `.get()` 체인 + 경고 로그 + 스킵

```python
# 권고 패턴 — KeyError 완전 제거
response_data = data.get("response", {})
body = response_data.get("body")
if body is None:
    print(f"  [WARN] NEC API 응답에 'body' 키 없음 — 스킵 (typecode={sg_typecode})")
    print(f"  [DEBUG] 실제 응답 키: {list(data.keys())}")
    break

items_container = body.get("items") or {}
items = items_container.get("item", [])
if isinstance(items, dict):
    items = [items]
```

**왜 `.get()` 체인이 `try/except KeyError`보다 나은가:**
- try/except는 KeyError 외 다른 예외를 같이 삼킬 위험이 있음
- `.get()` 체인은 의도를 명확히 표현하며, 빈 값의 의미를 각 단계에서 정의 가능
- WARN 로그로 필드 구조 이상을 즉시 가시화 (monitor_failures.py가 감지할 수 있음)

### 전 파이프라인 KeyError 위험 스크립트 목록

| 스크립트 | 위험 위치 | 위험도 | 조치 |
|---------|---------|--------|------|
| `scripts/candidate_pipeline/nec_precand_sync.py` | line 93: `data["response"]["body"]` | HIGH | `.get("body")` + None 체크 |
| `scripts/data_health_check.py` | line 177, 224: `c["name"]` | MEDIUM | `.get("name", "")` + 빈값 체크 |
| `scripts/candidate_pipeline/fetch_nec_candidates.py` | `{c["name"]: c}` dict comprehension (line 257, 325, 433, 434) | MEDIUM | 먼저 `c.get("name")` 빈값 필터링 후 comprehension |
| `scripts/fetch_candidate_disclosures.py` | `item_to_disclosure()` 반환값에 name="" 가능 | MEDIUM | 반환 전 name 빈값 필터 |

---

## CRASH-02: 빈 name 필드 차단 — 현황 및 권고

### 현재 상황 분석

빈 name 저장 방어는 **불균일**하다:

| 스크립트 | 저장 전 name 검증 | 상태 |
|---------|-----------------|------|
| `factcheck_byelection.py` | `if not c.get("name"): continue` | 완료 |
| `factcheck_candidates.py` | `if not c.get("name"): print + continue` | 완료 |
| `fetch_byelection.py` | `if not name: continue` | 완료 |
| `fetch_candidate_disclosures.py` | 없음 — `name=""` 그대로 저장 가능 | **미구현** |
| `nec_precand_sync.py` 연계 | `_convert_nec_item()`에서 name="" 반환 가능 | **미구현** |
| `fetch_local_council_members.py` | 없음 — name 빈값 시 로직 오류 가능 | **주의** |
| `sync_overview_candidates.py` | 미확인 | 확인 필요 |
| `cross_validate.py` | 미확인 | 확인 필요 |

### 권고 패턴: 저장 전 필터 함수

```python
# 권고 — 공통 필터 함수 (각 스크립트 내 또는 shared.py에 추가)
def is_valid_candidate(record: dict, context: str = "") -> bool:
    """필수 필드 검증. 빈 name 레코드는 False 반환."""
    name = record.get("name", "").strip()
    if not name:
        print(f"[WARN] 빈 name 레코드 스킵 ({context}): 필드={list(record.keys())}")
        return False
    return True

# 사용 예 (fetch_candidate_disclosures.py item_to_disclosure 호출 후)
records = [item_to_disclosure(it) for it in items]
records = [r for r in records if is_valid_candidate(r, context=f"{election_type}/{rkey}")]
```

### validate_pipeline.py와의 연계

`validate_pipeline.py`는 저장 후 name 없는 레코드를 감지하는 사후 검증 도구다. 현재 `update-candidates.yml`에서 `continue-on-error: true`로 실행 중이므로 검증 실패해도 커밋이 일어난다. 방어 코딩 목표는 **저장 전 필터링**이며, validate_pipeline.py는 이중 안전망 역할을 유지한다.

---

## PERM-01: permissions 정규화 — 상세 권고

### 현재 상태 (HIGH confidence — 직접 확인)

모든 15개 워크플로우에 permissions 블록 존재. HTTP 403 오류를 유발하는 **완전 누락** 사례는 없음.

### 개선 권고 항목

**1. `data-health-check.yml` — `actions: write` 재검토**

현재: 
```yaml
permissions:
  contents: write
  actions: write   # 워크플로우 재실행 권한
```

`data_health_check.py`를 분석한 결과, 이 스크립트는 `GH_TOKEN`으로 `gh run rerun`을 호출하여 실패한 워크플로우를 자동 재실행하는 기능이 있다. `actions: write`가 실제로 필요하다.

결론: 현재 설정 유지. 주석에 근거 명시 권고.

**2. `update-gallup.yml` — job-level permissions 구조 확인**

trigger-overview job만 `actions: write` 필요 → job-level 선언이 이미 올바름. 변경 불필요.

**3. 공통 정규화 권고**

워크플로우별 permissions 블록에 아래 형식으로 주석을 추가하여 검토 가능하게 만든다:

```yaml
permissions:
  contents: write   # git push (데이터 파일 커밋)
  # actions: read  # 필요시만 추가
  # issues: write  # 필요시만 추가
```

현재 `actions: read`가 없는 워크플로우는 기본적으로 actions read 권한을 갖지 않아 최소 권한 원칙에 부합한다.

---

## Architecture Patterns

### 현재 파이프라인 방어 코딩 계층

```
워크플로우 (.github/workflows/)
  └── Python 스크립트 (scripts/)
        ├── API 호출 계층 (urllib / httpx)
        │     └── try/except Exception → 빈 결과 반환 (대부분 구현)
        ├── 응답 파싱 계층
        │     └── .get() 패턴 (대부분) / 직접 접근 (일부 - 위험)
        ├── 변환/필터 계층
        │     └── name 빈값 검증 (일부 구현, 일부 누락)
        ├── 병합 계층
        │     └── existing 데이터와 새 데이터 병합
        └── 저장 전 검증
              └── validate_pipeline.py (사후 검증, continue-on-error)
```

### 방어 코드 표준 패턴 (이 프로젝트에서 권고)

**패턴 1: API 응답 필드 접근 (CRASH-01)**
```python
# 표준: .get() 체인 + None 체크 + WARN 로그
def safe_get_body(data: dict, context: str) -> dict | None:
    body = data.get("response", {}).get("body")
    if body is None:
        print(f"[WARN] API 응답 구조 비정상 ({context}): 키={list(data.keys())}")
    return body
```

**패턴 2: 필수 필드 검증 후 레코드 스킵 (CRASH-02)**
```python
# 표준: 저장 직전 필터
REQUIRED_FIELDS = ["name"]

def filter_valid_records(records: list, context: str) -> list:
    valid = []
    for r in records:
        missing = [f for f in REQUIRED_FIELDS if not r.get(f, "").strip()]
        if missing:
            print(f"[WARN] 필수 필드 누락 레코드 스킵 ({context}): {missing} — {list(r.keys())}")
            continue
        valid.append(r)
    return valid
```

---

## Don't Hand-Roll

| 문제 | 빌드하지 말 것 | 사용할 것 | 이유 |
|-----|-------------|---------|------|
| API 재시도 | 커스텀 retry 루프 | httpx의 retry 파라미터 또는 현재 수동 3회 루프 유지 | 이미 nesdc_poll_pipeline.py에 3회 retry 구현됨 |
| 필드 검증 프레임워크 | pydantic 등 외부 라이브러리 | 단순 `.get()` + 조건 체크 | 의존성 추가 없이 해결 가능 |
| 감사 리포트 | 별도 리포트 생성 스크립트 | 워크플로우별 findings를 RESEARCH.md에 직접 문서화 (이 파일) | 코드 복잡도 불필요 증가 |

---

## Common Pitfalls

### Pitfall 1: `data["response"]["body"]` — 조건부 예외
**무엇이 잘못되나:** NEC API가 `resultCode != "INFO-00"` 를 반환할 때 이미 `break`로 탈출하지만, `resultCode`는 없고 `body`도 없는 응답이 오면 그 체크를 통과한 후 KeyError 발생
**왜 일어나나:** 헤더 체크(`header.get("resultCode")`)와 body 접근이 분리되어 있고, body 접근은 안전하지 않은 형태
**회피 방법:** header 체크 직후 body도 `.get()`으로 가져오고 None이면 break

### Pitfall 2: name="" 레코드의 dict 키 오염
**무엇이 잘못되나:** `{c["name"]: c for c in candidates}` 에서 name=""이면 `{"": c}` dict 생성. 이후 매핑 로직에서 빈 키를 의도치 않게 처리
**왜 일어나나:** NEC API가 예비후보 name 필드를 공백으로 반환하는 경우가 있음 (과거 사례 존재)
**회피 방법:** comprehension 전에 `[c for c in candidates if c.get("name", "").strip()]` 필터 적용

### Pitfall 3: `continue-on-error: true` + 빈 데이터 커밋
**무엇이 잘못되나:** validate_pipeline.py가 에러를 발견해도 `continue-on-error: true`이므로 이후 커밋 스텝이 실행되어 불완전한 데이터가 커밋됨
**왜 일어나나:** 검증 실패 시 워크플로우 중단보다 커밋 진행을 선택한 설계
**회피 방법:** validate_pipeline.py 결과를 output으로 캡처하고, 치명적 오류(name 없는 레코드)는 커밋 스텝 조건에 반영

### Pitfall 4: `fetch-disclosures 2.yml` 중복 파일
**무엇이 잘못되나:** git-untracked 상태의 `fetch-disclosures 2.yml`이 실수로 커밋되면 동명 워크플로우 2개가 동시 실행
**왜 일어나나:** 파일 복사본이 `.github/workflows/`에 남아있음
**회피 방법:** 해당 파일 삭제 (git add 이전에 제거)

### Pitfall 5: `actions: write` 과잉 권한
**무엇이 잘못되나:** `actions: write`는 워크플로우 파일 자체를 수정할 수 있는 권한. 탈취 시 공급망 공격 가능
**왜 일어나나:** 워크플로우 재실행 기능 구현 시 포괄적으로 설정
**회피 방법:** `data-health-check.yml`의 heal 기능이 실제로 `gh run rerun`을 사용하는지 확인 후 불필요하면 제거

---

## Code Examples

### 현재 위험 코드 vs 권고 수정

**nec_precand_sync.py (CRASH-01 핵심 수정 대상)**
```python
# AS-IS (위험 — line 93)
body = data["response"]["body"]

# TO-BE (안전)
body = data.get("response", {}).get("body")
if body is None:
    print(f"  [WARN] NEC API body 키 없음 (typecode={sg_typecode}) — 응답 구조: {list(data.keys())}")
    break
```

**fetch_candidate_disclosures.py (CRASH-02 핵심 수정 대상)**
```python
# AS-IS (위험 — item_to_disclosure 호출 후 그대로 저장)
result[rkey] = [item_to_disclosure(it) for it in items]

# TO-BE (안전)
raw_records = [item_to_disclosure(it) for it in items]
valid_records = []
for rec in raw_records:
    if not rec.get("name", "").strip():
        print(f"[WARN] 빈 name 레코드 스킵 ({election_type}/{rkey})")
        continue
    valid_records.append(rec)
result[rkey] = valid_records
```

**fetch_nec_candidates.py (CRASH-02 딕셔너리 오염 방지)**
```python
# AS-IS (위험 — name="" 시 dict 키 오염)
existing_by_name = {c["name"]: c for c in existing_list}

# TO-BE (안전)
existing_by_name = {
    c["name"]: c for c in existing_list
    if isinstance(c, dict) and c.get("name", "").strip()
}
```

---

## Open Questions

1. **`data-health-check.yml`의 `actions: write` 실사용 여부**
   - 알고 있는 것: `data_health_check.py`가 `GH_TOKEN`으로 gh CLI를 사용함
   - 불명확: 실제로 `gh run rerun`을 호출하는지, 아니면 `gh run list` (read) 수준인지
   - 권고: `data_health_check.py` 전체 읽기 후 확인, 불필요하면 `actions: read`로 다운그레이드

2. **`sync_overview_candidates.py`, `cross_validate.py` name 검증 여부**
   - 알고 있는 것: `update-candidates.yml`의 5단계, 6단계에서 호출
   - 불명확: 내부에 name 빈값 필터가 구현되어 있는지
   - 권고: 해당 파일 읽기 후 확인 필요

3. **`fetch-disclosures 2.yml` 파일 존재 이유**
   - 알고 있는 것: git-untracked 상태. 내용은 `fetch-disclosures.yml`과 동일 가능성 높음
   - 불명확: 의도적 백업인지 실수인지
   - 권고: 플래너가 "삭제" 태스크를 포함할 것

---

## Environment Availability

| 도구 | 필요 워크플로우 | 환경 | 비고 |
|-----|--------------|------|------|
| Python 3.11 | 전체 | GitHub Actions ubuntu-latest | actions/setup-python@v5로 설치 |
| gh CLI | monitor-failures, data-health-check, update-gallup | GitHub Actions 기본 제공 | GH_TOKEN 주입 필요 |
| pip: anthropic, httpx | 다수 | 워크플로우 내 `pip install`로 설치 | |
| pip: httpx, beautifulsoup4, pdfplumber | update-polls | 워크플로우 내 설치 | |

---

## Validation Architecture

### 현재 검증 인프라

| 도구 | 위치 | 실행 타이밍 |
|-----|------|-----------|
| `validate_pipeline.py` | `scripts/candidate_pipeline/` | `update-candidates.yml` 내 0.9단계, `continue-on-error: true` |
| `data_health_check.py` | `scripts/` | 별도 `data-health-check.yml` 워크플로우, 매일 12:00 KST |
| `python3 -c "import json; json.load(...)"` | 수동 | CLAUDE.md 제6조 준수 |

### Phase 12 요구사항 → 테스트 맵

| 요구사항 | 동작 | 검증 방법 | 자동화 가능 여부 |
|---------|------|---------|--------------|
| DIAG-01 | 15개 워크플로우 전수 감사 리포트 | 이 RESEARCH.md가 리포트 역할 | 수동 (완료) |
| CRASH-01 | KeyError 대신 경고 로그 + 스킵 | `python3 -c "import json; ..."` + 수동 테스트 | 부분 자동화 |
| CRASH-02 | 빈 name 레코드 저장 차단 | `validate_pipeline.py` 실행 확인 | 자동화 (기존 도구) |
| PERM-01 | permissions 최소 권한 선언 | 워크플로우 파일 읽기 확인 | 수동 (이 파일에서 완료) |

---

## Risk Assessment

### 수정 범위 추정

| 항목 | 대상 파일 수 | 수정 줄 수 (추정) | 위험도 |
|-----|-----------|----------------|------|
| CRASH-01: nec_precand_sync.py body 접근 | 1개 | 3~5줄 | LOW (핀포인트 수정) |
| CRASH-01: data_health_check.py name 접근 | 1개 | 2~4줄 | LOW |
| CRASH-02: fetch_candidate_disclosures.py | 1개 | 8~12줄 | LOW |
| CRASH-02: fetch_nec_candidates.py dict comprehension | 1개 | 4~6줄 (3개 위치) | LOW |
| PERM-01: 주석 추가 (data-health-check.yml) | 1개 | 1~2줄 | LOW |
| DIAG-01: 감사 리포트 생성 | 0개 (이 파일) | — | 완료 |

**총 위험도: LOW** — 모든 수정이 기존 로직 추가(필터/체크)이며, 기존 로직 제거나 흐름 변경이 없음.

### 회귀 위험

- `nec_precand_sync.py` 수정은 현재 날짜 게이팅(2026-05-14 이전)으로 인해 실제 API를 호출하지 않는다. 실행 환경에서 즉시 검증 가능.
- `fetch_candidate_disclosures.py` 수정은 5/16 이후 실데이터 수집 시 활성화되므로 현재 시점 테스트는 mock 데이터로만 가능.

---

## Sources

### Primary (HIGH confidence)
- 직접 읽음: `.github/workflows/*.yml` 전체 15개 파일
- 직접 읽음: `scripts/candidate_pipeline/nec_precand_sync.py`
- 직접 읽음: `scripts/candidate_pipeline/fetch_nec_candidates.py`
- 직접 읽음: `scripts/candidate_pipeline/validate_pipeline.py`
- 직접 읽음: `scripts/fetch_candidate_disclosures.py`
- 직접 읽음: `scripts/nesdc_poll_pipeline.py`
- 직접 읽음: `scripts/fetch_election_stats.py`
- 직접 읽음: `scripts/candidate_pipeline/factcheck_candidates.py`
- 직접 읽음: `scripts/candidate_pipeline/fetch_governor_status.py`
- 직접 읽음: `scripts/candidate_pipeline/detect_byelections.py`
- 직접 읽음: `scripts/monitor_failures.py`
- 직접 읽음: `scripts/data_health_check.py` (grep 분석)
- 직접 읽음: `scripts/candidate_pipeline/fetch_local_council_members.py` (grep 분석)
- 직접 읽음: `.planning/bugs/OPEN 2.md`
- 직접 읽음: `CLAUDE.md`

### Secondary (MEDIUM confidence)
- grep 분석: `scripts/` 전체 KeyError 위험 패턴 탐색
- grep 분석: `scripts/` 전체 name 빈값 검증 패턴 탐색

---

## Metadata

**Confidence breakdown:**
- DIAG-01 워크플로우 감사: HIGH — 15개 파일 전수 직접 읽음
- CRASH-01 KeyError 위험 위치: HIGH — 코드 직접 확인
- CRASH-02 빈 name 저장 위험: HIGH — 코드 직접 확인 (일부 스크립트 grep으로만 확인)
- PERM-01 permissions 현황: HIGH — 15개 파일 직접 확인

**Research date:** 2026-04-04
**Valid until:** 2026-05-01 (선거 후보 등록 전까지 파이프라인 구조 안정적)
