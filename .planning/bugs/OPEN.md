# Open Bugs

> 이 파일은 현재 알려진 버그와 데이터 품질 이슈를 추적한다.
> 수정 완료 시 CLOSED.md로 이동한다.

## Format

| ID | Severity | Component | Description | Found | Phase |
|----|----------|-----------|-------------|-------|-------|

## Active Bugs

### BUG-P2-001: 여론조사 PDF 미처리분 잔여

- **Severity:** medium
- **Component:** data/polls/pdfs/
- **Description:** `data/polls/pdfs/` 내 일부 PDF가 `polls.json`의 어떤 nttId와도 매칭되지 않아 감사 대상에서 누락될 수 있음. `audit_report.json`의 `no_pdf` 카운트 확인 필요.
- **Found:** 2026-03-29
- **Phase:** 02

### BUG-P2-002: pollSource 필드 미도입

- **Severity:** low
- **Component:** data/polls/polls.json, data/candidates/*.json
- **Description:** `pollSource` 필드가 데이터 스키마에 아직 정의되지 않았다. 현재 `sourceUrl`과 `nttId`로 출처를 간접 추적하지만, candidates JSON에는 여론조사 출처 연결 필드가 없다. Phase 3 이후 스키마 개선 대상.
- **Found:** 2026-03-29
- **Phase:** 02

### BUG-P2-003: audit_report.json 일부 PDF 파싱 실패 가능성

- **Severity:** low
- **Component:** scripts/poll_audit_pdf.py
- **Description:** pdfplumber의 테이블 추출이 일부 NESDC PDF 레이아웃에서 실패할 수 있다. extract_support_from_pdf()가 None을 반환하는 PDF 비율을 모니터링해야 한다.
- **Found:** 2026-03-29
- **Phase:** 02

### BUG-P1-WATCH-001: LLM 생성 수치 재발 모니터링

- **Severity:** high
- **Component:** js/data.js
- **Description:** Phase 1에서 교육감 support 필드를 제거했으나, 자동 수집 파이프라인이 LLM 생성 수치를 다시 삽입할 수 있다. `audit_numeric_fields.py`가 이를 감지해야 한다 (DATA-02 연동).
- **Found:** 2026-03-29 (Phase 1 후속 모니터링)
- **Phase:** 01 -> 02

## Process

1. 버그 발견 시 이 파일에 `BUG-PX-NNN` 형식으로 추가
2. Severity: critical (배포 차단) > high (다음 배포 전 수정) > medium (해당 페이즈 내) > low (백로그)
3. 수정 완료 시 해당 항목을 CLOSED.md로 이동하고 수정 커밋 해시를 기재
4. Phase 시작 시 OPEN.md를 검토하여 해당 페이즈 작업에 반영
