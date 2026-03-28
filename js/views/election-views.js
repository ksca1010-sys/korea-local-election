/**
 * ElectionViews — Election type view renderers extracted from app.js
 * Each function renders a specific election-type view in the side panel.
 */
const ElectionViews = (() => {

    function buildRegionBadge(region) {
        const badges = [];
        if (region.isAppointedOnly) {
            badges.push('임명직(선출 대상 아님)');
        }
        if (region.actingHead?.name) {
            badges.push(`권한대행 ${region.actingHead.name}`);
        }
        if (region.specialNotes?.length) {
            badges.push(region.specialNotes.join(' · '));
        }
        return badges.join(' · ');
    }

    function updateRegionBadge(region) {
        const badgeEl = document.getElementById('panel-region-badge');
        if (!badgeEl) return;
        const text = buildRegionBadge(region);
        if (!text) {
            badgeEl.style.display = 'none';
            badgeEl.textContent = '';
            return;
        }
        badgeEl.textContent = text;
        badgeEl.style.display = '';
    }

    // ============================================
    // Governor View (광역단체장)
    // ============================================
    function renderGovernorView(regionKey, region) {
        // 전남광주통합특별시: jeonnam → gwangju redirect for governor
        if (regionKey === 'jeonnam') {
            const gwangju = ElectionData.getRegion('gwangju');
            if (gwangju) {
                AppState.currentRegionKey = 'gwangju';
                renderGovernorView('gwangju', gwangju);
                return;
            }
        }

        const displayName = regionKey === 'gwangju' ? '전남광주통합특별시' : region.name;
        document.getElementById('panel-region-name').textContent = displayName;
        document.getElementById('panel-region-info').textContent =
            `유권자 ${(region.voters / 10000).toFixed(0)}만명 | ${region.subRegions}개 시군구 | 후보 ${region.candidates.length}명`;

        // Show standard tabs
        Sidebar.configurePanelTabs(['overview', 'polls', 'candidates', 'news', 'history']);
        Sidebar.toggleSuperintendentSummary(false);

        if (typeof OverviewTab !== 'undefined') {
            OverviewTab.render(regionKey, AppState.currentElectionType, AppState.currentDistrictName);
        }
        // 뉴스탭은 lazy 로딩 — 탭 전환 시 renderNewsTab 호출 (API 쿼터 절약)
        AppState._newsTabPendingRegion = regionKey;
    }

    // ============================================
    // ByElection Province View (재보궐 — 시도 선택 시)
    // ============================================
    function renderByElectionProvinceView(regionKey, region) {
        const byeDistricts = ElectionData.getByElectionDistrictsForRegion
            ? ElectionData.getByElectionDistrictsForRegion(regionKey)
            : [];
        const count = byeDistricts.length;

        document.getElementById('panel-region-name').textContent = region.name;
        document.getElementById('panel-region-info').textContent =
            count > 0
                ? `재보궐선거 ${count}개 선거구 | 지도에서 선거구를 선택하세요`
                : `이 지역에 예정된 재보궐선거가 없습니다`;

        Sidebar.configurePanelTabs(['overview', 'candidates', 'news']);

        const govContainer = document.getElementById('current-governor');
        if (govContainer) {
            if (count === 0) {
                govContainer.innerHTML = `<div class="empty-message"><i class="fas fa-info-circle"></i> 이 광역에 예정된 재보궐선거가 없습니다.</div>`;
            } else {
                govContainer.innerHTML = byeDistricts.map(d => `
                    <div class="bye-district-card" data-bye-key="${d.key}" style="padding:12px;border-radius:8px;background:var(--bg-elevated);border:1px solid var(--border-primary);margin-bottom:8px;cursor:pointer;">
                        <strong>${d.district}</strong>
                        <span style="color:var(--text-muted);font-size:0.8rem;margin-left:8px;">${d.type || ''} · 후보 ${d.candidates?.length || 0}명</span>
                    </div>
                `).join('');
                govContainer.querySelectorAll('.bye-district-card').forEach(card => {
                    card.addEventListener('click', () => {
                        const key = card.dataset.byeKey;
                        if (key) onByElectionSelected(key);
                    });
                });
            }
        }

        if (typeof OverviewTab !== 'undefined') {
            OverviewTab.render(regionKey, AppState.currentElectionType, AppState.currentDistrictName);
        }
        AppState._newsTabPendingRegion = regionKey;
    }

    // ============================================
    // Superintendent View (교육감)
    // ============================================
    function renderSuperintendentView(regionKey, region) {
        // 전남광주통합특별시: jeonnam → gwangju redirect for superintendent
        if (regionKey === 'jeonnam') {
            const gwangju = ElectionData.getRegion('gwangju');
            if (gwangju) {
                AppState.currentRegionKey = 'gwangju';
                renderSuperintendentView('gwangju', gwangju);
                return;
            }
        }

        const data = ElectionData.getSuperintendentData(regionKey);

        const displayName = regionKey === 'gwangju' ? '전남광주통합특별시' : region.name;
        document.getElementById('panel-region-name').textContent = `${displayName} 교육감`;
        document.getElementById('panel-region-info').textContent =
            `교육감 선거 | 후보 ${data ? data.candidates.length : 0}명 | 정당 추천 없음`;

        Sidebar.configurePanelTabs(['overview', 'polls', 'candidates', 'news', 'history']);
        Sidebar.toggleSuperintendentSummary(true);

        // Render superintendent overview
        renderSuperintendentOverview(regionKey, region, data);
        if (typeof OverviewTab !== 'undefined') {
            OverviewTab.render(regionKey, AppState.currentElectionType, AppState.currentDistrictName);
        }
        // 뉴스탭은 lazy 로딩 — 탭 전환 시 renderNewsTab 호출 (API 쿼터 절약)
        AppState._newsTabPendingRegion = regionKey;
    }

    function renderSuperintendentOverview(regionKey, region, data) {
        const summaryContainer = document.getElementById('superintendent-summary');
        if (summaryContainer) summaryContainer.innerHTML = '';
        if (!data) return;

        const prevContainer = document.getElementById('prev-election-result');
        if (prevContainer) {
            prevContainer.innerHTML = `
                <div class="superintendent-candidates">
                    <h5 style="color:var(--text-secondary);margin-bottom:8px;">교육감 후보</h5>
                    ${data.candidates.map(c => {
                        const stanceColor = ElectionData.getSuperintendentColor(c.stance);
                        return `
                            <div class="candidate-card" style="margin-bottom:8px;padding:10px;border-radius:8px;background:var(--bg-secondary);border-left:3px solid ${stanceColor}">
                                <div style="display:flex;align-items:center;justify-content:space-between;">
                                    <div>
                                        <strong style="color:var(--text-primary)">${c.name}</strong>
                                        <span class="party-badge" style="background:${stanceColor};display:inline-block;padding:1px 6px;border-radius:3px;font-size:0.7rem;color:white;margin-left:6px">${c.stance}</span>
                                    </div>
                                    ${c.age ? `<span style="color:var(--text-muted);font-size:0.8rem">${c.age}세</span>` : ''}
                                </div>
                                <div style="color:var(--text-muted);font-size:0.8rem;margin-top:4px">${c.career}</div>
                                ${c.pledges ? `<div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:4px">${c.pledges.map(p => `<span class="issue-tag" style="font-size:0.7rem">${p}</span>`).join('')}</div>` : ''}
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        }

        const govContainer = document.getElementById('current-governor');
        if (govContainer) {
            // Show poll data if available
            govContainer.innerHTML = '';
        }

        const issuesContainer = document.getElementById('key-issues');
        if (issuesContainer && data.keyIssues) {
            issuesContainer.innerHTML = `
                <div class="issues-list">
                    ${data.keyIssues.map(issue => `<span class="issue-tag">${issue}</span>`).join('')}
                </div>
            `;
        }

        if (summaryContainer) {
            const cur = data.currentSuperintendent;
            const incumbentName = cur ? cur.name : (data.candidates[0]?.name || '정보 없음');
            const incumbentStance = cur?.stance || '';
            const incumbentNote = cur?.note || cur?.career || '현직 교육감 데이터 없음';
            const stanceColor = cur ? ElectionData.getSuperintendentColor(cur.stance) : '#888';
            const votersText = region?.voters ? `${(region.voters / 10000).toFixed(1)}만명` : '데이터 없음';
            const turnoutText = region?.prevElection?.turnout ? `${region.prevElection.turnout}%` : '정보 없음';

            summaryContainer.innerHTML = `
                <div class="info-grid">
                    <div class="info-card">
                        <span class="info-label">현직 교육감</span>
                        <strong class="info-value">${incumbentName}
                            ${incumbentStance ? `<span style="display:inline-block;padding:1px 6px;border-radius:3px;font-size:0.7rem;color:white;background:${stanceColor};margin-left:4px">${incumbentStance}</span>` : ''}
                        </strong>
                        <p class="info-note">${incumbentNote}</p>
                    </div>
                    <div class="info-card">
                        <span class="info-label">유권자</span>
                        <strong class="info-value">${votersText}</strong>
                        <p class="info-note">2026 제9회 기준</p>
                    </div>
                    <div class="info-card">
                        <span class="info-label">지난 투표율</span>
                        <strong class="info-value">${turnoutText}</strong>
                        <p class="info-note">제8회 지방선거</p>
                    </div>
                </div>
            `;
        }
    }

    function renderRegionIssuesHtml(regionKey) {
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

    const proportionalConfig = {
        councilProportional: {
            label: '광역의원 비례대표',
            getData: () => ElectionData.getProportionalCouncilData()
        },
        localCouncilProportional: {
            label: '기초의원 비례대표',
            getData: () => ElectionData.getProportionalLocalCouncilData()
        }
    };

    function renderProportionalView(regionKey, region, typeKey) {
        const config = proportionalConfig[typeKey];
        const label = config?.label || '비례대표';

        document.getElementById('panel-region-name').textContent = `${region.name} ${label}`;
        document.getElementById('panel-region-info').textContent = `${label} · 정당 투표로 의석 배분`;

        Sidebar.configurePanelTabs(['overview', 'candidates', 'news', 'history']);
        Sidebar.toggleSuperintendentSummary(false);

        // district-detail 숨기기 (비례대표에서는 불필요)
        const districtDetail = document.getElementById('district-detail');
        if (districtDetail) districtDetail.style.display = 'none';
        const ovSummary = document.getElementById('overview-summary');
        if (ovSummary) ovSummary.innerHTML = '';
        const ovIssues = document.getElementById('overview-key-issues');
        if (ovIssues) ovIssues.innerHTML = '';
        const ovRisk = document.getElementById('overview-risk-factor');
        if (ovRisk) ovRisk.innerHTML = '';

        // ProportionalTab으로 개요 렌더링 위임 (개요 박스 + 현직자 정보 박스 모두 처리)
        if (typeof ProportionalTab !== 'undefined') {
            ProportionalTab.renderOverview(regionKey, typeKey);
        }

        const issuesContainer = document.getElementById('key-issues');
        if (issuesContainer) issuesContainer.innerHTML = '';

        // 뉴스탭은 lazy 로딩 — 탭 전환 시 renderNewsTab 호출 (API 쿼터 절약)
        AppState._newsTabPendingRegion = regionKey;
    }

    function renderCouncilProportionalView(regionKey, region) {
        Sidebar.toggleSuperintendentSummary(false);
        renderProportionalView(regionKey, region, 'councilProportional');
    }

    function renderLocalCouncilProportionalView(regionKey, region) {
        // 기초비례는 시군구 선택 전에는 정보탭을 열지 않음
        Sidebar.resetPanelToWelcome();
    }

    // ============================================
    // Mayor Province View (기초단체장 - 시도 선택 후)
    // ============================================
    function renderMayorProvinceView(regionKey, region) {
        document.getElementById('panel-region-name').textContent = `${region.name} 기초단체장`;
        document.getElementById('panel-region-info').textContent =
            `시군구를 선택하면 기초단체장 후보 정보를 확인할 수 있습니다.`;

        Sidebar.configurePanelTabs(['overview', 'candidates', 'news', 'history']);
        Sidebar.toggleSuperintendentSummary(false);

        // Overview shows instruction to select a district
        const prevContainer = document.getElementById('prev-election-result');
        if (prevContainer) {
            prevContainer.innerHTML = `
                <div style="text-align:center;padding:16px;">
                    <i class="fas fa-mouse-pointer" style="font-size:2rem;color:var(--accent-primary);margin-bottom:8px;display:block;"></i>
                    <p style="color:var(--text-secondary)">지도에서 시군구를 선택하면<br>해당 지역의 기초단체장 후보 정보를<br>확인할 수 있습니다.</p>
                </div>
            `;
        }

        const govContainer = document.getElementById('current-governor');
        if (govContainer) {
            const subRegions = ElectionData.getSubRegions(regionKey);
            govContainer.innerHTML = `
                <div style="color:var(--text-secondary);font-size:0.85rem;">
                    <strong>${region.name}</strong>에는 <strong>${subRegions.length}개</strong> 시군구가 있습니다.
                </div>
            `;
        }

        const issuesContainer = document.getElementById('key-issues');
        if (issuesContainer) {
            issuesContainer.innerHTML = renderRegionIssuesHtml(regionKey);
        }

        // 뉴스탭은 lazy 로딩 — 탭 전환 시 renderNewsTab 호출 (API 쿼터 절약)
        AppState._newsTabPendingRegion = regionKey;
    }

    // ============================================
    // Council Province View (광역의원 - 시도 선택 후)
    // ============================================
    function renderCouncilProvinceView(regionKey, region) {
        const councilData = ElectionData.getCouncilData(regionKey);
        const municipalities = councilData ? Object.entries(councilData.municipalities || {}) : [];

        document.getElementById('panel-region-name').textContent = `${region.name} 광역의원`;
        document.getElementById('panel-region-info').textContent =
            `광역의원 지역구 ${councilData ? councilData.districts.length : 0}개`;

        Sidebar.configurePanelTabs(['overview', 'polls', 'candidates', 'news', 'history']);
        Sidebar.toggleSuperintendentSummary(false);

        const prevContainer = document.getElementById('prev-election-result');
        if (prevContainer) {
            const districtCount = councilData ? councilData.districts.length : 0;
            prevContainer.innerHTML = `
                <div style="text-align:center;padding:16px;">
                    <i class="fas fa-map-marked-alt" style="font-size:2rem;color:var(--accent-primary);margin-bottom:8px;display:block;"></i>
                    <p style="color:var(--text-secondary)">지도에서 시군구를 클릭하면<br>해당 지역의 광역의원 선거구를<br>확인할 수 있습니다.</p>
                    <p style="color:var(--text-muted);font-size:0.8rem;margin-top:8px;">${municipalities.length}개 시군구 · ${districtCount}개 선거구</p>
                </div>
            `;
        }

        const govContainer = document.getElementById('current-governor');
        if (govContainer) govContainer.innerHTML = '';
        const issuesContainer = document.getElementById('key-issues');
        if (issuesContainer) issuesContainer.innerHTML = '';

        // 뉴스탭은 lazy 로딩 — 탭 전환 시 renderNewsTab 호출 (API 쿼터 절약)
        AppState._newsTabPendingRegion = regionKey;
    }

    function showCouncilMunicipalityDetail(regionKey, municipality) {
        const councilData = ElectionData.getCouncilData(regionKey);
        const constituencies = councilData?.municipalities?.[municipality] || [];
        const totalCandidates = constituencies.reduce((sum, c) => sum + (c.members?.length || c.candidates?.length || 0), 0);

        // 후보 데이터 lazy-load
        ElectionData.loadCouncilCandidates?.(regionKey, 'council');

        document.getElementById('panel-region-name').textContent = `${municipality} 광역의원`;
        document.getElementById('panel-region-info').textContent = `${constituencies.length}개 지역구 · ${totalCandidates}명`;
        Sidebar.configurePanelTabs(['overview', 'polls', 'candidates', 'news', 'history']);
        Sidebar.toggleSuperintendentSummary(false);

        const prevContainer = document.getElementById('prev-election-result');
        if (prevContainer) {
            if (!constituencies.length) {
                prevContainer.innerHTML = '<p style="color:var(--text-muted);text-align:center">선거구 데이터가 없습니다.</p>';
            } else {
                let html = `
                    <div style="padding:8px 10px;margin-bottom:10px;border-radius:6px;background:var(--accent-primary)08;border:1px solid var(--accent-primary)22;font-size:0.85rem;color:var(--text-secondary);text-align:center;">
                        <i class="fas fa-map-marked-alt" style="color:var(--accent-primary);margin-right:4px;"></i>
                        ${constituencies.length}개 선거구 · 선거구를 클릭하면 후보 정보를 확인할 수 있습니다.
                    </div>
                    <div class="constituency-list" style="display:flex;flex-wrap:wrap;gap:6px;">
                `;
                constituencies.forEach(c => {
                    const pc = ElectionData.getPartyColor(c.leadParty || 'independent');
                    const memberCount = c.members?.length || c.candidates?.length || 0;
                    html += `<button class="constituency-chip" data-constituency="${c.name}" style="
                        padding:6px 12px;border-radius:6px;cursor:pointer;
                        background:${pc}12;border:1px solid ${pc}44;color:var(--text-primary);
                        font-size:0.8rem;transition:background 0.15s;">
                        ${c.name} <span style="color:var(--text-muted);font-size:0.7rem;">(${memberCount}명)</span>
                    </button>`;
                });
                html += `</div>`;
                prevContainer.innerHTML = html;

                prevContainer.querySelectorAll('.constituency-chip').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const constituencyName = btn.dataset.constituency;
                        App.onConstituencySelected(regionKey, municipality, constituencyName);
                    });
                });
            }
        }

        if (typeof MapModule !== 'undefined' && MapModule.switchToConstituencyGrid) {
            MapModule.switchToConstituencyGrid(regionKey, municipality);
        }

        if (constituencies.length > 0) {
            showCouncilConstituencyDetail(regionKey, municipality, constituencies[0]);
        }
    }

    function showCouncilConstituencyDetail(regionKey, municipality, district) {
        App.onConstituencySelected(regionKey, municipality, district.name);
    }

    function showCouncilSubdistrictPanel(regionKey, districtName) {
        document.getElementById('panel-region-name').textContent = `${districtName} 읍면동`;
        document.getElementById('panel-region-info').textContent = '읍면동 경계를 확인하세요.';

        Sidebar.configurePanelTabs(['overview', 'news']);
        Sidebar.toggleSuperintendentSummary(false);

        const prevContainer = document.getElementById('prev-election-result');
        if (prevContainer) {
            const hasSubdistrict = MapModule?.hasSubdistrictData?.(regionKey);
            prevContainer.innerHTML = `
                <div style="text-align:center;padding:16px;">
                    <i class="fas fa-map-pin" style="font-size:2rem;color:var(--accent-blue);margin-bottom:8px;"></i>
                    <p style="color:var(--text-secondary)">
                        ${hasSubdistrict
                            ? '지도에서 읍면동을 클릭하면 상세 정보가 표시됩니다.'
                            : '현재 서울을 제외한 지역은 읍면동 경계 데이터가 준비되지 않았습니다.'}
                    </p>
                </div>
            `;
        }

        const issuesContainer = document.getElementById('key-issues');
        if (issuesContainer) {
            issuesContainer.innerHTML = `<div class="issues-list"><span class="issue-tag">읍면동 단위 정보 준비 중</span></div>`;
        }

        App.switchTabForRegion();
        App.openPanel();
    }

    // ============================================
    // Local Council Province View (기초의원 - 시도 선택 후)
    // ============================================
    function renderLocalCouncilProvinceView(regionKey, region) {
        document.getElementById('panel-region-name').textContent = `${region.name} 기초의원`;
        document.getElementById('panel-region-info').textContent =
            `시군구를 선택하면 기초의원 선거구를 확인할 수 있습니다.`;

        Sidebar.configurePanelTabs(['overview', 'polls', 'candidates', 'news', 'history']);
        Sidebar.toggleSuperintendentSummary(false);

        const prevContainer = document.getElementById('prev-election-result');
        if (prevContainer) {
            prevContainer.innerHTML = `
                <div style="text-align:center;padding:16px;">
                    <i class="fas fa-mouse-pointer" style="font-size:2rem;color:var(--accent-primary);margin-bottom:8px;display:block;"></i>
                    <p style="color:var(--text-secondary)">지도에서 시군구를 선택하면<br>해당 지역의 기초의원 선거구별<br>후보 정보를 확인할 수 있습니다.</p>
                </div>
            `;
        }

        const govContainer = document.getElementById('current-governor');
        if (govContainer) govContainer.innerHTML = '';
        const issuesContainer = document.getElementById('key-issues');
        if (issuesContainer) issuesContainer.innerHTML = '';

        // 뉴스탭은 lazy 로딩 — 탭 전환 시 renderNewsTab 호출 (API 쿼터 절약)
        AppState._newsTabPendingRegion = regionKey;
    }

    // ============================================
    // By-election Selected Handler
    // ============================================
    function onByElectionSelected(key) {
        const data = ElectionData.getByElectionData(key);
        if (!data) return;

        AppState.currentElectionType = 'byElection';
        AppState.currentDistrictName = key; // byelection key로 저장 (개요 매칭용)

        Sidebar.toggleSuperintendentSummary(false);
        const welcome = document.getElementById('panel-welcome');
        if (welcome) welcome.style.display = 'none';

        const _ph = document.querySelector('.panel-header');
        if (_ph) _ph.style.display = '';
        const _pt = document.querySelector('.panel-tabs');
        if (_pt) _pt.style.display = '';

        document.getElementById('panel-region-name').textContent = data.district;
        document.getElementById('panel-region-info').textContent =
            `${data.subType || '재보궐선거'} | ${data.type} | 후보 ${data.candidates.length}명`;

        Sidebar.configurePanelTabs(['overview', 'polls', 'candidates', 'news', 'history']);

        // ── 재보궐 개요: 계획안 구조대로 렌더링 ──
        const subTypeColor = '#f59e0b';
        const prevElection = data.prevElection || {};
        const prevMember = data.previousMember || {};
        const prevColor = ElectionData.getPartyColor(prevMember.party || 'independent');
        const winColor = ElectionData.getPartyColor(prevElection.winner || 'independent');
        const runColor = ElectionData.getPartyColor(prevElection.runner || 'independent');

        // ① "이 선거가 열리는 이유" → current-governor 영역에 표시
        const govContainer = document.getElementById('current-governor');
        if (govContainer) {
            govContainer.innerHTML = `
                <h5 style="color:${subTypeColor};margin-bottom:10px;"><i class="fas fa-bolt"></i> 이 선거가 열리는 이유</h5>
                <div style="padding:12px;border-radius:8px;background:${subTypeColor}08;border:1px solid ${subTypeColor}25;margin-bottom:12px;">
                    <p style="color:var(--text-secondary);font-size:0.85rem;line-height:1.6;margin:0;">
                        ${prevMember.name ? `<strong>${prevMember.name}</strong> 의원(${ElectionData.getPartyName(prevMember.party)})` : '전임 의원'}이
                        ${data.reason || '공석 사유 미확인'}하여
                        6.3 지방선거와 동시에 재보궐선거가 실시됩니다.
                    </p>
                    <div style="margin-top:10px;display:flex;gap:12px;flex-wrap:wrap;">
                        ${prevMember.name ? `
                        <div style="display:flex;align-items:center;gap:6px;">
                            <span style="color:var(--text-muted);font-size:0.75rem;">전임:</span>
                            <strong style="color:var(--text-primary);font-size:0.85rem;">${prevMember.name}</strong>
                            <span class="party-badge" style="background:${prevColor};padding:1px 6px;border-radius:3px;font-size:0.7rem;color:white;">${ElectionData.getPartyName(prevMember.party)}</span>
                        </div>` : ''}
                        <div style="display:flex;align-items:center;gap:6px;">
                            <span style="color:var(--text-muted);font-size:0.75rem;">유형:</span>
                            <span style="color:${subTypeColor};font-weight:600;font-size:0.8rem;">${data.subType || '보궐선거'}</span>
                        </div>
                    </div>
                </div>
            `;
        }

        // ② 지난 선거 결과 (22대 총선)
        const prevContainer = document.getElementById('prev-election-result');
        if (prevContainer) {
            prevContainer.innerHTML = `
                <h5 style="color:var(--text-secondary);margin-bottom:8px;"><i class="fas fa-history"></i> 지난 선거 결과 (제22대 총선)</h5>
                <div class="prev-result">
                    <div class="prev-winner">
                        <div class="name">${prevElection.winnerName || '?'}</div>
                        <span class="party-badge" style="background:${winColor}">${ElectionData.getPartyName(prevElection.winner)}</span>
                        <div class="rate" style="color:${winColor}">${prevElection.rate || 0}%</div>
                    </div>
                    ${prevElection.runnerName ? `
                    <div class="prev-vs">VS</div>
                    <div class="prev-winner">
                        <div class="name">${prevElection.runnerName}</div>
                        <span class="party-badge" style="background:${runColor}">${ElectionData.getPartyName(prevElection.runner)}</span>
                        <div class="rate" style="color:${runColor}">${prevElection.runnerRate || 0}%</div>
                    </div>` : ''}
                </div>
                ${prevElection.turnout ? `<div class="prev-turnout"><i class="fas fa-person-booth"></i> 투표율: ${prevElection.turnout}%</div>` : ''}
            `;
        }

        // ③ Key issues — 재보궐에서는 숨김
        const issuesContainer = document.getElementById('key-issues');
        if (issuesContainer) {
            issuesContainer.style.display = 'none';
            issuesContainer.innerHTML = '';
        }

        // 개요 카드 렌더링 (narrative)
        const regionKey = data.region || key.split('-')[0];
        AppState.currentRegionKey = regionKey;
        if (typeof OverviewTab !== 'undefined') {
            OverviewTab.render(regionKey, AppState.currentElectionType, AppState.currentDistrictName);
        }

        App.switchTabForRegion();
        App.openPanel();
    }

    // ============================================
    // Mayor District Detail (기초단체장 시군구 선택)
    // ============================================
    function showMayorDistrictDetail(regionKey, districtName) {
        const summary = ElectionData.getDistrictSummary(regionKey, districtName);
        const canonicalDistrict = ElectionData.getSubRegionByName(regionKey, districtName)?.name || districtName;
        const displayDistrict = summary?.name || districtName;
        AppState.currentDistrictName = canonicalDistrict;
        const mayorData = ElectionData.getMayorData(regionKey, canonicalDistrict);

        document.getElementById('panel-region-name').textContent = `${displayDistrict} 기초단체장`;
        document.getElementById('panel-region-info').textContent =
            `기초단체장 선거 | 후보 ${mayorData ? mayorData.candidates.length : 0}명`;

        Sidebar.configurePanelTabs(['overview', 'polls', 'candidates', 'news', 'history']);

        // prev-election-result, current-governor는 OverviewTab에서 처리

        const issuesContainer = document.getElementById('key-issues');
        if (issuesContainer) {
            const subRegion = ElectionData.getSubRegionByName(regionKey, canonicalDistrict);
            issuesContainer.innerHTML = `<div class="issues-list"><span class="issue-tag">${subRegion?.keyIssue || '지역 현안'}</span></div>`;
        }

        // 현직 정보 + 개요 카드 렌더링
        if (typeof OverviewTab !== 'undefined') {
            OverviewTab.render(regionKey, AppState.currentElectionType, AppState.currentDistrictName);
        }

        // 뉴스탭 lazy 로딩용
        AppState._newsTabPendingRegion = regionKey;

        App.switchTabForRegion();
        App.openPanel();

        // Update breadcrumb
        if (MapModule.updateBreadcrumb) {
            MapModule.updateBreadcrumb('district', regionKey, displayDistrict);
        }

        Router.updateHash({ usePushState: true });
    }

    // ============================================
    // Local Council District Detail (기초의원 시군구 선택)
    // ============================================
    function showLocalCouncilDistrictDetail(regionKey, districtName) {
        const lcData = ElectionData.getLocalCouncilData(regionKey, districtName);

        // 후보 데이터 lazy-load
        ElectionData.loadCouncilCandidates?.(regionKey, 'localCouncil');

        document.getElementById('panel-region-name').textContent = `${districtName} 기초의원`;
        document.getElementById('panel-region-info').textContent =
            `기초의원 선거구 ${lcData ? lcData.districts.length : 0}개 | 총 ${lcData ? lcData.totalSeats : 0}석`;

        Sidebar.configurePanelTabs(['overview', 'polls', 'candidates', 'news', 'history']);

        const prevContainer = document.getElementById('prev-election-result');
        if (prevContainer && lcData) {
            let html = `
                <div style="padding:10px;margin-bottom:12px;border-radius:8px;background:var(--accent-primary)08;border:1px solid var(--accent-primary)22;text-align:center;">
                    <i class="fas fa-users" style="color:var(--accent-primary);margin-right:4px;"></i>
                    <strong>${lcData.districts.length}</strong>개 선거구 · 총 <strong>${lcData.totalSeats}</strong>석
                    <span style="color:var(--text-muted);font-size:0.8rem;display:block;margin-top:4px;">선거구를 클릭하면 후보 정보를 볼 수 있습니다.</span>
                </div>
                <div class="local-council-districts">
            `;
            lcData.districts.forEach(d => {
                const partyColor = ElectionData.getPartyColor(d.leadParty);
                const candidateCount = d.candidates ? d.candidates.length : 0;
                html += `
                    <button class="local-council-district-btn" data-constituency="${d.name}" style="
                        display:block;width:100%;text-align:left;cursor:pointer;
                        margin-bottom:8px;padding:10px 12px;border-radius:8px;
                        background:var(--bg-secondary);border:1px solid var(--border-color);
                        border-left:3px solid ${partyColor};
                        transition:background 0.15s;">
                        <div style="display:flex;justify-content:space-between;align-items:center;">
                            <strong style="color:var(--text-primary);font-size:0.9rem;">${d.name}</strong>
                            <div style="display:flex;align-items:center;gap:8px;">
                                <span style="color:var(--text-muted);font-size:0.75rem;">${d.seats}석 · ${candidateCount}명</span>
                                <i class="fas fa-chevron-right" style="color:var(--text-muted);font-size:0.65rem;"></i>
                            </div>
                        </div>
                        ${d.candidates && d.candidates.length > 0 ? `
                            <div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:4px;">
                                ${d.candidates.slice(0, 6).map(c => {
                                    const cColor = ElectionData.getPartyColor(c.party);
                                    return `<span style="font-size:0.75rem;padding:1px 6px;border-radius:3px;background:${cColor}15;color:${cColor};border:1px solid ${cColor}33;">${c.name}</span>`;
                                }).join('')}
                                ${d.candidates.length > 6 ? `<span style="font-size:0.75rem;color:var(--text-muted);">+${d.candidates.length - 6}</span>` : ''}
                            </div>
                        ` : ''}
                    </button>
                `;
            });
            html += `</div>`;
            prevContainer.innerHTML = html;

            // 선거구 클릭 이벤트
            prevContainer.querySelectorAll('.local-council-district-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const constituencyName = btn.dataset.constituency;
                    App.onConstituencySelected(regionKey, districtName, constituencyName);
                });
            });
        } else if (prevContainer) {
            prevContainer.innerHTML = `<p style="color:var(--text-muted);text-align:center;padding:16px;">기초의원 데이터를 준비 중입니다.</p>`;
        }

        const govContainer = document.getElementById('current-governor');
        if (govContainer) govContainer.innerHTML = '';
        const issuesContainer = document.getElementById('key-issues');
        if (issuesContainer) issuesContainer.innerHTML = '';

        App.switchTabForRegion();
        App.openPanel();

        if (MapModule.updateBreadcrumb) {
            MapModule.updateBreadcrumb('district', regionKey, districtName);
        }
    }

    // ============================================
    // Local Council Proportional District Detail (기초비례 시군구 선택)
    // ============================================
    function showLocalCouncilProportionalDetail(regionKey, districtName) {
        const region = ElectionData.getRegion(regionKey);
        const regionName = region?.name || '';

        AppState.currentDistrictName = districtName;

        document.getElementById('panel-region-name').textContent = `${districtName} 기초의원 비례대표`;
        document.getElementById('panel-region-info').textContent = `${regionName} ${districtName} · 정당 투표로 의석 배분`;

        Sidebar.configurePanelTabs(['overview', 'candidates', 'news', 'history']);
        Sidebar.toggleSuperintendentSummary(false);

        const welcome = document.getElementById('panel-welcome');
        if (welcome) welcome.style.display = 'none';

        const _ph = document.querySelector('.panel-header');
        if (_ph) _ph.style.display = '';
        const _pt = document.querySelector('.panel-tabs');
        if (_pt) _pt.style.display = '';

        // ProportionalTab으로 개요+현직자 렌더링 위임
        if (typeof ProportionalTab !== 'undefined') {
            ProportionalTab.render('overview', regionKey, districtName, 'localCouncilProportional');
        }

        const issuesContainer = document.getElementById('key-issues');
        if (issuesContainer) issuesContainer.innerHTML = '';

        // 뉴스탭은 lazy 로딩 — 탭 전환 시 renderNewsTab 호출 (API 쿼터 절약)
        AppState._newsTabPendingRegion = regionKey;

        App.switchTabForRegion();
        App.openPanel();

        if (MapModule.updateBreadcrumb) {
            MapModule.updateBreadcrumb('district', regionKey, districtName);
        }
    }

    function onSubdistrictSelected(regionKey, districtName, subdistrictName) {
        if (!subdistrictName) return;

        document.getElementById('panel-region-name').textContent = subdistrictName;
        document.getElementById('panel-region-info').textContent = `${districtName} 읍면동`;

        Sidebar.configurePanelTabs(['overview', 'news']);
        Sidebar.toggleSuperintendentSummary(false);

        const prevContainer = document.getElementById('prev-election-result');
        if (prevContainer) {
            prevContainer.innerHTML = `
                <div style="text-align:center;padding:16px;">
                    <i class="fas fa-info-circle" style="font-size:1.8rem;color:var(--accent-yellow);margin-bottom:8px;"></i>
                    <p style="color:var(--text-secondary)">읍면동 통계는 준비 중입니다. 지도에서 경계를 확인하거나 향후 업데이트를 기다려주세요.</p>
                </div>
            `;
        }

        const issuesContainer = document.getElementById('key-issues');
        if (issuesContainer) {
            issuesContainer.innerHTML = `<div class="issues-list"><span class="issue-tag">자료 업데이트 예정</span></div>`;
        }

        if (MapModule.updateBreadcrumb) {
            MapModule.updateBreadcrumb('subdistrict', regionKey, districtName, subdistrictName);
        }

        App.switchTabForRegion();
        App.openPanel();
    }

    return {
        buildRegionBadge, updateRegionBadge,
        renderGovernorView, renderByElectionProvinceView,
        renderSuperintendentView, renderSuperintendentOverview,
        renderRegionIssuesHtml,
        renderProportionalView, renderCouncilProportionalView, renderLocalCouncilProportionalView,
        renderMayorProvinceView,
        renderCouncilProvinceView, showCouncilMunicipalityDetail,
        showCouncilConstituencyDetail, showCouncilSubdistrictPanel,
        renderLocalCouncilProvinceView,
        showMayorDistrictDetail, showLocalCouncilDistrictDetail,
        showLocalCouncilProportionalDetail,
        onSubdistrictSelected,
        onByElectionSelected,
        proportionalConfig,
    };
})();
