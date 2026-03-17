# BidFlow v3 실제 개발용 요청서

이 문서는 `BidFlow v3`를 새 프로젝트로 구현할 때 Codex에 바로 전달할 수 있도록 정리한 실무용 요청서다. 원본 문서의 의도는 유지하되, 실제 개발 세션에서 모호함 없이 작업이 진행되도록 지시 형식과 완료 기준을 재구성했다.

## 1. 프로젝트 목표

`BidFlow v3`는 나라장터 기반 공공입찰 분석 시스템이다. 목표는 다음 파이프라인을 코드로 구현하는 것이다.

`공고 수집 -> 자격 필터링 -> 적격심사 점수 시뮬레이션 -> 투찰가 산출 -> 투찰 의사결정`

대상 회사는 전문건설업체이며, 핵심 업종은 `지반조성공사업`과 `철근콘크리트공사업`이다. 소재지는 `전남 영암군`을 기본값으로 사용한다.

## 2. 이 요청서의 사용 방식

이 요청서는 `새 프로젝트`를 만들기 위한 기준이다. 기존 `korea-local-eletion` 코드베이스를 수정하는 요청이 아니다.

Codex에는 아래 순서로 작업을 맡긴다.

1. 새 프로젝트 디렉터리 `bidflow-v3`를 생성한다.
2. `BID_ENGINE_SPEC.md`를 최우선 명세로 삼아 구현한다.
3. `AGENTS.md`의 폴더 구조, 금지사항, 비즈니스 규칙을 따른다.
4. 아래 Phase 순서대로 구현한다.
5. 각 Phase마다 실제 파일 수정, 테스트, 결과 요약까지 마친다.

## 3. 우선 참조 문서

다음 문서 순서로 우선순위를 둔다.

1. `BID_ENGINE_SPEC.md`
2. `AGENTS.md`
3. 이 요청서

문서 간 충돌이 있으면 `BID_ENGINE_SPEC.md`를 우선한다. 그래도 모호하면 추정하지 말고 질문한다.

## 4. 기술 스택과 기본 구조

- Framework: `Next.js 14` App Router
- Language: `TypeScript` strict mode
- DB: `Supabase PostgreSQL`
- Styling: `Tailwind CSS`
- State: `Zustand`
- Charts: `Recharts`
- Deployment target: `Vercel`

기본 폴더 구조는 아래를 따른다.

```text
bidflow-v3/
├── app/
│   ├── (dashboard)/
│   │   ├── page.tsx
│   │   ├── notices/
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx
│   │   ├── bid-calc/
│   │   │   └── page.tsx
│   │   └── my-company/
│   │       └── page.tsx
│   ├── api/
│   │   ├── notices/route.ts
│   │   ├── eligibility/route.ts
│   │   ├── score-simulation/route.ts
│   │   └── bid-price/route.ts
│   └── layout.tsx
├── lib/
│   ├── eligibility-checker.ts
│   ├── score-simulator.ts
│   ├── bid-calculator.ts
│   ├── floor-rates.ts
│   ├── nara-api.ts
│   └── supabase.ts
├── supabase/
│   └── migrations/
├── types/
│   └── index.ts
├── tests/
└── .env.local.example
```

## 5. 절대 규칙

- `any` 타입을 사용하지 않는다.
- 프로덕션 코드에 `console.log`를 남기지 않는다.
- API 키와 비밀값은 모두 환경변수로 처리한다.
- 비즈니스 로직은 `lib/`에만 둔다.
- API Route는 thin layer로 유지한다.
- 금액 계산은 부동소수점 오차를 피하도록 정수 연산 또는 `BigInt` 기반으로 처리한다.
- 낙찰하한율은 반드시 `2026-01-30` 개정 기준을 반영하고, 공고일 기준으로 구버전/신버전을 자동 분기한다.
- `15C4` 조합은 정확히 `1,365`개를 계산한다.
- 적격심사 통과점수는 기본 `95점`, 예외 규칙이 명시되면 그 값을 따른다.
- DB 직접 쿼리 남발 대신 `Supabase` client 또는 명확한 데이터 접근 계층을 사용한다.

## 6. 구현 원칙

- 함수 하나는 하나의 역할만 맡긴다.
- 불명확한 로직은 추정 구현하지 않는다.
- 계산 함수에는 입력, 출력, 예외 조건이 드러나는 타입을 둔다.
- 핵심 계산 로직에는 최소한의 테스트를 반드시 붙인다.
- 법령/별표 기준이 코드에 반영되는 부분은 주석으로 근거를 짧게 남긴다.
- 사용자 응답에서 전체 파일 덤프를 나열하지 말고, 실제 파일을 수정한 뒤 변경 내용과 검증 결과를 요약한다.

## 7. Phase 순서

반드시 아래 순서를 지킨다.

### Phase 0. 프로젝트 부트스트랩

구현 대상:

- `Next.js 14` 신규 프로젝트 생성
- `TypeScript strict` 설정
- `Tailwind CSS`, `Zustand`, `Recharts`, `Supabase` 초기 세팅
- `types/index.ts` 기본 타입 골격 생성
- `lib/supabase.ts` 생성
- `.env.local.example` 생성
- `README.md`에 로컬 실행 방법 추가

완료 기준:

- 개발 서버가 기동된다.
- 기본 라우트 구조가 존재한다.
- 환경변수 예시 파일이 준비된다.

### Phase 1. DB + 자격 필터링

구현 대상:

- `supabase/migrations/001_initial_schema.sql`
- `company_profile`
- `construction_records`
- `financial_statements`
- `calc_financial_ratios` 트리거
- `qualification_criteria` 및 초기 데이터
- `industry_avg_ratios`
- `lib/floor-rates.ts`
- `lib/eligibility-checker.ts`
- `app/api/eligibility/route.ts`
- 자격 필터링 테스트

핵심 요구사항:

- 면허 매칭
- 시공능력평가액 체크
- 지역 제한 확인
- 실적 제한 확인
- 발주기관과 추정가격에 따른 적용 기준 결정
- `2026-01-30` 전후 낙찰하한율 자동 분기

완료 기준:

- 자격 가능/불가 테스트 케이스가 각각 최소 2개 이상 통과한다.
- API 응답 형식이 `BID_ENGINE_SPEC.md` 4.1과 일치한다.

### Phase 2. 적격심사 점수 시뮬레이터

구현 대상:

- `lib/score-simulator.ts`
- `app/api/score-simulation/route.ts`
- 재무비율 기반 경영상태 점수 로직
- 신용평가 대체 로직
- 필요 입찰가격 점수 역산
- 전략 메시지 생성

핵심 요구사항:

- 시공경험, 기술능력, 경영상태, 신인도 점수를 산출한다.
- 경영상태는 업계 평균 대비 등급화 규칙을 반영한다.
- 각 항목은 배점 상한을 넘지 않게 clamp 처리한다.
- `requiredBidPriceScore`와 `bidPriceScoreMargin`을 계산한다.

완료 기준:

- 샘플 입력과 출력 예시를 재현할 수 있다.
- 수행능력 점수 부족 시 경고 메시지가 나온다.

### Phase 3. 15C4 투찰가 산출 엔진

구현 대상:

- `lib/bid-calculator.ts`
- `simulate15C4()`
- `calculateBidPrice()`
- `calculateAValue()`
- `app/api/bid-price/route.ts`

핵심 요구사항:

- 복수예비가격 15개 기준 `1,365`개 조합을 빠짐없이 계산한다.
- 히스토그램 `bin_size = 0.001`
- `mode`, `mean`, `median`, `stdDev`, `CI_95` 산출
- 전략별 `aggressive`, `normal`, `safe`, `conservative` 추천값 생성
- 별표2~5 입찰가격 점수 산식을 반영
- 필요 시 `A값` 제외 산식 처리

완료 기준:

- `simulate15C4()` 단위 테스트가 있다.
- 별표3 기준 샘플 계산 결과를 재현할 수 있다.
- 추천 결과가 낙찰확률 내림차순 또는 명확한 전략 순서로 일관되게 반환된다.

### Phase 4. 나라장터 API 연동

구현 대상:

- `lib/nara-api.ts`
- `fetchNoticeList()`
- `fetchNoticeDetail()`
- `fetchLicenseRestriction()`
- `fetchBidResult()`
- `app/api/notices/route.ts`
- `app/(dashboard)/notices/page.tsx`

핵심 요구사항:

- 나라장터 응답을 내부 `NoticeInfo` 형태로 변환한다.
- 날짜를 ISO 8601로 변환한다.
- 지역코드 매핑을 포함한다.
- 공고 목록에서 자격 여부 badge를 함께 표시한다.

완료 기준:

- 로컬에서 목록 조회 플로우를 재현할 수 있다.
- 외부 API 실패 시 명시적 에러 처리가 된다.

### Phase 5. 대시보드 UI

구현 대상:

- `app/(dashboard)/page.tsx`
- `app/(dashboard)/bid-calc/page.tsx`
- `app/(dashboard)/my-company/page.tsx`

핵심 요구사항:

- 참여 가능 공고 수, 마감 임박 공고, 최근 투찰 이력 요약
- 점수 시뮬레이션 결과 패널
- `15C4` 히스토그램 시각화
- 4개 전략 카드
- 회사 프로필, 실적, 재무제표 입력 폼
- 모바일 반응형

완료 기준:

- 주요 화면이 데스크톱과 모바일에서 깨지지 않는다.
- 금액이 한국식 단위로 표시된다.
- 낙찰확률 색상 규칙이 반영된다.

## 8. API 응답 형식 기준

아래 형식은 구현 시 맞춰야 하는 최소 기준이다.

### 자격 확인 API

`GET /api/eligibility?bidNtceNo=xxx`

반환 예:

```json
{
  "eligible": true,
  "matchedLicense": "지반조성공사업",
  "capabilityMargin": 300000000,
  "applicableCriteria": "별표3",
  "floorRate": 89.745,
  "scoring": {},
  "warnings": ["실적 확인 필요"]
}
```

### 점수 시뮬레이션 API

`POST /api/score-simulation`

반환 예:

```json
{
  "performanceScore": {
    "constructionExp": 3.2,
    "techCapability": 1.5,
    "financialStatus": 8.0,
    "credibility": 0.5,
    "subtotal": 13.2
  },
  "requiredBidPriceScore": 81.8,
  "maxBidPriceScore": 84,
  "bidPriceScoreMargin": 2.2,
  "strategy": "수행능력 보통 - 안전 전략 권장"
}
```

### 투찰가 산출 API

`POST /api/bid-price`

반환 예:

```json
{
  "simulation": {
    "modeRate": 99.923,
    "stdDev": 0.052
  },
  "recommendations": [
    {
      "strategy": "aggressive",
      "bidAmount": 285300000,
      "winProbability": 35,
      "riskLevel": "high"
    }
  ],
  "safeRange": {
    "minBidAmount": 283500000,
    "maxBidAmount": 295000000
  },
  "scoreProjection": {
    "performanceSubtotal": 13.2,
    "estimatedBidPriceScore": 82.5,
    "estimatedTotal": 95.7,
    "passLikelihood": "통과"
  }
}
```

## 9. 세션 운영 규칙

Codex는 각 작업에서 아래 방식으로 응답해야 한다.

1. 작업 전:
   - 현재 Phase와 구현 범위를 한두 문장으로 확인한다.
   - 명세 충돌이나 누락이 있으면 먼저 지적한다.

2. 작업 중:
   - 실제 파일을 생성하거나 수정한다.
   - 필요한 테스트나 검증 명령을 실행한다.

3. 작업 후:
   - 수정한 핵심 파일만 짧게 요약한다.
   - 실행한 테스트 결과를 적는다.
   - 남은 리스크나 미확정 사항이 있으면 적는다.
   - 다음으로 진행할 Phase 또는 세부 작업 1개를 제안한다.

주의:

- 전체 파일 내용을 매번 응답에 복붙하지 않는다.
- 설명만 하지 말고 실제 변경을 수행한다.
- 테스트를 못 돌렸으면 그 사실과 이유를 명확히 적는다.

## 10. Codex에 바로 넣을 초기 요청 프롬프트

아래 프롬프트를 새 세션의 첫 요청으로 사용한다.

```text
새 프로젝트 `bidflow-v3`를 구현해줘.

작업 기준 문서:
1. BID_ENGINE_SPEC.md
2. AGENTS.md
3. BIDFLOW_V3_DEV_REQUEST.md

중요 규칙:
- BID_ENGINE_SPEC.md를 최우선 명세로 사용
- 새 프로젝트로 구현하고 기존 다른 프로젝트 코드는 건드리지 말 것
- Next.js 14 + TypeScript strict + Supabase + Tailwind + Zustand + Recharts 사용
- 비즈니스 로직은 lib/에 격리하고 API Route는 thin하게 유지
- any 금지, 정수 연산 우선, 2026-01-30 낙찰하한율 개정 반영
- 실제 파일 수정과 검증까지 수행하고, 결과는 짧게 요약할 것
- 모호한 부분은 추정하지 말고 질문할 것

먼저 Phase 0을 진행해줘.
구체적으로는:
- bidflow-v3 초기 프로젝트 생성
- 기본 폴더 구조 생성
- types/index.ts 기본 타입 정의
- lib/supabase.ts 생성
- .env.local.example 생성
- README.md에 실행 방법 작성

완료 후 생성된 구조, 실행 여부, 다음 단계만 간단히 알려줘.
```

## 11. Phase별 후속 요청 프롬프트

### Phase 1 요청

```text
Phase 1을 진행해줘.

BID_ENGINE_SPEC.md Section 2, 3.1, 4.1과 BIDFLOW_V3_DEV_REQUEST.md의 Phase 1 기준으로 다음을 구현해줘.

- supabase/migrations/001_initial_schema.sql
- lib/floor-rates.ts
- lib/eligibility-checker.ts
- app/api/eligibility/route.ts
- 자격 필터링 테스트

반드시 면허 매칭, 시평액 체크, 지역 제한, 실적 제한, 적용 별표 결정, 2026-01-30 전후 하한율 분기를 구현해줘.

완료 후:
- 통과한 테스트
- 남은 미확정 로직
- 다음 Phase 진입 가능 여부
만 짧게 알려줘.
```

### Phase 2 요청

```text
Phase 2를 진행해줘.

BID_ENGINE_SPEC.md Section 3.2, 4.2와 BIDFLOW_V3_DEV_REQUEST.md의 Phase 2 기준으로 적격심사 점수 시뮬레이터를 구현해줘.

구현 대상:
- lib/score-simulator.ts
- app/api/score-simulation/route.ts
- 관련 테스트

반드시 시공경험, 기술능력, 경영상태, 신인도, requiredBidPriceScore, bidPriceScoreMargin, 전략 메시지를 구현하고 샘플 입력/출력을 검증해줘.
```

### Phase 3 요청

```text
Phase 3을 진행해줘.

BID_ENGINE_SPEC.md Section 3.3, 3.5, 4.3과 BIDFLOW_V3_DEV_REQUEST.md의 Phase 3 기준으로 투찰가 산출 엔진을 구현해줘.

구현 대상:
- lib/bid-calculator.ts
- app/api/bid-price/route.ts
- 관련 테스트

반드시 15C4 1,365개 조합, 히스토그램, 통계량, 전략별 추천, 별표2~5 입찰가격 점수, A값 처리를 구현해줘.
완료 후 별표3 기준 샘플 계산을 보여줘.
```

### Phase 4 요청

```text
Phase 4를 진행해줘.

BID_ENGINE_SPEC.md Section 4와 BIDFLOW_V3_DEV_REQUEST.md의 Phase 4 기준으로 나라장터 API 연동과 공고 목록 화면을 구현해줘.

구현 대상:
- lib/nara-api.ts
- app/api/notices/route.ts
- app/(dashboard)/notices/page.tsx

외부 API 실패 시 에러 처리를 명시적으로 넣고, 공고 목록에서 자격 여부 badge가 보이도록 해줘.
```

### Phase 5 요청

```text
Phase 5를 진행해줘.

BID_ENGINE_SPEC.md Section 1, 3, 7과 BIDFLOW_V3_DEV_REQUEST.md의 Phase 5 기준으로 대시보드 UI를 구현해줘.

구현 대상:
- app/(dashboard)/page.tsx
- app/(dashboard)/bid-calc/page.tsx
- app/(dashboard)/my-company/page.tsx

점수 시뮬레이션 패널, 15C4 히스토그램, 전략 카드, 회사 프로필/실적/재무제표 입력 화면을 완성해줘.
완료 후 주요 컴포넌트 구조와 검증 결과를 짧게 알려줘.
```

## 12. 아직 사용자 입력이 필요한 항목

아래 값은 실제 서비스 품질에 직접 영향을 주므로 구현 중간에 실제 데이터 입력이 필요하다.

- 회사 기본정보
- 면허 등록번호와 등록일
- 업종별 시공능력평가액
- 보유 기술자 목록
- 최근 3년 시공실적
- 최근 재무제표
- 신용평가등급
- 신인도 가감점 관련 자료

위 데이터가 없더라도 개발은 진행할 수 있지만, 초기에는 seed 또는 mock 데이터로 명확히 분리해서 넣어야 한다.
