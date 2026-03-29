# Closed Bugs

> Phase 1에서 수정 완료된 버그

## Closed

### BUG-01: data.js 교육감 LLM support 값 (Phase 1)

- **Fixed:** 2026-03-29
- **Commit:** Phase 01-01
- **Resolution:** 17개 지역 교육감 candidates에서 support 필드 전량 삭제

### BUG-02: overview-tab/poll-tab undefined% 표시 (Phase 1)

- **Fixed:** 2026-03-29
- **Commit:** Phase 01-01
- **Resolution:** r.support != null 분기 + early return 패턴 적용

### BUG-03: data.js stale 주석 (Phase 1)

- **Fixed:** 2026-03-29
- **Commit:** Phase 01-01
- **Resolution:** 주석 수정

### BUG-04: 유령 파일 4개 (Phase 1)

- **Fixed:** 2026-03-29
- **Commit:** Phase 01-01
- **Resolution:** git rm으로 삭제

### BUG-05: CSS/JS 버전 타임스탬프 불일치 (Phase 1)

- **Fixed:** 2026-03-29
- **Commit:** Phase 01-02
- **Resolution:** v=1774711234로 통일
