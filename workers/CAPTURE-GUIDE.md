# NEC 개표 API URL 캡처 가이드

**마감:** 2026-05-26 (선거일 1주 전)
**대상:** info.nec.go.kr 실시간 개표 진행 페이지

## 사전 준비

- Chrome 브라우저
- DevTools 열기 단축키: Cmd+Option+I (Mac) / F12 (Windows)

## 캡처 절차

### Step 1: 개표 페이지 접속
1. Chrome으로 `https://info.nec.go.kr` 접속
2. 투표·개표 메뉴 클릭
3. "개표 진행상황" 또는 "개표 현황" 선택
4. "광역단체장(시·도지사)" 선거 유형 선택

### Step 2: DevTools Network 탭 캡처
1. DevTools 열기 (Cmd+Option+I)
2. Network 탭 선택
3. XHR/Fetch 필터 활성화
4. 페이지 새로고침 (Cmd+R)
5. `info.nec.go.kr` 도메인 요청 중 개표 데이터를 반환하는 AJAX 요청 찾기
   - URL 패턴 추정: `electionInfo_report.xhtml` 또는 JSON endpoint
   - 파라미터 확인: `electionId`, `sgTypecode=11`, `cityCode`

### Step 3: URL 복사
1. 해당 요청 우클릭 → "Copy as cURL" 또는 "Copy URL"
2. URL에서 `electionId=0020260603` 확인 (2026 선거 ID)
3. Response 탭에서 HTML/JSON 형태 확인

### Step 4: Worker 코드에 기입
1. `workers/election-night/index.js` 열기
2. `fetchAndParseNEC()` 함수 내 `NEC_URL` 변수 (line 98) 찾기
3. `const NEC_URL = '';` → `const NEC_URL = '캡처한 URL';` 교체
4. `electionId` 파라미터가 `0020260603`(2026)인지 확인 (2022 ID 혼입 방지)

### Step 5: 파서 조정
1. Response 실제 HTML/JSON 구조를 확인
2. `parseNECResponse()` 내 `// TODO(5/26)` 마커 위치에서 정규식 조정
3. `node workers/election-night/test-parser.cjs` 통과 확인

## 체크리스트

- [ ] NEC_URL에 실제 URL 기입 완료
- [ ] electionId = 0020260603 확인
- [ ] parseNECResponse() 정규식 실제 HTML에 맞게 조정
- [ ] test-parser.cjs 8/8 통과
- [ ] `npx wrangler dev --test-scheduled` 로컬 테스트 통과
- [ ] `wrangler deploy` 배포 완료

## 주의사항

- NEC_CONFIG.ELECTION_ID_2022 (0020220601)와 혼동 금지
- declared: true는 HTML에 "당선" 텍스트 존재 시에만 (헌법 제2조)
