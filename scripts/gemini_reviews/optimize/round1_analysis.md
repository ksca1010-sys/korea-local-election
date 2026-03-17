# Round 1: 비효율 식별
생성: 2026-03-11 00:13 | 모델: gemini-2.5-flash

---

안녕하세요. 2026 한국 지방선거 인터랙티브 지도 프로젝트 코드에 대한 효율화 및 최적화 검토 요청에 따라, 시니어 프론트엔드 엔지니어 및 JavaScript/CSS 최적화 전문가 관점에서 분석한 내용을 공유드립니다.

전체적으로 바닐라 JS와 D3.js v7, TopoJSON을 사용하여 복잡한 인터랙티브 지도를 구현하고 다양한 데이터(선거, 후보자, 뉴스)를 통합하는 프로젝트로 보입니다. 빌드 도구가 없는 환경에서 이 정도 규모의 코드를 관리하는 것은 매우 도전적이며, 그 자체로 많은 최적화 기회를 내포하고 있습니다.

제시된 코드 스니펫과 전체 파일 길이를 기반으로 분석한 결과는 다음과 같습니다.

---

### A. JavaScript 성능/비효율

1.  **[HIGH] `map.js` - `updateMapColors` 내 이벤트 리스너 중복 추가/관리 비효율**
    *   **파일/라인 컨텍스트:** `map.js_2_selection_logic` (약 202-217줄 예상)
        ```javascript
        // ... (updateMapColors 함수 내부)
        if ((currentElectionType === 'localCouncil' || currentElectionType === 'localCouncilProportional') &&
            (key === 'sejong' || key === 'jeju')) {
            el.classed('region-disabled', true)
                .transition().duration(400).attr('fill', '#2a2a3a');
            el.on('mouseover.disabled', function(event) { // <-- 이 부분
                const tooltip = document.getElementById('map-tooltip');
                if (!tooltip) return;
                tooltip.innerHTML = '기초의회가 없는 지역입니다';
                tooltip.classList.add('active');
                tooltip.style.left = event.pageX + 'px';
                tooltip.style.top = (event.pageY - 30) + 'px';
            }).on('mouseout.disabled', function() { // <-- 이 부분
                const tooltip = document.getElementById('map-tooltip');
                if (tooltip) tooltip.classList.remove('active');
            });
        } else {
            el.classed('region-disabled', false)
                .transition().duration(400).attr('fill', getRegionColor(key));
            // el.on('mouseover.disabled', null).on('mouseout.disabled', null); <-- 명시적인 제거 로직 부재
        }
        // ...
        ```
    *   **문제점:** `updateMapColors` 함수가 호출될 때마다 모든 `.region` 요소에 대해 루프를 돌고, 특정 조건(`region-disabled` 상태)일 때 `mouseover.disabled`와 `mouseout.disabled` 이벤트 리스너를 추가합니다. 문제는 이 리스너들이 나중에 해당 지역이 `region-disabled` 상태에서 벗어날 때 명시적으로 제거되지 않는다는 것입니다. D3의 `.on()`은 동일한 이름(`mouseover.disabled`)의 리스너를 덮어쓰지만, 만약 `else` 블록에서 기존 리스너를 `null`로 설정하여 제거하지 않으면, 불필요한 리스너들이 메모리에 남아있을 수 있습니다. 또한, 매번 `mouseover` 이벤트가 발생할 때마다 `document.getElementById('map-tooltip')`을 호출하는 것은 불필요한 반복입니다.
    *   **개선 방안:**
        *   이벤트 리스너는 한 번만 추가하고, `mouseover` 콜백 내에서 `d3.select(this).classed('region-disabled')` 등의 상태를 확인하여 툴팁 내용을 동적으로 변경하는 방식으로 리팩토링합니다.
        *   `map-tooltip` 요소는 모듈 초기화 시점에 캐싱하여 반복적인 DOM 쿼리를 피합니다.

2.  **[HIGH] `app.js` - 뉴스 점수 알고리즘(`calcCredibilityScore`, `autoTagSubTabs`)의 비효율**
    *   **파일/라인 컨텍스트:** `app.js_5_news_scoring` (약 1-70줄 예상)
        ```javascript
        // calcCredibilityScore 함수
        // ...
        if ((regional.tier1 || []).some(d => host.includes(d))) return scores.tier1;
        // ... (national tiers도 유사한 .some + .includes 패턴)

        // autoTagSubTabs 함수
        // ...
        Object.entries(keywords).forEach(([tab, words]) => {
            if (words.some(w => text.includes(w.toLowerCase()))) tags.push(tab);
        });
        // ...
        ```
    *   **문제점:** `calcCredibilityScore`와 `autoTagSubTabs` 함수는 뉴스 기사 하나하나에 대해 `NEWS_FILTER_CONFIG` 내의 배열(`tier1`, `tier2`, `keywords`의 `words`)을 순회하며 `String.prototype.includes()` 또는 `RegExp.prototype.test()`를 반복적으로 수행합니다. 뉴스 기사가 많아질 경우, 이 반복적인 문자열 매칭 작업이 상당한 성능 저하를 일으킬 수 있습니다. 특히 `includes`는 전체 문자열을 스캔하므로 비효율적입니다.
    *   **개선 방안:**
        *   `NEWS_FILTER_CONFIG`의 `credibilityTiers`와 `subTabKeywords` 데이터를 애플리케이션 초기 로딩 시점에 한 번만 전처리하여, 검색 효율이 높은 자료구조(예: `Set` 또는 `RegExp` 객체 배열)로 변환합니다. 예를 들어, `tier1` 목록의 모든 키워드를 하나의 거대한 정규식(`RegExp`)으로 합쳐서 `test()` 메서드를 한 번만 호출하도록 할 수 있습니다.
        *   `text.includes(w.toLowerCase())` 대신, 모든 키워드를 소문자로 변환한 후 `Set`에 저장하고, 뉴스 텍스트를 단어 단위로 분리하여 `Set.has()`로 확인하는 방식이 더 빠를 수 있습니다. (단, 한글 형태소 분석이 필요하다면 복잡해질 수 있으므로, 단순 `includes`보다 정규식 합병이 더 현실적일 수 있습니다.)

3.  **[MED] `map.js` - `MULTI_GU_SINGLE_MAYOR_CITIES` 탐색 비효율**
    *   **파일/라인 컨텍스트:** `map.js_1_constants_color` (약 114-162줄), `map.js_3_getBasicCouncilSigungu` (약 10-14줄 예상)
        ```javascript
        // isMergedGuDistrict 함수
        return MULTI_GU_SINGLE_MAYOR_CITIES.some(
            cfg => cfg.regionKey === regionKey && cfg.guMatchFn(raw)
        );

        // getEffectiveDistrictName 함수
        const cfg = MULTI_GU_SINGLE_MAYOR_CITIES.find(
            c => c.regionKey === regionKey && (c.guMatchFn(raw) || c.aliasPattern.test(raw))
        );

        // getBasicCouncilSigungu 함수 (재활용 리팩토링됨)
        const candidates = regionKey
            ? MULTI_GU_SINGLE_MAYOR_CITIES.filter(c => c.regionKey === regionKey)
            : MULTI_GU_SINGLE_MAYOR_CITIES;
        for (const cfg of candidates) {
            if (cfg.guMatchFn(districtName)) return cfg.cityName;
        }
        ```
    *   **문제점:** `MULTI_GU_SINGLE_MAYOR_CITIES`는 현재 배열 형태로 되어 있으며, `isMergedGuDistrict`, `getEffectiveDistrictName`, `getBasicCouncilSigungu` 함수에서 이 배열을 선형 탐색(`some`, `find`, `filter` 후 `for...of`)합니다. 이 목록의 크기는 현재 11개 항목으로 크지 않지만, 만약 목록이 더 커지거나, 지도 상의 많은 구역(feature)에 대해 이 함수들이 빈번하게 호출될 경우 성능 저하의 잠재적 요인이 될 수 있습니다. 특히 `filter` 후 다시 루프를 도는 `getBasicCouncilSigungu`는 두 번의 순회가 발생합니다.
    *   **개선 방안:** `MULTI_GU_SINGLE_MAYOR_CITIES`를 `regionKey`를 키로 하는 `Map` 또는 `Object` 형태로 전처리하여 `O(1)`에 가까운 조회를 가능하게 합니다.
        ```javascript
        // 초기 로딩 시점에 Map 형태로 변환 (map.js 모듈 내부)
        const MERGED_CITY_CONFIG_MAP = new Map();
        MULTI_GU_SINGLE_MAYOR_CITIES.forEach(cfg => {
            if (!MERGED_CITY_CONFIG_MAP.has(cfg.regionKey)) {
                MERGED_CITY_CONFIG_MAP.set(cfg.regionKey, []);
            }
            MERGED_CITY_CONFIG_MAP.get(cfg.regionKey).push(cfg);
        });

        // isMergedGuDistrict (예시)
        function isMergedGuDistrict(regionKey, districtName) {
            if (currentElectionType !== 'mayor') return false;
            const raw = String(districtName || '');
            const configs = MERGED_CITY_CONFIG_MAP.get(regionKey);
            if (!configs) return false;
            return configs.some(cfg => cfg.guMatchFn(raw));
        }
        ```

4.  **[MED] `app.js` - `ElectionData.getRegion(regionKey)` 등 반복 호출**
    *   **파일/라인 컨텍스트:** `app.js_2_candidatesTab` (약 1-3줄), `app.js_3_historyTab` (약 2-3줄), `app.js_5_news_scoring` (약 72-74줄) 등
        ```javascript
        // renderCandidatesTab
        const region = ElectionData.getRegion(regionKey);
        if (!region) return;
        // ...

        // renderHistoryTab
        const region = ElectionData.getRegion(regionKey);
        const history = ElectionData.getHistoricalData(regionKey); // <-- 여기서도 regionKey 사용
        if (!region || !history || history.length === 0) return;
        // ...

        // renderNewsTab
        const region = ElectionData.getRegion(regionKey);
        if (!region) return;
        // ...
        ```
    *   **문제점:** `App` 모듈의 여러 렌더링 함수(`renderCandidatesTab`, `renderHistoryTab`, `renderNewsTab`)에서 `ElectionData.getRegion(regionKey)`를 각각 호출하여 `region` 객체를 가져오고 있습니다. `App.onRegionSelected` 함수에서 이미 `regionKey`를 인자로 받고 있으므로, 이 `region` 객체를 한 번만 조회하여 각 탭 렌더링 함수에 인자로 넘겨주면 불필요한 반복 조회를 줄일 수 있습니다. `ElectionData.getRegion`이 내부적으로 캐싱되어 있더라도, 함수 호출 스택을 줄이고 인자 전달을 통해 명확성을 높이는 것이 좋습니다.
    *   **개선 방안:** `App.onRegionSelected` 함수에서 `ElectionData.getRegion(regionKey)`를 호출하여 `region` 객체를 얻은 후, 이를 각 탭 렌더링 함수에 인자로 전달합니다.

5.  **[LOW] `app.js` - `handleHashChange` 내 `document.querySelector` 반복 호출**
    *   **파일/라인 컨텍스트:** `app.js_4_resize_deeplink` (약 80-82줄)
        ```javascript
        // handleHashChange 함수
        // ...
        if (type) {
            const btn = document.querySelector(`.filter-btn[data-type="${type}"]`);
            if (btn) {
                btn.click();
            }
        }
        // ...
        ```
    *   **문제점:** `handleHashChange`는 URL 해시 변경 시마다 호출될 수 있습니다. `document.querySelector`는 DOM을 탐색하는 비용이 발생하는 작업이므로, `filter-btn`과 같이 자주 접근하는 요소들은 초기화 시점에 한 번 캐싱해두면 좋습니다.
    *   **개선 방안:** `initDeepLink` 또는 `init` 함수 내에서 `.filter-btn` 요소들을 한 번만 쿼리하여 캐시합니다. `data-type`별로 Map에 저장해두면 `O(1)` 조회도 가능합니다.

---

### B. 코드 구조/중복 제거

1.  **[MED] `map.js` 및 `app.js` - 세종/제주 기초의원 비활성 처리 로직 중복**
    *   **파일/라인 컨텍스트:**
        *   `map.js_1_constants_color`: `getRegionColor` 함수 (약 202-205줄 예상)
        *   `map.js_2_selection_logic`: `handleRegionSelection` 함수 (약 15-18줄), `updateMapColors` 함수 (약 206-209줄)
        *   `map.js_3_getBasicCouncilSigungu`: `switchToBasicCouncilMap` 함수 (약 10-13줄)
        *   `map.js_4_tooltip_localCouncil`: `currentElectionType === 'localCouncil'` 블록 (약 40-47줄)
        *   `app.js_1_localCouncilView`: `renderLocalCouncilProvinceView` 함수 (약 2-4줄)
    *   **문제점:** 세종/제주 지역은 기초의원이 없다는 특성 때문에 여러 곳에서 `regionKey === 'sejong' || regionKey === 'jeju'` 조건으로 동일한 비활성 처리 및 메시지 렌더링 로직이 반복되고 있습니다. 이는 코드 중복을 야기하고, 나중에 해당 조건이나 메시지가 변경될 경우 여러 곳을 수정해야 하는 유지보수 문제를 발생시킵니다.
    *   **개선 방안:**
        *   `ElectionData` 모듈에 `isBasicCouncilDisabled(regionKey)`와 같은 유틸리티 함수를 만들어 사용합니다. 이 함수는 세종/제주 여부를 판단하는 핵심 로직을 캡슐화합니다.
        *   툴팁 메시지나 패널 메시지 등은 `MapModule` 또는 `AppModule` 내의 상수나 유틸리티 함수로 분리하여 관리합니다.

2.  **[MED] `map.js` - `getRegionKey`, `getDistrictName`, `getPropValue`의 반복 패턴**
    *   **파일/라인 컨텍스트:** `map.js_1_constants_color` (약 72-97줄)
        ```javascript
        // getRegionKey 함수 (다수의 속성 키와 부분 매칭 로직)
        // getPropValue 함수 (props에서 여러 키 중 하나를 찾아 반환)
        // getDistrictName 함수 (getPropValue를 사용하여 여러 속성 키 탐색)
        ```
    *   **문제점:** `getRegionKey`와 `getDistrictName`은 `feature.properties` 객체에서 여러 가능한 키(`name`, `NAME`, `SIG_KOR_NM` 등)를 순회하며 적절한 값을 찾습니다. 이는 데이터 소스의 일관성이 부족할 때 유용한 방어 로직이지만, `getPropValue`와 같은 유틸리티 함수로 이 패턴을 추상화했음에도 불구하고, `getRegionKey` 내부에서는 다시 복잡한 조건부 로직과 `nameMapping` 순회가 발생합니다.
    *   **개선 방안:**
        *   현재 `getPropValue`는 잘 추상화되어 있습니다. `getRegionKey`에서 `nameMapping`과 `engMap`을 초기 로딩 시점에 `Map` 형태로 변환하여 조회 효율을 높이면 더욱 좋습니다.
        *   가장 이상적으로는 GeoJSON 데이터 자체가 표준화된 단일 속성 키를 갖는 것이지만, 외부 데이터를 사용하는 경우 쉽지 않으므로 현재의 방어 로직은 필요합니다. 성능 병목이 확인될 경우, `nameMapping`과 `engMap`을 키-값 `Map`으로 변환하여 `O(1)` 조회로 만듭니다.

3.  **[LOW] `if (el) el.innerHTML = ...` 패턴 반복**
    *   **파일/라인 컨텍스트:** `app.js_1_localCouncilView` (약 13-15줄, 30-32줄), `app.js_2_candidatesTab` (약 8-10줄, 49-51줄) 등
    *   **문제점:** DOM 요소의 존재 여부를 `if (el)`로 확인한 후 `innerHTML`을 할당하는 패턴이 자주 반복됩니다.
    *   **개선 방안:** DOM 유틸리티 함수를 만들거나, 더글라스 크록포드의 모듈 패턴처럼 `getElementById` 결과를 바로 변수에 할당하여 `null` 체크를 한 번만 하고 사용하는 방식으로 코드를 간결하게 만들 수 있습니다. 또는, HTML 템플릿 리터럴을 반환하는 함수들을 구성하여 최종적으로 하나의 `innerHTML` 호출만 이루어지도록 구조를 개선할 수 있습니다.
        ```javascript
        // Utility function 예시
        function updateElementHtml(id, html) {
            const el = document.getElementById(id);
            if (el) el.innerHTML = html;
        }

        // 사용 예시:
        updateElementHtml('panel-region-name', region.name);
        ```

4.  **[MED] 전체 코드의 모듈성 및 결합도**
    *   **파일/라인 컨텍스트:** `map.js` (3044줄), `app.js` (3270줄), `data.js` (2157줄)
    *   **문제점:** 단일 파일 길이가 매우 길고, 서로 다른 기능들이 한 파일에 밀집되어 있어 모듈성이 떨어지고 결합도가 높습니다. 예를 들어 `AppModule`이 `MapModule`과 `ChartsModule`의 특정 함수를 직접 호출하고, `MapModule` 또한 `App`의 함수를 호출하는 등 양방향 의존성이 강합니다. 빌드 도구가 없다는 제약 때문에 모듈 시스템(`import/export`)을 사용할 수 없지만, IIFE 패턴만으로도 더 세분화된 모듈 분리가 가능합니다.
    *   **개선 방안:**
        *   **책임 분리:** 각 파일 내에서 기능별로 더 작은 IIFE 모듈(예: `TooltipModule`, `BreadcrumbModule`, `PanelTabsModule` 등)을 만들어 책임을 명확히 분리합니다.
        *   **이벤트 버스/Observer 패턴:** 모듈 간 직접적인 함수 호출 대신, 이벤트 버스 또는 간단한 Observer 패턴을 구현하여 느슨한 결합도를 유지합니다. `AppModule`이 중심이 되어 이벤트를 발행하고 다른 모듈이 이를 구독하는 방식이 효과적입니다. 예를 들어, `MapModule`이 지도를 클릭하면 `App.emit('regionSelected', regionKey)`와 같이 이벤트를 발생시키고, `AppModule`은 이 이벤트를 받아 UI를 업데이트합니다.

---

### C. CSS 최적화

1.  **[LOW] `style.css` - `!important` 과다 사용**
    *   **파일/라인 컨텍스트:** `style.css_new_sections` (약 2-3줄)
        ```css
        .region-disabled {
            fill: #2a2a3a !important;
            cursor: not-allowed !important;
            opacity: 0.5;
        }
        .region-disabled:hover {
            fill: #2a2a3a !important;
        }
        ```
    *   **문제점:** `!important`는 CSS 우선순위(specificity)를 무시하고 강제로 스타일을 적용합니다. 이는 나중에 스타일을 오버라이드하기 어렵게 만들고, 유지보수를 복잡하게 합니다. 특히 `.region-disabled:hover`에서도 `!important`를 사용하는 것은 불필요해 보입니다.
    *   **개선 방안:** `!important`를 사용하지 않고도 원하는 스타일이 적용되도록 CSS 우선순위를 조절합니다. 예를 들어, `.region-disabled` 클래스가 더 구체적인 선택자 뒤에 오도록 하거나, JS에서 인라인 스타일로 직접 `fill` 속성을 변경하는 방식을 사용합니다 (D3를 사용하므로 `.attr('fill', ...)`로 제어할 수 있습니다). `cursor` 속성 또한 `!important` 없이도 충분히 적용될 가능성이 높습니다.

2.  **[LOW] 하드코딩된 색상 값 개선**
    *   **파일/라인 컨텍스트:** `map.js_1_constants_color` (약 203줄), `app.js_3_historyTab` (약 39-41줄), `charts.js` (약 43줄) 등
    *   **문제점:** CSS 파일에서는 `--accent-primary`, `--bg-card` 등 CSS 변수를 잘 활용하고 있으나, JavaScript 코드 내부에서 `#2a2a3a`, `#4fc3f7`, `#2563EB55`, `#1e2a42` 등 하드코딩된 색상 값이 보입니다. 이는 다크 모드/라이트 모드 전환과 같은 테마 변경에 유연하게 대응하기 어렵게 만듭니다.
    *   **개선 방안:** 모든 색상 값을 CSS 변수로 정의하고, JavaScript에서는 이 CSS 변수 값을 읽어 사용하거나 (예: `getComputedStyle(document.documentElement).getPropertyValue('--accent-blue')`), 또는 `ElectionData` 모듈처럼 색상을 관리하는 전역 객체를 통해 접근하도록 통일합니다. `ElectionData.getPartyColor`처럼 중앙화된 함수는 좋은 패턴입니다.

---

### D. 렌더링 로직

1.  **[MED] `renderHistoryTab`의 Chart.js 인스턴스 관리 (양호)**
    *   **파일/라인 컨텍스트:** `app.js_3_historyTab` (약 53-56줄)
        ```javascript
        if (turnoutCanvas && typeof Chart !== 'undefined') {
            if (historyTurnoutChart) {
                historyTurnoutChart.destroy();
                historyTurnoutChart = null;
            }
            // ... new Chart(...)
        }
        ```
    *   **분석:** `renderHistoryTab`에서 Chart.js 인스턴스를 재생성하기 전에 기존 인스턴스를 `destroy()`하고 `null`로 초기화하는 패턴은 **매우 바람직합니다.** 이는 메모리 누수를 방지하고 차트가 제대로 다시 렌더링되도록 하는 올바른 방법입니다. 이 부분은 최적화가 잘 되어 있다고 평가합니다.

2.  **[HIGH] 뉴스 점수 알고리즘의 `calcCredibilityScore`/`autoTagSubTabs` 호출 최적화**
    *   **파일/라인 컨텍스트:** `app.js_5_news_scoring` (전체)
    *   **분석:** 위 A.2 항목에서 언급했듯이, 이 함수들은 `NEWS_FILTER_CONFIG` 내부의 배열을 순회하며 `includes()` 또는 `test()`를 반복 수행하므로, 뉴스 아이템이 많을 경우 성능 저하의 주범이 될 수 있습니다.
    *   **개선 방안:**
        *   **데이터 전처리:** `NEWS_FILTER_CONFIG`의 키워드 목록을 초기 로딩 시점에 `Set` 또는 `RegExp` 객체 배열로 전처리하여 검색 속도를 향상시킵니다.
        *   **점수 캐싱/메모이제이션:** 뉴스 데이터를 fetch 한 후, 각 뉴스 아이템에 대해 점수를 한 번만 계산하여 `newsItem.score`와 같이 속성으로 저장해 둡니다. 정렬(`newsState.sortMode`) 시에는 이미 계산된 점수를 활용하여 매번 재계산하는 것을 방지합니다. 시간 점수(`calcTimeScore`)는 시간이 지남에 따라 변할 수 있으므로, 주기적인 업데이트 또는 필요 시 재계산을 고려합니다. (하지만 일반적으로 뉴스 목록이 실시간으로 계속 업데이트되지 않는 한, 한 번 계산으로 충분합니다.)

3.  **[MED] 비례대표 렌더링 시 동일 데이터 중복 fetch 여부 (확인 필요)**
    *   **파일/라인 컨텍스트:** `map.js_4_tooltip_localCouncil` (약 10-11줄)
        ```javascript
        // ... (renderTooltipContent 함수 내부)
        } else if (currentElectionType === 'proportionalCouncil') {
            const propData = ElectionData.getProportionalCouncilRegion(key);
            // ...
        } else if (currentElectionType === 'council') {
            const propData = ElectionData.getProportionalCouncilRegion(key); // <-- 동일 함수 호출
            // ...
        }
        ```
    *   **분석:** `currentElectionType`이 `'proportionalCouncil'`일 때와 `'council'`일 때 모두 `ElectionData.getProportionalCouncilRegion(key)`를 호출하는 부분이 보입니다. 만약 이 함수가 실제로 네트워크 요청을 발생시키거나 비용이 많이 드는 계산을 포함한다면, 동일한 `key`에 대해 짧은 시간 내에 두 번 호출될 경우 비효율적일 수 있습니다.
    *   **개선 방안:** `ElectionData` 모듈 내부에서 `getProportionalCouncilRegion` 함수가 반환하는 데이터를 캐싱하는 로직을 추가하여, 동일한 `regionKey`에 대한 반복적인 호출 시 실제 데이터 처리 없이 캐싱된 데이터를 즉시 반환하도록 합니다. `ElectionData` 모듈은 전역 객체인 만큼 이러한 캐싱 로직 구현에 적합합니다.

---

### E. 중요도 분류 요약

*   **[HIGH] JavaScript 성능/비효율:**
    *   `map.js`: `updateMapColors` 내 이벤트 리스너 중복 추가/관리 비효율 (메모리 누수 가능성)
    *   `app.js`: 뉴스 점수 알고리즘(`calcCredibilityScore`, `autoTagSubTabs`)의 비효율 (많은 뉴스 아이템 시 심각한 성능 저하)
*   **[MED] JavaScript 성능/비효율:**
    *   `map.js`: `MULTI_GU_SINGLE_MAYOR_CITIES` 탐색 비효율 (데이터 양에 따라 성능 영향)
    *   `app.js`: `ElectionData.getRegion(regionKey)` 등 반복 호출 (사소한 성능, 코드 명확성)
*   **[MED] 코드 구조/중복 제거:**
    *   `map.js` 및 `app.js`: 세종/제주 기초의원 비활성 처리 로직 중복 (유지보수성)
    *   `map.js`: `getRegionKey`, `getDistrictName`, `getPropValue`의 반복 패턴 (데이터 표준화 부족, 작은 최적화 가능성)
    *   전체 코드의 모듈성 및 결합도 (장기적 유지보수, 확장성)
*   **[MED] 렌더링 로직:**
    *   비례대표 렌더링 시 동일 데이터 중복 fetch 여부 (확인 및 캐싱 필요)
*   **[LOW] JavaScript 성능/비효율:**
    *   `app.js`: `handleHashChange` 내 `document.querySelector` 반복 호출 (미미한 성능)
*   **[LOW] 코드 구조/중복 제거:**
    *   `if (el) el.innerHTML = ...` 패턴 반복 (코드 가독성/간결성)
*   **[LOW] CSS 최적화:**
    *   `style.css`: `!important` 과다 사용 (유지보수성, CSS 우선순위 이해도)
    *   하드코딩된 색상 값 개선 (테마 유연성, 유지보수성)
*   **[양호] 렌더링 로직:**
    *   `renderHistoryTab`의 Chart.js 인스턴스 관리 (모범 사례)

---

**전반적인 의견:**

빌드 도구가 없는 환경에서 이 정도 규모의 프로젝트를 바닐라 JS로 관리하는 것은 대단하지만, 위에서 지적된 코드 구조 및 성능 문제는 이러한 환경에서 더 심각하게 다가올 수 있습니다.

가장 시급한 개선은 **이벤트 리스너 메모리 누수 방지**와 **뉴스 점수 알고리즘의 비효율 개선**입니다. 이 두 가지는 사용자 경험과 애플리케이션의 안정성에 직접적인 영향을 줄 수 있는 **[HIGH]** 이슈입니다.

장기적으로는 IIFE 모듈 패턴을 더 적극적으로 활용하고, 모듈 간의 의존성을 줄여 결합도를 낮추는 방향으로 리팩토링하는 것을 강력히 권장합니다. 이는 유지보수성과 확장성을 크게 향상시킬 것입니다. 빌드 도구 도입은 아니더라도, 최소한 JS 파일들을 기능별로 더 작게 분리하고, 스크립트 로드 순서를 신중히 관리하는 것이 좋습니다.

수고 많으셨습니다!