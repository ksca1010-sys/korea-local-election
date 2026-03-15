// ============================================
// 6.3 전국지방선거 인터랙티브 선거 정보 지도
// Charts Module - Chart.js Visualizations
// ============================================

const ChartsModule = (() => {
    let pollBarChart = null;
    let pollTrendChart = null;
    let partyDonutChart = null;
    let demographicsChart = null;

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
        if (partyDonutChart) { partyDonutChart.destroy(); partyDonutChart = null; }
        if (demographicsChart) { demographicsChart.destroy(); demographicsChart = null; }
    }

    function renderPollBarChart(regionKey) {
        const region = ElectionData.getRegion(regionKey);
        if (!region || region.polls.length === 0) return;

        const canvas = document.getElementById('poll-bar-chart');
        if (!canvas) return;
        if (pollBarChart) pollBarChart.destroy();

        const latestPoll = region.polls[region.polls.length - 1];
        const candidates = region.candidates;

        const labels = [];
        const data = [];
        const colors = [];
        const borderColors = [];

        candidates.forEach(candidate => {
            labels.push(candidate.name);
            data.push(latestPoll.data[candidate.id] || 0);
            const color = ElectionData.getPartyColor(candidate.party);
            colors.push(color + 'cc');
            borderColors.push(color);
        });

        // Source info
        const sourceInfo = document.getElementById('poll-source-info');
        if (sourceInfo) {
            sourceInfo.innerHTML = `
                <strong>${latestPoll.source}</strong> | ${latestPoll.date} |
                표본수: ${latestPoll.sampleSize?.toLocaleString() || 'N/A'}명 |
                오차범위: ±${latestPoll.margin}%p (95% 신뢰수준)
            `;
        }

        pollBarChart = new Chart(canvas, {
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
                aspectRatio: 1.8,
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
                                const candidate = candidates[ctx.dataIndex];
                                const partyName = ElectionData.getPartyName(candidate.party);
                                return `${partyName}: ${ctx.raw}%`;
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
    }

    function renderPollTrendChart(regionKey) {
        const region = ElectionData.getRegion(regionKey);
        if (!region || region.polls.length < 2) return;

        const canvas = document.getElementById('poll-trend-chart');
        if (!canvas) return;
        if (pollTrendChart) pollTrendChart.destroy();

        const polls = region.polls;
        const labels = polls.map(p => {
            const d = new Date(p.date);
            return `${d.getMonth() + 1}/${d.getDate()}`;
        });

        const datasets = region.candidates.map(candidate => {
            const color = ElectionData.getPartyColor(candidate.party);
            return {
                label: `${candidate.name} (${ElectionData.parties[candidate.party]?.shortName || ''})`,
                data: polls.map(p => p.data[candidate.id] || null),
                borderColor: color,
                backgroundColor: color + '20',
                pointBackgroundColor: color,
                pointBorderColor: color,
                pointRadius: 5,
                pointHoverRadius: 7,
                borderWidth: 2.5,
                tension: 0.3,
                fill: false,
                spanGaps: true
            };
        });

        // Add margin of error bands for the leading candidate
        const leadingCandidate = region.candidates[0];
        if (leadingCandidate) {
            const marginData = polls.map(p => ({
                upper: (p.data[leadingCandidate.id] || 0) + p.margin,
                lower: (p.data[leadingCandidate.id] || 0) - p.margin
            }));

            datasets.push({
                label: '오차범위 (1위)',
                data: marginData.map(d => d.upper),
                borderColor: 'transparent',
                backgroundColor: 'rgba(59, 130, 246, 0.08)',
                pointRadius: 0,
                fill: '+1',
                borderWidth: 0
            });
            datasets.push({
                label: '',
                data: marginData.map(d => d.lower),
                borderColor: 'transparent',
                backgroundColor: 'transparent',
                pointRadius: 0,
                borderWidth: 0
            });
        }

        pollTrendChart = new Chart(canvas, {
            type: 'line',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                aspectRatio: 1.6,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            filter: (item) => item.text !== ''
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(26, 34, 54, 0.95)',
                        borderColor: 'rgba(59, 130, 246, 0.3)',
                        borderWidth: 1,
                        padding: 10,
                        cornerRadius: 8,
                        callbacks: {
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
    }

    // renderPartyDonutChart, renderDemographicsChart 제거됨 (HTML 캔버스 없음)

    function renderAllCharts(regionKey) {
        destroyCharts();
        renderPollBarChart(regionKey);
        renderPollTrendChart(regionKey);

        const canvas = document.getElementById('party-donut-chart');
        if (!canvas) return;
        if (partyDonutChart) partyDonutChart.destroy();

        const support = region.partySupport;
        const partyKeys = Object.keys(support).filter(k => support[k] > 0);
        const labels = partyKeys.map(k => ElectionData.getPartyName(k));
        const data = partyKeys.map(k => support[k]);
        const colors = partyKeys.map(k => ElectionData.getPartyColor(k));

        partyDonutChart = new Chart(canvas, {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{
                    data,
                    backgroundColor: colors.map(c => c + 'cc'),
                    borderColor: colors,
                    borderWidth: 1,
                    hoverOffset: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                aspectRatio: 1.4,
                cutout: '55%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            padding: 10,
                            usePointStyle: true,
                            pointStyle: 'circle',
                            font: { size: 10 }
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(26, 34, 54, 0.95)',
                        borderColor: 'rgba(59, 130, 246, 0.3)',
                        borderWidth: 1,
                        padding: 10,
                        cornerRadius: 8,
                        callbacks: {
                            label: (ctx) => `${ctx.label}: ${ctx.raw}%`
                        }
                    }
                },
                animation: {
                    animateRotate: true,
                    duration: 800
                }
            }
        });
    }

    function renderDemographicsChart(regionKey) {
        const region = ElectionData.getRegion(regionKey);
        if (!region || !region.demographics) return;

        const canvas = document.getElementById('demographics-chart');
        if (!canvas) return;
        if (demographicsChart) demographicsChart.destroy();

        const ageGroups = Object.keys(region.demographics);
        const partyKeys = ['democratic', 'ppp', 'reform'];

        const datasets = partyKeys.map(key => ({
            label: ElectionData.parties[key]?.shortName || key,
            data: ageGroups.map(age => region.demographics[age][key] || 0),
            backgroundColor: ElectionData.getPartyColor(key) + 'aa',
            borderColor: ElectionData.getPartyColor(key),
            borderWidth: 1,
            borderRadius: 3
        }));

        // Add "other" category
        datasets.push({
            label: '기타',
            data: ageGroups.map(age => region.demographics[age].other || 0),
            backgroundColor: 'rgba(128, 128, 128, 0.5)',
            borderColor: '#808080',
            borderWidth: 1,
            borderRadius: 3
        });

        demographicsChart = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: ageGroups.map(g => g + '세'),
                datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                aspectRatio: 1.6,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            usePointStyle: true,
                            pointStyle: 'rect',
                            font: { size: 10 }
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(26, 34, 54, 0.95)',
                        borderColor: 'rgba(59, 130, 246, 0.3)',
                        borderWidth: 1,
                        padding: 10,
                        cornerRadius: 8,
                        callbacks: {
                            label: (ctx) => `${ctx.dataset.label}: ${ctx.raw}%`
                        }
                    }
                },
                scales: {
                    x: {
                        stacked: true,
                        grid: { display: false }
                    },
                    y: {
                        stacked: true,
                        max: 100,
                        grid: { color: 'rgba(42, 53, 83, 0.3)' },
                        ticks: {
                            callback: (value) => value + '%',
                            stepSize: 25
                        }
                    }
                },
                animation: {
                    duration: 800,
                    easing: 'easeOutQuart'
                }
            }
        });
    }

    return {
        renderAllCharts,
        renderPollBarChart,
        renderPollTrendChart,
        destroyCharts
    };
})();
