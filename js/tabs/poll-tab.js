// ============================================
// Poll Tab — 여론조사 탭 렌더링
// app.js에서 분리됨
// ============================================

const PollTab = (() => {

    // ── 유틸 (app.js에서 복제 — 최소한만) ──

    function _normalizeKeyword(value) {
        return String(value || '').trim().replace(/\s+/g, ' ');
    }

    function _mergeUniqueArrays(baseArr, overrideArr) {
        return [...new Set([...(baseArr || []), ...(overrideArr || [])])];
    }

    function _getElectionTypeLabel(type) {
        switch (type) {
            case 'governor': return '광역단체장';
            case 'mayor': return '기초단체장';
            case 'superintendent': return '교육감';
            default: return '선거';
        }
    }

    // ── 통합 추세 계산 (가중 이동평균) ──

    function _calcConsensusTrend(polls, windowDays = 21) {
        // KST 기준 cutoff 계산 (CLAUDE.md: 모든 날짜 비교는 getKST 사용)
        const kstNow = (typeof ElectionCalendar !== 'undefined' && ElectionCalendar.getKST)
            ? ElectionCalendar.getKST().getTime() : Date.now();
        const cutoff = kstNow - windowDays * 86400000;
        const recent = polls.filter(p => {
            const d = p.surveyDate?.end || p.publishDate || '';
            return d && Date.parse(d) >= cutoff && p.results?.some(r => r.support > 0);
        });

        if (recent.length < 2) return null;

        const candidateMap = {};
        let totalWeight = 0;
        let totalMargin = 0;

        recent.forEach(p => {
            const surveyEnd = Date.parse(p.surveyDate?.end || p.publishDate || '');
            const recency = Math.max(0.1, 1 - (Date.now() - surveyEnd) / (windowDays * 86400000));
            const sampleWeight = Math.sqrt((p.method?.sampleSize || 500) / 1000);
            const weight = recency * sampleWeight;
            totalWeight += weight;
            totalMargin += (p.method?.marginOfError || 3) * weight;

            (p.results || []).forEach(r => {
                if (!r.candidateName || r.support <= 0) return;
                if (!candidateMap[r.candidateName]) candidateMap[r.candidateName] = { sum: 0, weight: 0 };
                candidateMap[r.candidateName].sum += r.support * weight;
                candidateMap[r.candidateName].weight += weight;
            });
        });

        const estimates = {};
        for (const [name, data] of Object.entries(candidateMap)) {
            if (data.weight > 0) estimates[name] = data.sum / data.weight;
        }

        if (Object.keys(estimates).length < 2) return null;

        return { estimates, pollCount: recent.length, windowDays, avgMargin: totalWeight > 0 ? totalMargin / totalWeight : 3 };
    }

    function _findCandidateParty(polls, candidateName) {
        for (const p of polls) {
            const r = (p.results || []).find(r => r.candidateName === candidateName);
            if (r?.party) return r.party;
        }
        return 'independent';
    }

    // ── 돌출 조사 감지 ──

    function _detectOutliers(polls) {
        const withResults = polls.filter(p => p.results?.length >= 2 && p.results.some(r => r.support > 0));
        if (withResults.length < 4) return { outlierIds: new Set() };

        const gaps = withResults.map(p => {
            const sorted = [...p.results].filter(r => r.support > 0).sort((a, b) => b.support - a.support);
            return { nttId: p.nttId, gap: sorted.length >= 2 ? sorted[0].support - sorted[1].support : 0 };
        });

        const n = gaps.length;
        if (n < 3) return { outlierIds: new Set() }; // 표본 3건 미만이면 돌출 감지 불가
        const avgGap = gaps.reduce((s, g) => s + g.gap, 0) / n;
        const sdGap = Math.sqrt(gaps.reduce((s, g) => s + Math.pow(g.gap - avgGap, 2), 0) / (n - 1)); // 표본 표준편차

        const outlierIds = new Set();
        if (sdGap > 0) {
            gaps.forEach(g => {
                const z = Math.abs(g.gap - avgGap) / sdGap;
                if (z >= 2.0) outlierIds.add(g.nttId);
            });
        }

        return { outlierIds };
    }

    function _getPollHeaderTitle(regionKey, electionType, districtName) {
        const region = ElectionData.getRegion(regionKey);
        const regionName = region?.name || '';
        if (electionType === 'mayor' && districtName) {
            return `${districtName} ${_getElectionTypeLabel(electionType)}`;
        }
        return `${regionName} ${_getElectionTypeLabel(electionType)}`.trim();
    }

    function _getFallbackCandidateNames(regionKey, electionType, districtName) {
        if (electionType === 'governor') {
            return (ElectionData.getRegion(regionKey)?.candidates || []).map(c => c.name).filter(Boolean);
        }
        if (electionType === 'superintendent') {
            return (ElectionData.getSuperintendentData(regionKey)?.candidates || []).map(c => c.name).filter(Boolean);
        }
        if (electionType === 'mayor' && districtName) {
            const summary = ElectionData.getDistrictSummary?.(regionKey, districtName);
            return summary?.mayor?.name ? [summary.mayor.name] : [];
        }
        return [];
    }

    function _buildPollTrendChart(polls, regionKey, electionType, districtName) {
        const forcedReferenceRegions = {
            governor: new Set(['gwangju', 'jeju', 'gyeongnam']),
            superintendent: new Set(['busan', 'daegu', 'incheon', 'daejeon'])
        };
        const forcedTrendRegions = {
            superintendent: new Set(['gyeongbuk', 'gyeongnam'])
        };
        const counts = new Map();
        const latestSupport = new Map();
        const officialFallbackNames = _getFallbackCandidateNames(regionKey, electionType, districtName);
        const supplementalPollNames = ElectionData.getPollCandidates?.(regionKey, electionType, districtName)?.map(c => c.name) || [];
        const forceTrend = forcedTrendRegions[electionType]?.has(regionKey);

        let cleanSupplemental = supplementalPollNames;
        if (electionType === 'superintendent') {
            const governorNames = new Set((ElectionData.getRegion(regionKey)?.candidates || []).map(c => c.name).filter(Boolean));
            const freqMap = new Map();
            polls.forEach(poll => {
                const seen = new Set();
                (poll.results || []).forEach(r => {
                    const name = _normalizeKeyword(r?.candidateName || '');
                    if (name && !seen.has(name)) { seen.add(name); freqMap.set(name, (freqMap.get(name) || 0) + 1); }
                });
            });
            cleanSupplemental = supplementalPollNames.filter(name =>
                !governorNames.has(name) && (freqMap.get(name) || 0) >= 2
            );
        }
        const knownNames = new Set(
            forceTrend && cleanSupplemental.length >= 2
                ? _mergeUniqueArrays(cleanSupplemental, officialFallbackNames)
                : officialFallbackNames.length
                    ? officialFallbackNames
                    : _mergeUniqueArrays(officialFallbackNames, cleanSupplemental)
        );

        polls.forEach(poll => {
            (poll.results || []).forEach(result => {
                const name = _normalizeKeyword(result?.candidateName || '');
                if (!name || !Number.isFinite(Number(result?.support))) return;
                if ((electionType === 'governor' || electionType === 'superintendent') && knownNames.size && !knownNames.has(name)) {
                    return;
                }
                counts.set(name, (counts.get(name) || 0) + 1);
                if (!latestSupport.has(name)) latestSupport.set(name, Number(result.support) || 0);
            });
        });

        const labels = [...counts.keys()].sort((a, b) => {
            const countDiff = (counts.get(b) || 0) - (counts.get(a) || 0);
            if (countDiff !== 0) return countDiff;
            return (latestSupport.get(b) || 0) - (latestSupport.get(a) || 0);
        }).slice(0, 5);

        const forceReference = forcedReferenceRegions[electionType]?.has(regionKey);
        const allowLineTrend = (forceTrend || !forceReference) && labels.length >= 2 && (
            electionType !== 'superintendent'
            || officialFallbackNames.length >= 2
            || forceTrend
        );

        if (allowLineTrend) {
            return { type: 'line', datasetLabels: labels };
        }

        if (electionType === 'governor' || electionType === 'superintendent') {
            const fallbackCandidates = _mergeUniqueArrays(
                labels,
                officialFallbackNames.length ? officialFallbackNames : supplementalPollNames
            ).slice(0, 5);

            if (fallbackCandidates.length >= 2 || polls.length) {
                return { type: 'bar', datasetLabels: ['참고 지지율'], labels: fallbackCandidates };
            }
        }

        return null;
    }

    function buildSelection(testCase) {
        const regionKey = testCase.regionKey;
        const electionType = testCase.electionType || 'governor';
        const districtName = testCase.districtName || null;
        const polls = ElectionData.getPollsForSelection(regionKey, electionType, districtName);
        const firstPoll = polls[0] || null;
        const municipalities = [...new Set(polls.map(poll => _normalizeKeyword(poll.municipality)).filter(Boolean))];
        const headerTitle = _getPollHeaderTitle(regionKey, electionType, districtName);

        if (electionType === 'mayor' && !districtName) {
            return {
                polls, count: polls.length, municipalities, headerTitle,
                chartMode: 'activity', chartReason: 'activity',
                chart: { type: 'bar', datasetLabels: ['조사 수'], labels: municipalities },
                firstPoll
            };
        }

        const chart = _buildPollTrendChart(polls, regionKey, electionType, districtName);
        const chartReason = !chart ? 'no-candidate-results'
            : chart.type === 'line' ? 'trend' : 'reference-support';

        return {
            polls, count: polls.length, municipalities, headerTitle,
            chartMode: 'trend', chartReason, chart, firstPoll
        };
    }

    // ── 메인 렌더 ──

    function render(regionKey, electionType, districtName) {
        if (typeof ElectionData === 'undefined' || typeof ChartsModule === 'undefined') return;
        ChartsModule.destroyCharts();

        const latestSection = document.getElementById('poll-latest-section');
        const trendsSection = document.getElementById('poll-trends-section');
        const cardsSection = document.getElementById('poll-cards-section');

        if (!latestSection || !trendsSection || !cardsSection) return;

        // Layer 2A: 공표금지 체크 (법적 필수)
        if (typeof ElectionCalendar !== 'undefined' && ElectionCalendar.isPublicationBanned()) {
            latestSection.style.display = 'none';
            trendsSection.innerHTML = '';
            cardsSection.innerHTML = `
                <div class="poll-ban-notice">
                    <i class="fas fa-gavel"></i>
                    <h4>여론조사 공표금지 기간</h4>
                    <p>공직선거법 제108조에 따라<br>여론조사 결과를 표시할 수 없습니다.</p>
                    <div class="poll-ban-period">5월 28일 00:00 ~ 6월 3일 18:00</div>
                    <small>위반 시 3년 이하 징역 또는 600만원 이하 벌금</small>
                </div>
            `;
            return;
        }

        const polls = ElectionData.getLatestPollsForDisplay(regionKey, electionType, districtName);

        // 초기화
        latestSection.style.display = 'none';
        trendsSection.innerHTML = '';
        cardsSection.innerHTML = '';

        // 교육감: 성향(진보/보수/중도) 기반 컬러 매핑
        if (electionType === 'superintendent') {
            polls.forEach(p => {
                (p.results || []).forEach(r => {
                    if (!r.party && r.candidateName) {
                        const stance = ElectionData.getSuperintendentStance(regionKey, r.candidateName);
                        if (stance) {
                            r._stanceColor = ElectionData.getSuperintendentColor(stance);
                            r._stanceLabel = stance;
                        }
                    }
                });
            });
        }

        if (!polls.length) {
            let emptyMsg = '';
            if (electionType === 'byElection') {
                emptyMsg = '<p>이 선거구의 여론조사가 아직 등록되지 않았습니다.</p><p style="margin-top:8px;color:var(--text-muted);font-size:0.8rem;"><i class="fas fa-info-circle"></i> 재보궐 여론조사는 지방선거 여론조사와 별개입니다.</p>';
            } else if (electionType === 'superintendent') {
                emptyMsg = '<p>이 지역의 교육감 여론조사가 아직 등록되지 않았습니다.</p>';
            } else if (electionType === 'mayor' && districtName) {
                const region = ElectionData.getRegion(regionKey);
                const regionName = region?.name || '';
                emptyMsg = `<p>이 지역의 기초단체장 여론조사가 아직 없습니다.</p><p style="margin-top:4px;color:var(--text-muted);font-size:0.8rem;">${regionName} 전체 여론조사를 확인해보세요.</p>`;
            } else {
                emptyMsg = '<p>이 지역에 등록된 여론조사가 아직 없습니다.</p>';
            }
            cardsSection.innerHTML = `<div class="district-no-data">${emptyMsg}<p style="margin-top:6px"><a href="https://www.nesdc.go.kr/" target="_blank" rel="noopener" style="color:var(--accent-blue)">여심위에서 직접 확인하기</a></p></div>`;
            return;
        }

        // ── 0. 통합 추세 요약 (가중 이동평균) ──
        latestSection.style.display = 'none';
        const consensusSummary = _calcConsensusTrend(polls);
        if (consensusSummary) {
            const summaryCard = document.createElement('div');
            summaryCard.className = 'poll-result-card';
            summaryCard.style.cssText = 'margin-bottom:var(--space-16);padding:0;background:transparent;';

            const sorted = Object.entries(consensusSummary.estimates).sort((a, b) => b[1] - a[1]);
            const maxEst = sorted.length > 0 ? sorted[0][1] : 1;
            const avgMargin = consensusSummary.avgMargin || 3;

            const [leaderName, leaderPct] = sorted[0] || ['', 0];
            const leaderCand = _findCandidateParty(polls, leaderName);
            const leaderColor = leaderCand ? ElectionData.getPartyColor(leaderCand) : 'var(--text-muted)';
            const leaderParty = leaderCand ? ElectionData.getPartyName(leaderCand) : '';

            const restBars = sorted.slice(1).map(([name, support]) => {
                const cand = _findCandidateParty(polls, name);
                const pc = cand ? ElectionData.getPartyColor(cand) : 'var(--text-muted)';
                const barW = maxEst > 0 ? (support / maxEst * 100) : 0;
                return `<div class="poll-card-result">
                    <div class="poll-card-result-info">
                        <span class="poll-card-candidate" style="font-size:var(--text-body);">${name}</span>
                        <span class="poll-card-support" style="font-size:var(--text-body);">${support.toFixed(1)}%</span>
                    </div>
                    <div class="poll-card-bar-bg">
                        <div class="poll-card-bar" style="width:${barW}%;background:${pc};"></div>
                    </div>
                </div>`;
            }).join('');

            let gapBadge = '';
            if (sorted.length >= 2) {
                const gap = sorted[0][1] - sorted[1][1];
                if (gap <= avgMargin * 2) {
                    gapBadge = `<span style="font-size:var(--text-micro);font-weight:var(--font-bold);padding:2px 8px;border-radius:4px;background:rgba(245,158,11,0.15);color:#F59E0B;">접전</span>
                        <span style="font-size:var(--text-caption);color:var(--text-muted);">격차 ${gap.toFixed(1)}%p · ±${avgMargin.toFixed(1)}%p 내</span>`;
                } else {
                    gapBadge = `<span style="font-size:var(--text-micro);font-weight:var(--font-bold);padding:2px 8px;border-radius:4px;background:rgba(34,197,94,0.15);color:#22C55E;">우세</span>
                        <span style="font-size:var(--text-caption);color:var(--text-muted);">격차 ${(sorted[0][1]-sorted[1][1]).toFixed(1)}%p</span>`;
                }
            }

            summaryCard.innerHTML = `
                <div class="poll-consensus-hero">
                    <div class="poll-consensus-leader" style="border-left-color:${leaderColor};">
                        <div class="poll-consensus-leader-meta">여론조사 종합 · 최근 ${consensusSummary.windowDays}일 · ${consensusSummary.pollCount}건 집계</div>
                        <div class="poll-consensus-leader-name">${leaderName}</div>
                        <div class="poll-consensus-leader-party" style="color:${leaderColor};">${leaderParty}</div>
                        <div class="poll-consensus-leader-pct" style="color:${leaderColor};">${leaderPct.toFixed(1)}%</div>
                        ${gapBadge ? `<div style="margin-top:var(--space-8);display:flex;align-items:center;gap:var(--space-6);">${gapBadge}</div>` : ''}
                    </div>
                    ${restBars ? `<div class="poll-consensus-bar-section">
                        <div class="poll-consensus-bar-label">다른 후보</div>
                        ${restBars}
                    </div>` : ''}
                </div>
                <div style="font-size:var(--text-micro);color:var(--text-disabled);padding:0 4px;">등록 여론조사 기반 가중 집계 (참고용, 예측 아님)</div>
            `;
            trendsSection.appendChild(summaryCard);
        }

        // ── 1. 돌출 조사 감지 ──
        const outlierInfo = _detectOutliers(polls);

        // ── 2. 추이 차트 (같은 기관 2회 이상) ──
        const trendGroups = ElectionData.getTrendGroups(regionKey, electionType, districtName);
        if (trendGroups.length > 0) {
            const maxTrends = 3;
            const visibleGroups = trendGroups.slice(0, maxTrends);

            visibleGroups.forEach((group, i) => {
                const card = document.createElement('div');
                card.className = 'panel-card poll-trend-card';
                const trendTitle = group._merged
                    ? `<i class="fas fa-chart-line"></i> 지지율 추이 (${group.polls.length}건, 기관 통합)`
                    : `<i class="fas fa-chart-line"></i> ${group.pollOrg} 추이 (${group.polls.length}회 조사)`;
                card.innerHTML = `
                    <h4>${trendTitle}</h4>
                    <canvas id="poll-trend-dynamic-${i}"></canvas>
                `;
                trendsSection.appendChild(card);

                setTimeout(() => ChartsModule.renderPollTrendChart(group, `poll-trend-dynamic-${i}`), 100 + i * 50);
            });

            if (trendGroups.length > maxTrends) {
                const moreBtn = document.createElement('button');
                moreBtn.className = 'poll-more-btn';
                moreBtn.textContent = `추이 차트 ${trendGroups.length - maxTrends}개 더 보기`;
                moreBtn.onclick = () => {
                    moreBtn.remove();
                    trendGroups.slice(maxTrends).forEach((group, i) => {
                        const idx = maxTrends + i;
                        const card = document.createElement('div');
                        card.className = 'panel-card poll-trend-card';
                        card.innerHTML = `
                            <h4><i class="fas fa-chart-line"></i> ${group.pollOrg} 추이 (${group.polls.length}회 조사)</h4>
                            <canvas id="poll-trend-dynamic-${idx}"></canvas>
                        `;
                        trendsSection.appendChild(card);
                        setTimeout(() => ChartsModule.renderPollTrendChart(group, `poll-trend-dynamic-${idx}`), 50 + i * 50);
                    });
                };
                trendsSection.appendChild(moreBtn);
            }
        }

        // ── 3. 전체 여론조사 카드 목록 (최신순) ──
        const cardListHtml = polls.map(poll => {
            const method = poll.method || {};
            const surveyStart = poll.surveyDate?.start || '';
            const surveyEnd = poll.surveyDate?.end || '';
            const publishDate = poll.publishDate || '';
            const dateText = surveyStart && surveyEnd
                ? `${surveyStart}~${surveyEnd} 조사`
                : (publishDate ? `${publishDate} 공표` : '일시 미상');

            let resultsHtml = '';
            if (poll.results && poll.results.length > 0) {
                const validResults = poll.results.filter(r => r.candidateName && r.support > 0);
                if (validResults.length > 0) {
                    const maxSupport = Math.max(...validResults.map(r => r.support));
                    resultsHtml = validResults
                        .sort((a, b) => b.support - a.support)
                        .map(r => {
                            const pc = r._stanceColor || ElectionData.getPartyColor(r.party || 'independent');
                            const pn = r._stanceLabel || ElectionData.getPartyName(r.party || 'independent');
                            const barWidth = maxSupport > 0 ? (r.support / maxSupport * 100) : 0;
                            return `<div class="poll-card-result">
                                <div class="poll-card-result-info">
                                    <span class="poll-card-candidate">${r.candidateName}</span>
                                    <span class="poll-card-party" style="color:${pc}">${pn}</span>
                                    <span class="poll-card-support">${r.support}%</span>
                                </div>
                                <div class="poll-card-bar-bg">
                                    <div class="poll-card-bar" style="width:${barWidth}%;background:${pc}"></div>
                                </div>
                            </div>`;
                        }).join('');
                }
            }

            if (!resultsHtml) {
                resultsHtml = '<div class="poll-card-no-result">결과 상세는 여심위 원본에서 확인하세요</div>';
            }

            const sourceUrl = poll.sourceUrl || `https://www.nesdc.go.kr/portal/bbs/B0000005/view.do?nttId=${poll.nttId}&menuNo=200467`;

            const isOutlier = outlierInfo.outlierIds?.has(poll.nttId);
            const methodBadge = method.type === 'ARS'
                ? '<span class="poll-card-method" style="background:rgba(99,102,241,0.12);color:#818cf8;">ARS</span>'
                : method.type === '전화면접'
                    ? '<span class="poll-card-method" style="background:rgba(34,197,94,0.1);color:#4ade80;">전화면접</span>'
                    : '';

            const nesdcNum = poll.nttId || poll.nesdcId || '';
            const nesdcBadge = nesdcNum
                ? (poll.sourceUrl
                    ? `<a href="${sourceUrl}" target="_blank" rel="noopener" class="poll-card-nesdc-badge" style="display:inline-block;font-size:0.65rem;padding:1px 6px;border-radius:3px;background:rgba(59,130,246,0.12);color:#60a5fa;text-decoration:none;font-weight:600;letter-spacing:0.02em;">NESDC #${nesdcNum}</a>`
                    : `<span class="poll-card-nesdc-badge" style="display:inline-block;font-size:0.65rem;padding:1px 6px;border-radius:3px;background:rgba(59,130,246,0.12);color:#60a5fa;font-weight:600;letter-spacing:0.02em;">NESDC #${nesdcNum}</span>`)
                : '<span class="poll-card-nesdc-badge" style="display:inline-block;font-size:0.65rem;padding:1px 6px;border-radius:3px;background:rgba(148,163,184,0.1);color:var(--text-muted);font-style:italic;">등록번호 미확인</span>';

            return `<div class="poll-result-card${isOutlier ? ' poll-outlier' : ''}">
                <div style="margin-bottom:4px;">${nesdcBadge}</div>
                ${isOutlier ? '<div style="padding:var(--space-4) var(--space-8);font-size:var(--text-micro);color:var(--color-warning);margin-bottom:var(--space-8);"><i class="fas fa-exclamation-triangle" style="margin-right:var(--space-4);"></i>돌출 조사 — 다른 조사 평균과 크게 다릅니다</div>' : ''}
                <div class="poll-card-header">
                    <span class="poll-card-org">${poll.pollOrg || '조사기관 미상'}</span>
                    ${methodBadge}
                    ${method.sampleSize ? `<span class="poll-card-sample">n=${method.sampleSize.toLocaleString()}</span>` : ''}
                </div>
                ${poll.clientOrg ? `<div class="poll-card-client" style="color:var(--text-muted);font-size:0.75rem;margin-top:2px;">의뢰: ${poll.clientOrg}</div>` : ''}
                <div class="poll-card-date">${dateText}${publishDate ? ` / ${publishDate} 공표` : ''}</div>
                ${method.marginOfError ? `<div class="poll-card-margin${method.marginOfError >= 5 ? ' poll-card-margin-warn' : ''}">오차범위 ±${method.marginOfError}%p (95% 신뢰수준)${method.sampleSize && method.sampleSize < 500 ? ' · 소규모 표본' : ''}</div>` : ''}
                <div class="poll-card-results">${resultsHtml}</div>
                ${(() => {
                    if (!method.marginOfError || !poll.results || poll.results.length < 2) return '';
                    const sorted = [...poll.results]
                        .filter(r => r.candidateName && r.support > 0)
                        .sort((a, b) => b.support - a.support);
                    if (sorted.length < 2) return '';
                    const gap = sorted[0].support - sorted[1].support;
                    const doubleMargin = method.marginOfError * 2;
                    if (gap <= doubleMargin) {
                        return `<div class="poll-card-interpretation" style="padding:6px 8px;margin-top:6px;border-radius:4px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);font-size:0.75rem;color:var(--text-secondary);"><i class="fas fa-exclamation-triangle" style="color:#f59e0b;margin-right:4px;"></i>두 후보의 격차(${gap.toFixed(1)}%p)는 오차범위(±${method.marginOfError}%p) 안이므로 통계적으로 우열을 가릴 수 없습니다.</div>`;
                    }
                    return '';
                })()}
                <div class="poll-card-footer">
                    <a href="${sourceUrl}" target="_blank" rel="noopener"><i class="fas fa-external-link-alt"></i> 여심위 원본 보기</a>
                </div>
            </div>`;
        }).join('');

        cardsSection.innerHTML = `
            <div class="poll-cards-header">
                <h4><i class="fas fa-list"></i> 전체 여론조사 ${polls.length}건</h4>
            </div>
            <div class="poll-cards-list">${cardListHtml}</div>
        `;
    }

    return { render, buildSelection };
})();
