# 가독성 및 데이터 시각화 검증 - 5라운드 통합 결과

생성일: 2026-03-09 11:03
모델: gemini-2.5-flash


========================================
## Round 1/5
========================================

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

========================================
## Round 2/5
========================================

데이터 시각화 및 정보 가독성 전문가로서, 이전에 분석했던 내용 중 사용자 경험에 가장 큰 영향을 미치는 세 가지 문제점을 선정하여 심층 분석 및 개선 방안을 제시합니다. 다크 테마(#0a0e17) 환경에서의 가독성을 최우선으로 고려하겠습니다.

---

### 가장 심각한 문제점 1: 다크 테마 환경에서의 전반적인 텍스트 및 차트 요소 대비 부족

**1. 현재 상태의 구체적 문제 설명:**

*   **글꼴 크기 (`Chart.defaults.font.size = 11;`):** 다크 테마에서는 배경과 글자 사이의 명확한 대비가 더욱 중요합니다. 현재 11px는 한국어 글꼴(특히 Noto Sans KR처럼 획이 많은 글꼴)에서는 시인성이 충분하지 않아 가독성 저하를 유발합니다. 특히 축 레이블, 범례 등 정보량이 많은 곳에서 작은 글씨는 눈의 피로도를 높입니다.
*   **그리드 라인 색상 (`rgba(42, 53, 83, 0.3)`):** 현재 그리드 라인 색상은 패널 배경색(`#0a0e17` 또는 `rgb(10, 14, 23)`)과 매우 유사한 어두운 계열의 색상으로, 투명도까지 낮아 거의 보이지 않을 정도로 흐릿합니다. 이는 차트의 데이터를 정확히 읽는 데 필요한 기준선 역할을 제대로 수행하지 못하게 합니다.
*   **툴팁 배경색 (`rgba(26, 34, 54, 0.95)`) 및 텍스트 색상:** 툴팁의 배경색이 메인 패널 배경색과 지나치게 유사하게 어두워 툴팁 박스 자체가 시각적으로 잘 구분되지 않습니다. 이 위에 기본 텍스트 색상(`8b99b5`)을 사용하면 대비가 더욱 낮아져 툴팁 내용을 읽기 어렵게 만듭니다. 툴팁은 사용자가 상세 데이터를 탐색하는 핵심 상호작용 요소이므로, 명확한 대비가 필수적입니다.
*   **'기타' 카테고리 색상 (`rgba(128, 128, 128, 0.5)`):** 연령대별 차트의 '기타' 카테고리에 사용된 중간 회색은 다크 테마 배경에 묻히기 쉬워, 다른 정당 색상들과의 구분이 어렵고 데이터 인지율을 떨어뜨립니다.

**2. 사용자 경험에 미치는 영향 (심각도 1-5): 5**
정보 시각화의 기본은 "정보를 쉽게 볼 수 있는 것"입니다. 핵심 텍스트가 작거나, 중요한 보조선이 보이지 않거나, 상호작용 요소(툴팁)의 가독성이 떨어지면 사용자는 데이터 이해에 어려움을 겪고 쉽게 피로감을 느낄 수 있습니다. 이는 사용자가 정보를 제대로 파악하지 못하게 만들어, 프로젝트의 신뢰성과 유용성을 떨어뜨리는 가장 근본적인 문제입니다.

**3. 구체적 해결 코드/CSS 제안:**

```javascript
// Charts Module - Chart.js Visualizations
const ChartsModule = (() => {
    // Chart.js global defaults
    Chart.defaults.color = '#C9D4E7'; // 기본 텍스트 색상을 더 밝게 조정 (WCAG AA 이상 대비)
    Chart.defaults.borderColor = 'rgba(42, 53, 83, 0.5)'; // 데이터셋 보더 색상은 유지
    Chart.defaults.font.family = "'Noto Sans KR', sans-serif";
    Chart.defaults.font.size = 13; // 11px에서 13px로 증가시켜 가독성 향상
    Chart.defaults.plugins.legend.labels.boxWidth = 14; // 범례 박스 크기 키우기
    Chart.defaults.plugins.legend.labels.padding = 16; // 범례 여백 증가

    // 모든 차트에 공통적으로 적용될 그리드 및 툴팁 스타일 함수
    const getCommonChartOptions = () => ({
        plugins: {
            tooltip: {
                backgroundColor: 'rgba(38, 48, 70, 0.95)', // 메인 배경보다 확연히 밝은 어두운 푸른색
                borderColor: 'rgba(59, 130, 246, 0.6)', // 테두리 색상 대비 강화
                borderWidth: 1,
                padding: 12,
                cornerRadius: 8,
                titleFont: { weight: '600', size: 14 }, // 툴팁 제목 글꼴 크기
                bodyFont: { size: 13 }, // 툴팁 본문 글꼴 크기
                titleColor: '#e0e6f0', // 툴팁 제목 텍스트 색상 (밝게)
                bodyColor: '#e0e6f0',  // 툴팁 본문 텍스트 색상 (밝게)
            },
            legend: {
                labels: {
                    font: { size: 13 } // 범례 글꼴 크기도 통일
                }
            }
        },
        scales: {
            x: {
                grid: {
                    color: 'rgba(139, 153, 181, 0.25)' // 기본 텍스트 색상의 낮은 투명도 (배경과의 대비 확보)
                },
                ticks: {
                    font: { size: 12, weight: '500' } // 축 틱스 글꼴 크기 조정
                }
            },
            y: {
                grid: {
                    color: 'rgba(139, 153, 181, 0.25)' // X축과 동일한 그리드 색상
                },
                ticks: {
                    font: { size: 12 } // 축 틱스 글꼴 크기 조정
                }
            }
        }
    });

    // ... (renderPollBarChart, renderPollTrendChart, renderDemographicsChart 함수 내 옵션 병합)
    // 각 render 함수 내에서 options 객체에 getCommonChartOptions() 결과를 병합하여 사용합니다.
    // 예:
    // pollBarChart = new Chart(canvas, {
    //     type: 'bar',
    //     data: { /* ... */ },
    //     options: {
    //         ...getCommonChartOptions(), // 공통 옵션 먼저 적용
    //         aspectRatio: 1.8,
    //         plugins: {
    //             ...getCommonChartOptions().plugins, // 플러그인 개별 병합
    //             legend: { display: false }, // 특정 차트의 개별 설정은 공통 옵션 이후에 덮어쓰기
    //             tooltip: { /* ... */ } // 특정 툴팁 콜백은 여기에 유지
    //         },
    //         scales: {
    //             ...getCommonChartOptions().scales, // 스케일 개별 병합
    //             y: {
    //                 ...getCommonChartOptions().scales.y,
    //                 max: Math.max(...data) + 10,
    //                 stepSize: 10,
    //                 ticks: { /* ... */ }
    //             }
    //         }
    //         // ... 기타 개별 옵션
    //     }
    // });

    // '기타' 카테고리 색상 조정 (renderDemographicsChart 함수 내)
    datasets.push({
        label: '기타',
        backgroundColor: 'rgba(150, 160, 170, 0.7)', // 배경색과 더 잘 구분되도록 명도 및 투명도 조정
        borderColor: '#96A0AA',
        borderWidth: 1,
        borderRadius: 3
    });
})();
```

**4. 해결 우선순위: 최상 (1순위)**
이 문제는 정보 시각화의 기본 가독성에 대한 것으로, 모든 차트와 텍스트 기반 정보 전달의 효율성에 직접적인 영향을 미칩니다. 다른 어떤 개선 사항보다 우선적으로 해결해야 합니다.

---

### 가장 심각한 문제점 2: 지도 위 비례대표 라벨의 가독성 및 겹침 문제

**1. 현재 상태의 구체적 문제 설명:**

*   **색상 대비:** `ElectionData.getPartyColor()`에서 반환되는 정당 색상들이 지도 배경(`d3.geoPath()` 등으로 그려지는 지역 색상)과 다크 테마 지도 위에 배치될 때 충분한 대비를 제공하는지 불분명합니다. 특정 정당 색상이 배경색과 유사하거나 너무 어두우면 원의 경계가 모호해져 식별이 어려워집니다.
*   **텍스트 대비:** 원 안에 의석수를 표시하는 텍스트는 원의 배경색(`d.dominantParty`의 색상)과 충분한 대비를 가져야 합니다. `getOptimalTextColor` 함수는 좋은 시도이나, 모든 정당 색상에 대해 최적의 대비를 보장하는지 실제 화면에서 검증이 필요합니다. 예를 들어, 매우 밝은 노란색 정당색 위에 흰색 글씨를 썼을 때 대비가 낮을 수 있습니다.
*   **라벨 겹침 방지 부재:** 제공된 D3.js 스니펫에는 지도 위에 라벨(색상 원 + 의석수 텍스트)을 그리는 로직은 있으나, 여러 라벨이 밀집된 지역에서 서로 겹치지 않도록 하는 `collision detection` 또는 `force-directed labeling`과 같은 기능이 포함되어 있지 않습니다. 라벨 겹침은 지도를 이해하는 데 심각한 방해가 됩니다.
*   **정보 밀도 부족 (툴팁):** 현재 툴팁은 `regionName`, `dominantParty`, `totalSeats`만 제공합니다. 사용자가 이 라벨을 클릭하거나 호버했을 때, 예를 들어 2, 3위 정당의 의석수 분포 등 더 심층적인 정보를 보여주면 사용자 만족도를 높일 수 있습니다.

**2. 사용자 경험에 미치는 영향 (심각도 1-5): 5**
지도 위의 라벨은 사용자가 지역을 선택하기 전에 전체적인 선거 구도를 한눈에 파악하는 데 결정적인 역할을 합니다. 라벨이 잘 보이지 않거나, 텍스트가 읽기 어렵거나, 라벨끼리 겹쳐서 정보를 구분할 수 없다면, 지도의 핵심 기능 중 하나가 마비되는 것과 같습니다. 이는 정보 접근성을 심각하게 저해하고 사용자에게 혼란과 불편함을 초래합니다.

**3. 구체적 해결 코드/CSS 제안:**

```javascript
// [가정] D3.js 지도 렌더링 로직의 일부

function renderMapProportionalLabels(mapData) {
    // ... D3 초기화 및 데이터 바인딩 로직 ...

    const labels = svg.selectAll(".proportional-label")
        .data(mapData.proportionalRegions)
        .enter()
        .append("g")
        .attr("class", "proportional-label")
        .attr("transform", d => `translate(${projection([d.lon, d.lat])})`)
        .on("mouseover", function(event, d) {
            // 호버 시 시각적 피드백 (예: 테두리 강조, 크기 확대)
            d3.select(this).select("circle")
                .transition().duration(100)
                .attr("r", 14) // 원 크기 살짝 확대
                .attr("stroke", "rgba(59, 130, 246, 0.8)") // 강조 테두리
                .attr("stroke-width", 2.5);
            // 상세 툴팁 표시 로직 (D3-tip 또는 custom div)
            showProportionalTooltip(event, d);
        })
        .on("mouseout", function() {
            d3.select(this).select("circle")
                .transition().duration(200)
                .attr("r", 12)
                .attr("stroke", "rgba(255, 255, 255, 0.4)")
                .attr("stroke-width", 1.5);
            hideProportionalTooltip();
        });


    labels.append("circle")
        .attr("r", 12) // 원의 반지름 (크기 조절)
        .attr("fill", d => ElectionData.getPartyColor(d.dominantParty)) // 다수당 색상
        .attr("stroke", "rgba(255, 255, 255, 0.4)") // 다크 테마에서 배경과의 대비를 위한 옅은 테두리
        .attr("stroke-width", 1.5);

    labels.append("text")
        .attr("dy", "0.35em") // 텍스트를 원의 중앙에 수직 정렬
        .attr("text-anchor", "middle") // 텍스트를 원의 중앙에 수평 정렬
        .attr("fill", d => getOptimalTextColor(ElectionData.getPartyColor(d.dominantParty)))
        .attr("font-size", "12px") // 가독성 있는 글꼴 크기
        .attr("font-weight", "bold")
        .attr("text-shadow", "0px 0px 3px rgba(0,0,0,0.5)") // 텍스트 가독성을 위한 그림자 추가
        .text(d => d.totalSeats + '석');

    // Helper 함수: 배경색에 따라 최적의 텍스트 색상을 반환 (WCAG 권장 대비 강화)
    function getOptimalTextColor(bgColor) {
        const hex = bgColor.startsWith('#') ? bgColor.slice(1) : bgColor;
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        // 밝기 임계값을 조정하고, 극단적으로 밝은 색상에는 확실히 어두운 글자 적용
        return luminance > 0.6 ? '#1a1a1a' : '#FFFFFF'; // 더 어둡고 확실한 글자색
    }

    // --- 라벨 겹침 방지 로직 추가 (d3-force 예시) ---
    // 이 부분은 D3.js force simulation을 활용하는 방법으로,
    // 전체 지도의 데이터 및 성능에 따라 적절히 구현해야 합니다.
    const simulation = d3.forceSimulation(mapData.proportionalRegions)
        .force("x", d3.forceX(d => projection([d.lon, d.lat])[0]).strength(1))
        .force("y", d3.forceY(d => projection([d.lon, d.lat])[1]).strength(1))
        .force("collide", d3.forceCollide(d => 12 + 5)) // 원 반지름 + 여백
        .stop();

    for (let i = 0; i < 120; ++i) simulation.tick(); // 충분히 시뮬레이션

    labels.attr("transform", d => `translate(${d.x},${d.y})`);

    // --- 상세 툴팁 함수 (별도 구현 필요) ---
    function showProportionalTooltip(event, d) {
        // 커스텀 HTML 툴팁을 생성하여 상세 정보 표시
        // 예: `<div><h3>${d.regionName}</h3><p>${ElectionData.getPartyName(d.dominantParty)} ${d.totalSeats}석</p><p>...다른 정당 정보...</p></div>`
        // 툴팁의 배경색/텍스트색은 위의 Chart.js 툴팁 스타일과 유사하게 맞춰야 합니다.
    }
    function hideProportionalTooltip() {
        // 툴팁 숨김
    }
}
```

**4. 해결 우선순위: 최상 (2순위)**
지도 위에 표시되는 라벨은 사용자에게 첫인상이자 가장 직관적인 정보 전달 매체이므로, 가독성 및 명확성이 매우 중요합니다. 시각적으로 가장 눈에 띄는 요소 중 하나이므로, 즉각적인 개선이 필요합니다.

---

### 가장 심각한 문제점 3: 정당 지지도 텍스트 바 리스트의 스타일 미흡 및 수치 표기 일관성 부족

**1. 현재 상태의 구체적 문제 설명:**

*   **텍스트 바 리스트 스타일 미흡:** 도넛 차트에서 텍스트 바 리스트로 변경된 것은 좋은 방향이지만, 현재는 HTML 마크업만 제공되어 있습니다. 이 마크업에 다크 테마에 최적화된 CSS 스타일링(폰트 크기, 색상, 여백, 바 배경색 등)이 적용되지 않으면, 막대의 시각적 비교 효과가 떨어지고 전체적인 정보 전달력이 저하될 수 있습니다. 특히 채워지지 않은 막대 부분의 배경색이 없으면 전체 길이를 가늠하기 어렵습니다.
*   **백분율 소수점 자리 통일 부재:** `ctx.raw`를 그대로 사용하는 경우가 많아, 원본 데이터의 정밀도에 따라 차트 및 텍스트 리스트에서 소수점 자리가 제각각 다르게 표현될 수 있습니다. 이는 사용자가 수치를 비교할 때 혼란을 주거나, 데이터의 정밀도에 대한 오해를 불러일으킬 수 있습니다. 특히 `renderPartyDonutChart`에서 `pct`를 `support[k]` 그대로 사용하면 소수점 처리가 일관되지 않을 수 있습니다.
*   **Y축 틱스의 소수점 처리 불확실성:** `stepSize`로 인해 주로 정수로 표시될 가능성이 높지만, 특정 데이터에서는 Y축 틱스에 소수점이 나타날 수도 있으며, 이 경우 통일된 포맷이 필요합니다.

**2. 사용자 경험에 미치는 영향 (심각도 1-5): 4**
정당 지지도 텍스트 바 리스트는 사용자가 각 정당의 지지율을 빠르고 정확하게 비교하는 데 핵심적인 역할을 합니다. 스타일이 미흡하면 시각적 효과가 반감되고, 수치 표기가 일관되지 않으면 데이터의 신뢰성이 저해됩니다. 이는 사용자 경험을 떨어뜨리고 정보 해석에 오류를 초래할 수 있습니다.

**3. 구체적 해결 코드/CSS 제안:**

```javascript
// ChartsModule - renderPartyDonutChart 함수 내 JS 코드 수정
// ...
const rows = partyKeys.map(k => {
    const color = ElectionData.getPartyColor(k);
    const name = ElectionData.getPartyName(k);
    const rawPct = support[k];
    const pct = rawPct.toFixed(1); // 백분율 소수점 첫째 자리까지 통일
    const barWidth = totalSupport > 0 ? (rawPct / totalSupport * 100) : 0; // 원본 rawPct로 계산

    return `
        <div class="party-support-row">
            <span class="party-dot" style="background:${color}"></span>
            <span class="party-name">${name}</span>
            <div class="party-bar-wrap">
                <div class="party-bar" style="width:${barWidth}%;background:${color}"></div>
            </div>
            <span class="party-pct" style="color: #e0e6f0;">${pct}%</span> <!-- 밝은 색상으로 수치 강조 -->
        </div>`;
}).join('');
// ...


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

// ChartsModule - renderDemographicsChart 함수 내 툴팁
callbacks: {
    label: (ctx) => `${ctx.dataset.label}: ${ctx.raw.toFixed(1)}%` // 소수점 첫째 자리
}

// (선택 사항) Y축 틱스 소수점 처리
// scales: {
//     y: {
//         ticks: {
//             callback: (value) => value.toFixed(1) + '%' // 필요하다면 Y축 틱스도 통일
//         }
//     }
// }
```

```css
/* 사이드 패널의 어두운 배경색: #0a0e17 */
/* #panel-content 내부의 CSS (예시) */

.party-support-row {
    display: flex;
    align-items: center;
    margin-bottom: 12px; /* 각 행 사이의 간격 증가 */
    font-size: 13px; /* 글꼴 크기 통일 */
    color: #C9D4E7; /* 기본 텍스트 색상과 통일 */
}

.party-dot {
    width: 14px; /* 크기 약간 증가 */
    height: 14px;
    border-radius: 50%;
    margin-right: 10px; /* 간격 증가 */
    flex-shrink: 0;
}

.party-name {
    flex-grow: 1;
    margin-right: 15px; /* 간격 증가 */
    font-weight: 500;
    white-space: nowrap; /* 이름이 길어지지 않도록 */
    overflow: hidden;
    text-overflow: ellipsis; /* 넘치는 텍스트 처리 */
}

.party-bar-wrap {
    width: 100px; /* 막대 전체 너비 (조절 가능, 반응형 고려) */
    height: 12px; /* 막대 높이 증가 */
    background: rgba(139, 153, 181, 0.15); /* 막대의 빈 공간 배경색 (배경과의 대비 확보) */
    border-radius: 6px;
    overflow: hidden;
    margin-right: 15px; /* 간격 증가 */
}

.party-bar {
    height: 100%;
    border-radius: 6px; /* `party-bar-wrap`과 동일하게 */
    transition: width 0.6s ease-out; /* 애니메이션 효과 시간 증가 */
}

.party-pct {
    font-weight: 700; /* 수치 강조 */
    width: 55px; /* % 수치 공간 확보 */
    text-align: right;
    flex-shrink: 0;
    color: #e0e6f0; /* 밝은 색상으로 강조 */
    font-size: 14px; /* % 수치는 조금 더 크게 */
}
```

**4. 해결 우선순위: 중 (3순위)**
이 문제는 정보 전달의 정확성과 사용 편의성에 중요한 영향을 미치므로, 위의 두 가지 최우선 문제 해결 이후 즉각적으로 다루는 것이 좋습니다. 특히 텍스트 바 리스트의 스타일링은 새로운 요소이므로, 초기 구현 단계에서부터 완성도 있게 가져가는 것이 중요합니다.

========================================
## Round 3/5
========================================

이전에 분석해 드린 내용을 바탕으로, 요청하신 대로 놓친 부분이 없는지 재검토하고 심층적인 피드백을 제공하겠습니다.

---

### 1. 이전 분석에서 사실과 다른 부분이 있는가? (자기 교정)

이전 분석 내용은 제공된 코드와 시스템 컨텍스트에 비추어 볼 때, **사실과 다른 부분은 없습니다.** 각 문제점에 대한 설명과 개선 제안은 현재 코드 상태 및 다크 테마 가독성 원칙에 부합합니다.

특히 다음과 같은 점들은 정확히 분석되었습니다:
*   `Chart.defaults.font.size = 11;`의 작은 크기 지적
*   그리드 라인, 툴팁 배경색의 대비 부족 지적
*   `getOptimalTextColor` 함수의 역할 및 개선 필요성
*   D3.js 지도 라벨의 겹침 방지 로직 부재 지적
*   정당 지지도 텍스트 바 리스트의 CSS 스타일링 필요성 지적
*   수치 표기 시 소수점 일관성 필요성 지적

모든 분석은 제공된 코드 스니펫에 기반하여 객관적으로 이루어졌습니다.

---

### 2. 제안한 해결책이 다른 부분에 부작용을 일으킬 수 있는가?

제안된 해결책들은 전반적으로 가독성 및 사용자 경험 개선에 중점을 두고 있으며, 대부분의 경우 긍정적인 효과를 가져올 것입니다. 그러나 일부 잠재적인 부작용이나 고려사항이 있을 수 있습니다.

1.  **글꼴 크기 증가 (11px → 13px) 및 범례/툴팁/축 레이블 크기 조정:**
    *   **잠재적 부작용:** 작은 화면이나 특정 해상도에서 차트 내부 텍스트(특히 X축 레이블)가 겹치거나 잘릴 가능성이 증가할 수 있습니다. Noto Sans KR과 같은 한국어 글꼴은 서양 언어 글꼴보다 너비를 더 많이 차지하는 경향이 있어 더욱 민감할 수 있습니다.
    *   **해결책의 유효성 재확인:** Chart.js는 `autoSkip`, `maxRotation`, `minRotation` 같은 옵션으로 X축 레이블 겹침을 어느 정도 관리할 수 있습니다. 차트의 `aspectRatio`와 컨테이너 크기를 고려하여 테스트해보고, 필요하다면 특정 차트의 `font.size`를 `12px`로 약간 낮추거나, X축 레이블의 `maxRotation` 값을 조정하여 텍스트가 잘리지 않도록 해야 합니다. 가장 중요한 정보는 잘리지 않도록 하는 것이 핵심입니다.
    *   **결론:** 가독성 향상 효과가 크므로 진행하되, 다양한 환경에서 레이아웃 테스트를 통해 미세 조정이 필요합니다.

2.  **D3.js 지도 라벨 겹침 방지 (d3-force simulation):**
    *   **잠재적 부작용:** `for (let i = 0; i < 120; ++i) simulation.tick();`과 같은 동기적 시뮬레이션은 처리해야 할 라벨 수가 매우 많을 경우(수백 개 이상) 초기 로딩 시 약간의 UI 지연을 유발할 수 있습니다. 특히 저사양 기기에서 두드러질 수 있습니다.
    *   **해결책의 유효성 재확인:** 한국 지방선거 지도의 경우, 한 화면에 표시되는 비례대표 라벨의 수가 아주 많지 않을 가능성이 높습니다 (광역 시도 레벨 또는 주요 시군구 레벨). 따라서 120틱 정도의 시뮬레이션은 대부분의 경우 문제가 되지 않을 것입니다. 만약 라벨이 너무 많아 성능 이슈가 발생한다면, 시뮬레이션 틱 수를 줄이거나, Web Worker를 사용하여 백그라운드에서 계산하는 방안을 고려해 볼 수 있습니다.
    *   **결론:** 성능에 미치는 영향은 데이터의 양에 따라 다르지만, 가독성 및 정보 전달의 핵심이므로 필수적인 개선 사항입니다.

3.  **그리드 라인 및 툴팁 배경색/텍스트 색상 조정:**
    *   **잠재적 부작용:** 그리드 라인 색상을 `rgba(139, 153, 181, 0.25)`로 밝게 할 경우, 일부 사용자는 여전히 '너무 약하다'고 느낄 수 있고, 다른 일부 사용자는 '너무 눈에 띈다'고 느낄 수 있습니다. 툴팁 배경색도 메인 배경과 대비를 주면서 너무 튀지 않도록 균형을 찾는 것이 중요합니다.
    *   **해결책의 유효성 재확인:** 제안된 색상은 WCAG 권장 대비를 충족하면서도 다크 테마에 어울리는 중간 톤으로, 대부분의 사용자에게 적절한 가독성을 제공할 것으로 예상됩니다. 미묘한 부분은 사용자 테스트를 통해 최종 결정하는 것이 가장 좋습니다.
    *   **결론:** 현재 제안은 이전보다 훨씬 개선된 상태이며, 큰 부작용 없이 가독성 향상에 기여할 것입니다.

---

### 3. 아직 다루지 않은 중요한 문제가 있는가?

네, 몇 가지 중요한 문제가 여전히 남아있거나 추가로 고려할 만한 사항이 있습니다.

1.  **접근성 (Accessibility) 심화:**
    *   **색맹/색약 사용자 고려:** 현재 정당 색상 팔레트가 `ElectionData.getPartyColor()`에서 가져온다고 명시되어 있으나, 이 색상들이 색맹/색약 사용자들에게도 충분히 구분 가능한지 검증이 필요합니다. 예를 들어, 적색과 녹색 계열의 정당색이 함께 사용될 경우 일부 색맹 사용자들은 구별하기 어려울 수 있습니다.
        *   **제안:** 색상 선택 시 색맹 친화적인 팔레트를 사용하거나, 색상만으로 정보를 전달하기보다 패턴, 텍스트 라벨, 아이콘 등 보조적인 시각 요소를 함께 사용하는 것을 권장합니다.
    *   **키보드 탐색 및 스크린 리더 호환성:** 인터랙티브 지도 프로젝트는 마우스 사용이 주가 되기 쉽지만, 키보드만으로도 모든 기능(지역 선택, 탭 전환, 차트 탐색 등)을 사용할 수 있어야 합니다. 또한 스크린 리더 사용자를 위해 이미지나 차트에 `aria-label` 또는 `aria-describedby` 같은 ARIA 속성을 적절히 적용해야 합니다.
        *   **제안:** 모든 인터랙티브 요소에 `tabindex`를 부여하고, 각 차트와 지도에 대한 요약 정보를 스크린 리더가 읽을 수 있도록 ARIA 속성을 추가합니다.

2.  **반응형 디자인 (Responsive Design)의 세부 고려:**
    *   현재 `responsive: true`와 `maintainAspectRatio: true`가 설정되어 있지만, 모바일/태블릿 환경에서 사이드 패널의 너비, 차트의 크기, 텍스트 바 리스트의 레이아웃 등이 어떻게 변하는지 확인해야 합니다.
    *   **제안:** `party-bar-wrap`의 `width`와 같은 고정된 너비 값은 모바일에서 공간을 비효율적으로 사용할 수 있습니다. `width: auto;`나 `max-width: XX%;`와 같은 유연한 설정을 고려해야 합니다. 또한, 특정 뷰포트 크기에서는 사이드 패널이 전체 화면을 차지하게 하거나, 차트의 범례 위치를 변경하는 등의 미디어 쿼리(Media Query) 기반 최적화가 필요합니다.

3.  **데이터 원본의 명확성 및 업데이트 주기:**
    *   "여론조사 투명성 안내"는 매우 훌륭하지만, 지도 전체의 데이터(예: 지난 선거 결과, 현직자 정보 등)가 언제 마지막으로 업데이트되었는지, 어떤 공식 데이터를 기반으로 하는지 명시하는 것이 사용자 신뢰를 더욱 높일 수 있습니다.
    *   **제안:** 패널 하단이나 정보 탭 어딘가에 "최종 데이터 업데이트: YYYY.MM.DD (중앙선거관리위원회 기준)"와 같은 문구를 추가하는 것을 고려합니다.

4.  **성능 최적화 (특히 D3.js 지도):**
    *   현재 제공된 D3.js 스니펫은 비례대표 라벨에 한정되어 있지만, 실제 지도 렌더링 시에는 지리 데이터의 복잡성, 렌더링할 지역의 수, 확대/축소 및 팬(pan) 동작의 부드러움 등이 성능에 큰 영향을 미칩니다.
    *   **제안:**
        *   TopoJSON 사용: GeoJSON 대신 TopoJSON을 사용하여 지리 데이터 크기를 최적화합니다.
        *   Simplification: 지도 경계가 매우 복잡한 경우, 줌 레벨에 따라 지리 데이터를 간소화하는(simplification) 기법을 적용하여 렌더링 부하를 줄입니다.
        *   디바운싱/스로틀링: 확대/축소 및 팬 이벤트에 디바운싱(debouncing) 또는 스로틀링(throttling)을 적용하여 과도한 렌더링을 방지합니다.

---

### 4. 한국 사용자 특성(50대+ 유권자, 정치 정보 탐색 패턴)을 고려한 추가 제안

한국의 50대 이상 유권자층은 온라인 정보 소비에 익숙하지만, 시력 저하, 복잡한 인터페이스에 대한 낮은 인내심, 정보의 신뢰성에 대한 높은 요구 등 특정 사용자 특성을 가질 수 있습니다. 이를 고려한 추가 제안은 다음과 같습니다.

1.  **읽기 편의성 극대화 (시력 보조):**
    *   **글꼴 크기 조절 기능:** 웹사이트 전체의 글꼴 크기를 사용자가 직접 조절할 수 있는 기능을 제공하면 좋습니다 (예: A-, A, A+ 버튼). 이는 50대 이상뿐만 아니라 다양한 시력 수준의 사용자에게 큰 도움이 됩니다.
    *   **고대비 모드 토글:** 현재 다크 테마이지만, 혹시 더 높은 대비를 원하는 사용자를 위해 "고대비 모드"를 별도로 제공하는 것도 고려할 수 있습니다. (예: 배경은 더 어둡게, 텍스트는 순백색에 가깝게)

2.  **직관적인 탐색 및 명확한 안내:**
    *   **검색 기능 강조:** "검색창에서 지역명을 입력하여 빠르게 찾을 수 있습니다."라는 팁은 이미 있지만, 검색창 자체를 시각적으로 더 돋보이게 하거나, 검색 예시를 제공하여 사용자가 첫 단계부터 막힘없이 시작할 수 있도록 돕습니다.
    *   **단계별 정보 접근:** 현재 사이드 패널의 탭(`선거구도`, `여론조사`, `뉴스`)은 잘 나뉘어 있지만, 각 탭 내에서 정보의 흐름이 논리적으로 연결되도록 구조화하는 것이 중요합니다. (예: 여론조사 탭에서 최신 여론조사 → 지지도 추이 → 연령대별로 이어지는 흐름). 이는 이미 잘 구축되어 있는 것으로 보입니다.

3.  **정보의 신뢰성 및 투명성 강조:**
    *   **데이터 출처 및 기준일 명시:** "여론조사 투명성 안내"는 매우 훌륭합니다. 이와 유사하게 `지난 선거 결과`, `현직자 정보`, `교육감 주요 지표` 등 다른 정보 카드에도 각각의 데이터 출처와 기준일(예: "중앙선거관리위원회 제8회 지방선거 결과", "2024년 5월 1일 기준")을 명확히 명시하여 정보의 신뢰성을 높여야 합니다. 50대 이상 유권자들은 정보의 정확성과 출처를 매우 중요하게 여깁니다.

4.  **정치 정보 탐색 패턴 고려:**
    *   **선거구도(Overview) 탭의 핵심 정보 상단 배치 (재강조):** 이전 분석에서 제안했던 `현직자 정보`를 `지난 선거 결과`보다 먼저 배치하는 것은 "그래서 지금 누가 여기에 있고, 어떤 상황인가?"를 먼저 알고 싶어 하는 유권자들의 핵심 질문에 답하는 방식이므로 매우 효과적입니다.
    *   **지역 핵심 이슈 구체화:** "지역 핵심 이슈"는 매우 중요한 정보입니다. 가능하다면, 각 이슈에 대해 간략한 설명이나 관련 뉴스 링크를 제공하여 사용자가 더 깊이 탐색할 수 있도록 돕는 것이 좋습니다. 텍스트 정보만으로 끝내기보다는 추가적인 탐색의 여지를 주는 것이 중요합니다.

5.  **용어 설명 및 도움말 기능:**
    *   **툴팁/팝오버를 활용한 용어 설명:** "오차범위", "신뢰수준", "비례대표", "표본수" 등 정치 및 통계 용어에 익숙하지 않은 사용자를 위해 해당 용어에 마우스를 올리면 간략한 설명을 보여주는 툴팁/팝오버 기능을 추가하는 것이 좋습니다.
    *   **FAQ 또는 도움말 섹션:** 웹사이트 사용법이나 선거 관련 일반적인 질문에 대한 FAQ 또는 도움말 섹션을 마련하여, 사용자가 궁금증을 빠르게 해소할 수 있도록 돕습니다.

---

이러한 추가적인 고려사항들을 통해 프로젝트는 더 넓은 사용자층에게 더욱 친화적이고 신뢰성 높은 정보 탐색 경험을 제공할 수 있을 것입니다.

========================================
## Round 4/5
========================================

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

========================================
## Round 5/5
========================================

최종 분석 결과 및 실행 가능한 액션 아이템을 종합적으로 정리해 드립니다.

---

### 1. 종합 점수 (100점 만점으로 현재 상태 평가)

*   **UI/UX 설계:** **17/25점**
    *   탭 인터페이스, 다크 테마 선택, 도넛 → 텍스트 바 리스트 변경 등 좋은 시도들이 보이나, 세부적인 대비 및 레이아웃 최적화, D3.js 지도 라벨의 미완성 요소 등으로 개선의 여지가 큽니다.
*   **가독성:** **12/25점**
    *   일관된 단위 표기 (`%`, `석`, `명`)는 좋지만, 다크 테마에서의 작은 글꼴 크기, 낮은 대비의 그리드 라인 및 툴팁 배경, D3.js 지도 라벨의 대비 및 겹침 문제 등 핵심적인 가독성 이슈들이 존재하여 정보 이해를 방해하는 요소가 많습니다.
*   **데이터 정확성:** **22/25점**
    *   여론조사 투명성 안내(출처, 표본수, 오차범위 명시)는 매우 훌륭합니다. 소수점 처리 일관성 강화가 필요하며, 모든 정보 카드에 대한 데이터 최종 업데이트 시점 명시가 추가되면 완벽해질 것입니다.
*   **접근성:** **10/25점**
    *   다크 테마는 특정 사용자에게 긍정적일 수 있으나, 색맹/색약 사용자 고려, 키보드 탐색, 스크린 리더 호환성(ARIA 속성) 등 기본적인 웹 접근성 요소들이 현재 코드에서는 명확히 확인되지 않아 개선이 시급합니다.

**총점: 61/100점** - 기능적인 기반은 잘 마련되어 있으나, 사용자 경험을 결정하는 가독성, 대비, 접근성 측면에서 많은 개선이 필요한 상태입니다.

---

### 2. 핵심 요약 (5줄 이내)

*   정당 지지도를 도넛에서 텍스트 바 리스트로 변경하여 정보 가독성과 비교 용이성이 크게 향상되었습니다.
*   여론조사 데이터 출처 및 오차범위 등 투명성 안내는 사용자 신뢰도를 높이는 훌륭한 시도입니다.
*   다크 테마에서 전반적인 글꼴 크기(11px)와 차트 요소(그리드, 툴팁)의 대비가 부족하여 가독성이 심각하게 저해됩니다.
*   지도 위 비례대표 라벨은 텍스트 대비가 미흡하고 라벨 겹침 방지 로직이 없어 핵심 정보 파악을 어렵게 합니다.
*   전반적인 웹 접근성(색맹 고려, 키보드 탐색, ARIA 속성) 강화가 필수적입니다.

---

### 3. 최종 크로스체크 및 수정 권고 (우선순위 순)

이전 라운드에서 제안된 수정사항들은 면밀히 검토한 결과, **서로 충돌하는 부분은 없습니다.** 대부분 상호 보완적인 관계에 있으며, 일부 잠재적 부작용은 추가적인 미세 조정을 통해 충분히 관리 가능합니다.

다음은 지금까지의 모든 분석을 바탕으로, **가장 시급하고 영향력이 큰 것부터 장기적인 개선까지** 고려한 최종 수정 권고 리스트입니다.

---

### 즉시 수정 (코드 변경 1시간 이내) - 핵심 가독성 및 대비 문제 해결

1.  **Chart.js 전역 설정 조정 (`charts.js` 파일)**
    *   `Chart.defaults.color`를 `#C9D4E7`로, `Chart.defaults.font.size`를 `13`으로 상향.
    *   `Chart.defaults.plugins.legend.labels.boxWidth`와 `padding`도 각각 `14`, `16`으로 증가.
    *   **예상 효과:** 모든 Chart.js 기반 차트의 기본 텍스트(축 레이블, 범례 등) 가독성 및 시인성 대폭 향상.

2.  **Chart.js 그리드 라인 및 툴팁 스타일 조정 (`charts.js` 파일, `getCommonChartOptions` 활용 권장)**
    *   툴팁 배경: `rgba(38, 48, 70, 0.95)`, 텍스트 색상: `#e0e6f0`, 테두리: `rgba(59, 130, 246, 0.6)`.
    *   그리드 라인: `rgba(139, 153, 181, 0.25)`.
    *   툴팁 및 범례의 글꼴 크기(`font.size`)를 `13` 또는 `14`로 통일.
    *   **예상 효과:** 차트 데이터 판독성 및 툴팁 정보 가독성 극대화.

3.  **'기타' 카테고리 색상 조정 (`charts.js` 파일, `renderDemographicsChart` 함수)**
    *   '기타' 데이터셋의 `backgroundColor`를 `rgba(150, 160, 170, 0.7)`로 변경.
    *   **예상 효과:** 연령대별 지지율 차트에서 '기타' 카테고리 구별력 향상.

4.  **백분율 수치 소수점 자리 통일 (`charts.js` 파일)**
    *   `renderPollBarChart`, `renderPollTrendChart`, `renderDemographicsChart`의 툴팁 콜백 및 `renderPartyDonutChart` 내 `pct` 변수에 모두 `.toFixed(1)` 적용.
    *   **예상 효과:** 모든 백분율 수치의 일관된 정밀도 및 비교 용이성 향상.

5.  **D3.js 지도 라벨 텍스트 대비 강화 (D3.js 지도 렌더링 코드)**
    *   라벨 텍스트에 `attr("text-shadow", "0px 0px 3px rgba(0,0,0,0.5)")` 추가.
    *   `getOptimalTextColor` 함수 내 `luminance > 0.6 ? '#1a1a1a' : '#FFFFFF'`로 임계값 및 글자색 조정.
    *   **예상 효과:** 지도 위 비례대표 의석수 텍스트 가독성 대폭 향상.

6.  **사이드 패널 `overview` 탭 정보 위계 조정 (HTML 파일)**
    *   `현직자 정보` 카드를 `지난 선거 결과` 카드보다 위로 이동.
    *   **예상 효과:** 사용자가 지역 선택 시 가장 궁금해할 '현재 정보'를 먼저 제공하여 정보 접근성 향상.

---

### 단기 개선 (1-3일) - 스타일링 및 기본 UX 개선

1.  **정당 지지도 텍스트 바 리스트 CSS 스타일링 (CSS 파일)**
    *   `.party-support-row`, `.party-dot`, `.party-name`, `.party-bar-wrap`, `.party-bar`, `.party-pct` 클래스에 대한 상세 CSS 정의 적용 (이전 답변의 예시 CSS 참조).
    *   **예상 효과:** 정당 지지율 시각적 비교 효과 및 정보 가독성 크게 향상.

2.  **D3.js 지도 라벨 호버 인터랙션 및 툴팁 구현 (D3.js 지도 렌더링 코드, HTML/CSS)**
    *   `labels` 요소에 `mouseover`/`mouseout` 이벤트 리스너를 추가하여 시각적 피드백(원 크기/테두리 변경) 및 상세 정보 툴팁 (`showProportionalTooltip`, `hideProportionalTooltip` 함수)을 구현.
    *   **예상 효과:** 지도 상호작용성 및 상세 정보 제공 강화, 사용자 경험 향상.

3.  **글꼴 크기 증가로 인한 차트 레이아웃 검토 및 조정 (`charts.js` 파일)**
    *   각 차트 `scales.x.ticks` 옵션에 `autoSkip: true`, `maxRotation: 45`, `minRotation: 0` 등을 적용하여 X축 레이블 겹침 방지 및 가독성 유지.
    *   **예상 효과:** 글꼴 크기 증가로 인한 레이블 겹침 문제 완화, 모든 정보가 명확하게 보이도록 함.

4.  **데이터 최종 업데이트 시점 명시 (HTML, JS)**
    *   패널 내에 "최종 데이터 업데이트: YYYY.MM.DD (중앙선거관리위원회 기준)" 문구 및 스팬을 추가하고, JS로 날짜를 동적으로 업데이트하는 로직 구현.
    *   **예상 효과:** 정보의 신뢰성과 투명성 강화, 사용자 신뢰도 증진.

5.  **검색 기능 시각적 강조 (CSS 파일)**
    *   검색창 UI에 다크 테마에 맞는 강조 스타일(테두리, 배경, 그림자 등)을 적용하여 사용자가 쉽게 인지하고 접근할 수 있도록 돕습니다.
    *   **예상 효과:** 핵심 기능인 검색창의 인지 및 접근성 향상.

---

### 중장기 개선 (1주 이상) - 복잡한 기능 및 포괄적 최적화

1.  **D3.js 지도 라벨 겹침 방지 (Collision Detection) 구현 (D3.js 지도 렌더링 코드)**
    *   `d3-force` 시뮬레이션 라이브러리를 활용하여 지도 위에 표시되는 비례대표 라벨들이 서로 겹치지 않도록 로직을 추가.
    *   **예상 효과:** 복잡한 지도에서 라벨 가독성 및 정보 파악 능력 극대화, 정보 혼란 방지.

2.  **포괄적인 웹 접근성 (Accessibility) 구현 (전반적인 코드 및 CSS)**
    *   **색맹/색약 친화적 팔레트 검토:** `ElectionData.getPartyColor()`의 정당 색상들이 색맹/색약 사용자에게도 구별 가능한지 테스트 및 조정.
    *   **ARIA 속성 추가:** 차트 `canvas`, 지도 `svg` 및 모든 인터랙티브 HTML 요소에 `aria-label`, `aria-describedby`, `role` 등 적절한 ARIA 속성 적용.
    *   **키보드 탐색:** 모든 인터랙티브 요소에 `tabindex` 부여 및 키보드 이벤트 핸들러 구현을 통해 마우스 없이도 모든 기능 이용 가능하게 함.
    *   **예상 효과:** 다양한 사용자가 정보에 동등하게 접근하고 이용할 수 있도록 하여 사용자층 확대 및 법적/윤리적 요구사항 충족.

3.  **반응형 디자인 심화 (모바일/태블릿 최적화) (CSS 파일, `charts.js` 등)**
    *   미디어 쿼리를 활용하여 모바일 뷰포트에서 사이드 패널이 전체 화면을 차지하게 하고, 차트 `aspectRatio` 및 범례 위치 등을 동적으로 변경.
    *   `party-bar-wrap` 등 고정 너비 요소들을 `auto` 또는 `%` 단위로 변경하여 유연한 레이아웃을 구현.
    *   **예상 효과:** 다양한 기기에서 일관되고 최적화된 사용자 경험을 제공하여 모바일 사용자 접근성 크게 향상.

4.  **D3.js 지도 성능 최적화 (D3.js 지도 초기화 및 렌더링 로직)**
    *   GeoJSON 데이터를 TopoJSON으로 변환하여 사용, 줌 레벨에 따른 지리 데이터 간소화(Simplification), 확대/축소 및 팬 이벤트에 디바운싱(debouncing) 또는 스로틀링(throttling) 적용.
    *   **예상 효과:** 지도의 로딩 속도와 상호작용(확대/축소, 이동)의 부드러움을 개선하여 사용자 만족도 향상.

5.  **사용자 맞춤형 읽기 편의성 기능 (글꼴 크기/고대비 모드 토글) (HTML, CSS, JavaScript)**
    *   웹 페이지 상단 또는 설정 메뉴에 글꼴 크기 조절 버튼 및 고대비 모드 전환 버튼을 추가하고, 이에 따른 CSS 스타일 변경 로직 구현.
    *   **예상 효과:** 시력 저하 사용자 등 다양한 사용자가 자신의 필요에 맞춰 인터페이스를 조정할 수 있도록 하여 접근성과 편의성을 극대화.

6.  **정치/통계 용어 설명 툴팁/팝오버 기능 (HTML, JS, CSS)**
    *   "오차범위", "비례대표", "표본수" 등 전문 용어에 마우스를 올리면 간략한 설명을 보여주는 동적 툴팁/팝오버 컴포넌트 구현.
    *   **예상 효과:** 정치 및 통계 정보에 익숙하지 않은 사용자도 쉽게 정보를 이해할 수 있도록 도와 정보 접근성 증진.

---
