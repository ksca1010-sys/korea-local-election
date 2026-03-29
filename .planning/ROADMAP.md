# Roadmap: 선거정보지도

## Milestones

- ✅ **v1.0 MVP** — Phases 1-4 (shipped 2026-03-29)
- 🔄 **v1.1 선거일 대비** — Phases 5-8 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-4) — SHIPPED 2026-03-29</summary>

- [x] Phase 1: 긴급 버그·보안 수정 (2/2 plans) — completed 2026-03-29
- [x] Phase 2: 데이터 파이프라인 자동화 (2/2 plans) — completed 2026-03-29
- [x] Phase 3: 성능 최적화 + 기능 추가 (3/3 plans) — completed 2026-03-29
- [x] Phase 4: 선거일 실시간 개표 (2/2 plans) — completed 2026-03-29

Full details: `.planning/milestones/v1.0-ROADMAP.md`

</details>

### v1.1 선거일 대비

- [ ] **Phase 5: 여론조사 보완** — 누락 15건 채우기 + 지속 수집 파이프라인 안정화
- [ ] **Phase 6: 본후보 등록 대응** — 5/14~15 등록에 맞춰 후보 데이터 공식 전환
- [ ] **Phase 7: 개표 시스템 완성** — NEC URL 캡처 + Worker 테스트 + 브라우저 UAT
- [ ] **Phase 8: 선거일 운영 준비** — 배포 체크리스트 + 공표금지 검증 + 폴백 절차 확인

## Phase Details

### Phase 5: 여론조사 보완
**Goal**: 여론조사 데이터 공백 없이 5/28 공표금지 전까지 유지된다
**Depends on**: Nothing (즉시 시작 가능)
**Timeline**: 즉시 ~ 5/27
**Requirements**: POLL-01, POLL-02
**Success Criteria** (what must be TRUE):
  1. 사용자가 여론조사 탭을 열면 이전에 지지율이 비어있던 15건에 수치가 표시된다
  2. 신규 여론조사가 등록되면 파이프라인 재실행만으로 탭에 반영된다
  3. 5/28 00:00 KST 이후 여론조사 탭이 자동으로 빈 상태를 보여준다 (공표금지)
**Plans**: TBD

### Phase 6: 본후보 등록 대응
**Goal**: 5/15 18:00 이후 공식 후보 목록과 기호순 정렬이 정확하게 작동한다
**Depends on**: Phase 5 (여론조사와 독립적이나 CAND 파이프라인이 안정된 상태 필요)
**Timeline**: 준비 5/13 전 완료 → 실행 5/14~15 등록 기간
**Requirements**: CAND-01, CAND-02, CAND-03
**Success Criteria** (what must be TRUE):
  1. 후보 탭에서 예비후보(DECLARED/EXPECTED)가 사라지고 공식 후보(NOMINATED)만 표시된다
  2. 5/15 18:00 이후 후보 탭의 정렬 기준이 기호순으로 전환된다
  3. 등록 취소 또는 무효 처리된 후보가 목록에서 제거되어 표시되지 않는다
  4. 후보 수가 변경된 선거구를 지도에서 클릭하면 최신 후보 수가 반영된다
**Plans**: TBD
**UI hint**: yes

### Phase 7: 개표 시스템 완성
**Goal**: 선거 당일 NEC API에서 개표 데이터를 받아 지도에 실시간 표시할 준비가 완료된다
**Depends on**: Phase 4 (v1.0 Worker 구현체 위에 완성)
**Timeline**: 5/26 이후 NEC URL 캡처 → 5/30 전 완료
**Requirements**: ELEC-01, ELEC-02, ELEC-03
**Success Criteria** (what must be TRUE):
  1. Worker 코드에 실제 NEC 개표 API URL이 기입되어 있고 URL 확정 절차가 문서화된다
  2. Worker 통합 테스트 실행 결과 실제 NEC 응답을 파싱하여 KV에 저장하는 것이 확인된다
  3. 브라우저에서 지도 위에 개표 결과 레이어가 올바르게 렌더링된다
  4. Worker 응답 없을 때 UI가 폴백 메시지를 보여준다
  5. 개표 진행 배너가 선거일 당일 노출된다
**Plans**: TBD
**UI hint**: yes

### Phase 8: 선거일 운영 준비
**Goal**: 6/3 선거 당일 무중단 서비스를 위한 모든 점검이 완료된다
**Depends on**: Phase 7
**Timeline**: 6/1~2
**Requirements**: OPS-01, OPS-02, OPS-03
**Success Criteria** (what must be TRUE):
  1. 배포 체크리스트 문서를 보고 단계별로 최종 배포를 실행할 수 있다
  2. 5/28 00:00 ~ 6/3 18:00 사이에 여론조사 탭이 자동으로 데이터를 숨기는 것이 검증된다
  3. Worker가 응답하지 않을 때 수동으로 JSON 폴백으로 전환하는 절차를 따라 5분 내 복구된다
**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. 긴급 버그·보안 수정 | v1.0 | 2/2 | Complete | 2026-03-29 |
| 2. 데이터 파이프라인 자동화 | v1.0 | 2/2 | Complete | 2026-03-29 |
| 3. 성능 최적화 + 기능 추가 | v1.0 | 3/3 | Complete | 2026-03-29 |
| 4. 선거일 실시간 개표 | v1.0 | 2/2 | Complete | 2026-03-29 |
| 5. 여론조사 보완 | v1.1 | 0/? | Not started | - |
| 6. 본후보 등록 대응 | v1.1 | 0/? | Not started | - |
| 7. 개표 시스템 완성 | v1.1 | 0/? | Not started | - |
| 8. 선거일 운영 준비 | v1.1 | 0/? | Not started | - |
