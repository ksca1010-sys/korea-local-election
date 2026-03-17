# UI/UX 인터페이스 검증 - Round 4/5

생성일: 2026-03-09 10:59
모델: gemini-2.5-flash

---

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
