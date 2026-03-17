# 가독성 및 데이터 시각화 검증 - Round 2/5

생성일: 2026-03-09 11:02
모델: gemini-2.5-flash

---

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
