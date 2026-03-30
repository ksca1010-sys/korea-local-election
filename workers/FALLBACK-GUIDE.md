# Worker 장애 시 수동 JSON 폴백 전환 가이드

**목적:** Worker 다운 시 5분 내 수동 개표 데이터 입력으로 지도 업데이트 복구
**대상:** 선거 당일 운영 담당자 (비기술 운영자 포함)

---

## 상황 판단 — Worker 다운 여부 확인

아래 중 하나라도 해당하면 Worker 장애로 판단한다:

- [ ] `curl https://election-night.ksca1010.workers.dev/health` → 응답 없음 또는 오류
- [ ] 브라우저 콘솔 (F12 → Console)에 `Worker 응답 실패` 메시지 표시
- [ ] 지도 색상이 개표 시작 후에도 업데이트되지 않음 (20분 이상 미변경)
- [ ] `index.html` 우측 패널 하단에 빨간 "수동 업데이트 모드" 박스가 자동으로 표시됨

> Worker 자동 감지 시: 3회 실패 후 수동 폴백 UI가 자동으로 나타납니다.
> 자동으로 나타나지 않으면 아래 Step 1부터 수동으로 진행하세요.

---

## Step 1: 폴백 모드 활성화

1. [ ] 사이트(`https://korea-local-eletion.pages.dev`)를 브라우저로 연다
2. [ ] `F12` 또는 `Cmd+Option+I` (Mac)로 개발자 도구(DevTools)를 연다
3. [ ] **Console** 탭을 클릭한다
4. [ ] 다음 명령어를 정확히 입력하고 Enter를 누른다:

```javascript
App._setManualFallbackMode(true)
```

5. [ ] 우측 패널 하단에 빨간 테두리의 **"수동 업데이트 모드"** 박스가 나타나면 성공

> 성공 확인: 박스가 보이지 않으면 Console에 오류 메시지가 있는지 확인

---

## Step 2: 개표 데이터 JSON 준비

1. [ ] 새 브라우저 탭에서 `https://info.nec.go.kr` → 개표 진행상황 → 광역단체장 접속
2. [ ] 각 시도별 개표율(%), 1위 후보 이름, 1위 후보 득표율(%)을 확인
3. [ ] 아래 JSON 형식으로 작성한다 (텍스트 편집기 또는 메모장 사용):

### JSON 최소 예시 (3개 지역):

```json
{
  "fetchedAt": "2026-06-03T20:00:00+09:00",
  "electionId": "0020260603",
  "sgTypecode": "11",
  "regions": {
    "seoul":  { "countRate": 45.2, "leadingCandidate": "홍길동", "leadingParty": "ppp",        "leadingVoteRate": 52.1, "declared": false },
    "busan":  { "countRate": 38.7, "leadingCandidate": "김철수", "leadingParty": "democratic", "leadingVoteRate": 55.3, "declared": false },
    "daegu":  { "countRate": 51.0, "leadingCandidate": "이영희", "leadingParty": "ppp",        "leadingVoteRate": 68.2, "declared": false }
  }
}
```

### 전체 17개 지역 키 목록:
```
seoul, busan, daegu, incheon, gwangju, daejeon, ulsan, sejong,
gyeonggi, gangwon, chungbuk, chungnam, jeonbuk, jeonnam,
gyeongbuk, gyeongnam, jeju
```

### 각 지역 필드 설명:
| 필드 | 예시 | 설명 |
|------|------|------|
| `countRate` | `45.2` | 개표율 (%, 소수점 1자리) |
| `leadingCandidate` | `"홍길동"` | 1위 후보 이름 |
| `leadingParty` | `"ppp"` | 정당 코드 (ppp/democratic/justice 등) |
| `leadingVoteRate` | `52.1` | 1위 후보 득표율 (%) |
| `declared` | `false` | 당선 확정 여부 |

---

## Step 3: JSON 붙여넣기 + 적용

1. [ ] Step 1에서 나타난 **"수동 업데이트 모드"** 박스의 텍스트 입력칸을 클릭
2. [ ] Step 2에서 작성한 JSON을 **전체 선택 후 붙여넣기** (Ctrl+V / Cmd+V)
3. [ ] **"적용"** 버튼을 클릭

---

## Step 4: 적용 확인

- [ ] 텍스트 입력칸 오른쪽에 **"적용 완료 (HH:MM:SS)"** 메시지 표시 → 성공
- [ ] 지도에 개표율에 따른 색상 레이어가 반영됨
- [ ] 오류 메시지(`오류: ...`)가 표시되면 → 아래 주의사항 확인

---

## Step 5: 반복 갱신 (새 개표 데이터 업데이트)

약 10~20분마다:

1. [ ] NEC 개표 페이지에서 최신 수치 확인
2. [ ] JSON의 `fetchedAt` 시간, 각 지역 `countRate`, `leadingVoteRate` 수정
3. [ ] 수동 업데이트 박스에 붙여넣기 → **"적용"** 버튼 클릭
4. [ ] "적용 완료" 메시지 확인

---

## 주의사항

### declared: true 설정 기준 (헌법 제2조)

- `declared: true`는 NEC 공식 페이지에서 **"당선"** 텍스트가 확인된 경우에만 설정
- 개표율 높다고 추정하여 `declared: true` 설정 **절대 금지**
- 당선 확정 전까지는 반드시 `declared: false` 유지

### JSON 오류 대처

| 오류 메시지 | 원인 | 해결 방법 |
|-------------|------|-----------|
| `오류: Unexpected token` | JSON 문법 오류 | 중괄호/쉼표/따옴표 확인 |
| `오류: regions 필드 없음` | `"regions":` 키 누락 | JSON 구조 재확인 |
| `오류: JSON.parse failed` | 빈 입력 또는 텍스트만 입력 | JSON 형식인지 확인 |

### JSON 검증 방법

붙여넣기 전 `https://jsonlint.com`에서 JSON 유효성 검사 가능

---

## Worker 복구 후 정상 모드 전환

Worker가 복구되었을 때:

```javascript
App._setManualFallbackMode(false)
```

콘솔에 입력하면 자동 업데이트 모드로 복귀한다.

---

**참고 파일:**
- 2022년 스키마 예시: `workers/election-night/fixtures/2022-sample.json`
- Worker 코드: `workers/election-night/index.js`
- NEC URL 캡처 가이드: `workers/CAPTURE-GUIDE.md`
