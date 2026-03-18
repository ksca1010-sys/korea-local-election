# BidFlow 개선 — Claude Code 프롬프트 모음

> 순서대로 하나씩 실행. 각 작업 완료 후 검증하고 다음으로.
> 프롬프트는 그대로 복사해서 Claude Code에 붙여넣으면 됩니다.

---

## P0-1: 외부 API 에러 처리 표준화

```
현재 BidFlow v3 프로젝트를 점검해줘. 아래 작업을 순서대로 해줘.

1. nara-api.ts를 열어서 확인해줘:
   - NARA_API_KEY, NARA_API_BASE 환경변수가 없을 때 명확한 에러를 던지는지
   - API 호출 실패 시 빈 배열([])을 리턴하는 곳이 있으면 모두 찾아줘

2. 에러 처리를 표준화해줘:
   - 환경변수 누락 → throw new Error("NARA_API_KEY is not configured")
   - API 호출 실패 → { success: false, error: string, code: string } 형태로 통일
   - 절대로 실패를 빈 배열이나 null로 숨기지 마

3. API 라우트도 같이 수정해줘:
   - app/api/notices/filtered/route.ts
   - app/api/notices/all/route.ts  
   - app/api/bid-results/route.ts
   - 각 라우트에서 lib 에러를 받아서 적절한 HTTP 상태코드(500, 503 등)와 에러 메시지를 반환하게 해줘

4. 프론트엔드에서 에러 상태를 구분할 수 있게 해줘:
   - "데이터 없음"과 "연결 오류"를 구분하는 응답 구조

완료 후 npm run build로 빌드 확인해줘.
```

---

## P0-2: 헬스체크 API 추가

```
BidFlow에 운영 상태 확인용 헬스체크 API를 추가해줘.

1. app/api/health/route.ts를 만들어줘:
   - GET 요청으로 동작
   - 나라장터 공고 API 연결 테스트 (실제 1건 조회 시도)
   - 나라장터 낙찰 API 연결 테스트
   - 환경변수 설정 상태 (키 값은 노출하지 말고 configured: true/false만)
   - 응답 형태:
     {
       status: "healthy" | "degraded" | "unhealthy",
       checks: {
         noticesApi: { status, lastChecked },
         bidResultsApi: { status, lastChecked },
         envConfigured: { NARA_API_KEY: boolean, NARA_API_BASE: boolean }
       },
       timestamp: ISO string
     }

2. 모든 체크가 통과하면 200, 일부 실패면 207, 전체 실패면 503을 반환해줘.

완료 후 npm run build 확인.
```

---

## P0-3: 린트 에러 정리

```
BidFlow 프로젝트의 린트 에러를 전부 수정해줘.

1. 먼저 npm run lint를 실행해서 현재 에러 목록을 확인해줘.

2. 에러를 하나씩 수정해줘:
   - react-hooks/exhaustive-deps 경고: 의존성 배열 수정 (eslint-disable은 최후의 수단)
   - set-state-in-effect 관련: useEffect 내 setState 패턴 정리
   - immutability 에러: 직접 변이 대신 새 객체/배열 생성
   - any 타입이 있으면 적절한 타입으로 교체

3. 비즈니스 로직은 절대 변경하지 마. 린트 에러만 수정해.

4. 수정 후 npm run lint가 에러 0개로 통과하는지 확인해줘.
5. npm run build도 확인해줘.
```

---

## P1-4: 홈 공개 대시보드

```
BidFlow 홈페이지를 공개 대시보드로 변경해줘. 회사 정보를 입력하지 않은 첫 방문자도 가치를 느낄 수 있어야 해.

현재 상태: 홈에 "회사 정보를 입력하세요"만 보임. 이걸 바꿔야 해.

1. 홈페이지(app/(main)/page.tsx)를 수정해줘:

   상단 영역 — 오늘의 공고 현황:
   - /api/notices/all을 호출해서 총 공고 수, 마감 임박(D-3 이내) 수를 카드로 표시
   - 데이터 로딩 중에는 스켈레톤 UI
   - API 실패 시 "나라장터 연결 확인 중..." 메시지 (빈 화면 아님)

   중단 영역 — 최근 낙찰 샘플:
   - /api/bid-results에서 최근 5건을 가져와서 간단한 카드로 표시
   - 공고명, 낙찰금액, 낙찰률 정도만
   - "더 보기 →"로 낙찰현황 페이지 연결

   하단 영역 — 회사 설정 유도:
   - 회사 정보가 없으면: "내 조건에 맞는 공고만 보려면" + 설정 버튼
   - 회사 정보가 있으면: 기존처럼 맞춤 공고 요약

2. 디자인은 기존 Toss 스타일 유지. Card, Badge 컴포넌트 활용.
3. 금액은 format.ts의 fmtAmount 사용.

완료 후 npm run build 확인.
```

---

## P1-5: 공고 페이지 공개 모드

```
BidFlow 공고 페이지에 공개 모드를 추가해줘.

현재 문제: 회사 정보가 없으면 "참여 가능한 공고가 없습니다"만 보임.

1. notices/page.tsx를 수정해줘:

   회사 정보가 없는 경우:
   - /api/notices/all을 호출해서 전체 공고 목록을 보여줘
   - 상단에 안내 배너: "면허와 지역을 설정하면 참여 가능한 공고만 필터링합니다" + 설정 링크
   - 공고 카드는 기존 디자인 그대로 사용

   회사 정보가 있는 경우:
   - 기본: 내 조건 필터링된 공고 (기존 동작 유지)
   - 토글 스위치: "전체 공고 보기" ↔ "내 조건만"
   - 토글이 전체일 때는 /api/notices/all, 내 조건일 때는 /api/notices/filtered

2. 공고 카드에 회사 정보가 없어도 표시 가능한 정보만 보여줘:
   - 공고명, 발주처, 추정가격, 마감일, D-day
   - 적격 여부 배지는 회사 정보가 있을 때만 표시

3. 빈 상태 메시지를 개선해줘:
   - 전체 모드에서 0건: "현재 진행 중인 공고가 없습니다" (API 연결은 정상인 경우)
   - API 에러: "나라장터 연결에 문제가 있습니다. 잠시 후 다시 시도해주세요."

완료 후 npm run build 확인.
```

---

## P1-6: 낙찰현황 공개 모드

```
BidFlow 낙찰현황 페이지를 회사 정보 없이도 조회 가능하게 변경해줘.

현재 문제: "회사 정보를 설정하면 관련 낙찰 현황을 볼 수 있습니다"로 잠겨 있음.

1. history/page.tsx를 수정해줘:

   회사 정보 유무와 관계없이 조회 가능하게:
   - 기간 선택(1주/2주/4주)은 그대로 유지
   - 지역 필터 드롭다운 추가 (광역시도 → 시군구)
   - 업종 필터 드롭다운 추가 (전문건설 14개 + 종합건설 5개)
   - 회사 정보가 있으면 해당 지역/업종을 기본값으로 세팅
   - 회사 정보가 없으면 필터 비어있는 상태로 시작, "지역을 선택하세요"

2. /api/bid-results 라우트를 확인하고 필요하면 수정:
   - 지역, 업종 파라미터를 받아서 필터링할 수 있는지 확인
   - 나라장터 API가 지역/업종 필터를 지원하면 활용, 아니면 클라이언트 필터링

3. 낙찰 결과 카드에 표시할 정보:
   - 공고명, 발주처, 낙찰금액, 낙찰률, 참여업체 수
   - fmtAmount로 금액 포맷

4. 하단에 회사 정보 유도:
   - "내 조건에 맞는 낙찰 트렌드를 자동으로 보려면" + 설정 링크

완료 후 npm run build 확인.
```

---

## P2-7: 회사 정보 입력 2단계 분리

```
BidFlow 회사 정보 입력을 2단계로 분리해줘.

현재 문제: 첫 화면부터 시공능력, 재무제표, 신용등급까지 입력 요구 → 이탈 많음.

1. my-company/page.tsx를 수정해줘:

   1단계 (필수, 항상 보임):
   - 회사명
   - 지역 (광역 + 시군구)
   - 업체 구분 (전문/종합)
   - 면허 선택 (최소 1개)
   - "저장하고 공고 보기" 버튼

   2단계 (고급, 접힌 섹션):
   - "더 정밀한 분석을 위해 추가 정보 입력" 같은 라벨로 Collapsible/Accordion
   - 시공능력평가액
   - 최근 3년 시공실적
   - 재무제표 (유동자산/유동부채/부채총계/자기자본)
   - 신용평가등급
   - 접힌 상태가 기본

2. company store (store/company.ts)도 수정해줘:
   - 1단계만 입력해도 저장 가능하게 검증 조건 변경
   - isBasicComplete (지역 + 면허 있으면 true)
   - isAdvancedComplete (시공능력 + 재무 있으면 true)
   - 공고 필터링은 isBasicComplete만으로 동작
   - 정밀 시뮬레이션(사정율 분석)은 isAdvancedComplete일 때만 전체 실행

3. 기존 데이터 호환성: 이미 전체 입력한 사용자의 localStorage 데이터가 깨지지 않게 해줘.

완료 후 npm run build 확인.
```

---

## P2-8: 기본 프로필 편향 제거

```
BidFlow company store에서 기본 지역값(전남/영암군)을 제거해줘.

1. store/company.ts를 열어서:
   - 초기 상태에서 region, district가 미리 설정되어 있으면 빈 문자열('')로 변경
   - 다른 기본값도 확인: companyType, licenses 등이 미리 선택되어 있으면 비워줘

2. 이 변경으로 영향받는 곳을 확인해줘:
   - 홈, 공고, 낙찰현황 페이지에서 region이 빈 문자열일 때 에러 안 나는지
   - notice-filter.ts에서 region이 빈 문자열이면 지역 필터를 건너뛰는지

3. 기존 사용자가 이미 저장한 프로필은 영향 없어야 해 (localStorage에 값이 있으면 그대로 유지).

완료 후 npm run build 확인.
```

---

## 실행 팁

- 각 프롬프트를 실행하기 전에 git commit 해둬서 롤백 가능하게
- P0 3개는 1주차 월~화에 끝내는 게 목표
- P1 3개는 1주차 수~금
- P2 2개는 2주차 월~화
- 각 작업 완료 후 vercel에 푸시해서 배포 확인
```
