# Phase 1: 긴급 버그·보안 수정 - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-29
**Phase:** 01-urgent-bug-security-fix
**Areas discussed:** 교육감 support 없을 때 UI, Clarity 동의 배너 UX, CSP 정책 엄격도, 버전 타임스탬프 통일 방식

---

## 교육감 support 없을 때 UI

| Option | Description | Selected |
|--------|-------------|----------|
| 후보 이름만 표시 | support 없으면 % 숨김, 이름만 badge 표시 | |
| 여론조사 섹션 자체 숨김 | 교육감 선택 시 overview panel에 여론조사 섹션 안 보임 | |
| '여론조사 없음' 메시지 | '여론조사 데이터 없음' 등 텍스트 표시 | ✓ |

**User's choice:** '여론조사 없음' 메시지 → 한국어 문자열, muted 색상

| Option | Description | Selected |
|--------|-------------|----------|
| 한국어 문자열 | '여론조사 데이터 없음' muted 색상 | ✓ |
| 아이콘 + 텍스트 | ⚠️ 여론조사 미등록 스타일 | |

**Notes:** poll-tab.js에서 교육감 선택 + support 없는 경우 → 여론조사 탭 전체 숨김 (빈 리스트 표시 금지).

---

## Clarity 동의 배너 UX

| Option | Description | Selected |
|--------|-------------|----------|
| 하단 sticky 바 | 페이지 하단 고정, 콘텐츠 방해 최소화 | ✓ |
| 상단 sticky 바 | 사이트 상단 고정, 주목도 높음 | |
| 모달 오버레이 | 첫 방문 시 중앙 모달, 사용 차단 | |

**User's choice:** 하단 sticky 바

| Option | Description | Selected |
|--------|-------------|----------|
| 365일 | 1년간 재요청 없음 | ✓ |
| 30일 | 더 자주 동의 요청 | |
| 세션 만료 | 브라우저 닫으면 재요청 | |

**User's choice:** 365일

| Option | Description | Selected |
|--------|-------------|----------|
| 동의 / 거부 | 간결한 두 버튼 | ✓ |
| 자세한 안내문 | 적수점, 설명 포함 | |

**User's choice:** 동의 / 거부

---

## CSP 정책 엄격도

| Option | Description | Selected |
|--------|-------------|----------|
| CDN 신뢰 도메인 허용리스트 | 사용 CDN만 열거, 현실적 | ✓ |
| nonce 기반 엄격 CSP | 모든 인라인 스크립트 nonce 필요, 큰 수정 | |
| CSP 헤더 제외 | X-Frame-Options 등만 적용 | |

**User's choice:** CDN 신뢰 도메인 허용리스트

| Option | Description | Selected |
|--------|-------------|----------|
| report-uri 없이 | 단순하게 | ✓ |
| Cloudflare CSP 리포트마커 포함 | 위반 로그 수집 | |

**User's choice:** report-uri 없이

---

## 버전 타임스탬프 통일 방식

| Option | Description | Selected |
|--------|-------------|----------|
| JS 타임스탬프로 index.html 1번 수동 수정 | CSS v=1774711234로 1줄 변경 | ✓ |
| deploy.sh 자동 timestamp 단계 추가 | date +%s로 배포마다 새 번호 생성 | |

**User's choice:** 수동 수정 (deploy.sh 자동화는 Phase 3로 이연)

---

*Discussion log: 2026-03-29*
