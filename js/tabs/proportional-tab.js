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

    function render(tabName, regionKey, districtName, electionType) {
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
        const unitLabel = getUnitLabel(electionType);
        const region = ElectionData.getRegion(regionKey);
        const regionName = region?.name || '';

        // 비례대표 의석 수 (데이터에서 조회, 없으면 기본값)
        const proportionalData = ElectionData.getProportionalData?.(regionKey, electionType);
        const totalSeats = proportionalData?.totalSeats || (electionType === 'councilProportional' ? 10 : 5);

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
                            <span class="council-info-value">${regionName} ${label}</span>
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

            // 현재 정당별 비례 의석 (8회 지선)
            if (proportionalData?.parties?.length) {
                html += `<h5 style="margin-top:12px;color:var(--text-secondary)"><i class="fas fa-chart-pie"></i> 현 의석 구성 (제8회)</h5>`;
                html += `<div style="margin-top:8px;">`;
                proportionalData.parties.forEach(p => {
                    const pc = ElectionData.getPartyColor(p.party);
                    const pn = ElectionData.getPartyName(p.party);
                    const barWidth = totalSeats > 0 ? (p.seats / totalSeats * 100) : 0;
                    html += `
                        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                            <span style="width:8px;height:8px;border-radius:50%;background:${pc};flex-shrink:0"></span>
                            <span style="min-width:80px;color:var(--text-primary);font-size:0.85rem;">${pn}</span>
                            <div style="flex:1;height:16px;background:var(--bg-secondary);border-radius:4px;overflow:hidden;">
                                <div style="width:${barWidth}%;height:100%;background:${pc};border-radius:4px;"></div>
                            </div>
                            <span style="min-width:30px;text-align:right;color:var(--text-secondary);font-size:0.85rem;">${p.seats}석</span>
                        </div>
                    `;
                });
                html += `</div>`;
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
