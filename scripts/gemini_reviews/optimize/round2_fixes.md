# Round 2: 수정 코드
생성: 2026-03-11 00:14 | 모델: gemini-2.5-flash

---

제공해주신 Round 1 분석 결과에 따라, 각 문제점에 대한 **실제로 적용 가능한 수정 코드**와 설명을 제공합니다. 기존 코드 구조(IIFE 모듈 패턴, 빌드 도구 없음)에 맞춰 작성되었습니다.

---

## 1. HIGH 우선순위 항목 즉시 수정 코드

### A.1 `map.js` - `updateMapColors` 내 이벤트 리스너 중복 추가/관리 비효율

*   **파일명:** `map.js`
*   **문제:** `updateMapColors` 호출 시 `region-disabled` 상태에 따라 이벤트 리스너가 중복 추가될 수 있으며, 비활성 상태에서 벗어날 때 명시적으로 제거되지 않아 메모리 누수가 발생할 수 있습니다. 툴팁 요소를 반복적으로 쿼리하는 것도 비효율적입니다.
*   **수정 전:** (약 202-217줄 예상, `MapModule` IIFE 내부)
    ```javascript
    // ... (updateMapColors 함수 내부)
    if ((currentElectionType === 'localCouncil' || currentElectionType === 'localCouncilProportional') &&
        (key === 'sejong' || key === 'jeju')) {
        el.classed('region-disabled', true)
            .transition().duration(400).attr('fill', '#2a2a3a');
        el.on('mouseover.disabled', function(event) {
            const tooltip = document.getElementById('map-tooltip'); // 반복 쿼리
            if (!tooltip) return;
            tooltip.innerHTML = '기초의회가 없는 지역입니다';
            tooltip.classList.add('active');
            tooltip.style.left = event.pageX + 'px';
            tooltip.style.top = (event.pageY - 30) + 'px';
        }).on('mouseout.disabled', function() {
            const tooltip = document.getElementById('map-tooltip'); // 반복 쿼리
            if (tooltip) tooltip.classList.remove('active');
        });
    } else {
        el.classed('region-disabled', false)
            .transition().duration(400).attr('fill', getRegionColor(key));
        // el.on('mouseover.disabled', null).on('mouseout.disabled', null); <-- 명시적인 제거 로직 부재
    }
    // ...
    ```
*   **수정 후:** (가정: `MapModule`은 IIFE 패턴으로 구성되어 있으며, `init` 함수가 존재합니다.)
    ```javascript
    // map.js 파일 내 MapModule IIFE 상단 또는 적절한 초기화 위치에 추가
    let _mapTooltipElement; // 툴팁 요소를 캐싱할 변수

    // MapModule의 init 함수 (또는 모듈 초기화 로직)
    function initMap() { // 'init' 같은 이름으로 가정
        _mapTooltipElement = document.getElementById('map-tooltip'); // 툴팁 요소 캐싱
        // ... (기존 MapModule 초기화 로직)
    }

    // ... (updateMapColors 함수 내부)
    if ((currentElectionType === 'localCouncil' || currentElectionType === 'localCouncilProportional') &&
        (key === 'sejong' || key === 'jeju')) {
        el.classed('region-disabled', true)
            .transition().duration(400).attr('fill', '#2a2a3a'); // 하드코딩된 색상도 개선 필요 (C.2)

        // 캐싱된 툴팁 요소를 사용
        el.on('mouseover.disabled', function(event) {
            if (!_mapTooltipElement) return; // 캐싱 실패 시 예외 처리
            _mapTooltipElement.innerHTML = '기초의회가 없는 지역입니다'; // B.1 메시지 상수로 분리 가능
            _mapTooltipElement.classList.add('active');
            _mapTooltipElement.style.left = event.pageX + 'px';
            _mapTooltipElement.style.top = (event.pageY - 30) + 'px';
        }).on('mouseout.disabled', function() {
            if (_mapTooltipElement) _mapTooltipElement.classList.remove('active');
        });
    } else {
        el.classed('region-disabled', false)
            .transition().duration(400).attr('fill', getRegionColor(key));
        // 비활성 상태에서 벗어날 때 명시적으로 명명된 이벤트 리스너 제거
        el.on('mouseover.disabled', null).on('mouseout.disabled', null);
    }
    // ...
    ```
*   **효과:**
    *   `map-tooltip` 요소를 한 번만 쿼리하여 DOM 접근 비용을 줄입니다.
    *   `else` 블록에서 `null`을 사용하여 명명된 이벤트 리스너를 명시적으로 제거함으로써, 해당 지역이 더 이상 비활성화되지 않을 때 불필요한 이벤트 리스너가 메모리에 남아있지 않도록 하여 메모리 누수를 방지합니다. D3의 `.on()` 메서드는 동일한 이름을 가진 리스너를 덮어쓰거나 `null`로 제거할 수 있습니다.

### A.2 `app.js` - 뉴스 점수 알고리즘(`calcCredibilityScore`, `autoTagSubTabs`)의 비효율

*   **파일명:** `app.js`
*   **문제:** `NEWS_FILTER_CONFIG`의 배열을 순회하며 `String.prototype.includes()`를 반복적으로 호출하는 것은 뉴스 기사 수가 많아질수록 성능 저하를 야기합니다.
*   **수정 전:** (가정: `app.js` 파일 내 `AppModule` IIFE 내부)
    ```javascript
    // app.js_5_news_scoring (약 1-70줄 예상)
    // NEWS_FILTER_CONFIG 선언 부분
    const NEWS_FILTER_CONFIG = {
        credibilityTiers: {
            regional: {
                tier1: ['tier1_host1', 'tier1_host2'], // 문자열 배열
                tier2: ['tier2_host1', 'tier2_host2'],
            },
            national: { /* ... */ }
        },
        subTabKeywords: {
            'tab1': ['keyword1', 'keyword2'], // 문자열 배열
            'tab2': ['keywordA', 'keywordB'],
        }
    };

    // calcCredibilityScore 함수
    function calcCredibilityScore(host) {
        // ...
        if ((NEWS_FILTER_CONFIG.credibilityTiers.regional.tier1 || []).some(d => host.includes(d))) return scores.tier1;
        // ... (national tiers도 유사한 .some + .includes 패턴)
    }

    // autoTagSubTabs 함수
    function autoTagSubTabs(text) {
        const tags = [];
        const keywords = NEWS_FILTER_CONFIG.subTabKeywords;
        Object.entries(keywords).forEach(([tab, words]) => {
            if (words.some(w => text.includes(w.toLowerCase()))) tags.push(tab);
        });
        return tags;
    }

    // 뉴스 데이터 처리 시점
    // fetch된 newsItems 배열을 순회하며 점수 계산 및 태그 생성
    // newsItems.forEach(news => {
    //     news.credibilityScore = calcCredibilityScore(news.host);
    //     news.tags = autoTagSubTabs(news.content);
    // });
    ```
*   **수정 후:**
    ```javascript
    // app.js 파일 내 AppModule IIFE 상단 또는 적절한 초기화 위치에 추가
    // NEWS_FILTER_CONFIG 전처리된 버전
    let PROCESSED_NEWS_FILTER_CONFIG;

    function _preprocessNewsConfig() {
        const config = {
            credibilityTiers: {
                regional: {},
                national: {}
            },
            subTabKeywords: {}
        };

        // credibilityTiers (host.includes) -> 하나의 거대한 정규식으로 합병
        // 예: ['naver.com', 'daum.net'] -> /(naver\.com|daum\.net)/i
        const compileRegex = (tierList) => {
            if (!tierList || tierList.length === 0) return null;
            // 정규식 특수 문자를 이스케이프하고 'OR'로 연결
            const pattern = tierList.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
            return new RegExp(pattern, 'i'); // 대소문자 무시
        };

        ['regional', 'national'].forEach(type => {
            ['tier1', 'tier2', 'tier3', 'tier4', 'tier5'].forEach(tier => { // 모든 티어에 대해
                const tierHosts = NEWS_FILTER_CONFIG.credibilityTiers[type][tier];
                if (tierHosts && tierHosts.length > 0) {
                    config.credibilityTiers[type][tier] = compileRegex(tierHosts);
                }
            });
        });

        // subTabKeywords (text.includes) -> 각 탭별로 하나의 거대한 정규식으로 합병
        // 예: ['비례대표', '국회의원'] -> /(비례대표|국회의원)/i
        Object.entries(NEWS_FILTER_CONFIG.subTabKeywords).forEach(([tab, words]) => {
            if (words && words.length > 0) {
                config.subTabKeywords[tab] = compileRegex(words);
            }
        });

        PROCESSED_NEWS_FILTER_CONFIG = config;
    }

    // AppModule의 init 함수 (또는 모듈 초기화 로직)에서 _preprocessNewsConfig 호출
    function initApp() { // 'init' 같은 이름으로 가정
        _preprocessNewsConfig(); // 초기 로딩 시점에 전처리 수행
        // ... (기존 AppModule 초기화 로직)
    }

    // calcCredibilityScore 함수 수정
    function calcCredibilityScore(host) {
        const { credibilityTiers } = PROCESSED_NEWS_FILTER_CONFIG;
        const { regional, national } = credibilityTiers;
        const scores = { tier1: 5, tier2: 4, tier3: 3, tier4: 2, tier5: 1 }; // 예시 점수

        // 정규식 test() 메서드를 사용하여 효율적인 매칭
        if (regional.tier1 && regional.tier1.test(host)) return scores.tier1;
        if (regional.tier2 && regional.tier2.test(host)) return scores.tier2;
        // ... 모든 regional tiers
        if (national.tier1 && national.tier1.test(host)) return scores.tier1;
        if (national.tier2 && national.tier2.test(host)) return scores.tier2;
        // ... 모든 national tiers

        return 0; // 기본 점수
    }

    // autoTagSubTabs 함수 수정
    function autoTagSubTabs(text) {
        const tags = [];
        const { subTabKeywords } = PROCESSED_NEWS_FILTER_CONFIG;
        const lowerCaseText = text.toLowerCase(); // 한 번만 소문자로 변환

        Object.entries(subTabKeywords).forEach(([tab, regex]) => {
            if (regex && regex.test(lowerCaseText)) { // 전처리된 정규식 사용
                tags.push(tab);
            }
        });
        return tags;
    }

    // 뉴스 데이터 로딩 및 처리 시점 (예: renderNewsTab 또는 뉴스 데이터 fetch 콜백)
    function processNewsData(newsItems) { // 뉴스 데이터를 받아서 처리하는 함수라고 가정
        newsItems.forEach(news => {
            // 점수를 한 번만 계산하여 뉴스 객체에 캐싱
            news.credibilityScore = calcCredibilityScore(news.host);
            news.tags = autoTagSubTabs(news.content);
            // news.timeScore = calcTimeScore(news.timestamp); // 필요 시 calcTimeScore도 계산하여 캐싱
        });
        return newsItems;
    }
    ```
*   **효과:**
    *   **전처리:** 애플리케이션 초기 로딩 시점에 `NEWS_FILTER_CONFIG`의 모든 키워드 배열을 하나의 거대한 `RegExp` 객체로 변환합니다. 이는 `String.prototype.includes()`를 반복 호출하는 것보다 훨씬 효율적입니다.
    *   **효율적인 매칭:** 각 뉴스 아이템에 대해 `RegExp.prototype.test()`를 한두 번만 호출하여 문자열 매칭 성능을 크게 향상시킵니다.
    *   **점수 캐싱:** `credibilityScore`와 `tags`를 뉴스 아이템 객체 자체에 속성으로 저장하여, 뉴스 목록이 정렬되거나 필터링될 때마다 재계산할 필요 없이 이미 계산된 값을 재활용합니다. 이는 렌더링 성능에 직접적인 영향을 미칩니다.

---

## 2. MED 우선순위 - 공통 유틸 함수 제안

### A.3 `map.js` - `MULTI_GU_SINGLE_MAYOR_CITIES` 탐색 비효율

*   **파일명:** `map.js`
*   **문제:** `MULTI_GU_SINGLE_MAYOR_CITIES` 배열을 `some`, `find`, `filter`로 선형 탐색하여 비효율적입니다.
*   **수정 전:** (약 114-162줄, 10-14줄 예상)
    ```javascript
    // map.js_1_constants_color 또는 다른 초기화 부분
    const MULTI_GU_SINGLE_MAYOR_CITIES = [
        { regionKey: 'seoul', cityName: '서울특별시', guMatchFn: (raw) => raw.startsWith('강'), aliasPattern: /강남|강북/ },
        { regionKey: 'busan', cityName: '부산광역시', guMatchFn: (raw) => raw.startsWith('북'), aliasPattern: /북구/ },
        // ...11개 항목
    ];

    // isMergedGuDistrict 함수 예시
    function isMergedGuDistrict(regionKey, districtName) {
        // ...
        return MULTI_GU_SINGLE_MAYOR_CITIES.some(
            cfg => cfg.regionKey === regionKey && cfg.guMatchFn(String(districtName || ''))
        );
    }

    // getEffectiveDistrictName 함수 예시
    function getEffectiveDistrictName(regionKey, districtName) {
        // ...
        const cfg = MULTI_GU_SINGLE_MAYOR_CITIES.find(
            c => c.regionKey === regionKey && (c.guMatchFn(raw) || c.aliasPattern.test(raw))
        );
        // ...
    }

    // getBasicCouncilSigungu 함수 예시 (map.js_3_getBasicCouncilSigungu)
    function getBasicCouncilSigungu(regionKey, districtName) {
        const candidates = regionKey
            ? MULTI_GU_SINGLE_MAYOR_CITIES.filter(c => c.regionKey === regionKey)
            : MULTI_GU_SINGLE_MAYOR_CITIES;
        for (const cfg of candidates) {
            if (cfg.guMatchFn(districtName)) return cfg.cityName;
        }
        return null;
    }
    ```
*   **수정 후:** (가정: `MapModule` IIFE 내부)
    ```javascript
    // map.js 파일 내 MapModule IIFE 상단 또는 적절한 초기화 위치에 추가
    const _MULTI_GU_SINGLE_MAYOR_CITIES_RAW = [
        { regionKey: 'seoul', cityName: '서울특별시', guMatchFn: (raw) => raw.startsWith('강'), aliasPattern: /강남|강북/ },
        { regionKey: 'busan', cityName: '부산광역시', guMatchFn: (raw) => raw.startsWith('북'), aliasPattern: /북구/ },
        // ...기존 MULTI_GU_SINGLE_MAYOR_CITIES 내용
    ];

    // 초기 로딩 시점에 Map 형태로 변환 (MapModule 초기화 함수 내부에서 호출)
    let _mergedCityConfigMap; // Map<string, Array<Object>>

    function initMergedCityConfigMap() {
        _mergedCityConfigMap = new Map();
        _MULTI_GU_SINGLE_MAYOR_CITIES_RAW.forEach(cfg => {
            if (!_mergedCityConfigMap.has(cfg.regionKey)) {
                _mergedCityConfigMap.set(cfg.regionKey, []);
            }
            _mergedCityConfigMap.get(cfg.regionKey).push(cfg);
        });
    }
    // MapModule.init() 함수에서 initMergedCityConfigMap() 호출 필요

    // isMergedGuDistrict 함수 수정
    function isMergedGuDistrict(regionKey, districtName) {
        // currentElectionType 조건은 외부에서 판단하여 이 함수 호출 전 필터링하는 것이 더 깔끔할 수 있습니다.
        // if (currentElectionType !== 'mayor') return false; // 이 로직이 있다면 그대로 유지

        const raw = String(districtName || '');
        const configs = _mergedCityConfigMap.get(regionKey); // O(1) 조회
        if (!configs) return false;
        return configs.some(cfg => cfg.guMatchFn(raw)); // 해당 regionKey에 대한 배열만 순회
    }

    // getEffectiveDistrictName 함수 수정
    function getEffectiveDistrictName(regionKey, districtName) {
        const raw = String(districtName || '');
        const configs = _mergedCityConfigMap.get(regionKey); // O(1) 조회
        if (!configs) return null; // 또는 적절한 기본값

        const cfg = configs.find(
            c => c.guMatchFn(raw) || c.aliasPattern.test(raw)
        );
        return cfg ? cfg.cityName : null; // 또는 적절한 기본값
    }

    // getBasicCouncilSigungu 함수 수정 (재활용 리팩토링됨)
    function getBasicCouncilSigungu(regionKey, districtName) {
        const configs = _mergedCityConfigMap.get(regionKey); // O(1) 조회
        if (!configs) return null;

        for (const cfg of configs) { // 해당 regionKey에 대한 배열만 순회
            if (cfg.guMatchFn(districtName)) return cfg.cityName;
        }
        return null;
    }
    ```
*   **효과:** `MULTI_GU_SINGLE_MAYOR_CITIES` 데이터를 초기 로딩 시점에 `regionKey`를 키로 하는 `Map` 형태로 변환합니다. 이렇게 하면 `regionKey`에 따른 조회는 평균 `O(1)` 시간이 소요되어, 데이터 양이 늘어나더라도 성능 저하가 적습니다. 이후 해당 `regionKey`에 해당하는 작은 배열만 순회하게 되어 전체적인 탐색 효율이 크게 향상됩니다.

### A.4 `app.js` - `ElectionData.getRegion(regionKey)` 등 반복 호출

*   **파일명:** `app.js`
*   **문제점:** `App.onRegionSelected`에서 `regionKey`를 받아 여러 탭 렌더링 함수에서 `ElectionData.getRegion(regionKey)`를 중복 호출합니다.
*   **수정 전:** (약 1-3줄, 2-3줄, 72-74줄 예상, `AppModule` IIFE 내부)
    ```javascript
    // App.onRegionSelected 함수 내부
    function onRegionSelected(regionKey) {
        // ...
        renderCandidatesTab(regionKey);
        renderHistoryTab(regionKey);
        renderNewsTab(regionKey);
        // ...
    }

    // renderCandidatesTab 함수
    function renderCandidatesTab(regionKey) {
        const region = ElectionData.getRegion(regionKey); // 중복 호출
        if (!region) return;
        // ...
    }

    // renderHistoryTab 함수
    function renderHistoryTab(regionKey) {
        const region = ElectionData.getRegion(regionKey); // 중복 호출
        const history = ElectionData.getHistoricalData(regionKey);
        if (!region || !history || history.length === 0) return;
        // ...
    }

    // renderNewsTab 함수
    function renderNewsTab(regionKey) {
        const region = ElectionData.getRegion(regionKey); // 중복 호출
        if (!region) return;
        // ...
    }
    ```
*   **수정 후:**
    ```javascript
    // App.onRegionSelected 함수 수정
    function onRegionSelected(regionKey) {
        const region = ElectionData.getRegion(regionKey); // region 객체를 한 번만 조회
        if (!region) {
            console.warn(`Region data not found for key: ${regionKey}`);
            return;
        }

        // 각 탭 렌더링 함수에 region 객체를 인자로 전달
        renderCandidatesTab(regionKey, region);
        renderHistoryTab(regionKey, region);
        renderNewsTab(regionKey, region);
        // ...
    }

    // renderCandidatesTab 함수 수정 (인자 추가)
    function renderCandidatesTab(regionKey, region) { // region 객체 받음
        // if (!region) return; // onRegionSelected에서 이미 체크했으므로 여기서는 불필요 (하지만 방어적으로 유지 가능)
        // ... region 객체를 직접 사용 ...
    }

    // renderHistoryTab 함수 수정 (인자 추가)
    function renderHistoryTab(regionKey, region) { // region 객체 받음
        const history = ElectionData.getHistoricalData(regionKey);
        if (!region || !history || history.length === 0) return;
        // ... region 객체를 직접 사용 ...
    }

    // renderNewsTab 함수 수정 (인자 추가)
    function renderNewsTab(regionKey, region) { // region 객체 받음
        // if (!region) return; // onRegionSelected에서 이미 체크했으므로 여기서는 불필요
        // ... region 객체를 직접 사용 ...
    }
    ```
*   **효과:** `ElectionData.getRegion(regionKey)` 호출을 한 번으로 줄여 불필요한 함수 호출 및 객체 조회를 방지합니다. 또한, 함수 인자를 통해 필요한 데이터를 명시적으로 전달함으로써 코드의 명확성을 높입니다.

### B.1 `map.js` 및 `app.js` - 세종/제주 기초의원 비활성 처리 로직 중복

*   **파일명:** `map.js`, `app.js`
*   **문제:** 세종/제주 지역의 기초의원 비활성 처리 로직(`regionKey === 'sejong' || regionKey === 'jeju'`)이 여러 곳에 중복되어 유지보수를 어렵게 합니다.
*   **수정 전:** (여러 파일 및 위치에 분산되어 있음)
    ```javascript
    // map.js_1_constants_color: getRegionColor 함수
    // ...
    if (currentElectionType === 'localCouncil' && (key === 'sejong' || key === 'jeju')) { /* ... */ }

    // map.js_2_selection_logic: updateMapColors 함수
    // ...
    if ((currentElectionType === 'localCouncil' || currentElectionType === 'localCouncilProportional') &&
        (key === 'sejong' || key === 'jeju')) { /* ... */ }

    // map.js_4_tooltip_localCouncil: renderTooltipContent 함수
    // ...
    if (currentElectionType === 'localCouncil' && (regionKey === 'sejong' || regionKey === 'jeju')) {
        return "기초의회가 없는 지역입니다.";
    }

    // app.js_1_localCouncilView: renderLocalCouncilProvinceView 함수
    // ...
    if (currentElectionType === 'localCouncil' && (regionKey === 'sejong' || regionKey === 'jeju')) {
        updatePanel(`선택하신 ${regionName}은 기초의원이 없습니다.`);
        return;
    }
    ```
*   **수정 후:** (가정: `MapModule`과 `AppModule`이 `ElectionData` 모듈에 접근 가능)
    ```javascript
    // data.js (ElectionData 모듈 내부) 또는 util.js 같은 공통 유틸 파일에 추가
    var ElectionData = (function() {
        // ... 기존 ElectionData 로직

        const BASIC_COUNCIL_DISABLED_REGIONS = new Set(['sejong', 'jeju']); // Set으로 조회 효율 높임
        const BASIC_COUNCIL_DISABLED_MESSAGE = '기초의회가 없는 지역입니다.';

        function isBasicCouncilDisabled(regionKey, electionType = currentElectionType) { // currentElectionType은 전역 변수일 가능성
            return (electionType === 'localCouncil' || electionType === 'localCouncilProportional') &&
                   BASIC_COUNCIL_DISABLED_REGIONS.has(regionKey);
        }

        function getBasicCouncilDisabledMessage() {
            return BASIC_COUNCIL_DISABLED_MESSAGE;
        }

        return {
            // ... 기존 반환 객체
            isBasicCouncilDisabled: isBasicCouncilDisabled,
            getBasicCouncilDisabledMessage: getBasicCouncilDisabledMessage,
        };
    })();

    // map.js_2_selection_logic: updateMapColors 함수 수정
    // ...
    if (ElectionData.isBasicCouncilDisabled(key)) { // currentElectionType이 전역 변수로 MapModule에 접근 가능하다고 가정
        el.classed('region-disabled', true)
            .transition().duration(400).attr('fill', '#2a2a3a');
        el.on('mouseover.disabled', function(event) {
            if (!_mapTooltipElement) return;
            _mapTooltipElement.innerHTML = ElectionData.getBasicCouncilDisabledMessage();
            _mapTooltipElement.classList.add('active');
            _mapTooltipElement.style.left = event.pageX + 'px';
            _mapTooltipElement.style.top = (event.pageY - 30) + 'px';
        }).on('mouseout.disabled', function() {
            if (_mapTooltipElement) _mapTooltipElement.classList.remove('active');
        });
    } else {
        el.classed('region-disabled', false)
            .transition().duration(400).attr('fill', getRegionColor(key));
        el.on('mouseover.disabled', null).on('mouseout.disabled', null);
    }
    // ...

    // map.js_4_tooltip_localCouncil: renderTooltipContent 함수 수정 (일부)
    function renderTooltipContent(regionKey, electionType) {
        if (ElectionData.isBasicCouncilDisabled(regionKey, electionType)) {
            return ElectionData.getBasicCouncilDisabledMessage();
        }
        // ... 기존 로직
    }

    // app.js_1_localCouncilView: renderLocalCouncilProvinceView 함수 수정
    function renderLocalCouncilProvinceView(regionKey, regionName, electionType = currentElectionType) { // electionType 인자로 받도록
        if (ElectionData.isBasicCouncilDisabled(regionKey, electionType)) {
            // updatePanel은 가정된 함수. 실제 함수명에 맞게 변경.
            updatePanelHtml('panel-section-candidates', `선택하신 ${regionName}은 ${ElectionData.getBasicCouncilDisabledMessage()}`);
            return;
        }
        // ... 기존 로직
    }
    ```
*   **효과:** 비활성 지역 판단 로직과 메시지를 `ElectionData` 모듈에 캡슐화하여 중복 코드를 제거하고, 한 곳에서만 수정하면 되도록 유지보수성을 향상시킵니다. `Set`을 사용하여 `regionKey` 조회 효율을 높입니다.

### B.2 `map.js` - `getRegionKey`, `getDistrictName`, `getPropValue`의 반복 패턴

*   **파일명:** `map.js`
*   **문제:** `nameMapping`과 `engMap`이 배열 형태로 되어 있어 `getRegionKey` 내부에서 선형 탐색이 발생할 수 있습니다.
*   **수정 전:** (약 72-97줄)
    ```javascript
    // map.js_1_constants_color
    const nameMapping = [
        { pattern: /서울/, key: 'seoul' },
        { pattern: /부산/, key: 'busan' },
        // ...
    ];
    const engMap = [
        { pattern: /Sejong/, key: 'sejong' },
        { pattern: /Jeju/, key: 'jeju' },
        // ...
    ];

    function getRegionKey(feature, electionType, selectedProvinceKey = '') {
        const props = feature.properties;
        let regionName = getPropValue(props, ['SIG_KOR_NM', 'name', 'NAME', 'ADM_DR_NM']);
        // ...
        for (const map of nameMapping) { // 선형 탐색
            if (map.pattern.test(regionName)) return map.key;
        }
        // ...
        for (const map of engMap) { // 선형 탐색
            if (map.pattern.test(regionName)) return map.key;
        }
        // ...
    }
    ```
*   **수정 후:** (가정: `MapModule` IIFE 내부)
    ```javascript
    // map.js 파일 내 MapModule IIFE 상단 또는 적절한 초기화 위치에 추가
    // 원본 데이터는 내부 변수로 유지하거나, 필요시 외부 상수로 분리
    const _NAME_MAPPING_RAW = [
        { pattern: /서울/, key: 'seoul' },
        { pattern: /부산/, key: 'busan' },
        // ... 기존 nameMapping 내용
    ];
    const _ENG_MAP_RAW = [
        { pattern: /Sejong/, key: 'sejong' },
        { pattern: /Jeju/, key: 'jeju' },
        // ... 기존 engMap 내용
    ];

    // 전처리된 Map 객체 (정규식 패턴을 키로 직접 매핑하는 대신, key를 기준으로 Map을 만들어 매핑 규칙을 저장)
    // 이 경우, '패턴'에 대한 검색은 여전히 필요하지만, '키'로의 변환 로직이 명확해짐
    // 더 나은 방법은 패턴을 key로 하는 Map을 만들 수 있다면 좋겠지만, Regexp 객체는 key로 사용하기 적합하지 않음.
    // 여기서는 기존 패턴 기반 검색은 유지하되, nameMapping/engMap을 함수로 대체하여 가독성 개선
    let _compiledNameMappingFns;
    let _compiledEngMapFns;

    function initRegionNameMappings() {
        // 함수 배열로 변환하여 map.pattern.test(regionName) 로직을 캡슐화
        _compiledNameMappingFns = _NAME_MAPPING_RAW.map(item =>
            (regionName) => item.pattern.test(regionName) ? item.key : null
        );
        _compiledEngMapFns = _ENG_MAP_RAW.map(item =>
            (regionName) => item.pattern.test(regionName) ? item.key : null
        );
    }
    // MapModule.init() 함수에서 initRegionNameMappings() 호출 필요

    // getRegionKey 함수 수정
    function getRegionKey(feature, electionType, selectedProvinceKey = '') {
        const props = feature.properties;
        let regionName = getPropValue(props, ['SIG_KOR_NM', 'name', 'NAME', 'ADM_DR_NM']);

        // ...
        // 개선: 패턴 매칭 함수를 순회하여 첫 번째 일치하는 키 반환
        for (const mapFn of _compiledNameMappingFns) {
            const key = mapFn(regionName);
            if (key) return key;
        }
        // ...
        for (const mapFn of _compiledEngMapFns) {
            const key = mapFn(regionName);
            if (key) return key;
        }
        // ... (나머지 기존 로직 유지)
        return null; // 또는 적절한 기본값
    }

    // getPropValue 함수는 그대로 유지
    function getPropValue(props, keys) {
        for (const key of keys) {
            if (props[key]) return props[key];
        }
        return null;
    }
    ```
*   **효과:** `nameMapping`과 `engMap`을 초기화 시점에 함수 배열로 변환하여 코드의 가독성을 높이고, `getRegionKey` 내부에서 매핑 로직을 깔끔하게 처리할 수 있습니다. `RegExp` 객체 자체를 `Map` 키로 사용할 수 없으므로, 패턴 매칭 기반 검색 자체의 근본적인 성능 개선보다는 가독성과 관리 편의성에 중점을 둡니다. (가장 좋은 방법은 원본 GeoJSON 데이터가 표준화된 단일 속성 키를 가지는 것입니다.)

### D.3 비례대표 렌더링 시 동일 데이터 중복 fetch 여부

*   **파일명:** `data.js`
*   **문제:** `currentElectionType`이 `'proportionalCouncil'`과 `'council'`일 때 `ElectionData.getProportionalCouncilRegion(key)`를 중복 호출할 가능성이 있습니다. 이 함수가 비용이 큰 작업이라면 비효율적입니다.
*   **수정 전:** (가정: `ElectionData` 모듈 내부)
    ```javascript
    // ElectionData 모듈 내부
    var ElectionData = (function() {
        // ...
        function getProportionalCouncilRegion(regionKey) {
            // ... (실제 데이터 fetch 또는 비용이 드는 계산 로직)
            console.log(`Fetching proportional council data for ${regionKey}`); // 예시 로그
            // return someData;
            return { name: regionKey + ' 비례대표 데이터' }; // 임시 반환
        }

        return {
            // ...
            getProportionalCouncilRegion: getProportionalCouncilRegion,
        };
    })();
    ```
*   **수정 후:**
    ```javascript
    // data.js (ElectionData 모듈 내부)
    var ElectionData = (function() {
        // ... 기존 ElectionData 로직

        let _proportionalCouncilCache = new Map(); // 캐싱을 위한 Map 객체

        async function getProportionalCouncilRegion(regionKey) {
            // 캐시에 데이터가 있으면 즉시 반환
            if (_proportionalCouncilCache.has(regionKey)) {
                return _proportionalCouncilCache.get(regionKey);
            }

            // 캐시에 없으면 실제 데이터 fetch 또는 계산 수행 (비동기 작업이라면 async/await 사용)
            console.log(`Fetching proportional council data for ${regionKey}`); // 실제 fetch 로직이 있다면 주석 해제

            // --- 실제 데이터 로직 ---
            // 예를 들어, JSON 파일 로드나 복잡한 계산
            // const data = await fetch(`/data/proportional/${regionKey}.json`).then(res => res.json());
            const data = { name: regionKey + ' 비례대표 데이터' }; // 임시 반환
            // --- 실제 데이터 로직 끝 ---

            // 데이터를 캐시에 저장 후 반환
            _proportionalCouncilCache.set(regionKey, data);
            return data;
        }

        return {
            // ... 기존 반환 객체
            getProportionalCouncilRegion: getProportionalCouncilRegion,
        };
    })();
    ```
*   **효과:** `_proportionalCouncilCache`를 사용하여 한 번 조회된 비례대표 데이터를 캐싱합니다. 동일한 `regionKey`로 함수가 다시 호출될 경우, 실제 데이터 처리 없이 캐싱된 데이터를 즉시 반환하여 성능을 향상시킵니다. (만약 원본 함수가 `Promise`를 반환하는 비동기 함수라면 캐시도 `Promise`를 저장하도록 구현해야 합니다.)

---

## 3. CSS 개선안

### C.1 `style.css` - `!important` 과다 사용

*   **파일명:** `style.css`
*   **문제:** `.region-disabled`에 `!important`가 과도하게 사용되어 우선순위 관리를 어렵게 합니다. 특히 D3 `.attr('fill', ...)`은 인라인 스타일로 높은 우선순위를 가지기 때문에, 이를 오버라이드하려면 `!important`가 필요할 수 있지만, `hover` 같은 경우는 불필요할 수 있습니다.
*   **수정 전:** (약 2-3줄)
    ```css
    .region-disabled {
        fill: #2a2a3a !important;
        cursor: not-allowed !important;
        opacity: 0.5;
    }
    .region-disabled:hover {
        fill: #2a2a3a !important; /* 이 부분 불필요 가능성 높음 */
    }
    ```
*   **수정 후:**
    ```css
    /* 기존 .region-disabled 스타일은 그대로 유지합니다. 
       D3 .attr('fill', ...)가 인라인 스타일로 적용될 경우, 
       이를 덮어쓰기 위해 .region-disabled에 !important가 필요할 수 있습니다.
       여기서는 !important 제거가 불가능한 경우를 가정하고, 불필요한 hover 부분을 제거합니다. */
    .region-disabled {
        fill: #2a2a3a !important; /* D3 인라인 fill을 오버라이드할 목적이라면 유지 */
        cursor: not-allowed !important;
        opacity: 0.5;
    }
    /* .region-disabled:hover 에서의 !important 제거
       부모 선택자를 활용하여 specificity를 높입니다. 
       예를 들어, #map-container 내부에 .region이 있다면: */
    #map-container .region.region-disabled:hover {
        fill: #2a2a3a; /* !important 제거 */
        /* opacity는 상속되므로 별도 지정 불필요 */
    }
    /* 또는, 더 간단하게 기존 .region-disabled 자체의 hover 스타일 제거 */
    /* .region-disabled:hover { fill: #2a2a3a; } // 불필요하다면 이 규칙 자체를 제거 */
    ```
*   **효과:** `.region-disabled:hover`에 대한 불필요한 `!important`를 제거하여 CSS 우선순위 관리를 개선합니다. `fill` 속성의 경우, D3가 인라인 스타일로 직접 제어하고 있다면 `.attr('fill', '#2a2a3a')`처럼 명시적으로 설정된 값을 CSS로 `!important` 없이 덮어쓰기 어렵습니다. 따라서 D3 코드 내에서 `attr('fill', ...)`를 제거하거나, CSS 우선순위를 더 높여야 합니다. 여기서는 D3 인라인 스타일을 `.classed('region-disabled', true)`로 대체하는 것이 가장 이상적이지만, 기존 D3 코드를 크게 바꾸지 않는 선에서 `.region-disabled:hover`만 수정합니다.

### C.2 하드코딩된 색상 값 개선

*   **파일명:** `style.css`, `map.js`, `app.js`, `charts.js`
*   **문제:** JavaScript 코드 내에 `#2a2a3a`, `#4fc3f7` 등 하드코딩된 색상 값이 많아 테마 변경에 유연하지 않습니다.
*   **수정 후:**

    **`style.css`에 추가할 내용 (CSS 변수 정의):**
    ```css
    :root {
        /* 기본 다크 테마 색상 (예시) */
        --color-region-disabled-bg: #2a2a3a; /* 비활성화된 지역 배경색 */
        --color-primary-blue: #4fc3f7; /* 특정 파란색 */
        --color-accent-blue-semi-transparent: #2563EB55; /* 반투명 파란색 */
        --color-bg-dark-mode: #1e2a42; /* 다크 모드 배경색 (혹은 다른 요소) */

        /* 예시: 라이트 모드 변수 정의 */
        /* @media (prefers-color-scheme: light) {
            --color-region-disabled-bg: #ccc;
            --color-primary-blue: #007bff;
        } */
    }
    ```

    **JavaScript에서 CSS 변수 사용 예시:**
    ```javascript
    // map.js_2_selection_logic - updateMapColors 함수 내부
    // 수정 전: .attr('fill', '#2a2a3a');
    // 수정 후:
    // JS에서 CSS 변수 값을 읽어오기
    function getCssVariable(name) {
        return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    }
    // ...
    if (ElectionData.isBasicCouncilDisabled(key)) {
        el.classed('region-disabled', true)
            .transition().duration(400).attr('fill', getCssVariable('--color-region-disabled-bg'));
        // ...
    } else {
        el.classed('region-disabled', false)
            .transition().duration(400).attr('fill', getRegionColor(key)); // 기존 getRegionColor 유지 (이는 이미 중앙화됨)
        // ...
    }

    // app.js_3_historyTab (Chart.js 등에서 색상 사용 시)
    // 수정 전: backgroundColor: '#4fc3f7'
    // 수정 후:
    // ...
    new Chart(turnoutCanvas, {
        type: 'line',
        data: {
            labels: history.map(d => d.year),
            datasets: [{
                label: '투표율',
                data: history.map(d => d.turnout),
                borderColor: getCssVariable('--color-primary-blue'), // CSS 변수 사용
                backgroundColor: getCssVariable('--color-accent-blue-semi-transparent'), // CSS 변수 사용
                fill: true
            }]
        },
        // ...
    });
    ```
*   **효과:** 모든 하드코딩된 색상 값을 CSS 변수로 중앙화하여 관리합니다. JS에서는 `getComputedStyle`을 통해 이 변수 값을 동적으로 읽어 사용합니다. 이는 다크 모드/라이트 모드 전환과 같은 테마 변경에 유연하게 대응할 수 있도록 하고, 색상 관련 유지보수 및 일관성을 크게 향상시킵니다.

---

## 4. 적용 우선순위 최종 정리

| 우선순위 | 파일      | 변경 위치                                        | 내용                                                                                                                                                                                                                                    | 예상 효과                                                                                                                  |
| :------- | :-------- | :----------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------- |
| **HIGH** | `map.js`  | `MapModule` 초기화 및 `updateMapColors`         | 툴팁 요소 캐싱 (`_mapTooltipElement`), `updateMapColors` 내 `region-disabled` 상태 변경 시 이벤트 리스너 (`.on('mouseover.disabled', null)`) 명시적 제거.                                                                        | 메모리 누수 방지, DOM 쿼리 감소, 애플리케이션 안정성 향상.                                                                 |
| **HIGH** | `app.js`  | `AppModule` 초기화, `calcCredibilityScore`, `autoTagSubTabs`, 뉴스 데이터 처리 로직 | `NEWS_FILTER_CONFIG`를 정규식(`RegExp`) 객체 배열로 전처리 (`_preprocessNewsConfig`), 뉴스 아이템에 점수 및 태그 캐싱.                                                                                                | 뉴스 점수/태그 계산 성능 대폭 향상 (많은 뉴스 아이템 시), 렌더링 시 불필요한 재계산 방지, 사용자 경험 개선.            |
| **MED**  | `map.js`  | `MapModule` 초기화, `isMergedGuDistrict`, `getEffectiveDistrictName`, `getBasicCouncilSigungu` | `MULTI_GU_SINGLE_MAYOR_CITIES`를 `Map` 형태로 전처리 (`_mergedCityConfigMap`), 관련 함수들이 전처리된 `Map`을 사용하도록 수정.                                                                                        | `regionKey` 기반 조회 속도 향상 (`O(1)`), 데이터 양 증가 시 성능 저하 완화.                                               |
| **MED**  | `app.js`  | `App.onRegionSelected`, `renderCandidatesTab`, `renderHistoryTab`, `renderNewsTab` | `App.onRegionSelected`에서 `region` 객체를 한 번만 조회하여 각 탭 렌더링 함수에 인자로 전달.                                                                                                                           | 불필요한 `ElectionData.getRegion` 중복 호출 감소, 코드 명확성 증대.                                                        |
| **MED**  | `data.js`, `map.js`, `app.js` | `ElectionData` 모듈, 관련 함수 (`updateMapColors`, `renderTooltipContent`, `renderLocalCouncilProvinceView`) | `ElectionData`에 `isBasicCouncilDisabled`, `getBasicCouncilDisabledMessage` 유틸리티 함수 추가 및 사용.                                                                                                                    | 세종/제주 비활성 처리 로직 중앙화, 코드 중복 제거, 유지보수성 향상.                                                        |
| **MED**  | `data.js` | `ElectionData` 모듈 내 `getProportionalCouncilRegion` | `getProportionalCouncilRegion` 내부에 캐싱 로직 (`_proportionalCouncilCache`) 구현.                                                                                                                                           | 비례대표 데이터 중복 fetch/계산 방지, 렌더링 성능 향상.                                                                    |
| **MED**  | `map.js`  | `MapModule` 초기화, `getRegionKey`              | `nameMapping`과 `engMap`을 함수 배열로 전처리 (`initRegionNameMappings`), `getRegionKey`에서 이 함수 배열을 활용하여 패턴 매칭.                                                                                                | 코드 가독성 개선, 매핑 로직 관리 용이.                                                                                     |
| **LOW**  | `app.js`  | `AppModule` 초기화, `handleHashChange`          | `filter-btn` 요소들을 초기화 시점에 한 번 쿼리하여 캐시 (`_cachedFilterButtons`), `handleHashChange`에서 캐시된 버튼 사용.                                                                                               | `document.querySelector` 반복 호출 감소, 미미한 성능 향상.                                                                 |
| **LOW**  | `app.js`  | 전역 또는 `AppModule` 유틸리티                  | `updateElementHtml(id, html)` 공통 유틸 함수 정의 및 반복되는 `if (el) el.innerHTML = ...` 패턴 대체.                                                                                                                        | 코드 간결성 및 가독성 향상.                                                                                                |
| **LOW**  | `style.css` | `.region-disabled:hover`                        | `!important` 제거 및 CSS 우선순위 조정 (`#map-container .region.region-disabled:hover`).                                                                                                                                     | CSS 우선순위 관리 개선, 유지보수 용이.                                                                                     |
| **LOW**  | `style.css`, JS 코드 내 | `:root` 블록, JS 색상 사용처                   | `style.css` `:root`에 CSS 변수 정의 (`--color-region-disabled-bg` 등), JavaScript 코드에서 `getComputedStyle().getPropertyValue()`를 통해 CSS 변수 사용.                                                               | 색상 중앙화, 테마 유연성 향상, 유지보수 용이.                                                                              |

---

## 5. 크로스체크

### 이 프로젝트 구조(빌드 도구 없음, CDN 의존)에서 실제로 적용 불가능한 것
*   **없습니다.** 위에 제시된 모든 수정 코드는 바닐라 JavaScript의 IIFE 모듈 패턴과 전역 변수/객체 활용에 기반하며, 별도의 빌드 도구나 모듈 번들러(Webpack, Rollup 등) 없이 CDN에서 로드되는 D3.js, Chart.js 등과 호환됩니다. `.js` 및 `.css` 파일을 직접 수정하고 `<script>` 태그 로드 순서만 잘 관리하면 됩니다.

### 다른 부분과 충돌 가능성이 있는 것
*   **`currentElectionType` 전역 변수 의존성:** 여러 모듈에서 `currentElectionType`과 같은 전역 변수를 직접 참조하는 구조는 모듈 간 결합도를 높입니다. 위에 제시된 코드에서는 이 패턴을 유지하되, 일부 함수에서는 인자로 명시적으로 전달하는 방향으로 개선했습니다. 만약 `currentElectionType`이 비동기적으로 변경되거나, 동기화 문제가 발생할 수 있는 복잡한 로직이라면 추가적인 주의가 필요합니다.
*   **CSS `!important` 제거:** `map.js`에서 D3가 `attr('fill', ...)`로 인라인 스타일을 적용하는 경우, CSS의 `fill` 속성(심지어 `!important`가 없는)은 인라인 스타일보다 우선순위가 낮아 적용되지 않습니다. `.region-disabled` 클래스에 `fill: #2a2a3a !important;`가 사용된 것은 D3의 `attr('fill')`을 강제로 덮어쓰기 위한 목적일 수 있습니다. 이 경우 `!important`를 제거하면 D3가 설정한 색상으로 되돌아갈 수 있습니다. 이 문제를 해결하려면 D3 코드에서 `attr('fill', ...)` 호출을 제거하고 `.classed('region-disabled', true)`만 사용하여 CSS가 색상을 전적으로 제어하도록 변경하는 것이 가장 이상적입니다. 하지만 현재 수정 코드에서는 `hover`에 대한 불필요한 `!important`만 제거하여 최소한의 변경을 제안했습니다.

### 수정 시 주의사항
1.  **파일 및 라인 번호의 정확성:** 제시된 라인 번호는 예상치이므로, 실제 프로젝트 코드에서 해당 로직의 정확한 위치를 찾아 수정해야 합니다. 전체 코드 검색을 통해 관련 로직을 모두 식별하는 것이 중요합니다.
2.  **`MapModule`, `AppModule`, `ElectionData` 구조:** 제시된 코드는 각 파일이 IIFE(즉시 실행 함수) 패턴을 사용하여 `MapModule`, `AppModule`, `ElectionData` 등의 전역 객체를 노출하고 있다고 가정합니다. 실제 프로젝트의 모듈 구조에 맞게 코드를 삽입하고 수정해야 합니다. 예를 들어, `_mapTooltipElement` 변수는 `MapModule` IIFE의 스코프 내부에 선언되어야 합니다.
3.  **변수 스코프 및 `this` 컨텍스트:** 바닐라 JS 환경에서는 변수 스코프와 `this` 컨텍스트 관리가 중요합니다. 특히 D3 이벤트 리스너 내에서 `this`는 해당 DOM 요소를 참조하는 반면, 화살표 함수는 외부 스코프의 `this`를 유지합니다. 제시된 코드에서는 이러한 컨텍스트 문제를 유발할 만한 `this` 사용은 최소화했습니다.
4.  **`NEWS_FILTER_CONFIG`의 정규식 처리:** `_preprocessNewsConfig`에서 `RegExp` 특수 문자를 이스케이프하는 로직을 추가했지만, 실제 `NEWS_FILTER_CONFIG`에 복잡한 정규식 패턴이 포함되어 있다면 추가적인 테스트가 필요할 수 있습니다. `RegExp`의 `test()` 메서드는 `includes()`와 동작 방식이 다르므로, `includes()`가 특정 단어를 포함하는지 확인하는 용도로만 쓰였다면 `RegExp` 패턴도 이에 맞춰 구성해야 합니다. (예: `/(단어1|단어2)/i`는 "단어1" 또는 "단어2"를 포함하는지 확인)
5.  **새로운 초기화 함수 호출:** `initMap`, `initApp`, `initMergedCityConfigMap`, `initRegionNameMappings` 등의 새로운 초기화 로직은 기존 프로젝트의 전역 `init` 함수(예: `document.addEventListener('DOMContentLoaded', App.init)`) 내에서 호출되도록 추가해야 합니다.
6.  **`ElectionData.getProportionalCouncilRegion` 비동기 처리:** 이 함수가 실제로는 네트워크 요청(비동기)을 포함한다면, 캐싱 로직도 `Promise`를 저장하고 반환하도록 수정해야 합니다. 현재 예시 코드는 이를 고려하여 `async/await` 패턴을 사용하고 있습니다.

이 수정 코드는 Round 1 분석에서 지적된 문제점들을 직접적으로 해결하며, 프로젝트의 성능, 유지보수성, 코드 구조를 개선하는 데 큰 도움이 될 것입니다.