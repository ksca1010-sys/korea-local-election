# Phase 14: 모니터링 시스템 완성 - Context

**Gathered:** 2026-04-04
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure+code phase — discuss skipped, user sleeping)

<domain>
## Phase Boundary

15개 전체 워크플로우의 실패가 monitor_failures.py에 의해 감지·기록되고, 연속 실패 시 GitHub Issue가 자동 생성되며, 복구 시 자동으로 닫히는 완전한 실패 감지·복구 루프를 구축한다.

**현재 상태 (Phase 12 감사 리포트 기준):**
- monitor_failures.py가 일부 워크플로우만 감시 중 (14개 미만)
- GitHub Issue 자동 생성/닫기 기능의 완성도 확인 필요
- monitor-failures.yml이 workflow_run 트리거로 주요 파이프라인 완료 후 실행 중

**범위:**
- MON-01: monitor_failures.py의 감시 대상을 14개 전체 워크플로우로 확장 (monitor-failures.yml 자체 제외)
- MON-02: 연속 실패 시 GitHub Issue 자동 생성 + 복구 시 자동 닫기 완성
- monitor-failures.yml의 workflow_run 트리거를 모든 주요 파이프라인을 포함하도록 확장

**범위 밖:** Phase 13에서 완료된 concurrency/continue-on-error. 신규 파이프라인 추가 없음.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion.

- GitHub Issue 생성: `gh issue create` CLI 사용 (GH_TOKEN 권한 이미 issues: write로 확보)
- 연속 실패 임계값: 기존 코드의 패턴을 따름 (없으면 N=2 기본값)
- 실패 기록 저장: 기존 data/failures/ 또는 동급 경로 사용
- workflow_run 트리거 확장: 모든 update-*.yml 워크플로우 포함

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/monitor_failures.py` — 기존 실패 감지 스크립트 (현재 일부 워크플로우만)
- `.github/workflows/monitor-failures.yml` — workflow_run 트리거 + monitor_failures.py 실행
- `issues: write` permission이 monitor-failures.yml에 이미 있음 (Phase 12 확인)

### Integration Points
- monitor-failures.yml의 `on.workflow_run.workflows` 리스트가 핵심 확장 포인트
- monitor_failures.py의 WATCHED_WORKFLOWS 또는 동급 상수가 감시 대상 목록

</code_context>

<specifics>
## Specific Ideas

- monitor-failures.yml에 workflow_run 트리거 추가 시 Phase 13에서 추가된 모든 워크플로우 포함
- GitHub Issue 제목 형식: `[자동] {워크플로우명} 연속 실패 {N}회`
- Issue 본문: 실패 횟수, 마지막 실패 시각, GitHub Actions 로그 링크

</specifics>

<deferred>
## Deferred Ideas

- Slack/Discord 알림 연동 — 선거 정보 서비스에 불필요
- 대시보드 UI — Phase 14 범위 밖

</deferred>
