/**
 * ProportionalTab — 광역비례 + 기초비례 탭 렌더러
 *
 * app.js에서 electionType이 councilProportional/localCouncilProportional일 때 위임.
 * 비례대표 특성: 후보가 아닌 정당에 투표, 정당지지도 활용, 명부 등록은 5/14~15.
 */
const ProportionalTab = (() => {

    // 후보 등록 마감일 (KST)
    const CANDIDATE_REG_END = new Date('2026-05-15T18:00:00+09:00');

    function getKST() {
        if (typeof ElectionCalendar !== 'undefined' && ElectionCalendar.getKST) {
            return ElectionCalendar.getKST();
        }
        return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
    }

    function getLabel(electionType) {
        return electionType === 'councilProportional' ? '광역 비례대표' : '기초 비례대표';
    }

    function getUnitLabel(electionType) {
        return electionType === 'councilProportional' ? '시·도의원' : '구·시·군의원';
    }

    // ── 메인 렌더 ──

    // districtName을 모듈 내에서 보존
    let _currentDistrictName = null;

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

    // ── 개요탭 ──

    function renderOverview(regionKey, electionType) {
        const label = getLabel(electionType);
        const region = ElectionData.getRegion(regionKey);
        const regionName = region?.name || '';

        // 비례대표 후보 데이터 lazy-load
        ElectionData.loadProportionalCandidates?.();
        // 비례대표 의석 데이터 lazy-load
        if (electionType === 'councilProportional') {
            ElectionData.loadProportionalCouncilData?.();
        } else {
            ElectionData.loadProportionalLocalCouncilData?.();
        }

        // 약간의 지연 후 다시 렌더 (lazy-load 완료 후)
        setTimeout(() => _renderProportionalOverviewHTML(regionKey, electionType, label, regionName), 300);

        // 즉시 렌더 (캐시 있으면 바로 표시)
        _renderProportionalOverviewHTML(regionKey, electionType, label, regionName);
    }

    function _renderProportionalOverviewHTML(regionKey, electionType, label, regionName) {
        const proportionalData = ElectionData.getProportionalData?.(regionKey, electionType, _currentDistrictName);
        const totalSeats = proportionalData?.totalSeats || (electionType === 'councilProportional' ? 10 : 5);
        const displayName = _currentDistrictName ? `${_currentDistrictName} ${label}` : `${regionName} ${label}`;

        const prevContainer = document.getElementById('prev-election-result');
        if (prevContainer) {
            let html = `
                <div class="proportional-overview">
                    <div class="council-info-card">
                        <div style="padding:12px;margin-bottom:12px;border-radius:8px;background:var(--accent-primary)08;border:1px solid var(--accent-primary)22;">
                            <h5 style="color:var(--accent-primary);margin-bottom:8px;"><i class="fas fa-info-circle"></i> ${label}란?</h5>
                            <p style="color:var(--text-secondary);font-size:0.85rem;line-height:1.5;">
                                유권자는 <strong>정당에 투표</strong>하고, 정당 득표율에 따라 의석이 배분됩니다.
                                ${electionType === 'councilProportional'
                                    ? '광역의회 비례대표는 시·도 단위로 선출됩니다.'
                                    : '기초의회 비례대표는 시·군·구 단위로 선출됩니다.'}
                            </p>
                        </div>

                        <div class="council-info-row">
                            <span class="council-info-label">선거 유형</span>
                            <span class="council-info-value">${displayName}</span>
                        </div>
                        <div class="council-info-row">
                            <span class="council-info-label">배분 의석</span>
                            <span class="council-info-value">${totalSeats}석</span>
                        </div>
                        <div class="council-info-row">
                            <span class="council-info-label">배분 방식</span>
                            <span class="council-info-value">정당 득표율 비례배분 (5% 봉쇄조항)</span>
                        </div>
                    </div>
            `;

            // 현직 비례대표 의원 (정당별 의석 + 의원명)
            const propCandidates = ElectionData.getProportionalCandidates?.(regionKey, electionType);

            if (proportionalData?.parties?.length) {
                html += `
                    <h5 style="margin-top:12px;color:var(--text-secondary);font-size:0.85rem;">
                        <i class="fas fa-user-tie" style="margin-right:4px;"></i> 현직 비례대표 의원 (제8회 당선)
                    </h5>
                `;

                proportionalData.parties.forEach(p => {
                    const pc = ElectionData.getPartyColor(p.party);
                    const pn = ElectionData.getPartyName(p.party);
                    // 해당 정당의 현직 의원 이름 조회
                    const partyMembers = propCandidates?.parties?.find(pp => pp.party === p.party)?.candidates || [];

                    html += `
                        <div style="margin-bottom:10px;padding:10px 12px;border-radius:8px;background:var(--bg-secondary);border-left:3px solid ${pc};">
                            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
                                <div style="display:flex;align-items:center;gap:6px;">
                                    <span style="padding:1px 8px;border-radius:4px;font-size:0.7rem;background:${pc};color:white;">${pn}</span>
                                    <span style="font-size:0.85rem;color:var(--text-primary);font-weight:600;">${p.seats}석</span>
                                </div>
                                ${p.voteShare ? `<span style="font-size:0.75rem;color:var(--text-muted);">득표 ${p.voteShare}%</span>` : ''}
                            </div>
                            ${partyMembers.length > 0 ? `
                                <div style="display:flex;flex-wrap:wrap;gap:4px;">
                                    ${partyMembers.map(c => `
                                        <span style="font-size:0.78rem;padding:2px 8px;border-radius:4px;background:${pc}10;color:var(--text-primary);border:1px solid ${pc}22;">
                                            ${c.name}
                                        </span>
                                    `).join('')}
                                </div>
                            ` : ''}
                        </div>
                    `;
                });
            }

            html += `</div>`;
            prevContainer.innerHTML = html;
        }

        const govContainer = document.getElementById('current-governor');
        if (govContainer) govContainer.innerHTML = '';
    }

    // ── 여론조사탭 ──

    function renderPolls(regionKey, electionType) {
        const cardsSection = document.getElementById('poll-cards-section');
        const latestSection = document.getElementById('poll-latest-section');
        const trendsSection = document.getElementById('poll-trends-section');

        if (latestSection) latestSection.style.display = 'none';
        if (trendsSection) trendsSection.innerHTML = '';

        // 공표금지 체크
        if (typeof ElectionCalendar !== 'undefined' && ElectionCalendar.isPublicationBanned()) {
            if (cardsSection) cardsSection.innerHTML = `
                <div class="poll-ban-notice">
                    <i class="fas fa-gavel"></i>
                    <h4>여론조사 공표금지 기간</h4>
                    <p>공직선거법 제108조에 따라<br>여론조사 결과를 표시할 수 없습니다.</p>
                </div>`;
            return;
        }

        // 정당지지도 표시
        const partyPolls = ElectionData.getPartySupport?.(regionKey) || [];

        if (cardsSection) {
            if (partyPolls.length > 0) {
                cardsSection.innerHTML = partyPolls.map(poll => renderPartySupportCard(poll)).join('');
            } else {
                cardsSection.innerHTML = `
                    <div class="district-no-data">
                        <p>이 지역의 정당지지도 여론조사가 아직 없습니다.</p>
                        <p style="margin-top:8px;color:var(--text-muted);font-size:0.8rem;">
                            전국 정당지지도를 참고하세요.
                        </p>
                        <p style="margin-top:6px">
                            <a href="https://www.nesdc.go.kr/" target="_blank" rel="noopener" style="color:var(--accent-blue)">
                                여심위에서 직접 확인하기
                            </a>
                        </p>
                    </div>
                `;
            }
        }
    }

    function renderPartySupportCard(poll) {
        const results = (poll.results || []).filter(r => r.support > 0);
        if (!results.length) return '';

        const maxSupport = Math.max(...results.map(r => r.support));
        const dateText = poll.publishDate || '일시 미상';

        return `
            <div class="poll-result-card">
                <div class="poll-card-header">
                    <span class="poll-card-org">${poll.pollOrg || '조사기관 미상'}</span>
                    <span class="poll-card-method">정당지지도</span>
                </div>
                <div class="poll-card-date">${dateText}</div>
                <div class="poll-card-results">
                    ${results.sort((a, b) => b.support - a.support).map(r => {
                        const pc = ElectionData.getPartyColor(r.party || 'independent');
                        const pn = r.candidateName || ElectionData.getPartyName(r.party || 'independent');
                        const barWidth = maxSupport > 0 ? (r.support / maxSupport * 100) : 0;
                        return `
                            <div class="poll-card-result">
                                <div class="poll-card-result-info">
                                    <span class="poll-card-candidate">${pn}</span>
                                    <span class="poll-card-support">${r.support}%</span>
                                </div>
                                <div class="poll-card-bar-bg">
                                    <div class="poll-card-bar" style="width:${barWidth}%;background:${pc}"></div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }

    // ── 후보자탭 ──

    function renderCandidates(regionKey, electionType) {
        const container = document.getElementById('candidates-list');
        if (!container) return;

        const now = getKST();

        if (now < CANDIDATE_REG_END) {
            // 5/15 이전: 안내 문구
            container.innerHTML = `
                <div class="district-no-data">
                    <p><i class="fas fa-clipboard-list"></i> 비례대표 후보 명부는 후보자 등록 기간(5/14~15)에 확정됩니다.</p>
                    <p style="margin-top:8px;color:var(--text-muted);font-size:0.85rem;">
                        현재 각 정당의 비례대표 공천 과정이 진행 중입니다.
                    </p>
                </div>
            `;
            return;
        }

        // 5/15 이후: 정당별 명부 테이블
        const data = ElectionData.getProportionalCandidates?.(regionKey, electionType);
        if (!data || !data.parties?.length) {
            container.innerHTML = `
                <div class="district-no-data">
                    <p>비례대표 후보 명부 데이터를 준비 중입니다.</p>
                </div>`;
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
                        <thead>
                            <tr style="background:var(--bg-secondary);">
                                <th style="padding:4px 8px;text-align:center;width:40px;color:var(--text-muted)">순번</th>
                                <th style="padding:4px 8px;text-align:left;color:var(--text-muted)">이름</th>
                                <th style="padding:4px 8px;text-align:left;color:var(--text-muted)">약력</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${party.candidates.map((c, i) => `
                                <tr style="border-top:1px solid var(--border-color);">
                                    <td style="padding:4px 8px;text-align:center;color:var(--text-muted)">${i + 1}</td>
                                    <td style="padding:4px 8px;color:var(--text-primary)">${c.name}</td>
                                    <td style="padding:4px 8px;color:var(--text-muted)">${c.career || ''}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }).join('');
    }

    // ── 뉴스탭 ──

    function renderNews(regionKey, electionType) {
        if (typeof renderNewsTab === 'function') {
            renderNewsTab(regionKey);
        }
    }

    // ── 역대비교탭 ──

    function renderHistory(regionKey, electionType) {
        if (typeof HistoryTab !== 'undefined') {
            HistoryTab.render(regionKey, electionType, null);
            return;
        }

        const container = document.getElementById('tab-history');
        if (container) {
            container.innerHTML = `
                <div class="panel-section">
                    <div class="district-no-data">
                        <p>비례대표 역대 득표율 데이터를 준비 중입니다.</p>
                    </div>
                </div>`;
        }
    }

    // ── Public API ──

    return {
        render,
        renderOverview,
        renderPolls,
        renderCandidates,
        renderNews,
        renderHistory,
    };

})();
