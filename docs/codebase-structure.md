# 알선거 (korea-local-election) 코드베이스 구조

> 2026 제9회 전국동시지방선거 인터랙티브 선거 정보 지도
> 배포: https://korea-local-eletion.pages.dev
> 스택: 바닐라 HTML + CSS + JavaScript (프레임워크 없음)
> 최종 갱신: 2026-03-23

---

## 1. 전체 디렉토리 트리

```
korea-local-election/
├── index.html                  # SPA 진입점 (456행)
├── css/
│   └── style.css               # 전체 스타일 (4,776행)
├── js/                         # 프론트엔드 JavaScript
│   ├── data-loader.js          # JSON 데이터 로더 (DataLoader 모듈)
│   ├── data.js                 # 정당·지역·후보자 정적 데이터 (ElectionData 모듈)
│   ├── app.js                  # 메인 앱 컨트롤러 (App 모듈, 5,926행)
│   ├── map.js                  # D3.js 지도 렌더링 (MapModule, 3,872행)
│   ├── charts.js               # Chart.js 시각화 (ChartsModule)
│   ├── election-calendar.js    # 선거 일정·법적 판정 (ElectionCalendar)
│   ├── nec.js                  # 선관위 데이터 연동 (NECData)
│   ├── issue_engine.js         # 지역 핵심이슈 발굴 엔진 (IssueEngine)
│   ├── derived_issues.js       # 파생 이슈 정적 데이터 (DerivedIssuesData)
│   ├── news_filters.js         # 뉴스탭 필터 설정 (NewsFilterConfig)
│   └── tabs/                   # 탭별 렌더러 (app.js에서 분리)
│       ├── council-tab.js      # 광역·기초의원 지역구 탭 (CouncilTab)
│       ├── history-tab.js      # 역대선거 비교 탭 (HistoryTab)
│       └── proportional-tab.js # 비례대표 탭 (ProportionalTab)
├── data/                       # 모든 데이터 (JSON, GeoJSON, TopoJSON)
│   ├── static/                 # DataLoader가 fetch하는 정적 JSON (~11개 파일)
│   ├── candidates/             # 후보자 데이터 (선거 유형별 하위 폴더)
│   ├── polls/                  # 여론조사 데이터 + PDF 원본 (840개)
│   ├── council/                # 광역의원 선거구 경계 (GeoJSON/TopoJSON)
│   ├── basic_council/          # 기초의원 선거구 경계 (시도별 하위 폴더)
│   ├── news_observations/      # 뉴스 관측 데이터 (queue/archive/starter)
│   ├── poll_observations/      # 여론조사 관측 데이터 (queue/archive/starter)
│   ├── *.geojson               # 시군구 개별 경계 (~36개)
│   ├── *_topo.json             # 광역·기초 TopoJSON 경계
│   └── *.json                  # 역사·개요·언론사 등 기타 데이터
├── worker/                     # Cloudflare Worker (뉴스 API 프록시)
│   ├── index.js                # 네이버 뉴스 API 프록시 + 캐싱
│   └── wrangler.toml           # Worker 설정
├── src/                        # TypeScript 참조 코드 (미래 마이그레이션 후보)
│   ├── types/RegionData.ts     # 지역 데이터 타입 정의
│   ├── services/regionRepository.ts  # 지역 API 리포지토리
│   └── utils/regionClick.ts    # 지역 클릭 처리 로직
├── scripts/                    # 데이터 파이프라인 (Python + Node.js)
│   ├── candidate_pipeline/     # 후보자 수집·팩트체크 파이프라인
│   ├── council_pipeline/       # 의회 선거구 파싱 파이프라인
│   ├── basic_council_pipeline/ # 기초의원 선거구 파싱 파이프라인
│   └── *.py / *.js / *.sh      # 개별 스크립트 (~50개)
├── *_byulpyo/                  # 시도별 별표 데이터 (xhtml + css, 15개 시도)
├── prd/                        # 기획 문서 (계획서, 설계서)
├── docs/                       # 개발 문서
├── reports/                    # 검증 보고서 (자동 생성)
├── .github/workflows/          # GitHub Actions 자동화 (11개 워크플로우)
├── deploy.sh                   # Cloudflare Pages 배포 스크립트
├── package.json                # npm 스크립트 정의
└── CLAUDE.md                   # Claude Code 프로젝트 규칙
```

---

## 2. index.html 주요 섹션 구조

| 섹션 | 요소 ID / 클래스 | 설명 |
|------|------------------|------|
| 로딩 화면 | `#loading-screen` | 초기 데이터 로드 중 표시 |
| 헤더 | `#main-header` | 로고, 검색, 테마 토글, D-day 카운터 |
| 선거 배너 | `#election-banner` | 시기별 자동 표시 (캘린더 연동) |
| 모바일 필터 | `#mobile-filter-sheet` | 선거 종류 바텀시트 |
| **좌측 사이드바** | `#left-sidebar` | 선거 종류 필터 (8종), 전국 개황, 정당지지율 |
| **중앙 지도** | `#map-section` | 브레드크럼 + SVG 지도 + 범례 + 줌 컨트롤 |
| **우측 패널** | `#detail-panel` | 5개 탭 (개요/여론조사/후보자/뉴스/역대선거) |
| 푸터 바 | `#main-footer` | 고정 바 + 슬라이드업 상세 푸터 |

### 선거 종류 필터 (8종)

| 필터 | data-type | 선거구 수 |
|------|-----------|-----------|
| 광역단체장 | `governor` | 17 |
| 교육감 | `superintendent` | 17 |
| 기초단체장 | `mayor` | 226 |
| 광역의원 | `council` | 779 |
| 기초의원 | `localCouncil` | 2,601 |
| 광역의원 비례대표 | `councilProportional` | 93 |
| 기초의원 비례대표 | `localCouncilProportional` | 386 |
| 재보궐 | `byElection` | 6 |

### 우측 패널 탭 (5개)

| 탭 | data-tab | 설명 |
|----|----------|------|
| 개요 | `overview` | 선거 쟁점, 현직자, 이전 선거 결과, 교육감 지표 |
| 여론조사 | `polls` | 최신 바차트, 추이 차트, 카드 목록, 투명성 안내 |
| 후보자 | `candidates` | 후보자 목록, 공약 비교 |
| 뉴스 | `news` | 뉴스 피드 (복합 점수 정렬) |
| 역대선거 | `history` | 정권 변화 흐름, 득표율 변화 차트, 역대 결과 |

### 스크립트 로드 순서

```
1. data-loader.js → data.js           (데이터 계층)
2. news_filters.js → derived_issues.js → issue_engine.js → nec.js → map.js → charts.js  (독립 모듈)
3. election-calendar.js                (선거 캘린더)
4. tabs/history-tab.js → tabs/council-tab.js → tabs/proportional-tab.js  (탭 모듈)
5. app.js                             (메인 앱 - 최후 로드)
```

---

## 3. js/ 파일별 역할

| 파일 | 모듈명 | 행수 | 역할 |
|------|--------|------|------|
| `data-loader.js` | `DataLoader` | 122 | `data/static/` 폴더의 JSON 파일을 fetch + 캐싱. 앱 시작 시 `loadAll()` 호출 |
| `data.js` | `ElectionData` | 2,894 | 정당 정보, 역대 정당명, 선거일, 광역·기초 지역 목록, 후보자 정보 등 하드코딩 데이터 |
| `app.js` | `App` | 5,926 | **메인 컨트롤러.** 초기화, 탭 전환, 지역 선택, 뉴스 로딩, 검색, 테마 등 전체 이벤트·렌더링 |
| `map.js` | `MapModule` | 3,872 | D3.js 기반 한국 지도. 광역→기초→행정동 드릴다운, 정당색 모드, 선거구 경계 표시 |
| `charts.js` | `ChartsModule` | 373 | Chart.js 래퍼. 여론조사 바차트, 추이 차트, 스크린리더 접근성 테이블 생성 |
| `election-calendar.js` | `ElectionCalendar` | 237 | **법적 필수 로직.** KST 시간 기준, 여론조사 공표금지 판정, 선거 단계 판정, 배너 설정 |
| `nec.js` | `NECData` | 247 | 중앙선관위/공공데이터포털 교육감 후보 API 연동 |
| `issue_engine.js` | `IssueEngine` | 709 | 뉴스 제목 N-gram 분석 + YAKE 통계 기반 지역 핵심이슈 자동 발굴 |
| `derived_issues.js` | `DerivedIssuesData` | 1,303 | 사전 계산된 지역별 파생 이슈 정적 데이터 (17개 시도) |
| `news_filters.js` | `NewsFilterConfig` | 365 | 뉴스탭 알고리즘 설정: 언론사 Tier, 점수 가중치, 제외 키워드 |

### js/tabs/ 탭 모듈

| 파일 | 모듈명 | 행수 | 역할 |
|------|--------|------|------|
| `council-tab.js` | `CouncilTab` | 722 | 광역·기초의원 지역구 선거구 선택 UI + 5탭 렌더링 위임 |
| `history-tab.js` | `HistoryTab` | 635 | 역대선거 비교: 정권 변화 흐름, 득표율 차트, 역대 결과 표 |
| `proportional-tab.js` | `ProportionalTab` | 472 | 비례대표(광역/기초) 정당별 명부, 지지율 활용, 역사 데이터 |

---

## 4. css/style.css 주요 섹션

총 4,776행. 주석 기반 섹션 구분:

| 행 범위 | 섹션 | 설명 |
|---------|------|------|
| 1~245 | CSS Variables | Civic Beacon 디자인 시스템, 다크/라이트 모드 변수 |
| 246~286 | Reset / Scrollbar | 기본 리셋, 커스텀 스크롤바 |
| 287~680 | Header | 헤더, D-day, 검색박스, 테마 토글 |
| 683~1160 | Left Sidebar | 선거 필터, 통계 카드, 정당 바, 핫스팟 |
| 1162~1545 | Map | 지도 SVG, 줌 컨트롤, 툴팁, 범례, 브레드크럼 |
| 1546~2120 | Right Panel | 패널 헤더, 탭 네비게이션, 패널 카드, 후보자 목록, 이슈 |
| 2122~2385 | Poll Tab | 여론조사 카드, 바차트, 추이 차트, 투명성 안내 |
| 2387~2735 | News Tab | 뉴스 피드, 점수 바, 정렬 토글, 지역 언론 섹션, 스켈레톤 |
| 2755~2880 | History Tab | 역대선거, 비교 테이블 |
| 2881~3090 | Footer | 슬라이드업 푸터, 브랜드, 링크 그리드 |
| 3088~3460 | Responsive | 미디어 쿼리, 모바일 필터 바텀시트 |
| 3460~4776 | 컴포넌트 | 교육감, 기초단체장, 재보궐, 의원 탭, 접근성, 리사이즈 등 |

---

## 5. data/ 폴더 구조

### 5.1 data/static/ -- DataLoader가 fetch하는 정적 데이터

| 파일 | 설명 |
|------|------|
| `parties.json` | 정당 정보 (이름, 색상, 약칭) |
| `regions.json` | 17개 광역 지역 목록 |
| `sub_regions.json` | 226개 기초자치단체 목록 |
| `historical_elections.json` | 민선 1~8기 역대 선거 결과 |
| `superintendent_history.json` | 교육감 역대 선거 결과 |
| `superintendents.json` | 현직 교육감 정보 |
| `election_type_info.json` | 선거 유형별 설명 |
| `national_summary.json` | 전국 통계 개황 |
| `historical_party_names.json` | 역대 정당명 매핑 |
| `gallup_national_poll.json` | 한국갤럽 전국 정당지지율 |
| `election_meta.json` | 선거 메타 정보 |
| `election_terms.json` | 선거 회차 정보 |

### 5.2 data/candidates/ -- 후보자 데이터

```
candidates/
├── governor.json                # 광역단체장 후보
├── governor_status.json         # 광역단체장 출마 상태
├── mayor_candidates.json        # 기초단체장 후보
├── mayor_status.json            # 기초단체장 출마 상태
├── superintendent.json          # 교육감 후보
├── superintendent_status.json   # 교육감 출마 상태
├── byelection.json              # 재보궐 후보
├── proportional.json            # 비례대표 후보
├── council/                     # 광역의원 후보 (시도별 17개 JSON)
│   ├── seoul.json
│   ├── busan.json
│   └── ...
├── local_council/               # 기초의원 후보 (시도별 JSON)
│   ├── seoul.json
│   └── ...
└── status_updates.json          # 상태 변경 이력
```

### 5.3 data/polls/ -- 여론조사

| 파일/폴더 | 설명 |
|-----------|------|
| `polls.json` | 전체 여론조사 데이터 (NESDC 기반) |
| `state.json` | 파이프라인 상태 추적 |
| `pdf_classification.json` | PDF 분류 결과 |
| `pdfs/` | NESDC 원본 PDF 파일 (840개) |

### 5.4 지리 데이터

| 종류 | 위치 | 설명 |
|------|------|------|
| 광역 경계 | `data/skorea-provinces-2018-topo.json` | 17개 시도 경계 (TopoJSON) |
| 기초 경계 | `data/skorea-municipalities-2018-topo.json` | 226개 시군구 경계 |
| 시군구 개별 | `data/N_구이름.geojson` | 서울 25개 자치구 등 개별 GeoJSON |
| 광역의원 선거구 | `data/council/council_districts_*.geojson` | 시도별 광역의원 선거구 경계 |
| 기초의원 선거구 | `data/basic_council/시도/basic_*.geojson` | 시군구별 기초의원 선거구 경계 |
| 행정동 경계 | `data/서울_행정동_경계_2017_topo.json` | 서울 행정동 드릴다운용 |

### 5.5 기타 데이터 (data/ 루트)

| 파일 | 설명 |
|------|------|
| `election_overview.json` | 지역별 선거 쟁점 개요 (LLM 생성) |
| `election_stats.json` | 선거 통계 |
| `local_media_registry.json` | 지역 언론사 등록부 |
| `local_media_pool.json` | 지역 언론사 풀 |
| `regional_issues.json` | 지역 핵심이슈 |
| `mayor_history.json` | 기초단체장 역대 결과 |
| `council_history.json` | 의원 역대 결과 |
| `proportional_history.json` | 비례대표 역대 결과 |
| `nesdc_state.json` | NESDC 파이프라인 상태 |
| `news_observations/` | 뉴스 관측 TSV (시도별 queue/archive/starter) |
| `poll_observations/` | 여론조사 관측 TSV (시도별 queue/archive/starter) |

---

## 6. scripts/ 파이프라인 스크립트

총 약 50개 스크립트. Python 3 + Node.js 혼용.

### 6.1 후보자 파이프라인 (`scripts/candidate_pipeline/`)

| 스크립트 | 언어 | 역할 |
|----------|------|------|
| `fetch_governor_status.py` | Python | 광역단체장 출마 상태 수집 |
| `fetch_mayor_status.py` | Python | 기초단체장 출마 상태 수집 |
| `fetch_superintendent_status.py` | Python | 교육감 출마 상태 수집 |
| `fetch_nec_candidates.py` | Python | 선관위 후보자 데이터 수집 |
| `fetch_council_candidates_nec.py` | Python | 광역의원 후보 수집 (선관위) |
| `fetch_local_council_members.py` | Python | 기초의원 현직 정보 수집 |
| `factcheck_candidates.py` | Python | 후보자 정보 팩트체크 (Claude API) |
| `factcheck_mayor.py` | Python | 기초단체장 팩트체크 |
| `factcheck_council.py` | Python | 광역의원 팩트체크 |
| `factcheck_local_council.py` | Python | 기초의원 팩트체크 |
| `factcheck_superintendent.py` | Python | 교육감 팩트체크 |
| `factcheck_byelection.py` | Python | 재보궐 팩트체크 |
| `fill_missing_careers.py` | Python | 누락 경력 보강 |
| `fill_proportional_careers.py` | Python | 비례대표 경력 보강 |
| `cross_validate.py` | Python | 교차 검증 |
| `verify_changes.py` | Python | 변경사항 검증 |
| `detect_byelections.py` | Python | 재보궐 자동 탐지 |
| `local_news_search.py` | Python | 지역 뉴스 검색 |
| `export_candidates.js` | Node.js | 후보자 데이터 내보내기 |

### 6.2 여론조사 파이프라인

| 스크립트 | 역할 |
|----------|------|
| `nesdc_poll_pipeline.py` | NESDC 여론조사 수집 메인 파이프라인 |
| `nesdc_scrape.py` | NESDC 웹 스크래핑 |
| `classify_poll_pdfs.py` | PDF 분류 |
| `gemini_parse_polls.py` | PDF 파싱 (Gemini 사용) |
| `reparse_pdfs.py` | PDF 재파싱 |
| `poll_results_from_news.py` | 뉴스 기반 여론조사 결과 추출 |

### 6.3 개요·이슈 파이프라인

| 스크립트 | 역할 |
|----------|------|
| `update_election_overview.py` | 광역단체장 개요 갱신 (LLM 기반) |
| `update_mayor_overview.py` | 기초단체장 개요 갱신 |
| `update_byelection_overview.py` | 재보궐 개요 갱신 |
| `sync_overview_candidates.py` | 개요-후보자 동기화 |
| `derive_local_issues.py` | 지역 이슈 파생 |

### 6.4 기타 파이프라인

| 스크립트 | 역할 |
|----------|------|
| `update_gallup.py` | 한국갤럽 정당지지율 갱신 |
| `fetch_election_stats.py` | 선거 통계 수집 |
| `discover_local_media.py` | 지역 언론사 발굴 |
| `rebuild_local_media.py` | 지역 언론사 레지스트리 재구축 |
| `overnight_factcheck.sh` | 야간 자동 팩트체크 (tmux/nohup) |
| `overnight_runner.sh` | 야간 자동화 러너 |
| `cache_bust.sh` | CSS/JS 캐시 버스팅 |

### 6.5 QA·검증

| 스크립트 | 역할 |
|----------|------|
| `run_quality_gate.js` | 전체 품질 게이트 실행 |
| `run_news_regression.js` | 뉴스 알고리즘 회귀 테스트 |
| `run_poll_regression.js` | 여론조사 알고리즘 회귀 테스트 |
| `report_data_health.js` | 데이터 건강 보고서 |
| `run_ui_diagnostic.js` | UI 진단 |
| `verify_mayors_dual_source.py` | 기초단체장 이중 소스 검증 |

---

## 7. worker/ -- Cloudflare Worker

```
worker/
├── index.js       # 네이버 뉴스 API 프록시
└── wrangler.toml  # Worker 설정 (election-news-proxy)
```

**역할**: 브라우저에서 직접 호출할 수 없는 네이버 뉴스 API를 중계. CORS 우회 + API 키 보호 + Cache API (30분 TTL).

- 배포 이름: `election-news-proxy`
- 엔드포인트: `GET /api/news?query=...&display=50&sort=date`
- 프론트엔드 참조: `App` 모듈의 `NEWS_PROXY_BASE` 상수

---

## 8. src/ -- TypeScript 참조 코드

```
src/
├── types/
│   └── RegionData.ts      # 지역 데이터 타입 (RegionLevel, ElectionType, RegionData 등)
├── services/
│   └── regionRepository.ts # 지역 API 리포지토리 (fetch + 캐싱)
└── utils/
    └── regionClick.ts      # 지역 클릭 이벤트 처리 (드릴다운, 재보궐 툴팁)
```

**현재 상태**: 프로덕션에서 직접 사용되지 않음. 향후 TypeScript 마이그레이션을 위한 타입 정의와 로직 설계 참조용. `regionRepository.ts`는 Worker 기반 API 서버와 연동하는 구조를 설계 중.

---

## 9. 배포 구조

### Cloudflare Pages (정적 사이트)

```
배포 명령: npm run deploy  ->  bash deploy.sh
프로젝트명: korea-local-eletion
URL: https://korea-local-eletion.pages.dev
```

`deploy.sh` 동작:
1. `.deploy_dist/` 임시 폴더에 rsync로 복사
2. 대용량 GeoJSON (25MB 초과), `scripts/`, `*_byulpyo/`, `prd/`, `.env` 등 제외
3. `wrangler pages deploy`로 Cloudflare Pages에 배포
4. 임시 폴더 삭제

### Cloudflare Worker (API 프록시)

```
배포: cd worker && wrangler deploy
프로젝트명: election-news-proxy
```

### .cfignore 제외 목록

- 대용량 GeoJSON 원본 (6개 파일)
- `scripts/`, `*_byulpyo/`, `prd/`
- Python 캐시, `.env`, `node_modules/`, `.wrangler/`

---

## 10. GitHub Actions 자동화

11개 워크플로우가 정기적으로 데이터를 갱신:

| 워크플로우 | 트리거 | 역할 |
|------------|--------|------|
| `update-polls.yml` | 매주 토 10:00 KST | NESDC 여론조사 수집 |
| `update-gallup.yml` | 정기 | 갤럽 정당지지율 갱신 |
| `update-candidates.yml` | 정기 | 후보자 데이터 갱신 |
| `update-governor-status.yml` | 정기 | 광역단체장 출마 상태 |
| `update-mayor-status.yml` | 정기 | 기초단체장 출마 상태 |
| `update-superintendent-status.yml` | 정기 | 교육감 출마 상태 |
| `update-local-council.yml` | 정기 | 기초의원 데이터 |
| `update-byelection.yml` | 정기 | 재보궐 데이터 |
| `update-overview.yml` | 정기 | 선거 개요 갱신 |
| `update-election-stats.yml` | 정기 | 선거 통계 갱신 |
| `update-local-media.yml` | 정기 | 지역 언론사 레지스트리 |

모든 워크플로우는 `workflow_dispatch`로 수동 실행도 가능.

---

## 11. npm 스크립트

| 명령 | 설명 |
|------|------|
| `npm run deploy` | Cloudflare Pages 배포 |
| `npm run deploy:preview` | 미리보기 배포 |
| `npm run check:all` | 전체 품질 게이트 |
| `npm run check:polls` | 여론조사 회귀 테스트 |
| `npm run check:news` | 뉴스 회귀 테스트 |
| `npm run import:polls` | 여론조사 관측 데이터 임포트 |
| `npm run import:news` | 뉴스 관측 데이터 임포트 |
| `npm run report:health` | 데이터 건강 보고서 |
| `npm run gemini:polls` | Gemini PDF 파싱 실행 |
| `npm run build:local-media` | 지역 언론사 레지스트리 빌드 |

---

## 12. 외부 라이브러리 (CDN)

| 라이브러리 | 버전 | 용도 |
|------------|------|------|
| D3.js | v7 | SVG 지도 렌더링, 줌/팬, 지리 투영 |
| TopoJSON | v3 | TopoJSON -> GeoJSON 변환 |
| Chart.js | 4.4.1 | 여론조사 바차트, 추이 라인차트 |
| Font Awesome | 6.5.1 | 아이콘 |
| Inter + Noto Sans KR + Public Sans | Google Fonts | 타이포그래피 |

---

## 13. 데이터 흐름 요약

```
[NESDC/선관위/뉴스]
        |
        v
[scripts/ 파이프라인]  --(Python/Node.js)-->  [data/*.json]
        |                                         |
        |                                         v
[GitHub Actions]  --(자동 커밋)-->  [data/ 갱신]
                                         |
                                         v
[deploy.sh]  --(wrangler)-->  [Cloudflare Pages]
                                         |
                                         v
[브라우저]  <--(fetch)--  [data/static/*.json, data/polls/*.json ...]
    |
    |-- DataLoader.loadAll()  ->  정적 데이터 로드
    |-- ElectionData          ->  하드코딩 데이터 참조
    |-- MapModule             ->  GeoJSON/TopoJSON 로드 -> D3 렌더링
    |-- App                   ->  탭 전환, 지역 선택, 이벤트 처리
    +-- Worker 프록시         ->  뉴스 API 호출 (CORS 우회)
```
