// ============================================
// 6.3 전국지방선거 인터랙티브 선거 정보 지도
// App Module - Main Application Controller (Orchestrator)
// Delegates to: Sidebar, SearchModule, Router, ElectionViews, DistrictMapView
// ============================================

const App = (() => {
    const NEWS_FILTER_CONFIG = window.NewsFilterConfig || {};

    // ── Analytics ──
    const ANALYTICS_ENDPOINT = 'https://election-news-proxy.ksca1010.workers.dev/analytics';
    function trackEvent(event, data) {
        try {
            fetch(ANALYTICS_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ event, data, timestamp: new Date().toISOString() }),
                keepalive: true
            }).catch(() => {});
        } catch (_) {}
    }

    // ============================================
    // Initialization
    // ============================================
    async function init() {
        // ── Theme toggle ──
        const themeToggle = document.getElementById('theme-toggle');
        const themeIcon = document.getElementById('theme-icon');
        const savedTheme = localStorage.getItem('theme');

        if (savedTheme === 'light' || (!savedTheme && window.matchMedia('(prefers-color-scheme: light)').matches)) {
            document.documentElement.classList.add('light-mode');
            if (themeIcon) themeIcon.className = 'fas fa-moon';
        }

        if (themeToggle) {
            themeToggle.addEventListener('click', () => {
                const isLight = document.documentElement.classList.toggle('light-mode');
                localStorage.setItem('theme', isLight ? 'light' : 'dark');
                if (themeIcon) themeIcon.className = isLight ? 'fas fa-moon' : 'fas fa-sun';
                Sidebar.updateChartTheme();
                if (typeof MapModule !== 'undefined' && MapModule.refreshColors) {
                    MapModule.refreshColors();
                }
            });
        }

        // ── Font size: 18px 고정 ──
        document.documentElement.style.fontSize = '18px';

        // DataLoader: JSON 파일에서 최신 데이터 로드 → ElectionData에 hot-swap
        if (typeof DataLoader !== 'undefined') {
            try { await DataLoader.applyToElectionData(ElectionData); }
            catch(e) { console.warn('[init] DataLoader error:', e); }
        }

        // Render sidebar data (delegated to Sidebar module)
        Sidebar.renderDday();
        Sidebar.renderStats();
        Sidebar.renderNationalPartyBar();
        Sidebar.renderGallupSource();
        Sidebar.renderElectionCalendar();
        Sidebar.renderFooterPartyBar();
        Sidebar.setupFilterTooltips();
        Sidebar.setupFilterButtons();
        Sidebar.setupMobileFilterSheet();
        Sidebar.setupMobileElectionChips();
        setupMiniCard();
        Sidebar.toggleByelectionNote(false);
        Sidebar.setupBannerClose();

        // Load election stats first (선거구 수 → 필터 카운트 의존)
        try {
            await ElectionData.loadElectionStats?.();
            Sidebar.updateFilterCounts();
        } catch(e) { console.warn('loadElectionStats error:', e); }

        // 나머지 데이터 병렬 로딩 (모두 독립적)
        const dataLoads = [
            ['loadSuperintendentStatus', ElectionData.loadSuperintendentStatus?.()],
            ['loadSuperintendentCandidates', ElectionData.loadSuperintendentCandidates?.()],
            ['loadGovernorStatus', ElectionData.loadGovernorStatus?.()],
            ['loadMayorStatus', ElectionData.loadMayorStatus?.()],
            ['loadMayorCandidates', ElectionData.loadMayorCandidates?.()],
            ['loadCouncilSeats', ElectionData.loadCouncilSeats?.()],
            ['loadMayorHistory', ElectionData.loadMayorHistory?.()],
            ['loadCouncilMembersData', ElectionData.loadCouncilMembersData?.()],
            ['loadCandidatesData', ElectionData.loadCandidatesData?.()],
            ['loadByElectionData', ElectionData.loadByElectionData?.()],
        ];
        const results = await Promise.allSettled(dataLoads.map(([, p]) => p));
        const failures = [];
        results.forEach((r, i) => {
            if (r.status === 'rejected') {
                console.error(`[init] ${dataLoads[i][0]} 실패:`, r.reason);
                failures.push(dataLoads[i][0]);
            }
        });
        if (failures.length > 0) {
            showToast(`데이터 ${failures.length}건 로딩 실패 — 일부 정보가 표시되지 않을 수 있습니다`, 'warn', 5000);
        }

        // 모든 데이터 로드 완료 → 실제 데이터 기반 카운트 동기화
        try { Sidebar.syncCountsFromData(); } catch(e) { console.warn('[syncCounts] error:', e); }
        try { Sidebar.updateFilterCounts(); } catch(e) { console.warn('[filterCounts] error:', e); }
        SearchModule.invalidateSearchIndex();

        // Load local media pool (새 통합 풀) + 기존 registry + 지역 현안 키워드 → 병합
        try {
            const [poolResp, regResp, issuesResp] = await Promise.all([
                fetch('data/local_media_pool.json'),
                fetch('data/local_media_registry.json'),
                fetch('data/regional_issues.json'),
            ]);
            if (poolResp.ok) window.LocalMediaPool = await poolResp.json();
            if (regResp.ok) window.LocalMediaRegistry = await regResp.json();
            if (issuesResp.ok) {
                const issuesData = await issuesResp.json();
                window.REGIONAL_ISSUES = issuesData;
            }

            // 새 풀(local_media_pool.json)을 기존 registry에 완전 병합
            const pool = window.LocalMediaPool;
            const reg = window.LocalMediaRegistry;
            if (pool && reg?.regions) {
                const regionKeyMap = {
                    '서울특별시': 'seoul', '부산광역시': 'busan', '대구광역시': 'daegu',
                    '인천광역시': 'incheon', '광주광역시': 'gwangju', '대전광역시': 'daejeon',
                    '울산광역시': 'ulsan', '세종특별자치시': 'sejong', '경기도': 'gyeonggi',
                    '강원특별자치도': 'gangwon', '충청북도': 'chungbuk', '충청남도': 'chungnam',
                    '전북특별자치도': 'jeonbuk', '전라남도': 'jeonnam', '경상북도': 'gyeongbuk',
                    '경상남도': 'gyeongnam', '제주특별자치도': 'jeju',
                };
                for (const [metroName, rk] of Object.entries(regionKeyMap)) {
                    const metroEntry = pool.metro?.[metroName];
                    if (!metroEntry) continue;
                    if (!reg.regions[rk]) reg.regions[rk] = { province: {}, municipalities: {} };
                    if (!reg.regions[rk].province) reg.regions[rk].province = {};
                    const prov = reg.regions[rk].province;
                    const nameSet = new Set(prov.priorityNames || []);
                    (metroEntry.names || []).forEach(n => nameSet.add(n));
                    prov.priorityNames = [...nameSet];
                    if (!prov.hosts) prov.hosts = { tier1: [], tier2: [] };
                    const hostSet = new Set(prov.hosts.tier2 || []);
                    (metroEntry.hosts || []).forEach(h => hostSet.add(h));
                    prov.hosts.tier2 = [...hostSet];
                }
                const municipal = pool.municipal || {};
                for (const [muniName, muniData] of Object.entries(municipal)) {
                    const poolHosts = muniData.hosts || [];
                    const poolNames = muniData.names || [];
                    if (!poolHosts.length && !poolNames.length) continue;
                    for (const [rk, regionData] of Object.entries(reg.regions)) {
                        if (!regionData.municipalities) regionData.municipalities = {};
                        const munis = regionData.municipalities;
                        if (munis[muniName] || ElectionData.getSubRegionByName?.(rk, muniName)) {
                            if (!munis[muniName]) munis[muniName] = {};
                            const entry = munis[muniName];
                            const nameSet = new Set(entry.priorityNames || []);
                            poolNames.forEach(n => { if (n !== '인터넷신문') nameSet.add(n); });
                            entry.priorityNames = [...nameSet];
                            if (!entry.hosts) entry.hosts = { tier1: [], tier2: [] };
                            const hostSet = new Set(entry.hosts.tier2 || []);
                            poolHosts.forEach(h => hostSet.add(h));
                            entry.hosts.tier2 = [...hostSet];
                            break;
                        }
                    }
                }
            }
        } catch(e) { console.warn('LocalMedia load error:', e); }

        // Initialize map
        await MapModule.init();
        if (MapModule.setElectionType) MapModule.setElectionType(null);

        // Setup event listeners
        SearchModule.setupSearch();
        setupTabs();
        setupPanelClose();
        setupPanelResize();
        setupMobilePanelSwipe();
        setupHomeLink();

        // Load election terms for tooltips
        try {
            const termsResp = await fetch('data/static/election_terms.json');
            if (termsResp.ok) {
                window._electionTerms = await termsResp.json();
                Sidebar.applyTermTooltips(document.querySelector('.info-panel'));
            }
        } catch(e) { console.warn('[TermTooltips] load error:', e); }

        // Hide loading screen
        setTimeout(() => {
            const loading = document.getElementById('loading-screen');
            if (loading) {
                loading.classList.add('hidden');
                setTimeout(() => loading.remove(), 500);
            }
        }, 800);

        // 선거 캘린더 배너 초기 렌더링
        Sidebar.renderElectionBanner();

        // Update D-day + 배너 every hour
        setInterval(() => {
            if (!document.hidden) {
                Sidebar.renderDday();
                Sidebar.renderElectionCalendar();
                Sidebar.renderElectionBanner();
            }
        }, 60 * 60 * 1000);
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                Sidebar.renderDday();
                Sidebar.renderElectionBanner();
            }
        });

        // Initialize router (popstate listener) & restore from URL hash
        Router.init();
        Router.restoreFromHash();
    }

    // ============================================
    // Tabs
    // ============================================
    function setupTabs() {
        const tabs = document.querySelectorAll('.panel-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.dataset.tab;
                switchTab(tabName);
            });
        });

        const tabList = document.querySelector('.panel-tabs[role="tablist"]');
        if (tabList) {
            tabList.addEventListener('keydown', (e) => {
                const tabsArr = Array.from(tabs);
                const currentIdx = tabsArr.indexOf(document.activeElement);
                if (currentIdx === -1) return;
                let newIdx;
                if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                    newIdx = (currentIdx + 1) % tabsArr.length;
                } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                    newIdx = (currentIdx - 1 + tabsArr.length) % tabsArr.length;
                } else if (e.key === 'Home') {
                    newIdx = 0;
                } else if (e.key === 'End') {
                    newIdx = tabsArr.length - 1;
                } else {
                    return;
                }
                e.preventDefault();
                tabsArr[newIdx].focus();
                switchTab(tabsArr[newIdx].dataset.tab);
            });
        }
    }

    function switchTab(tabName) {
        AppState.currentTab = tabName;
        trackEvent('switchTab', {
            tab: tabName,
            electionType: AppState.currentElectionType,
            regionKey: AppState.currentRegionKey
        });
        Router.updateHash();

        document.querySelectorAll('.panel-tab').forEach(t => {
            const isActive = t.dataset.tab === tabName;
            t.classList.toggle('active', isActive);
            t.setAttribute('aria-selected', isActive ? 'true' : 'false');
            t.setAttribute('tabindex', isActive ? '0' : '-1');
        });

        document.querySelectorAll('.tab-content').forEach(tc => {
            tc.style.display = 'none';
        });
        const activeTab = document.getElementById(`tab-${tabName}`);
        if (activeTab) activeTab.style.display = 'block';

        const panelContent = document.querySelector('.panel-content');
        if (panelContent) panelContent.scrollTop = 0;

        // 탭 전환 시 로딩 표시
        const asyncTabs = ['polls', 'news', 'history'];
        if (asyncTabs.includes(tabName) && activeTab) {
            const hasContent = activeTab.querySelector('.news-live, .poll-card, .hpf-timeline, .news-error, .district-no-data');
            if (!hasContent) {
                activeTab.querySelectorAll('.panel-section').forEach(sec => {
                    if (!sec.innerHTML.trim()) {
                        sec.innerHTML = '<div class="panel-loading"><div class="panel-loading-spinner"></div></div>';
                    }
                });
            }
        }

        // 의원급 지역구 → CouncilTab에 위임
        if ((AppState.currentElectionType === 'council' || AppState.currentElectionType === 'localCouncil')
            && AppState.currentDistrictName && typeof CouncilTab !== 'undefined') {
            CouncilTab.render(tabName, AppState.currentRegionKey, AppState.currentDistrictName, AppState.currentElectionType);
            return;
        }

        // 비례대표 → ProportionalTab에 위임
        if ((AppState.currentElectionType === 'councilProportional' || AppState.currentElectionType === 'localCouncilProportional')
            && typeof ProportionalTab !== 'undefined') {
            ProportionalTab.render(tabName, AppState.currentRegionKey, AppState.currentDistrictName, AppState.currentElectionType);
            return;
        }

        // 기존 로직 (governor, mayor, superintendent, byElection)
        if (tabName === 'polls' && AppState.currentRegionKey) {
            if (typeof PollTab !== 'undefined') {
                PollTab.render(AppState.currentRegionKey, AppState.currentElectionType, AppState.currentDistrictName);
            }
        }

        if (tabName === 'candidates' && AppState.currentRegionKey) {
            const councilTypes = ['council', 'localCouncil', 'councilProportional', 'localCouncilProportional'];
            if (!councilTypes.includes(AppState.currentElectionType)) {
                if (typeof CandidateTab !== 'undefined') {
                    CandidateTab.render(AppState.currentRegionKey, AppState.currentElectionType, AppState.currentDistrictName);
                }
            }
        }

        if (tabName === 'news' && AppState.currentRegionKey) {
            const newsRegion = AppState._newsTabPendingRegion || AppState.currentRegionKey;
            AppState._newsTabPendingRegion = null;
            if (typeof NewsTab !== 'undefined') {
                NewsTab.render(newsRegion, AppState.currentElectionType, AppState.currentDistrictName);
            }
        }

        if (tabName === 'history' && AppState.currentRegionKey) {
            if (typeof HistoryTab !== 'undefined') {
                HistoryTab.render(AppState.currentRegionKey, AppState.currentElectionType, AppState.currentDistrictName);
            }
        }
    }

    // ============================================
    // Panel Management
    // ============================================
    function setupPanelClose() {
        const closeBtn = document.getElementById('panel-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', closePanel);
        }
    }

    function setupPanelResize() {
        const handle = document.getElementById('panel-resize-handle');
        const panel = document.getElementById('detail-panel');
        if (!handle || !panel) return;

        let isResizing = false;
        let startX = 0;
        let startWidth = 0;

        function startResize(x) {
            isResizing = true;
            startX = x;
            startWidth = panel.offsetWidth;
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        }
        function moveResize(x) {
            if (!isResizing) return;
            const diff = startX - x;
            const newWidth = Math.max(300, Math.min(800, startWidth + diff));
            panel.style.width = newWidth + 'px';
        }
        function endResize() {
            if (!isResizing) return;
            isResizing = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }

        handle.addEventListener('mousedown', (e) => { startResize(e.clientX); e.preventDefault(); });
        document.addEventListener('mousemove', (e) => moveResize(e.clientX));
        document.addEventListener('mouseup', endResize);
        handle.addEventListener('touchstart', (e) => { startResize(e.touches[0].clientX); e.preventDefault(); }, { passive: false });
        document.addEventListener('touchmove', (e) => { if (isResizing) moveResize(e.touches[0].clientX); }, { passive: true });
        document.addEventListener('touchend', endResize);
    }

    // ── 모바일 패널 3단 드래그 ──
    const PANEL_STAGES = ['collapsed', 'panel-peek', 'panel-half', 'panel-full'];
    const STAGE_HEIGHTS = { 'collapsed': 0, 'panel-peek': 30, 'panel-half': 50, 'panel-full': 85 };
    let _currentPanelStage = 'collapsed';

    function getPanelStage() { return _currentPanelStage; }

    function setPanelStage(stage, animate) {
        const panel = document.getElementById('detail-panel');
        if (!panel) return;

        if (animate !== false) {
            panel.classList.remove('panel-animating');
            void panel.offsetWidth;
            panel.classList.add('panel-animating');
            panel.addEventListener('transitionend', () => {
                panel.classList.remove('panel-animating');
            }, { once: true });
        }

        PANEL_STAGES.forEach(s => panel.classList.remove(s));
        panel.style.transform = '';
        panel.classList.add(stage);
        _currentPanelStage = stage;

        if (window.innerWidth <= 768) {
            const mapSection = document.getElementById('map-section');
            if (stage === 'panel-half' || stage === 'panel-full') {
                if (mapSection) mapSection.style.pointerEvents = 'none';
            } else {
                if (mapSection) mapSection.style.pointerEvents = '';
            }
        }
    }

    function setupMobilePanelSwipe() {
        const panel = document.getElementById('detail-panel');
        const header = panel?.querySelector('.panel-header');
        if (!panel || !header) return;

        let startY = 0;
        let startTranslateY = 0;
        let dragging = false;
        let dragStartStage = 'collapsed';
        let startTime = 0;

        function getPanelTotalH() {
            return (window.innerWidth > window.innerHeight) ? 80 : 85;
        }

        function getCurrentTranslateY() {
            const h = STAGE_HEIGHTS[_currentPanelStage] || 0;
            return (getPanelTotalH() - h) / 100 * window.innerHeight;
        }

        header.addEventListener('touchstart', (e) => {
            if (window.innerWidth > 768 || _currentPanelStage === 'collapsed') return;
            startY = e.touches[0].clientY;
            startTranslateY = getCurrentTranslateY();
            dragStartStage = _currentPanelStage;
            startTime = Date.now();
            dragging = true;
            panel.classList.remove('panel-animating');
        }, { passive: true });

        header.addEventListener('touchmove', (e) => {
            if (!dragging || window.innerWidth > 768) return;
            e.preventDefault();
            const dy = e.touches[0].clientY - startY;
            const newTY = Math.max(0, startTranslateY + dy);
            panel.style.transform = `translateY(${newTY}px)`;
            PANEL_STAGES.forEach(s => panel.classList.remove(s));
        }, { passive: false });

        function finishDrag(endY) {
            dragging = false;
            const dy = endY - startY;
            const elapsed = Date.now() - startTime;
            const speed = Math.abs(dy) / Math.max(elapsed, 1) * 1000;

            const currentTY = Math.max(0, startTranslateY + dy);
            const visibleVh = getPanelTotalH() - (currentTY / window.innerHeight * 100);

            let nextStage;
            if (speed > 400 && dy > 30) {
                const idx = PANEL_STAGES.indexOf(dragStartStage);
                nextStage = PANEL_STAGES[Math.max(0, idx - 1)] || 'collapsed';
            } else if (speed > 400 && dy < -30) {
                const idx = PANEL_STAGES.indexOf(dragStartStage);
                nextStage = PANEL_STAGES[Math.min(3, idx + 1)] || 'panel-full';
            } else {
                if (visibleVh < 15) nextStage = 'collapsed';
                else if (visibleVh < 40) nextStage = 'panel-peek';
                else if (visibleVh < 67) nextStage = 'panel-half';
                else nextStage = 'panel-full';
            }

            panel.style.transform = '';
            if (nextStage === 'collapsed') {
                closePanel();
            } else {
                setPanelStage(nextStage);
            }
        }

        header.addEventListener('touchend', (e) => {
            if (!dragging || window.innerWidth > 768) return;
            const endY = e.changedTouches[0]?.clientY || startY;
            finishDrag(endY);
        }, { passive: true });

        header.addEventListener('touchcancel', () => {
            if (!dragging) return;
            dragging = false;
            panel.style.transform = '';
            setPanelStage(dragStartStage);
        }, { passive: true });
    }

    // ── resize 시 모바일 ↔ 데스크톱 패널 상태 정리 ──
    let _prevIsMobile = window.innerWidth <= 768;
    window.addEventListener('resize', (() => {
        let timer;
        return () => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                const isMobile = window.innerWidth <= 768;
                if (isMobile === _prevIsMobile) return;
                _prevIsMobile = isMobile;

                const panel = document.getElementById('detail-panel');
                if (!panel) return;

                PANEL_STAGES.forEach(s => panel.classList.remove(s));
                panel.classList.remove('panel-animating');
                panel.style.transform = '';

                if (isMobile) {
                    if (AppState.regionSelected) {
                        setPanelStage('panel-half', false);
                    } else {
                        setPanelStage('collapsed', false);
                    }
                } else {
                    hideMiniCard();
                    _currentPanelStage = 'collapsed';
                    if (AppState.regionSelected) {
                        panel.classList.remove('collapsed');
                    } else {
                        panel.classList.add('collapsed');
                    }
                }
            }, 150);
        };
    })());

    function openPanel() {
        const panel = document.getElementById('detail-panel');
        if (!panel) return;
        hideMiniCard();
        if (window.innerWidth <= 768) {
            setPanelStage('panel-half');
        } else {
            panel.classList.remove('collapsed');
            panel.style.transform = '';
        }
    }

    function switchTabForRegion() {
        AppState._newsTabPendingRegion = AppState.currentRegionKey;
        if (AppState.regionSelected) {
            switchTab(AppState.currentTab);
        } else {
            switchTab('overview');
            AppState.regionSelected = true;
        }
    }

    function closePanel() {
        const panel = document.getElementById('detail-panel');
        if (!panel) return;
        if (window.innerWidth <= 768) {
            setPanelStage('collapsed');
        } else {
            panel.classList.add('collapsed');
        }
        AppState.currentRegionKey = null;
        AppState.currentDistrictName = null;
        AppState.regionSelected = false;
        hideMiniCard();

        const mapContainer = document.querySelector('#korea-map');
        if (mapContainer) {
            mapContainer.querySelectorAll('.region').forEach(r => r.classList.remove('selected'));
            mapContainer.querySelectorAll('.district').forEach(d => d.classList.remove('selected'));
        }
    }

    // ── 모바일 미니 카드 ──
    function showMiniCard(regionKey, region) {
        const card = document.getElementById('map-mini-card');
        const nameEl = document.getElementById('mini-card-region');
        const detailEl = document.getElementById('mini-card-detail');
        if (!card || !nameEl || !detailEl) return;

        const electionTypeNames = {
            governor: '광역단체장', superintendent: '교육감', mayor: '기초단체장',
            council: '광역의원', localCouncil: '기초의원',
            councilProportional: '광역비례', localCouncilProportional: '기초비례',
            byElection: '재보궐'
        };
        nameEl.textContent = region.name;
        detailEl.textContent = electionTypeNames[AppState.currentElectionType] || '';
        card.style.display = 'block';
    }

    function hideMiniCard() {
        const card = document.getElementById('map-mini-card');
        if (card) card.style.display = 'none';
    }

    function setupMiniCard() {
        const card = document.getElementById('map-mini-card');
        if (!card) return;
        card.addEventListener('click', () => {
            hideMiniCard();
            openPanel();
        });
    }

    // ============================================
    // Home Reset
    // ============================================
    function resetToHome() {
        Sidebar.toggleSuperintendentSummary(false);
        AppState.currentRegionKey = null;
        AppState.currentDistrictName = null;
        AppState.currentElectionType = null;
        hideMiniCard();

        const panel = document.getElementById('detail-panel');
        if (window.innerWidth <= 768) {
            if (panel) setPanelStage('collapsed', false);
        } else {
            if (panel) panel.classList.remove('collapsed');
        }

        const panelHeader = document.querySelector('.panel-header');
        if (panelHeader) panelHeader.style.display = 'none';
        const panelTabs = document.querySelector('.panel-tabs');
        if (panelTabs) panelTabs.style.display = 'none';

        const welcome = document.getElementById('panel-welcome');
        if (welcome) welcome.style.display = '';

        document.querySelectorAll('.tab-content').forEach(tab => {
            tab.style.display = 'none';
        });

        const overviewTab = document.querySelector('.panel-tab[data-tab="overview"]');
        if (overviewTab) {
            document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
            overviewTab.classList.add('active');
            AppState.currentTab = 'overview';
        }

        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.mobile-election-chip').forEach(c => c.classList.remove('active'));
        Sidebar.updateElectionTypeLabel(null);

        const searchInput = document.getElementById('region-search');
        if (searchInput) searchInput.value = '';
        const searchResults = document.getElementById('search-results');
        if (searchResults) searchResults.style.display = 'none';

        if (MapModule) {
            if (MapModule.setElectionType) MapModule.setElectionType(null);
            else if (MapModule.switchToProvinceMap) MapModule.switchToProvinceMap();
        }
        Sidebar.toggleByelectionNote(false);

        if (window.location.hash) {
            history.replaceState(null, '', window.location.pathname + window.location.search);
        }
    }

    function setupHomeLink() {
        const homeBtn = document.getElementById('home-link');
        if (!homeBtn) return;
        homeBtn.addEventListener('click', resetToHome);
    }

    // ============================================
    // Region Selected Handler
    // ============================================
    function onRegionSelected(regionKey, options = {}) {
        const region = ElectionData.getRegion(regionKey);
        if (!region) return;

        AppState.currentRegionKey = regionKey;
        AppState.currentDistrictName = null;

        // 기초의원/기초비례: 광역 선택 시 welcome 유지
        if (AppState.currentElectionType === 'localCouncilProportional' || AppState.currentElectionType === 'localCouncil') {
            if (options?.subDistrict) {
                if (AppState.currentElectionType === 'localCouncilProportional') {
                    ElectionViews.showLocalCouncilProportionalDetail(regionKey, options.subDistrict);
                } else {
                    ElectionViews.showLocalCouncilDistrictDetail(regionKey, options.subDistrict);
                }
                switchTabForRegion();
                openPanel();
            }
            return;
        }

        trackEvent('selectRegion', {
            regionKey,
            districtName: AppState.currentDistrictName,
            electionType: AppState.currentElectionType
        });

        // Hide welcome, show content
        const welcome = document.getElementById('panel-welcome');
        if (welcome) welcome.style.display = 'none';
        const panelHeader = document.querySelector('.panel-header');
        if (panelHeader) panelHeader.style.display = '';
        const panelTabs = document.querySelector('.panel-tabs');
        if (panelTabs) panelTabs.style.display = '';
        const _dp = document.getElementById('detail-panel');
        if (_dp) { _dp.classList.remove('panel-fade-in'); void _dp.offsetWidth; _dp.classList.add('panel-fade-in'); }

        Sidebar.resetSharedUI();

        // Branch based on election type
        switch (AppState.currentElectionType) {
            case 'governor':
                ElectionViews.renderGovernorView(regionKey, region);
                break;
            case 'superintendent':
                ElectionViews.renderSuperintendentView(regionKey, region);
                break;
            case 'mayor':
                ElectionViews.renderMayorProvinceView(regionKey, region);
                break;
            case 'council':
                ElectionViews.renderCouncilProvinceView(regionKey, region);
                break;
            case 'localCouncil':
                ElectionViews.renderLocalCouncilProvinceView(regionKey, region);
                break;
            case 'councilProportional':
                ElectionViews.renderCouncilProportionalView(regionKey, region);
                break;
            case 'localCouncilProportional':
                break;
            case 'byElection':
                ElectionViews.renderByElectionProvinceView(regionKey, region);
                break;
            default:
                ElectionViews.renderGovernorView(regionKey, region);
        }

        switchTabForRegion();

        if (window.innerWidth <= 768 && !AppState._restoringFromHash) {
            showMiniCard(regionKey, region);
        } else {
            openPanel();
        }
        AppState._restoringFromHash = false;
        ElectionViews.updateRegionBadge(region);

        if (MapModule.getMapMode && MapModule.getMapMode() === 'province') {
            MapModule.highlightRegion(regionKey);
        }
        if (MapModule.updateBreadcrumb) {
            MapModule.updateBreadcrumb('province', regionKey);
        }

        Router.updateHash({ usePushState: true });
    }

    // ============================================
    // Breadcrumb & District Navigation
    // ============================================
    function onBreadcrumbNational() {
        Sidebar.resetPanelToWelcome();
    }

    function onDistrictSelected(regionKey, districtName) {
        if (!regionKey || !districtName) return;

        if (AppState.currentRegionKey !== regionKey) {
            onRegionSelected(regionKey, { subDistrict: districtName });
            return;
        }

        if (AppState.currentElectionType === 'council') {
            if (MapModule && MapModule.switchToSubdistrictMap) {
                MapModule.switchToSubdistrictMap(regionKey, districtName);
            }
            ElectionViews.showCouncilSubdistrictPanel(regionKey, districtName);
            return;
        }

        if (AppState.currentElectionType === 'mayor') {
            ElectionViews.showMayorDistrictDetail(regionKey, districtName);
        } else if (AppState.currentElectionType === 'localCouncil') {
            ElectionViews.showLocalCouncilDistrictDetail(regionKey, districtName);
        } else if (AppState.currentElectionType === 'localCouncilProportional') {
            ElectionViews.showLocalCouncilProportionalDetail(regionKey, districtName);
        } else {
            switchTabForRegion();
            openPanel();
            DistrictMapView.selectDistrict(regionKey, districtName);
        }
    }

    // ============================================
    // Council Constituency Selected
    // ============================================
    function onConstituencySelected(regionKey, municipalityName, constituencyName) {
        if (!regionKey || !constituencyName) return;

        AppState.currentRegionKey = regionKey;
        AppState.currentDistrictName = constituencyName;

        const label = AppState.currentElectionType === 'localCouncil' ? '기초의원' : '광역의원';
        document.getElementById('panel-region-name').textContent = constituencyName;
        document.getElementById('panel-region-info').textContent = `${municipalityName} ${label}`;

        Sidebar.configurePanelTabs(['overview', 'polls', 'candidates', 'news', 'history']);
        Sidebar.toggleSuperintendentSummary(false);

        const welcome = document.getElementById('panel-welcome');
        if (welcome) welcome.style.display = 'none';

        const _ph = document.querySelector('.panel-header');
        if (_ph) _ph.style.display = '';
        const _pt = document.querySelector('.panel-tabs');
        if (_pt) _pt.style.display = '';

        const overviewCard = document.querySelector('.election-overview-card');
        if (overviewCard) { overviewCard.style.display = 'none'; }
        const districtDetail = document.getElementById('district-detail');
        if (districtDetail) districtDetail.style.display = 'none';

        if (typeof CouncilTab !== 'undefined') {
            CouncilTab.render('overview', regionKey, constituencyName, AppState.currentElectionType);
        }

        AppState._newsTabPendingRegion = regionKey;

        switchTabForRegion();
        openPanel();

        if (MapModule.updateBreadcrumb) {
            MapModule.updateBreadcrumb('constituency', regionKey, constituencyName);
        }

        Router.updateHash({ usePushState: true });
    }

    // ============================================
    // Initialize on DOM Ready
    // ============================================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // ── Analytics: 이벤트 위임 ──
    document.addEventListener('click', (e) => {
        const pollLink = e.target.closest('a[href*="nesdc.go.kr/poll/pollDetailView"]');
        if (pollLink) {
            const match = pollLink.href.match(/nttId=(\d+)/);
            trackEvent('clickPoll', {
                pollId: match ? match[1] : null,
                regionKey: AppState.currentRegionKey
            });
        }

        const newsLink = e.target.closest('.news-live-item[href]');
        if (newsLink) {
            const category = newsLink.closest('[data-category]')?.dataset.category || null;
            trackEvent('clickNews', {
                newsUrl: newsLink.href,
                category,
                regionKey: AppState.currentRegionKey
            });
        }

        const shareBtn = e.target.closest('[data-share-type]');
        if (shareBtn) {
            trackEvent('shareClick', {
                type: shareBtn.dataset.shareType,
                regionKey: AppState.currentRegionKey
            });
        }
    });

    // Public API
    return {
        onRegionSelected,
        onDistrictSelected,
        onSubdistrictSelected: ElectionViews.onSubdistrictSelected,
        onByElectionSelected: ElectionViews.onByElectionSelected,
        onConstituencySelected,
        onBreadcrumbNational,
        closePanel,
        switchTab,
        switchTabForRegion,
        openPanel,
        hideMiniCard,
        showMiniCard,
        setPanelStage,
        trackEvent,
        trackShareClick: (type) => trackEvent('shareClick', { type, regionKey: AppState.currentRegionKey }),
        getElectionType: () => AppState.currentElectionType,
        applyTermTooltips: Sidebar.applyTermTooltips,
        __debug: {
            evaluateNewsCase: typeof NewsTab !== 'undefined' ? NewsTab.evaluateNewsCase : null,
            buildPollSelection: typeof PollTab !== 'undefined' ? PollTab.buildSelection : null
        }
    };
})();
