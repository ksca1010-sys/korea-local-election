// ============================================
// Overview Tab — 개요 탭 렌더링
// app.js에서 분리됨
// ============================================

const OverviewTab = (() => {

    // 세대 카운터: 지역/선거유형 전환 시 이전 비동기 결과를 무시
    let _renderGeneration = 0;

    function _renderRegionIssuesHtml(regionKey) {
        const issues = ElectionData.getRegionIssues(regionKey);
        const signals = ElectionData.getDerivedIssueSignals ? ElectionData.getDerivedIssueSignals(regionKey) : {};
        const meta = ElectionData.getDerivedIssuesMeta ? ElectionData.getDerivedIssuesMeta(regionKey) : null;
        if (!Array.isArray(issues) || issues.length === 0) {
            return `<div class="issues-list"><span class="issue-tag">출처 집계 중인 핵심이슈가 아직 없습니다</span></div>`;
        }
        const tagsHtml = `<div class="issues-list">${issues.map(issue => `<span class="issue-tag">${issue}</span>`).join('')}</div>`;
        if (!meta?.updatedAt || !meta?.methodology) {
            return tagsHtml;
        }

        let updatedText = meta.updatedAt;
        try {
            updatedText = new Date(meta.updatedAt).toLocaleString('ko-KR', { hour12: false });
        } catch (err) {
            updatedText = meta.updatedAt;
        }

        return `
            ${tagsHtml}
            <div class="issues-meta">
                산출 시각: ${updatedText}
            </div>
        `;
    }

    // 행정구역 변경 안내 (2026년 예정)
    const ADMIN_CHANGE_NOTICES = {
        incheon: {
            label: '인천광역시 행정구역 개편',
            detail: '2026년 7월 서구가 서해구로 변경되며, 검단구·영종구·제물포구가 신설됩니다. 6월 3일 선거는 현행 행정구역 기준으로 실시됩니다.',
        },
    };

    function render(regionKey, electionType, districtName) {
        if (typeof ElectionData === 'undefined') return;
        const region = ElectionData.getRegion(regionKey);
        if (!region && electionType !== 'byElection') return;

        // 세대 카운터 증가 — 이전 비동기 결과 무시용
        const gen = ++_renderGeneration;

        // 행정구역 변경 안내
        const adminNoticeEl = document.getElementById('admin-change-notice');
        const notice = ADMIN_CHANGE_NOTICES[regionKey];
        if (adminNoticeEl) {
            if (notice) {
                adminNoticeEl.innerHTML = `<div style="padding:10px 14px;border-radius:8px;background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.2);margin-bottom:12px;font-size:0.8rem;line-height:1.6;"><i class="fas fa-info-circle" style="color:var(--accent-blue);margin-right:6px;"></i><strong>${notice.label}</strong><br>${notice.detail}</div>`;
                adminNoticeEl.style.display = '';
            } else {
                adminNoticeEl.style.display = 'none';
            }
        }

        // Election overview card (선거 쟁점 개요)
        const overviewCard = document.getElementById('election-overview-card');
        if (overviewCard && ElectionData.loadElectionOverview) {
            ElectionData.loadElectionOverview().then(() => {
                // 비동기 완료 시점에 세대가 바뀌었으면 무시 (race condition 방지)
                if (gen !== _renderGeneration) return;
                const ov = ElectionData.getElectionOverview(regionKey, electionType, districtName);
                if (ov) {
                    overviewCard.style.display = '';
                    const trendBadge = document.getElementById('overview-trend-badge');
                    const updatedDate = document.getElementById('overview-updated-date');
                    const headline = document.getElementById('overview-headline');
                    const narrative = document.getElementById('overview-narrative');
                    const summary = document.getElementById('overview-summary');
                    const issues = document.getElementById('overview-key-issues');
                    const risk = document.getElementById('overview-risk-factor');
                    if (trendBadge) trendBadge.textContent = _normalizeTrend(ov.trend);
                    if (updatedDate) {
                        const updated = ElectionData._overviewCache?.meta?.lastUpdated || '';
                        updatedDate.innerHTML = `${updated} <span style="font-size:var(--text-micro);color:var(--text-muted);margin-left:var(--space-4);">AI 분석</span>`;
                    }
                    if (headline) headline.textContent = _normalizeTrend(ov.headline);

                    // narrative 모드: narrative가 있으면 summary 대신 표시
                    if (narrative && ov.narrative) {
                        narrative.textContent = _normalizeTrend(ov.narrative);
                        narrative.style.display = '';
                        if (summary) summary.style.display = 'none';
                    } else {
                        if (narrative) narrative.style.display = 'none';
                        if (summary) {
                            summary.textContent = _normalizeTrend(ov.summary);
                            summary.style.display = '';
                        }
                    }

                    if (issues && Array.isArray(ov.keyIssues)) {
                        issues.innerHTML = ov.keyIssues.map(i =>
                            `<span class="issue-tag"><i class="fas fa-hashtag"></i> ${escapeHtml(_normalizeTrend(i))}</span>`
                        ).join('');
                    }
                    if (risk && ov.riskFactor) {
                        risk.innerHTML = `<i class="fas fa-exclamation-triangle"></i> <strong>핵심 변수:</strong> ${escapeHtml(_normalizeTrend(ov.riskFactor))}
                            <div style="font-size:var(--text-micro);color:var(--text-disabled);margin-top:var(--space-4);">
                                <i class="fas fa-info-circle"></i> 이 개요는 AI가 뉴스를 분석하여 생성한 것으로, 사실과 다를 수 있습니다.
                            </div>`;
                    }

                    // facts 섹션 — LLM 없이 구조화된 데이터에서 추출한 검증 가능 팩트
                    const factsEl = document.getElementById('overview-facts');
                    if (factsEl && ov.facts) {
                        const f = ov.facts;
                        const pollBanned = typeof ElectionCalendar !== 'undefined' && ElectionCalendar.isPublicationBanned();
                        const pollHtml = !pollBanned && f.latestPoll && f.latestPoll.results && f.latestPoll.results.length
                            ? `<div style="margin-top:var(--space-8);">
                                <span style="font-size:var(--text-micro);color:var(--text-muted);">최신 여론조사 (${f.latestPoll.org || ''} · ${f.latestPoll.date || ''})</span>
                                <div style="margin-top:var(--space-4);display:flex;flex-wrap:wrap;gap:var(--space-4);">
                                ${f.latestPoll.results.map(r =>
                                    r.support != null
                                        ? `<span style="font-size:var(--text-caption);background:rgba(255,255,255,0.06);padding:2px 8px;border-radius:4px;">${r.name} ${r.support}%</span>`
                                        : `<span style="font-size:var(--text-caption);color:var(--text-muted);padding:2px 8px;">${r.name} — 여론조사 데이터 없음</span>`
                                ).join('')}
                                </div>
                               </div>`
                            : '';
                        factsEl.innerHTML = `
                            <div style="font-size:var(--text-micro);color:var(--color-success);margin-bottom:var(--space-8);">
                                <i class="fas fa-database"></i> 데이터 출처 확인 가능 — 후보자 ${f.candidateCount || 0}명${pollBanned ? '' : ` · 여론조사 ${f.pollCount || 0}건`}
                            </div>
                            ${pollHtml}`;
                        factsEl.style.display = '';
                    } else if (factsEl) {
                        factsEl.style.display = 'none';
                    }
                } else {
                    overviewCard.style.display = 'none';
                }
            }).catch(err => {
                console.warn('[OverviewTab] overview load failed:', err);
                if (overviewCard) overviewCard.style.display = 'none';
            });
        }

        // Previous election result (선거유형별 분기)
        // 재보궐: onByElectionSelected에서 이미 렌더링했으므로 건드리지 않음
        const prevContainer = document.getElementById('prev-election-result');
        if (prevContainer && electionType !== 'byElection') {
            if (electionType === 'superintendent') {
                const history = ElectionData.getSuperintendentHistoricalData(regionKey);
                const lastElection = history.length ? history[history.length - 1] : null;
                if (lastElection) {
                    const winColor = ElectionData.getSuperintendentColor(lastElection.winner);
                    const runColor = ElectionData.getSuperintendentColor(lastElection.runner);
                    prevContainer.innerHTML = `
                        <div class="prev-result">
                            <div class="prev-winner">
                                <div class="name">${lastElection.winnerName}</div>
                                <span class="party-badge" style="background:${winColor};display:inline-block;padding:1px 6px;border-radius:3px;font-size:0.7rem;color:white;">${lastElection.winner}</span>
                                <div class="rate" style="color:${winColor}">${lastElection.rate}%</div>
                            </div>
                            <div class="prev-vs">VS</div>
                            <div class="prev-winner">
                                <div class="name">${lastElection.runnerName}</div>
                                <span class="party-badge" style="background:${runColor};display:inline-block;padding:1px 6px;border-radius:3px;font-size:0.7rem;color:white;">${lastElection.runner}</span>
                                <div class="rate" style="color:${runColor}">${lastElection.runnerRate}%</div>
                            </div>
                        </div>
                        <div class="prev-turnout"><i class="fas fa-person-booth"></i> ${lastElection.year}년 투표율: ${lastElection.turnout}%</div>
                    `;
                } else {
                    prevContainer.innerHTML = '';
                }
            } else if (electionType === 'mayor' && districtName) {
                const mayorHist = ElectionData.getMayorHistoricalData(regionKey, districtName);
                if (mayorHist.length > 0) {
                    const last = mayorHist[mayorHist.length - 1];
                    const winColor = ElectionData.getPartyColor(last.winner);
                    const winParty = last.winnerParty || ElectionData.getHistoricalPartyName(last.winner, last.election);
                    const hasRunner = last.runnerName && last.runner;
                    const runColor = hasRunner ? ElectionData.getPartyColor(last.runner) : '#666';
                    const runParty = hasRunner ? (last.runnerParty || ElectionData.getHistoricalPartyName(last.runner, last.election)) : '';
                    const turnoutHtml = last.turnout ? `<div class="prev-turnout"><i class="fas fa-person-booth"></i> ${last.year}년 투표율: ${last.turnout}%</div>` : '';

                    prevContainer.innerHTML = `
                        <h5 style="color:var(--text-secondary);margin-bottom:8px;"><i class="fas fa-clock-rotate-left"></i> 지난 선거 결과 (제${last.election}회)</h5>
                        <div class="prev-result">
                            <div class="prev-winner">
                                <div class="name">${last.winnerName}</div>
                                <span class="party-badge" style="background:${winColor}">${ElectionData.getPartyName(last.winner)}</span>
                                <div class="rate" style="color:${winColor}">${last.rate ? last.rate.toFixed(1) + '%' : '당선'}</div>
                            </div>
                            ${hasRunner ? `
                            <div class="prev-vs">VS</div>
                            <div class="prev-winner">
                                <div class="name">${last.runnerName}</div>
                                <span class="party-badge" style="background:${runColor}">${ElectionData.getPartyName(last.runner)}</span>
                                <div class="rate" style="color:${runColor}">${last.runnerRate ? last.runnerRate.toFixed(1) + '%' : ''}</div>
                            </div>
                            ` : ''}
                        </div>
                        ${turnoutHtml}
                    `;
                } else {
                    prevContainer.innerHTML = '';
                }
            } else if (region.prevElection) {
                const prev = region.prevElection;
                const winColor = ElectionData.getPartyColor(prev.winner);
                const runColor = ElectionData.getPartyColor(prev.runner);
                let prevHtml = `
                    <div class="prev-result">
                        <div class="prev-winner">
                            <div class="name">${prev.winnerName}</div>
                            <span class="party-badge" style="background:${winColor}">${ElectionData.getPartyName(prev.winner)}</span>
                            <div class="rate" style="color:${winColor}">${prev.rate}%</div>
                        </div>
                        <div class="prev-vs">VS</div>
                        <div class="prev-winner">
                            <div class="name">${prev.runnerName}</div>
                            <span class="party-badge" style="background:${runColor}">${ElectionData.getPartyName(prev.runner)}</span>
                            <div class="rate" style="color:${runColor}">${prev.runnerRate}%</div>
                        </div>
                    </div>
                    <div class="prev-turnout"><i class="fas fa-person-booth"></i> 투표율: ${prev.turnout}%</div>
                `;
                // 전남광주통합특별시: 전남 이전선거 결과도 표시
                if (regionKey === 'gwangju' && typeof isMergedGwangjuJeonnam === 'function' && isMergedGwangjuJeonnam(electionType)) {
                    const jeonnamRegion = ElectionData.getRegion('jeonnam');
                    const jnPrev = jeonnamRegion?.prevElection;
                    if (jnPrev) {
                        const jnWinColor = ElectionData.getPartyColor(jnPrev.winner);
                        const jnRunColor = ElectionData.getPartyColor(jnPrev.runner);
                        prevHtml += `
                            <div style="margin-top:10px;padding-top:10px;border-top:1px solid rgba(148,163,184,0.15);">
                                <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:6px;">
                                    <i class="fas fa-code-merge"></i> 통합 이전 전라남도
                                </div>
                                <div class="prev-result">
                                    <div class="prev-winner">
                                        <div class="name">${jnPrev.winnerName}</div>
                                        <span class="party-badge" style="background:${jnWinColor}">${ElectionData.getPartyName(jnPrev.winner)}</span>
                                        <div class="rate" style="color:${jnWinColor}">${jnPrev.rate}%</div>
                                    </div>
                                    <div class="prev-vs">VS</div>
                                    <div class="prev-winner">
                                        <div class="name">${jnPrev.runnerName}</div>
                                        <span class="party-badge" style="background:${jnRunColor}">${ElectionData.getPartyName(jnPrev.runner)}</span>
                                        <div class="rate" style="color:${jnRunColor}">${jnPrev.runnerRate}%</div>
                                    </div>
                                </div>
                                ${jnPrev.turnout ? `<div class="prev-turnout"><i class="fas fa-person-booth"></i> 투표율: ${jnPrev.turnout}%</div>` : ''}
                            </div>
                        `;
                    }
                }
                prevContainer.innerHTML = prevHtml;
            } else {
                prevContainer.innerHTML = '';
            }
        }

        // Current officeholder (선거유형별 분기)
        // 재보궐: onByElectionSelected에서 후보 카드로 이미 렌더링
        const govContainer = document.getElementById('current-governor');
        if (govContainer && electionType !== 'byElection') {
            let gov = null;
            let govColor = '';

            if (electionType === 'superintendent') {
                const supt = ElectionData.getSuperintendentData(regionKey);
                if (supt?.currentSuperintendent) {
                    const s = supt.currentSuperintendent;
                    govColor = ElectionData.getSuperintendentColor(s.stance);
                    const sinceText = s.since ? ` ${s.since}년~` : '';
                    let suptHtml = `
                        <div class="governor-info">
                            <div class="governor-avatar" style="background:${govColor}">${s.name.charAt(0)}</div>
                            <div class="governor-details">
                                <div class="name">${s.name}</div>
                                <div class="meta">
                                    <span class="party-badge" style="background:${govColor};display:inline-block;padding:1px 6px;border-radius:3px;font-size:0.7rem;color:white;">${s.stance}</span>
                                    ${sinceText} 현직 교육감
                                </div>
                            </div>
                        </div>
                    `;

                    // 전남광주통합특별시: 전남 교육감도 함께 표시
                    if (regionKey === 'gwangju' && typeof isMergedGwangjuJeonnam === 'function' && isMergedGwangjuJeonnam(electionType)) {
                        const prevJn = supt.previousJeonnamSuperintendent;
                        if (prevJn) {
                            const jnColor = ElectionData.getSuperintendentColor(prevJn.stance);
                            const jnSince = prevJn.since ? ` ${prevJn.since}년~` : '';
                            suptHtml += `
                                <div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(148,163,184,0.15);">
                                    <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:4px;">
                                        <i class="fas fa-code-merge"></i> 통합 이전 전라남도
                                    </div>
                                    <div class="governor-info">
                                        <div class="governor-avatar" style="background:${jnColor}">${prevJn.name.charAt(0)}</div>
                                        <div class="governor-details">
                                            <div class="name">${prevJn.name}</div>
                                            <div class="meta">
                                                <span class="party-badge" style="background:${jnColor};display:inline-block;padding:1px 6px;border-radius:3px;font-size:0.7rem;color:white;">${prevJn.stance}</span>
                                                ${jnSince} 전남 교육감
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            `;
                        }
                    }

                    govContainer.innerHTML = suptHtml;
                } else {
                    govContainer.innerHTML = '';
                }
            } else if (electionType === 'mayor' && districtName) {
                const distSummary = ElectionData.getDistrictSummary(regionKey, districtName);
                const mayorInfo = distSummary?.mayor;
                if (mayorInfo?.name) {
                    const mColor = ElectionData.getPartyColor(mayorInfo.party);
                    const statusText = mayorInfo.acting ? ' 권한대행' : ' 현직';
                    govContainer.innerHTML = `
                        <div class="governor-info">
                            <div class="governor-avatar" style="background:${mColor}">${mayorInfo.name.charAt(0)}</div>
                            <div class="governor-details">
                                <div class="name">${mayorInfo.name}</div>
                                <div class="meta">
                                    <span class="party-badge" style="background:${mColor};display:inline-block;padding:1px 6px;border-radius:3px;font-size:0.7rem;color:white;">${ElectionData.getPartyName(mayorInfo.party)}</span>
                                    ${statusText}
                                </div>
                            </div>
                        </div>
                    `;
                } else if (mayorInfo?.acting) {
                    govContainer.innerHTML = `
                        <div style="padding:8px;color:var(--text-muted);font-size:0.85rem">
                            <i class="fas fa-user-clock"></i> 권한대행 중
                        </div>
                    `;
                } else {
                    govContainer.innerHTML = '';
                }
            } else {
                gov = (ElectionData.getCurrentOfficeholder && ElectionData.getCurrentOfficeholder(regionKey, 'governor')) || region.currentGovernor;
                if (!gov) {
                    govContainer.innerHTML = '';
                } else {
                    govColor = ElectionData.getPartyColor(gov.party);
                    const sinceText = Number.isFinite(Number(gov.since)) ? ` ${gov.since}년~` : '';
                    const statusText = gov.acting ? ' 권한대행' : ' 재임중';
                    let govHtml = `
                        <div class="governor-info">
                            <div class="governor-avatar" style="background:${govColor}">${gov.name.charAt(0)}</div>
                            <div class="governor-details">
                                <div class="name">${gov.name}</div>
                                <div class="meta">
                                    <span class="party-badge" style="background:${govColor};display:inline-block;padding:1px 6px;border-radius:3px;font-size:0.7rem;color:white;">${ElectionData.getPartyName(gov.party)}</span>
                                    ${sinceText}${statusText}
                                </div>
                            </div>
                        </div>
                    `;

                    // 전남광주통합특별시: 전남 도지사도 함께 표시
                    if (regionKey === 'gwangju' && typeof isMergedGwangjuJeonnam === 'function' && isMergedGwangjuJeonnam(electionType)) {
                        const jeonnamRegion = ElectionData.getRegion('jeonnam');
                        const jeonnamGov = jeonnamRegion?.currentGovernor;
                        if (jeonnamGov && jeonnamGov.name) {
                            const jnColor = ElectionData.getPartyColor(jeonnamGov.party);
                            const jnSince = Number.isFinite(Number(jeonnamGov.since)) ? ` ${jeonnamGov.since}년~` : '';
                            govHtml += `
                                <div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(148,163,184,0.15);">
                                    <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:4px;">
                                        <i class="fas fa-code-merge"></i> 통합 이전 전라남도
                                    </div>
                                    <div class="governor-info">
                                        <div class="governor-avatar" style="background:${jnColor}">${jeonnamGov.name.charAt(0)}</div>
                                        <div class="governor-details">
                                            <div class="name">${jeonnamGov.name}</div>
                                            <div class="meta">
                                                <span class="party-badge" style="background:${jnColor};display:inline-block;padding:1px 6px;border-radius:3px;font-size:0.7rem;color:white;">${ElectionData.getPartyName(jeonnamGov.party)}</span>
                                                ${jnSince} 전남도지사
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            `;
                        }
                    }

                    govContainer.innerHTML = govHtml;
                }
            }
        }

        // Key issues
        const issuesContainer = document.getElementById('key-issues');
        if (issuesContainer) {
            issuesContainer.innerHTML = _renderRegionIssuesHtml(regionKey);
        }
    }

    return { render };
})();
