# 선거일 최종 배포 체크리스트

**목적:** 6/1~2(D-02~D-01)에 이 문서를 보고 단계별로 최종 배포를 완료한다.
**대상:** 기술 담당자
**마감:** 2026-06-01 (선거 전날 배포 완료 권장)

---

## 사전 조건

이 체크리스트를 시작하기 전에 아래 두 문서를 먼저 완료/숙지해야 한다.

- [ ] **`workers/CAPTURE-GUIDE.md` 절차 완료** — NEC 개표 API URL 캡처 및 `index.js` 기입 완료
  - 마감: 2026-05-26 (선거 1주 전)
  - 완료 기준: CAPTURE-GUIDE.md 체크리스트 6/6 통과
- [ ] **`workers/FALLBACK-GUIDE.md` 숙지 완료** — Worker 장애 시 5분 내 수동 JSON 폴백 절차 숙지
  - 장애 상황에서 당황하지 않도록 선거일 전에 1회 통독

---

## Part 1: Worker 배포 (per D-01 — NEC URL 기입 + wrangler deploy)

### 1-1. NEC_URL 최종 확인

- [ ] `workers/election-night/index.js` 파일 열기
- [ ] `fetchAndParseNEC()` 함수 내 **`NEC_URL`** 변수 (line ~98) 확인

```javascript
// 아래 줄이 이렇게 되어 있어야 한다 (빈 문자열이면 CAPTURE-GUIDE.md 미완료):
const NEC_URL = 'https://info.nec.go.kr/...실제URL...';  // 캡처된 URL
```

- [ ] `NEC_URL`이 빈 문자열(`''`)이 아닌지 확인
- [ ] URL 내 파라미터 `electionId=0020260603` 포함 여부 확인 (2022 ID `0020220601` 혼입 방지 — 헌법 제4조)

### 1-2. Worker 배포

```bash
cd workers/election-night
npx wrangler deploy
```

- [ ] 위 명령어 실행 후 오류 없이 완료되는지 확인
- [ ] 출력에 `"election-night"` Worker 이름과 배포 URL 표시 확인
  - 예상 URL: `https://election-night.ksca1010.workers.dev`

### 1-3. Worker 헬스체크

```bash
curl https://election-night.ksca1010.workers.dev/health
```

- [ ] 응답이 `{"status":"ok"}` 인지 확인
- [ ] HTTP 200 응답인지 확인

```bash
curl https://election-night.ksca1010.workers.dev/results
```

- [ ] HTTP 200 응답인지 확인 (데이터 없어도 200 OK 반환해야 함)
  - 예상 응답: `{"error":"No data yet","regions":{}}` 또는 실제 개표 데이터 JSON

---

## Part 2: Pages 배포 (per D-02 — git push 또는 wrangler pages deploy)

### 2-1. 변경사항 커밋 + Push

모든 변경사항(NEC_URL 기입 포함)을 커밋하고 push한다:

```bash
git add workers/election-night/index.js
git commit -m "chore: 선거일 NEC_URL 기입 — electionId=0020260603"
git push origin main
```

- [ ] git push 완료 — Cloudflare Pages 자동 빌드 트리거 확인

### 2-2. Pages 빌드 대기

- [ ] Cloudflare Dashboard → Pages → `korea-local-eletion` → 빌드 상태 확인
  - URL: https://dash.cloudflare.com → Workers & Pages
  - 빌드 완료까지 보통 1~3분 소요

**또는 수동 배포 (자동 빌드 실패 시 대안):**

```bash
npx wrangler pages deploy . --project-name korea-local-eletion
```

- [ ] Pages 배포 완료 — https://korea-local-eletion.pages.dev 접속 확인

---

## Part 3: 브라우저 스모크 테스트 (per D-02 — 30초 수동)

https://korea-local-eletion.pages.dev 를 Chrome으로 열고 아래 항목 확인:

- [ ] **지도 로딩** — D3.js 렌더링, 17개 광역 지도 표시
- [ ] **탭 전환** — 개요/후보/여론조사/뉴스/역대비교 중 3개 이상 클릭하여 오류 없음 확인
- [ ] **선거 배너** — DevTools Console에서 확인:
  ```javascript
  document.getElementById('election-banner')
  // null이 아닌 요소가 반환되어야 함
  ```
- [ ] 브라우저 콘솔 오류 없음 (빨간 오류 0건 기준)

---

## Part 4: 최종 설정 확인

- [ ] **Worker Cron Trigger 활성** — Cloudflare Dashboard → Workers & Pages → `election-night` → Settings → Triggers → Cron Triggers에 `* * * * *` 표시
- [ ] **KV Namespace Binding 확인** — Settings → Variables → KV Namespace Bindings에 `ELECTION_RESULTS` → `db737acc9d624075bab261c60628f95c` 연결 확인

---

## Part 5: 선거일(6/3) 당일 모니터링

선거일 18:00 이후 10~20분마다 아래 확인:

- [ ] `curl https://election-night.ksca1010.workers.dev/health` → `{"status":"ok"}` 지속 확인
- [ ] `curl https://election-night.ksca1010.workers.dev/results` → `regions`에 실제 개표 데이터 포함 확인
- [ ] 브라우저 지도 색상 업데이트 확인

---

## 장애 대응

| 장애 유형 | 대응 방법 |
|-----------|-----------|
| Worker 응답 없음 / 지도 미업데이트 | `workers/FALLBACK-GUIDE.md` 참조 — 5분 내 수동 JSON 폴백 전환 |
| Pages 빌드 실패 | Cloudflare Dashboard → 이전 배포로 롤백 (2클릭) |
| wrangler deploy 인증 오류 | `npx wrangler login` 재인증 후 재시도 |
| NEC_URL 응답 이상 | CAPTURE-GUIDE.md Step 5 파서 재조정 |

---

## 배포 체크리스트 완료 기준

아래 4가지가 모두 완료되어야 배포 완료로 간주한다:

- [ ] Part 1: Worker 배포 + /health OK
- [ ] Part 2: Pages 배포 + 사이트 접속 OK
- [ ] Part 3: 브라우저 스모크 전항목 통과
- [ ] Part 4: Cron Trigger + KV Binding 확인

---

## 범위 외 (현재 플랜 deferred)

- 모니터링 자동화 (알림, Slack 연동)
- 롤백 절차 상세 문서화
- 다중 장애 시나리오 대응 자동화

---

**참조 문서:**
- NEC URL 캡처: `workers/CAPTURE-GUIDE.md`
- Worker 장애 폴백: `workers/FALLBACK-GUIDE.md`
- Worker 코드: `workers/election-night/index.js`
- Worker 설정: `workers/election-night/wrangler.toml`

**서비스 URL:**
- Worker: https://election-night.ksca1010.workers.dev
- Pages: https://korea-local-eletion.pages.dev
- Cloudflare Dashboard: https://dash.cloudflare.com
