# Phase 13: 워크플로우 아키텍처 안정화 - Context

**Gathered:** 2026-04-04
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — discuss skipped)

<domain>
## Phase Boundary

각 워크플로우의 단계가 앞 단계 실패에 무관하게 독립적으로 실행되고, 주요 파이프라인에 스키마 검증이 연결되며, 동시 실행 시 git push 경쟁 상태가 발생하지 않는 구조를 완성한다.

**범위:**
- INDEP-01: 14개 워크플로우 YAML에 `continue-on-error: true` 일괄 추가 (update-byelection.yml 포함, update-candidates.yml의 validate step 이미 적용됨)
- INDEP-02: validate_pipeline.py를 여론조사(update-polls.yml)·재보궐(update-byelection.yml) 파이프라인에 연결
- GIT-01: 동시 실행 가능한 워크플로우에 `concurrency` 그룹 추가하여 git push 경쟁 상태 제거

**범위 밖:** Phase 12에서 이미 완료된 permissions 정규화 / Python 방어 코드. 신규 기능 추가 없음.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase.

핵심 참조:
- 12-AUDIT-REPORT.md: 패턴 C (continue-on-error 미적용 13개 워크플로우 목록), 패턴 D (git push 경쟁 상태 위험 워크플로우)
- 기존 update-candidates.yml의 validate step에만 continue-on-error: true가 적용된 패턴 참조
- concurrency 그룹은 워크플로우명 기반으로 설정 (`group: ${{ github.workflow }}`, `cancel-in-progress: false`)
- validate_pipeline.py 호출 방식: 기존 update-candidates.yml의 패턴 그대로 재사용

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `.github/workflows/update-candidates.yml`: continue-on-error + validate_pipeline.py 패턴이 이미 구현됨 — 다른 워크플로우에 동일 패턴 적용
- `scripts/candidate_pipeline/validate_pipeline.py`: 후보자 데이터 스키마 검증 스크립트 — 다른 파이프라인에도 연결 가능한지 확인 필요
- `12-AUDIT-REPORT.md`: 14개 워크플로우 전체 목록 + 각 워크플로우별 continue-on-error 현황

### Established Patterns
- GitHub Actions concurrency: `concurrency: { group: "${{ github.workflow }}", cancel-in-progress: false }` — 이미 실행 중인 작업을 취소하지 않고 대기
- continue-on-error: 각 step에 개별 적용 또는 job 레벨에서 적용 — step 레벨이 더 세밀한 제어 가능
- validate_pipeline.py 호출: `python scripts/candidate_pipeline/validate_pipeline.py` — 실패 시 경고 로그만 출력, 파이프라인 중단 안 함 (continue-on-error: true와 함께)

### Integration Points
- 14개 워크플로우 YAML 파일: `.github/workflows/*.yml`
- validate_pipeline.py가 후보자 외 데이터에도 적용 가능한지 스크립트 확인 필요
- monitor-failures.yml: workflow_run 트리거로 다른 워크플로우 완료 후 자동 실행 — concurrency 그룹 설정 시 영향 없음

</code_context>

<specifics>
## Specific Ideas

- update-byelection.yml은 detect → fetch → factcheck 순서로 3단계가 있음 — 각 step에 continue-on-error: true 적용
- concurrency 그룹은 cron 중복 실행 방지가 주목적 — cancel-in-progress: false로 현재 실행 보호
- validate_pipeline.py가 후보자 특화인 경우 여론조사/재보궐 전용 검증 로직 추가 또는 별도 스크립트 연결 고려

</specifics>

<deferred>
## Deferred Ideas

- continue-on-error 일괄 적용 후 모니터링 — Phase 14에서 처리
- 실패 알림 시스템 고도화 — Phase 14 MON-01/MON-02
- Python 스크립트 추가 방어 코드 (Phase 12에서 미처리된 나머지 파일들) — Phase 14 이관

</deferred>
