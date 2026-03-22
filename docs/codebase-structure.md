# 알선거 코드베이스 구조 문서

> 제9회 전국동시지방선거 인터랙티브 선거 정보 지도
> 배포: https://korea-local-eletion.pages.dev
> 기준일: 2026-03-22

---

## 1. 전체 아키텍처 개요

```
┌─────────────────────────────────────────────────────────────────────┐
│                         index.html (394줄)                         │
│  ┌──────────┐   ┌──────────────┐   ┌──────────────────────────┐   │
│  │좌측 사이드│   │  지도 영역   │   │    우측 상세 패널        │   │
│  │- 선거 종류│   │  (D3.js SVG) │   │  5개 탭:                │   │
│  │- 전국 개황│   │  province →  │   │  개요/여론조사/후보자/  │   │
│  │- 정당지지 │   │  district →  │   │  뉴스/역대선거          │   │
│  └──────────┘   │  subdistrict │   └──────────────────────────┘   │
│                  └──────────────┘                                   │
└─────────────────────────────────────────────────────────────────────┘
                              │
                ┌─────────────┼─────────────┐
                ▼             ▼             ▼
        [data-loader.js] [data.js]    [app.js]
        JSON hot-swap    하드코딩      메인 컨트롤러
              │          + 런타임       5,621줄
              ▼          로드
        data/static/     data/*.json
        (11개 JSON)      (130+ JSON)
```

### 스택
- **프론트엔드**: 바닐라 HTML + CSS + JavaScript (프레임워크 없음)
- **지도**: D3.js v7 + TopoJSON v3
- **차트**: Chart.js 4.4.1
- **폰트**: Inter, Noto Sans KR, Public Sans
- **아이콘**: Font Awesome 6.5.1
- **Worker**: Cloudflare Workers (네이버 뉴스 API 프록시)
- **데이터 파이프라인**: Python 3.14 (Anthropic Claude API, NESDC 스크래핑)
- **배포**: Cloudflare Pages

---

## 2. 파일별 상세 구조

### 2.1 index.html (394줄)

**목적**: 단일 페이지 앱의 HTML 구조. 모든 UI 컴포넌트가 여기에 정의됨.

**주요 섹션**:
- L1-31: `<head>` — OG 메타, 폰트, CDN (D3, TopoJSON, Chart.js)
- L33-40: 로딩 스크린 (`#loading-screen`)
- L43-71: 헤더 (`#main-header`) — 로고, 검색, D-day, 사전투표 안내
- L73-84: 선거 캘린더 배너 (`#election-banner`) + 모바일 필터 시트
- L88-357: 메인 콘텐츠 (`#main-content`)
  - L90-182: 좌측 사이드바 (`#left-sidebar`) — 선거종류 필터(8종), 전국 개황, 정당지지율
  - L185-215: 지도 섹션 (`#map-section`) — 브레드크럼, 줌 컨트롤, SVG, 범례
  - L218-356: 우측 패널 (`#detail-panel`) — 5개 탭 콘텐츠
- L359-368: 푸터 (`#main-footer`)
- L370-392: 스크립트 로드 순서 (아래 참조)

**스크립트 로드 순서** (의존성 순):
```
1. js/data-loader.js     — JSON 파일 로딩
2. js/data.js            — ElectionData (핵심 데이터 모듈)
3. js/news_filters.js    — 뉴스 필터 설정
4. js/derived_issues.js  — 파생 이슈 데이터
5. js/issue_engine.js    — 이슈 발굴 엔진
6. js/nec.js             — 선관위 API 연동
7. js/map.js             — D3 지도 렌더링
8. js/charts.js          — Chart.js 차트
9. js/election-calendar.js — 선거 캘린더/법적 로직
10. js/tabs/history-tab.js     — 역대비교 탭
11. js/tabs/council-tab.js     — 의원 탭
12. js/tabs/proportional-tab.js — 비례대표 탭
13. js/app.js            — 메인 앱 컨트롤러 (최후 로드)
```

---

### 2.2 js/app.js (5,621줄)

**목적**: 메인 애플리케이션 컨트롤러. 초기화, 이벤트 바인딩, 탭 렌더링, 뉴스/여론조사 탭 로직을 모두 담당.

**전역 모듈**: `const App = (() => { ... })()`

**내부 상태 변수** (L7-16):
- `currentRegionKey` — 현재 선택된 광역 지역키 (예: 'seoul')
- `currentTab` — 현재 활성 탭 ('overview'|'polls'|'candidates'|'news'|'history')
- `currentDistrictName` — 현재 선택된 시군구명
- `currentElectionType` — 현재 선거 유형
- `_newsTabPendingRegion` — lazy 뉴스 로딩: 지역 선택 시 저장, 뉴스탭 전환 시 실제 렌더

**Public API** (L5605-5620):
```javascript
return {
    onRegionSelected,        // 광역 지역 선택 이벤트
    onDistrictSelected,      // 시군구 선택 이벤트
    onSubdistrictSelected,   // 하위구역(행정동) 선택 이벤트
    onByElectionSelected,    // 재보궐 선택 이벤트
    onConstituencySelected,  // 의원 선거구 선택 이벤트
    onBreadcrumbNational,    // 브레드크럼 전국 클릭
    closePanel,              // 패널 닫기
    switchTab,               // 탭 전환
    getElectionType,         // 현재 선거유형 반환
    __debug                  // 디버그 유틸 (evaluateNewsCase 등)
}
```

**주요 함수 목록**:

| 줄 | 함수명 | 역할 |
|----|--------|------|
| 49 | `init()` | 앱 초기화 — DataLoader 적용, 사이드바 렌더, 데이터 로드, 지도 초기화, 이벤트 설정 |
| 206 | `setupMobileFilterSheet()` | 모바일 필터 바텀시트 설정 |
| 253 | `setupBannerClose()` | 선거 배너 닫기 버튼 |
| 262 | `toggleSuperintendentSummary(show)` | 교육감 요약 카드 표시/숨김 |
| 270 | `resetSharedUI()` | 공용 UI 요소 초기화 |
| 295 | `toggleByelectionNote(show)` | 재보궐 지도 안내 노트 표시/숨김 |
| 304 | `renderDday()` | D-day 카운터 렌더링 |
| 314 | `renderElectionBanner()` | 시기별 선거 배너 렌더링 (1시간마다 갱신) |
| 345 | `renderElectionCalendar()` | 좌측 사이드바 선거 캘린더 렌더링 |
| 450 | `escapeHtml(value)` | HTML 이스케이프 유틸 |
| 462 | `renderStats()` | 전국 개황 통계 렌더링 (유권자수, 선거종류 등) |
| 479 | `updateFilterCounts()` | 선거유형 필터 버튼 카운트 갱신 |
| 509 | `animateNumber(elementId, target, formatter)` | 숫자 애니메이션 |
| 528 | `setupFilterTooltips()` | 선거유형 필터 툴팁 설정 |
| 571 | `setupFilterButtons()` | 선거유형 필터 버튼 클릭 이벤트 |
| 603 | `getElectionUnit(type)` | 선거유형별 단위 반환 (개, 석 등) |
| 615 | `onElectionTypeChanged(type)` | 선거유형 변경 시 지도 모드 전환 |
| 639 | `updateElectionTypeLabel(type)` | 지도 위 선거유형 라벨 갱신 |
| 658 | `resetPanelToWelcome()` | 패널을 환영 상태로 리셋 |
| 690 | `renderPartyDominance()` | 정당 우세 지역 렌더링 |
| 718 | `renderHotspots()` | 격전지 목록 렌더링 |
| 744 | `renderNationalPartyBar()` | 전국 정당지지율 바 렌더링 (갤럽 데이터) |
| 804 | `renderGallupSource()` | 갤럽 출처 정보 렌더링 |
| 831 | `renderFooterPartyBar()` | 푸터 정당 바 렌더링 |
| 853 | `buildSearchIndex()` | 검색 인덱스 구축 (지역명, 시군구명, 선거구명) |
| 916 | `setupSearch()` | 검색 입력/결과 이벤트 바인딩 |
| 1115 | `setupTabs()` | 탭 전환 이벤트 바인딩 |
| 1124 | `switchTab(tabName)` | 탭 전환 로직 — 선거유형에 따라 CouncilTab/ProportionalTab/HistoryTab 위임 |
| 1206 | `setupPanelClose()` | 패널 닫기 버튼 |
| 1213 | `setupPanelResize()` | 패널 드래그 리사이즈 |
| 1254 | `setupMobilePanelSwipe()` | 모바일 스와이프 닫기 |
| 1294 | `openPanel()` | 패널 열기 |
| 1313 | `closePanel()` | 패널 닫기 |
| 1331 | `resetToHome()` | 초기 화면으로 리셋 |
| 1378 | `setupHomeLink()` | 로고/홈 버튼 이벤트 |
| 1387 | `onRegionSelected(regionKey, options)` | 광역 지역 선택 — 선거유형별 분기 (governor/mayor/council/superintendent/byElection/proportional) |
| 1498 | `renderGovernorView(regionKey, region)` | 광역단체장 뷰 렌더링 |
| 1515 | `renderSuperintendentView(regionKey, region)` | 교육감 뷰 렌더링 |
| 1532 | `renderSuperintendentOverview(regionKey, region, data)` | 교육감 개요 상세 렌더링 |
| 1610 | `renderRegionIssuesHtml(regionKey)` | 지역 핵심이슈 태그 렌더링 |
| 1648 | `renderProportionalView(regionKey, region, typeKey)` | 비례대표 뷰 렌더링 |
| 1695 | `renderMayorProvinceView(regionKey, region)` | 기초단체장 광역 뷰 렌더링 |
| 1736 | `renderCouncilProvinceView(regionKey, region)` | 광역의원 광역 뷰 |
| 1768 | `showCouncilMunicipalityDetail(regionKey, municipality)` | 광역의원 시군구 상세 |
| 1824 | `showCouncilConstituencyDetail(regionKey, municipality, district)` | 광역의원 선거구 상세 |
| 1828 | `showCouncilSubdistrictPanel(regionKey, districtName)` | 광역의원 하위 패널 |
| 1862 | `renderLocalCouncilProvinceView(regionKey, region)` | 기초의원 광역 뷰 |
| 1892 | `onByElectionSelected(key)` | 재보궐선거 선택 처리 |
| 1991 | `configurePanelTabs(visibleTabs)` | 패널 탭 가시성 설정 |
| 2005 | `onDistrictSelected(regionKey, districtName)` | 시군구 선택 (기초단체장/기초의원) |
| 2038 | `showMayorDistrictDetail(regionKey, districtName)` | 기초단체장 시군구 상세 |
| 2074 | `showLocalCouncilDistrictDetail(regionKey, districtName)` | 기초의원 시군구 상세 |
| 2155 | `showLocalCouncilProportionalDetail(regionKey, districtName)` | 기초비례 시군구 상세 |
| 2229 | `renderOverviewTab(regionKey)` | 개요탭 렌더링 (선거 쟁점, 현직자 정보, 지역이슈) |
| 2487 | `destroyHistoryComparisonChart()` | 역대비교 차트 파괴 |
| 2503 | `getCandidateStatusMeta(status)` | 후보 상태 메타정보 (아이콘, 색상, 라벨) |
| 2536 | `buildCandidateTabModel(regionKey)` | 후보자탭 데이터 모델 구축 |
| 2705 | `renderCandidateCompareTable(candidates)` | 공약 비교 테이블 |
| 2730 | `renderCandidatesTab(regionKey)` | 후보자탭 렌더링 |
| 2855 | `renderHistoryTab(regionKey)` | 역대비교탭 렌더링 (HistoryTab 모듈 호출) |
| 3087 | `renderDistrictsTab(regionKey)` | 시군구 목록 탭 렌더링 |
| 3141 | `renderDistrictsMap(regionKey, subRegions)` | 시군구 지도 렌더링 |
| 3485 | `buildSuperintendentNewsCategories(...)` | 교육감 뉴스 카테고리 생성 |
| 3554 | `buildProportionalNewsCategories(...)` | 비례대표 뉴스 카테고리 생성 |
| 3578 | `buildCouncilNewsCategories(...)` | 의원 뉴스 카테고리 생성 |
| 3628 | `buildMayorNewsCategories(...)` | 기초단체장 뉴스 카테고리 생성 |
| 3724 | `renderNewsTab(regionKey)` | 뉴스탭 렌더링 — 6개 하부메뉴, 복합 점수 정렬 |
| 3878 | `getGovernorQueryBase(regionName)` | 광역단체장 검색 쿼리 기본값 |
| 3961 | `normalizeKeyword(value)` | 키워드 정규화 |
| 3965 | `getRegionIssueKeywords(regionKey)` | 지역 이슈 키워드 조회 |
| 4026 | `getNewsCategoryTemplates()` | 뉴스 카테고리 템플릿 조회 |
| 4058 | `applyNewsTemplateValue(value, context)` | 뉴스 템플릿 변수 치환 |
| 4075 | `buildNewsCategories(regionKey, ...)` | 뉴스 카테고리 빌드 (6종) |
| 4122 | `setupLatestNews(regionName, categories, regionKey)` | 뉴스탭 UI 설정 |
| 4167 | `sanitizeHtml(text)` | HTML 새니타이즈 |
| 4186 | `evaluateCategoryMatch(item, category, mode)` | 뉴스 아이템 카테고리 매칭 (strict/relaxed) |
| 4304 | `_newsCacheKey(regionKey, catId)` | 뉴스 sessionStorage 캐시 키 |
| 4342 | `fetchLatestNews(category, regionKey)` | 뉴스 API 호출 + 복합 점수 정렬 |
| 4793 | `renderPollTab(regionKey, electionType, districtName)` | 여론조사탭 렌더링 (추세 분석, 바차트, 카드 목록) |
| 5058 | `_calcConsensusTrend(polls, windowDays)` | 컨센서스 추세 계산 |
| 5107 | `_detectOutliers(polls)` | 이상치 탐지 |
| 5278 | `scoreNewsLocality(item, regionKey, districtName)` | 뉴스 지역성 점수 |
| 5307 | `scoreNewsCredibility(host, regionKey, districtName)` | 뉴스 신뢰도 점수 |
| 5396 | `getPollHeaderTitle(regionKey, electionType, districtName)` | 여론조사 헤더 제목 |
| 5419 | `buildPollTrendChart(polls, ...)` | 여론조사 추이 차트 데이터 구성 |
| 5565 | `onConstituencySelected(regionKey, ...)` | 의원 선거구 선택 처리 |

---

### 2.3 js/data.js (3,578줄)

**목적**: 모든 선거 데이터를 관리하는 핵심 모듈. 하드코딩 데이터 + 런타임 JSON 로드를 결합.

**전역 모듈**: `const ElectionData = (() => { ... })()`

**하드코딩 데이터** (L7-907):
- `parties` (L8-19): 정당 정보 (이름, 색상, 약칭) — democratic, ppp, reform, newReform, progressive, justice, newFuture, independent, other
- `historicalPartyNames` (L22-40): 민선 1기~9기 정당명 매핑
- `electionDate` (L43): 선거일 Date 객체 (2026-06-03)
- `preVoteDates` (L44-47): 사전투표 기간
- `electionCalendarSources` (L48-61): 선거 캘린더 출처 URL
- `electionCalendar` (L62-163): 선거 일정 배열 (9개 이벤트)
- `nationalSummary` (L~200): 전국 통계 (유권자수, 광역/기초 수 등) — DataLoader로 갱신 가능
- `regions` (L~200-900): 17개 광역시도 데이터 (code, name, population, partySupport, candidates, historicalElections 등) — DataLoader로 갱신 가능
- `subRegionData` (L~900): 226개 시군구 데이터 (name, population, keyIssue, leadParty, mayor 등)
- `superintendents` (L~): 17개 교육감 데이터 — DataLoader로 갱신 가능
- `gallupNationalPoll` (L~): 한국갤럽 전국 정당지지율 — DataLoader로 갱신 가능
- `electionTypeInfo` (L~): 선거유형별 설명 정보 — DataLoader로 갱신 가능
- `latestPolls` (L~): 최신 여론조사 (레거시, 현재는 polls.json 사용)
- `superintendentStanceColors` (L~): 교육감 성향 색상 (진보, 보수, 중도)

**헬퍼 함수** (L165-957):
| 줄 | 함수명 | 역할 |
|----|--------|------|
| 165 | `createKoreaDate(dateString, timeString)` | KST 기준 Date 생성 |
| 169 | `getSeoulDateKey(date)` | 서울 기준 날짜 문자열 (YYYY-MM-DD) |
| 173 | `getElectionCalendar(referenceDate)` | 선거 캘린더 이벤트 목록 반환 (활성/예정 필터) |
| 199 | `getElectionCalendarSections(referenceDate)` | 캘린더 섹션별 그룹화 |
| 909 | `getHotspots()` | 격전지 목록 반환 |
| 932 | `getDday()` | D-day 계산 |
| 939 | `getPartyDominance()` | 정당별 우세 지역 수 계산 |
| 955 | `getNewsSearchUrl(regionKey)` | 지역별 뉴스 검색 URL 생성 |

**목업 데이터 생성** (L1859-2327):
- `generateMockElectionData(forceRefresh)` (L1859): 기초단체장, 광역의원, 기초의원, 교육감 시뮬레이션 데이터를 seeded random으로 생성. 실제 데이터가 없을 때 fallback.

**Public API** (L2329-3577) — 반환 객체에 포함된 속성/메서드:

*데이터 접근*:
- `parties`, `regions`, `electionDate`, `preVoteDates`, `nationalSummary`
- `superintendents`, `gallupNationalPoll`, `electionTypeInfo`, `subRegionData`, `latestPolls`
- `getRegion(key)`, `getSubRegions(key)`, `getSubRegionByName(regionKey, districtName)`
- `getDistrictFullName(regionKey, districtName)`, `getDistrictSummary(regionKey, districtName)`
- `getPartyColor(partyKey)`, `getPartyName(partyKey)`, `getLeadingParty(regionKey)`
- `getSuperintendentData(regionKey)`, `getSuperintendentColor(stance)`
- `getHistoricalPartyName(partyKey, election)` — 선거 회차별 당시 정당명

*런타임 데이터 로딩 (fetch + 캐시)*:
- `loadElectionStats()` → `data/election_stats.json` — 선거구 수 통계
- `loadSuperintendentStatus()` → `data/candidates/superintendent_status.json`
- `loadSuperintendentCandidates()` → `data/candidates/superintendent_candidates.json`
- `loadGovernorStatus()` → `data/candidates/governor_status.json`
- `loadMayorStatus()` → `data/candidates/mayor_status.json`
- `loadMayorCandidates()` → `data/candidates/mayor_candidates.json`
- `loadMayorHistory()` → `data/mayor_history.json`
- `loadCouncilMembersData()` → `data/council_members.json`
- `loadCandidatesData()` → `data/candidates/governor.json`
- `loadByElectionData()` → `data/candidates/byelection.json`
- `loadPollsData()` → `data/polls/polls.json`
- `loadElectionOverview()` → `data/election_overview.json`
- `loadCouncilCandidates(regionKey, electionType)` → `data/candidates/{council|local_council}/{regionKey}.json`
- `loadLocalCouncilMembersData()` → `data/candidates/local_council_members.json`
- `loadProportionalCandidates()` → `data/proportional_council.json` / `data/proportional_local_council.json`
- `loadPartySupport(regionKey)` → `data/polls/polls.json`에서 정당지지도 필터

*여론조사 분류*:
- `getClassifiedPolls(regionKey, electionType, districtName)` — polls.json에서 지역/선거유형에 맞는 여론조사를 분류하여 반환. 후보명 매칭, 제목 분석 등 복잡한 분류 로직 포함 (L3040-3500)

*데이터 접근 메서드*:
- `getMayorData(regionKey, districtName)` — 기초단체장 후보 데이터
- `getByElectionData(key)` — 재보궐선거 데이터
- `getElectionOverview(regionKey, electionType, districtName)` — 선거 쟁점 개요
- `getMayorHistoricalData(regionKey, districtName)` — 기초단체장 역대 선거
- `getHistoricalData(regionKey)` — 광역 역대 선거
- `getSuperintendentHistoricalData(regionKey)` — 교육감 역대 선거
- `getCouncilCandidates(regionKey, districtName, electionType)` — 의원 후보 데이터
- `getProportionalData(regionKey, electionType, districtName)` — 비례대표 데이터
- `getProportionalCandidates(regionKey, electionType)` — 비례대표 후보
- `getPartySupport(regionKey)` — 지역 정당지지도

---

### 2.4 js/data-loader.js (122줄)

**목적**: `data/static/` 폴더의 JSON 파일을 fetch하여 ElectionData에 hot-swap 방식으로 덮어쓰기.

**전역 모듈**: `const DataLoader = (() => { ... })()`

**로드 대상 파일 (11개)**:
1. `parties.json` — 정당 정보
2. `regions.json` — 17개 광역시도
3. `sub_regions.json` — 226개 시군구
4. `historical_elections.json` — 역대 선거 결과
5. `superintendent_history.json` — 교육감 역대 선거
6. `superintendents.json` — 교육감 현황
7. `election_type_info.json` — 선거유형 설명
8. `national_summary.json` — 전국 통계
9. `historical_party_names.json` — 역대 정당명
10. `gallup_national_poll.json` — 전국 정당지지율
11. `election_meta.json` — 선거 메타데이터

**주요 함수**:
| 줄 | 함수명 | 역할 |
|----|--------|------|
| 11 | `loadJSON(filename)` | 단일 JSON 파일 로드 + 캐시 |
| 26 | `loadAll()` | 11개 파일 병렬 로드 |
| 64 | `applyToElectionData(ED)` | ElectionData 객체에 JSON 데이터 덮어쓰기 (6개 데이터셋) |

**캐시 전략**: 인메모리 캐시 (`cache` 객체). URL에 `?v=Date.now()` 캐시 버스팅.

---

### 2.5 js/map.js (3,767줄)

**목적**: D3.js 기반 한국 지도 렌더링. 광역 → 시군구 → 행정동/선거구 3단계 드릴다운 지원.

**전역 모듈**: `const MapModule = (() => { ... })()`

**내부 상태**:
- `currentMapMode`: 'province' | 'district' | 'subdistrict'
- `currentProvinceKey`: 현재 광역시도
- `currentElectionType`: 현재 선거유형
- `colorModeActive`: 정당색 표시 여부
- `selectedRegion`: 선택된 지역

**Public API** (L3746-3767):
```javascript
return {
    init,                          // 지도 초기화 (TopoJSON 로드 + SVG 렌더)
    selectRegion,                  // 광역 선택
    highlightRegion,               // 광역 하이라이트
    updateMapColors,               // 지도 색상 갱신
    switchToDistrictMap,           // 시군구 지도 전환
    switchToSubdistrictMap,        // 행정동 지도 전환
    switchToProvinceMap,           // 광역 지도 복귀
    setElectionType,               // 선거유형 설정 + 지도 전환
    setElectionTypeOnly,           // 선거유형만 설정 (지도 전환 없이)
    updateBreadcrumb,              // 브레드크럼 갱신
    hasSubdistrictData,            // 행정동 데이터 존재 여부
    highlightDistrict,             // 시군구 하이라이트
    getSelectedRegion,             // 선택된 지역 반환
    getCurrentElectionType,        // 현재 선거유형 반환
    getMapMode,                    // 현재 지도 모드 반환
    switchToBasicCouncilMap,       // 기초의원 선거구 지도
    switchToCouncilSubdistrictMap, // 광역의원 시군구 하위 지도
    switchToProportionalDistrictMap,  // 비례대표 시군구 지도
    switchToProportionalSigunguDetail // 비례대표 시군구 상세
}
```

**주요 함수**:
| 줄 | 함수명 | 역할 |
|----|--------|------|
| 77 | `getRegionKey(feature)` | GeoJSON feature → 지역키 매핑 |
| 142 | `matchesProvince(feature, region)` | feature가 특정 광역에 속하는지 판정 |
| 216 | `isMergedGuDistrict(regionKey, districtName)` | 합병구 시장 판정 (창원 등 11개 시) |
| 243 | `mergeSingleMayorCityFeatures(regionKey, features)` | 행정구를 시 단위로 합병 |
| 298 | `_refreshToneColors()` | 선거유형별 지도 톤 색상 갱신 |
| 323 | `getRegionColor(regionKey)` | 지역 색상 결정 (선거유형별) |
| 375 | `init()` | 지도 초기화 — SVG 생성, TopoJSON 로드, 줌 설정 |
| 477 | `renderMap()` | 광역 지도 렌더링 (17개 시도) |
| 516 | `renderFallbackMap()` | TopoJSON 로드 실패 시 그리드 폴백 |
| 568 | `switchToSubdistrictMap(regionKey, districtName)` | 행정동 지도 전환 |
| 620-968 | `handleMouseOver/Move/Out/Click` | 마우스 이벤트 핸들러 (툴팁 포함) |
| 1022 | `selectRegion(key)` | 지역 선택 + App.onRegionSelected 호출 |
| 1064 | `updateMapColors()` | 전체 지도 색상 갱신 |
| 1096 | `updateLabels()` | 지도 라벨 갱신 |
| 1108 | `updateLegend()` | 범례 갱신 (선거유형별) |
| 1245 | `switchToProvinceMap()` | 광역 지도로 복귀 |
| 1278 | `loadDistrictGeo()` | 시군구 GeoJSON 로드 |
| 1341 | `switchToDistrictMap(regionKey)` | 시군구 지도 전환 |
| 1643 | `loadCouncilGeo(regionKey)` | 광역의원 선거구 GeoJSON 로드 |
| 1657 | `switchToCouncilDistrictMap(regionKey)` | 광역의원 지도 전환 |
| 1967 | `switchToCouncilSubdistrictMap(regionKey, sigunguName)` | 광역의원 하위 지도 |
| 2157 | `loadBasicCouncilGeo(regionKey, districtName)` | 기초의원 선거구 GeoJSON 로드 |
| 2192 | `switchToBasicCouncilMap(regionKey, districtName)` | 기초의원 지도 전환 |

**지도 데이터 소스**:
- `data/skorea-provinces-2018-topo.json` — 광역시도 경계
- `data/skorea-municipalities-2018-topo.json` — 시군구 경계
- `data/skorea-municipalities-2018-topo-changwon.json` — 창원시 통합 경계
- `data/서울_행정동_경계_2017_topo.json` — 서울 행정동 경계
- `data/council/council_districts_{region}_topo.json` — 광역의원 선거구
- `data/basic_council/{region}/basic_{district}_topo.json` — 기초의원 선거구

**캐시**: `councilGeoCache`, `councilTopoCache`, `districtGeoCache` (인메모리)

---

### 2.6 js/charts.js (329줄)

**목적**: Chart.js 기반 차트 렌더링 모듈.

**전역 모듈**: `const ChartsModule = (() => { ... })()`

**내부 상태**: `pollBarChart`, `pollTrendChart`, `dynamicCharts[]`

**주요 함수**:
| 줄 | 함수명 | 역할 |
|----|--------|------|
| 19 | `destroyCharts()` | 모든 차트 인스턴스 파괴 |
| 32 | `renderPollBarChart(poll, canvasId)` | 여론조사 바차트 — poll.results를 지지율 내림차순 바차트로 표시 |
| 126 | `renderPollTrendChart(trendGroup, canvasId)` | 여론조사 추이 라인차트 — 동일 기관 시계열, 후보별 색상 구분, 오차범위 밴드 |
| 319 | `renderAllCharts(regionKey)` | 호환성용 래퍼 (현재는 destroyCharts만 호출) |

**Public API**: `{ renderAllCharts, renderPollBarChart, renderPollTrendChart, destroyCharts }`

---

### 2.7 js/election-calendar.js (237줄)

**목적**: 선거 캘린더 시스템. 시간 기준 + 법적 필수 로직 + 편의 로직을 계층 분리.

**전역 모듈**: `const ElectionCalendar = (() => { ... })()`

**구조**:
- **Layer 1: 시간 기준** — `getKST()` (L11-15): 모든 시간 판정의 단일 소스
- **Layer 2A: 법적 필수** — 공직선거법 제108조 여론조사 공표금지
  - `isPublicationBanned()` (L68-71): 5/28 00:00 ~ 6/3 18:00 KST 판정
  - `getFilteredPolls(polls)` (L74-85): 공표금지 시 빈 배열 반환
  - `isNewsSubTabDisabled(subTabName)` (L88-96): 뉴스탭 여론조사 하부메뉴 차단
- **Layer 2B: 편의 로직** — phase 기반 UX
  - `getCurrentPhase()` (L102-113): 9단계 phase 판정 (PRE_REGISTRATION ~ INAUGURATED)
  - `getDday()` (L115-122): D-day 문자열
  - `getCandidateSortMode()` (L124-127): 후보 정렬 모드 (status_priority | ballot_number)
  - `getDefaultNewsSubTab()` (L129-133): 기본 뉴스 하부탭
  - `getBannerConfig()` (L135-218): 시기별 배너 설정

**DATES 상수** (L18-53): 모든 선거 일정 Date 객체
- `PRE_REG_GOVERNOR`: 2026-02-03
- `CANDIDATE_REG_START/END`: 2026-05-14~15
- `PUBLICATION_BAN_START`: 2026-05-28
- `EARLY_VOTE_START/END`: 2026-05-29~30
- `ELECTION_DAY_START / VOTE_END`: 2026-06-03

---

### 2.8 js/news_filters.js (365줄)

**목적**: 뉴스탭 알고리즘 설정. 6개 하부메뉴(전체/여론조사/후보인물/공약정책/선거판세/선거운동)의 쿼리, 키워드, 필터 규칙 정의.

**전역 객체**: `window.NewsFilterConfig`

**주요 속성**:
- `majorNewsHosts` (L8-14): Tier 1 전국 주요 언론사 23개
- `scoreWeights` (L17-23): 복합 점수 가중치 — time(0.32), relevance(0.30), credibility(0.18), locality(0.15), engagement(0.05)
- `localitySignals` (L25-31): 지역성 신호 점수
- `globalExcludeKeywords` (L35-39): 비지방선거 키워드 (대선, 총선 등)
- `credibilityTiers` (L42-72): 언론사 편집 신뢰도 4단계 — tier1(1.0, 종합일간지/방송3사), tier2(0.82, 경제지), tier3(0.64, 인터넷언론), tier4(0.52)
- `regionalMedia` (L75-141): 17개 광역시도별 지역언론 매핑 (tier1/tier2 호스트, priorityNames)
- `subTabKeywords` (L144-169): 하부메뉴별 키워드 (poll, candidate, policy, analysis, campaign)
- `categoryTemplates` (L173-340): 6개 카테고리 템플릿 — 쿼리, strict/relaxed 필터 규칙
- `regionOverrides` (L343-364): 지역별 카테고리 오버라이드 (예: 경기도)

---

### 2.9 js/nec.js (247줄)

**목적**: 중앙선거관리위원회 / 공공데이터포털 교육감 후보 정보 모듈.

**전역 모듈**: `const NECData = (() => { ... })()`

**주요 함수**:
| 줄 | 함수명 | 역할 |
|----|--------|------|
| 50 | `getSdName(regionKey)` | 지역키 → 한글 시도명 매핑 |
| 79 | `determineStance(party)` | 정당명 → 성향(진보/보수/중도) 판정 |
| 96 | `getStanceColor(stance)` | 성향 → 색상 |
| 105 | `parseCandidates(regionKey, rawItems)` | API 응답 → 후보 객체 파싱 |
| 130 | `normalizeResponsePayload(raw, regionKey)` | 다양한 API 응답 형식 정규화 |
| 167 | `fetchDirect(regionKey, sdName)` | NEC API 직접 호출 |
| 186 | `fetchViaProxy(regionKey, sdName)` | 프록시 경유 호출 |
| 203 | `fetchCandidates(regionKey)` | 후보 데이터 조회 (캐시 + inflight 중복 방지) |

**Public API**: `{ fetchCandidates, getCachedCandidates, isFetching, getStanceForParty, getStanceColor }`

---

### 2.10 js/issue_engine.js (709줄)

**목적**: 지역 핵심이슈 발굴 엔진. 뉴스 제목 N-gram 빈도 분석 + YAKE 통계 특성 + 의미 필터링.

**전역 객체**: `window.IssueEngine`

**알고리즘**:
1. 지역명으로 뉴스 수집 (Naver News API via Worker)
2. 제목에서 한국어 조사 제거 → 명사구 추출
3. 유니그램 + 바이그램 빈도 + 공기어 추적
4. YAKE Relatedness: 범용어 감점
5. 의미유형 필터: 대학/기관명, 행사명, 프로그램명 제거
6. 결과 0건이면 빈 배열 반환 (허수 채우기 금지)

**주요 함수**:
| 줄 | 함수명 | 역할 |
|----|--------|------|
| 106 | `isPersonOrInstitution(term)` | 인물/기관명 판별 |
| 174 | `isNonIssueEntity(term)` | 비이슈 고유명사 판별 |
| 233 | `getRegionStopwords(regionKey)` | 지역별 불용어 |
| 265 | `stripParticles(word)` | 한국어 조사 제거 |
| 295 | `fetchNews(regionKey)` | 뉴스 API 호출 |
| 332 | `extractNgrams(articles, regionKey)` | N-gram 추출 |
| 451 | `calcYakeScore(term, freq, sourceCount, ngrams)` | YAKE 점수 계산 |
| 481 | `rankIssues(ngrams, totalArticles, nationalTerms)` | 이슈 순위 매기기 |
| 591 | `polishIssueName(term)` | 이슈명 정제 |
| 602 | `getNationalBackgroundTerms()` | 전국 공통 배경 용어 수집 |
| 654 | `analyzeRegion(regionKey)` | 지역 이슈 분석 메인 함수 |
| 689 | `getStaticIssues(regionKey)` | 정적 이슈 (DerivedIssuesData fallback) |

**캐시**: 인메모리 `cache` (TTL 6시간)

---

### 2.11 js/derived_issues.js (1,303줄)

**목적**: 사전 계산된 지역별 핵심이슈 데이터. `IssueEngine`의 정적 fallback.

**전역 객체**: `window.DerivedIssuesData`

**구조**:
```json
{
  "updatedAt": "2026-03-04T22:21:12+09:00",
  "methodology": "news-detailed-topic-weighted-v3",
  "regions": {
    "seoul": {
      "issues": ["버스 노선·환승 체계 개선", ...],
      "signals": {
        "이슈명": {
          "category": "교통 인프라",
          "score": 2.8,
          "count": 2,
          "count7": 2,
          "count30": 2,
          "trend": "상승",
          "topSources": ["slownews.kr"]
        }
      }
    }
  }
}
```

---

### 2.12 js/tabs/council-tab.js (722줄)

**목적**: 광역의원 + 기초의원 지역구 탭 렌더러. 선거구 선택 후 5개 탭 렌더링.

**전역 모듈**: `const CouncilTab = (() => { ... })()`

**주요 함수**:
| 줄 | 함수명 | 역할 |
|----|--------|------|
| 52 | `render(tabName, regionKey, districtName, electionType)` | 탭별 렌더링 분기 |
| 73 | `getDistrictDongs(regionKey, districtName, electionType)` | 관할 읍면동 조회 |
| 86 | `loadDistrictMapping(regionKey, electionType)` | 선거구 매핑 JSON 로드 |
| 103 | `renderOverview(regionKey, districtName, electionType)` | 개요탭 — 선거구 정보, 관할 읍면동, 현직 의원, 이전 선거 결과 |
| 293 | `renderPolls(regionKey, districtName, electionType)` | 여론조사탭 — 의원 선거는 "해당 지역 여론조사 없음" 표시 |
| 334 | `renderCandidates(regionKey, districtName, electionType)` | 후보자탭 — 현직+도전자 카드 |
| 377 | `_renderCandidatesContent(container, ...)` | 후보자 카드/정당별 그룹 렌더링 |
| 473 | `renderNews(regionKey, districtName, electionType)` | 뉴스탭 — renderNewsTab 위임 |
| 484 | `loadCouncilHistory()` | 역대 의원 선거 데이터 로드 |
| 492 | `renderHistory(regionKey, districtName, electionType)` | 역대비교탭 |

---

### 2.13 js/tabs/proportional-tab.js (472줄)

**목적**: 광역비례 + 기초비례 탭 렌더러. 정당 투표 기반.

**전역 모듈**: `const ProportionalTab = (() => { ... })()`

**주요 함수**:
| 줄 | 함수명 | 역할 |
|----|--------|------|
| 40 | `render(tabName, regionKey, districtName, electionType)` | 탭별 분기 |
| 55 | `renderOverview(regionKey, electionType)` | 개요 — 의석수, 제도 설명, 제8회 비례 당선자, 득표율 |
| 210 | `renderPolls(regionKey, electionType)` | 여론조사 — 정당지지도만 표시 |
| 339 | `renderCandidates(regionKey, electionType)` | 후보자 — 정당별 명부 테이블 |
| 393 | `renderNews(regionKey, electionType)` | 뉴스 — renderNewsTab 위임 |
| 401 | `renderHistory(regionKey, electionType)` | 역대비교 — 비례 투표결과 + 의석배분 |

---

### 2.14 js/tabs/history-tab.js (600줄)

**목적**: 역대비교 탭 렌더링 모듈. 정권 변화 타임라인 + 득표율 추이 차트 + 상세 결과.

**전역 모듈**: `const HistoryTab = (() => { ... })()`

**주요 함수**:
| 줄 | 함수명 | 역할 |
|----|--------|------|
| 26 | `getBlocKey(partyKey)` | 정당키 → 계열(democratic/ppp/independent/other) 매핑 |
| 34 | `getBlocLabel(blocKey, electionType)` | 계열 라벨 (교육감: 진보/보수, 기타: 민주계/보수계) |
| 70 | `dotShapeClass(blocKey)` | 접근성용 도트 형태 클래스 |
| 90 | `render(regionKey, electionType, districtName)` | 메인 렌더링 — 타임라인 + Chart.js 라인차트 + 결과 테이블 |
| 358 | `renderByElectionHistory(...)` | 재보궐 역대비교 (국회의원 선거 결과 기반) |

---

### 2.15 worker/index.js (119줄)

**목적**: Cloudflare Worker로 배포되는 네이버 뉴스 API 프록시. CORS 우회 + API 키 보호 + Cache API 캐싱.

**엔드포인트**: `GET /api/news?query=...&display=50&sort=date&start=1`

**동작 흐름**:
1. CORS preflight 처리 (OPTIONS)
2. Cache API에서 캐시 히트 확인 (TTL 30분)
3. 캐시 미스 시 Naver Open API 호출 (`openapi.naver.com/v1/search/news.json`)
4. 응답을 Cache API에 저장 후 반환

**환경변수** (Cloudflare Workers Secrets):
- `NAVER_CLIENT_ID`
- `NAVER_CLIENT_SECRET`

---

### 2.16 css/style.css (4,348줄)

**목적**: 전체 스타일. "Civic Beacon" 다크 테마 디자인 시스템.

**디자인 토큰** (`:root`, L7-100):
- Surface 계층: `--bg-primary` (#0D1228) → `--bg-secondary` (#191E35) → `--bg-tertiary` (#242940)
- 테두리: Ghost Border (`rgba(169, 199, 255, 0.08)`)
- 텍스트: Off-white + Blue-gray (`--text-primary` #DDE1FF, `--text-secondary` #A9C7FF)
- 시맨틱 컬러: blue(#2E8BFF), cyan, green, yellow, red, purple
- 정당색: 고정 변수 (`--party-democratic` #1A5CF0, `--party-ppp` #E61E2B 등)
- 레이아웃: `--header-height` 56px, `--sidebar-width` 320px, `--panel-width` 560px
- 타이포: Inter + Public Sans 기반, 4px 간격 단위
- Glassmorphism: `--glass-bg`, `--glass-blur`

**주요 섹션**:
| 줄 범위 | 섹션 |
|---------|------|
| 102-142 | Reset + Scrollbar |
| 143-257 | Header + D-day |
| 258-296 | 여론조사 공표금지 안내 |
| 297-538 | 선거 캘린더 |
| 539-550 | Layout (3컬럼 grid) |
| 551-927 | 좌측 사이드바 (필터, 통계, 정당바) |
| 978-1017 | 전국 정당 지지율 바 |
| 1018-1385 | 지도 영역 (줌 컨트롤, SVG, 툴팁, 범례) |
| 1386-1961 | 우측 패널 (헤더, 탭, 콘텐츠, 카드) |
| 1986-2226 | 여론조사 카드 UI |
| 2227-2574 | 뉴스 피드 |
| 2575-2594 | 모바일 차트 반응형 |
| 2595-2720 | 역대비교 (타임라인, 결과 테이블) |
| 2721-2770 | 공약 비교 테이블 |
| 2771+ | 반응형 (모바일 브레이크포인트) |

---

## 3. data/ 폴더 구조

### 3.1 data/static/ (DataLoader 전용, 11개 JSON)

| 파일명 | 크기 | 용도 |
|--------|------|------|
| `parties.json` | 925B | 정당 정보 (이름, 색상) |
| `regions.json` | 67.7K | 17개 광역시도 (인구, 후보, 지지율, 역대선거) |
| `sub_regions.json` | 65.5K | 226개 시군구 (인구, 이슈, 우세정당, 시장) |
| `historical_elections.json` | 32.1K | 역대 지방선거 결과 (민선 1기~8기) |
| `superintendent_history.json` | 15.8K | 교육감 역대 선거 |
| `superintendents.json` | 10.1K | 교육감 현황 (후보, 현직자) |
| `election_type_info.json` | 2.9K | 선거유형 설명 (8종) |
| `national_summary.json` | 1.3K | 전국 통계 |
| `historical_party_names.json` | 642B | 선거 회차별 정당명 |
| `gallup_national_poll.json` | 416B | 전국 정당지지율 (한국갤럽) |
| `election_meta.json` | 138B | 선거 메타데이터 |

### 3.2 data/candidates/ (후보자 데이터)

| 경로 | 용도 |
|------|------|
| `governor.json` | 광역단체장 후보 (17개 시도) |
| `governor_status.json` | 광역단체장 현황 (팩트체크 결과) |
| `mayor_candidates.json` | 기초단체장 후보 (226개 시군구) |
| `mayor_status.json` | 기초단체장 현황 |
| `superintendent_status.json` | 교육감 현황 |
| `superintendent_candidates.json` | 교육감 후보 |
| `byelection.json` | 재보궐선거 후보 |
| `byelection_news_state.json` | 재보궐 뉴스 상태 |
| `local_council_members.json` | 기초의원 현직 |
| `council/{region}.json` | 광역의원 후보 (지역별) |
| `local_council/{region}.json` | 기초의원 후보 (지역별) |

### 3.3 data/polls/ (여론조사)

| 경로 | 용도 |
|------|------|
| `polls.json` | 프론트엔드 사용 메인 여론조사 데이터 (NESDC 수집) |
| `state.json` | NESDC 수집 파이프라인 상태 (lastId, lastRun) |
| `pdf_classification.json` | PDF 분류 결과 |
| `pdfs/*.pdf` | NESDC 여론조사 원문 PDF (843건+) |
| `gemini_parse_results.json` | PDF 파싱 결과 |

### 3.4 data/council/ (광역의원 선거구 지도)

| 패턴 | 용도 |
|------|------|
| `council_districts_{region}_topo.json` | 광역의원 선거구 TopoJSON |
| `council_districts_{region}.geojson` | 광역의원 선거구 GeoJSON |
| `district_mapping_{region}.json` | 선거구 ↔ 읍면동 매핑 |

### 3.5 data/basic_council/ (기초의원 선거구 지도)

| 패턴 | 용도 |
|------|------|
| `basic_council/{region}/basic_{district}_topo.json` | 기초의원 선거구 TopoJSON |
| `basic_district_mapping_{region}.json` | 선거구 ↔ 읍면동 매핑 |
| `basic_council_members.json` | 기초의원 현직 명부 |
| `ordinances/` | 조례 원문 (HTML/XML) |

### 3.6 기타 data/ 파일

| 파일명 | 용도 |
|--------|------|
| `election_overview.json` | 선거 쟁점 개요 (광역+교육감+기초) |
| `election_stats.json` | 선거구 수 통계 |
| `council_history.json` | 광역의원 역대 선거 |
| `mayor_history.json` | 기초단체장 역대 선거 |
| `proportional_council.json` | 광역 비례대표 후보 |
| `proportional_local_council.json` | 기초 비례대표 후보 |
| `proportional_history.json` | 비례대표 역대 투표 결과 |
| `regional_issues.json` | 지역별 핵심이슈 키워드 |
| `local_media_pool.json` | 지역언론 통합 풀 (자동 발견) |
| `local_media_registry.json` | 지역언론 등록부 |
| `local_media_registry_overrides.json` | 지역언론 오버라이드 |
| `internet_newspapers.json` | 인터넷신문 목록 |
| `poll_org_registry.json` | 여론조사 기관 등록부 |
| `nesdc_state.json` | NESDC 스크래핑 상태 |
| `{region}_overview_state.json` | 개요 갱신 상태 (뉴스 해시 기반 스킵) |
| `mock-region-data.json` | 목업 지역 데이터 |
| `skorea-provinces-2018-topo.json` | 광역시도 경계 TopoJSON |
| `skorea-municipalities-2018-topo.json` | 시군구 경계 TopoJSON |

### 3.7 data/news_observations/ + data/poll_observations/

**용도**: 뉴스/여론조사 관측치 큐 시스템 (수동 검증 파이프라인).

| 구조 | 용도 |
|------|------|
| `queue/{region}.tsv` | 검증 대기 관측치 |
| `archive/*.tsv` | 처리 완료 관측치 |
| `starter/recommended.tsv` | 초기 추천 관측치 |

---

## 4. scripts/ 폴더 구조

### 4.1 여론조사 파이프라인

| 스크립트 | 역할 |
|---------|------|
| `nesdc_poll_pipeline.py` | NESDC 여론조사 수집 메인 파이프라인 — HTML 상세 + PDF 결과표 파싱 → `data/polls/polls.json` |
| `nesdc_scrape.py` | NESDC 스크래핑 유틸리티 |
| `gemini_parse_polls.py` | PDF → 구조화 데이터 파싱 (Gemini API 사용, 현재 Claude로 교체 중) |
| `classify_poll_pdfs.py` | PDF 분류 (선거유형별) |
| `reparse_pdfs.py` | PDF 재파싱 |
| `update_gallup.py` | 한국갤럽 전국 정당지지율 갱신 → `data/static/gallup_national_poll.json` |

### 4.2 후보자 파이프라인 (scripts/candidate_pipeline/)

| 스크립트 | 역할 |
|---------|------|
| `factcheck_candidates.py` | 광역단체장 후보 팩트체크 (Claude API) |
| `factcheck_superintendent.py` | 교육감 후보 팩트체크 |
| `factcheck_mayor.py` | 기초단체장 후보 팩트체크 |
| `factcheck_council.py` | 광역의원 후보 팩트체크 |
| `factcheck_local_council.py` | 기초의원 후보 팩트체크 |
| `factcheck_byelection.py` | 재보궐 후보 팩트체크 |
| `fetch_governor_status.py` | 광역단체장 현황 수집 |
| `fetch_mayor_status.py` | 기초단체장 현황 수집 |
| `fetch_superintendent_status.py` | 교육감 현황 수집 |
| `fetch_nec_candidates.py` | 선관위 후보 정보 수집 |
| `fetch_byelection.py` | 재보궐 후보 수집 |
| `fill_missing_careers.py` | 경력 누락 보강 |
| `fill_proportional_careers.py` | 비례대표 경력 보강 |
| `cross_validate.py` | 교차 검증 |
| `verify_changes.py` | 변경사항 검증 |
| `collect_mayor_pledges.py` | 기초단체장 공약 수집 |
| `local_news_search.py` | 지역 뉴스 검색 |
| `sync_byelection_winners.py` | 재보궐 당선자 동기화 |

### 4.3 선거 개요 파이프라인

| 스크립트 | 역할 |
|---------|------|
| `update_election_overview.py` | 광역단체장 + 교육감 개요 갱신 (Claude API, narrative 모드) |
| `update_mayor_overview.py` | 기초단체장 개요 갱신 |
| `update_byelection_overview.py` | 재보궐 개요 갱신 |
| `sync_overview_candidates.py` | 개요-후보 데이터 동기화 |
| `election_overview_utils.py` | 개요 공용 유틸 (LLM 호출, 프롬프트 빌더, 뉴스 검색) |

### 4.4 의원 선거구 파이프라인

| 스크립트 | 역할 |
|---------|------|
| `council_member_pipeline.py` | 광역의원 현직 파이프라인 |
| `build_council_members.py` | 광역의원 명부 구축 |
| `council_pipeline/parse_byulpyo2.py` | 별표2 (선거구) 파싱 |
| `council_pipeline/dissolve_districts.py` | 선거구 경계 생성 |
| `basic_council_pipeline/parse_ordinance.py` | 조례 파싱 (기초의원) |
| `basic_council_pipeline/parse_hwp_text.py` | HWP 텍스트 파싱 |
| `basic_council_pipeline/dissolve_districts.py` | 기초의원 선거구 경계 |

### 4.5 역대 선거 데이터

| 스크립트 | 역할 |
|---------|------|
| `fetch_election_stats.py` | 선거 통계 수집 |
| `fetch_mayor_history.py` | 기초단체장 역대 선거 수집 |
| `fetch_mayor_runnerup.py` | 기초단체장 차점자 수집 |
| `fetch_mutupyo.py` | 무투표 당선 수집 |

### 4.6 지역 뉴스/이슈

| 스크립트 | 역할 |
|---------|------|
| `derive_local_issues.py` | 지역 이슈 파생 → `derived_issues.js` |
| `discover_local_media.py` | 지역언론 자동 발견 |
| `deep_search_local_media.py` | 지역언론 심층 탐색 |
| `rebuild_local_media.py` | 지역언론 풀 재구축 |
| `scrape_internet_newspapers.py` | 인터넷신문 스크래핑 |
| `local_media_pool.py` | 지역언론 풀 관리 |
| `naver_news_proxy.py` | 네이버 뉴스 로컬 프록시 |

### 4.7 야간 자동화

| 스크립트 | 역할 |
|---------|------|
| `overnight_factcheck.sh` | 전체 팩트체크 20라운드 (광역+교육감+기초+의원+재보궐+경력보강) |
| `overnight_runner.sh` | 야간 실행기 |

### 4.8 품질 관리

| 스크립트 | 역할 |
|---------|------|
| `run_quality_gate.js` | 데이터 품질 게이트 |
| `run_poll_regression.js` | 여론조사 회귀 테스트 |
| `run_news_regression.js` | 뉴스 회귀 테스트 |
| `run_ui_diagnostic.js` | UI 진단 |
| `report_data_health.js` | 데이터 건강 보고서 |
| `check_candidates.py` | 후보 데이터 검증 |
| `cache_bust.sh` | 캐시 버스팅 (CSS/JS 버전 갱신) |

---

## 5. 데이터 흐름도

### 5.1 파이프라인 → JSON → 프론트엔드

```
┌─────────────────────────────────────────────────────────────┐
│                    Python 파이프라인                          │
│                                                             │
│  NESDC 웹 ──→ nesdc_poll_pipeline.py ──→ data/polls/polls.json
│  Claude API ──→ factcheck_*.py ──→ data/candidates/*.json    │
│  Claude API ──→ update_*_overview.py ──→ data/election_overview.json
│  NEC API ──→ fetch_*_status.py ──→ data/candidates/*_status.json
│  뉴스 분석 ──→ derive_local_issues.py ──→ js/derived_issues.js
│  갤럽 ──→ update_gallup.py ──→ data/static/gallup_national_poll.json
│  선관위 ──→ fetch_election_stats.py ──→ data/election_stats.json
│  선관위 ──→ fetch_mayor_history.py ──→ data/mayor_history.json
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    브라우저 로드 순서                         │
│                                                             │
│  1. DataLoader.loadAll()                                    │
│     └─ data/static/*.json (11개) ──→ ElectionData에 hot-swap │
│                                                             │
│  2. App.init()                                              │
│     ├─ ElectionData.loadElectionStats()                     │
│     ├─ ElectionData.loadSuperintendentStatus()              │
│     ├─ ElectionData.loadGovernorStatus()                    │
│     ├─ ElectionData.loadMayorStatus()                       │
│     ├─ ElectionData.loadMayorCandidates()                   │
│     ├─ ElectionData.loadMayorHistory()                      │
│     ├─ ElectionData.loadCouncilMembersData()                │
│     ├─ ElectionData.loadCandidatesData()                    │
│     ├─ ElectionData.loadByElectionData()                    │
│     ├─ ElectionData.loadPollsData()                         │
│     ├─ fetch local_media_pool.json                          │
│     ├─ fetch local_media_registry.json                      │
│     ├─ fetch regional_issues.json                           │
│     └─ MapModule.init()                                     │
│         └─ fetch skorea-provinces-2018-topo.json            │
│                                                             │
│  3. 사용자 상호작용 시 추가 로드                              │
│     ├─ ElectionData.loadElectionOverview() (개요탭)         │
│     ├─ ElectionData.loadCouncilCandidates() (의원 선택 시)  │
│     ├─ IssueEngine.analyzeRegion() (이슈 분석)              │
│     ├─ fetchLatestNews() (뉴스탭) → Worker → Naver API      │
│     └─ MapModule.loadCouncilGeo() (의원 지도)               │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 사용자 이벤트 흐름

```
[지도 클릭]
  ↓
MapModule.handleClick()
  ↓
MapModule.handleRegionSelection(regionKey)
  ↓
App.onRegionSelected(regionKey)
  ├─ governor → renderGovernorView() → 개요/여론조사/후보자/뉴스/역대비교
  ├─ superintendent → renderSuperintendentView()
  ├─ mayor → renderMayorProvinceView() → [시군구 클릭] → onDistrictSelected()
  ├─ council → renderCouncilProvinceView() → [선거구 클릭] → CouncilTab.render()
  ├─ localCouncil → renderLocalCouncilProvinceView() → [선거구 클릭] → CouncilTab.render()
  ├─ councilProportional → renderProportionalView() → ProportionalTab.render()
  ├─ localCouncilProportional → renderProportionalView() → ProportionalTab.render()
  └─ byElection → onByElectionSelected()

[탭 클릭]
  ↓
App.switchTab(tabName)
  ├─ council/localCouncil → CouncilTab.render(tabName, ...)
  ├─ proportional → ProportionalTab.render(tabName, ...)
  ├─ history → HistoryTab.render(...)
  ├─ polls → renderPollTab(...)
  ├─ candidates → renderCandidatesTab(...)
  ├─ news → renderNewsTab(...)
  └─ overview → renderOverviewTab(...)

[선거유형 필터 클릭]
  ↓
App.onElectionTypeChanged(type)
  ↓
MapModule.setElectionType(type)
  ├─ governor → switchToProvinceMap() + 정당색 렌더
  ├─ mayor → switchToDistrictMap()
  ├─ council → switchToCouncilDistrictMap()
  ├─ localCouncil → switchToDistrictMap()
  └─ ...
```

---

## 6. 캐시 아키텍처

### 6.1 인메모리 캐시 (JS)

| 모듈 | 캐시 변수 | 용도 |
|------|-----------|------|
| `DataLoader` | `cache` | data/static/*.json 로드 결과 |
| `ElectionData` | `_mayorCandidatesCache` | 기초단체장 후보 |
| `ElectionData` | `_byElectionCache` | 재보궐 데이터 |
| `ElectionData` | `_overviewCache` | 선거 쟁점 개요 |
| `ElectionData` | `_mayorHistoryCache` | 기초단체장 역대 |
| `ElectionData` | `_pollsCache` | 여론조사 데이터 |
| `ElectionData` | `_proportionalCouncilCache` | 광역비례 데이터 |
| `ElectionData` | `_proportionalLocalCouncilCache` | 기초비례 데이터 |
| `ElectionData` | `_councilMembersCache` | 의원 현직 데이터 |
| `MapModule` | `districtGeoCache` | 시군구 GeoJSON |
| `MapModule` | `councilGeoCache` | 광역의원 선거구 GeoJSON |
| `MapModule` | `councilTopoCache` | 광역의원 선거구 raw TopoJSON |
| `NECData` | `cache` (Map) | NEC API 응답 |
| `NECData` | `inflight` (Map) | 진행 중 요청 (중복 방지) |
| `IssueEngine` | `cache` | 이슈 분석 결과 (TTL 6시간) |
| `ProportionalTab` | `_historyCache` | 비례 역대 데이터 |
| `CouncilTab` | `_dongCache` | 선거구-읍면동 매핑 |

### 6.2 sessionStorage 캐시

| 키 패턴 | 용도 | TTL |
|---------|------|-----|
| `news_{regionKey}_{catId}` | 뉴스 검색 결과 | 2시간 |

### 6.3 Cloudflare Cache API (Worker)

| 키 | 용도 | TTL |
|----|------|-----|
| `/api/news?query=...` | 네이버 뉴스 API 응답 | 30분 |

---

## 7. 전역 모듈 의존성 그래프

```
window.NewsFilterConfig  ←──── app.js (NEWS_FILTER_CONFIG)
window.DerivedIssuesData ←──── app.js (renderRegionIssuesHtml)
window.IssueEngine       ←──── app.js (renderOverviewTab)
window.LocalMediaPool    ←──── app.js (init에서 설정)
window.LocalMediaRegistry←──── app.js (init에서 설정, 뉴스 지역성 점수)
window.REGIONAL_ISSUES   ←──── app.js (init에서 설정, 뉴스 키워드)

DataLoader ──→ ElectionData (applyToElectionData)
ElectionData ──→ App, MapModule, ChartsModule, HistoryTab, CouncilTab, ProportionalTab, NECData
MapModule ──→ App (콜백: onRegionSelected 등)
App ──→ MapModule, ChartsModule, ElectionCalendar, HistoryTab, CouncilTab, ProportionalTab, NECData
ChartsModule ──→ ElectionData (getPartyColor)
HistoryTab ──→ ElectionData (getHistoricalData, getPartyColor 등)
CouncilTab ──→ ElectionData (getCouncilCandidates, loadCouncilCandidates)
ProportionalTab ──→ ElectionData (getProportionalData, getProportionalCandidates)
NECData ──→ (독립, 외부 API만 의존)
ElectionCalendar ──→ (완전 독립, DATES + getKST()만 사용)
```

---

## 8. 주요 설계 패턴

1. **Revealing Module Pattern**: 모든 JS 모듈이 IIFE로 캡슐화. `const Module = (() => { return { ... }; })()` 패턴 사용.

2. **Hot-swap 데이터**: `data.js`의 하드코딩 데이터를 `data-loader.js`가 외부 JSON으로 덮어쓰기. 실패해도 기존 데이터 fallback.

3. **Lazy Loading**: 뉴스탭은 클릭 시에만 API 호출 (`_newsTabPendingRegion`). 의원 후보 데이터도 선택 시 로드.

4. **법적 로직 분리**: `ElectionCalendar.isPublicationBanned()`는 다른 어떤 함수에도 의존하지 않음. DATES + getKST()만 사용.

5. **선거유형별 위임**: `council`/`localCouncil` → `CouncilTab`, `*Proportional` → `ProportionalTab`, `history` → `HistoryTab`으로 렌더링 위임.

6. **캐시 계층**: 인메모리(JS) → sessionStorage(뉴스) → CDN Cache(Worker) 3단계.

7. **Mock Fallback**: 실제 데이터가 없을 때 `generateMockElectionData()`가 seeded random으로 시뮬레이션 데이터 생성. `isSimulation: true` 플래그.
