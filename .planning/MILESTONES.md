# Milestones

## v1.0 MVP (Shipped: 2026-03-29)

**Phases completed:** 4 phases, 9 plans, 8 tasks

**Key accomplishments:**

- One-liner:
- One-liner:
- poll_audit_pdf.py --batch generates audit_report.json from all PDFs; audit_numeric_fields.py gates deployment on unverified float support values via deploy.sh pre-flight check
- One-liner:
- One-liner:
- 1. [Rule 2 - Adaptation] showSkeleton targets tab-specific container
- One-liner:

---

## v1.1 선거일 대비 (Shipped: 2026-03-31)

**Phases completed:** 4 phases (5-8), 10 plans

**Key accomplishments:**

1. 여론조사 PDF 26건 전수 검토 — 18건 지지율 수동 채우기, 8건 추출 불가 사유 문서화 (POLL-01)
2. GitHub Actions poll-sync D-05 업그레이드 (KST 09:00 1일 1회) + showSkeleton DOM 교체 버그 수정 (POLL-02)
3. NEC 본후보 API 파이프라인 구현 — 날짜 게이팅(5/14), dry-run, 3종 병합 함수, Actions 연동 (CAND-01)
4. 후보 탭 NOMINATED 필터 + 기호순 정렬 전환 — render() 단일 지점, UAT 2건 승인 (CAND-02/03)
5. Worker parseNECResponse() regex skeleton + CAPTURE-GUIDE.md 5단계 캡처 절차 (ELEC-01)
6. wrangler dev KV 주입 통합 테스트 통과 + _updateElectionBanner() 구현 + 브라우저 UAT 3건 승인 (ELEC-02/03)
7. 선거일 운영 문서 3종 완비: CAPTURE-GUIDE + FALLBACK-GUIDE + DEPLOY-CHECKLIST 27항목 (OPS-01/02/03)

### Known Gaps

- **POLL-02**: 5/27까지 파이프라인 지속 운영 필요 — 워크플로우 구축됨, 실행 진행 중
- **CAND-01**: 2026-05-14 본후보 실수집 실행 필요 — 파이프라인 완성, 실데이터 투입 대기

Full details: `.planning/milestones/v1.1-ROADMAP.md`

---
