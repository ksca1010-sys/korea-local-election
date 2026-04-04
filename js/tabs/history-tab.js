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

    /** Insert a sr-only table next to a canvas for screen readers. */
    function _insertSrTable(canvas, html) {
        const prev = canvas.nextElementSibling;
        if (prev && prev.classList.contains('sr-only')) prev.remove();
        const tbl = document.createElement('table');
        tbl.className = 'sr-only';
        tbl.innerHTML = html;
        canvas.setAttribute('aria-hidden', 'true');
        canvas.parentNode.insertBefore(tbl, canvas.nextSibling);
    }

    function buildEmptyMessage(message, icon = 'fa-circle-info') {
        return `<div class="no-data-message"><i class="fas ${icon}"></i><p>${message}</p></div>`;
    }

    // Fix #4: 6자로 완화 (더불어민주 → 더불어민주당 6자 수용)
    function truncatePartyLabel(label) {
        const text = String(label || '');
        return text.length > 6 ? `${text.slice(0, 6)}…` : text;
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

    // Fix #8: 의원 선거 빈 상태 안내 개선
    function getEmptyMessage(electionType, districtName) {
        if (electionType === 'council' || electionType === 'localCouncil'
            || electionType === 'councilProportional' || electionType === 'localCouncilProportional') {
            return '의원 선거는 선거구 단위 특성상 역대 비교 데이터를 제공하지 않습니다.\n광역단체장 또는 교육감 탭에서 확인하세요.';
        }
        if (electionType === 'superintendent') {
            return '이 지역의 교육감 역대 선거 데이터가 없습니다.';
        }
        if (electionType === 'mayor' && !districtName) {
            return '시군구를 선택하면 역대 기초단체장 선거 결과를 확인할 수 있습니다.';
        }
        if (electionType === 'mayor') {
            return '이 시군구의 역대 선거 데이터가 없습니다.';
        }
        return '현재 선택한 선거 유형의 역대 선거 데이터가 없습니다.';
    }

    // Fix #2: 색상 외 형태로도 계열 구분 (접근성)
    function dotShapeClass(blocKey) {
        switch (blocKey) {
            case 'democratic': return 'hpf-dot--circle';   // 원
            case 'ppp':        return 'hpf-dot--square';   // 사각
            case 'independent':return 'hpf-dot--diamond';  // 마름모
            default:           return 'hpf-dot--dash';     // 점선 원
        }
    }
    function smallDotShapeClass(blocKey) {
        switch (blocKey) {
            case 'democratic': return 'ht-dot--circle';
            case 'ppp':        return 'ht-dot--square';
            case 'independent':return 'ht-dot--diamond';
            default:           return 'ht-dot--dash';
        }
    }

    /**
     * 역대비교 탭 렌더링
     */
    async function render(regionKey, electionType, districtName) {
        // 역대 전체 데이터 지연 로딩 (초기 앱 로드에서 제외)
        if (!ElectionData.historicalElectionsFull) {
            const fullData = await DataLoader.loadLazy('historical_elections_full.json');
            if (fullData) {
                ElectionData.historicalElectionsFull = fullData;
            }
        }

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

        // 재보궐
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

        // 전남광주통합특별시: 역대선거에 전남 데이터도 포함
        let jeonnamHistory = null;
        if (regionKey === 'gwangju' && typeof isMergedGwangjuJeonnam === 'function' && isMergedGwangjuJeonnam(electionType)) {
            if (electionType === 'governor') {
                jeonnamHistory = ElectionData.getHistoricalData('jeonnam') || [];
            } else if (electionType === 'superintendent') {
                jeonnamHistory = ElectionData.getSuperintendentHistoricalData('jeonnam') || [];
            }
            if (jeonnamHistory && jeonnamHistory.length === 0) jeonnamHistory = null;
        }

        if (!history.length) {
            destroyChart();
            canvas.style.display = 'none';
            emptyEl.style.display = '';
            emptyEl.innerHTML = buildEmptyMessage(getEmptyMessage(electionType, districtName), 'fa-clock-rotate-left');
            if (chartCardTitle) {
                chartCardTitle.innerHTML = '<i class="fas fa-chart-area"></i> 역대 선거 그래프';
            }
            flowEl.innerHTML = buildEmptyMessage(getEmptyMessage(electionType, districtName), 'fa-shuffle');
            resultsEl.innerHTML = '';
            return;
        }

        // 통계 산출
        const changeCount = history.reduce((count, entry, index) => {
            if (index === 0) return count;
            return count + (history[index - 1].winner !== entry.winner ? 1 : 0);
        }, 0);
        const turnoutEntries = history.filter(e => Number(e.turnout) > 0);
        const avgTurnout = turnoutEntries.length
            ? (turnoutEntries.reduce((s, e) => s + Number(e.turnout), 0) / turnoutEntries.length).toFixed(1)
            : null;
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

        // Fix #1: 타임라인 스크롤 힌트 래퍼 + Fix #5: badge overflow용 padding-top
        // Fix #2: 도트에 형태 클래스 추가 + Fix #12: 득표율 노드에 표시
        flowEl.innerHTML = `
            <div class="hpf-timeline-wrap">
                <div class="hpf-timeline">
                    ${history.map((entry, index) => {
                        const winnerPartyLabel = electionType === 'superintendent'
                            ? (entry.winner || entry.winnerParty || '?')
                            : truncatePartyLabel(entry.winnerPartyLabel || entry.winnerParty || ElectionData.getHistoricalPartyName(entry.winner, entry.election));
                        const color = electionType === 'superintendent'
                            ? (ElectionData.getSuperintendentColor(entry.winner) || ElectionData.getPartyColor(entry.winner))
                            : ElectionData.getPartyColor(entry.winner);
                        const blocKey = getBlocKey(entry.winner);
                        const changed = index > 0 && history[index - 1].winner !== entry.winner;
                        const rate = Number(entry.rate);
                        return `
                            <div class="hpf-node">
                                ${changed ? '<span class="hpf-change-mark">교체</span>' : ''}
                                <div class="hpf-dot ${dotShapeClass(blocKey)}" style="background:${color}"></div>
                                <div class="hpf-label">'${String(entry.year).slice(-2)}</div>
                                <div class="hpf-party" style="color:${color}">${winnerPartyLabel}</div>
                                ${rate > 0 ? `<div class="hpf-rate">${rate.toFixed(1)}%</div>` : ''}
                            </div>
                            ${index < history.length - 1 ? `<div class="hpf-line" style="background:${color}"></div>` : ''}
                        `;
                    }).join('')}
                </div>
            </div>
            <div class="hpf-summary">
                <div class="hpf-stat">
                    <span class="hpf-stat-val">${dominantPartyLabel} ${dominantParty[1]}회</span>
                    <span class="hpf-stat-lbl">최다 승리</span>
                </div>
                <div class="hpf-stat">
                    <span class="hpf-stat-val">${changeCount}회</span>
                    <span class="hpf-stat-lbl">정권 교체</span>
                </div>
                ${avgTurnout !== null ? `
                <div class="hpf-stat">
                    <span class="hpf-stat-val">${avgTurnout}%</span>
                    <span class="hpf-stat-lbl">평균 투표율</span>
                </div>` : ''}
            </div>
        `;

        // Helper: render history entries as ht-row HTML
        function _renderHistoryRows(entries) {
            return entries.map((entry) => {
                const winnerColor = electionType === 'superintendent'
                    ? ElectionData.getSuperintendentColor(entry.winner) || ElectionData.getPartyColor(entry.winner)
                    : ElectionData.getPartyColor(entry.winner);
                const runnerColor = electionType === 'superintendent'
                    ? ElectionData.getSuperintendentColor(entry.runner) || ElectionData.getPartyColor(entry.runner || 'independent')
                    : ElectionData.getPartyColor(entry.runner || 'independent');
                const winnerBloc = getBlocKey(entry.winner);
                const runnerBloc = getBlocKey(entry.runner || 'independent');
                const winnerPct = Number(entry.rate) || 0;
                const runnerPct = Number(entry.runnerRate) || 0;
                const isUncontested = !!entry.isUncontested || (winnerPct === 0 && !entry.runnerName);
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
                                <span><span class="ht-dot ${smallDotShapeClass(winnerBloc)}" style="background:${winnerColor}"></span>${entry.winnerName}${isUncontested ? '' : ` <b>${winnerPct.toFixed(1)}%</b>`}</span>
                                ${entry.runnerName
                                    ? `<span class="ht-sub"><span class="ht-dot ${smallDotShapeClass(runnerBloc)}" style="background:${runnerColor}"></span>${entry.runnerName} ${runnerPct.toFixed(1)}%</span>`
                                    : `<span class="ht-sub" style="color:var(--text-muted);font-size:0.75rem;">${entry.winnerParty || ElectionData.getPartyName(entry.winner)}</span>`
                                }
                            </div>
                        </div>
                    </div>
                `;
            }).reverse().join('');
        }

        // Fix #9: 연도 강조 + Fix #6: 투표율 행 추가 + Fix #3: bar 높이(CSS에서)
        const gwangjuRowsHtml = _renderHistoryRows(history);

        // Chart card reference
        const chartCard = document.getElementById('history-chart-card');
        const historyToggleEl = document.getElementById('history-region-toggle');

        // ── 차트 렌더링 헬퍼 (광주/전남 전환 시 재호출) ──
        function drawChart(histData, dsData) {
            destroyChart();
            if (chartCard) {
                chartCard.style.display = '';
                chartCard.querySelector('h4')?.remove();
                chartCard.querySelector('.history-chart-footnote')?.remove();
                const h4 = document.createElement('h4');
                h4.innerHTML = '<i class="fas fa-chart-area"></i> 정당 계열 득표율 변화';
                chartCard.insertBefore(h4, canvas);
            }
            canvas.style.display = '';
            emptyEl.style.display = 'none';

            const allVals = dsData.flatMap(ds => ds.data).filter(v => v !== null);
            if (allVals.length === 0) {
                canvas.style.display = 'none';
                emptyEl.style.display = '';
                emptyEl.innerHTML = '<div style="padding:16px;color:var(--text-muted);text-align:center;"><i class="fas fa-chart-line"></i> 차트 데이터가 없습니다</div>';
                return;
            }
            const yMin = Math.max(0, Math.floor((Math.min(...allVals) - 5) / 10) * 10);
            const yMax = Math.min(100, Math.ceil((Math.max(...allVals) + 5) / 10) * 10);
            const isMobile = window.innerWidth <= 768;

            historyComparisonChart = new Chart(canvas, {
                type: 'line',
                data: {
                    labels: histData.map(e => `${e.year}`),
                    datasets: dsData
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    aspectRatio: isMobile ? 1.3 : 2,
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
                        y: {
                            min: yMin, max: yMax,
                            ticks: { color: '#94a3b8', callback: (v) => `${v}%`, stepSize: 10 },
                            grid: { color: 'rgba(148,163,184,0.08)' }
                        }
                    }
                }
            });

            _insertSrTable(canvas,
                `<caption>정당 계열 득표율 변화</caption>` +
                `<tr><th>연도</th>${dsData.map(ds => `<th>${ds.label}</th>`).join('')}</tr>` +
                histData.map((entry, i) =>
                    `<tr><td>${entry.year}</td>${dsData.map(ds => {
                        const v = ds.data[i];
                        return `<td>${v !== null ? v + '%' : '-'}</td>`;
                    }).join('')}</tr>`
                ).join('')
            );

            if (chartCard) {
                const footnote = document.createElement('div');
                footnote.className = 'history-chart-footnote';
                footnote.textContent = electionType === 'superintendent'
                    ? '진보·보수는 교육감 후보 성향 분류 기준입니다.'
                    : '민주계·보수계는 정당 계열 기준이며, 동일 선거 1·2위 득표율을 표시합니다.';
                chartCard.appendChild(footnote);
            }
        }

        // ── 전남광주통합특별시: 광주/전남 토글 ──
        if (jeonnamHistory && jeonnamHistory.length > 0) {
            // 전남 통계 산출
            const jnChangeCount = jeonnamHistory.reduce((count, entry, index) => {
                if (index === 0) return count;
                return count + (jeonnamHistory[index - 1].winner !== entry.winner ? 1 : 0);
            }, 0);
            const jnTurnoutEntries = jeonnamHistory.filter(e => Number(e.turnout) > 0);
            const jnAvgTurnout = jnTurnoutEntries.length
                ? (jnTurnoutEntries.reduce((s, e) => s + Number(e.turnout), 0) / jnTurnoutEntries.length).toFixed(1)
                : null;
            const jnWinnerCounts = jeonnamHistory.reduce((counts, entry) => {
                const bk = getBlocKey(entry.winner);
                counts.set(bk, (counts.get(bk) || 0) + 1);
                return counts;
            }, new Map());
            const jnDominantParty = [...jnWinnerCounts.entries()].sort((a, b) => b[1] - a[1])[0] || ['other', 0];
            const jnDominantPartyLabel = getBlocLabel(jnDominantParty[0], electionType);

            // 전남 chart datasets 산출
            const jnBlocAppearances = jeonnamHistory.reduce((counts, entry) => {
                const winnerBloc = getBlocKey(entry.winner);
                counts.set(winnerBloc, (counts.get(winnerBloc) || 0) + 1);
                if (entry.runner) {
                    const runnerBloc = getBlocKey(entry.runner);
                    counts.set(runnerBloc, (counts.get(runnerBloc) || 0) + 1);
                }
                return counts;
            }, new Map());
            const jnChartDatasets = [...jnBlocAppearances.entries()]
                .filter(([, count]) => count > 0)
                .sort((a, b) => b[1] - a[1])
                .map(([bk]) => ({
                    label: getBlocLabel(bk, electionType),
                    data: jeonnamHistory.map(entry => {
                        let best = null;
                        if (getBlocKey(entry.winner) === bk) best = Number(entry.rate) || 0;
                        if (entry.runner && getBlocKey(entry.runner) === bk) {
                            const rv = Number(entry.runnerRate) || 0;
                            best = best !== null ? Math.max(best, rv) : rv;
                        }
                        return best !== null ? Number(best.toFixed(1)) : null;
                    }),
                    borderColor: blocPalette[bk],
                    backgroundColor: `${blocPalette[bk]}22`,
                    tension: 0.28, fill: false, spanGaps: true,
                    pointRadius: 4, pointHoverRadius: 6, borderWidth: 2.5
                }));

            // 전남 흐름 HTML
            const jnFlowHtml = `
                <div class="hpf-timeline-wrap">
                    <div class="hpf-timeline">
                        ${jeonnamHistory.map((entry, index) => {
                            const winnerPartyLabel = electionType === 'superintendent'
                                ? (entry.winner || entry.winnerParty || '?')
                                : truncatePartyLabel(entry.winnerPartyLabel || entry.winnerParty || ElectionData.getHistoricalPartyName(entry.winner, entry.election));
                            const color = electionType === 'superintendent'
                                ? (ElectionData.getSuperintendentColor(entry.winner) || ElectionData.getPartyColor(entry.winner))
                                : ElectionData.getPartyColor(entry.winner);
                            const bk = getBlocKey(entry.winner);
                            const changed = index > 0 && jeonnamHistory[index - 1].winner !== entry.winner;
                            const rate = Number(entry.rate);
                            return `
                                <div class="hpf-node">
                                    ${changed ? '<span class="hpf-change-mark">교체</span>' : ''}
                                    <div class="hpf-dot ${dotShapeClass(bk)}" style="background:${color}"></div>
                                    <div class="hpf-label">'${String(entry.year).slice(-2)}</div>
                                    <div class="hpf-party" style="color:${color}">${winnerPartyLabel}</div>
                                    ${rate > 0 ? `<div class="hpf-rate">${rate.toFixed(1)}%</div>` : ''}
                                </div>
                                ${index < jeonnamHistory.length - 1 ? `<div class="hpf-line" style="background:${color}"></div>` : ''}
                            `;
                        }).join('')}
                    </div>
                </div>
                <div class="hpf-summary">
                    <div class="hpf-stat">
                        <span class="hpf-stat-val">${jnDominantPartyLabel} ${jnDominantParty[1]}회</span>
                        <span class="hpf-stat-lbl">최다 승리</span>
                    </div>
                    <div class="hpf-stat">
                        <span class="hpf-stat-val">${jnChangeCount}회</span>
                        <span class="hpf-stat-lbl">정권 교체</span>
                    </div>
                    ${jnAvgTurnout !== null ? `
                    <div class="hpf-stat">
                        <span class="hpf-stat-val">${jnAvgTurnout}%</span>
                        <span class="hpf-stat-lbl">평균 투표율</span>
                    </div>` : ''}
                </div>
            `;

            const gwangjuFlowHtml = flowEl.innerHTML;
            const jeonnamRowsHtml = _renderHistoryRows(jeonnamHistory);

            // 토글 버튼을 상단 컨테이너에 배치
            if (historyToggleEl) {
                historyToggleEl.style.display = '';
                historyToggleEl.innerHTML = `
                    <div style="display:flex;gap:8px;padding:4px 0 12px;">
                        <button class="hpf-toggle-btn active" data-history-region="gwangju"
                            style="padding:7px 20px;border-radius:8px;border:1px solid var(--accent-primary);background:var(--accent-primary);color:white;cursor:pointer;font-size:0.875rem;font-weight:600;transition:all 0.15s;">광주</button>
                        <button class="hpf-toggle-btn" data-history-region="jeonnam"
                            style="padding:7px 20px;border-radius:8px;border:1px solid var(--border);background:var(--bg-secondary);color:var(--text-secondary);cursor:pointer;font-size:0.875rem;transition:all 0.15s;">전남</button>
                    </div>
                `;
            }

            // 역대선거결과: 콘텐츠만 (버튼 없음)
            resultsEl.innerHTML = `
                <div data-history-content="gwangju">${gwangjuRowsHtml}</div>
                <div data-history-content="jeonnam" style="display:none;">${jeonnamRowsHtml}</div>
            `;

            // 토글 이벤트 — 3개 섹션(흐름+차트+결과) 동시 전환
            const toggleBtns = historyToggleEl ? historyToggleEl.querySelectorAll('.hpf-toggle-btn') : [];
            toggleBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    const region = btn.dataset.historyRegion;
                    toggleBtns.forEach(b => {
                        const isActive = b.dataset.historyRegion === region;
                        b.classList.toggle('active', isActive);
                        b.style.background = isActive ? 'var(--accent-primary)' : 'var(--bg-secondary)';
                        b.style.color = isActive ? 'white' : 'var(--text-secondary)';
                        b.style.borderColor = isActive ? 'var(--accent-primary)' : 'var(--border)';
                        b.style.fontWeight = isActive ? '600' : '';
                    });
                    // 정권변화흐름
                    flowEl.innerHTML = region === 'jeonnam' ? jnFlowHtml : gwangjuFlowHtml;
                    // 역대선거결과
                    resultsEl.querySelectorAll('[data-history-content]').forEach(el => {
                        el.style.display = el.dataset.historyContent === region ? '' : 'none';
                    });
                    // 정당계열득표율변화 차트
                    drawChart(
                        region === 'jeonnam' ? jeonnamHistory : history,
                        region === 'jeonnam' ? jnChartDatasets : chartDatasets
                    );
                });
            });

            // 초기: 광주 차트 렌더링
            drawChart(history, chartDatasets);
        } else {
            // 단일 지역: 토글 숨김
            if (historyToggleEl) historyToggleEl.style.display = 'none';
            resultsEl.innerHTML = gwangjuRowsHtml;
            drawChart(history, chartDatasets);
        }
    }

    /**
     * 재보궐 역대비교
     */
    function renderByElectionHistory(flowEl, resultsEl, canvas, emptyEl, chartCardTitle, byeData) {
        const history = byeData.history || [];
        const reason = byeData.reason || '';
        const subType = byeData.subType || '보궐선거';
        const subTypeColor = '#f59e0b';

        const bannerHtml = `
            <div style="margin-bottom:16px;padding:10px 14px;border-radius:8px;background:${subTypeColor}10;border:1px solid ${subTypeColor}30;">
                <div style="color:${subTypeColor};font-weight:600;font-size:0.85rem;margin-bottom:4px;">
                    <i class="fas fa-info-circle"></i> ${subType}
                </div>
                <div style="color:var(--text-secondary);font-size:0.8rem;">${reason}</div>
            </div>
        `;

        if (!history.length) {
            destroyChart();
            canvas.style.display = 'none';
            emptyEl.style.display = 'none';

            const prev = byeData.prevElection || {};
            const winColor = ElectionData.getPartyColor(prev.winner || 'independent');

            flowEl.innerHTML = bannerHtml + `
                <div class="hpf-timeline-wrap">
                    <div class="hpf-timeline">
                        <div class="hpf-node">
                            <div class="hpf-dot ${dotShapeClass(getBlocKey(prev.winner || 'independent'))}" style="background:${winColor}"></div>
                            <div class="hpf-label">이전 선거</div>
                            <div class="hpf-party" style="color:${winColor}">${ElectionData.getPartyName(prev.winner)}</div>
                        </div>
                        <div class="hpf-line" style="background:${subTypeColor}"></div>
                        <div class="hpf-node">
                            <span class="hpf-change-mark" style="background:${subTypeColor}">공석</span>
                            <div class="hpf-dot hpf-dot--circle" style="background:${subTypeColor}"></div>
                            <div class="hpf-label">'26.6.3</div>
                            <div class="hpf-party" style="color:${subTypeColor}">투표 예정</div>
                        </div>
                    </div>
                </div>`;
            resultsEl.innerHTML = '';
            return;
        }

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
            <div class="hpf-timeline-wrap">
                <div class="hpf-timeline">
                    ${history.map((entry, index) => {
                        const label = truncatePartyLabel(entry.winnerParty || ElectionData.getPartyName(entry.winner));
                        const color = ElectionData.getPartyColor(entry.winner);
                        const blocKey = getBlocKey(entry.winner);
                        const changed = index > 0 && history[index - 1].winner !== entry.winner;
                        const rate = Number(entry.rate);
                        return `
                            <div class="hpf-node">
                                ${changed ? '<span class="hpf-change-mark">교체</span>' : ''}
                                <div class="hpf-dot ${dotShapeClass(blocKey)}" style="background:${color}"></div>
                                <div class="hpf-label">${entry.election}대('${String(entry.year).slice(-2)})</div>
                                <div class="hpf-party" style="color:${color}">${label}</div>
                                ${rate > 0 ? `<div class="hpf-rate">${rate.toFixed(1)}%</div>` : ''}
                            </div>
                            ${index < history.length - 1 ? `<div class="hpf-line" style="background:${color}"></div>` : ''}
                        `;
                    }).join('')}
                    <div class="hpf-line" style="background:${subTypeColor}"></div>
                    <div class="hpf-node">
                        <span class="hpf-change-mark" style="background:${subTypeColor}">공석</span>
                        <div class="hpf-dot hpf-dot--circle" style="background:${subTypeColor}"></div>
                        <div class="hpf-label">'26</div>
                        <div class="hpf-party" style="color:${subTypeColor}">투표 예정</div>
                    </div>
                </div>
            </div>
            <div class="hpf-summary">
                <div class="hpf-stat">
                    <span class="hpf-stat-val">${dominantLabel} ${dominantParty[1]}회</span>
                    <span class="hpf-stat-lbl">최다 승리</span>
                </div>
                <div class="hpf-stat">
                    <span class="hpf-stat-val">${changeCount}회</span>
                    <span class="hpf-stat-lbl">정권 교체</span>
                </div>
            </div>
        `;

        // Fix #10: 재보궐 결과 테이블에 선거 유형 헤더 추가
        const prev = byeData.prevElection || {};
        resultsEl.innerHTML = `
            <div class="ht-section-label">역대 국회의원 선거 결과</div>
        ` + history.map((entry, idx) => {
            const winColor = ElectionData.getPartyColor(entry.winner);
            const winnerBloc = getBlocKey(entry.winner);
            const winPct = Number(entry.rate) || 0;

            const isLatest = idx === history.length - 1;
            const runnerName = entry.runnerName || (isLatest ? prev.runnerName : '') || '';
            const runnerRate = Number(entry.runnerRate || (isLatest ? prev.runnerRate : 0)) || 0;
            const runnerParty = entry.runner || (isLatest ? prev.runner : '') || 'independent';
            const runColor = ElectionData.getPartyColor(runnerParty);
            const runnerBloc = getBlocKey(runnerParty);

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
                            <span><span class="ht-dot ${smallDotShapeClass(winnerBloc)}" style="background:${winColor}"></span>${entry.winnerName} <b>${winPct.toFixed(1)}%</b></span>
                            ${runnerName ? `<span class="ht-sub"><span class="ht-dot ${smallDotShapeClass(runnerBloc)}" style="background:${runColor}"></span>${runnerName} ${runnerRate.toFixed(1)}%</span>` : `<span class="ht-sub" style="color:var(--text-muted);font-size:0.75rem">${entry.winnerParty || ''}</span>`}
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

        destroyChart();

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
            chartCard.querySelector('.history-chart-footnote')?.remove();
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

        // Accessible sr-only table for screen readers
        _insertSrTable(canvas,
            `<caption>정당 계열 득표율 변화 (재보궐)</caption>` +
            `<tr><th>연도</th>${datasets.map(ds => `<th>${ds.label}</th>`).join('')}</tr>` +
            history.map((entry, i) => {
                return `<tr><td>${entry.year}</td>${datasets.map(ds => {
                    const v = ds.data[i];
                    return `<td>${v !== null ? v + '%' : '-'}</td>`;
                }).join('')}</tr>`;
            }).join('')
        );

        if (chartCard) {
            const footnote = document.createElement('div');
            footnote.className = 'history-chart-footnote';
            footnote.textContent = '민주계·보수계는 정당 계열 기준이며, 동일 선거 1·2위 득표율을 표시합니다.';
            chartCard.appendChild(footnote);
        }
    }

    return { render, destroyChart };
})();
