# Roadmap: 선거정보지도

## Milestones

- ✅ **v1.0 MVP** — Phases 1-4 (shipped 2026-03-29)
- ✅ **v1.1 선거일 대비** — Phases 5-8 (shipped 2026-03-31)
- 📋 **v1.2 선거 실행** — Phases 9-11 (planned, 날짜 잠금)
- 📋 **v1.3 자동화 파이프라인 반복 안정화** — Phases 12-14 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-4) — SHIPPED 2026-03-29</summary>

- [x] Phase 1: 긴급 버그·보안 수정 (2/2 plans) — completed 2026-03-29
- [x] Phase 2: 데이터 파이프라인 자동화 (2/2 plans) — completed 2026-03-29
- [x] Phase 3: 성능 최적화 + 기능 추가 (3/3 plans) — completed 2026-03-29
- [x] Phase 4: 선거일 실시간 개표 (2/2 plans) — completed 2026-03-29

Full details: `.planning/milestones/v1.0-ROADMAP.md`

</details>

<details>
<summary>✅ v1.1 선거일 대비 (Phases 5-8) — SHIPPED 2026-03-31</summary>

- [x] Phase 5: 여론조사 보완 (2/2 plans) — completed 2026-03-29
- [x] Phase 6: 본후보 등록 대응 (2/2 plans) — completed 2026-03-30
- [x] Phase 7: 개표 시스템 완성 (3/3 plans) — completed 2026-03-30
- [x] Phase 8: 선거일 운영 준비 (3/3 plans) — completed 2026-03-30

Full details: `.planning/milestones/v1.1-ROADMAP.md`

</details>

### 📋 v1.2 선거 실행 (Phases 9-11)

- [ ] **Phase 9: 본후보 실수집** — 2026-05-14 실행
- [ ] **Phase 10: NEC 개표 API 확정** — 2026-05-26 이후 실행
- [ ] **Phase 11: 선거일 최종 실행** — 2026-05-27~06/04+ 실행

### 📋 v1.3 자동화 파이프라인 반복 안정화 (Phases 12-14)

- [x] **Phase 12: 전수 진단 + 긴급 방어 수정** — 잔존 실패 패턴 파악 및 즉시 적용 가능한 수정 (1/3 plans complete) (completed 2026-04-03)
- [ ] **Phase 13: 워크플로우 아키텍처 안정화** — 단계 독립성 + git 경쟁 상태 제거
- [ ] **Phase 14: 모니터링 시스템 완성** — 15개 전체 커버리지 + GitHub Issue 자동화

## Phase Details

### Phase 9: 본후보 실수집
**Goal**: 본후보 등록 마감(5/14) 직후 NEC API로부터 실제 후보자 데이터를 수집하고 서비스에 반영한다
**Depends on**: Phase 8 (파이프라인 완성, 날짜 게이팅 구현)
**Requirements**: DATA-01, DATA-02
**Success Criteria** (what must be TRUE):
  1. `fetch_nec_candidates.py --log-raw` 실행이 에러 없이 완료되고 raw 로그 파일이 생성된다
  2. 수집된 본후보 데이터가 기존 예비후보 데이터와 병합되어 `data/candidates/` JSON이 업데이트된다
  3. 후보자 탭에서 본후보 기호순 정렬이 올바르게 표시된다 (NOMINATED → 기호 정렬 전환)
  4. 병합 검증 리포트에 불일치 항목이 없거나, 불일치 항목이 수동 검토·해결된다
**Plans**: 2 plans
Plans:
- [ ] 09-01-PLAN.md -- NEC 본후보 API 수집 실행 (환경 준비, dry-run, 본 실행, 결과 확인, 커밋)
- [ ] 09-02-PLAN.md -- 수집 결과 검증 및 서비스 반영 (불일치 처리 SOP, 프론트엔드 확인, 배포)

### Phase 10: NEC 개표 API 확정
**Goal**: 선거일 직전 실제 NEC 개표 API URL을 캡처하고 Worker parseNECResponse()를 실 응답 구조에 맞게 완성하여 통합 테스트를 통과한다
**Depends on**: Phase 7 (parseNECResponse() skeleton, TODO(5/26) 마커 14개)
**Requirements**: ELEC-01, ELEC-02, ELEC-03
**Success Criteria** (what must be TRUE):
  1. `workers/election-night/index.js`의 `NEC_URL` 상수에 실제 API URL이 기입된다
  2. `parseNECResponse()` 내 TODO 마커 14곳이 실제 API 응답 구조 기반으로 업데이트된다
  3. wrangler 배포 후 KV fixture 직접 주입 통합 테스트가 통과한다
  4. `_updateElectionBanner()` 브라우저 UAT — 실제 API 응답 형식으로 개표 현황 배너가 정상 렌더링된다
**Plans**: TBD

### Phase 11: 선거일 최종 실행
**Goal**: 공표금지 대비 여론조사 파이프라인을 중단하고, DEPLOY-CHECKLIST.md 27항목을 완료하여 선거 당일 무중단 운영을 달성하고, 최종 결과를 아카이브한다
**Depends on**: Phase 9, Phase 10 (본후보 데이터 반영, Worker 통합 테스트 통과)
**Requirements**: OPS-01, OPS-02, OPS-03, OPS-04
**Success Criteria** (what must be TRUE):
  1. 2026-05-27에 GitHub Actions `update-polls.yml` 워크플로우가 수동 disable되어 공표금지 기간(5/28~6/3) 동안 자동 실행이 없다
  2. `workers/DEPLOY-CHECKLIST.md` 27항목이 순서대로 완료되어 최종 배포가 성공한다
  3. 2026-06-03 선거 당일 Worker 모니터링 대시보드에서 에러율 0%, 실시간 개표 시각화가 정상 업데이트된다
  4. 2026-06-04 이후 최종 선거 결과 JSON이 `data/` 디렉토리에 커밋되어 영구 보존된다
**Plans**: TBD

### Phase 12: 전수 진단 + 긴급 방어 수정
**Goal**: 15개 워크플로우 전체를 체계적으로 감사하고, 즉시 적용 가능한 방어 코드(KeyError 방어, 빈 필드 차단, permissions 정규화)를 전 파이프라인에 일괄 적용하여 잔존 크래시 원인을 제거한다
**Depends on**: Nothing (v1.3 시작 — 4/3 수정 사항 위에서 진행)
**Requirements**: DIAG-01, CRASH-01, CRASH-02, PERM-01
**Success Criteria** (what must be TRUE):
  1. 15개 워크플로우 전체에 대한 감사 리포트가 존재하며, 미처리 실패 패턴이 항목별로 목록화된다
  2. 모든 Python 파이프라인 스크립트가 API 응답 필드 누락 시 KeyError 대신 경고 로그를 출력하고 해당 레코드를 스킵한다
  3. `data/` JSON 파일에 빈 name 또는 필수 필드 누락 레코드가 저장되지 않으며, 파이프라인 실행 후 검증으로 확인된다
  4. 모든 워크플로우의 `permissions` 블록이 최소 권한(contents: write, actions: write 등 필요한 것만)으로 명시적으로 선언되어 HTTP 403 오류가 발생하지 않는다
**Plans**: 3 plans
Plans:
- [x] 12-01-PLAN.md — 전수 감사 리포트 생성 + fetch-disclosures 2.yml 정리
- [x] 12-02-PLAN.md — Python 파이프라인 방어 코드 적용 (KeyError + 빈 name)
- [x] 12-03-PLAN.md — permissions 정규화 + 최종 검증

### Phase 13: 워크플로우 아키텍처 안정화
**Goal**: 각 워크플로우의 단계가 앞 단계 실패에 무관하게 독립적으로 실행되고, 주요 파이프라인에 스키마 검증이 연결되며, 동시 실행 시 git push 경쟁 상태가 발생하지 않는 구조를 완성한다
**Depends on**: Phase 12 (감사 리포트 — 잔존 문제 목록 확보)
**Requirements**: INDEP-01, INDEP-02, GIT-01
**Success Criteria** (what must be TRUE):
  1. byelection 포함 모든 워크플로우의 각 단계에 `continue-on-error: true`가 적용되어, 앞 단계 실패 시에도 커밋·푸시 단계까지 도달한다
  2. validate_pipeline.py(또는 동급 검증 스크립트)가 후보 파이프라인 외 여론조사·재보궐 등 주요 파이프라인 워크플로우에 연결되어 실행된다
  3. 두 개 이상의 워크플로우가 동시 트리거될 때 git push 충돌(non-fast-forward 오류)이 발생하지 않는다 — 재시도 로직 또는 concurrency 그룹으로 해결된다
**Plans**: TBD

### Phase 14: 모니터링 시스템 완성
**Goal**: 15개 전체 워크플로우의 실패가 monitor_failures.py에 의해 감지·기록되고, 연속 실패 시 GitHub Issue가 자동 생성되며, 복구 시 자동으로 닫히는 완전한 실패 감지·복구 루프를 구축한다
**Depends on**: Phase 12 (permissions 정규화 — Issue 생성 권한 확보), Phase 13 (워크플로우 안정화 — 노이즈 감소)
**Requirements**: MON-01, MON-02
**Success Criteria** (what must be TRUE):
  1. monitor_failures.py가 15개 전체 워크플로우를 감시 대상으로 포함하며, 각 워크플로우의 최근 실행 결과를 수집·기록한다
  2. 감시 대상 워크플로우 중 하나가 연속 N회 실패할 때 GitHub Issue가 자동 생성되고, 제목과 본문에 실패 워크플로우명·실패 횟수·로그 링크가 포함된다
  3. Issue가 열린 워크플로우가 이후 성공적으로 완료되면 해당 Issue가 자동으로 닫힌다
  4. 모니터링 워크플로우(monitor-failures.yml)가 모든 주요 파이프라인 워크플로우 완료 후 또는 스케줄로 자동 실행된다
**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. 긴급 버그·보안 수정 | v1.0 | 2/2 | Complete | 2026-03-29 |
| 2. 데이터 파이프라인 자동화 | v1.0 | 2/2 | Complete | 2026-03-29 |
| 3. 성능 최적화 + 기능 추가 | v1.0 | 3/3 | Complete | 2026-03-29 |
| 4. 선거일 실시간 개표 | v1.0 | 2/2 | Complete | 2026-03-29 |
| 5. 여론조사 보완 | v1.1 | 2/2 | Complete | 2026-03-29 |
| 6. 본후보 등록 대응 | v1.1 | 2/2 | Complete | 2026-03-30 |
| 7. 개표 시스템 완성 | v1.1 | 3/3 | Complete | 2026-03-30 |
| 8. 선거일 운영 준비 | v1.1 | 3/3 | Complete | 2026-03-30 |
| 9. 본후보 실수집 | v1.2 | 0/2 | Planned | - |
| 10. NEC 개표 API 확정 | v1.2 | 0/? | Not started | - |
| 11. 선거일 최종 실행 | v1.2 | 0/? | Not started | - |
| 12. 전수 진단 + 긴급 방어 수정 | v1.3 | 3/3 | Complete    | 2026-04-03 |
| 13. 워크플로우 아키텍처 안정화 | v1.3 | 0/? | Not started | - |
| 14. 모니터링 시스템 완성 | v1.3 | 0/? | Not started | - |
