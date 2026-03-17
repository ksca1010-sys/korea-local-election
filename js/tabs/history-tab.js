// ============================================
// History Tab — 역대비교 탭 렌더링
// app.js에서 분리됨
// ============================================

const HistoryTab = (() => {
    let historyComparisonChart = null;

    function destroyChart() {
        if (historyComparisonChart) {
            historyComparisonChart.destroy();
            historyComparisonChart = null;
        }
    }

    function buildEmptyMessage(message, icon = 'fa-circle-info') {
        return `<div class="no-data-message"><i class="fas ${icon}"></i><p>${message}</p></div>`;
    }

    function truncatePartyLabel(label) {
        const text = String(label || '');
        return text.length > 5 ? `${text.slice(0, 5)}…` : text;
    }

    function getBlocKey(partyKey) {
        if (partyKey === 'democratic' || partyKey === '진보') return 'democratic';
        if (partyKey === 'ppp' || partyKey === '보수') return 'ppp';
        if (partyKey === 'independent') return 'independent';
        if (partyKey === '중도') return 'other';
        return 'other';
    }

    function getBlocLabel(blocKey, electionType) {
        if (electionType === 'superintendent') {
            switch (blocKey) {
                case 'democratic': return '진보';
                case 'ppp': return '보수';
                case 'other': return '중도';
                default: return '기타';
            }
        }
        switch (blocKey) {
            case 'democratic': return '민주계';
            case 'ppp': return '보수계';
            case 'independent': return '무소속';
            default: return '제3정당';
        }
    }

    function getEmptyMessage(electionType, districtName) {
        if (electionType === 'superintendent') {
            return '교육감 역대 비교 데이터는 아직 연결되지 않았습니다.';
        }
        if (electionType === 'mayor' && !districtName) {
            return '시군구를 선택하면 역대 기초단체장 선거 결과를 확인할 수 있습니다.';
        }
        if (electionType === 'mayor') {
            return '이 시군구의 역대 선거 데이터가 없습니다.';
        }
        return '현재 선택한 선거 유형의 역대 비교 데이터가 없습니다.';
    }

    /**
     * 역대비교 탭 렌더링
     * @param {string} regionKey - 시도 키
     * @param {string} electionType - 선거 유형
     * @param {string|null} districtName - 시군구명 (기초단체장용)
     */
    function render(regionKey, electionType, districtName) {
        const flowEl = document.getElementById('history-party-flow');
        const resultsEl = document.getElementById('history-results');
        const canvas = document.getElementById('history-turnout-chart');
        if (!flowEl || !resultsEl || !canvas) return;

        const chartCardTitle = canvas.closest('.panel-card')?.querySelector('h4');
        const chartEmptyId = 'history-turnout-empty';
        let emptyEl = document.getElementById(chartEmptyId);
        if (!emptyEl) {
            emptyEl = document.createElement('div');
            emptyEl.id = chartEmptyId;
            emptyEl.style.display = 'none';
            canvas.insertAdjacentElement('afterend', emptyEl);
        }

        // 역대 데이터 조회
        const history = electionType === 'governor'
            ? (ElectionData.getHistoricalData(regionKey) || [])
            : electionType === 'superintendent'
            ? (ElectionData.getSuperintendentHistoricalData(regionKey) || [])
            : electionType === 'mayor' && districtName
            ? (ElectionData.getMayorHistoricalData(regionKey, districtName) || [])
            : [];

        if (!history.length) {
            destroyChart();
            canvas.style.display = 'none';
            emptyEl.style.display = '';
            emptyEl.innerHTML = buildEmptyMessage(getEmptyMessage(electionType, districtName), 'fa-clock-rotate-left');
            if (chartCardTitle) {
                chartCardTitle.innerHTML = '<i class="fas fa-chart-area"></i> 역대 비교 그래프';
            }
            flowEl.innerHTML = buildEmptyMessage(getEmptyMessage(electionType, districtName), 'fa-shuffle');
            resultsEl.innerHTML = buildEmptyMessage(getEmptyMessage(electionType, districtName), 'fa-table-list');
            return;
        }

        // 통계 산출
        const changeCount = history.reduce((count, entry, index) => {
            if (index === 0) return count;
            return count + (history[index - 1].winner !== entry.winner ? 1 : 0);
        }, 0);
        const avgTurnout = (history.reduce((sum, entry) => sum + (Number(entry.turnout) || 0), 0) / history.length).toFixed(1);
        const winnerCounts = history.reduce((counts, entry) => {
            const bk = getBlocKey(entry.winner);
            counts.set(bk, (counts.get(bk) || 0) + 1);
            return counts;
        }, new Map());
        const dominantParty = [...winnerCounts.entries()].sort((a, b) => b[1] - a[1])[0] || ['other', 0];
        const dominantPartyLabel = getBlocLabel(dominantParty[0], electionType);

        // 블록 색상
        const blocPalette = electionType === 'superintendent'
            ? {
                democratic: ElectionData.getSuperintendentColor('진보'),
                ppp: ElectionData.getSuperintendentColor('보수'),
                other: ElectionData.getSuperintendentColor('중도'),
                independent: '#a0a0a0'
            }
            : {
                democratic: ElectionData.getPartyColor('democratic'),
                ppp: ElectionData.getPartyColor('ppp'),
                other: ElectionData.getPartyColor('other'),
                independent: ElectionData.getPartyColor('independent')
            };

        // 차트 데이터셋
        const blocAppearances = history.reduce((counts, entry) => {
            const winnerBloc = getBlocKey(entry.winner);
            counts.set(winnerBloc, (counts.get(winnerBloc) || 0) + 1);
            if (entry.runner) {
                const runnerBloc = getBlocKey(entry.runner);
                counts.set(runnerBloc, (counts.get(runnerBloc) || 0) + 1);
            }
            return counts;
        }, new Map());

        const chartDatasets = [...blocAppearances.entries()]
            .filter(([, count]) => count > 0)
            .sort((a, b) => b[1] - a[1])
            .map(([blocKey]) => ({
                label: getBlocLabel(blocKey, electionType),
                data: history.map((entry) => {
                    let best = null;
                    if (getBlocKey(entry.winner) === blocKey) best = Number(entry.rate) || 0;
                    if (entry.runner && getBlocKey(entry.runner) === blocKey) {
                        const runnerVal = Number(entry.runnerRate) || 0;
                        best = best !== null ? Math.max(best, runnerVal) : runnerVal;
                    }
                    return best !== null ? Number(best.toFixed(1)) : null;
                }),
                borderColor: blocPalette[blocKey],
                backgroundColor: `${blocPalette[blocKey]}22`,
                tension: 0.28,
                fill: false,
                spanGaps: true,
                pointRadius: 4,
                pointHoverRadius: 6,
                borderWidth: 2.5
            }));

        // ── 타임라인 렌더링 ──
        flowEl.innerHTML = `
            <div class="hpf-timeline">
                ${history.map((entry, index) => {
                    const winnerPartyLabel = truncatePartyLabel(entry.winnerPartyLabel || entry.winnerParty || ElectionData.getHistoricalPartyName(entry.winner, entry.election));
                    const color = ElectionData.getPartyColor(entry.winner);
                    const changed = index > 0 && history[index - 1].winner !== entry.winner;
                    return `
                        <div class="hpf-node">
                            ${changed ? '<span class="hpf-change-mark">교체</span>' : ''}
                            <div class="hpf-dot" style="background:${color}"></div>
                            <div class="hpf-label">${entry.year}</div>
                            <div class="hpf-party" style="color:${color}">${winnerPartyLabel}</div>
                        </div>
                        ${index < history.length - 1 ? `<div class="hpf-line" style="background:${color}"></div>` : ''}
                    `;
                }).join('')}
            </div>
            <div class="hpf-summary">
                <div class="hpf-stat">
                    <span class="hpf-stat-val">${changeCount}회</span>
                    <span class="hpf-stat-lbl">정권 교체</span>
                </div>
                <div class="hpf-stat">
                    <span class="hpf-stat-val">${dominantPartyLabel} ${dominantParty[1]}회</span>
                    <span class="hpf-stat-lbl">최다 승리</span>
                </div>
                <div class="hpf-stat">
                    <span class="hpf-stat-val">${avgTurnout}%</span>
                    <span class="hpf-stat-lbl">평균 투표율</span>
                </div>
            </div>
        `;

        // ── 결과 테이블 ──
        resultsEl.innerHTML = history.map((entry) => {
            const winnerColor = electionType === 'superintendent'
                ? ElectionData.getSuperintendentColor(entry.winner) || ElectionData.getPartyColor(entry.winner)
                : ElectionData.getPartyColor(entry.winner);
            const runnerColor = electionType === 'superintendent'
                ? ElectionData.getSuperintendentColor(entry.runner) || ElectionData.getPartyColor(entry.runner || 'independent')
                : ElectionData.getPartyColor(entry.runner || 'independent');
            const winnerPct = Number(entry.rate) || 0;
            const runnerPct = Number(entry.runnerRate) || 0;
            return `
                <div class="ht-row">
                    <div class="ht-left">
                        <span class="ht-year">${entry.year}</span>
                    </div>
                    <div class="ht-center">
                        <div class="ht-bar-track">
                            <div class="ht-bar-fill" style="width:${winnerPct}%;background:${winnerColor}"></div>
                        </div>
                        <div class="ht-names">
                            <span><span class="ht-dot" style="background:${winnerColor}"></span>${entry.winnerName} <b>${winnerPct.toFixed(1)}%</b></span>
                            <span class="ht-sub"><span class="ht-dot" style="background:${runnerColor}"></span>${entry.runnerName || '-'} ${runnerPct.toFixed(1)}%</span>
                        </div>
                    </div>
                </div>
            `;
        }).reverse().join('');

        // ── 비교 차트 ──
        destroyChart();
        const chartCard = document.getElementById('history-chart-card');
        if (chartCard) {
            chartCard.style.display = '';
            chartCard.querySelector('h4')?.remove();
            const h4 = document.createElement('h4');
            h4.innerHTML = '<i class="fas fa-chart-area"></i> 정당 계열 득표율 변화';
            chartCard.insertBefore(h4, canvas);
        }
        canvas.style.display = '';
        emptyEl.style.display = 'none';

        const allVals = chartDatasets.flatMap(ds => ds.data).filter(v => v !== null);
        const yMin = Math.max(0, Math.floor((Math.min(...allVals) - 5) / 10) * 10);
        const yMax = Math.min(100, Math.ceil((Math.max(...allVals) + 5) / 10) * 10);

        historyComparisonChart = new Chart(canvas, {
            type: 'line',
            data: {
                labels: history.map((entry) => `${entry.year}`),
                datasets: chartDatasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                aspectRatio: 2,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: {
                        labels: { color: '#cbd5e1', usePointStyle: true, boxWidth: 10 }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(26, 34, 54, 0.95)',
                        borderColor: 'rgba(59, 130, 246, 0.3)',
                        borderWidth: 1,
                        padding: 10,
                        cornerRadius: 8,
                        callbacks: {
                            label: (ctx) => ctx.raw === null ? null : `${ctx.dataset.label}: ${ctx.raw}%`
                        }
                    }
                },
                scales: {
                    x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,0.08)' } },
                    y: {
                        min: yMin, max: yMax,
                        ticks: { color: '#94a3b8', callback: (v) => `${v}%`, stepSize: 10 },
                        grid: { color: 'rgba(148,163,184,0.08)' }
                    }
                }
            }
        });
    }

    return { render, destroyChart };
})();
