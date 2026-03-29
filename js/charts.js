// ============================================
// 6.3 전국지방선거 인터랙티브 선거 정보 지도
// Charts Module - Chart.js Visualizations
// ============================================

const ChartsModule = (() => {
    let pollBarChart = null;
    let pollTrendChart = null;
    const dynamicCharts = []; // 동적 생성 차트 추적

    // Chart.js global defaults (theme-adaptive via CSS variables)
    (function initChartDefaults() {
        const s = getComputedStyle(document.documentElement);
        Chart.defaults.color = s.getPropertyValue('--chart-text').trim() || '#8b99b5';
        Chart.defaults.borderColor = s.getPropertyValue('--chart-grid').trim() || 'rgba(42, 53, 83, 0.5)';
    })();
    Chart.defaults.font.family = "'Noto Sans KR', sans-serif";
    Chart.defaults.font.size = 11;
    Chart.defaults.plugins.legend.labels.boxWidth = 12;
    Chart.defaults.plugins.legend.labels.padding = 12;

    function destroyCharts() {
        if (pollBarChart) { pollBarChart.destroy(); pollBarChart = null; }
        if (pollTrendChart) { pollTrendChart.destroy(); pollTrendChart = null; }
        dynamicCharts.forEach(c => c.destroy());
        dynamicCharts.length = 0;
    }

    /**
     * Insert a sr-only table next to a canvas for screen readers.
     * Removes any previous sr-only table sibling to avoid duplicates on re-render.
     */
    function _insertSrTable(canvas, html) {
        // Remove previous sr-only table if present
        const prev = canvas.nextElementSibling;
        if (prev && prev.classList.contains('sr-only')) {
            prev.remove();
        }
        const tbl = document.createElement('table');
        tbl.className = 'sr-only';
        tbl.innerHTML = html;
        canvas.setAttribute('aria-hidden', 'true');
        canvas.parentNode.insertBefore(tbl, canvas.nextSibling);
    }

    /**
     * 최신 여론조사 바차트 (polls.json 데이터 직접 사용)
     * @param {Object} poll - polls.json의 개별 poll 객체
     * @param {string|HTMLCanvasElement} canvasId - 캔버스 ID 또는 엘리먼트
     * @returns {Chart|null}
     */
    function renderPollBarChart(poll, canvasId) {
        if (!poll || !poll.results || poll.results.length < 2) return null;

        const canvas = typeof canvasId === 'string' ? document.getElementById(canvasId) : canvasId;
        if (!canvas) return null;
        // 기존 차트 인스턴스 파괴 (메모리 누수 방지)
        const existingChart = Chart.getChart(canvas);
        if (existingChart) existingChart.destroy();
        if (pollBarChart && typeof canvasId === 'string' && canvasId === 'poll-bar-chart') {
            pollBarChart = null;
        }

        const results = poll.results
            .filter(r => r.candidateName && r.support > 0)
            .sort((a, b) => b.support - a.support);

        const labels = results.map(r => r.candidateName);
        const data = results.map(r => r.support);
        const colors = results.map(r => {
            const pc = r._stanceColor || ElectionData.getPartyColor(r.party || 'independent');
            return pc + 'cc';
        });
        const borderColors = results.map(r => {
            return r._stanceColor || ElectionData.getPartyColor(r.party || 'independent');
        });

        const chart = new Chart(canvas, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    data,
                    backgroundColor: colors,
                    borderColor: borderColors,
                    borderWidth: 1,
                    borderRadius: 6,
                    maxBarThickness: 50
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                aspectRatio: window.innerWidth <= 768 ? 1.2 : 1.8,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(26, 34, 54, 0.95)',
                        borderColor: 'rgba(59, 130, 246, 0.3)',
                        borderWidth: 1,
                        padding: 10,
                        cornerRadius: 8,
                        titleFont: { weight: '600' },
                        callbacks: {
                            label: (ctx) => {
                                const r = results[ctx.dataIndex];
                                const label = r._stanceLabel || ElectionData.getPartyName(r.party || 'independent');
                                return `${label}: ${ctx.raw}%`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { font: { weight: '500' } }
                    },
                    y: {
                        beginAtZero: true,
                        max: Math.max(...data) + 10,
                        grid: { color: 'rgba(42, 53, 83, 0.3)' },
                        ticks: {
                            callback: (value) => value + '%',
                            stepSize: 10
                        }
                    }
                },
                animation: {
                    duration: 800,
                    easing: 'easeOutQuart'
                }
            }
        });

        // Accessible sr-only table for screen readers
        const srcCaption = [poll.pollOrg, poll.publishDate].filter(Boolean).join(' ');
        _insertSrTable(canvas,
            `<caption>여론조사 결과${srcCaption ? ' (' + srcCaption + ')' : ''}</caption>` +
            `<tr><th>후보</th><th>정당</th><th>지지율</th></tr>` +
            results.map(r => {
                const partyName = r._stanceLabel || ElectionData.getPartyName(r.party || 'independent');
                return `<tr><td>${r.candidateName}</td><td>${partyName}</td><td>${r.support}%</td></tr>`;
            }).join('')
        );

        if (typeof canvasId === 'string' && canvasId === 'poll-bar-chart') {
            pollBarChart = chart;
        } else {
            dynamicCharts.push(chart);
        }
        return chart;
    }

    /**
     * 여론조사 추이 라인차트 (같은 조사기관 시계열)
     * @param {Object} trendGroup - { pollOrg, polls: [...] }
     * @param {string|HTMLCanvasElement} canvasId - 캔버스 ID 또는 엘리먼트
     * @returns {Chart|null}
     */
    function renderPollTrendChart(trendGroup, canvasId) {
        if (!trendGroup || !trendGroup.polls || trendGroup.polls.length < 2) return null;

        const canvas = typeof canvasId === 'string' ? document.getElementById(canvasId) : canvasId;
        if (!canvas) return null;
        // 기존 차트 인스턴스 파괴 (메모리 누수 방지)
        const existingChart = Chart.getChart(canvas);
        if (existingChart) existingChart.destroy();
        if (pollTrendChart && typeof canvasId === 'string' && canvasId === 'poll-trend-chart') {
            pollTrendChart = null;
        }

        // 시간순 정렬 (오래된 것부터)
        const polls = [...trendGroup.polls].sort((a, b) => {
            const aDate = a.surveyDate?.end || a.publishDate || '';
            const bDate = b.surveyDate?.end || b.publishDate || '';
            return aDate.localeCompare(bDate);
        });

        // X축 라벨: 조사종료일 (time scale용 ISO 날짜)
        const labels = polls.map(p => {
            const dateStr = p.surveyDate?.end || p.publishDate || '';
            return dateStr || null;
        });

        // 모든 후보명 수집 (전체 조사에 등장한 후보 union)
        const candidateSet = new Map(); // name → { party, stanceColor }
        polls.forEach(p => {
            (p.results || []).forEach(r => {
                if (r.candidateName && r.support > 0 && !candidateSet.has(r.candidateName)) {
                    candidateSet.set(r.candidateName, {
                        party: r.party || 'independent',
                        stanceColor: r._stanceColor || null
                    });
                }
            });
        });

        // 후보별 라인 데이터셋 — 도형 + 선 스타일 + 색상 변조로 구분
        const pointStyles = ['circle', 'triangle', 'rectRounded', 'star', 'rect'];
        const dashPatterns = [[], [8, 4], [3, 3], [12, 4, 3, 4], [6, 2], [2, 2]];
        // 같은 정당 후보끼리 밝기 변조
        const partyCount = {};
        candidateSet.forEach((info) => {
            partyCount[info.party] = (partyCount[info.party] || 0) + 1;
        });
        const partyIdx = {};

        const datasets = [];
        let candidateIdx = 0;
        candidateSet.forEach((info, name) => {
            let color = info.stanceColor || ElectionData.getPartyColor(info.party);
            const party = info.party;

            // 같은 정당 2명 이상이면 밝기 변조
            if (!partyIdx[party]) partyIdx[party] = 0;
            const samePartyIdx = partyIdx[party]++;
            if (partyCount[party] > 1 && samePartyIdx > 0) {
                // HSL 변조: 밝기를 점진적으로 높임
                const brightness = 1 + samePartyIdx * 0.25;
                const r = parseInt(color.slice(1,3), 16);
                const g = parseInt(color.slice(3,5), 16);
                const b = parseInt(color.slice(5,7), 16);
                const nr = Math.min(255, Math.round(r * brightness));
                const ng = Math.min(255, Math.round(g * brightness));
                const nb = Math.min(255, Math.round(b * brightness));
                color = `#${nr.toString(16).padStart(2,'0')}${ng.toString(16).padStart(2,'0')}${nb.toString(16).padStart(2,'0')}`;
            }

            const isMerged = !!trendGroup._merged;
            const style = pointStyles[candidateIdx % pointStyles.length];
            const dash = isMerged ? [6, 3] : dashPatterns[candidateIdx % dashPatterns.length];

            datasets.push({
                label: name,
                data: polls.map((p, i) => {
                    const r = (p.results || []).find(r => r.candidateName === name);
                    const dateStr = p.surveyDate?.end || p.publishDate || null;
                    return r && dateStr ? { x: dateStr, y: r.support } : null;
                }).filter(Boolean),
                borderColor: color,
                backgroundColor: color + '20',
                pointBackgroundColor: color,
                pointBorderColor: getComputedStyle(document.documentElement).getPropertyValue('--bg-primary').trim() || '#0D1228',
                pointBorderWidth: 2,
                pointStyle: style,
                pointRadius: 7,
                pointHoverRadius: 10,
                borderWidth: 2.5,
                borderDash: dash,
                tension: 0.3,
                fill: false,
                spanGaps: true
            });
            candidateIdx++;
        });

        // 1위 후보 오차범위 밴드
        if (datasets.length > 0 && polls[0]?.method?.marginOfError) {
            const leadData = datasets[0].data;
            const margin = polls[0].method.marginOfError;
            datasets.push({
                label: '오차범위 (1위)',
                data: leadData.map(pt => pt != null ? { x: pt.x, y: pt.y + margin } : null).filter(Boolean),
                borderColor: 'transparent',
                backgroundColor: 'rgba(59, 130, 246, 0.08)',
                pointRadius: 0,
                fill: '+1',
                borderWidth: 0
            });
            datasets.push({
                label: '',
                data: leadData.map(pt => pt != null ? { x: pt.x, y: pt.y - margin } : null).filter(Boolean),
                borderColor: 'transparent',
                backgroundColor: 'transparent',
                pointRadius: 0,
                borderWidth: 0
            });
        }

        const chart = new Chart(canvas, {
            type: 'line',
            data: { datasets },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                aspectRatio: window.innerWidth <= 768 ? 1.1 : 1.6,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            usePointStyle: true,
                            pointStyleWidth: 10,
                            filter: (item) => item.text !== '' && !item.text.includes('오차범위')
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(26, 34, 54, 0.95)',
                        borderColor: 'rgba(59, 130, 246, 0.3)',
                        borderWidth: 1,
                        padding: 10,
                        cornerRadius: 8,
                        itemSort: (a, b) => ((b.raw?.y ?? b.raw) || 0) - ((a.raw?.y ?? a.raw) || 0),
                        callbacks: {
                            title: (items) => {
                                if (!items.length) return '';
                                const base = items[0].label || '';
                                // 통합 추이: 기관명 표시 (x값으로 poll 찾기)
                                if (trendGroup._merged) {
                                    const xVal = items[0].raw?.x;
                                    const poll = polls.find(p => (p.surveyDate?.end || p.publishDate) === xVal);
                                    if (poll?.pollOrg) return `${base} (${poll.pollOrg})`;
                                }
                                return base;
                            },
                            label: (ctx) => {
                                if (ctx.raw === null || ctx.dataset.label === '' || ctx.dataset.label.includes('오차범위')) return null;
                                const val = ctx.raw?.y ?? ctx.raw;
                                return `${ctx.dataset.label}: ${val}%`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            unit: 'day',
                            displayFormats: { day: 'M/d' },
                            tooltipFormat: 'yyyy-MM-dd',
                        },
                        title: { display: true, text: '조사일' },
                        grid: { color: 'rgba(42, 53, 83, 0.3)' }
                    },
                    y: {
                        grid: { color: 'rgba(42, 53, 83, 0.3)' },
                        ticks: {
                            callback: (value) => value + '%',
                            stepSize: 5
                        }
                    }
                },
                animation: {
                    duration: 1000,
                    easing: 'easeOutQuart'
                }
            }
        });

        // Accessible sr-only table for screen readers
        const candidateNames = [...candidateSet.keys()];
        _insertSrTable(canvas,
            `<caption>여론조사 추이 (${trendGroup.pollOrg || '통합'})</caption>` +
            `<tr><th>조사일</th>${candidateNames.map(n => `<th>${n}</th>`).join('')}</tr>` +
            polls.map((p, i) => {
                return `<tr><td>${labels[i]}</td>${candidateNames.map(n => {
                    const r = (p.results || []).find(r => r.candidateName === n);
                    return `<td>${r ? r.support + '%' : '-'}</td>`;
                }).join('')}</tr>`;
            }).join('')
        );

        if (typeof canvasId === 'string' && canvasId === 'poll-trend-chart') {
            pollTrendChart = chart;
        } else {
            dynamicCharts.push(chart);
        }
        return chart;
    }

    /**
     * 호환성: 기존 renderAllCharts 호출 대응
     * 새 구현에서는 renderPollTab에서 직접 호출
     */
    function renderAllCharts(regionKey) {
        destroyCharts();
    }

    return {
        renderAllCharts,
        renderPollBarChart,
        renderPollTrendChart,
        destroyCharts
    };
})();
