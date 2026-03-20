/**
 * CouncilTab — 광역의원 + 기초의원 지역구 탭 렌더러
 *
 * app.js에서 electionType이 council/localCouncil일 때 위임받아 처리.
 * 선거구 선택 전/후 상태를 관리하고, 5개 탭(개요/여론조사/후보자/뉴스/역대비교)을 렌더링.
 */
const CouncilTab = (() => {

    // ── 유틸리티 ──

    function _partyNameToKey(name) {
        if (!name) return '';
        const map = {
            '더불어민주당':'democratic','국민의힘':'ppp','정의당':'justice',
            '진보당':'progressive','무소속':'independent','조국혁신당':'reform',
            '개혁신당':'newReform','기본소득당':'basicIncome',
            '한나라당':'ppp','새누리당':'ppp','자유한국당':'ppp','친박연합':'ppp',
            '민주당':'democratic','새정치민주연합':'democratic','민주평화당':'democratic',
            '열린우리당':'democratic','새천년민주당':'democratic',
            '민주노동당':'progressive','통합진보당':'progressive',
            '바른미래당':'newReform','자유선진당':'independent','국민참여당':'democratic',
            '국민중심당':'independent','미래연합':'independent',
        };
        return map[name] || '';
    }

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

    // ── 관할 읍면동 조회 ──

    function getDistrictDongs(regionKey, districtName, electionType) {
        // district_mapping JSON에서 읍면동 조회
        const folder = electionType === 'council' ? 'council' : 'basic_council';
        const cache = _dongCache[`${folder}_${regionKey}`];
        if (cache) {
            const dist = cache.find(d => d.name === districtName);
            return dist?.dongs || [];
        }
        return [];
    }

    const _dongCache = {};

    function loadDistrictMapping(regionKey, electionType) {
        const folder = electionType === 'council' ? 'council' : 'basic_council';
        const cacheKey = `${folder}_${regionKey}`;
        if (_dongCache[cacheKey]) return Promise.resolve();

        const prefix = electionType === 'council' ? 'district_mapping' : 'basic_district_mapping';
        const url = `data/${folder}/${prefix}_${regionKey}.json`;
        return fetch(url)
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (data?.districts) _dongCache[cacheKey] = data.districts;
            })
            .catch(() => {});
    }

    // ── 개요탭 ──

    function renderOverview(regionKey, districtName, electionType) {
        const label = getElectionLabel(electionType);
        const seats = getSeats(regionKey, districtName, electionType);
        const candidates = ElectionData.getCouncilCandidates?.(regionKey, districtName, electionType) || [];
        const activeCandidates = candidates.filter(c => c.status !== 'WITHDRAWN');
        const incumbents = activeCandidates.filter(c => c.isIncumbent);

        // 관할 읍면동 로드 후 렌더
        loadDistrictMapping(regionKey, electionType).then(() => {
            _renderOverviewHTML(regionKey, districtName, electionType, label, seats, activeCandidates, incumbents);
        });

        // 먼저 즉시 렌더 (읍면동 없이)
        _renderOverviewHTML(regionKey, districtName, electionType, label, seats, activeCandidates, incumbents);
    }

    function _renderOverviewHTML(regionKey, districtName, electionType, label, seats, activeCandidates, incumbents) {
        const dongs = getDistrictDongs(regionKey, districtName, electionType);
        const region = ElectionData.getRegion(regionKey);
        const regionName = region?.name || '';

        // ── 개요 박스: 선거구 정보 + 관할 읍면동 ──
        const prevContainer = document.getElementById('prev-election-result');
        if (prevContainer) {
            let html = `
                <div style="padding:14px;border-radius:10px;background:var(--bg-secondary);border:1px solid var(--border-color);">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
                        <i class="fas fa-landmark" style="color:var(--accent-primary);font-size:1.1rem;"></i>
                        <span style="font-size:0.95rem;font-weight:600;color:var(--text-primary);">${districtName}</span>
                        <span style="font-size:0.7rem;padding:2px 8px;border-radius:4px;background:var(--accent-primary)15;color:var(--accent-primary);border:1px solid var(--accent-primary)33;margin-left:auto;">
                            ${label} · ${seats > 1 ? `${seats}석` : '1석'}
                        </span>
                    </div>
                    <div style="display:flex;gap:16px;font-size:0.8rem;color:var(--text-muted);margin-bottom:${dongs.length > 0 ? '10' : '0'}px;">
                        <span><i class="fas fa-map-marker-alt" style="margin-right:4px;"></i>${regionName}</span>
                        <span><i class="fas fa-users" style="margin-right:4px;"></i>후보 ${activeCandidates.length}명</span>
                    </div>
            `;

            if (dongs.length > 0) {
                html += `
                    <div style="display:flex;flex-wrap:wrap;gap:4px;">
                        ${dongs.map(d => `<span style="font-size:0.72rem;padding:2px 7px;border-radius:4px;background:var(--bg-tertiary);color:var(--text-secondary);">${d}</span>`).join('')}
                    </div>
                `;
            }

            html += `</div>`;
            prevContainer.innerHTML = html;
        }

        // ── 현직자 정보 박스: 현직 의원 + 지선 결과 ──
        const govContainer = document.getElementById('current-governor');
        if (govContainer) {
            let govHtml = '';

            // 현직 의원
            if (incumbents.length > 0) {
                incumbents.forEach(c => {
                    const pc = ElectionData.getPartyColor(c.party || 'independent');
                    const pn = ElectionData.getPartyName(c.party || 'independent');
                    govHtml += `
                        <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;margin-bottom:6px;border-radius:8px;background:var(--bg-secondary);border-left:3px solid ${pc};">
                            <div style="width:36px;height:36px;border-radius:50%;background:${pc}20;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                                <i class="fas fa-user" style="color:${pc};font-size:0.9rem;"></i>
                            </div>
                            <div style="flex:1;">
                                <div style="display:flex;align-items:center;gap:6px;">
                                    <strong style="font-size:0.95rem;color:var(--text-primary);">${c.name}</strong>
                                    <span style="padding:1px 8px;border-radius:4px;font-size:0.7rem;background:${pc};color:white;">${pn}</span>
                                </div>
                                ${c.career ? `<div style="color:var(--text-muted);font-size:0.8rem;margin-top:2px;">${c.career}</div>` : ''}
                            </div>
                        </div>
                    `;
                });
            } else {
                govHtml += `<p style="color:var(--text-muted);font-size:0.85rem;padding:8px;">현직 의원 정보가 없습니다.</p>`;
            }

            // 지선 결과 (비동기 로드 영역)
            govHtml += `<div id="council-overview-history" style="margin-top:10px;"><div class="panel-loading" style="padding:8px;"><div class="panel-loading-spinner"></div></div></div>`;

            govContainer.innerHTML = govHtml;

            // 지선 결과 비동기 로드
            _loadPrevElectionInOverview(regionKey, districtName, electionType);
        }
    }

    function _loadPrevElectionInOverview(regionKey, districtName, electionType) {
        loadCouncilHistory().then(data => {
            const container = document.getElementById('council-overview-history');
            if (!container || !data) {
                if (container) container.innerHTML = '';
                return;
            }

            let winners = [];
            if (electionType === 'council') {
                winners = data.council?.[regionKey]?.[districtName] || [];
                if (!winners.length) {
                    const normalized = districtName.replace(/\s+/g, '');
                    for (const [k, v] of Object.entries(data.council?.[regionKey] || {})) {
                        if (k.replace(/\s+/g, '') === normalized) { winners = v; break; }
                    }
                }
            } else {
                const normalized = districtName.replace(/\s+/g, '');
                for (const [sgg, districts] of Object.entries(data.local_council?.[regionKey] || {})) {
                    for (const [dk, dv] of Object.entries(districts)) {
                        if (dk === districtName || dk.replace(/\s+/g, '') === normalized) { winners = dv; break; }
                    }
                    if (winners.length) break;
                }
            }

            if (!winners.length) {
                // 현직자가 있으면 무투표 당선
                const incumbents = ElectionData.getCouncilCandidates?.(regionKey, districtName, electionType) || [];
                const currentIncumbents = incumbents.filter(c => c.isIncumbent);
                if (currentIncumbents.length > 0) {
                    let uhtml = `
                        <h5 style="color:var(--text-secondary);margin-bottom:8px;font-size:0.85rem;">
                            <i class="fas fa-poll" style="margin-right:4px;"></i> 제8회 지방선거 결과 (2022)
                        </h5>
                        <div style="padding:8px 10px;border-radius:6px;background:var(--bg-secondary);font-size:var(--text-caption);color:var(--text-muted);">
                            <span style="background:var(--bg-tertiary);padding:1px 6px;border-radius:3px;font-size:var(--text-micro);margin-right:6px;">무투표 당선</span>
                    `;
                    currentIncumbents.forEach(c => {
                        const pc = ElectionData.getPartyColor(c.party || 'independent');
                        const pn = ElectionData.getPartyName(c.party || 'independent');
                        uhtml += `<span style="color:var(--text-primary);font-weight:var(--font-bold);margin-right:4px;">${c.name}</span><span style="color:${pc};margin-right:8px;">${pn}</span>`;
                    });
                    uhtml += `</div>`;
                    container.innerHTML = uhtml;
                } else {
                    container.innerHTML = '';
                }
                return;
            }

            const sorted = [...winners].sort((a, b) => b.votes - a.votes);
            const maxVotes = sorted[0]?.votes || 1;
            const totalVotes = sorted.reduce((s, w) => s + w.votes, 0);

            let html = `
                <h5 style="color:var(--text-secondary);margin-bottom:8px;font-size:0.85rem;">
                    <i class="fas fa-poll" style="margin-right:4px;"></i> 제8회 지방선거 결과 (2022)
                </h5>
            `;

            sorted.forEach((w, i) => {
                const pc = ElectionData.getPartyColor(w.party || _partyNameToKey(w.partyName) || 'independent');
                const pn = w.partyName || ElectionData.getPartyName(w.party || 'independent');
                const barWidth = maxVotes > 0 ? (w.votes / maxVotes * 100) : 0;
                const voteRate = w.rate || (totalVotes > 0 ? (w.votes / totalVotes * 100).toFixed(1) : '0');
                const isWinner = i === 0;

                html += `
                    <div style="margin-bottom:8px;padding:8px 10px;border-radius:6px;background:var(--bg-secondary);${isWinner ? 'border:1px solid ' + pc + '44;' : ''}">
                        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
                            <div style="display:flex;align-items:center;gap:6px;">
                                <strong style="font-size:0.85rem;color:var(--text-primary);">${w.name}</strong>
                                <span style="padding:0 6px;border-radius:3px;font-size:0.65rem;background:${pc}20;color:${pc};border:1px solid ${pc}33;">${pn}</span>
                                ${isWinner ? '<span style="font-size:0.6rem;color:#f59e0b;font-weight:600;">당선</span>' : ''}
                            </div>
                            <span style="font-size:0.8rem;color:var(--text-secondary);font-weight:500;">${voteRate}%</span>
                        </div>
                        <div style="height:14px;background:var(--bg-tertiary);border-radius:3px;overflow:hidden;">
                            <div style="width:${barWidth}%;height:100%;background:${pc};border-radius:3px;"></div>
                        </div>
                    </div>
                `;
            });

            container.innerHTML = html;
        });
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

        // lazy-load 후 재렌더
        const tryRender = () => {
            const candidates = ElectionData.getCouncilCandidates?.(regionKey, districtName, electionType) || [];
            const activeCandidates = candidates.filter(c => c.status !== 'WITHDRAWN');
            return activeCandidates;
        };

        let activeCandidates = tryRender();

        if (!activeCandidates.length) {
            container.innerHTML = '<div class="panel-loading"><div class="panel-loading-spinner"></div></div>';
            // 데이터 로드 시도
            const loadPromise = ElectionData.loadCouncilCandidates?.(regionKey, electionType);
            if (loadPromise && loadPromise.then) {
                loadPromise.then(() => {
                    activeCandidates = tryRender();
                    if (activeCandidates.length) {
                        _renderCandidatesContent(container, activeCandidates, regionKey, districtName, electionType);
                    } else {
                        container.innerHTML = `
                            <div class="district-no-data">
                                <p>이 선거구의 후보자 정보가 아직 등록되지 않았습니다.</p>
                                <p style="margin-top:var(--space-4);color:var(--text-muted);font-size:var(--text-caption);">
                                    후보자 등록 기간(5/14~15) 이후 업데이트됩니다.
                                </p>
                            </div>`;
                    }
                });
                return;
            }

            container.innerHTML = `
                <div class="district-no-data">
                    <p>이 선거구의 후보자 정보가 아직 등록되지 않았습니다.</p>
                    <p style="margin-top:var(--space-4);color:var(--text-muted);font-size:var(--text-caption);">
                        후보자 등록 기간(5/14~15) 이후 업데이트됩니다.
                    </p>
                </div>`;
            return;
        }

        _renderCandidatesContent(container, activeCandidates, regionKey, districtName, electionType);
    }

    function _renderCandidatesContent(container, activeCandidates, regionKey, districtName, electionType) {

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

    const _historyCache = {};

    function loadCouncilHistory() {
        if (_historyCache.data) return Promise.resolve(_historyCache.data);
        return fetch('data/council_history.json')
            .then(r => r.ok ? r.json() : null)
            .then(data => { _historyCache.data = data; return data; })
            .catch(() => null);
    }

    function renderHistory(regionKey, districtName, electionType) {
        const container = document.getElementById('tab-history');
        if (!container) return;

        container.innerHTML = '<div class="panel-section"><div class="panel-loading"><div class="panel-loading-spinner"></div></div></div>';

        loadCouncilHistory().then(data => {
            if (!data) {
                container.innerHTML = '<div class="panel-section"><div class="district-no-data"><p>역대 선거 데이터를 불러올 수 없습니다.</p></div></div>';
                return;
            }

            // 광역의원: 3~8회 전체 나열
            if (electionType === 'council') {
                const normalized = districtName.replace(/\s+/g, '');
                const electionNums = [8, 7, 6, 5, 4, 3];
                const electionYears = {8:2022, 7:2018, 6:2014, 5:2010, 4:2006, 3:2002};
                const label = getElectionLabel(electionType);

                let html = `<div class="panel-section">
                    <h4 style="color:var(--text-secondary);margin-bottom:12px;">
                        <i class="fas fa-history" style="margin-right:6px;"></i> 역대 ${label} 선거 결과
                    </h4>
                    <p style="font-size:0.75rem;color:var(--text-muted);margin-bottom:10px;">
                        <i class="fas fa-info-circle" style="margin-right:4px;"></i>선거구 경계가 이전 선거와 다를 수 있습니다.
                    </p>`;

                let hasAny = false;
                electionNums.forEach(num => {
                    const key = num === 8 ? 'council' : `council_${num}`;
                    const regionData = data[key]?.[regionKey] || {};

                    // 선거구명 매칭
                    let winners = regionData[districtName] || [];
                    if (!winners.length) {
                        for (const [k, v] of Object.entries(regionData)) {
                            if (k.replace(/\s+/g, '') === normalized) { winners = v; break; }
                        }
                    }

                    if (!winners.length) return;
                    hasAny = true;

                    const sorted = [...winners].sort((a, b) => b.votes - a.votes);
                    const maxVotes = sorted[0]?.votes || 1;
                    const isUncontested = sorted.length === 1 && (!sorted[0].votes || sorted[0].rate === '0' || sorted[0].rate === '');

                    html += `
                        <div style="margin-bottom:16px;border:1px solid var(--border-color);border-radius:8px;overflow:hidden;">
                            <div style="padding:8px 12px;background:var(--bg-secondary);border-bottom:1px solid var(--border-color);display:flex;justify-content:space-between;align-items:center;">
                                <span style="font-weight:600;font-size:0.85rem;color:var(--text-primary);">제${num}회 (${electionYears[num]})</span>
                                ${isUncontested ? '<span style="font-size:0.65rem;color:var(--text-muted);background:var(--bg-tertiary);padding:1px 6px;border-radius:3px;">무투표 당선</span>' : ''}
                            </div>
                            <div style="padding:12px;">
                    `;

                    if (isUncontested) {
                        const w = sorted[0];
                        const pc = ElectionData.getPartyColor(w.party || _partyNameToKey(w.partyName) || 'independent');
                        const pn = w.partyName || ElectionData.getPartyName(w.party || 'independent');
                        html += `
                            <div style="display:flex;align-items:center;gap:8px;">
                                <span style="font-size:0.85rem;color:${pc};font-weight:600;">${w.name}</span>
                                <span style="padding:1px 6px;border-radius:3px;font-size:0.65rem;background:${pc};color:white;">${pn}</span>
                                <span style="font-size:0.75rem;color:var(--text-muted);margin-left:auto;">무투표 당선</span>
                            </div>
                        `;
                    } else {
                        sorted.forEach(w => {
                            const pc = ElectionData.getPartyColor(w.party || _partyNameToKey(w.partyName) || 'independent');
                            const pn = w.partyName || ElectionData.getPartyName(w.party || 'independent');
                            const barW = maxVotes > 0 ? (w.votes / maxVotes * 100) : 0;
                            const rateText = (w.rate && w.rate !== '0') ? `${w.rate}%` : '';

                            html += `
                                <div style="margin-bottom:var(--space-12);">
                                    <div style="display:flex;align-items:baseline;gap:var(--space-6);margin-bottom:var(--space-4);">
                                        <span style="font-size:var(--text-title);font-weight:var(--font-bold);color:var(--text-primary);">${w.name || pn}</span>
                                        <span style="font-size:var(--text-caption);color:${pc};">${pn}</span>
                                        <span style="margin-left:auto;font-size:var(--text-title);font-weight:var(--font-bold);color:var(--text-primary);">${rateText || w.votes.toLocaleString()}</span>
                                    </div>
                                    <div style="height:8px;background:rgba(255,255,255,0.04);border-radius:4px;overflow:hidden;">
                                        <div style="width:${barW}%;height:100%;background:${pc};border-radius:4px;transition:width 0.6s cubic-bezier(0.4,0,0.2,1);"></div>
                                    </div>
                                </div>
                            `;
                        });
                    }

                    html += `</div></div>`;
                });

                if (!hasAny) {
                    html += `<div class="district-no-data"><p>이 선거구의 역대 결과를 찾을 수 없습니다.</p></div>`;
                }

                html += `</div>`;
                container.innerHTML = html;
                return;
            }

            // 기초의원: 5~8회 전체 나열
            const lcNums = [8, 7, 6, 5];
            const lcYears = {8:2022, 7:2018, 6:2014, 5:2010};
            const lcNormalized = districtName.replace(/\s+/g, '');

            let lcHtml = `<div class="panel-section">
                <h4 style="color:var(--text-secondary);margin-bottom:12px;">
                    <i class="fas fa-history" style="margin-right:6px;"></i> 역대 기초의원 선거 결과
                </h4>
                <p style="font-size:0.75rem;color:var(--text-muted);margin-bottom:10px;">
                    <i class="fas fa-info-circle" style="margin-right:4px;"></i>선거구 경계가 이전 선거와 다를 수 있습니다.
                </p>`;

            let lcHasAny = false;
            lcNums.forEach(num => {
                const key = num === 8 ? 'local_council' : `local_council_${num}`;
                const regionData = data[key]?.[regionKey] || {};

                // 선거구명 매칭 (시군구 > 선거구)
                let winners = [];
                for (const [sgg, districts] of Object.entries(regionData)) {
                    if (!districts || typeof districts !== 'object') continue;
                    for (const [dk, dv] of Object.entries(districts)) {
                        if (dk === districtName || dk.replace(/\s+/g, '') === lcNormalized) {
                            winners = dv;
                            break;
                        }
                    }
                    if (winners.length) break;
                }

                if (!winners.length) {
                    // 현직자 있으면 무투표 당선 표시
                    if (num === 8) {
                        const inc = ElectionData.getCouncilCandidates?.(regionKey, districtName, 'localCouncil') || [];
                        const currentInc = inc.filter(c => c.isIncumbent);
                        if (currentInc.length > 0) {
                            lcHasAny = true;
                            lcHtml += `
                                <div style="margin-bottom:16px;border:1px solid var(--border-color);border-radius:8px;overflow:hidden;">
                                    <div style="padding:8px 12px;background:var(--bg-secondary);border-bottom:1px solid var(--border-color);display:flex;justify-content:space-between;align-items:center;">
                                        <span style="font-weight:600;font-size:0.85rem;color:var(--text-primary);">제8회 (2022)</span>
                                        <span style="font-size:0.65rem;color:var(--text-muted);background:var(--bg-tertiary);padding:1px 6px;border-radius:3px;">무투표 당선</span>
                                    </div>
                                    <div style="padding:12px;">
                                        ${currentInc.map(c => {
                                            const pc = ElectionData.getPartyColor(c.party || 'independent');
                                            const pn = ElectionData.getPartyName(c.party || 'independent');
                                            return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                                                <span style="font-size:0.85rem;color:${pc};font-weight:600;">${c.name}</span>
                                                <span style="padding:1px 6px;border-radius:3px;font-size:0.65rem;background:${pc};color:white;">${pn}</span>
                                            </div>`;
                                        }).join('')}
                                    </div>
                                </div>`;
                        }
                    }
                    return;
                }
                lcHasAny = true;

                const sorted = [...winners].sort((a, b) => b.votes - a.votes);
                const maxVotes = sorted[0]?.votes || 1;
                const isUncontested = sorted.length === 1 && (!sorted[0].votes || sorted[0].rate === '0');

                lcHtml += `
                    <div style="margin-bottom:16px;border:1px solid var(--border-color);border-radius:8px;overflow:hidden;">
                        <div style="padding:8px 12px;background:var(--bg-secondary);border-bottom:1px solid var(--border-color);display:flex;justify-content:space-between;align-items:center;">
                            <span style="font-weight:600;font-size:0.85rem;color:var(--text-primary);">제${num}회 (${lcYears[num]})</span>
                            ${isUncontested ? '<span style="font-size:0.65rem;color:var(--text-muted);background:var(--bg-tertiary);padding:1px 6px;border-radius:3px;">무투표 당선</span>' : ''}
                        </div>
                        <div style="padding:12px;">
                `;

                if (isUncontested) {
                    const w = sorted[0];
                    const pc = ElectionData.getPartyColor(w.party || _partyNameToKey(w.partyName) || 'independent');
                    const pn = w.partyName || ElectionData.getPartyName(w.party || 'independent');
                    lcHtml += `
                        <div style="display:flex;align-items:center;gap:8px;">
                            <span style="font-size:0.85rem;color:${pc};font-weight:600;">${w.name}</span>
                            <span style="padding:1px 6px;border-radius:3px;font-size:0.65rem;background:${pc};color:white;">${pn}</span>
                            <span style="font-size:0.75rem;color:var(--text-muted);margin-left:auto;">무투표 당선</span>
                        </div>`;
                } else {
                    sorted.forEach(w => {
                        const pc = ElectionData.getPartyColor(w.party || _partyNameToKey(w.partyName) || 'independent');
                        const pn = w.partyName || ElectionData.getPartyName(w.party || 'independent');
                        const barW = maxVotes > 0 ? (w.votes / maxVotes * 100) : 0;
                        const rateText = (w.rate && w.rate !== '0') ? `${w.rate}%` : '';
                        lcHtml += `
                            <div style="margin-bottom:var(--space-12);">
                                <div style="display:flex;align-items:baseline;gap:var(--space-6);margin-bottom:var(--space-4);">
                                    <span style="font-size:var(--text-title);font-weight:var(--font-bold);color:var(--text-primary);">${w.name || pn}</span>
                                    <span style="font-size:var(--text-caption);color:${pc};">${pn}</span>
                                    <span style="margin-left:auto;font-size:var(--text-title);font-weight:var(--font-bold);color:var(--text-primary);">${rateText || w.votes.toLocaleString()}</span>
                                </div>
                                <div style="height:8px;background:rgba(255,255,255,0.04);border-radius:4px;overflow:hidden;">
                                    <div style="width:${barW}%;height:100%;background:${pc};border-radius:4px;transition:width 0.6s cubic-bezier(0.4,0,0.2,1);"></div>
                                </div>
                            </div>`;
                    });
                }

                lcHtml += `</div></div>`;
            });

            if (!lcHasAny) {
                lcHtml += `<div class="district-no-data"><p>이 선거구의 역대 결과를 찾을 수 없습니다.</p></div>`;
            }

            lcHtml += `</div>`;
            container.innerHTML = lcHtml;
            return;
        });
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
