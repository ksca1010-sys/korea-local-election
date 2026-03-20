// ============================================
// 6.3 전국지방선거 인터랙티브 선거 정보 지도
// Charts Module - Chart.js Visualizations
// ============================================

const ChartsModule = (() => {
    let pollBarChart = null;
    let pollTrendChart = null;
    const dynamicCharts = []; // 동적 생성 차트 추적

    // Chart.js global defaults
    Chart.defaults.color = '#8b99b5';
    Chart.defaults.borderColor = 'rgba(42, 53, 83, 0.5)';
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
     * 최신 여론조사 바차트 (polls.json 데이터 직접 사용)
     * @param {Object} poll - polls.json의 개별 poll 객체
     * @param {string|HTMLCanvasElement} canvasId - 캔버스 ID 또는 엘리먼트
     * @returns {Chart|null}
     */
    function renderPollBarChart(poll, canvasId) {
        if (!poll || !poll.results || poll.results.length < 2) return null;

        const canvas = typeof canvasId === 'string' ? document.getElementById(canvasId) : canvasId;
        if (!canvas) return null;
        if (pollBarChart && typeof canvasId === 'string' && canvasId === 'poll-bar-chart') {
            pollBarChart.destroy();
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
        if (pollTrendChart && typeof canvasId === 'string' && canvasId === 'poll-trend-chart') {
            pollTrendChart.destroy();
        }

        // 시간순 정렬 (오래된 것부터)
        const polls = [...trendGroup.polls].sort((a, b) => {
            const aDate = a.surveyDate?.end || a.publishDate || '';
            const bDate = b.surveyDate?.end || b.publishDate || '';
            return aDate.localeCompare(bDate);
        });

        // X축 라벨: 조사종료일
        const labels = polls.map(p => {
            const dateStr = p.surveyDate?.end || p.publishDate || '';
            const d = new Date(dateStr);
            return isNaN(d) ? dateStr : `${d.getMonth() + 1}/${d.getDate()}`;
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

        // 후보별 라인 데이터셋 — 도형으로 구분
        const pointStyles = ['circle', 'rect', 'triangle', 'rectRot', 'star', 'crossRot'];
        const datasets = [];
        let candidateIdx = 0;
        candidateSet.forEach((info, name) => {
            const color = info.stanceColor || ElectionData.getPartyColor(info.party);
            const isMerged = !!trendGroup._merged;
            const style = pointStyles[candidateIdx % pointStyles.length];
            datasets.push({
                label: name,
                data: polls.map(p => {
                    const r = (p.results || []).find(r => r.candidateName === name);
                    return r ? r.support : null;
                }),
                borderColor: color,
                backgroundColor: color + '20',
                pointBackgroundColor: color,
                pointBorderColor: '#0F1117',
                pointBorderWidth: 2,
                pointStyle: style,
                pointRadius: 6,
                pointHoverRadius: 8,
                borderWidth: 2.5,
                borderDash: isMerged ? [6, 3] : [],
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
                data: leadData.map(v => v != null ? v + margin : null),
                borderColor: 'transparent',
                backgroundColor: 'rgba(59, 130, 246, 0.08)',
                pointRadius: 0,
                fill: '+1',
                borderWidth: 0
            });
            datasets.push({
                label: '',
                data: leadData.map(v => v != null ? v - margin : null),
                borderColor: 'transparent',
                backgroundColor: 'transparent',
                pointRadius: 0,
                borderWidth: 0
            });
        }

        const chart = new Chart(canvas, {
            type: 'line',
            data: { labels, datasets },
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
                            filter: (item) => item.text !== '' && !item.text.includes('오차범위')
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(26, 34, 54, 0.95)',
                        borderColor: 'rgba(59, 130, 246, 0.3)',
                        borderWidth: 1,
                        padding: 10,
                        cornerRadius: 8,
                        callbacks: {
                            title: (items) => {
                                if (!items.length) return '';
                                const idx = items[0].dataIndex;
                                const poll = polls[idx];
                                const base = items[0].label || '';
                                // 통합 추이: 기관명 표시
                                if (trendGroup._merged && poll?.pollOrg) {
                                    return `${base} (${poll.pollOrg})`;
                                }
                                return base;
                            },
                            label: (ctx) => {
                                if (ctx.raw === null || ctx.dataset.label === '' || ctx.dataset.label.includes('오차범위')) return null;
                                return `${ctx.dataset.label}: ${ctx.raw}%`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
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
