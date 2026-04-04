# polls.json 데이터 품질 트래킹

> 최종 업데이트: 2026-04-04

---

## 이번 세션 처리 완료

| 유형 | 건수 | 처리 |
|------|------|------|
| 직함 suffix (영암군수·안동시장·경북교육감) | 3건 | 제거 |
| 비후보 문자열 (잘모름·모르겠다·기타인) | 37건 | 제거 |
| 정당명 토큰 (진보당·민주당 등) | 376건 92 nttId | 제거 |
| 완전 잘못된 문항 파싱 | 14건 | results=[] |
| nttId=17354 영암군 메타보이스 | 1건 | 전체 교정 (낭주신문 기사) |
| nttId=17280 안동시 알앤써치 | 1건 | 쓰레기 제거 + 이삼걸 7.7% 추가 |

---

## 다음 세션 작업 목록 (우선순위 순)

### P0 — 수치 불명확, 원본 확인 필수

#### 1. nttId=17280 안동시 (알앤써치 / 영남신문 / 2026-02-06~07)
- **문제**: 경북도의 18.6% 항목 — 권광택 직함 추정이지만 미확인
- **현재 results**: 권기창 27.3%, 권광택 23.9%, 권백신 10.7%, 이삼걸 7.7%
- **확인 필요**: 권기창/권광택/권백신 수치 교차검증, 경북도의 18.6% 주인
- **URL**: https://www.nesdc.go.kr/portal/bbs/B0000005/view.do?nttId=17280
- **명령**: 영남신문 원본 기사 또는 NESDC PDF 확인 후 results 교정

#### 2. nttId=17502 세종 광역단체장 (케이에스오아이 / 2026-02-23~24)
- **문제**: 세종시장 52.2% 파싱됨 → results=[] 처리
- **현재**: results 비어있음
- **URL**: https://www.nesdc.go.kr/portal/bbs/B0000005/view.do?nttId=17502
- **명령**: NESDC PDF 확인 후 올바른 후보명·수치 입력

#### 3. nttId=18042/18041/18040 전남 광양/순천/여수 기초단체장 (한길리서치 / 2026-03-31~04-01)
- **문제**: 도지사 후보(김영록·민형배·신정훈) 파싱됨 → results=[] 처리
- **URL**: https://www.nesdc.go.kr/portal/bbs/B0000005/view.do?nttId=18042
- **명령**: NESDC PDF에서 기초단체장 문항 수치 직접 확인

### P1 — 혼재 케이스 (조사 설계 의도인지 파싱 오류인지 미판단)

확인 필요 URL 3건:

| nttId | 선거 | 의심 내용 | URL |
|-------|------|-----------|-----|
| 17958 | 전남 도지사 | 강기정(광주시장 후보) 포함 — 비교 대결? | https://www.nesdc.go.kr/portal/bbs/B0000005/view.do?nttId=17958 |
| 17289 | 전남 여수시 기초단체장 | 도지사 후보(김영록·민형배) 혼재 | https://www.nesdc.go.kr/portal/bbs/B0000005/view.do?nttId=17289 |
| 17201 | 충남 도지사 | 대전 정치인(허태정·박범계 등) 포함 — 충청권 통합? | https://www.nesdc.go.kr/portal/bbs/B0000005/view.do?nttId=17201 |

전체 혼재 목록 (36건) 재생성 명령:
```
python3 -c "
import json, re, sys
# ... (다음 세션에서 재실행)
"
```
→ 다음 세션 시작 시 아래 명령으로 전체 목록 재출력:
```
python3 << 'SCAN'
import json, re, sys
# scripts/nesdc_poll_pipeline.py 로드 후
# _build_known_candidates_index() 실행
# 혼재 케이스 (valid>0, intruder>0) 전체 출력
SCAN
```

### P2 — 후보 데이터 오타

- `최영열이` → `최영열` (영암군 mayor_candidates.json)
  - 파일: `data/candidates/mayor_candidates.json`
  - 경로: `candidates.jeonnam.영암군`

### P3 — 파이프라인 개선 (기존 데이터 소급 적용)

현재 교차검증 로직(`_cross_validate_with_candidates`)은 **새 파싱 시에만** 적용됨.
기존 polls.json의 잘못된 데이터를 배치 교정하는 스크립트 필요:
```bash
python3 scripts/batch_cross_validate_polls.py  # 아직 미작성
```

---

## 재발 방지 완료된 것들

- `_INVALID_NAMES` + `_INVALID_SUFFIXES` + `_is_invalid_candidate_name()` 추가
- `_build_known_candidates_index()` — 후보 목록 인덱스 (271개 선거구, 1639명)
- `_cross_validate_with_candidates()` — 파싱 시 후보명 교차검증 + 정당 자동 보강
- `update-polls.yml` — continue-on-error 제거
- `update-candidates.yml` — validate_pipeline 단계 critical 처리
- `update-byelection.yml` — push retry + assert 추가
- `monitor_failures.py` — 첫 실패 시 자동 재시도 로직 추가
