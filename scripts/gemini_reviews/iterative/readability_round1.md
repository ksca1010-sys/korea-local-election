# 가독성 및 데이터 시각화 검증 - Round 1/5

생성일: 2026-03-09 11:01
모델: gemini-2.5-flash

---

데이터 시각화 및 정보 가독성 전문가로서 한국 지방선거 인터랙티브 지도 프로젝트에 대한 깊이 있는 분석과 구체적인 개선안을 제시해 드리겠습니다. 다크 테마(#0a0e17) 환경에서의 가독성과 정보 전달 효율성에 중점을 두겠습니다.

---

### 1. 사이드 패널의 정보 위계 (선거 결과 → 현직자 → 핵심 이슈 → 여론조사) 가독성

제공된 HTML 구조와 사용자 질의를 종합할 때, `overview` 탭 내의 정보 위계와 `polls` 탭으로의 전환 맥락을 모두 고려해야 합니다.

**현재 구조 분석:**

*   **`overview` 탭:** `지난 선거 결과` -> `교육감 주요 지표` -> `현직자 정보` -> `지역 핵심 이슈` 순서입니다.
*   `여론조사`는 별도의 탭으로 분리되어 있습니다. 이는 정보의 양과 성격상 적절한 분리입니다.
*   각 섹션은 `<div class="panel-card">`로 명확히 구분되어 있고, `<h4>` 제목과 아이콘이 있어 시각적으로 구분이 용이합니다.

**가독성 평가 및 개선 제안:**

현재 `overview` 탭의 순서는 시간 흐름상 "과거 → 현재 → 미래(이슈)"로 볼 수 있으나, 사용자가 지역을 클릭했을 때 가장 궁금해할 만한 "현재의 핵심 정보"를 먼저 제시하는 것이 가독성 및 정보 접근성 측면에서 더 유리할 수 있습니다.

1.  **가장 중요한 정보 상단 배치:** 사용자가 지역을 선택했을 때 가장 즉각적으로 알고 싶어 하는 정보(예: 현재 누가 당선되었는지, 현직자의 상태 등)를 상단에 배치하는 것이 좋습니다.
2.  **`교육감 주요 지표` 위치 조정:** `교육감 주요 지표`는 다른 카드들과 성격이 다소 다르므로, `현직자 정보` 뒤에 배치하거나 `지난 선거 결과`와 묶는 것을 고려할 수 있습니다.
3.  **일관된 아이콘 사용:** 모든 `<h4>` 제목에 적절한 아이콘이 사용되어 시각적 구분이 좋습니다.

**구체적 개선안 (HTML 코드 레벨):**

`tab-overview` 내의 `<div class="panel-card">` 순서를 조정하여 `현직자 정보`를 `지난 선거 결과`보다 앞으로 가져오는 것을 제안합니다.

```html
<!-- Overview Tab -->
<div id="tab-overview" class="tab-content" style="display:none;">
    <div id="district-detail" class="panel-card" style="display:none;">
        <!-- 기초단체장 정보가 여기에 렌더링됨 (가장 중요할 수 있으므로 상단 유지) -->
    </div>

    <!-- 현직자 정보는 현재 지역의 상태를 바로 알려주므로, 지난 선거 결과보다 먼저 배치 -->
    <div class="panel-card">
        <h4><i class="fas fa-user-tie"></i> 현직자 정보</h4>
        <div id="current-governor"></div>
        <div id="panel-region-badge" class="panel-region-badge" style="display:none"></div>
    </div>

    <!-- 지난 선거 결과는 현직자 정보에 대한 맥락을 제공 -->
    <div class="panel-card">
        <h4><i class="fas fa-history"></i> 지난 선거 결과 (제8회)</h4>
        <div id="prev-election-result"></div>
    </div>

    <!-- 교육감 정보는 특정 선거구에만 해당하므로, 일반적인 정보 뒤에 배치하거나 관련성 있는 섹션에 묶기 -->
    <div id="superintendent-summary-card" class="panel-card superintendent-summary-card" style="display:none;">
        <h4><i class="fas fa-graduation-cap"></i> 교육감 주요 지표</h4>
        <div id="superintendent-summary" class="superintendent-summary-grid"></div>
        <div id="superintendent-summary-note" class="superintendent-summary-note"></div>
    </div>

    <div class="panel-card">
        <h4><i class="fas fa-bullhorn"></i> 지역 핵심 이슈</h4>
        <div id="key-issues"></div>
    </div>
</div>
```

---

### 2. 여론조사 차트 (막대 차트 + 추세 라인 차트 + 연령대별 차트)의 가독성

세 가지 차트 모두 Chart.js를 사용하며, 다크 테마에 맞춰 기본 설정을 잘 적용했습니다. 전반적으로 좋은 시작점이지만, 다크 테마 환경에서 더욱 개선할 수 있는 부분이 있습니다.

**공통 사항:**

*   **글꼴 크기 (`Chart.defaults.font.size = 11;`):** 다크 테마에서는 글자 대비가 중요하므로, 기본 글꼴 크기를 `12px` 또는 `13px`로 약간 키워 시인성을 높이는 것을 추천합니다. 특히 Noto Sans KR은 획이 많은 글자가 있어 작은 크기에서 가독성이 저하될 수 있습니다.
*   **그리드 라인 색상 (`rgba(42, 53, 83, 0.3)`):** 현재 그리드 라인 색상은 배경색(#0a0e17)과 유사하여 매우 흐릿하게 보일 수 있습니다. 좀 더 밝고 대비가 있는 색상(예: `#8b99b5`의 투명도를 낮춘 값)을 사용하여 그리드 라인의 존재감을 유지하면서도 방해되지 않도록 할 수 있습니다.
*   **툴팁 배경색/텍스트 색상 (`rgba(26, 34, 54, 0.95)`):** 현재 툴팁 배경색이 메인 패널 배경색과 매우 유사하여 툴팁 자체의 시인성이 떨어질 수 있습니다. 툴팁 배경색을 메인 배경보다 살짝 밝게 하거나, 툴팁 내 텍스트 색상을 더 밝게 (`#FFFFFF` 또는 `#e0e6f0`) 하여 대비를 높여야 합니다.

**차트별 개선 제안:**

1.  **최신 여론조사 (막대 차트 - `renderPollBarChart`)**
    *   **Y축 최대값 (`max: Math.max(...data) + 10`):** 적절합니다.
    *   **툴팁 레이블 (`callbacks.label`):** `candidate.name`과 `partyName`을 모두 표시하는 현재 방식은 간결하지만, `후보자명 (정당명): X%` 형태로 표현하면 정보 밀도를 높일 수 있습니다. (현재 코드에서는 후보자명은 X축, 툴팁에는 정당명만 나옴)
    *   **코드 레벨 제안:**
        ```javascript
        // ChartsModule - renderPollBarChart 함수 내
        // Chart.defaults.font.size = 12; // Global default 적용 또는 개별 설정
        // ...
        options: {
            // ...
            plugins: {
                // ...
                tooltip: {
                    backgroundColor: 'rgba(40, 50, 70, 0.95)', // 메인 배경보다 살짝 밝은 툴팁 배경
                    borderColor: 'rgba(59, 130, 246, 0.5)', // 테두리 대비 강화
                    bodyColor: '#e0e6f0', // 툴팁 본문 텍스트 색상
                    titleColor: '#e0e6f0', // 툴팁 제목 텍스트 색상
                    callbacks: {
                        label: (ctx) => {
                            const candidate = candidates[ctx.dataIndex];
                            const partyName = ElectionData.getPartyName(candidate.party);
                            // 후보자명 (정당명): X% 형태로 변경하여 정보 명확성 강화
                            return `${candidate.name} (${partyName}): ${ctx.raw}%`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: {
                        font: { size: 12, weight: '500' } // 글꼴 크기 통일
                    }
                },
                y: {
                    grid: { color: 'rgba(139, 153, 181, 0.25)' }, // 밝은 회색 계열의 그리드 라인
                    ticks: {
                        callback: (value) => value + '%',
                        stepSize: 10,
                        font: { size: 12 } // 글꼴 크기 통일
                    }
                }
            }
        }
        ```

2.  **지지율 추이 (라인 차트 - `renderPollTrendChart`)**
    *   **오차범위 밴드:** 1위 후보의 오차범위를 시각적으로 제공하는 것은 매우 훌륭합니다. `rgba(59, 130, 246, 0.08)` 색상은 너무 옅을 수 있으니, 아주 약간 더 진하게 (예: `0.12`~`0.15`) 조정하여 인지도를 높이는 것을 고려할 수 있습니다.
    *   **범례 (`legend`):** `bottom` 위치와 필터링은 적절합니다. 글꼴 크기를 전반적인 글꼴 크기 개선에 맞춰 조정해야 합니다.
    *   **코드 레벨 제안:**
        ```javascript
        // ChartsModule - renderPollTrendChart 함수 내
        // ...
        options: {
            // ...
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        filter: (item) => item.text !== '',
                        font: { size: 12 } // 글꼴 크기 통일
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(40, 50, 70, 0.95)',
                    borderColor: 'rgba(59, 130, 246, 0.5)',
                    bodyColor: '#e0e6f0',
                    titleColor: '#e0e6f0',
                    // ...
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(139, 153, 181, 0.25)' }, // 밝은 회색 계열의 그리드 라인
                    ticks: {
                        font: { size: 12 }
                    }
                },
                y: {
                    grid: { color: 'rgba(139, 153, 181, 0.25)' }, // 밝은 회색 계열의 그리드 라인
                    ticks: {
                        callback: (value) => value + '%',
                        stepSize: 5,
                        font: { size: 12 }
                    }
                }
            }
        }
        // 오차범위 밴드 배경색 조정 (선택 사항)
        // backgroundColor: 'rgba(59, 130, 246, 0.12)', // 살짝 진하게 조정
        ```

3.  **연령대별 지지율 (스택 막대 차트 - `renderDemographicsChart`)**
    *   **범례 글꼴 크기 (`font: { size: 10 }`):** 현재 10px로 설정되어 있는데, 이는 너무 작아 가독성이 떨어집니다. `12px`로 통일하는 것이 좋습니다.
    *   **'기타' 색상 (`rgba(128, 128, 128, 0.5)`):** 중간 회색은 다크 테마에서 배경색과 너무 유사하게 보일 수 있습니다. 좀 더 명확한 대비를 주거나, 살짝 채도 있는 중간 톤의 색상(예: 옅은 청회색)을 사용하는 것을 고려해볼 수 있습니다.
    *   **코드 레벨 제안:**
        ```javascript
        // ChartsModule - renderDemographicsChart 함수 내
        // ...
        options: {
            // ...
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        usePointStyle: true,
                        pointStyle: 'rect',
                        font: { size: 12 } // 10 -> 12로 변경
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(40, 50, 70, 0.95)',
                    borderColor: 'rgba(59, 130, 246, 0.5)',
                    bodyColor: '#e0e6f0',
                    titleColor: '#e0e6f0',
                    // ...
                }
            },
            scales: {
                x: {
                    ticks: {
                        font: { size: 12 }
                    }
                },
                y: {
                    grid: { color: 'rgba(139, 153, 181, 0.25)' }, // 밝은 회색 계열의 그리드 라인
                    ticks: {
                        callback: (value) => value + '%',
                        stepSize: 25,
                        font: { size: 12 }
                    }
                }
            }
        }
        // '기타' 카테고리 색상 조정
        datasets.push({
            label: '기타',
            // 현재: backgroundColor: 'rgba(128, 128, 128, 0.5)', borderColor: '#808080',
            backgroundColor: 'rgba(150, 160, 170, 0.6)', // 약간 더 밝고 푸른빛 도는 회색
            borderColor: '#96A0AA',
            borderWidth: 1,
            borderRadius: 3
        });
        ```

**Chart.defaults 전역 설정 변경 제안:**

```javascript
// Charts Module - Chart.js Visualizations
const ChartsModule = (() => {
    // ...
    // Chart.js global defaults
    Chart.defaults.color = '#8b99b5';
    Chart.defaults.borderColor = 'rgba(42, 53, 83, 0.5)'; // 데이터셋 보더 컬러 (유지)
    Chart.defaults.font.family = "'Noto Sans KR', sans-serif";
    Chart.defaults.font.size = 12; // 11 -> 12로 증가
    Chart.defaults.plugins.legend.labels.boxWidth = 12;
    Chart.defaults.plugins.legend.labels.padding = 12;
    // ...
})();
```

---

### 3. 정당 지지도를 도넛→텍스트 바 리스트로 변경한 것에 대한 평가

**평가:**
도넛 차트를 제거하고 텍스트 바 리스트로 교체한 것은 **매우 긍정적인 변화**입니다.

*   **가독성 및 비교 용이성 대폭 향상:** 도넛 차트는 여러 항목 간의 상대적인 크기를 정확히 비교하기 어렵다는 단점이 있습니다. 특히 유사한 비율의 항목이 많거나, 작은 비중의 항목이 많을 경우 더욱 그렇습니다. 텍스트 바 리스트는 각 정당의 지지율을 수평 막대 길이로 직관적으로 보여주며, 옆에 정확한 % 수치를 함께 표기하여 훨씬 정확하고 빠르게 정보를 파악하고 비교할 수 있게 합니다.
*   **정보 밀도 및 정밀성:** 도넛 차트는 보통 전체의 일부분(part-to-whole) 관계를 보여주는 데는 좋지만, 개별 항목의 정확한 수치를 파악하기 위해서는 범례를 계속 확인해야 합니다. 텍스트 바 리스트는 정당명, 색상, 막대, % 수치를 한 줄에 배치하여 정보 밀도를 높이고, 정밀한 수치 파악을 용이하게 합니다.
*   **다크 테마 적합성:** 다크 테마에서는 작은 색상 차이가 더욱 인지하기 어려워질 수 있습니다. 텍스트 바는 막대 길이와 명확한 텍스트로 정보를 전달하므로, 색상 자체의 미묘한 차이에 덜 의존하여 다크 테마에서 가독성을 유지하는 데 더 유리합니다.

**구체적 개선안 (HTML/CSS 코드 레벨):**

제공된 `renderPartyDonutChart` 함수는 훌륭한 마크업을 생성합니다. 이제 이 마크업에 적절한 CSS 스타일링을 적용하여 가독성을 극대화해야 합니다.

1.  **% 수치 포맷팅:** `pct` 값이 소수점 이하 여러 자리일 경우, `toFixed(1)` 등으로 소수점 첫째 자리까지만 표시하여 일관성을 유지하고 간결하게 보여주는 것이 좋습니다.
2.  **`party-pct` 색상 강조:** `party-pct`의 텍스트 색상을 기본 텍스트 색상보다 조금 더 밝게 (예: `#e0e6f0`) 하여 수치를 강조할 수 있습니다.
3.  **막대 배경 (`party-bar-wrap`):** 막대 바가 채워지지 않은 부분의 배경색을 설정하여 (예: 기본 텍스트 색상의 낮은 투명도 `rgba(139, 153, 181, 0.1)`) 전체 막대의 길이를 인지하기 쉽게 하는 것이 좋습니다.
4.  **폰트 크기 및 여백:** `.party-support-row` 전체의 폰트 크기와 각 요소 간의 여백을 적절히 조절하여 답답하지 않고 시원하게 정보를 전달해야 합니다.

```javascript
// ChartsModule - renderPartyDonutChart 함수 내
// ...
const rows = partyKeys.map(k => {
    const color = ElectionData.getPartyColor(k);
    const name = ElectionData.getPartyName(k);
    const rawPct = support[k];
    const pct = rawPct.toFixed(1); // 소수점 첫째 자리까지 표시
    const barWidth = totalSupport > 0 ? (rawPct / totalSupport * 100) : 0; // 원본 rawPct로 계산

    return `
        <div class="party-support-row">
            <span class="party-dot" style="background:${color}"></span>
            <span class="party-name">${name}</span>
            <div class="party-bar-wrap">
                <div class="party-bar" style="width:${barWidth}%;background:${color}"></div>
            </div>
            <span class="party-pct" style="color: #e0e6f0;">${pct}%</span> <!-- 강조 색상 적용 -->
        </div>`;
}).join('');
// ...
```

**예시 CSS (가정):**

```css
/* 사이드 패널의 어두운 배경색: #0a0e17 */

.party-support-row {
    display: flex;
    align-items: center;
    margin-bottom: 10px; /* 각 행 사이의 간격 */
    font-size: 13px; /* 글꼴 크기 */
    color: #8b99b5; /* 기본 텍스트 색상 */
}

.party-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    margin-right: 8px;
    flex-shrink: 0; /* 공간 할당 시 축소되지 않도록 */
}

.party-name {
    flex-grow: 1; /* 남은 공간을 채우도록 */
    margin-right: 12px;
    font-weight: 500;
}

.party-bar-wrap {
    width: 80px; /* 막대 전체 너비 (조절 가능) */
    height: 10px; /* 막대 높이 */
    background: rgba(139, 153, 181, 0.1); /* 막대의 빈 공간 배경색 */
    border-radius: 5px;
    overflow: hidden; /* 막대가 넘치지 않도록 */
    margin-right: 12px;
}

.party-bar {
    height: 100%;
    border-radius: 5px; /* `party-bar-wrap`과 동일하게 */
    transition: width 0.5s ease-out; /* 애니메이션 효과 */
}

.party-pct {
    font-weight: 600; /* 수치 강조 */
    width: 45px; /* % 수치 공간 확보 */
    text-align: right;
    flex-shrink: 0;
    color: #e0e6f0; /* 밝은 색상으로 강조 */
}
```

---

### 4. 지도 위 비례대표 라벨 (다수당 색상 원 + 의석수)의 가독성

제공된 코드에서는 지도 위에 직접 라벨을 그리는 D3.js 관련 코드는 없지만, `renderProportionalView` 함수가 비례대표 데이터를 로드하고 사이드 패널에 요약 정보를 표시하는 부분이 있습니다. 지도 위 라벨은 시각화 측면에서 중요한 요소이므로, 일반적인 구현 가이드라인을 바탕으로 조언을 드립니다.

**가독성 평가 및 개선 제안:**

"다수당 색상 원 + 의석수" 조합은 지도 위에서 핵심 정보를 전달하는 매우 효과적인 방법입니다.

*   **색상 대비:** 다크 테마 지도 배경 위에서 다수당의 색상 원은 명확하게 눈에 띄어야 합니다. 너무 어둡거나 채도가 낮은 정당 색상은 배경과 겹쳐 보일 수 있습니다. 정당 색상 팔레트가 다크 테마에 적합한지 점검해야 합니다.
*   **텍스트 대비 및 크기:** 의석수를 표시하는 텍스트는 원의 배경색과 충분한 대비를 가져야 합니다. 일반적으로 원 안에 텍스트를 넣을 경우, 밝은 배경색 위에는 검은색 텍스트, 어두운 배경색 위에는 흰색 텍스트가 가장 좋습니다. 또한, 너무 작지 않은 적절한 폰트 크기를 사용하여 확대/축소 시에도 가독성을 유지해야 합니다.
*   **라벨 겹침 방지:** 지역이 많거나 줌 레벨이 낮을 때 라벨이 겹칠 수 있습니다. D3.js의 충돌 감지(collision detection)나 Force-directed labeling 같은 기법을 사용하여 라벨 겹침을 최소화해야 합니다.
*   **호버(Hover) 상호작용:** 라벨에 마우스를 올렸을 때 추가 정보(예: 정당명)를 툴팁으로 보여주면 유용합니다.

**구체적 개선안 (D3.js 지도 렌더링 코드 가정):**

```javascript
// [가정] D3.js 지도 렌더링 로직의 일부
// 이 코드는 제공된 코드 스니펫에는 없지만, 지도 위 라벨 구현 시 참고하세요.

function renderMapProportionalLabels(mapData) {
    // ... D3 초기화 및 데이터 바인딩 로직 ...

    const labels = svg.selectAll(".proportional-label")
        .data(mapData.proportionalRegions) // 예시 데이터
        .enter()
        .append("g")
        .attr("class", "proportional-label")
        .attr("transform", d => `translate(${projection([d.lon, d.lat])})`); // 지역 중심 좌표

    labels.append("circle")
        .attr("r", 12) // 원의 반지름 (크기 조절)
        .attr("fill", d => ElectionData.getPartyColor(d.dominantParty)) // 다수당 색상
        // 다크 테마에서 배경과의 대비를 위해 옅은 테두리 추가
        .attr("stroke", "rgba(255, 255, 255, 0.4)")
        .attr("stroke-width", 1.5);

    labels.append("text")
        .attr("dy", "0.35em") // 텍스트를 원의 중앙에 수직 정렬
        .attr("text-anchor", "middle") // 텍스트를 원의 중앙에 수평 정렬
        // 원 배경색에 따라 텍스트 색상을 동적으로 결정 (밝은색/어두운색)
        .attr("fill", d => getOptimalTextColor(ElectionData.getPartyColor(d.dominantParty)))
        .attr("font-size", "12px") // 가독성 있는 글꼴 크기
        .attr("font-weight", "bold")
        .text(d => d.totalSeats + '석');

    // 툴팁 등 상호작용 추가
    labels.append("title") // SVG title 요소로 툴팁 제공
        .text(d => `${d.regionName}: ${ElectionData.getPartyName(d.dominantParty)} ${d.totalSeats}석`);

    // Helper 함수: 배경색에 따라 최적의 텍스트 색상을 반환
    function getOptimalTextColor(bgColor) {
        // RGB 값으로 변환하여 밝기 계산 (WCAG 권장 대비)
        const hex = bgColor.startsWith('#') ? bgColor.slice(1) : bgColor;
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        return luminance > 0.5 ? '#333333' : '#FFFFFF'; // 밝으면 어두운 글자, 어두우면 밝은 글자
    }

    // ... 라벨 겹침 방지 로직 (예: d3-force 활용) ...
}
```

---

### 5. 수치 표기 일관성 (%, 석, 명 등)

**평가:**

제공된 코드에서 수치 표기 일관성은 **매우 잘 지켜지고 있습니다.**
*   `%` (백분율): 여론조사 결과, 지지도 추이, 정당 지지도, 연령대별 지지율 등 모든 백분율에 일관되게 사용됩니다.
*   `명` (사람 수): 표본수에 `toLocaleString()`과 함께 `명`이 사용됩니다.
*   `%p` (퍼센트 포인트): 오차범위에 `±X%p` 형태로 명확하게 사용됩니다.
*   `석` (의석수): 비례대표 요약 정보에 `석`이 사용됩니다.

**구체적 개선안 (코드 레벨):**

대부분의 표기 일관성은 이미 확보되어 있지만, **소수점 처리의 일관성**을 강화하는 것을 제안합니다. 현재 `ctx.raw`를 그대로 사용하는 경우가 있어, 원본 데이터의 정밀도에 따라 소수점 자리가 달라질 수 있습니다.

1.  **백분율 소수점 자리 통일:** 여론조사 및 지지율 관련 백분율은 보통 소수점 첫째 자리 또는 정수로 표현됩니다. 프로젝트의 정책에 따라 일관된 소수점 자리수를 적용하는 것이 좋습니다.
    *   예: `toFixed(1)` (소수점 첫째 자리까지) 또는 `toFixed(0)` (정수).

```javascript
// ChartsModule - renderPollBarChart 함수 내 툴팁
callbacks: {
    label: (ctx) => {
        const candidate = candidates[ctx.dataIndex];
        const partyName = ElectionData.getPartyName(candidate.party);
        return `${candidate.name} (${partyName}): ${ctx.raw.toFixed(1)}%`; // 소수점 첫째 자리
    }
}

// ChartsModule - renderPollTrendChart 함수 내 툴팁
callbacks: {
    label: (ctx) => {
        if (ctx.raw === null || ctx.dataset.label === '' || ctx.dataset.label.includes('오차범위')) return null;
        return `${ctx.dataset.label}: ${ctx.raw.toFixed(1)}%`; // 소수점 첫째 자리
    }
}

// ChartsModule - renderPartyDonutChart 함수 내 텍스트 리스트
const pct = rawPct.toFixed(1); // 위 3번 항목에서 이미 제안
// ... <span class="party-pct" ...>${pct}%</span>

// ChartsModule - renderDemographicsChart 함수 내 툴팁
callbacks: {
    label: (ctx) => `${ctx.dataset.label}: ${ctx.raw.toFixed(1)}%` // 소수점 첫째 자리
}
```
*   **Y축 틱스:** Y축 틱스도 마찬가지로 `toFixed(0)` 또는 `toFixed(1)`을 적용할 수 있습니다. (현재는 `stepSize`로 인해 주로 정수로 표시될 가능성이 높음)

---

### 6. 다크 테마에서 텍스트/차트 색상 대비

다크 테마 환경(`background: #0a0e17`)에서 시각적 요소들의 대비는 가독성 확보에 가장 중요한 요소 중 하나입니다.

**현재 설정 분석:**

*   **기본 텍스트 색상 (`Chart.defaults.color = '#8b99b5';`):**
    *   이 색상(`rgb(139, 153, 181)`)은 배경색(`rgb(10, 14, 23)`)과 WCAG AA 등급을 충족하는 충분히 좋은 대비(약 7.1:1)를 가집니다. 차트 레이블, 축 틱스 등 기본 텍스트에는 적합합니다.
*   **기본 보더 색상 (`Chart.defaults.borderColor = 'rgba(42, 53, 83, 0.5)';`):**
    *   이는 주로 데이터셋의 보더에 사용됩니다. 배경색과 대비가 낮아 보더가 두드러지지 않을 수 있으나, 일반적으로 차트 보더는 강한 대비를 필요로 하지 않으므로 허용 가능합니다.
*   **그리드 라인 색상 (`rgba(42, 53, 83, 0.3)`):**
    *   이 색상은 배경색과 대비가 매우 낮아 사실상 거의 보이지 않을 수 있습니다. 이는 "너무 방해되지 않는" 의도일 수 있지만, 일부 사용자에게는 그리드 라인이 아예 없는 것처럼 느껴질 수 있습니다.
*   **툴팁 배경색 (`rgba(26, 34, 54, 0.95)`):**
    *   메인 배경색(`rgba(10, 14, 23, 1)`)과 매우 유사한 어두운 색상입니다. 이 위에 기본 텍스트 색상(`#8b99b5`)을 사용하면 대비가 약해져 가독성이 저하됩니다.
*   **정당 색상:**
    *   `ElectionData.getPartyColor()`에서 반환되는 정당 색상들이 다크 테마 위에서 충분히 식별 가능하고 대비가 좋은지 실제 색상들을 확인해야 합니다. 너무 어두운 정당색은 문제가 될 수 있습니다.
*   **'기타' 색상 (`rgba(128, 128, 128, 0.5)`):**
    *   중간 회색은 다크 테마 배경에 잘 녹아들 수 있으나, 때로는 너무 밋밋하거나 구분이 어려울 수 있습니다.

**구체적 개선안 (코드 레벨):**

1.  **그리드 라인 색상 조정:** 좀 더 밝은 색상으로 투명도를 조절하여 존재감을 확보합니다.
    ```javascript
    // Chart.js 스케일 옵션 내 grid 속성
    grid: {
        color: 'rgba(139, 153, 181, 0.25)' // 기본 텍스트 색상의 낮은 투명도 사용
        // 또는: color: 'rgba(70, 80, 100, 0.4)' // 약간 더 밝은 어두운 푸른색
    }
    ```

2.  **툴팁 배경색 및 텍스트 색상 조정:** 툴팁 배경을 메인 배경보다 살짝 밝게 하거나, 툴팁 텍스트를 흰색 계열로 변경하여 대비를 높입니다.
    ```javascript
    // Chart.js 툴팁 플러그인 옵션 내
    plugins: {
        tooltip: {
            backgroundColor: 'rgba(40, 50, 70, 0.95)', // 메인 배경보다 살짝 밝은 어두운 푸른색
            titleColor: '#e0e6f0', // 툴팁 제목 텍스트 색상 (밝게)
            bodyColor: '#e0e6f0',  // 툴팁 본문 텍스트 색상 (밝게)
            borderColor: 'rgba(59, 130, 246, 0.5)', // 테두리 색상 대비 강화
            // ...
        }
    }
    ```

3.  **'기타' 카테고리 색상 조정:** 좀 더 구별 가능한 색상을 사용합니다.
    ```javascript
    // renderDemographicsChart 함수 내 '기타' 데이터셋
    datasets.push({
        label: '기타',
        backgroundColor: 'rgba(150, 160, 170, 0.6)', // 약간 더 밝고 푸른빛 도는 회색
        borderColor: '#96A0AA',
        // ...
    });
    ```

4.  **정당 색상 팔레트 검토:** `ElectionData.getPartyColor()`에서 반환되는 색상들이 다크 테마에서 충분히 잘 보이는지 실제 화면에서 테스트해봐야 합니다. 필요하다면 일부 정당 색상의 채도나 명도를 조정하여 대비를 확보해야 합니다. (이 부분은 `ElectionData` 코드가 없어서 직접 수정 제안은 어렵습니다.)

5.  **HTML 내 텍스트 요소:** 사이드 패널의 `<p>`, `<span>`, `<a>` 등 Chart.js에 속하지 않는 일반 HTML 텍스트 요소들도 모두 다크 테마에서 충분한 대비를 갖도록 CSS를 통해 색상이 지정되어 있는지 확인해야 합니다. 특히 링크(`ptb-link`)는 일반 텍스트와 구분되는 색상 (예: 푸른색)을 사용하고, 호버 상태에서 시각적 피드백을 주어야 합니다.

---

전반적으로 프로젝트의 방향성과 구현 방식은 매우 좋습니다. 위의 개선안들은 다크 테마 환경에서의 사용자 경험과 정보 가독성을 한층 더 높이는 데 기여할 것입니다.
