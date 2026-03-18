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
            return '이 지역의 교육감 역대 선거 데이터가 없습니다.';
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

        // 재보궐: byelection.json의 prevElection으로 역대비교 렌더링
        if (electionType === 'byElection' && districtName) {
            const byeData = ElectionData.getByElectionData(districtName);
            if (byeData?.prevElection) {
                renderByElectionHistory(flowEl, resultsEl, canvas, emptyEl, chartCardTitle, byeData);
                return;
            }
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
                    const winnerPartyLabel = electionType === 'superintendent'
                        ? (entry.winner || entry.winnerParty || '?')
                        : truncatePartyLabel(entry.winnerPartyLabel || entry.winnerParty || ElectionData.getHistoricalPartyName(entry.winner, entry.election));
                    const color = electionType === 'superintendent'
                        ? (ElectionData.getSuperintendentColor(entry.winner) || ElectionData.getPartyColor(entry.winner))
                        : ElectionData.getPartyColor(entry.winner);
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
            const isUncontested = winnerPct === 0 && !entry.runnerName;
            return `
                <div class="ht-row">
                    <div class="ht-left">
                        <span class="ht-year">${entry.year}</span>
                    </div>
                    <div class="ht-center">
                        ${isUncontested
                            ? `<div class="ht-uncontested">무투표 당선</div>`
                            : `<div class="ht-bar-track">
                                <div class="ht-bar-fill" style="width:${winnerPct}%;background:${winnerColor}"></div>
                            </div>`
                        }
                        <div class="ht-names">
                            <span><span class="ht-dot" style="background:${winnerColor}"></span>${entry.winnerName}${isUncontested ? '' : ` <b>${winnerPct.toFixed(1)}%</b>`}</span>
                            ${entry.runnerName
                                ? `<span class="ht-sub"><span class="ht-dot" style="background:${runnerColor}"></span>${entry.runnerName} ${runnerPct.toFixed(1)}%</span>`
                                : `<span class="ht-sub" style="color:var(--text-muted);font-size:0.75rem;">${isUncontested ? (entry.winnerParty || ElectionData.getPartyName(entry.winner)) : (entry.winnerParty || ElectionData.getPartyName(entry.winner))}</span>`
                            }
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

        const isMobile = window.innerWidth <= 768;
        historyComparisonChart = new Chart(canvas, {
            type: 'line',
            data: {
                labels: history.map((entry) => `${entry.year}`),
                datasets: chartDatasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                aspectRatio: isMobile ? 1.3 : 2,
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

    /**
     * 재보궐 역대비교 — 17대~22대 역대 국회의원 선거 결과를 광역단체장과 같은 양식으로
     */
    function renderByElectionHistory(flowEl, resultsEl, canvas, emptyEl, chartCardTitle, byeData) {
        const history = byeData.history || [];
        const reason = byeData.reason || '';
        const subType = byeData.subType || '보궐선거';
        const subTypeColor = '#f59e0b'; // 재보궐 시그니처 노란색

        // 사유 배너
        const bannerHtml = `
            <div style="margin-bottom:16px;padding:10px 14px;border-radius:8px;background:${subTypeColor}10;border:1px solid ${subTypeColor}30;">
                <div style="color:${subTypeColor};font-weight:600;font-size:0.85rem;margin-bottom:4px;">
                    <i class="fas fa-info-circle"></i> ${subType}
                </div>
                <div style="color:var(--text-secondary);font-size:0.8rem;">${reason}</div>
            </div>
        `;

        if (!history.length) {
            // history가 없으면 prevElection만
            destroyChart();
            canvas.style.display = 'none';
            emptyEl.style.display = 'none';

            const prev = byeData.prevElection || {};
            const winColor = ElectionData.getPartyColor(prev.winner || 'independent');
            const runColor = ElectionData.getPartyColor(prev.runner || 'independent');

            flowEl.innerHTML = bannerHtml + `
                <div class="hpf-timeline">
                    <div class="hpf-node">
                        <div class="hpf-dot" style="background:${winColor}"></div>
                        <div class="hpf-label">이전 선거</div>
                        <div class="hpf-party" style="color:${winColor}">${ElectionData.getPartyName(prev.winner)}</div>
                    </div>
                    <div class="hpf-line" style="background:${subTypeColor}"></div>
                    <div class="hpf-node">
                        <span class="hpf-change-mark" style="background:${subTypeColor}">공석</span>
                        <div class="hpf-dot" style="background:${subTypeColor}"></div>
                        <div class="hpf-label">2026.06.03</div>
                        <div class="hpf-party" style="color:${subTypeColor}">투표 예정</div>
                    </div>
                </div>`;
            resultsEl.innerHTML = '';
            return;
        }

        // ── 역대 타임라인 (광역단체장과 동일 양식) ──
        const changeCount = history.reduce((count, entry, index) => {
            if (index === 0) return count;
            return count + (history[index - 1].winner !== entry.winner ? 1 : 0);
        }, 0);

        const winnerCounts = history.reduce((counts, entry) => {
            const bk = getBlocKey(entry.winner);
            counts.set(bk, (counts.get(bk) || 0) + 1);
            return counts;
        }, new Map());
        const dominantParty = [...winnerCounts.entries()].sort((a, b) => b[1] - a[1])[0] || ['other', 0];
        const dominantLabel = getBlocLabel(dominantParty[0], 'governor');

        const blocPalette = {
            democratic: ElectionData.getPartyColor('democratic'),
            ppp: ElectionData.getPartyColor('ppp'),
            other: ElectionData.getPartyColor('other'),
            independent: ElectionData.getPartyColor('independent')
        };

        flowEl.innerHTML = bannerHtml + `
            <div class="hpf-timeline">
                ${history.map((entry, index) => {
                    const label = truncatePartyLabel(entry.winnerParty || ElectionData.getPartyName(entry.winner));
                    const color = ElectionData.getPartyColor(entry.winner);
                    const changed = index > 0 && history[index - 1].winner !== entry.winner;
                    return `
                        <div class="hpf-node">
                            ${changed ? '<span class="hpf-change-mark">교체</span>' : ''}
                            <div class="hpf-dot" style="background:${color}"></div>
                            <div class="hpf-label">${entry.election}대(${entry.year})</div>
                            <div class="hpf-party" style="color:${color}">${label}</div>
                        </div>
                        ${index < history.length - 1 ? `<div class="hpf-line" style="background:${color}"></div>` : ''}
                    `;
                }).join('')}
                <div class="hpf-line" style="background:${subTypeColor}"></div>
                <div class="hpf-node">
                    <span class="hpf-change-mark" style="background:${subTypeColor}">공석</span>
                    <div class="hpf-dot" style="background:${subTypeColor}"></div>
                    <div class="hpf-label">2026</div>
                    <div class="hpf-party" style="color:${subTypeColor}">투표 예정</div>
                </div>
            </div>
            <div class="hpf-summary">
                <div class="hpf-stat">
                    <span class="hpf-stat-val">${changeCount}회</span>
                    <span class="hpf-stat-lbl">정권 교체</span>
                </div>
                <div class="hpf-stat">
                    <span class="hpf-stat-val">${dominantLabel} ${dominantParty[1]}회</span>
                    <span class="hpf-stat-lbl">최다 승리</span>
                </div>
            </div>
        `;

        // ── 결과 테이블 (광역단체장과 동일 양식 — 당선자 + 차점자) ──
        const prev = byeData.prevElection || {};
        resultsEl.innerHTML = history.map((entry, idx) => {
            const winColor = ElectionData.getPartyColor(entry.winner);
            const winPct = Number(entry.rate) || 0;

            // runner: history 자체에 있으면 사용, 마지막 건은 prevElection fallback
            const isLatest = idx === history.length - 1;
            const runnerName = entry.runnerName || (isLatest ? prev.runnerName : '') || '';
            const runnerRate = Number(entry.runnerRate || (isLatest ? prev.runnerRate : 0)) || 0;
            const runnerParty = entry.runner || (isLatest ? prev.runner : '') || 'independent';
            const runColor = ElectionData.getPartyColor(runnerParty);

            return `
                <div class="ht-row">
                    <div class="ht-left">
                        <span class="ht-year">${entry.year}</span>
                    </div>
                    <div class="ht-center">
                        <div class="ht-bar-track">
                            <div class="ht-bar-fill" style="width:${winPct}%;background:${winColor}"></div>
                        </div>
                        <div class="ht-names">
                            <span><span class="ht-dot" style="background:${winColor}"></span>${entry.winnerName} <b>${winPct.toFixed(1)}%</b></span>
                            ${runnerName ? `<span class="ht-sub"><span class="ht-dot" style="background:${runColor}"></span>${runnerName} ${runnerRate.toFixed(1)}%</span>` : `<span class="ht-sub" style="color:var(--text-muted);font-size:0.75rem">${entry.winnerParty || ''}</span>`}
                        </div>
                    </div>
                </div>
            `;
        }).reverse().join('') + `
            <div style="margin-top:12px;padding:8px 12px;border-radius:6px;background:rgba(148,163,184,0.06);border:1px solid rgba(148,163,184,0.15);">
                <div style="color:var(--text-muted);font-size:0.75rem;">
                    <i class="fas fa-info-circle" style="margin-right:4px;"></i>
                    선거구 획정에 따라 역대 선거의 선거구 범위가 다를 수 있습니다. 단순 비교에 유의하세요.
                </div>
            </div>
        `;

        // ── 득표율 변화 차트 (당선자 + 차점자 양당 추이) ──
        destroyChart();

        // winner + runner 블록 모두 수집
        const blocAppearancesLocal = history.reduce((counts, entry) => {
            const wb = getBlocKey(entry.winner);
            counts.set(wb, (counts.get(wb) || 0) + 1);
            if (entry.runner) {
                const rb = getBlocKey(entry.runner);
                counts.set(rb, (counts.get(rb) || 0) + 1);
            }
            return counts;
        }, new Map());

        const datasets = [...blocAppearancesLocal.entries()]
            .filter(([, count]) => count > 0)
            .sort((a, b) => b[1] - a[1])
            .map(([blocKey]) => ({
                label: getBlocLabel(blocKey, 'governor'),
                data: history.map(entry => {
                    let best = null;
                    if (getBlocKey(entry.winner) === blocKey) best = Number(entry.rate) || 0;
                    if (entry.runner && getBlocKey(entry.runner) === blocKey) {
                        const rv = Number(entry.runnerRate) || 0;
                        best = best !== null ? Math.max(best, rv) : rv;
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

        const allVals = datasets.flatMap(ds => ds.data).filter(v => v !== null);
        if (allVals.length < 2) {
            canvas.style.display = 'none';
            emptyEl.style.display = 'none';
            return;
        }

        const yMin = Math.max(0, Math.floor((Math.min(...allVals) - 5) / 10) * 10);
        const yMax = Math.min(100, Math.ceil((Math.max(...allVals) + 5) / 10) * 10);

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

        historyComparisonChart = new Chart(canvas, {
            type: 'line',
            data: {
                labels: history.map(e => `${e.year}`),
                datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                aspectRatio: window.innerWidth <= 768 ? 1.3 : 2,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { labels: { color: '#cbd5e1', usePointStyle: true, boxWidth: 10 } },
                    tooltip: {
                        backgroundColor: 'rgba(26, 34, 54, 0.95)',
                        borderColor: 'rgba(59, 130, 246, 0.3)',
                        borderWidth: 1, padding: 10, cornerRadius: 8,
                        callbacks: { label: (ctx) => ctx.raw === null ? null : `${ctx.dataset.label}: ${ctx.raw}%` }
                    }
                },
                scales: {
                    x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,0.08)' } },
                    y: { min: yMin, max: yMax,
                        ticks: { color: '#94a3b8', callback: (v) => `${v}%`, stepSize: 10 },
                        grid: { color: 'rgba(148,163,184,0.08)' }
                    }
                }
            }
        });
    }

    return { render, destroyChart };
})();
