# 가독성 및 데이터 시각화 검증 - Round 4/5

생성일: 2026-03-09 11:03
모델: gemini-2.5-flash

---

지금까지의 모든 분석을 종합하여, 한국 지방선거 인터랙티브 지도 프로젝트의 실행 가능한 액션 아이템을 시급성별로 분류하여 정리합니다.

---

### 즉시 수정 (코드 변경 1시간 이내)

가장 기본적인 가독성과 대비 문제를 해결하며, 기존 코드의 작은 값들을 조정하는 작업입니다.

1.  **Chart.js 전역 설정 조정 (글꼴 크기, 기본 색상, 범례)**
    *   **무엇을 어디서 변경하는가:** `charts.js` 파일, `Chart.defaults` 설정 부분 (약 10-15 라인)
    *   **변경 전:**
        ```javascript
        Chart.defaults.color = '#8b99b5';
        Chart.defaults.font.size = 11;
        Chart.defaults.plugins.legend.labels.boxWidth = 12;
        Chart.defaults.plugins.legend.labels.padding = 12;
        ```
    *   **변경 후:**
        ```javascript
        Chart.defaults.color = '#C9D4E7'; // 더 밝은 색상으로 대비 강화
        Chart.defaults.font.size = 13; // 가독성 향상을 위해 증가
        Chart.defaults.plugins.legend.labels.boxWidth = 14; // 범례 아이콘 크기 증가
        Chart.defaults.plugins.legend.labels.padding = 16; // 범례 여백 증가
        ```
    *   **예상 효과:** 모든 Chart.js 기반 차트의 기본 텍스트(축 레이블, 범례 등) 가독성이 대폭 향상되고, 다크 테마에서 시각적 인지도가 높아집니다.

2.  **Chart.js 그리드 라인 및 툴팁 색상/글꼴 조정**
    *   **무엇을 어디서 변경하는가:** `charts.js` 파일, 각 차트(`renderPollBarChart`, `renderPollTrendChart`, `renderDemographicsChart`)의 `options` 내 `plugins.tooltip` 및 `scales.x.grid`, `scales.y.grid` 설정 부분 (각 차트당 약 10-20 라인). 공통 옵션 함수를 활용하면 더 효율적입니다.
    *   **변경 전 (예: 툴팁):**
        ```javascript
        plugins: {
            tooltip: {
                backgroundColor: 'rgba(26, 34, 54, 0.95)',
                // ...
            }
        },
        scales: {
            y: {
                grid: { color: 'rgba(42, 53, 83, 0.3)' },
                // ...
            }
        }
        ```
    *   **변경 후 (예: 툴팁 및 그리드):**
        ```javascript
        // 공통 옵션 함수로 정의하여 재활용 권장
        const getCommonChartOptions = () => ({
            plugins: {
                tooltip: {
                    backgroundColor: 'rgba(38, 48, 70, 0.95)', // 메인 배경보다 확연히 밝게
                    borderColor: 'rgba(59, 130, 246, 0.6)', // 테두리 대비 강화
                    titleColor: '#e0e6f0', // 툴팁 제목 텍스트 밝게
                    bodyColor: '#e0e6f0',  // 툴팁 본문 텍스트 밝게
                    titleFont: { weight: '600', size: 14 },
                    bodyFont: { size: 13 },
                    padding: 12, // 약간 더 넓은 패딩
                    cornerRadius: 8,
                },
                legend: { labels: { font: { size: 13 } } } // 범례 글꼴 통일
            },
            scales: {
                x: { grid: { color: 'rgba(139, 153, 181, 0.25)' } }, // 밝은 회색 계열 그리드
                y: { grid: { color: 'rgba(139, 153, 181, 0.25)' } }  // 밝은 회색 계열 그리드
            }
        });
        // 각 차트 options에 ...getCommonChartOptions(), ...getCommonChartOptions().plugins, ...getCommonChartOptions().scales 등으로 병합
        ```
    *   **예상 효과:** 차트 그리드 라인이 배경에 묻히지 않고 적절히 보이게 되며, 툴팁 정보가 명확하게 구분되어 읽기 쉬워집니다.

3.  **'기타' 카테고리 색상 조정**
    *   **무엇을 어디서 변경하는가:** `charts.js` 파일, `renderDemographicsChart` 함수 내 '기타' 데이터셋 정의 부분 (약 2-3 라인)
    *   **변경 전:**
        ```javascript
        backgroundColor: 'rgba(128, 128, 128, 0.5)', borderColor: '#808080',
        ```
    *   **변경 후:**
        ```javascript
        backgroundColor: 'rgba(150, 160, 170, 0.7)', // 배경과 더 잘 구분되도록 명도 및 투명도 조정
        borderColor: '#96A0AA',
        ```
    *   **예상 효과:** 연령대별 지지율 차트에서 '기타' 카테고리가 다른 정당들과 명확히 구분되어 인지율이 높아집니다.

4.  **백분율 수치 소수점 자리 통일 (toFixed(1))**
    *   **무엇을 어디서 변경하는가:** `charts.js` 파일, `renderPollBarChart`, `renderPollTrendChart`, `renderDemographicsChart`의 툴팁 콜백 함수와 `renderPartyDonutChart` 함수 내부 (`pct` 변수 선언 시) (각 1라인씩 총 4-5 라인)
    *   **변경 전 (예: 툴팁 콜백):** `return `${ctx.dataset.label}: ${ctx.raw}%`;`
    *   **변경 후 (예: 툴팁 콜백):** `return `${ctx.dataset.label}: ${ctx.raw.toFixed(1)}%`;`
    *   **예상 효과:** 모든 백분율 수치가 소수점 첫째 자리까지 일관되게 표시되어 정보의 정밀도와 비교 용이성이 향상됩니다.

5.  **D3.js 지도 라벨 텍스트 대비 강화**
    *   **무엇을 어디서 변경하는가:** D3.js 지도 렌더링 코드 (제공된 스니펫 기준), 라벨 텍스트 생성 부분 (약 2-3 라인)
    *   **변경 전:**
        ```javascript
        labels.append("text")
            .attr("fill", d => getOptimalTextColor(ElectionData.getPartyColor(d.dominantParty)))
            .attr("font-size", "12px")
            .attr("font-weight", "bold")
            .text(d => d.totalSeats + '석');
        ```
    *   **변경 후 (getOptimalTextColor 함수도 변경):**
        ```javascript
        labels.append("text")
            .attr("fill", d => getOptimalTextColor(ElectionData.getPartyColor(d.dominantParty)))
            .attr("font-size", "12px")
            .attr("font-weight", "bold")
            .attr("text-shadow", "0px 0px 3px rgba(0,0,0,0.5)") // 텍스트 가독성을 위한 그림자 추가
            .text(d => d.totalSeats + '석');

        // getOptimalTextColor 함수 변경 (약 1라인)
        function getOptimalTextColor(bgColor) {
            // ... (기존 RGB 및 밝기 계산 로직) ...
            return luminance > 0.6 ? '#1a1a1a' : '#FFFFFF'; // 밝기 임계값 및 글자색 조정
        }
        ```
    *   **예상 효과:** 지도 위 비례대표 의석수 텍스트의 가독성이 어떤 정당색 배경 위에서도 명확해집니다.

6.  **사이드 패널 `overview` 탭 정보 위계 조정**
    *   **무엇을 어디서 변경하는가:** HTML 파일 (`aside#detail-panel` 내부), `div#tab-overview` 내 `panel-card` 순서 (약 5-10 라인)
    *   **변경 전:**
        ```html
        <div class="panel-card"><h4><i class="fas fa-history"></i> 지난 선거 결과 (제8회)</h4></div>
        <div id="superintendent-summary-card" ...>...</div>
        <div class="panel-card"><h4><i class="fas fa-user-tie"></i> 현직자 정보</h4></div>
        ```
    *   **변경 후:**
        ```html
        <div id="district-detail" class="panel-card" style="display:none;"></div> <!-- 기초단체장 정보 -->
        <div class="panel-card">
            <h4><i class="fas fa-user-tie"></i> 현직자 정보</h4> <!-- 현직자 정보 상단 배치 -->
            <div id="current-governor"></div>
            <div id="panel-region-badge" class="panel-region-badge" style="display:none"></div>
        </div>
        <div class="panel-card">
            <h4><i class="fas fa-history"></i> 지난 선거 결과 (제8회)</h4> <!-- 다음으로 지난 결과 -->
            <div id="prev-election-result"></div>
        </div>
        <div id="superintendent-summary-card" class="panel-card superintendent-summary-card" style="display:none;">
            <h4><i class="fas fa-graduation-cap"></i> 교육감 주요 지표</h4>
            <div id="superintendent-summary" class="superintendent-summary-grid"></div>
            <div id="superintendent-summary-note" class="superintendent-summary-note"></div>
        </div>
        <div class="panel-card">
            <h4><i class="fas fa-bullhorn"></i> 지역 핵심 이슈</h4>
            <div id="key-issues"></div>
        </div>
        ```
    *   **예상 효과:** 사용자가 지역 선택 시 가장 궁금해할 '현재 정보'를 먼저 제공하여 정보 접근성이 향상됩니다.

---

### 단기 개선 (1-3일)

기존 기능에 대한 스타일링을 추가하고, 기본적인 상호작용 및 정보 명확성을 높이는 작업입니다.

1.  **정당 지지도 텍스트 바 리스트 CSS 스타일링**
    *   **무엇을 어디서 변경하는가:** CSS 파일 (예: `style.css` 또는 `main.css`), `.party-support-row` 관련 클래스 정의 (약 30-40 라인)
    *   **변경 전:** 현재 HTML 마크업만 제공, CSS 미정의.
    *   **변경 후 (예시 CSS):**
        ```css
        .party-support-row {
            display: flex; align-items: center; margin-bottom: 12px;
            font-size: 13px; color: #C9D4E7; /* 기본 텍스트 색상과 통일 */
        }
        .party-dot { width: 14px; height: 14px; border-radius: 50%; margin-right: 10px; flex-shrink: 0; }
        .party-name {
            flex-grow: 1; margin-right: 15px; font-weight: 500;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis; /* 이름이 길어질 경우 처리 */
        }
        .party-bar-wrap {
            width: 100px; height: 12px; /* 너비와 높이 조정 가능 */
            background: rgba(139, 153, 181, 0.15); /* 빈 공간 배경색 */
            border-radius: 6px; overflow: hidden; margin-right: 15px;
        }
        .party-bar { height: 100%; border-radius: 6px; transition: width 0.6s ease-out; }
        .party-pct {
            font-weight: 700; width: 55px; text-align: right; flex-shrink: 0;
            color: #e0e6f0; font-size: 14px; /* 수치 강조 */
        }
        ```
    *   **예상 효과:** 정당 지지율을 막대 그래프 형태로 빠르고 정확하게 비교할 수 있게 되어 정보 가독성과 시각적 매력이 크게 향상됩니다.

2.  **D3.js 지도 라벨 호버 인터랙션 및 툴팁 구현**
    *   **무엇을 어디서 변경하는가:** D3.js 지도 렌더링 코드 (제공된 스니펫 기준), `labels` 요소에 `mouseover`, `mouseout` 이벤트 리스너 추가 및 `showProportionalTooltip`, `hideProportionalTooltip` 함수 구현 (약 20-30 라인 + HTML/CSS)
    *   **변경 전:** 호버 인터랙션 및 상세 툴팁 부재.
    *   **변경 후 (예시 D3.js):**
        ```javascript
        labels.on("mouseover", function(event, d) {
            d3.select(this).select("circle")
                .transition().duration(100).attr("r", 14).attr("stroke", "rgba(59, 130, 246, 0.8)").attr("stroke-width", 2.5);
            showProportionalTooltip(event, d); // 커스텀 툴팁 표시 함수 호출
        })
        .on("mouseout", function() {
            d3.select(this).select("circle")
                .transition().duration(200).attr("r", 12).attr("stroke", "rgba(255, 255, 255, 0.4)").attr("stroke-width", 1.5);
            hideProportionalTooltip(); // 커스텀 툴팁 숨김 함수 호출
        });
        // showProportionalTooltip, hideProportionalTooltip 함수 정의 (별도 구현 필요)
        ```
    *   **예상 효과:** 사용자가 지도 위 라벨에 마우스를 올렸을 때 시각적 피드백과 함께 상세 정보를 볼 수 있어 정보 탐색 경험이 향상됩니다.

3.  **글꼴 크기 증가로 인한 차트 레이아웃 검토 및 조정**
    *   **무엇을 어디서 변경하는가:** `charts.js` 파일, 각 차트의 `scales.x.ticks` 옵션 (특히 `autoSkip`, `maxRotation`, `minRotation`) (각 차트당 2-5 라인)
    *   **변경 전:** 기본 `Chart.defaults` 설정.
    *   **변경 후 (예시):**
        ```javascript
        scales: {
            x: {
                ticks: {
                    font: { size: 12, weight: '500' },
                    autoSkip: true, // 자동으로 레이블 건너뛰기
                    maxRotation: 45, // 최대 회전 각도
                    minRotation: 0 // 최소 회전 각도 (수평 유지)
                }
            }
        }
        ```
    *   **예상 효과:** 글꼴 크기 증가로 인해 발생할 수 있는 X축 레이블 겹침 문제를 완화하여 모든 정보가 명확하게 보이도록 합니다.

4.  **데이터 최종 업데이트 시점 명시**
    *   **무엇을 어디서 변경하는가:** HTML 파일 (`aside#detail-panel` 내부), 특정 `div` 또는 `span` (예: 패널 푸터 또는 각 정보 카드 하단) 및 해당 데이터를 렌더링하는 JavaScript 로직. (HTML 1라인, JS 5-10 라인)
    *   **변경 전:** 여론조사 외 데이터의 업데이트 시점 불명확.
    *   **변경 후 (HTML 예시):**
        ```html
        <div class="panel-footer">
            <p><i class="fas fa-sync-alt"></i> 최종 데이터 업데이트: <span id="last-data-update">YYYY.MM.DD</span> (중앙선거관리위원회 기준)</p>
        </div>
        ```
    *   **예상 효과:** 사용자에게 정보의 신뢰성과 최신성을 명확히 전달하여 신뢰도를 높입니다.

5.  **검색 기능 시각적 강조**
    *   **무엇을 어디서 변경하는가:** CSS 파일, 검색창 (`input` 또는 `div.search-bar`) 관련 클래스 (약 5-10 라인)
    *   **변경 전:** 현재 코드에는 검색창 HTML이 없지만, 존재한다면 일반적인 스타일.
    *   **변경 후 (예시):** 검색창 테두리 색상, 배경색, 그림자 효과 등을 다크 테마에 맞춰 더욱 눈에 띄게 조정. (예: `border: 2px solid rgba(59, 130, 246, 0.5); box-shadow: 0 0 8px rgba(59, 130, 246, 0.2);`)
    *   **예상 효과:** 사용자가 웹사이트 접속 시 가장 먼저 이용할 수 있는 기능 중 하나인 검색창을 쉽게 인지하고 접근할 수 있도록 돕습니다.

---

### 중장기 개선 (1주 이상)

더 복잡한 기능 구현, 포괄적인 사용자 경험 개선, 성능 최적화 등 광범위한 작업입니다.

1.  **D3.js 지도 라벨 겹침 방지 (Collision Detection)**
    *   **무엇을 어디서 변경하는가:** D3.js 지도 렌더링 코드 (제공된 스니펫 기준), `d3-force` 시뮬레이션 로직 추가 및 데이터 업데이트 (`labels.attr("transform", ...)` 부분 변경) (약 15-20 라인)
    *   **변경 전:** 라벨 겹침 방지 로직 부재.
    *   **변경 후 (예시):**
        ```javascript
        const simulation = d3.forceSimulation(mapData.proportionalRegions)
            .force("x", d3.forceX(d => projection([d.lon, d.lat])[0]).strength(1))
            .force("y", d3.forceY(d => projection([d.lon, d.lat])[1]).strength(1))
            .force("collide", d3.forceCollide(d => 12 + 5)) // 원 반지름 + 여백
            .stop();

        for (let i = 0; i < 120; ++i) simulation.tick(); // 충분히 시뮬레이션

        labels.attr("transform", d => `translate(${d.x},${d.y})`);
        ```
    *   **예상 효과:** 지도가 복잡하고 라벨이 많은 경우에도 정보가 겹치지 않고 명확하게 보여 지도 전체의 가독성과 이해도를 극대화합니다.

2.  **포괄적인 웹 접근성 (Accessibility) 구현**
    *   **무엇을 어디서 변경하는가:**
        *   **색맹/색약 친화적 팔레트 검토:** `ElectionData.getPartyColor()` 로직 및 관련 색상 변수.
        *   **ARIA 속성:** HTML 요소 (차트 `canvas`, 지도 `svg`, 인터랙티브 `div` 등)에 `aria-label`, `aria-describedby`, `role` 등 추가.
        *   **키보드 탐색:** 모든 인터랙티브 요소 (`button`, `a`, 탭, 지도 클릭 가능 영역 등)에 `tabindex` 적절히 부여 및 포커스 관리.
    *   **변경 전:** 기본 웹 표준 준수 여부 불확실, 색맹 고려 부족.
    *   **변경 후:** 색상 팔레트 조정, HTML/JS에 ARIA 속성 추가, 키보드 이벤트 핸들러 구현.
    *   **예상 효과:** 다양한 사용자가 정보에 동등하게 접근하고 이용할 수 있도록 하여 사용자층을 확대하고 법적/윤리적 요구사항을 충족합니다.

3.  **반응형 디자인 심화 (모바일/태블릿 최적화)**
    *   **무엇을 어디서 변경하는가:** CSS 파일 (`@media` 쿼리), `charts.js` (차트 `aspectRatio`, 범례 위치 등 동적 변경 로직), `party-bar-wrap` 등 고정 너비 요소 조정.
    *   **변경 전:** `responsive: true`, `maintainAspectRatio: true` 외 구체적 최적화 부족.
    *   **변경 후:**
        *   모바일 뷰포트에서 사이드 패널이 전체 화면을 차지하도록 CSS 미디어 쿼리 추가.
        *   차트 `aspectRatio`를 모바일 환경에 맞춰 조정하거나, 범례를 상단/측면으로 동적 변경.
        *   `party-bar-wrap`의 `width`를 `auto` 또는 `%` 단위로 변경하여 유연성 확보.
    *   **예상 효과:** 다양한 기기에서 일관되고 최적화된 사용자 경험을 제공하여 모바일 사용자 접근성을 크게 향상시킵니다.

4.  **D3.js 지도 성능 최적화**
    *   **무엇을 어디서 변경하는가:** D3.js 지도 초기화 및 데이터 로딩/렌더링 로직.
    *   **변경 전:** GeoJSON 데이터 크기, 렌더링 부하에 대한 구체적 최적화 부족.
    *   **변경 후:**
        *   GeoJSON 데이터를 TopoJSON으로 변환하여 사용.
        *   줌 레벨에 따른 지리 데이터 간소화 (Simplification) 기법 적용.
        *   확대/축소 및 팬 이벤트에 디바운싱(debouncing) 또는 스로틀링(throttling) 적용.
    *   **예상 효과:** 지도의 로딩 속도와 상호작용(확대/축소, 이동)의 부드러움을 개선하여 사용자 만족도를 높입니다.

5.  **사용자 맞춤형 읽기 편의성 기능 (글꼴 크기/고대비 모드 토글)**
    *   **무엇을 어디서 변경하는가:** HTML (UI 버튼 추가), CSS (테마 전환 및 글꼴 크기 변경 스타일), JavaScript (버튼 클릭 이벤트 핸들러 및 상태 관리).
    *   **변경 전:** 사용자 제어 가능한 읽기 편의성 기능 부재.
    *   **변경 후:** 웹 페이지 상단 또는 설정 메뉴에 글꼴 크기 조절 버튼 및 고대비 모드 전환 버튼 추가. 해당 기능에 따라 `body` 클래스를 토글하고 CSS 변수 또는 테마별 CSS 파일을 적용.
    *   **예상 효과:** 시력 저하 사용자 등 다양한 사용자가 자신의 필요에 맞춰 인터페이스를 조정할 수 있도록 하여 접근성과 편의성을 극대화합니다.

6.  **정치/통계 용어 설명 툴팁/팝오버 기능**
    *   **무엇을 어디서 변경하는가:** HTML (설명 필요한 용어에 특정 클래스/속성 부여), JavaScript (해당 요소에 마우스 이벤트 리스너 추가 및 툴팁/팝오버 UI 생성 로직), CSS (툴팁/팝오버 스타일링).
    *   **변경 전:** 전문 용어에 대한 별도 설명 부재.
    *   **변경 후:** "오차범위", "비례대표", "표본수" 등 용어에 마우스를 올리면 간략한 설명을 보여주는 동적 툴팁/팝오버 컴포넌트 구현.
    *   **예상 효과:** 정치 및 통계 정보에 익숙하지 않은 사용자도 쉽게 정보를 이해할 수 있도록 도와 정보 접근성을 높입니다.

---

이러한 액션 아이템들은 프로젝트의 가독성, 사용자 경험, 그리고 장기적인 유지보수 및 확장성에 크게 기여할 것입니다. 개발 팀의 역량과 프로젝트 일정에 따라 우선순위를 조절하여 진행하는 것을 권장합니다.
