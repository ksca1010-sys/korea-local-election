/**
 * CouncilTab — 광역의원 + 기초의원 지역구 탭 렌더러
 *
 * app.js에서 electionType이 council/localCouncil일 때 위임받아 처리.
 * 선거구 선택 전/후 상태를 관리하고, 5개 탭(개요/여론조사/후보자/뉴스/역대비교)을 렌더링.
 */
const CouncilTab = (() => {

    // ── 유틸리티 ──

    function getElectionLabel(electionType) {
        return electionType === 'council' ? '광역의원' : '기초의원';
    }

    function getRoleLabel(electionType) {
        return electionType === 'council' ? '시·도의원' : '구·시·군의원';
    }

    function getSeats(regionKey, districtName, electionType) {
        if (electionType === 'council') return 1; // 소선거구

        // 기초의원: 후보 데이터에서 _seats 조회
        const candidates = ElectionData.getCouncilCandidates?.(regionKey, districtName, electionType) || [];
        if (candidates.length > 0 && candidates[0]._seats) return candidates[0]._seats;

        // 폴백: basic_district_mapping에서 조회
        // 현직 수 = 의석 수 (현직 기반 데이터이므로)
        const incumbents = candidates.filter(c => c.isIncumbent);
        if (incumbents.length > 0) return incumbents.length;

        return 2; // 최종 기본값
    }

    // ── 메인 렌더 ──

    function render(tabName, regionKey, districtName, electionType) {
        if (!districtName) {
            // 선거구 미선택 → 안내 표시 (기존 province view가 처리)
            return;
        }

        switch (tabName) {
            case 'overview':   renderOverview(regionKey, districtName, electionType); break;
            case 'polls':      renderPolls(regionKey, districtName, electionType); break;
            case 'candidates': renderCandidates(regionKey, districtName, electionType); break;
            case 'news':       renderNews(regionKey, districtName, electionType); break;
            case 'history':    renderHistory(regionKey, districtName, electionType); break;
        }
    }

    // ── 개요탭 ──

    function renderOverview(regionKey, districtName, electionType) {
        const label = getElectionLabel(electionType);
        const seats = getSeats(regionKey, districtName, electionType);
        const candidates = ElectionData.getCouncilCandidates?.(regionKey, districtName, electionType) || [];
        const activeCandidates = candidates.filter(c => c.status !== 'WITHDRAWN');

        const prevContainer = document.getElementById('prev-election-result');
        if (prevContainer) {
            let html = `
                <div class="council-overview">
                    <div class="council-info-card">
                        <div class="council-info-row">
                            <span class="council-info-label">선거구</span>
                            <span class="council-info-value">${districtName}</span>
                        </div>
                        <div class="council-info-row">
                            <span class="council-info-label">선거 유형</span>
                            <span class="council-info-value">${label} 지역구</span>
                        </div>
                        <div class="council-info-row">
                            <span class="council-info-label">선출 인원</span>
                            <span class="council-info-value">${seats}명${seats > 1 ? ' (중대선거구)' : ' (소선거구)'}</span>
                        </div>
                        <div class="council-info-row">
                            <span class="council-info-label">출마 후보</span>
                            <span class="council-info-value">${activeCandidates.length}명</span>
                        </div>
                    </div>
            `;

            // 현직 의원 정보
            const incumbents = activeCandidates.filter(c => c.isIncumbent);
            if (incumbents.length > 0) {
                html += `<h5 style="margin-top:12px;color:var(--text-secondary)"><i class="fas fa-user-tie"></i> 현직 의원</h5>`;
                incumbents.forEach(c => {
                    const pc = ElectionData.getPartyColor(c.party || 'independent');
                    html += `
                        <div style="padding:8px;margin:4px 0;border-radius:6px;background:var(--bg-secondary);border-left:3px solid ${pc}">
                            <strong>${c.name}</strong>
                            <span class="party-badge" style="background:${pc};color:white;padding:1px 6px;border-radius:3px;font-size:0.7rem;margin-left:6px">${ElectionData.getPartyName(c.party || 'independent')}</span>
                            ${c.career ? `<div style="color:var(--text-muted);font-size:0.8rem;margin-top:4px">${c.career}</div>` : ''}
                        </div>
                    `;
                });
            }

            html += `</div>`;
            prevContainer.innerHTML = html;
        }

        // 현직 구역 비움 (개요에 통합)
        const govContainer = document.getElementById('current-governor');
        if (govContainer) govContainer.innerHTML = '';
    }

    // ── 여론조사탭 ──

    function renderPolls(regionKey, districtName, electionType) {
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

        const label = getElectionLabel(electionType);
        const fallbackLabel = electionType === 'council' ? '광역단체장' : '기초단체장';

        if (cardsSection) {
            cardsSection.innerHTML = `
                <div class="district-no-data">
                    <p>${label} 선거구 단위의 여론조사는 거의 실시되지 않습니다.</p>
                    <p style="margin-top:8px;color:var(--text-muted);font-size:0.8rem;">
                        해당 시도의 ${fallbackLabel} 여론조사를 참고하세요.
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

    // ── 후보자탭 ──

    function renderCandidates(regionKey, districtName, electionType) {
        const container = document.getElementById('candidates-list');
        if (!container) return;

        const candidates = ElectionData.getCouncilCandidates?.(regionKey, districtName, electionType) || [];
        const activeCandidates = candidates.filter(c => c.status !== 'WITHDRAWN');

        if (!activeCandidates.length) {
            container.innerHTML = `
                <div class="district-no-data">
                    <p>이 선거구의 후보자 정보가 아직 등록되지 않았습니다.</p>
                    <p style="margin-top:4px;color:var(--text-muted);font-size:0.8rem;">
                        후보자 등록 기간(5/14~15) 이후 업데이트됩니다.
                    </p>
                </div>`;
            return;
        }

        const seats = getSeats(regionKey, districtName, electionType);

        if (electionType === 'localCouncil' && seats > 1) {
            // 중대선거구: 정당별 그룹핑
            renderGroupedByParty(container, activeCandidates, seats);
        } else {
            // 소선거구: 기존 카드 방식
            renderCandidateCards(container, activeCandidates);
        }
    }

    function renderCandidateCards(container, candidates) {
        const sorted = [...candidates].sort((a, b) => {
            // 현직 우선, 그 다음 이름순
            if (a.isIncumbent && !b.isIncumbent) return -1;
            if (!a.isIncumbent && b.isIncumbent) return 1;
            return (a.name || '').localeCompare(b.name || '');
        });

        container.innerHTML = sorted.map(c => {
            const pc = ElectionData.getPartyColor(c.party || 'independent');
            const pn = ElectionData.getPartyName(c.party || 'independent');
            const incumbentBadge = c.isIncumbent
                ? '<span style="background:#f59e0b;color:white;padding:1px 6px;border-radius:3px;font-size:0.65rem;margin-left:4px">현직</span>'
                : '';
            const statusBadge = c.status === 'DECLARED'
                ? '<span style="background:#22c55e22;color:#22c55e;padding:1px 6px;border-radius:3px;font-size:0.65rem;margin-left:4px">출마확정</span>'
                : '';

            return `
                <div class="candidate-card" style="border-left:3px solid ${pc}">
                    <div class="candidate-header">
                        <strong class="candidate-name">${c.name}</strong>
                        ${incumbentBadge}${statusBadge}
                        <span class="party-badge" style="background:${pc}22;color:${pc};border:1px solid ${pc}44;padding:1px 6px;border-radius:3px;font-size:0.7rem;margin-left:auto">${pn}</span>
                    </div>
                    ${c.career ? `<div class="candidate-career" style="color:var(--text-muted);font-size:0.8rem;margin-top:4px">${c.career}</div>` : ''}
                </div>
            `;
        }).join('');
    }

    function renderGroupedByParty(container, candidates, seats) {
        // 정당별 그룹핑
        const groups = {};
        candidates.forEach(c => {
            const party = c.party || 'independent';
            if (!groups[party]) groups[party] = [];
            groups[party].push(c);
        });

        // 정당 정렬 (후보 수 내림차순)
        const sortedParties = Object.entries(groups).sort((a, b) => b[1].length - a[1].length);

        let html = `
            <div class="council-seats-info" style="padding:10px;margin-bottom:12px;border-radius:8px;background:var(--accent-primary)11;border:1px solid var(--accent-primary)33;text-align:center;">
                <i class="fas fa-users" style="color:var(--accent-primary)"></i>
                선출 인원: <strong>${seats}명</strong> (이 중 ${seats}명이 당선됩니다)
            </div>
        `;

        sortedParties.forEach(([party, members]) => {
            const pc = ElectionData.getPartyColor(party);
            const pn = ElectionData.getPartyName(party);

            html += `
                <div class="council-party-group" style="margin-bottom:12px;padding:10px;border-radius:8px;background:var(--bg-secondary);border-left:3px solid ${pc}">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                        <strong style="color:${pc}">${pn}</strong>
                        <span style="color:var(--text-muted);font-size:0.8rem">${members.length}명 출마</span>
                    </div>
                    ${members.map(c => {
                        const incumbentBadge = c.isIncumbent
                            ? '<span style="background:#f59e0b;color:white;padding:1px 4px;border-radius:3px;font-size:0.6rem;margin-left:4px">현직</span>'
                            : '<span style="background:var(--bg-tertiary);color:var(--text-muted);padding:1px 4px;border-radius:3px;font-size:0.6rem;margin-left:4px">신인</span>';
                        return `
                            <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;font-size:0.85rem;">
                                <span style="width:6px;height:6px;border-radius:50%;background:${pc};flex-shrink:0"></span>
                                <span style="color:var(--text-primary)">${c.name}</span>
                                ${incumbentBadge}
                                ${c.career ? `<span style="color:var(--text-muted);font-size:0.75rem;margin-left:auto">${c.career}</span>` : ''}
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        });

        html += `
            <div style="text-align:center;padding:8px;color:var(--text-muted);font-size:0.85rem;border-top:1px solid var(--border-color);margin-top:8px;">
                전체 ${candidates.length}명 출마 → ${seats}명 당선
            </div>
        `;

        container.innerHTML = html;
    }

    // ── 뉴스탭 ──

    function renderNews(regionKey, districtName, electionType) {
        // app.js의 renderNewsTab()을 호출 (이미 buildCouncilNewsCategories 지원)
        if (typeof renderNewsTab === 'function') {
            renderNewsTab(regionKey);
        }
    }

    // ── 역대비교탭 ──

    function renderHistory(regionKey, districtName, electionType) {
        if (typeof HistoryTab !== 'undefined') {
            HistoryTab.render(regionKey, electionType, districtName);
            return;
        }

        const container = document.getElementById('tab-history');
        if (container) {
            container.innerHTML = `
                <div class="panel-section">
                    <div class="district-no-data">
                        <p>이 선거구의 역대 선거 결과를 준비 중입니다.</p>
                        <p style="margin-top:4px;color:var(--text-muted);font-size:0.8rem;">
                            <i class="fas fa-info-circle"></i> 선거구 경계가 이전 선거와 다를 수 있습니다.
                        </p>
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
