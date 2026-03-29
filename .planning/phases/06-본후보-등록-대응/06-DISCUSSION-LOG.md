# Phase 6: 본후보 등록 대응 - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-30
**Phase:** 06-본후보-등록-대응
**Areas discussed:** 데이터 수집 방식, 비공식 후보 처리, 기호 미배정 시 정렬, 적용 범위, 선거구 미확정/변경

---

## 데이터 수집 방식

| Option | Description | Selected |
|--------|-------------|----------|
| GitHub Actions cron 완전 자동화 | NEC API 열리면 Actions가 자동 실행 → JSON 업데이트 → 배포 | ✓ |
| 개발자 수동 트리거 | 스크립트는 자동이지만 개발자가 수동으로 실행 | |

**User's choice:** GitHub Actions cron 완전 자동화

| Option | Description | Selected |
|--------|-------------|----------|
| 1회/일 | poll-sync와 동일한 패턴 | ✓ |
| 2회/일 (등록 기간 중 한정) | 5/14~15 기간만 더 자주 수집 | |

**User's choice:** 1회/일

| Option | Description | Selected |
|--------|-------------|----------|
| 별도 update-candidates.yml | POLL과 CAND 분리 | ✓ |
| update-polls.yml 통합 | 실행 비용 절감, 단 디버깅 어려움 | |

**User's choice:** 별도 update-candidates.yml

---

## 비공식 후보 처리

| Option | Description | Selected |
|--------|-------------|----------|
| 완전히 숨김 | NOMINATED만 표시. 성공 기준 1번과 일치 | ✓ |
| 흐리게 표시 (streak-through) | 회색+취소선 처리 | |

**User's choice:** 완전히 숨김

| Option | Description | Selected |
|--------|-------------|----------|
| getCandidateSortMode() 활용 | 기존 구현 함수 재사용. 5/15 18:00 KST 자동 전환 | ✓ |
| 별도 isOfficialCandidacyPeriod() 신규 생성 | 명시적이지만 수정 포인트 늘어남 | |

**User's choice:** getCandidateSortMode() 활용

---

## 기호 미배정 시 정렬

| Option | Description | Selected |
|--------|-------------|----------|
| 999 폴백 유지 → 기호 확정 시 업데이트 | 현재 candidate-tab.js 로직 그대로. NEC API 수집 시 ballotNumber 포함 | ✓ |
| 가나다 순서 폴백 | 기호 없으면 이름 가나다순 정렬. 별도 정렬 로직 필요 | |

**User's choice:** 999 폴백 유지

---

## 적용 범위

**Notes:** 처음에 "어느 선거 유형까지?" 질문에 사용자가 "다 해야지"로 답변. 광역의원/기초의원은 후보 탭 미표시이므로 제외하고 후보 탭 대상인 광역단체장+교육감+기초단체장 전체로 확정.

**User's choice:** 광역단체장 + 교육감 + 기초단체장(251개) 전체

---

## 선거구 미확정/변경

**Notes:** 사용자가 "선거구가 확정되지 않은 곳이 더러 있어 이거 어떻게 해야하지 않겠어? 차후에 선거구가 변경되는 곳이 생길거야"라며 새 gray area를 제기. 페이즈 6 범위 내 반드시 처리 필요.

| Option | Description | Selected |
|--------|-------------|----------|
| 미확정 선거구 표시 + 확정 시 자동 리맵 | NEC API 미매칭 시 표시, 확정 시 cron 재실행으로 자동 반영 | ✓ |
| 선거구 매핑 수동 관리 | district_mapping.json 개발자 직접 수정 | |

**User's choice:** 미확정 선거구 표시 + 확정 시 자동 리맵

| Option | Description | Selected |
|--------|-------------|----------|
| unmatched_candidates.json 별도 파일로 보관 | 미매핑 후보 누락 방지, 확정 시 본 파일로 이동 | ✓ |
| district: null로 본 파일에 직접 저장 | 파일 하나지만 디버깅 어려움 | |

**User's choice:** unmatched_candidates.json 별도 파일

| Option | Description | Selected |
|--------|-------------|----------|
| '선거구 확정 중' 안내 문구 표시 | 미확정 지역 클릭 시 안내 메시지 | ✓ |
| 후보 카드 숨김 | 지도에서만 표시 | |

**User's choice:** '선거구 확정 중' 안내 문구 표시

---

## Claude's Discretion

- NEC API 엔드포인트 URL 및 파라미터
- update-candidates.yml 내부 단계 설계
- 각 선거 유형별 JSON 구조 변경 범위
