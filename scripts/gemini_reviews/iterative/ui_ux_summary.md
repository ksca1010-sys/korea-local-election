# UI/UX 인터페이스 검증 - 5라운드 통합 결과

생성일: 2026-03-09 11:00
모델: gemini-2.5-flash


========================================
## Round 1/5
========================================

## 6.3 전국지방선거 인터랙티브 선거 정보 지도 UI/UX 분석 및 개선 제안

제공해주신 `index.html`과 `style.css`를 바탕으로 2026년 6.3 전국지방선거 인터랙티브 지도 프로젝트의 UI 구조, 레이아웃, 내비게이션 흐름을 분석했습니다. 다크 테마 기반의 D3.js+TopoJSON 지도와 Chart.js 차트를 활용하는 점을 고려하여 접근했으며, WCAG 2.1 AA 기준을 중심으로 검토했습니다.

전반적으로 프로젝트의 기본적인 구조와 디자인 방향성은 매우 잘 잡혀있으며, 다크 테마의 일관성과 깔끔함이 돋보입니다. 특히 CSS 변수를 활용하여 색상 및 레이아웃 요소를 체계적으로 관리하는 점은 훌륭합니다.

---

### 1. 3컬럼 레이아웃 (좌측 사이드바 + 중앙 지도 + 우측 패널)의 적절성

**분석:**
현재 HTML에서는 좌측 사이드바까지만 확인되지만, "중앙 지도 + 우측 패널"을 전제로 분석합니다.
*   **장점:** 대시보드나 복잡한 정보 시각화 프로젝트에서 흔히 사용되는 효율적인 레이아웃입니다. 사용자가 필터링(좌측), 지도 시각화(중앙), 상세 정보(우측)를 동시에 보면서 상호작용할 수 있어 생산성이 높습니다. 정보 밀도가 높은 지방선거 데이터에 적합합니다.
*   **단점:** 화면 공간을 많이 필요로 하므로, 데스크톱 환경에서도 해상도가 낮거나 모니터 크기가 작은 경우 답답하게 느껴질 수 있습니다. 모바일 환경에서는 이 레이아웃을 그대로 유지하기 어렵습니다. `var(--sidebar-width: 320px);` 및 `var(--panel-width: 420px);`와 같이 고정된 너비는 데스크톱 환경에 최적화된 것으로 보입니다.

**개선 제안:**
*   **우선순위: 중**
*   **확장성 확보:** 데스크톱 환경에서도 사용자가 중앙 지도를 더 넓게 보고 싶을 때를 대비하여 좌측 사이드바와 우측 패널을 접거나 확장할 수 있는 기능을 제공하는 것이 좋습니다. 토글 버튼을 통해 사이드바/패널을 숨기거나 최소화하여 중앙 지도의 가시성을 높일 수 있습니다.
*   **최소 너비 고려:** 3컬럼 레이아웃을 유지할 수 있는 최소 화면 너비를 설정하고, 그 이하에서는 레이아웃을 변경(예: 사이드바를 오버레이 메뉴로, 우측 패널을 하단 시트로)하는 반응형 전략이 필수입니다.

---

### 2. 선거 종류 필터 8개 배치의 직관성

**분석:**
좌측 사이드바 상단에 "선거 종류" 필터가 아이콘, 텍스트, 그리고 각 선거구 수를 함께 표시하는 형태로 배치되어 있습니다.
*   **장점:**
    *   **직관적인 배치:** 좌측 사이드바에 필터를 배치하는 것은 사용자에게 매우 익숙하고 직관적인 배치입니다.
    *   **명확한 레이블링:** "광역단체장", "교육감" 등 선거 종류 텍스트가 명확합니다.
    *   **시각적 보조:** 각 선거 종류에 맞는 아이콘(`fa-landmark`, `fa-graduation-cap` 등)을 사용하여 시각적으로 인지하기 쉽습니다.
    *   **정보 제공:** `filter-count`를 통해 각 선거 종류의 개수를 바로 확인할 수 있어 유용합니다.
    *   **접근성:** `filter-btn-wrap` 내 `filter-tooltip`이 있는 것으로 보아 추가 정보 제공 의도가 있어 보입니다.
*   **단점:** 현재 나열 순서는 광역 -> 기초, 단체장 -> 의원 순으로 논리적이나, 종류가 많아지면 스크롤이 길어질 수 있습니다.

**개선 제안:**
*   **우선순위: 하**
*   **툴팁 정보 강화:** `filter-tooltip`에 단순히 개수만 보여줄 것이 아니라, 해당 선거 종류에 대한 간략한 설명이나 특정 지역구 수 같은 추가 정보를 제공하여 사용자가 필터의 의미를 더 깊이 이해하도록 돕는 것이 좋습니다. (예: "총 17개 시도의 광역단체장 선거")
*   **선택 상태 명확화:** 현재 어떤 필터가 선택되어 있는지 시각적으로 명확하게 구분되는 'active' 상태 스타일을 강화해야 합니다. (예: 배경색 변경, 테두리 강조, 아이콘/텍스트 색상 변경 등)
*   **"전체" 필터 추가:** 모든 선거 종류를 한 번에 선택하거나 초기화할 수 있는 "전체 선거" 필터 버튼을 추가하여 편의성을 높일 수 있습니다.
*   **그룹화 고려 (선택 사항):** 현재 8개는 괜찮지만, 만약 선거 종류가 더 추가될 경우 "단체장 선거", "의원 선거", "비례대표 선거" 등으로 시각적으로 그룹화하는 것을 고려해볼 수 있습니다.

---

### 3. 브레드크럼 네비게이션 (전국→시도→시군구→선거구) 4단계 드릴다운의 UX

**분석:**
제공된 HTML에는 브레드크럼 내비게이션 요소가 포함되어 있지 않지만, "전국→시도→시군구→선거구"의 4단계 드릴다운 개념에 대해 분석합니다.
*   **장점:**
    *   **필수적인 요소:** 지도 기반의 드릴다운 방식 내비게이션에서 브레드크럼은 사용자가 현재 위치를 명확히 인지하고, 이전 단계로 쉽게 돌아갈 수 있도록 돕는 필수적인 UI 요소입니다.
    *   **직관적인 계층:** 한국의 행정 구역 체계(전국 > 시도 > 시군구)와 선거구는 사용자에게 매우 익숙하며, 4단계 드릴다운은 그 계층 구조를 명확히 반영합니다.
*   **단점:** (HTML 미제공으로 인한 추정) 만약 브레드크럼이 너무 작거나 눈에 띄지 않는 위치에 있다면 유용성이 떨어질 수 있습니다.

**개선 제안:**
*   **우선순위: 고**
*   **명확한 위치:** 브레드크럼은 지도 영역 바로 위, 또는 헤더 아래에 명확하고 눈에 잘 띄는 위치에 배치되어야 합니다.
*   **클릭 가능한 요소:** 각 단계는 클릭 가능하여 해당 상위 지역으로 즉시 이동할 수 있도록 해야 합니다. "선거구"와 같이 현재 활성화된 마지막 단계는 클릭 불가능하게 하거나 다른 스타일을 적용하여 현재 위치임을 명확히 합니다.
*   **시각적 구분:** ">" 또는 "/"와 같은 명확한 구분자를 사용하여 각 단계를 시각적으로 분리합니다.
*   **접근성:** 키보드 내비게이션을 지원하고, ARIA 속성(`aria-label`, `aria-current="page"`)을 적절히 사용하여 스크린 리더 사용자에게도 현재 위치와 이동 경로를 명확하게 전달해야 합니다.

---

### 4. 다크 테마에서 색상 대비 및 가독성 문제점 (WCAG 2.1 AA 기준)

**분석:**
다크 테마 `var(--bg-primary: #0a0e17)`를 기반으로 색상 대비를 검토했습니다.
*   **장점:**
    *   `--text-primary` (`#e8ecf4`)와 `--bg-primary` (`#0a0e17`)의 대비는 약 17.5:1로 WCAG AA 기준(4.5:1)을 훨씬 상회하여 매우 높은 가독성을 제공합니다.
    *   `--text-secondary` (`#8b99b5`)와 `--bg-primary` (`#0a0e17`)의 대비도 약 7.6:1로 AA 기준을 충족합니다.
    *   `--accent-blue` (`#3b82f6`) 등 강조 색상도 배경과 대비가 좋아 주요 정보 전달에 효과적입니다.
    *   각 당의 색상 변수도 명확하게 정의되어 있어 시각적으로 구분될 것입니다.
*   **문제점 (WCAG 2.1 AA 기준 미달 또는 경계):**
    *   **`--text-muted`:** (`#5a6785`)와 `--bg-primary` (`#0a0e17`)의 대비는 약 4.5:1로 **AA 기준의 최소치에 간신히 부합**합니다. 작은 글씨나 비필수적인 정보에 사용될 경우 가독성 문제가 발생할 수 있습니다.
        *   특히, `header-subtitle` (`0.8rem`)에 `text-muted`가 사용되고 있는데, 작은 글씨에 대비가 낮은 색상이 적용되어 가독성이 떨어질 수 있습니다.
        *   `search-box input::placeholder` (`--text-muted`)와 `search-box`의 `background: var(--bg-input: #0f1629)`의 대비를 계산하면 약 3.9:1로, **WCAG 2.1 AA 기준(4.5:1)에 미달**합니다. 플레이스홀더 텍스트는 보조적인 정보이지만, 여전히 가독성이 중요합니다.
    *   **`--border-color`:** (`#2a3553`)는 배경색과 대비가 낮아(약 2.1:1) 구분선 등의 비텍스트 요소에는 적합하지만, 만약 이 색상이 텍스트나 중요한 시각적 정보를 전달하는 데 사용된다면 문제가 될 수 있습니다. (현재 CSS에서는 `border-bottom` 등에 사용되어 큰 문제는 없음)

**개선 제안:**
*   **우선순위: 고**
*   **`--text-muted` 개선:**
    *   `--text-muted`의 색상을 현재보다 약간 밝게 조정하여 `header-subtitle` 등의 작은 텍스트에서도 최소 4.5:1 이상의 대비를 확보하도록 합니다. (예: `#6b7a97` 또는 `#7a8baa` 등)
    *   **특히, 플레이스홀더 텍스트의 대비를 높여야 합니다.** `search-box input::placeholder`에는 `text-muted` 대신 `text-secondary`나 새로 정의한 `text-placeholder` 색상을 사용하여 배경(`--bg-input`)과의 대비를 최소 4.5:1 이상으로 맞춰야 합니다. (예: `#8b99b5`를 사용하면 `bg-input`과의 대비가 약 4.5:1로 AA 기준을 충족합니다.)
*   **폰트 크기 및 두께:** `0.8rem` (`header-subtitle`)과 같은 작은 폰트 사이즈에는 대비를 더욱 신경 써야 합니다. 필요한 경우 폰트 두께를 `font-weight: 500` 이상으로 조정하여 가독성을 높일 수 있습니다.
*   **대비 검사 도구 활용:** WebAIM Contrast Checker (webaim.org/resources/contrastchecker/)와 같은 도구를 사용하여 모든 텍스트-배경색 조합이 WCAG 2.1 AA 기준을 충족하는지 정기적으로 검사하는 것을 권장합니다.

---

### 5. 모바일 반응형 대응 상태

**분석:**
제공된 CSS와 HTML만으로는 모바일 반응형 대응이 거의 이루어지지 않은 것으로 판단됩니다.
*   **`meta viewport` 존재:** `<meta name="viewport" content="width=device-width, initial-scale=1.0">` 태그는 모바일 환경에서 화면 너비를 장치 너비에 맞추도록 설정하여 반응형 웹 디자인의 기본 준비는 되어 있습니다.
*   **`body { overflow: hidden; height: 100vh; width: 100vw; }`:** 이 설정은 모바일 환경에서 **심각한 문제**를 야기합니다. `overflow: hidden`은 스크롤을 막아버려, 화면보다 내용이 길어질 경우 콘텐츠를 볼 수 없게 만듭니다. `height: 100vh;`와 `width: 100vw;`는 전체 화면을 꽉 채우는 데는 좋지만, 모바일에서는 스크롤이 불가능하므로 지도의 크기나 다른 요소들이 화면에 맞게 유동적으로 조절되지 않으면 콘텐츠가 잘려 보일 것입니다.
*   **고정된 너비:** `var(--sidebar-width: 320px);`와 `var(--panel-width: 420px);`는 모바일 화면(일반적으로 320px~420px 사이)에서 전체 너비를 차지하거나 초과하여 3컬럼 레이아웃을 완전히 무너뜨릴 것입니다.
*   **`@media` 쿼리 부재:** 제공된 CSS에는 `@media` 쿼리를 사용한 반응형 스타일 규칙이 전혀 보이지 않습니다.

**개선 제안:**
*   **우선순위: 최상 (즉시 해결 필요)**
*   **기본 `body` 스타일 수정:** `body { overflow: hidden; height: 100vh; width: 100vw; }`는 데스크톱 전체 화면 애플리케이션에 적합하지만, 웹 페이지에서는 유연성을 해칩니다. `overflow: hidden`은 특별한 경우(예: 모달 팝업이 열렸을 때 배경 스크롤 방지)에만 조건부로 적용하고, 기본적으로 `body`의 `overflow`는 `unset` 또는 `auto`로 두어 스크롤이 가능하도록 해야 합니다. `height: 100vh`도 모바일 환경에서 주소창 등으로 인해 실제 가용 높이가 변동될 수 있으므로 `min-height: 100vh`를 고려하거나, 메인 콘텐츠 영역만 `height: 100%`를 적용하는 방식으로 변경하는 것이 좋습니다.
*   **미디어 쿼리 구현:**
    *   **레이아웃 전환:** 특정 너비(예: `max-width: 768px`) 이하의 화면에서는 3컬럼 레이아웃을 1컬럼 또는 2컬럼 레이아웃으로 전환해야 합니다.
        *   **좌측 사이드바:** 햄버거 메뉴나 하단 시트(Bottom Sheet) 형태로 숨기고, 사용자가 필요할 때 열 수 있도록 변경합니다.
        *   **우측 패널:** 지도 위에 오버레이되거나, 하단 시트 또는 별도의 페이지/모달 형태로 전환될 수 있습니다.
        *   **중앙 지도:** 모바일 화면의 대부분을 차지하도록 합니다.
    *   **헤더 최적화:** `main-header`의 요소들을 모바일 화면에 맞춰 재배치하거나 일부 요소를 숨길 수 있습니다. (예: `header-subtitle` 숨김, 검색창을 아이콘으로 축소 후 클릭 시 확장, D-day 카운터 간소화 등)
    *   **글꼴 크기 및 간격 조정:** `font-size`, `padding`, `margin` 등을 모바일 환경에 맞게 조정하여 터치 친화적으로 만듭니다.
*   **유연한 너비 사용:** 고정된 `px` 값 대신 `flex-grow`, `width: 100%`, `max-width`, `vw` (viewport width) 등 유동적인 단위를 적극적으로 사용하여 다양한 화면 크기에 대응해야 합니다.

---

### 우선순위별 개선 제안 요약

**1. 최상위 우선순위 (즉시 해결 필요)**
*   **모바일 반응형 대응 (P5):** `@media` 쿼리 도입, 3컬럼 레이아웃을 모바일에 적합한 형태로 전환 (사이드바/패널 숨김/오버레이), `body`의 `overflow: hidden` 제거 및 유연한 높이/너비 전략 적용.
*   **색상 대비 (P4 - 플레이스홀더 텍스트):** `search-box input::placeholder`의 `--text-muted` 색상을 `bg-input`과의 대비가 WCAG AA 기준(4.5:1)을 충족하도록 변경.

**2. 고 우선순위**
*   **브레드크럼 내비게이션 구현 (P3):** HTML에 브레드크럼 요소를 추가하고, 지도 상단 등 명확한 위치에 배치하며, 각 단계가 클릭 가능하도록 구현.
*   **색상 대비 (P4 - `--text-muted` 일반):** `header-subtitle` 등 작은 텍스트에 사용되는 `--text-muted`의 색상을 약간 더 밝게 조정하여 가독성 강화.

**3. 중 우선순위**
*   **3컬럼 레이아웃 유연성 (P1):** 데스크톱 환경에서 좌측 사이드바와 우측 패널을 접거나 확장할 수 있는 토글 기능을 추가하여 중앙 지도의 가시성을 높임.
*   **접근성 전반:** 모든 인터랙티브 요소(버튼, 필터, 검색)에 적절한 ARIA 속성, 키보드 내비게이션, 포커스 인디케이터를 적용.

**4. 하 우선순위 / 추가 개선**
*   **선거 종류 필터 툴팁 정보 강화 (P2):** `filter-tooltip`에 각 선거 종류의 개수에 대한 추가 설명 제공.
*   **선거 종류 필터 활성 상태 명확화 (P2):** 선택된 필터 버튼의 시각적 활성 상태를 더욱 명확하게 디자인.
*   **"전체" 선거 필터 추가 (P2):** 모든 선거를 한 번에 볼 수 있는 "전체" 필터 버튼 고려.

---

이 제안들이 2026년 6.3 전국지방선거 인터랙티브 지도 프로젝트의 UI/UX 완성도를 높이는 데 도움이 되기를 바랍니다.

========================================
## Round 2/5
========================================

네, 이전 분석에서 지적된 문제점들 중 **가장 심각한 3가지**에 대해 심층 분석하여 구체적인 해결 방안을 제시해 드립니다.

---

### 심각한 문제 1: 모바일 반응형 대응 상태

**1. 현재 상태의 구체적 문제 설명:**
제공된 CSS는 `body { overflow: hidden; height: 100vh; width: 100vw; }`로 설정되어 있어 페이지 전체의 스크롤을 막고 뷰포트 크기에 고정시킵니다. 또한, `var(--sidebar-width: 320px);` 및 `var(--panel-width: 420px);`와 같이 데스크톱에 최적화된 고정 너비 레이아웃을 사용하며, 모바일 화면 크기에 대한 `@media` 쿼리 규칙이 전혀 없습니다. 이는 모바일 장치에서 콘텐츠가 화면을 벗어나거나 겹쳐 보이는 등 심각한 레이아웃 문제를 야기합니다.

**2. 사용자 경험에 미치는 영향 (심각도 1-5):**
*   **심각도: 5 (치명적)**
*   모바일 환경에서 웹사이트를 전혀 사용할 수 없게 만들거나, 콘텐츠가 잘려 보이고 스크롤이 불가능하여 필요한 정보를 확인할 수 없게 합니다. 이는 모바일 사용자에게 극도의 불편함을 제공하며, 웹 프로젝트의 접근성과 유용성을 완전히 저해하여 사용자 이탈로 직결됩니다. 현재 웹 사용의 대부분이 모바일에서 이루어지는 현실을 고려할 때, 이는 가장 시급하게 해결해야 할 문제입니다.

**3. 구체적 해결 코드/CSS 제안:**

**a. `body` 및 `main-content` 기본 스타일 수정 (Mobile First 접근):**
`body`의 `overflow: hidden`을 제거하고, `main-content`가 유연하게 높이를 조절하도록 변경합니다.
```css
body {
    font-family: var(--font-family);
    background-color: var(--bg-primary);
    color: var(--text-primary);
    /* overflow: hidden;  <-- 제거 */
    /* height: 100vh;   <-- 제거 또는 min-height로 변경 */
    /* width: 100vw;    <-- 제거 */
    min-height: 100vh; /* 최소 높이를 보장하여 내용이 적을 때도 배경색 유지 */
    overflow-x: hidden; /* 가로 스크롤은 일반적으로 불필요하므로 숨김 */
    overflow-y: auto;   /* 세로 스크롤 허용 */
}

#main-content {
    display: flex;
    flex-direction: column; /* 모바일에서는 콘텐츠를 수직으로 쌓음 (기본값) */
    padding-top: var(--header-height); /* 헤더 아래에 콘텐츠 시작 */
    min-height: calc(100vh - var(--header-height) - var(--footer-height, 0px)); /* 헤더/푸터 제외 최소 높이 */
    position: relative; /* 자식 요소의 absolute/fixed positioning 기준 */
}

/* 지도 컨테이너 (예시: #map-container) */
#map-container {
    flex-grow: 1; /* 남은 공간을 최대한 차지하도록 */
    width: 100%;
    /* height: calc(100vh - var(--header-height)); 모바일에서는 지도가 전체 높이를 차지하도록 (필요 시) */
    /* 필요에 따라 높이 조정 */
    min-height: 400px; /* 지도의 최소 높이 */
}
```

**b. 미디어 쿼리를 사용한 데스크톱 레이아웃 전환:**
모바일 우선(`Mobile First`) 디자인을 기본으로 하고, 특정 화면 너비 이상에서 데스크톱 3컬럼 레이아웃으로 전환합니다.

```css
/* ----- Mobile Layout (기본값) ----- */

/* 좌측 사이드바 */
#left-sidebar {
    position: fixed; /* 화면에 고정 */
    top: 0; /* 헤더가 fixed이므로 0부터 시작 */
    left: 0;
    width: 100%; /* 전체 너비 */
    height: 100vh; /* 전체 화면 높이 */
    background: var(--bg-primary);
    transform: translateX(-100%); /* 기본적으로 화면 왼쪽 밖으로 숨김 */
    transition: transform 0.3s ease-in-out;
    z-index: 1000; /* 헤더보다 높게, 지도가 아닌 다른 UI 위에 */
    overflow-y: auto; /* 사이드바 내용이 길면 스크롤 가능 */
    padding-top: var(--header-height); /* 헤더 영역만큼 패딩 */
    box-shadow: var(--shadow-lg);
}

#left-sidebar.is-open { /* JavaScript로 .is-open 클래스 토글 */
    transform: translateX(0); /* 열리면 화면에 보임 */
}

/* 우측 패널 (HTML에 없지만, 존재한다 가정) */
#right-panel {
    position: fixed;
    bottom: 0; /* 화면 하단에 고정 (Bottom Sheet 형태) */
    left: 0;
    width: 100%;
    max-height: 60vh; /* 화면 높이의 60% */
    background: var(--bg-card);
    transform: translateY(100%); /* 기본적으로 화면 아래 밖으로 숨김 */
    transition: transform 0.3s ease-in-out;
    z-index: 1000;
    overflow-y: auto;
    border-top-left-radius: 12px;
    border-top-right-radius: 12px;
    box-shadow: var(--shadow-lg);
    padding: 16px; /* 내부 패딩 */
}

#right-panel.is-open { /* JavaScript로 .is-open 클래스 토글 */
    transform: translateY(0); /* 열리면 화면에 보임 */
}

/* 헤더 최적화 */
#main-header {
    padding: 0 10px; /* 모바일에서 패딩 줄임 */
    justify-content: space-between;
}

.header-left {
    gap: 8px; /* 간격 줄임 */
}

.header-left .header-subtitle {
    display: none; /* 모바일에서는 부제 숨김 */
}

.header-center {
    flex: 1; /* 검색창이 남은 공간 최대한 차지 */
    max-width: none; /* 최대 너비 제한 해제 */
    margin: 0 10px;
}

.header-right {
    display: none; /* D-day, 사전투표 정보는 모바일에서 숨김 또는 햄버거 메뉴 안에 배치 */
}

/* 햄버거 메뉴 버튼 (HTML에 추가 필요) */
.mobile-menu-toggle {
    display: block; /* 모바일에서만 보이도록 */
    background: none;
    border: none;
    color: var(--text-primary);
    font-size: 1.5rem;
    cursor: pointer;
    z-index: 1001; /* 사이드바 위에 */
}
/* 예시: header-left에 추가 */
/* <button class="mobile-menu-toggle" aria-label="메뉴 열기"><i class="fas fa-bars"></i></button> */


/* ----- Desktop Layout (768px 이상) ----- */
@media (min-width: 768px) {
    #main-content {
        flex-direction: row; /* 데스크톱에서는 수평 정렬 */
        justify-content: space-between;
        height: calc(100vh - var(--header-height)); /* 헤더 제외 전체 높이 */
        padding-top: 0; /* main-content에 이미 고정 헤더 영역이 포함되므로 padding-top은 0 */
    }

    #left-sidebar {
        position: relative; /* 고정 해제 */
        width: var(--sidebar-width); /* 고정 너비 */
        height: 100%; /* 부모 (#main-content)의 높이 상속 */
        transform: translateX(0); /* 항상 보임 */
        flex-shrink: 0; /* 너비 고정 */
        padding-top: 0; /* 헤더 아래 위치로 이동하므로 패딩 불필요 */
        box-shadow: none;
    }

    #right-panel {
        position: relative;
        width: var(--panel-width);
        height: 100%;
        transform: translateY(0);
        flex-shrink: 0;
        border-top-left-radius: 0;
        border-top-right-radius: 0;
        box-shadow: none;
    }

    #map-container {
        flex-grow: 1;
        width: auto; /* flex-grow가 너비를 조절 */
        height: 100%;
        min-height: unset; /* 데스크톱에서는 최소 높이 제한 해제 */
    }

    #main-header {
        padding: 0 20px;
    }
    .header-left .header-subtitle {
        display: block;
    }
    .header-center {
        max-width: 480px;
        margin: 0 24px;
    }
    .header-right {
        display: flex;
    }

    .mobile-menu-toggle {
        display: none; /* 데스크톱에서 숨김 */
    }
}
```

**4. 해결 우선순위:** **최상 (프로젝트의 핵심 사용성 확보를 위해 즉시 해결해야 합니다.)**

---

### 심각한 문제 2: 색상 대비 및 가독성 (플레이스홀더 텍스트)

**1. 현재 상태의 구체적 문제 설명:**
`search-box input::placeholder`에 사용된 `--text-muted` (`#5a6785`) 색상과 검색창의 배경색인 `--bg-input` (`#0f1629`) 간의 대비율은 약 **3.9:1**입니다. 이는 웹 콘텐츠 접근성 가이드라인(WCAG) 2.1 AA 기준인 4.5:1에 명백히 미달합니다.

**2. 사용자 경험에 미치는 영향 (심각도 1-5):**
*   **심각도: 4 (높음)**
*   플레이스홀더 텍스트는 입력 필드의 목적을 시각적으로 안내하는 중요한 요소입니다. 대비율이 낮으면 저시력자, 색맹 사용자, 또는 밝은 주변 환경에서 모바일 장치를 사용하는 사용자들이 플레이스홀더 텍스트를 읽기 어렵게 됩니다. 이로 인해 사용자가 입력 필드의 기능을 이해하는 데 혼란을 겪거나, 입력 필드가 비어있음에도 불구하고 텍스트가 잘 보이지 않아 입력해야 할 정보를 놓치게 될 수 있습니다. 이는 기본적인 정보 전달 실패로 이어져 접근성 및 사용성에 부정적인 영향을 미칩니다.

**3. 구체적 해결 코드/CSS 제안:**

**a. `search-box input::placeholder`에 `--text-secondary` 적용:**
현재 `--text-secondary` (`#8b99b5`)와 `--bg-input` (`#0f1629`)의 대비율은 약 **4.5:1**로 WCAG AA 기준을 충족합니다. `text-muted` 대신 이 색상을 플레이스홀더에 적용하는 것이 가장 간단하고 효과적인 해결책입니다.
```css
/* style.css */
.search-box input::placeholder {
    color: var(--text-secondary); /* 현재 #8b99b5. bg-input #0f1629 대비 4.5:1로 AA 기준 충족 */
}
```

**b. `text-muted` 색상 자체를 밝게 조정:**
만약 `text-muted`를 플레이스홀더 외에 다른 곳에서도 사용하며, 그곳에서도 대비 문제가 발생할 수 있다면, `text-muted` 자체의 색상 값을 밝게 조정할 수 있습니다. 예를 들어, `--text-muted: #6b7a97`로 변경하면 `--bg-primary` (`#0a0e17`)와의 대비는 약 5.5:1이 되고, `--bg-input` (`#0f1629`)와의 대비는 약 4.8:1이 되어 두 경우 모두 AA 기준을 충족합니다.
```css
/* style.css */
:root {
    /* ... 기타 변수 ... */
    --text-muted: #6b7a97; /* 기존 #5a6785에서 밝게 조정 */
    /* ... 기타 변수 ... */
}
/* 플레이스홀더는 여전히 text-muted를 사용하면 됩니다. */
```

**4. 해결 우선순위:** **최상 (WCAG AA 기준 미달은 법적, 윤리적 접근성 측면에서 반드시 해결해야 할 문제입니다.)**

---

### 심각한 문제 3: 브레드크럼 네비게이션 부재

**1. 현재 상태의 구체적 문제 설명:**
제공된 HTML 코드에는 지도 영역을 드릴다운하여 전국, 시도, 시군구, 선거구와 같이 계층적으로 탐색할 때 사용자가 현재 위치를 인지하고 상위 단계로 쉽게 이동할 수 있도록 돕는 **브레드크럼 내비게이션 요소가 전혀 없습니다.**

**2. 사용자 경험에 미치는 영향 (심각도 1-5):**
*   **심각도: 4 (높음)**
*   인터랙티브 지도에서 사용자가 지역을 확대하거나 특정 선거구를 선택하여 더 깊은 정보에 접근할 때, 브레드크럼이 없으면 사용자는 현재 자신이 보고 있는 정보가 전체 계층 구조에서 어느 위치에 있는지 파악하기 어렵습니다. 이는 "나는 지금 어디에 있는가?"라는 혼란을 유발하며, "어떻게 이전 단계로 돌아가지?"라는 질문에 대한 명확한 해답을 제공하지 못합니다. 결과적으로, 사용자들은 탐색 경로에서 길을 잃거나, 의도치 않게 헤매는 등 심각한 탐색 효율성 저하와 불쾌한 사용자 경험을 겪게 됩니다.

**3. 구체적 해결 코드/CSS 제안:**

**a. HTML 구조 추가 (예시: 헤더 아래 또는 지도 영역 상단)**
브레드크럼은 헤더 바로 아래 또는 지도 영역의 상단에 위치하여 사용자가 항상 현재 위치를 확인할 수 있도록 합니다.
```html
<body>
    <!-- ... Header ... -->

    <!-- Breadcrumb Navigation -->
    <nav aria-label="브레드크럼" id="breadcrumb-nav">
        <ol class="breadcrumb-list">
            <li class="breadcrumb-item">
                <a href="#" data-region-id="national">전국</a>
            </li>
            <!-- JavaScript로 동적으로 추가될 요소들 -->
            <!-- <li class="breadcrumb-item"><a href="#" data-region-id="seoul">서울특별시</a></li> -->
            <!-- <li class="breadcrumb-item"><a href="#" data-region-id="gangnam">강남구</a></li> -->
            <!-- <li class="breadcrumb-item" aria-current="page">강남구 제1선거구</li> -->
        </ol>
    </nav>

    <!-- ... Main Content ... -->
</body>
```

**b. CSS 스타일링:**
다크 테마에 어울리면서 가독성 높은 브레드크럼 스타일을 적용합니다.

```css
/* style.css */
#breadcrumb-nav {
    position: fixed; /* 헤더처럼 고정된 위치에 */
    top: var(--header-height); /* 헤더 바로 아래 */
    left: 0; /* 전체 너비로 설정 */
    right: 0;
    padding: 12px 20px;
    background: rgba(17, 24, 39, 0.85); /* 배경색 투명도 조절 및 블러 효과 */
    backdrop-filter: blur(10px);
    border-bottom: 1px solid var(--border-color);
    z-index: 990; /* 헤더보다 낮고, 메인 콘텐츠 위에 */
    display: flex;
    align-items: center;
    min-height: 48px; /* 최소 높이 설정 */
}

.breadcrumb-list {
    list-style: none;
    display: flex;
    align-items: center;
    margin: 0;
    padding: 0;
    flex-wrap: nowrap; /* 아이템이 한 줄에 표시되도록 */
    overflow-x: auto; /* 너무 길어지면 가로 스크롤 허용 */
    -webkit-overflow-scrolling: touch; /* iOS에서 부드러운 스크롤 */
}

.breadcrumb-item {
    display: flex;
    align-items: center;
    font-size: 0.95rem;
    color: var(--text-secondary); /* 비활성 링크 기본 색상 */
    flex-shrink: 0; /* 아이템이 줄어들지 않도록 */
}

.breadcrumb-item a {
    color: var(--text-accent); /* 링크는 강조색 */
    text-decoration: none;
    transition: color 0.2s ease;
    padding: 2px 0; /* 클릭 영역 확보 */
}

.breadcrumb-item a:hover,
.breadcrumb-item a:focus {
    color: var(--accent-blue);
    text-decoration: underline;
}

.breadcrumb-item:last-child {
    color: var(--text-primary); /* 현재 페이지는 주 텍스트 색상 */
    font-weight: 600;
    cursor: default; /* 현재 페이지는 클릭 불가능 */
}

.breadcrumb-item + .breadcrumb-item::before {
    content: '/'; /* 구분자 */
    margin: 0 8px;
    color: var(--text-muted);
}

/* 모바일 반응형 조절 (Header에 햄버거 메뉴를 추가하여 사이드바가 덮는 경우 등 고려) */
@media (max-width: 767px) {
    #breadcrumb-nav {
        padding: 10px 15px;
        position: static; /* 모바일에서는 헤더 아래에 고정되지 않고 콘텐츠 흐름에 따름 */
        margin-top: var(--header-height); /* 헤더 높이만큼 마진 */
        background: var(--bg-primary); /* 완전 불투명하게 */
        backdrop-filter: none;
    }
    .breadcrumb-item {
        font-size: 0.85rem;
    }
}
```

**c. JavaScript 로직 (개념):**
지도 상호작용 (지역 클릭, 검색 결과 선택 등)에 따라 브레드크럼 리스트를 동적으로 업데이트하는 JavaScript 로직이 필요합니다. 각 `<a>` 태그의 `data-region-id`를 활용하여 상위 지역으로 이동하는 이벤트를 처리합니다.

**4. 해결 우선순위:** **고 (지도 기반 인터랙션의 핵심 내비게이션 요소이며, 사용자 이탈을 방지하기 위해 중요합니다.)**

========================================
## Round 3/5
========================================

이전 분석에 대해 재검토하고, 사용자의 요청 사항에 따라 추가 분석 및 제안을 드립니다.

---

## 6.3 전국지방선거 인터랙티브 선거 정보 지도 UI/UX 재검토

이전 분석 내용은 전반적으로 정확하며, 프로젝트의 핵심 사용성과 접근성에 영향을 미치는 주요 문제점들을 잘 지적했습니다. 특히 모바일 반응형 대응, 색상 대비, 브레드크럼 내비게이션 부재는 가장 시급하게 개선해야 할 부분들입니다.

아래에서는 요청하신 네 가지 관점에서 이전 분석을 재검토하고 추가 제안을 드립니다.

---

### 1. 이전 분석에서 사실과 다른 부분이 있는가? (자기 교정)

이전 분석에서 제시된 문제점 자체는 정확하며, 심각도 평가도 적절합니다. 다만, 일부 제안된 CSS 코드의 상호작용에서 잠재적인 충돌 가능성이 있어 해당 부분을 정정하고 보완합니다.

**주요 정정 및 보완 필요 사항:**

*   **모바일 반응형 레이아웃 (`main-content`의 `padding-top`)과 브레드크럼 (`margin-top`/`position`) 제안 간의 잠재적 CSS 충돌:**
    *   이전 답변에서 모바일 환경에서 `#main-content`에 `padding-top: var(--header-height);`를 적용하고, 동시에 `#breadcrumb-nav`에 `position: static; margin-top: var(--header-height);`를 적용하는 제안이 있었습니다. 이 두 가지가 동시에 적용될 경우, 콘텐츠가 헤더 높이만큼 두 번 밀려나 이중의 상단 여백이 생길 수 있습니다.
    *   **정정:** `main-content`의 `padding-top`과 `breadcrumb-nav`의 `margin-top` 또는 `position` 속성은 유기적으로 조절되어야 합니다. 가장 깔끔하고 권장되는 해결책은 다음과 같습니다.
        *   **모바일 (브레드크럼이 `main-content` 내부에 포함되도록 구조 변경):**
            ```html
            <body>
                <header id="main-header">...</header>
                <main id="main-content">
                    <nav aria-label="브레드크럼" id="breadcrumb-nav">...</nav>
                    <!-- 중앙 지도 (#map-container), 우측 패널 등의 메인 콘텐츠 -->
                </main>
                <!-- Footer (있다면) -->
            </body>
            ```
            이 경우, `main-content`가 고정된 헤더 바로 아래에서 시작하도록 `padding-top`을 적용하고, `breadcrumb-nav`는 `main-content` 내부의 일반적인 흐름에 따라 배치되므로 별도의 `margin-top`은 불필요합니다.
            ```css
            /* Mobile First (기본값) */
            #main-content {
                display: flex;
                flex-direction: column; /* 모바일에서는 수직으로 쌓음 */
                min-height: calc(100vh - var(--header-height)); /* 헤더 제외 최소 높이 */
                padding-top: var(--header-height); /* 고정된 헤더만큼 밀어냄 */
                position: relative;
                /* ... 기타 모바일 스타일 ... */
            }
            #breadcrumb-nav {
                position: static; /* 메인 콘텐츠 흐름에 따름 */
                padding: 10px 15px; /* 모바일용 패딩 */
                background: var(--bg-primary); /* 불투명 배경 */
                backdrop-filter: none;
                /* margin-top은 더 이상 필요 없음 */
                border-bottom: 1px solid var(--border-color); /* 구분선은 유지 */
            }
            ```
        *   **데스크톱 (헤더와 브레드크럼 모두 고정):**
            데스크톱에서는 헤더와 브레드크럼이 모두 상단에 고정되어 있으므로, `main-content`는 두 요소의 높이만큼 아래에서 시작해야 합니다. 이를 위해 `body`에 `padding-top`을 적용하고 `main-content`는 그 공간 안에서 `height: 100%`를 차지하도록 하는 것이 가장 안정적입니다.
            ```css
            @media (min-width: 768px) {
                body {
                    padding-top: calc(var(--header-height) + var(--breadcrumb-height, 48px)); /* 헤더와 브레드크럼 높이만큼 패딩 */
                    overflow-y: auto; /* body 스크롤 허용 */
                    overflow-x: hidden;
                }
                #main-content {
                    flex-direction: row; /* 데스크톱에서는 수평 정렬 */
                    height: 100%; /* body 패딩 후 남은 공간 100% 사용 */
                    padding-top: 0; /* body가 이미 처리했으므로 */
                    min-height: unset; /* 더 이상 필요 없음 */
                }
                #breadcrumb-nav {
                    position: fixed; /* 헤더처럼 고정 */
                    top: var(--header-height); /* 헤더 바로 아래 */
                    left: 0; right: 0;
                    z-index: 990;
                    padding: 12px 20px; /* 데스크톱용 패딩 */
                    background: rgba(17, 24, 39, 0.85); /* 블러 효과 */
                    backdrop-filter: blur(10px);
                }
            }
            ```
            `--breadcrumb-height`는 브레드크럼의 최종 렌더링 높이를 나타내는 CSS 변수로 미리 정의하거나, JavaScript로 동적으로 계산하여 적용할 수 있습니다.

---

### 2. 제안한 해결책이 다른 부분에 부작용을 일으킬 수 있는가?

대부분의 제안은 기존 문제 해결에 중점을 두었으므로 심각한 부작용은 예상되지 않지만, 몇 가지 주의할 점이 있습니다.

*   **모바일 반응형 레이아웃 변경:**
    *   **JavaScript 제어의 필수성:** 좌측 사이드바(햄버거 메뉴)와 우측 패널(바텀 시트 등)을 모바일에서 `transform` 등을 이용해 숨기고 보이게 하는 방식은 JavaScript가 필수적입니다. 이 JS 로직이 구현되지 않으면, 사이드바와 패널이 영구적으로 숨겨져 사용자에게 접근 불가능하거나, 반대로 항상 열려있어 콘텐츠를 가리는 문제가 발생합니다. 토글 버튼과 함께 JS 구현을 반드시 동반해야 합니다.
    *   **D3.js 지도 크기 조정:** `main-content` 및 `#map-container`의 크기가 유동적으로 변하므로, D3.js 지도가 이 새로운 크기에 맞춰 정확하게 리렌더링되거나 확대/축소 비율이 조정되도록 JavaScript 로직(특히 `resize` 이벤트 리스너)을 잘 구현해야 합니다.
    *   **스크롤 영역:** `body`에 `overflow-y: auto`를 적용하면 `body` 자체가 스크롤 가능해집니다. 만약 특정 패널이나 사이드바 내부에서만 스크롤이 필요한 경우, 해당 요소에 별도의 `overflow-y: auto`를 적용하고 높이를 제한해야 합니다.

*   **색상 대비 개선 (`--text-muted` 조정):**
    *   `--text-muted` 색상을 밝게 조정할 경우, 현재 `text-muted`가 사용되는 모든 곳에서 색상이 변경됩니다. 이는 다른 UI 요소들의 의도된 미적 감각이나 정보 계층 구조(덜 중요한 정보)를 약간 변경할 수 있습니다. 하지만 이는 WCAG AA 기준 충족이라는 더 중요한 목표를 위한 것이므로, 변경된 색상이 다른 요소들과 잘 어울리는지 확인하는 미세 조정 과정이 필요할 뿐 큰 부작용은 아닙니다.

---

### 3. 아직 다루지 않은 중요한 문제가 있는가?

제공된 HTML과 CSS만으로 판단하기 어려운 부분들이 있지만, UI/UX 관점에서 추가적으로 검토할 만한 중요한 문제점들을 제시합니다.

*   **a. 로딩 스크린의 잠재적 문제 및 개선:**
    *   **현재 문제점:** 로딩 스크린(`id="loading-screen"`)은 `z-index: 10000`으로 모든 UI 위에 올라와 초기로딩 시 사용자에게 정보를 제공하는 좋은 방식입니다. 하지만, D3.js 지도 로딩이나 Chart.js 데이터 로딩이 느리거나 에러가 발생하여 `hidden` 클래스가 추가되지 않으면, 사용자는 영구적으로 로딩 스크린만 보게 되어 서비스 이용이 불가능해집니다.
    *   **사용자 경험 영향:** 로딩 지연 또는 무한 로딩은 사용자에게 좌절감을 주며 웹사이트 이탈로 직결됩니다.
    *   **개선 제안:**
        *   **타임아웃 및 에러 처리:** 일정 시간(예: 10~15초) 내에 로딩이 완료되지 않으면 로딩 스크린을 강제로 해제하고, 사용자에게 로딩 지연 또는 오류가 발생했음을 알리는 메시지 (예: "데이터 로딩이 지연되고 있습니다. 잠시 후 다시 시도하거나 새로고침 해주세요.")와 함께 '새로고침' 버튼을 제공해야 합니다.
        *   **단계별 로딩 표시:** 지도가 먼저 로딩되고 나서 후보/여론조사 데이터가 로딩된다면, "지도 로딩 중...", "후보 데이터 로딩 중...", "여론조사 데이터 분석 중..."과 같이 단계별 메시지를 보여주는 것이 사용자의 인내심을 유지하는 데 도움이 됩니다.
        *   **최소 로딩 시간 보장 (FOUC 방지):** 너무 빨리 로딩이 완료되더라도 최소 0.5초~1초 정도는 로딩 스크린을 유지하여 UI가 갑자기 나타나는 "Flash of Unstyled Content (FOUC)" 현상을 방지하고, 사용자에게 로딩이 있었음을 인지시킵니다.

*   **b. 전반적인 접근성 (WCAG) 추가 검토 사항:**
    *   **키보드 내비게이션 및 포커스 관리:** 모든 인터랙티브 요소(버튼, 링크, 검색 필드, 필터 버튼, 지도상의 지역 등)는 키보드로 접근 가능해야 하며, `Tab` 키로 이동 시 포커스 인디케이터(`:focus-visible` 스타일)가 명확하게 보여야 합니다. 현재 `logo:focus-visible`에 대한 스타일은 있지만, 다른 버튼(`filter-btn`, `banner-close`)이나 링크에는 없는 것으로 보입니다. 모든 버튼 및 링크에 `:focus-visible` 스타일을 적용해야 합니다.
    *   **ARIA 속성 활용:** `home-link`에 `aria-label`이 잘 적용되어 있지만, 다른 버튼들(`filter-btn`, `banner-close`, 모바일 햄버거 메뉴)에는 `aria-label`이나 `aria-describedby` 등의 속성이 누락되어 있을 수 있습니다. 스크린 리더 사용자를 위해 각 요소의 역할과 상태를 명확히 전달해야 합니다. 특히 토글될 사이드바와 패널에 `aria-expanded` (열림/닫힘 상태), 필터 버튼의 선택 상태에 `aria-selected` 등을 활용해야 합니다.
    *   **동적 콘텐츠 변화 알림:** 지도에서 지역이 변경되거나 필터가 적용되어 데이터가 새로 로딩될 때, 스크린 리더 사용자에게 이러한 변화를 알리는 `aria-live` 영역을 활용하는 것이 좋습니다.

*   **c. 투명성 미션 배너 UX 개선:**
    *   **현재 문제점:** `transparency-banner`는 중요한 정보이지만, 현재 HTML 구조상 `main-header` 위에 위치하고 있어, CSS에서 `position: fixed` 등으로 처리되지 않으면 헤더가 이 배너를 가릴 수 있습니다. 또한, 사용자는 페이지 이동 시 배너를 반복해서 닫아야 하는 불편함을 겪을 수 있습니다.
    *   **사용자 경험 영향:** 중요한 정보가 가려지거나, 반복적인 조작으로 인해 피로도를 유발할 수 있습니다.
    *   **개선 제안:**
        *   **고정 위치 확보:** 배너가 헤더 바로 아래에 항상 사용자에게 보이도록 `position: fixed; top: var(--header-height);` 등으로 고정하거나, 헤더 내부에 중요한 정보로 통합하는 것을 고려할 수 있습니다.
        *   **"다시 보지 않기" 기능:** 닫기 버튼(`banner-close`) 클릭 시 배너를 완전히 숨기고, `localStorage` 등을 이용하여 사용자가 이 배너를 다시 보지 않도록 하는 기능을 제공하는 것이 좋습니다.

*   **d. 상호작용 피드백 부족:**
    *   **필터 선택 상태:** `election-type-filters` 내 각 `filter-btn`은 현재 어떤 선거 종류가 선택되어 있는지 시각적으로 명확하게 구분되는 'active' 상태 스타일을 강화해야 합니다. (예: 배경색 변경, 테두리 강조, 아이콘/텍스트 색상 변경 등)
    *   **지도 상호작용:** 지도상의 지역을 호버(hover)하거나 클릭했을 때, 해당 지역이 강조되거나 선택되었음을 명확하게 보여주는 시각적 피드백이 중요합니다. (색상 변경, 테두리 추가, 팝업 툴팁 등)

---

### 4. 한국 사용자 특성(50대+ 유권자, 정치 정보 탐색 패턴)을 고려한 추가 제안

2026년 지방선거는 모든 연령대의 유권자가 대상이지만, 특히 정치 정보에 관심이 많고 투표율이 높은 50대 이상 유권자층의 특성을 고려하는 것은 매우 중요합니다.

*   **a. 가독성 강화 (WCAG AAA 준수 고려):**
    *   **폰트 크기 및 두께:** 기본 폰트 사이즈 `14px`는 젊은층에게는 괜찮지만, 50대 이상 사용자에게는 다소 작게 느껴질 수 있습니다. 핵심 정보(제목, 통계 숫자, 후보 이름 등)는 더 큰 폰트 (`16px` 이상)와 충분한 줄 간격 (`line-height: 1.5` 이상)을 적용하는 것을 권장합니다. 필요한 경우 `font-weight: 500` 이상을 활용하여 텍스트를 더 또렷하게 보이도록 합니다.
    *   **색상 대비:** 현재 WCAG AA를 목표로 하고 있지만, 50대 이상 사용자의 시력 저하를 고려하여 핵심 정보에는 WCAG AAA 수준(7:1)에 가까운 대비율을 확보하는 것이 좋습니다. 특히 `--text-muted`와 같은 보조 텍스트도 충분히 밝게 유지하여 작은 글씨라도 명확하게 읽을 수 있도록 해야 합니다.
    *   **텍스트 밀도 및 여백:** 정보 밀도가 너무 높으면 읽기 어렵고 눈의 피로를 유발합니다. 각 섹션, 카드, 텍스트 단락 간 여백(padding/margin)을 충분히 확보하고, 중요한 정보는 목록이나 카드 형태로 명확하게 분리하여 시각적 부담을 줄여야 합니다.

*   **b. 직관적인 내비게이션 및 정보 구조:**
    *   **용어의 명확성 및 툴팁 활용:** "광역단체장", "기초단체장" 등의 용어는 익숙하지만, "광역의원 비례대표"처럼 다소 복잡하거나 약어로 사용될 수 있는 용어는 툴팁 등을 통해 간략한 설명을 제공하는 것이 좋습니다. 이는 정보 이해도를 높이고 혼란을 줄입니다.
    *   **브레드크럼의 중요성 재강조:** 위에서 강조했듯이, 현재 위치를 명확히 보여주고 이전 단계로 쉽게 돌아갈 수 있는 브레드크럼은 정보 탐색에 익숙하지 않은 사용자에게 특히 중요합니다. 항상 눈에 잘 띄는 위치에 배치하고 명확하게 작동하도록 해야 합니다.
    *   **일관된 인터랙션:** 필터, 지도 클릭, 검색 등 모든 인터랙션 방식이 일관되어야 사용자가 학습하고 쉽게 적응할 수 있습니다. 예상 가능한 방식으로 UI가 동작하도록 디자인해야 합니다.
    *   **"전국 개황" 섹션:** 이 섹션은 현재 전국의 큰 그림을 제공하여 좋습니다. 50대 이상 유권자는 전체적인 흐름과 함께 본인의 지역구 정보를 찾아가는 경우가 많으므로, 이와 같은 요약 정보는 매우 유용합니다.

*   **c. 핵심 정보의 명확한 강조 및 신뢰성:**
    *   **후보자 정보 시각화:** 실제 선거에서는 후보자의 소속 정당, 이름, 사진, 경력, 공약 요약 등이 가장 중요한 정보입니다. 우측 패널에 이러한 정보가 명확하고 보기 좋게 배치되어야 합니다. 특히 정당 색상(`--party-democratic`, `--party-ppp` 등)을 일관되게 사용하여 후보자의 소속 정당을 시각적으로 빠르게 인지하도록 돕는 것은 매우 효과적입니다.
    *   **여론조사 데이터 투명성:** "여론조사 투명성 플랫폼" 배너처럼, 여론조사 데이터의 신뢰성을 명확히 보여주는 것이 중요합니다. 차트에서 각 정당의 지지율 변동 추이, 후보 지지율 등을 쉽게 비교할 수 있도록 시각화하고, 조사기관, 조사 기간, 표본 오차 등 필수 정보를 반드시 함께 표시하여 신뢰도를 높여야 합니다.

*   **d. 터치 및 클릭 영역 확대:**
    *   모바일 환경에서는 물론, 데스크톱 환경에서도 50대 이상 사용자는 섬세한 마우스 컨트롤에 어려움을 느낄 수 있습니다. 필터 버튼, 지도상의 지역 클릭 영역 등 모든 인터랙티브 요소의 **클릭 가능한 영역(hit area)**을 충분히 넓게 확보해야 오작동을 줄이고 사용 편의성을 높일 수 있습니다. (WCAG 기준 최소 44x44px 권장)

*   **e. 로딩 시간 단축 및 지속적인 피드백:**
    *   느린 로딩은 모든 사용자에게 불쾌하지만, 특히 나이가 많은 사용자들은 기다림에 더 취약할 수 있습니다. 데이터 로딩 시간을 최소화하고, 로딩 스피너와 함께 "투명한 선거 정보를 불러오는 중..."과 같은 명확하고 긍정적인 메시지를 통해 사용자에게 현재 상태를 지속적으로 알려주어야 합니다.

---

이러한 심층 분석과 추가 제안들이 2026년 6.3 전국지방선거 인터랙티브 지도 프로젝트의 UI/UX 완성도를 높이고, 모든 사용자, 특히 50대 이상 유권자들이 쉽고 편리하게 선거 정보를 탐색할 수 있도록 돕는 데 기여하기를 바랍니다.

========================================
## Round 4/5
========================================

지금까지의 모든 분석 내용을 바탕으로, 프로젝트의 UI/UX 개선을 위한 실행 가능한 액션 아이템을 우선순위에 따라 정리했습니다. 각 항목에 대해 구체적인 변경 내용과 예상 효과를 제시합니다.

---

## 6.3 전국지방선거 인터랙티브 선거 정보 지도 UI/UX 액션 아이템

### 1. 즉시 수정 (코드 변경 1시간 이내)

**1.1. `body` 기본 스크롤 동작 및 높이 설정 수정**
*   **무엇을 어디서 변경하는가:** `css/style.css`, `body` 선택자.
*   **변경 전:**
    ```css
    body {
        /* ... */
        overflow: hidden;
        height: 100vh;
        width: 100vw;
    }
    ```
*   **변경 후:**
    ```css
    body {
        /* ... */
        min-height: 100vh; /* 최소 높이를 보장하여 내용이 적을 때도 배경색 유지 */
        overflow-x: hidden; /* 가로 스크롤은 일반적으로 불필요하므로 숨김 */
        overflow-y: auto;   /* 세로 스크롤 허용 (가장 중요) */
        /* width: 100vw; 는 모바일 스크롤 문제를 야기할 수 있으므로 제거하는 것이 좋습니다. */
    }
    ```
*   **예상 효과:** 모바일 환경에서 콘텐츠가 화면을 벗어나도 스크롤하여 볼 수 있게 되어 웹사이트 사용성이 확보됩니다. 데스크톱에서도 유연한 높이 관리가 가능해집니다.

**1.2. 플레이스홀더 텍스트 색상 대비 개선**
*   **무엇을 어디서 변경하는가:** `css/style.css`, `.search-box input::placeholder` 선택자 및 `:root` 변수.
*   **변경 전:**
    ```css
    :root {
        --text-muted: #5a6785; /* #0a0e17 (bg-primary)와 대비 4.5:1, #0f1629 (bg-input)와 대비 3.9:1 */
    }
    .search-box input::placeholder {
        color: var(--text-muted);
    }
    ```
*   **변경 후 (방안 1: 플레이스홀더만 변경):**
    ```css
    .search-box input::placeholder {
        color: var(--text-secondary); /* 현재 #8b99b5. bg-input #0f1629 대비 4.5:1로 WCAG AA 기준 충족 */
    }
    ```
*   **변경 후 (방안 2: `--text-muted` 자체를 밝게 조정):**
    ```css
    :root {
        --text-muted: #6b7a97; /* 기존 #5a6785에서 밝게 조정. #0a0e17 대비 5.5:1, #0f1629 대비 4.8:1 */
    }
    /* .search-box input::placeholder는 여전히 var(--text-muted) 사용 */
    ```
*   **예상 효과:** 저시력자 및 일반 사용자 모두 검색창 플레이스홀더 텍스트를 명확하게 읽을 수 있게 되어 접근성과 사용성이 향상됩니다. WCAG 2.1 AA 기준을 충족합니다.

**1.3. 투명성 미션 배너 위치 및 고정 처리**
*   **무엇을 어디서 변경하는가:** `css/style.css`, `#transparency-banner` 선택자.
*   **변경 전:** (HTML 구조상 `main-header` 위에 위치)
    ```css
    /* #transparency-banner에 대한 CSS는 제공되지 않았지만, 기본적으로 fixed가 아니라면 헤더에 가려질 수 있음 */
    /* 가정: 기본 static 또는 relative */
    ```
*   **변경 후:**
    ```css
    #transparency-banner {
        position: fixed; /* 화면에 고정 */
        top: 0; /* 화면 최상단 */
        left: 0;
        right: 0;
        z-index: 1010; /* 헤더(z-index: 1000)보다 높게 설정 */
        background: var(--bg-secondary); /* 배경색 지정 (혹은 HTML에 있는 transparency-banner 클래스) */
        padding: 10px 20px;
        color: var(--text-primary);
        display: flex;
        align-items: center;
        justify-content: center;
        /* ... 기존 스타일 ... */
    }
    /* 헤더가 배너 아래에 위치하도록 main-content의 padding-top 조정 필요 */
    ```
*   **예상 효과:** 중요한 투명성 배너가 항상 화면 상단에 명확하게 보이며, 헤더에 가려지는 문제를 방지합니다. 사용자가 정보를 놓치지 않도록 돕습니다.

---

### 2. 단기 개선 (1-3일)

**2.1. 브레드크럼 내비게이션 HTML 구조 추가 및 기본 CSS 스타일링**
*   **무엇을 어디서 변경하는가:** `index.html` (Header 아래 또는 `main` 내부 상단), `css/style.css`.
*   **변경 전:** (없음)
*   **변경 후 (HTML - `<main>` 태그 내부에 배치하여 모바일/데스크톱 모두 유연하게 처리):**
    ```html
    <body>
        <header id="main-header">...</header>
        <main id="main-content">
            <!-- Breadcrumb Navigation -->
            <nav aria-label="브레드크럼" id="breadcrumb-nav">
                <ol class="breadcrumb-list">
                    <li class="breadcrumb-item">
                        <a href="#" data-region-id="national">전국</a>
                    </li>
                    <!-- JavaScript로 동적으로 추가될 요소들 -->
                </ol>
            </nav>
            <!-- ... Left Sidebar (aside) ... -->
            <!-- ... 중앙 지도 (#map-container) ... -->
            <!-- ... Right Panel (가정) ... -->
        </main>
    </body>
    ```
*   **변경 후 (CSS - `css/style.css`에 추가):**
    ```css
    #breadcrumb-nav {
        padding: 12px 20px;
        background: rgba(17, 24, 39, 0.85); /* 블러 효과가 필요하면 */
        backdrop-filter: blur(10px);
        border-bottom: 1px solid var(--border-color);
        z-index: 990; /* 헤더보다 낮게, 메인 콘텐츠 위에 */
        display: flex;
        align-items: center;
        min-height: 48px;
        /* 모바일에서는 일단 static으로 시작하고, 데스크톱에서 fixed로 전환 */
        position: static;
    }

    .breadcrumb-list {
        list-style: none;
        display: flex;
        align-items: center;
        margin: 0; padding: 0;
        flex-wrap: nowrap;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
    }
    .breadcrumb-item {
        display: flex; align-items: center;
        font-size: 0.95rem;
        color: var(--text-secondary);
        flex-shrink: 0;
    }
    .breadcrumb-item a { /* ... */ }
    .breadcrumb-item:last-child { /* ... */ }
    .breadcrumb-item + .breadcrumb-item::before { /* ... */ }

    /* 모바일 조정 */
    @media (max-width: 767px) {
        #breadcrumb-nav {
            padding: 10px 15px;
            background: var(--bg-primary); /* 모바일에서는 불투명 */
            backdrop-filter: none;
        }
        .breadcrumb-item { font-size: 0.85rem; }
    }
    /* 데스크톱에서 브레드크럼 고정 및 main-content padding-top 조정 */
    @media (min-width: 768px) {
        #breadcrumb-nav {
            position: fixed; /* 데스크톱에서 고정 */
            top: var(--header-height);
            left: 0; right: 0;
            background: rgba(17, 24, 39, 0.85);
            backdrop-filter: blur(10px);
        }
        /* body에 top padding을 추가하여 헤더와 브레드크럼이 차지하는 공간을 비워줌 */
        body {
            padding-top: calc(var(--header-height) + var(--breadcrumb-height, 48px)); /* 48px는 breadcrumb의 예상 높이 */
        }
        #main-content {
            padding-top: 0; /* body가 이미 처리했으므로 main-content는 padding-top 없음 */
        }
    }
    ```
*   **예상 효과:** 사용자가 현재 지도의 드릴다운 깊이를 시각적으로 인지하고, 이전 단계로 쉽게 돌아갈 수 있는 핵심 내비게이션이 제공되어 탐색 효율성과 사용자 경험이 크게 향상됩니다.

**2.2. 모바일 반응형 기본 레이아웃 및 헤더 최적화**
*   **무엇을 어디서 변경하는가:** `css/style.css`, `#main-content`, `#main-header`, `.header-left`, `.header-center`, `.header-right` 및 새로운 `.mobile-menu-toggle` 버튼.
*   **변경 전:** (고정된 3컬럼 레이아웃, 모바일 최적화 없음)
*   **변경 후 (CSS - `css/style.css`에 추가/수정):**
    ```css
    /* Mobile First: body 패딩은 위 브레드크럼 섹션에서 정의 */

    /* 헤더 최적화 (모바일) */
    #main-header {
        padding: 0 10px; /* 모바일에서 패딩 줄임 */
        justify-content: space-between;
    }
    .header-left { gap: 8px; } /* 간격 줄임 */
    .header-left .header-subtitle { display: none; } /* 모바일에서 부제 숨김 */
    .header-center {
        flex: 1; /* 검색창이 남은 공간 최대한 차지 */
        max-width: none; /* 최대 너비 제한 해제 */
        margin: 0 10px;
    }
    .header-right { display: none; } /* 모바일에서 D-day, 사전투표 정보 숨김 */

    /* 햄버거 메뉴 버튼 (HTML에 추가 필요) */
    .mobile-menu-toggle {
        display: block; /* 모바일에서만 보이도록 */
        background: none; border: none;
        color: var(--text-primary);
        font-size: 1.5rem; cursor: pointer;
        z-index: 1001;
    }

    /* 메인 콘텐츠 레이아웃 (모바일) */
    #main-content {
        display: flex;
        flex-direction: column; /* 모바일에서는 수직으로 쌓음 */
        min-height: calc(100vh - var(--header-height) - var(--breadcrumb-height, 48px)); /* 헤더+브레드크럼 제외 높이 */
        position: relative;
    }

    /* 좌측 사이드바 (모바일) */
    #left-sidebar {
        position: fixed; top: 0; left: 0;
        width: 100%; height: 100vh;
        background: var(--bg-primary);
        transform: translateX(-100%); /* 기본적으로 숨김 */
        transition: transform 0.3s ease-in-out;
        z-index: 1000;
        overflow-y: auto;
        padding-top: var(--header-height); /* 헤더 아래로 내용 시작 */
        box-shadow: var(--shadow-lg);
    }
    /* 우측 패널 (가정, 모바일 - Bottom Sheet 형태) */
    #right-panel {
        position: fixed; bottom: 0; left: 0;
        width: 100%; max-height: 60vh;
        background: var(--bg-card);
        transform: translateY(100%); /* 기본적으로 숨김 */
        transition: transform 0.3s ease-in-out;
        z-index: 1000;
        overflow-y: auto;
        border-top-left-radius: 12px;
        border-top-right-radius: 12px;
        box-shadow: var(--shadow-lg);
        padding: 16px;
    }

    /* 데스크톱 레이아웃 (768px 이상) */
    @media (min-width: 768px) {
        #main-header { padding: 0 20px; }
        .header-left .header-subtitle { display: block; }
        .header-center { max-width: 480px; margin: 0 24px; }
        .header-right { display: flex; }
        .mobile-menu-toggle { display: none; }

        #main-content {
            flex-direction: row; /* 데스크톱에서는 수평 정렬 */
            height: calc(100vh - var(--header-height) - var(--breadcrumb-height, 48px)); /* 헤더, 브레드크럼 제외 높이 */
            padding-top: 0;
        }

        #left-sidebar {
            position: relative; /* 고정 해제 */
            width: var(--sidebar-width); /* 고정 너비 */
            height: 100%; transform: translateX(0); /* 항상 보임 */
            flex-shrink: 0; padding-top: 0; box-shadow: none;
        }
        #right-panel {
            position: relative;
            width: var(--panel-width); height: 100%;
            transform: translateY(0);
            flex-shrink: 0;
            border-top-left-radius: 0; border-top-right-radius: 0;
            box-shadow: none;
        }
    }
    ```
*   **예상 효과:** 모바일 장치에서 웹사이트의 레이아웃이 적절하게 재구성되어 콘텐츠가 잘리지 않고 접근 가능해집니다. 사용자들은 모바일 환경에서도 효율적으로 정보를 탐색할 수 있습니다.

**2.3. 선거 종류 필터 활성 상태 스타일 강화**
*   **무엇을 어디서 변경하는가:** `css/style.css`, `.election-type-filters .filter-btn` 관련 선택자.
*   **변경 전:** (활성 상태 스타일 없음)
*   **변경 후 (CSS - `css/style.css`에 추가):**
    ```css
    .filter-btn {
        /* ... 기존 스타일 ... */
        border: 1px solid var(--border-color); /* 기본 테두리 추가 */
        transition: var(--transition);
    }
    .filter-btn:hover {
        background-color: var(--bg-card-hover);
        border-color: var(--text-accent); /* 호버 시 테두리 강조 */
    }
    .filter-btn.active { /* 선택된 상태 */
        background-color: var(--accent-blue); /* 강조색 배경 */
        color: var(--text-primary); /* 텍스트는 밝게 */
        border-color: var(--accent-blue); /* 테두리도 강조색 */
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.25); /* 살짝 그림자 추가 */
    }
    .filter-btn.active .filter-icon {
        color: var(--text-primary); /* 아이콘 색상도 밝게 */
    }
    .filter-btn.active .filter-count {
        background-color: rgba(255, 255, 255, 0.2); /* 카운트 배경 대비 */
        color: var(--text-primary);
    }
    ```
*   **예상 효과:** 사용자가 현재 어떤 선거 종류 필터가 선택되었는지 명확하게 시각적으로 인지할 수 있게 되어, 인터랙션의 피드백이 강화되고 사용성이 향상됩니다.

**2.4. 모든 인터랙티브 요소에 `:focus-visible` 스타일 적용**
*   **무엇을 어디서 변경하는가:** `css/style.css`, `:focus-visible` 선택자.
*   **변경 전:** `logo:focus-visible`에만 적용
*   **변경 후 (CSS - `css/style.css`에 추가/수정):**
    ```css
    /* 전역적인 포커스 스타일 */
    button:focus-visible,
    a:focus-visible,
    input:focus-visible,
    [tabindex]:focus-visible { /* 키보드 접근 가능한 모든 요소 */
        outline: 2px solid var(--accent-blue);
        outline-offset: 3px;
        border-radius: 6px; /* 모든 요소에 일관된 포커스 표시 */
    }

    /* 특정 요소에 대한 미세 조정 (필요 시) */
    .search-box:focus-within { /* 검색창 전체에 포커스 표시 */
        border-color: var(--accent-blue);
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
    }
    /* .search-box input:focus-visible 대신 .search-box:focus-within을 사용하여 전체 박스 강조 */
    .search-box input:focus-visible { /* input 자체에는 outline 끄기 */
        outline: none;
    }
    ```
*   **예상 효과:** 키보드 내비게이션 사용자들이 현재 포커스된 요소를 명확하게 파악할 수 있게 되어 웹 접근성(WCAG)이 크게 향상됩니다.

---

### 3. 중장기 개선 (1주+)

**3.1. 완전한 모바일 반응형 레이아웃 구현 (JavaScript 로직 포함)**
*   **무엇을 어디서 변경하는가:** `index.html` (모바일 메뉴 토글 버튼, 사이드바/패널 구조), `js/main.js` (가정), `css/style.css`.
*   **변경 전:** (`#left-sidebar`, `#right-panel`을 숨기고/보이게 할 JavaScript 로직 부재)
*   **변경 후 (개념):**
    *   **HTML:** 모바일 헤더에 햄버거 메뉴 버튼 추가 (`<button class="mobile-menu-toggle">`).
    *   **JavaScript:**
        *   `.mobile-menu-toggle` 클릭 시 `#left-sidebar`에 `is-open` 클래스를 토글하는 로직 구현.
        *   `#right-panel`을 열고 닫는 별도의 로직 (예: 지도 클릭 시 열림, 닫기 버튼 클릭 시 닫힘).
        *   `resize` 이벤트 리스너를 추가하여 D3.js 지도가 화면 크기 변경에 따라 자동으로 리렌더링되도록 조정.
        *   사이드바/패널이 열려있을 때 `body`의 스크롤을 방지하는 `overflow: hidden` 클래스 토글 (모달 방식).
    *   **CSS:** `.is-open` 클래스에 대한 `transform: translateX(0)` 또는 `translateY(0)` 스타일 추가.
*   **예상 효과:** 모바일 사용자들이 햄버거 메뉴를 통해 사이드바에 접근하고, 상세 정보를 바텀 시트 형태로 편리하게 확인할 수 있게 됩니다. 지도가 모든 화면 크기에서 올바르게 표시되어 진정한 반응형 웹을 구현합니다.

**3.2. 브레드크럼 JavaScript 동적 업데이트 로직**
*   **무엇을 어디서 변경하는가:** `js/main.js` (가정), 지도 인터랙션 로직.
*   **변경 전:** (브레드크럼 HTML은 있으나, 동적으로 업데이트하는 로직 부재)
*   **변경 후 (개념):**
    *   **JavaScript:**
        *   초기 "전국" 단계 로드.
        *   사용자가 시/도 또는 시/군/구를 클릭하거나 검색 결과로 이동할 때마다 `#breadcrumb-nav .breadcrumb-list`에 새로운 `breadcrumb-item`을 동적으로 추가하는 함수 구현.
        *   각 브레드크럼 항목 클릭 시 해당 지역으로 지도를 이동시키고 브레드크럼 리스트를 업데이트하는 이벤트 핸들러 추가.
        *   현재 활성화된 마지막 항목에 `aria-current="page"` 속성 부여 및 `last-child` 스타일 적용.
*   **예상 효과:** 사용자가 지도를 탐색함에 따라 현재 위치를 실시간으로 브레드크럼을 통해 확인할 수 있어, 길을 잃지 않고 쉽게 탐색할 수 있습니다.

**3.3. 로딩 스크린 에러 처리 및 단계별 메시지**
*   **무엇을 어디서 변경하는가:** `js/main.js` (가정), 초기 데이터 로딩 로직.
*   **변경 전:** (로딩 지연/에러 처리, 단계별 메시지 부재)
*   **변경 후 (개념):**
    *   **JavaScript:**
        *   모든 D3.js, Chart.js, 데이터 로딩 Promise에 대한 `Promise.all` 또는 `async/await`를 사용하여 로딩 완료 시점에 `loading-screen.hidden` 클래스 추가.
        *   로딩 시작 시 `setTimeout`으로 10~15초 타임아웃 설정. 타임아웃 발생 시 로딩 스크린 강제 해제 및 오류 메시지(예: "데이터 로딩이 지연되고 있습니다. 새로고침 해주세요.")와 '새로고침' 버튼 표시.
        *   `loading-content p` 태그에 로딩 단계별 메시지를 업데이트하는 로직 추가 (예: "지도 데이터 불러오는 중...", "선거구 정보 분석 중...").
        *   로딩 완료가 너무 빠를 경우 `setTimeout`으로 최소 0.5초~1초간 로딩 스크린 유지 후 숨김.
*   **예상 효과:** 무한 로딩으로 인한 사용자 이탈을 방지하고, 로딩 과정 중 사용자에게 지속적인 피드백을 제공하여 불안감을 줄이고 인내심을 유지하도록 돕습니다.

**3.4. 고급 접근성 기능 구현**
*   **무엇을 어디서 변경하는가:** `index.html`, `js/main.js` (가정), `css/style.css`.
*   **변경 전:** (`aria` 속성, 동적 콘텐츠 알림 부재)
*   **변경 후 (개념):**
    *   **HTML & JavaScript:**
        *   모바일 햄버거 메뉴 버튼에 `aria-controls="left-sidebar"` 및 `aria-expanded` 속성 추가.
        *   사이드바/패널이 열리고 닫힐 때 `aria-expanded` 속성 값을 동적으로 변경.
        *   필터 버튼 선택 시 `aria-pressed="true"` 또는 `aria-selected="true"` 속성 추가 및 제거.
        *   지도에서 지역 선택 시, 해당 지역의 상세 정보를 담은 우측 패널이 열리면서 포커스를 패널 내부로 이동시키고, 패널 닫기 전까지 포커스가 패널 밖으로 나가지 않도록 트랩 로직 구현.
        *   데이터 로딩 완료, 필터 적용 등으로 주요 콘텐츠가 변경될 때 `aria-live` 영역(예: `role="status"`)에 변경된 내용을 스크린 리더에 알리는 텍스트 삽입.
*   **예상 효과:** 스크린 리더 사용자 및 키보드 내비게이션 사용자 모두에게 웹사이트의 모든 기능과 상태 변화를 명확하게 전달하여, 전반적인 웹 접근성(WCAG)을 최고 수준으로 향상시킵니다.

**3.5. 한국 사용자 특성 고려 (특히 50대+ 유권자) - 전반적인 디자인 및 정보 제공 최적화**
*   **무엇을 어디서 변경하는가:** `css/style.css`, 디자인 시스템 전반, 데이터 표시 방식.
*   **변경 전:** (기본 14px 폰트, 정보 밀도)
*   **변경 후 (개념):**
    *   **폰트 크기:** 기본 폰트 사이즈를 최소 `16px`로 상향 조정하고, 핵심 정보(제목, 숫자 등)는 `18px` 이상, `font-weight: 500` 이상의 두께를 기본으로 적용.
    *   **줄 간격/여백:** `line-height`를 `1.5` 이상으로 설정하고, 섹션 및 카드 간 `padding`, `margin`을 충분히 확보하여 시각적 피로도 감소.
    *   **색상 대비:** 주요 텍스트와 배경 간의 대비율을 WCAG AAA 수준(7:1)에 가깝게 유지하도록 `--text-primary`, `--text-secondary` 등의 색상 변수 미세 조정. `--text-muted`는 `--bg-primary`와 최소 5.5:1 이상 대비되도록 조정.
    *   **용어 명확성:** 복잡한 선거 종류명에 대해 `filter-tooltip`을 통해 간략한 설명 제공 (예: "광역의원 비례대표" -> "정당 득표율에 따라 의석을 배분하는 방식").
    *   **핵심 정보 강조:** 후보자 정보(사진, 소속 정당, 이름, 주요 공약)를 우측 패널에 크고 명확하게 배치하고, 정당 색상을 일관되게 적용하여 시각적 인지도를 높임.
    *   **클릭 영역 확대:** 모든 버튼, 링크, 지도 상의 클릭 가능한 지역의 `min-width` / `min-height`를 최소 `44px`로 확보하여 오작동 방지.
*   **예상 효과:** 50대 이상 유권자를 포함한 모든 사용자가 정보를 더욱 쉽고 편안하게 읽고 이해하며 탐색할 수 있게 되어, 프로젝트의 포괄성과 사용성이 극대화됩니다.

---

이 액션 아이템 목록은 현재까지의 분석을 종합하여 가장 중요하고 시급한 것부터 장기적인 완성도를 높이는 것까지 포함합니다. 각 팀의 개발 일정과 리소스를 고려하여 이 로드맵을 활용하시기 바랍니다.

========================================
## Round 5/5
========================================

## 6.3 전국지방선거 인터랙티브 선거 정보 지도 최종 UI/UX 종합 리뷰

제공해주신 프로젝트의 `index.html` 및 `style.css`를 기반으로 심층적인 UI/UX 분석을 진행했으며, 이제 최종 종합 점수, 핵심 요약, 그리고 최종 수정 권고를 드립니다.

---

### 1. 종합 점수 (100점 만점으로 현재 상태 평가)

현재 프로젝트는 핵심적인 구조와 디자인 방향성이 훌륭하나, 사용자 경험과 접근성에 필수적인 요소들이 미비하여 전반적인 점수가 낮게 평가되었습니다. 이는 개선될 여지가 매우 크다는 것을 의미합니다.

*   **UI/UX 설계: 15/25점**
    *   다크 테마의 일관성과 CSS 변수 활용 등 기본적인 디자인 구조는 매우 좋습니다. 하지만 모바일 반응형 미흡, 브레드크럼 부재, 사이드바/패널 제어 미비 등 핵심적인 사용자 흐름 및 레이아웃 처리에서 큰 공백이 존재합니다.
*   **가독성: 18/25점**
    *   `--text-primary`와 `--bg-primary` 간의 높은 대비는 훌륭합니다. 그러나 `--text-muted` (특히 플레이스홀더 텍스트)의 색상 대비가 WCAG AA 기준에 미달하며, 작은 폰트(`0.8rem`)와 낮은 대비의 조합은 가독성을 저해합니다. 50대 이상 유권자층을 고려한 폰트 크기 및 밀도 조절이 필요합니다.
*   **데이터 정확성: 20/25점**
    *   제공된 코드는 HTML/CSS로, 실제 데이터 처리 로직을 직접 평가할 수는 없습니다. 하지만 "여론조사 투명성 플랫폼" 배너와 "중앙선거여론조사심의위원회 등록 자료" 언급은 데이터 정확성과 투명성에 대한 강력한 의지를 보여줍니다. `filter-count`, `stats-grid` 등 데이터 표시를 위한 구조도 잘 갖춰져 있어, 구현된다면 높은 신뢰도를 가질 것으로 예상합니다. (만점은 실제 데이터 검증 후 부여 가능)
*   **접근성: 10/25점**
    *   `meta viewport`, `lang="ko"`, `aria-label` 사용 등 기본 접근성 요소는 있지만, `body`의 `overflow: hidden`으로 인한 모바일 사용 불가는 치명적인 접근성 문제입니다. WCAG AA 기준 미달 대비, 대부분의 인터랙티브 요소에 대한 `:focus-visible` 부재, 동적 콘텐츠에 대한 ARIA 속성 미비 등 핵심적인 영역에서 큰 개선이 필요합니다.

**총점: 63/100점**

---

### 2. 핵심 요약 (5줄 이내)

*   이 프로젝트는 다크 테마 기반의 일관된 디자인 시스템과 CSS 변수 활용이라는 훌륭한 UI 구조적 기반을 갖추고 있습니다.
*   헤더의 정보 구성 및 선거 종류 필터의 직관적인 배치는 사용자에게 유용한 초기 정보 제공에 강점이 있습니다.
*   하지만 모바일 반응형 대응이 거의 이루어지지 않아, `body` 스크롤 불가능 및 고정 레이아웃으로 인해 모바일 사용성이 심각하게 저해됩니다.
*   플레이스홀더 텍스트의 색상 대비 미달과 브레드크럼 내비게이션 부재는 정보 가독성, 접근성 및 지도 탐색 효율성을 크게 떨어뜨립니다.
*   이러한 근본적인 문제점들을 해결하기 위한 구조적 및 기능적 개선이 시급하여, 프로젝트의 사용자 경험을 전반적으로 향상시켜야 합니다.

---

### 3. 최종 크로스체크 및 수정 권고 우선순위 정리

이전 라운드에서 제안된 수정사항들은 상호 보완적으로 작동하도록 설계되었으며, 특히 `body`의 `padding-top`과 고정된 헤더/배너/브레드크럼의 `top` 위치 조정은 정확한 계산을 통해 충돌 없이 구현될 수 있도록 정교화되었습니다. 모든 제안은 전반적인 UI/UX 및 접근성 향상에 기여하며, 상호 충돌하는 부분은 없습니다.

아래는 지금까지의 분석을 종합하여 가장 중요하고 시급한 것부터 장기적인 완성도를 높이는 것까지 포함한 최종 수정 권고 목록입니다.

---

#### **즉시 수정 (코드 변경 1시간 이내)**
프로젝트의 기본적인 사용성과 접근성을 확보하기 위한 최우선 과제입니다.

1.  **`body` 기본 스크롤 동작 및 높이 설정 수정**
    *   **무엇을 어디서 변경하는가:** `css/style.css`, `body` 선택자.
    *   **변경 전/후:**
        ```css
        /* 변경 전 */
        body { overflow: hidden; height: 100vh; width: 100vw; }
        /* 변경 후 */
        body { min-height: 100vh; overflow-x: hidden; overflow-y: auto; }
        ```
    *   **예상 효과:** 모바일 콘텐츠 스크롤 가능, 웹사이트 사용성 확보.
2.  **플레이스홀더 텍스트 색상 대비 개선**
    *   **무엇을 어디서 변경하는가:** `css/style.css`, `.search-box input::placeholder` 선택자.
    *   **변경 전/후:**
        ```css
        /* 변경 전 */ .search-box input::placeholder { color: var(--text-muted); }
        /* 변경 후 */ .search-box input::placeholder { color: var(--text-secondary); }
        ```
    *   **예상 효과:** WCAG AA 기준 충족, 검색 필드 가독성 향상.
3.  **투명성 미션 배너 위치 및 전역 패딩 조정**
    *   **무엇을 어디서 변경하는가:** `css/style.css`, `:root`, `#transparency-banner`, `#main-header`, `@media (min-width: 768px) body`, `@media (max-width: 767px) #main-content`.
    *   **변경 전/후 (핵심 부분):**
        ```css
        /* :root 변수에 배너 높이 추가 */
        :root { --transparency-banner-height: 44px; /* 실제 높이에 맞게 조정 */ }
        /* #transparency-banner 위치 고정 및 높이 명시 */
        #transparency-banner { position: fixed; top: 0; z-index: 1010; height: var(--transparency-banner-height); }
        /* 헤더 위치 조정 */
        #main-header { position: fixed; top: var(--transparency-banner-height); /* ... */ }
        /* 데스크톱 body 패딩 조정 */
        @media (min-width: 768px) { body { padding-top: calc(var(--transparency-banner-height) + var(--header-height) + var(--breadcrumb-height, 48px)); } }
        /* 모바일 main-content 패딩 조정 */
        @media (max-width: 767px) { #main-content { padding-top: calc(var(--transparency-banner-height) + var(--header-height)); } }
        ```
    *   **예상 효과:** 중요한 배너가 항상 보이며, 헤더 및 다른 UI 요소와 겹치지 않고 올바르게 배치됨.

#### **단기 개선 (1-3일)**
기본적인 사용자 경험을 크게 향상시키고, 향후 복잡한 기능 구현을 위한 기반을 다집니다.

1.  **브레드크럼 내비게이션 HTML 구조 추가 및 기본 CSS 스타일링**
    *   **무엇을 어디서 변경하는가:** `index.html` (`<main>` 태그 내부 상단), `css/style.css`.
    *   **변경 내용:** `<nav id="breadcrumb-nav">` 구조 추가 및 모바일(`position: static`) / 데스크톱(`position: fixed`) 반응형 스타일 구현.
    *   **예상 효과:** 사용자가 현재 지도의 계층적 위치를 명확히 인지하고 상위 단계로 쉽게 이동 가능.
2.  **모바일 반응형 헤더 및 메인 콘텐츠 레이아웃 CSS 최적화**
    *   **무엇을 어디서 변경하는가:** `index.html` (모바일 메뉴 토글 버튼), `css/style.css` (`#main-header`, `#main-content`, `#left-sidebar`, `#right-panel` 등).
    *   **변경 내용:** 모바일 헤더 요소 재배치/숨김, `main-content`의 `flex-direction: column` 설정, 사이드바/패널의 숨김(transform) CSS 준비.
    *   **예상 효과:** 모바일 화면에서 UI가 깨지지 않고, 핵심 정보와 기능에 대한 접근성 확보.
3.  **모든 인터랙티브 요소에 `:focus-visible` 스타일 적용**
    *   **무엇을 어디서 변경하는가:** `css/style.css`, 전역 `:focus-visible` 선택자.
    *   **변경 내용:** `button:focus-visible, a:focus-visible, input:focus-visible, [tabindex]:focus-visible`에 일관된 아웃라인 스타일 적용.
    *   **예상 효과:** 키보드 내비게이션 사용자를 위한 웹 접근성 대폭 향상.
4.  **선거 종류 필터 활성 상태 스타일 강화**
    *   **무엇을 어디서 변경하는가:** `css/style.css`, `.filter-btn.active` 선택자.
    *   **변경 내용:** 선택된 필터 버튼에 배경색, 테두리, 텍스트/아이콘 색상 변경 등 명확한 시각적 활성 상태 스타일 추가.
    *   **예상 효과:** 사용자가 현재 선택된 필터를 명확히 인지, 인터랙션 피드백 강화.

#### **중장기 개선 (1주+)**
프로젝트의 기능적 완성도와 사용자 경험, 포괄성을 극대화하기 위한 작업입니다.

1.  **완전한 모바일 반응형 레이아웃 구현 (JavaScript 로직 포함)**
    *   **무엇을 어디서 변경하는가:** `js/main.js` (가정).
    *   **변경 내용:** 모바일 햄버거 메뉴 및 사이드바/패널 토글 JavaScript 로직, D3.js 지도 리사이즈 이벤트 처리.
    *   **예상 효과:** 모든 기기에서 최적화된 인터랙티브 경험 제공.
2.  **브레드크럼 JavaScript 동적 업데이트 로직**
    *   **무엇을 어디서 변경하는가:** `js/main.js` (가정).
    *   **변경 내용:** 지도 상호작용에 따라 브레드크럼 리스트를 동적으로 업데이트하고 탐색 기능을 구현하는 JavaScript 로직.
    *   **예상 효과:** 실시간 탐색 경로 제공, 사용자 혼란 방지, 탐색 효율성 극대화.
3.  **로딩 스크린 에러 처리 및 단계별 메시지**
    *   **무엇을 어디서 변경하는가:** `js/main.js` (가정).
    *   **변경 내용:** 로딩 완료/에러 타임아웃 처리, 단계별 로딩 메시지 업데이트, 최소 로딩 시간 보장 로직 구현.
    *   **예상 효과:** 무한 로딩 방지, 사용자에게 지속적인 피드백 제공.
4.  **고급 접근성 기능 구현**
    *   **무엇을 어디서 변경하는가:** `index.html`, `js/main.js` (가정), `css/style.css`.
    *   **변경 내용:** 모든 인터랙티브 및 동적 요소에 대한 `aria` 속성(예: `aria-expanded`, `aria-selected`, `aria-live`), 포커스 트랩 로직 구현.
    *   **예상 효과:** 스크린 리더 사용자 및 키보드 내비게이션 사용자를 위한 웹 접근성 최고 수준으로 향상.
5.  **한국 사용자 특성 고려 디자인 및 정보 제공 최적화**
    *   **무엇을 어디서 변경하는가:** `css/style.css`, 디자인 시스템 전반.
    *   **변경 내용:** 기본 폰트 크기 상향 조정, 줄 간격 및 여백 확보, WCAG AAA 수준 대비율 고려, 복잡한 용어 툴팁 강화, 핵심 정보 시각적 강조, 클릭 영역 확대.
    *   **예상 효과:** 50대 이상 유권자를 포함한 모든 사용자가 정보를 더욱 쉽고 편안하게 읽고 이해하며 탐색할 수 있도록 포괄성 극대화.

---

이 최종 액션 아이템 목록은 프로젝트의 UI/UX 완성도를 높이기 위한 명확한 로드맵을 제공합니다. 각 단계별로 충실히 구현하여 2026년 6.3 전국지방선거 정보 지도가 모든 유권자에게 유용하고 편리한 플랫폼이 되기를 바랍니다.
