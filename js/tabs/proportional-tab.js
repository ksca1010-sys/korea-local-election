/**
 * ProportionalTab — 광역비례 + 기초비례 탭 렌더러
 * 비례대표 특성: 후보가 아닌 정당에 투표, 정당지지도 활용, 명부 등록은 5/14~15.
 */
const ProportionalTab = (() => {

    const CANDIDATE_REG_END = new Date('2026-05-15T18:00:00+09:00');
    let _currentDistrictName = null;
    let _historyCache = null;

    function getKST() {
        if (typeof ElectionCalendar !== 'undefined' && ElectionCalendar.getKST) return ElectionCalendar.getKST();
        return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
    }

    function getLabel(t) { return t === 'councilProportional' ? '광역의원 비례대표' : '기초의원 비례대표'; }

    function loadHistory() {
        if (_historyCache) return Promise.resolve(_historyCache);
        return fetch('data/proportional_history.json')
            .then(r => r.ok ? r.json() : null)
            .then(d => { _historyCache = d; return d; })
            .catch(() => null);
    }

    function getHistoryData(regionKey, electionType) {
        if (!_historyCache) return null;
        if (electionType === 'councilProportional') {
            return _historyCache.council_proportional?.[regionKey] || null;
        }
        // 기초비례: 시군구 단위
        if (_currentDistrictName) {
            return _historyCache.local_council_proportional?.[regionKey]?.[_currentDistrictName] || null;
        }
        return null;
    }

    // ── 메인 ──

    function render(tabName, regionKey, districtName, electionType) {
        _currentDistrictName = districtName;
        switch (tabName) {
            case 'overview':   renderOverview(regionKey, electionType); break;
            case 'polls':      renderPolls(regionKey, electionType); break;
            case 'candidates': renderCandidates(regionKey, electionType); break;
            case 'news':       renderNews(regionKey, electionType); break;
            case 'history':    renderHistory(regionKey, electionType); break;
        }
    }

    // ══════════════════════════════════════
    // 개요탭
    // ══════════════════════════════════════

    function renderOverview(regionKey, electionType) {
        const region = ElectionData.getRegion(regionKey);
        const regionName = region?.name || '';
        const label = getLabel(electionType);

        // 즉시 렌더
        _buildOverview(regionKey, electionType, label, regionName);

        // 데이터 로드 후 재렌더
        Promise.all([
            ElectionData.loadProportionalCandidates?.() || Promise.resolve(),
            electionType === 'councilProportional'
                ? (ElectionData.loadProportionalCouncilData?.() || Promise.resolve())
                : (ElectionData.loadProportionalLocalCouncilData?.() || Promise.resolve()),
            loadHistory(),
        ]).then(() => _buildOverview(regionKey, electionType, label, regionName));
    }

    function _buildOverview(regionKey, electionType, label, regionName) {
        const propData = ElectionData.getProportionalData?.(regionKey, electionType, _currentDistrictName);
        const totalSeats = propData?.totalSeats || (electionType === 'councilProportional' ? 10 : 2);
        const displayName = _currentDistrictName ? `${_currentDistrictName} ${label}` : `${regionName} ${label}`;
        const histData = getHistoryData(regionKey, electionType);

        const prevContainer = document.getElementById('prev-election-result');
        if (!prevContainer) return;

        const isMetro = electionType === 'councilProportional';
        const typeDesc = isMetro
            ? '광역의회(시·도의회) 비례대표는 지역구 투표와 별도로 정당에 투표하여, 정당 득표율에 따라 의석을 배분하는 제도입니다.'
            : '기초의회(구·시·군의회) 비례대표는 지역구 투표와 별도로 정당에 투표하여, 정당 득표율에 따라 의석을 배분하는 제도입니다.';

        prevContainer.innerHTML = `
            <div style="padding:14px;border-radius:10px;background:var(--bg-secondary);border:1px solid var(--border-color);">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
                    <i class="fas fa-landmark" style="color:var(--accent-primary);font-size:1.1rem;"></i>
                    <span style="font-size:0.95rem;font-weight:600;color:var(--text-primary);">${isMetro ? '광역의원' : '기초의원'} 비례대표</span>
                </div>
                <p style="color:var(--text-secondary);font-size:0.82rem;line-height:1.6;margin-bottom:12px;">
                    ${typeDesc}
                </p>
                <div style="display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:8px;background:var(--accent-primary)08;border:1px solid var(--accent-primary)22;">
                    <div style="text-align:center;">
                        <div style="font-size:1.4rem;font-weight:700;color:var(--accent-primary);">${totalSeats}</div>
                        <div style="font-size:0.7rem;color:var(--text-muted);">배분 의석</div>
                    </div>
                    <div style="width:1px;height:28px;background:var(--border-color);"></div>
                    <div style="font-size:0.78rem;color:var(--text-muted);line-height:1.5;">
                        ${_currentDistrictName ? `${_currentDistrictName}` : regionName} 지역<br>
                        정당 득표율 비례배분 (5% 봉쇄조항)
                    </div>
                </div>
            </div>
        `;

        // ── 현직 비례대표 의원 → "현직자 정보" 박스에 표시 ──
        const govContainer = document.getElementById('current-governor');
        if (govContainer) {
            const incumbents = histData?.incumbents || {};
            const propCandidates = ElectionData.getProportionalCandidates?.(regionKey, electionType);

            const partyGroups = Object.keys(incumbents).length > 0
                ? Object.entries(incumbents).sort((a, b) => b[1].length - a[1].length)
                : (propCandidates?.parties || []).filter(p => p.candidates?.length).map(p => [
                    ElectionData.getPartyName(p.party), p.candidates
                ]);

            if (partyGroups.length > 0) {
                let govHtml = '';
                partyGroups.forEach(([partyName, members]) => {
                    const pc = ElectionData.getPartyColor(_partyNameToKey(partyName));
                    govHtml += `
                        <div style="margin-bottom:8px;padding:8px 10px;border-radius:6px;background:var(--bg-secondary);border-left:3px solid ${pc};">
                            <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
                                <span style="width:8px;height:8px;border-radius:50%;background:${pc};flex-shrink:0;"></span>
                                <span style="font-weight:600;font-size:0.85rem;color:${pc};">${partyName}</span>
                                <span style="color:var(--text-muted);font-size:0.75rem;">(${members.length}석)</span>
                            </div>
                            <div style="color:var(--text-secondary);font-size:0.82rem;line-height:1.6;padding-left:14px;">
                                ${members.map(m => m.name).join(' · ')}
                            </div>
                        </div>
                    `;
                });
                govContainer.innerHTML = govHtml;
            } else {
                govContainer.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">현직 비례대표 의원 정보가 없습니다.</p>';
            }
        }
    }

    function _partyNameToKey(name) {
        const map = {
            // 현행 정당
            '더불어민주당':'democratic','국민의힘':'ppp','정의당':'justice',
            '진보당':'progressive','무소속':'independent','조국혁신당':'reform',
            '개혁신당':'newReform','기본소득당':'basicIncome',
            // 역대 보수 계열
            '한나라당':'ppp','새누리당':'ppp','자유한국당':'ppp','친박연합':'ppp',
            // 역대 민주 계열
            '민주당':'democratic','새정치민주연합':'democratic','민주평화당':'democratic',
            // 역대 진보 계열
            '민주노동당':'progressive','통합진보당':'progressive',
            // 역대 중도/기타
            '바른미래당':'newReform','자유선진당':'independent','국민참여당':'democratic',
        };
        return map[name] || 'independent';
    }

    // ══════════════════════════════════════
    // 여론조사탭 — 정당지지도만
    // ══════════════════════════════════════

    function renderPolls(regionKey, electionType) {
        const cardsSection = document.getElementById('poll-cards-section');
        const latestSection = document.getElementById('poll-latest-section');
        const trendsSection = document.getElementById('poll-trends-section');

        if (latestSection) latestSection.style.display = 'none';
        if (trendsSection) trendsSection.innerHTML = '';

        if (typeof ElectionCalendar !== 'undefined' && ElectionCalendar.isPublicationBanned()) {
            if (cardsSection) cardsSection.innerHTML = `
                <div class="poll-ban-notice"><i class="fas fa-gavel"></i>
                <h4>여론조사 공표금지 기간</h4>
                <p>공직선거법 제108조에 따라 여론조사 결과를 표시할 수 없습니다.</p></div>`;
            return;
        }

        const partyPolls = ElectionData.getPartySupport?.(regionKey) || [];

        if (!cardsSection) return;

        if (partyPolls.length > 0) {
            // 한줄 요약
            const insight = _generatePartySupportInsight(partyPolls);
            let html = '';
            if (insight) {
                html += `
                    <div style="padding:10px 12px;margin-bottom:12px;border-radius:8px;background:${insight.badgeColor}10;border:1px solid ${insight.badgeColor}33;">
                        <span style="font-size:0.7rem;padding:1px 6px;border-radius:3px;background:${insight.badgeColor};color:white;margin-right:6px;">${insight.badge}</span>
                        <span style="font-size:0.82rem;color:var(--text-primary);">${insight.text}</span>
                        <div style="font-size:0.7rem;color:var(--text-muted);margin-top:4px;">
                            ${insight.source.org} ${insight.source.date} | n=${insight.source.sampleSize?.toLocaleString() || '?'} | ±${insight.source.marginOfError || '?'}%p
                        </div>
                    </div>
                `;
            }

            html += `<div class="poll-cards-header"><h4><i class="fas fa-list"></i> 정당지지도 ${partyPolls.length}건</h4></div>`;
            html += partyPolls.map(poll => _renderPartySupportCard(poll)).join('');
            cardsSection.innerHTML = html;
        } else {
            cardsSection.innerHTML = `
                <div class="district-no-data">
                    <p>해당 지역의 정당지지도 조사가 아직 없습니다.</p>
                    <p style="margin-top:8px;color:var(--text-muted);font-size:0.8rem;">전국 정당지지도를 참고하세요.</p>
                    <p style="margin-top:6px"><a href="https://www.nesdc.go.kr/" target="_blank" rel="noopener" style="color:var(--accent-blue);">여심위에서 직접 확인하기</a></p>
                </div>`;
        }
    }

    function _generatePartySupportInsight(polls) {
        const latest = polls.filter(p => p.results?.some(r => r.support > 0))
            .sort((a, b) => Date.parse(b.publishDate || 0) - Date.parse(a.publishDate || 0))[0];
        if (!latest?.results) return null;

        const sorted = latest.results
            .filter(r => r.candidateName && r.support > 0 && !['모르겠다','무응답','없음'].includes(r.candidateName))
            .sort((a, b) => b.support - a.support);
        if (sorted.length < 2) return null;

        const gap = sorted[0].support - sorted[1].support;
        const moe = latest.method?.marginOfError || 3.5;
        let badge, badgeColor, text;

        if (gap <= moe) {
            badge = '접전'; badgeColor = '#f59e0b';
            text = `${sorted[0].candidateName} vs ${sorted[1].candidateName} — 오차범위 내`;
        } else if (gap <= moe * 2) {
            badge = '경합'; badgeColor = '#00bcd4';
            text = `${sorted[0].candidateName} ${gap.toFixed(1)}%p 앞서`;
        } else {
            badge = '우세'; badgeColor = '#22c55e';
            text = `${sorted[0].candidateName} ${gap.toFixed(1)}%p 우세`;
        }

        return { badge, badgeColor, text, source: {
            org: latest.pollOrg, date: latest.publishDate,
            sampleSize: latest.method?.sampleSize, marginOfError: moe
        }};
    }

    function _renderPartySupportCard(poll) {
        const results = (poll.results || []).filter(r => r.candidateName && r.support > 0);
        if (!results.length) return '';

        const maxSupport = Math.max(...results.map(r => r.support));
        const dateText = poll.publishDate || '일시 미상';
        const methodBadge = poll.method?.type === 'ARS'
            ? '<span style="background:#6366f122;color:#818cf8;border:1px solid #6366f133;padding:0 5px;border-radius:3px;font-size:0.65rem;">ARS</span>'
            : poll.method?.type === '전화면접'
                ? '<span style="background:#22c55e15;color:#4ade80;border:1px solid #22c55e33;padding:0 5px;border-radius:3px;font-size:0.65rem;">전화면접</span>'
                : '';

        return `
            <div class="poll-result-card">
                <div class="poll-card-header">
                    <span class="poll-card-org">${poll.pollOrg || '조사기관 미상'}</span>
                    ${methodBadge}
                    <span style="font-size:0.7rem;color:var(--text-muted);">정당지지도</span>
                </div>
                <div class="poll-card-date">${dateText}</div>
                <div class="poll-card-results">
                    ${results.sort((a, b) => b.support - a.support).map(r => {
                        const pc = ElectionData.getPartyColor(_partyNameToKey(r.candidateName) || r.party || 'independent');
                        const barW = maxSupport > 0 ? (r.support / maxSupport * 100) : 0;
                        return `<div class="poll-card-result">
                            <div class="poll-card-result-info">
                                <span class="poll-card-candidate">${r.candidateName}</span>
                                <span class="poll-card-support">${r.support}%</span>
                            </div>
                            <div class="poll-card-bar-bg">
                                <div class="poll-card-bar" style="width:${barW}%;background:${pc}"></div>
                            </div>
                        </div>`;
                    }).join('')}
                </div>
                <div class="poll-card-footer">
                    <a href="${poll.sourceUrl || 'https://www.nesdc.go.kr/'}" target="_blank" rel="noopener"><i class="fas fa-external-link-alt"></i> 여심위 원본 보기</a>
                </div>
            </div>
        `;
    }

    // ══════════════════════════════════════
    // 후보자탭 — 현행 유지
    // ══════════════════════════════════════

    function renderCandidates(regionKey, electionType) {
        const container = document.getElementById('candidates-list');
        if (!container) return;

        if (getKST() < CANDIDATE_REG_END) {
            container.innerHTML = `<div class="district-no-data">
                <p><i class="fas fa-clipboard-list"></i> 비례대표 후보 명부는 후보자 등록 기간(5/14~15)에 확정됩니다.</p>
                <p style="margin-top:8px;color:var(--text-muted);font-size:0.85rem;">현재 각 정당의 비례대표 공천 과정이 진행 중입니다.</p>
            </div>`;
            return;
        }

        const data = ElectionData.getProportionalCandidates?.(regionKey, electionType);
        if (!data?.parties?.length) {
            container.innerHTML = `<div class="district-no-data"><p>비례대표 후보 명부 데이터를 준비 중입니다.</p></div>`;
            return;
        }

        container.innerHTML = data.parties.map(party => {
            const pc = ElectionData.getPartyColor(party.party);
            const pn = ElectionData.getPartyName(party.party);
            return `
                <div style="margin-bottom:16px;border-radius:8px;overflow:hidden;border:1px solid var(--border-color);">
                    <div style="padding:8px 12px;background:${pc}15;border-bottom:1px solid var(--border-color);display:flex;align-items:center;gap:8px;">
                        <span style="width:10px;height:10px;border-radius:50%;background:${pc}"></span>
                        <strong style="color:var(--text-primary)">${pn}</strong>
                        <span style="color:var(--text-muted);font-size:0.8rem;margin-left:auto">${party.candidates.length}명</span>
                    </div>
                    <table style="width:100%;font-size:0.8rem;border-collapse:collapse;">
                        <thead><tr style="background:var(--bg-secondary);">
                            <th style="padding:4px 8px;text-align:center;width:40px;color:var(--text-muted)">순번</th>
                            <th style="padding:4px 8px;text-align:left;color:var(--text-muted)">이름</th>
                            <th style="padding:4px 8px;text-align:left;color:var(--text-muted)">약력</th>
                        </tr></thead>
                        <tbody>${party.candidates.map((c, i) => `
                            <tr style="border-top:1px solid var(--border-color);">
                                <td style="padding:4px 8px;text-align:center;color:var(--text-muted)">${i + 1}</td>
                                <td style="padding:4px 8px;color:var(--text-primary)">${c.name}</td>
                                <td style="padding:4px 8px;color:var(--text-muted)">${c.career || ''}</td>
                            </tr>`).join('')}
                        </tbody>
                    </table>
                </div>`;
        }).join('');
    }

    // ══════════════════════════════════════
    // 뉴스탭 — 현행 유지
    // ══════════════════════════════════════

    function renderNews(regionKey, electionType) {
        if (typeof renderNewsTab === 'function') renderNewsTab(regionKey);
    }

    // ══════════════════════════════════════
    // 역대비교탭 — 비례 투표결과만
    // ══════════════════════════════════════

    function renderHistory(regionKey, electionType) {
        const container = document.getElementById('tab-history');
        if (!container) return;

        container.innerHTML = '<div class="panel-section"><div class="panel-loading"><div class="panel-loading-spinner"></div></div></div>';

        loadHistory().then(data => {
            const histData = getHistoryData(regionKey, electionType);

            if (!histData?.elections?.length) {
                container.innerHTML = `<div class="panel-section"><div class="district-no-data"><p>역대 비례대표 투표 결과를 준비 중입니다.</p></div></div>`;
                return;
            }

            let html = `<div class="panel-section">
                <h4 style="color:var(--text-secondary);margin-bottom:12px;">
                    <i class="fas fa-history" style="margin-right:6px;"></i> 역대 비례대표 투표 결과
                </h4>`;

            histData.elections.sort((a, b) => b.electionNumber - a.electionNumber).forEach(el => {
                html += `
                    <div style="margin-bottom:16px;border:1px solid var(--border-color);border-radius:8px;overflow:hidden;">
                        <div style="padding:8px 12px;background:var(--bg-secondary);border-bottom:1px solid var(--border-color);font-weight:600;font-size:0.85rem;color:var(--text-primary);">
                            제${el.electionNumber}회 (${el.year})
                        </div>
                        <div style="padding:12px;">
                `;

                // 득표율 바 OR 의석 배분 바 (득표율 없으면 의석으로 대체)
                const hasVoteShare = el.voteShare?.length > 0;
                const chartData = hasVoteShare ? el.voteShare : (el.seatDistribution || []);
                const chartLabel = hasVoteShare ? '득표율' : '의석 배분';

                if (chartData.length > 0) {
                    const sorted = [...chartData].sort((a, b) => (b.percent || b.seats || 0) - (a.percent || a.seats || 0));
                    const maxVal = Math.max(...sorted.map(v => v.percent || v.seats || 0));

                    sorted.forEach(v => {
                        const val = v.percent || v.seats || 0;
                        const unit = v.percent ? '%' : '석';
                        const pc = ElectionData.getPartyColor(_partyNameToKey(v.party));
                        const w = maxVal > 0 ? (val / maxVal * 100) : 0;
                        html += `
                            <div style="display:grid;grid-template-columns:80px 1fr 42px;align-items:center;gap:8px;margin-bottom:4px;">
                                <span style="font-size:0.8rem;color:${pc};font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${v.party}</span>
                                <div style="height:14px;background:var(--bg-tertiary);border-radius:3px;overflow:hidden;">
                                    <div style="width:${w}%;height:100%;background:${pc};border-radius:3px;"></div>
                                </div>
                                <span style="font-size:0.8rem;color:var(--text-primary);text-align:right;font-weight:500;">${val}${unit}</span>
                            </div>
                        `;
                    });
                }

                // 의석 배분 텍스트 (득표율 있을 때만 별도 표시)
                if (hasVoteShare && el.seatDistribution?.length) {
                    const seatText = el.seatDistribution.sort((a, b) => b.seats - a.seats)
                        .map(s => `${s.party} ${s.seats}석`).join(' | ');
                    html += `<div style="font-size:0.75rem;color:var(--text-muted);margin-top:6px;">배분: ${seatText}</div>`;
                }

                html += `</div></div>`;
            });

            html += `</div>`;
            container.innerHTML = html;
        });
    }

    return { render, renderOverview, renderPolls, renderCandidates, renderNews, renderHistory };
})();
