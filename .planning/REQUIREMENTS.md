# Requirements: v1.2 선거 실행

> Generated: 2026-03-31

## Milestone Goal

5/14 본후보 실수집 → 5/26 NEC URL 확정 → 6/1~2 최종 배포 → 6/3 선거 당일 무중단 운영 실행

---

## Active Requirements

### 데이터 수집 (DATA)

- [ ] **DATA-01**: 운영자가 2026-05-14에 `fetch_nec_candidates.py --log-raw`를 실행하여 NEC 본후보 API로부터 실제 후보자 데이터를 수집한다
- [ ] **DATA-02**: 수집된 본후보 데이터가 기존 예비후보 데이터와 병합·검증되어 `data/candidates/` JSON에 반영된다

### 개표 시스템 (ELEC)

- [ ] **ELEC-01**: 운영자가 2026-05-26 이후 Chrome DevTools로 NEC 개표 API URL을 캡처하여 `workers/election-night/index.js`의 `NEC_URL` 상수에 기입한다
- [ ] **ELEC-02**: `parseNECResponse()` 함수 내 TODO 마커 14곳이 실제 API 응답 구조에 맞게 업데이트된다
- [ ] **ELEC-03**: 업데이트된 Worker가 wrangler 배포 후 통합 테스트를 통과한다

### 운영 실행 (OPS)

- [ ] **OPS-01**: 운영자가 2026-05-27에 GitHub Actions `update-polls.yml` 워크플로우를 수동으로 disable한다 (공표금지 대비 D-08)
- [ ] **OPS-02**: 운영자가 2026-06-01~02에 `workers/DEPLOY-CHECKLIST.md` 27항목을 순서대로 실행하여 선거일 최종 배포를 완료한다
- [ ] **OPS-03**: 운영자가 2026-06-03 선거 당일 개표 실시간 시각화 및 Worker 상태를 모니터링한다
- [ ] **OPS-04**: 2026-06-04 이후 최종 선거 결과 데이터가 정적 파일로 아카이브되어 영구 보존된다

---

## Future Requirements

- 선거 결과 분석 시각화 (득표율 분포 차트, 지역별 색상 강도 등) — 선거 후 별도 마일스톤 검토
- 다음 선거 (2030 또는 재보궐)를 위한 프로젝트 리셋 절차

---

## Out of Scope

- 자동화 테스트 인프라 구축 — 수동 검증으로 충분, 바닐라 JS 스택 유지 원칙
- 신규 UI 기능 추가 — v1.2는 실행 마일스톤, 기능 개발 없음
- 서버사이드 로직 도입 — Cloudflare Pages 정적 호스팅 제약 유지

---

## Traceability

| REQ-ID | Phase | Plan |
|--------|-------|------|
| DATA-01, DATA-02 | Phase 9 | TBD |
| ELEC-01, ELEC-02, ELEC-03 | Phase 10 | TBD |
| OPS-01, OPS-02, OPS-03, OPS-04 | Phase 11 | TBD |
