// ============================================
// 6.3 전국지방선거 인터랙티브 선거 정보 지도
// App Module - Main Application Controller
// ============================================

// 여당/야당 → 보수/진보 변환 (중앙 정치 기준 여야 구분은 지방선거에 부적합)
function _normalizeTrend(trend) {
    if (!trend) return '';
    return trend
        .replace(/여당/g, '보수')
        .replace(/야당/g, '진보')
        .replace(/여야/g, '양당');
}

const App = (() => {
    let currentRegionKey = null;
    let currentTab = 'overview';
    let currentDistrictName = null;
    let currentElectionType = null;
    let _newsTabPendingRegion = null; // lazy 뉴스 로딩: 지역 선택 시 저장, 뉴스탭 전환 시 실제 렌더
    let districtGeoCache = null;
    let districtGeoPromise = null;

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
    const NEWS_PROXY_BASE = window.NEWS_PROXY_BASE || 'https://election-news-proxy.ksca1010.workers.dev';
    const MAJOR_NEWS_HOSTS = Array.isArray(NEWS_FILTER_CONFIG.majorNewsHosts) && NEWS_FILTER_CONFIG.majorNewsHosts.length
        ? NEWS_FILTER_CONFIG.majorNewsHosts
        : [
        'yna.co.kr', 'newsis.com', 'news1.kr', 'yonhapnewstv.co.kr',
        'kbs.co.kr', 'imnews.imbc.com', 'mbc.co.kr', 'sbs.co.kr',
        'jtbc.co.kr', 'chosun.com', 'joongang.co.kr', 'donga.com',
        'hani.co.kr', 'khan.co.kr', 'seoul.co.kr', 'mk.co.kr',
        'hankyung.com', 'edaily.co.kr', 'fnnews.com', 'mt.co.kr',
        'sisajournal.com', 'ohmynews.com', 'nocutnews.co.kr'
    ];
    const calendarDayFormatter = new Intl.DateTimeFormat('ko-KR', {
        timeZone: 'Asia/Seoul',
        month: 'numeric',
        day: 'numeric',
        weekday: 'short'
    });

    // Election type icon mapping
    const electionTypeIcons = {
        governor: 'fas fa-landmark',
        mayor: 'fas fa-building',
        council: 'fas fa-users',
        localCouncil: 'fas fa-people-group',
        superintendent: 'fas fa-graduation-cap',
        byElection: 'fas fa-calendar-check',
        councilProportional: 'fas fa-layer-group',
        localCouncilProportional: 'fas fa-network-wired'
    };

    // ============================================
    // Theme — sync Chart.js defaults with CSS variables
    // ============================================
    function updateChartTheme() {
        if (typeof Chart === 'undefined') return;
        const s = getComputedStyle(document.documentElement);
        Chart.defaults.color = s.getPropertyValue('--chart-text').trim() || '#8b99b5';
        Chart.defaults.borderColor = s.getPropertyValue('--chart-grid').trim() || 'rgba(42,53,83,0.5)';
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
                // Update Chart.js defaults for theme
                updateChartTheme();
                // 지도 색상 업데이트
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

        // Render sidebar data
        renderDday();
        renderStats();
        renderNationalPartyBar();
        renderGallupSource();
        renderElectionCalendar();
        renderFooterPartyBar();
        setupFilterTooltips();
        setupFilterButtons();
        setupMobileFilterSheet();
        toggleByelectionNote(false);
        setupBannerClose();

        // Load election stats (선거구 수 외부 데이터 → 필터 카운트 동적 반영)
        try {
            await ElectionData.loadElectionStats?.();
            updateFilterCounts();
        } catch(e) { console.warn('loadElectionStats error:', e); }
        // Load superintendent status (교육감 현황 팩트체크 데이터)
        try { await ElectionData.loadSuperintendentStatus?.(); } catch(e) { console.warn('loadSuperintendentStatus error:', e); }
        // Load superintendent candidates (교육감 후보 팩트체크 데이터)
        try { await ElectionData.loadSuperintendentCandidates?.(); } catch(e) { console.warn('loadSuperintendentCandidates error:', e); }
        // Load governor status (광역단체장 현황 팩트체크 데이터)
        try { await ElectionData.loadGovernorStatus?.(); } catch(e) { console.warn('loadGovernorStatus error:', e); }
        // Load mayor status (기초단체장 현황 팩트체크 데이터)
        try { await ElectionData.loadMayorStatus?.(); } catch(e) { console.warn('loadMayorStatus error:', e); }
        // Load mayor candidates (기초단체장 후보 팩트체크 데이터)
        try { await ElectionData.loadMayorCandidates?.(); } catch(e) { console.warn('loadMayorCandidates error:', e); }
        try { await ElectionData.loadCouncilSeats?.(); } catch(e) { console.warn('loadCouncilSeats error:', e); }
        // Load mayor history (기초단체장 역대 선거 결과)
        try { await ElectionData.loadMayorHistory?.(); } catch(e) { console.warn('loadMayorHistory error:', e); }
        // Load council members data (광역의원 현직 정보)
        try { await ElectionData.loadCouncilMembersData?.(); } catch(e) { console.warn('loadCouncilMembersData error:', e); }
        // Load candidates data
        try { await ElectionData.loadCandidatesData?.(); } catch(e) { console.warn('loadCandidatesData error:', e); }
        // Load by-election data
        try { await ElectionData.loadByElectionData?.(); } catch(e) { console.warn('loadByElectionData error:', e); }
        // Load polls data (여론조사)
        try { await ElectionData.loadPollsData?.(); } catch(e) { console.warn('loadPollsData error:', e); }

        // 모든 데이터 로드 완료 → 실제 데이터 기반 카운트 동기화
        try { syncCountsFromData(); } catch(e) { console.warn('[syncCounts] error:', e); }
        try { updateFilterCounts(); } catch(e) { console.warn('[filterCounts] error:', e); }
        // 검색 인덱스 무효화
        invalidateSearchIndex();

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
            // metro → province (hosts + names), municipal → municipalities (hosts + names)
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
                // (1) metro → province: names + hosts 병합
                for (const [metroName, rk] of Object.entries(regionKeyMap)) {
                    const metroEntry = pool.metro?.[metroName];
                    if (!metroEntry) continue;
                    if (!reg.regions[rk]) reg.regions[rk] = { province: {}, municipalities: {} };
                    if (!reg.regions[rk].province) reg.regions[rk].province = {};
                    const prov = reg.regions[rk].province;
                    // names → priorityNames
                    const nameSet = new Set(prov.priorityNames || []);
                    (metroEntry.names || []).forEach(n => nameSet.add(n));
                    prov.priorityNames = [...nameSet];
                    // hosts → province.hosts.tier2 (풀 호스트는 tier2로 추가)
                    if (!prov.hosts) prov.hosts = { tier1: [], tier2: [] };
                    const hostSet = new Set(prov.hosts.tier2 || []);
                    (metroEntry.hosts || []).forEach(h => hostSet.add(h));
                    prov.hosts.tier2 = [...hostSet];
                }
                // (2) municipal → municipalities: 시군구별 hosts + names 병합
                // pool.municipal 키는 시군구명(예: '강릉시')이고, 소속 광역은 별도 매핑 필요
                // → registry의 모든 region에서 해당 시군구명을 찾아 병합
                const municipal = pool.municipal || {};
                for (const [muniName, muniData] of Object.entries(municipal)) {
                    const poolHosts = muniData.hosts || [];
                    const poolNames = muniData.names || [];
                    if (!poolHosts.length && !poolNames.length) continue;
                    // registry의 어떤 region에 이 시군구가 속하는지 탐색
                    for (const [rk, regionData] of Object.entries(reg.regions)) {
                        if (!regionData.municipalities) regionData.municipalities = {};
                        const munis = regionData.municipalities;
                        // 이미 해당 시군구가 있거나, ElectionData subRegion에서 소속 확인
                        if (munis[muniName] || ElectionData.getSubRegionByName?.(rk, muniName)) {
                            if (!munis[muniName]) munis[muniName] = {};
                            const entry = munis[muniName];
                            // priorityNames 병합
                            const nameSet = new Set(entry.priorityNames || []);
                            poolNames.forEach(n => { if (n !== '인터넷신문') nameSet.add(n); });
                            entry.priorityNames = [...nameSet];
                            // hosts 병합 (tier2)
                            if (!entry.hosts) entry.hosts = { tier1: [], tier2: [] };
                            const hostSet = new Set(entry.hosts.tier2 || []);
                            poolHosts.forEach(h => hostSet.add(h));
                            entry.hosts.tier2 = [...hostSet];
                            break; // 한 시군구는 하나의 광역에만 속함
                        }
                    }
                }
            }
        } catch(e) { console.warn('LocalMedia load error:', e); }

        // Initialize map
        await MapModule.init();
        if (MapModule.setElectionType) MapModule.setElectionType(null);

        // Setup event listeners
        setupSearch();
        setupTabs();
        setupPanelClose();
        setupPanelResize();
        setupMobilePanelSwipe();
        setupHomeLink();

        // (data-last-updated 제거됨 — 풋터에서 날짜 표시 삭제)

        // Load election terms for tooltips (정보 패널에만 적용, 사이드바 필터에는 기존 툴팁 사용)
        try {
            const termsResp = await fetch('data/static/election_terms.json');
            if (termsResp.ok) {
                window._electionTerms = await termsResp.json();
                applyTermTooltips(document.querySelector('.info-panel'));
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
        renderElectionBanner();

        // Update D-day + 배너 every hour (자정 phase 전환 대비)
        setInterval(() => {
            renderDday();
            renderElectionCalendar();
            renderElectionBanner();
        }, 60 * 60 * 1000);

        // 선거 용어 툴팁은 정보 패널에만 적용 (사이드바 필터는 기존 툴팁 사용)

        // Restore state from URL hash (deep linking)
        restoreFromHash();
    }

    // ============================================
    // Election Term Tooltips
    // ============================================
    function applyTermTooltips(container) {
        const terms = window._electionTerms;
        if (!terms || !container) return;
        container.querySelectorAll('.filter-btn > span:not(.filter-icon):not(.filter-count)').forEach(el => {
            const text = el.textContent.trim();
            if (terms[text]) {
                el.innerHTML = `<span class="term-tooltip" title="${terms[text]}" tabindex="0">${text}</span>`;
            }
        });
    }

    // ============================================
    // Banner Close (#10)
    // ============================================
    function setupMobileFilterSheet() {
        const toggle = document.getElementById('mobile-filter-toggle');
        const sheet = document.getElementById('mobile-filter-sheet');
        const grid = document.getElementById('mobile-filter-grid');
        const backdrop = sheet?.querySelector('.mobile-filter-sheet-backdrop');
        if (!toggle || !sheet || !grid) return;

        // 사이드바의 필터 버튼을 복제해서 모바일 그리드에 넣기
        const sidebarBtns = document.querySelectorAll('.sidebar .filter-btn');
        sidebarBtns.forEach(btn => {
            const clone = btn.cloneNode(true);
            clone.addEventListener('click', () => {
                // 원본 버튼 클릭 트리거
                btn.click();
                // 시트 닫기
                sheet.classList.remove('active');
                // 활성 상태 동기화
                grid.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                clone.classList.add('active');
            });
            grid.appendChild(clone);
        });

        // 토글 버튼
        toggle.addEventListener('click', () => {
            sheet.classList.toggle('active');
        });

        // 배경 클릭 시 닫기
        if (backdrop) {
            backdrop.addEventListener('click', () => {
                sheet.classList.remove('active');
            });
        }

        // 사이드바 필터 활성 상태 변경 감시 → 모바일 동기화
        const observer = new MutationObserver(() => {
            const activeType = document.querySelector('.sidebar .filter-btn.active')?.dataset?.type;
            grid.querySelectorAll('.filter-btn').forEach(b => {
                b.classList.toggle('active', b.dataset.type === activeType);
            });
        });
        sidebarBtns.forEach(btn => {
            observer.observe(btn, { attributes: true, attributeFilter: ['class'] });
        });
    }

    function setupBannerClose() {
        const closeBtn = document.getElementById('banner-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                document.body.classList.add('banner-hidden');
            });
        }
    }

    function toggleSuperintendentSummary(show) {
        const card = document.getElementById('superintendent-summary-card');
        const container = document.getElementById('superintendent-summary');
        if (card) card.style.display = show ? '' : 'none';
        if (!show && container) container.innerHTML = '';
    }

    // ── 뷰 전환 시 공통 초기화: 이전 선거유형의 잔여 UI를 모두 리셋 ──
    function resetSharedUI() {
        // 공약비교 카드 (도지사 전용)
        const compareCard = document.getElementById('candidate-compare-card');
        if (compareCard) { compareCard.style.display = 'none'; }
        const compareEl = document.getElementById('candidate-compare');
        if (compareEl) compareEl.innerHTML = '';

        // 교육감 요약
        toggleSuperintendentSummary(false);

        // 개요 스크립트 영역 — 기본 숨김 (OverviewTab.render가 데이터 있을 때만 표시)
        const overviewCard = document.getElementById('election-overview-card');
        if (overviewCard) overviewCard.style.display = 'none';
        const districtDetail = document.getElementById('district-detail');
        if (districtDetail) districtDetail.style.display = '';

        // 공유 컨테이너 초기화
        const ids = ['overview-summary', 'overview-key-issues', 'overview-risk-factor',
                      'current-governor', 'key-issues', 'candidates-list',
                      'prev-election-result'];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = '';
        });

        // 역대비교 차트 정리 (메모리 누수 방지)
        if (typeof HistoryTab !== 'undefined' && HistoryTab.destroyChart) {
            HistoryTab.destroyChart();
        }
    }

    function toggleByelectionNote(show) {
        const note = document.getElementById('map-byelection-note');
        if (!note) return;
        note.classList.toggle('visible', show);
    }

    // ============================================
    // D-Day Counter
    // ============================================
    function renderDday() {
        const ddayEl = document.getElementById('dday-number');
        if (ddayEl) {
            ddayEl.textContent = typeof ElectionCalendar !== 'undefined'
                ? ElectionCalendar.getDday()
                : (() => { const d = ElectionData.getDday(); return d > 0 ? `D-${d}` : d === 0 ? 'D-DAY' : `D+${Math.abs(d)}`; })();
        }
    }

    // ── 선거 캘린더 배너 렌더링 (Layer 3) ──
    function renderElectionBanner() {
        if (typeof ElectionCalendar === 'undefined') return;
        const config = ElectionCalendar.getBannerConfig();
        const banner = document.getElementById('election-banner');
        if (!banner) return;

        if (!config.show) {
            banner.style.display = 'none';
            document.body.classList.add('banner-hidden');
            return;
        }

        const iconHtml = config.icon ? `<i class="${config.icon}"></i> ` : '';
        const linkHtml = config.link
            ? ` <a href="${config.link.url}" target="_blank" rel="noopener" class="banner-link">${config.link.label} <i class="fas fa-external-link-alt"></i></a>`
            : '';
        banner.innerHTML = `
            <div class="election-banner-content banner-${config.type}">
                <span class="banner-text">${iconHtml}${config.text}${linkHtml}</span>
                <button class="banner-close-btn" id="election-banner-close"><i class="fas fa-times"></i></button>
            </div>
        `;
        banner.style.display = '';
        document.body.classList.remove('banner-hidden');

        document.getElementById('election-banner-close')?.addEventListener('click', () => {
            banner.style.display = 'none';
            document.body.classList.add('banner-hidden');
        });
    }

    function renderElectionCalendar() {
        const list = document.getElementById('election-calendar-list');
        const note = document.getElementById('election-calendar-note');
        if (!list) return;

        const sections = ElectionData.getElectionCalendarSections?.() || { active: [], upcoming: [] };
        const groups = [];

        if (sections.active.length) {
            groups.push(buildElectionCalendarGroup('진행 중', sections.active));
        }
        if (sections.upcoming.length) {
            groups.push(buildElectionCalendarGroup('다가오는 일정', sections.upcoming));
        }

        list.innerHTML = groups.length
            ? groups.join('')
            : '<div class="calendar-empty">6월 3일까지 남은 주요 일정이 없습니다.</div>';

        if (note) {
            const sources = ElectionData.getElectionCalendarSources?.() || [];
            note.innerHTML = sources.length
                ? `기준: ${sources.map((source) => `<a href="${source.url}" target="_blank" rel="noopener">${escapeHtml(source.label)}</a>`).join(' · ')}`
                : '';
        }
    }

    function buildElectionCalendarGroup(title, events) {
        return `
            <div class="calendar-group">
                <div class="calendar-group-title">${escapeHtml(title)}</div>
                ${events.map((event) => renderElectionCalendarItem(event)).join('')}
            </div>
        `;
    }

    function renderElectionCalendarItem(event) {
        const statusLabel = getElectionCalendarStatusLabel(event);
        const statusClass = event.isActive
            ? 'calendar-status--active'
            : event.category === 'poll'
                ? 'calendar-status--warning'
                : 'calendar-status--upcoming';

        return `
            <article class="calendar-item calendar-item--${escapeHtml(event.category)} ${event.isActive ? 'is-active' : 'is-upcoming'}">
                <div class="calendar-item-head">
                    <div class="calendar-item-date">${escapeHtml(formatElectionCalendarRange(event))}</div>
                    <div class="calendar-item-status ${statusClass}">${escapeHtml(statusLabel)}</div>
                </div>
                <div class="calendar-item-title">${escapeHtml(event.title)}</div>
                <div class="calendar-item-meta">
                    <span class="calendar-chip">${escapeHtml(getElectionCalendarCategoryLabel(event.category))}</span>
                    ${event.audience ? `<span class="calendar-chip calendar-chip--subtle">${escapeHtml(event.audience)}</span>` : ''}
                </div>
                ${event.description ? `<div class="calendar-item-description">${escapeHtml(event.description)}</div>` : ''}
            </article>
        `;
    }

    function getElectionCalendarStatusLabel(event) {
        if (event.isActive) {
            return event.endsToday ? '오늘 마감' : '진행 중';
        }
        if (event.startsToday) {
            return '오늘 시작';
        }
        if (event.daysUntilStart === 1) {
            return '내일';
        }
        return `D-${event.daysUntilStart}`;
    }

    function getElectionCalendarCategoryLabel(category) {
        const labels = {
            rule: '규정',
            registration: '등록',
            admin: '절차',
            campaign: '선거운동',
            poll: '여론조사',
            vote: '투표'
        };
        return labels[category] || '일정';
    }

    function formatElectionCalendarRange(event) {
        const startText = formatElectionCalendarDay(event.startDate);
        const endText = formatElectionCalendarDay(event.endDate);
        const sameDay = getSeoulDateKey(event.startDate) === getSeoulDateKey(event.endDate);
        const base = sameDay ? startText : `${startText} - ${endText}`;
        return event.timeLabel ? `${base} · ${event.timeLabel}` : base;
    }

    function formatElectionCalendarDay(date) {
        const parts = calendarDayFormatter.formatToParts(date);
        const month = parts.find((part) => part.type === 'month')?.value || '';
        const day = parts.find((part) => part.type === 'day')?.value || '';
        const weekday = parts.find((part) => part.type === 'weekday')?.value || '';
        return `${month}.${day}(${weekday})`;
    }

    function getSeoulDateKey(date) {
        return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // ============================================
    // Stats
    // ============================================
    function renderStats() {
        const summary = ElectionData.nationalSummary;
        animateNumber('stat-voters', summary.totalVoters, (v) => (v / 10000).toFixed(0) + '만');
        animateNumber('stat-candidates', summary.totalCandidates, (v) => v.toLocaleString());

        const stats = ElectionData.nationalSummary.officialStats;
        const statElections = document.getElementById('stat-elections');
        if (statElections) statElections.textContent = stats.electionTypes || '7';
        const statRegions = document.getElementById('stat-regions');
        if (statRegions) statRegions.textContent = stats.regions || '17';
        const statSigungu = document.getElementById('stat-sigungu');
        if (statSigungu) statSigungu.textContent = stats.sigungu || '226';
    }

    /**
     * 실제 데이터에서 선거구 수를 동적으로 계산하여 필터 카운트 + 전국개황 갱신.
     * 모든 데이터 로드 완료 후 호출된다.
     */
    function syncCountsFromData() {
        const info = ElectionData.electionTypeInfo;
        if (!info) return;

        const counts = {};

        // 광역단체장: regions 키 수 (세종 포함 17개)
        const regions = ElectionData.regions;
        if (regions) counts.governor = Object.keys(regions).length;

        // 교육감: regions 키 수 (= 광역 수)
        if (regions) counts.superintendent = Object.keys(regions).length;

        // 기초단체장: sub_regions의 전체 시군구 수
        const subRegions = ElectionData.subRegionData;
        if (subRegions) {
            let total = 0;
            for (const rk in subRegions) {
                const list = subRegions[rk];
                if (Array.isArray(list)) total += list.length;
                else if (typeof list === 'object') total += Object.keys(list).length;
            }
            counts.mayor = total;
        }

        // 광역의원/기초의원: election_stats.json 값 유지 (선거구 획정 데이터는 별도 소스)
        // council, localCouncil, councilProportional, localCouncilProportional은
        // 선거구 획정이 확정되면 election_stats.json이 선관위 API로 자동 갱신됨

        // 재보궐: byelection.json 선거구 수
        const byeData = ElectionData._byElectionCache;
        if (byeData?.districts) {
            counts.byElection = Object.keys(byeData.districts).length;
        }

        // 적용
        let updated = 0;
        for (const [type, count] of Object.entries(counts)) {
            if (info[type] && info[type].count !== count) {
                info[type].count = count;
                updated++;
            }
        }

        // 전국개황 시군구 수도 동기화
        if (counts.mayor && ElectionData.nationalSummary?.officialStats) {
            ElectionData.nationalSummary.officialStats.sigungu = counts.mayor;
            const el = document.getElementById('stat-sigungu');
            if (el) el.textContent = counts.mayor;
        }

        // 시도 수
        if (counts.governor && ElectionData.nationalSummary?.officialStats) {
            ElectionData.nationalSummary.officialStats.regions = counts.governor;
            const el = document.getElementById('stat-regions');
            if (el) el.textContent = counts.governor;
        }

        if (updated > 0) {
            console.log(`[syncCounts] ${updated}개 선거유형 카운트 동기화`);
        }
    }

    // ============================================
    // Filter Count 동적 갱신 (election_stats.json 로드 후)
    // ============================================
    function updateFilterCounts() {
        const info = ElectionData.electionTypeInfo;
        if (!info) return;

        document.querySelectorAll('.filter-btn[data-type]').forEach(btn => {
            const type = btn.dataset.type;
            const typeInfo = info[type];
            if (!typeInfo) return;

            const countEl = btn.querySelector('.filter-count');
            if (countEl) {
                countEl.textContent = typeInfo.count.toLocaleString();
            }
        });

        // 툴팁도 갱신
        setupFilterTooltips();
    }

    function animateNumber(elementId, target, formatter) {
        const el = document.getElementById(elementId);
        if (!el) return;

        let current = 0;
        const step = target / 40;
        const interval = setInterval(() => {
            current += step;
            if (current >= target) {
                current = target;
                clearInterval(interval);
            }
            el.textContent = formatter(Math.floor(current));
        }, 25);
    }

    // ============================================
    // Filter Tooltips (#3)
    // ============================================
    function setupFilterTooltips() {
        const info = ElectionData.electionTypeInfo;
        if (!info) return;

        Object.entries(info).forEach(([type, data]) => {
            const tooltip = document.getElementById(`tooltip-${type}`);
            if (!tooltip) return;

            tooltip.innerHTML = `
                <div class="ft-title">${data.name}</div>
                <div class="ft-desc">${data.detail || data.description}</div>
                <div class="ft-meta">
                    <div class="ft-meta-row"><span class="label">선거구 수</span><span class="value">${data.count.toLocaleString()}</span></div>
                    <div class="ft-meta-row"><span class="label">투표 방식</span><span class="value">${data.votersPer}</span></div>
                    <div class="ft-meta-row"><span class="label">임기</span><span class="value">${data.term}</span></div>
                </div>
            `;

            // Position tooltip with JS to avoid sidebar overflow clipping
            const wrap = tooltip.closest('.filter-btn-wrap');
            if (!wrap) return;

            // onmouseenter/leave로 교체하여 중복 리스너 방지
            wrap.onmouseenter = () => {
                const rect = wrap.getBoundingClientRect();
                tooltip.style.left = (rect.right + 8) + 'px';
                tooltip.style.top = rect.top + 'px';
                const tipHeight = tooltip.offsetHeight || 150;
                if (rect.top + tipHeight > window.innerHeight) {
                    tooltip.style.top = Math.max(10, window.innerHeight - tipHeight - 10) + 'px';
                }
                tooltip.style.display = 'block';
            };
            wrap.onmouseleave = () => {
                tooltip.style.display = 'none';
            };
        });
    }

    // ============================================
    // Filter Button Click Handlers
    // ============================================
    function setupFilterButtons() {
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const type = btn.dataset.type;
                if (type === currentElectionType) {
                    // Re-click on the same filter should always reset to national overview.
                    if (MapModule) {
                        if (MapModule.setElectionType) {
                            MapModule.setElectionType(type);
                        } else {
                            if (MapModule.switchToProvinceMap) MapModule.switchToProvinceMap();
                            if (MapModule.updateBreadcrumb) MapModule.updateBreadcrumb('national');
                        }
                    }
                    resetPanelToWelcome();
                    return;
                }

                // Update active state
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

        const prevType = currentElectionType;
        currentElectionType = type;
        onElectionTypeChanged(type, prevType);
    });
});

        // Update election type label
        updateElectionTypeLabel(null);
    }

    function getElectionUnit(type) {
        switch(type) {
            case 'governor': case 'superintendent': return 'metro';
            case 'mayor': return 'district';
            case 'council': case 'localCouncil': return 'constituency';
            case 'councilProportional': case 'localCouncilProportional': return 'constituency';
            case 'byElection': return 'constituency';
            default: return 'metro';
        }
    }

    function onElectionTypeChanged(type, prevType) {
        // 선거 단위가 다르면 districtName 초기화
        const prevUnit = getElectionUnit(prevType);
        const newUnit = getElectionUnit(type);
        if (prevUnit !== newUnit) {
            currentDistrictName = null;
        }

        // Same unit & region selected → preserve region, re-render with new type
        const preserveRegion = (prevUnit === newUnit) && currentRegionKey;

        // Always clean up stale UI elements before re-rendering
        resetSharedUI();

        // Update election type label on map
        updateElectionTypeLabel(type);

        // Tell the map to switch mode
        if (MapModule && MapModule.setElectionType) {
            MapModule.setElectionType(type);
        }

        toggleByelectionNote(type === 'byElection');

        if (preserveRegion) {
            // Re-render with the same region under the new election type
            onRegionSelected(currentRegionKey);
        } else {
            // Different unit → reset to welcome state
            resetPanelToWelcome();
        }

        updateHash();
    }

    function updateElectionTypeLabel(type) {
        const info = ElectionData.electionTypeInfo[type];
        const labelIcon = document.querySelector('#map-election-type-label i');
        const labelText = document.getElementById('map-type-text');

        if (!info) {
            if (labelIcon) labelIcon.className = 'fas fa-globe-asia';
            if (labelText) labelText.textContent = '선거 종류를 선택하세요';
            return;
        }

        if (labelIcon) {
            labelIcon.className = electionTypeIcons[type] || 'fas fa-landmark';
        }
        if (labelText) {
            labelText.textContent = info.name;
        }
    }

    function resetPanelToWelcome() {
        currentRegionKey = null;
        currentDistrictName = null;
        regionSelected = false;

        const panel = document.getElementById('detail-panel');
        if (panel) panel.classList.remove('collapsed');

        // 헤더와 탭 숨기기 (선거+지역 선택 전)
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
            currentTab = 'overview';
        }
    }


    // ============================================
    // National Party Bar (#4 한국갤럽 데이터)
    // ============================================
    function renderNationalPartyBar() {
        // 공표금지 기간 체크
        if (typeof ElectionCalendar !== 'undefined' && ElectionCalendar.isPublicationBanned()) {
            const container = document.getElementById('national-party-bar');
            if (container) {
                container.innerHTML = `<div style="text-align:center;padding:12px 8px;color:var(--text-muted);font-size:var(--text-caption);">
                    <i class="fas fa-gavel" style="margin-bottom:4px;display:block;"></i>
                    여론조사 공표금지 기간<br>(5/28~6/3 18:00)
                </div>`;
            }
            const sourceEl = document.getElementById('gallup-source');
            if (sourceEl) sourceEl.style.display = 'none';
            return;
        }

        const container = document.getElementById('national-party-bar');
        if (!container) return;

        // Use Gallup data if available
        const gallup = ElectionData.gallupNationalPoll;
        let partyData;

        if (gallup && gallup.data) {
            partyData = Object.entries(gallup.data).sort((a, b) => {
                if (a[0] === 'independent') return 1;
                if (b[0] === 'independent') return -1;
                return b[1] - a[1];
            });
        } else {
            // 갤럽 데이터 없으면 표시하지 않음 (추정치 사용 금지)
            container.innerHTML = '<div style="text-align:center;padding:12px 8px;color:var(--text-muted);font-size:var(--text-caption);">정당지지율 데이터가 아직 없습니다.</div>';
            const sourceEl = document.getElementById('gallup-source');
            if (sourceEl) sourceEl.style.display = 'none';
            return;
        }

        // 정당지지율 표시 이름 고정 (외부 데이터에 의해 변경되지 않도록)
        const POLL_PARTY_NAMES = {
            democratic: '더불어민주당',
            ppp: '국민의힘',
            reform: '조국혁신당',
            newReform: '개혁신당',
            progressive: '진보당',
            justice: '정의당',
            newFuture: '새로운미래',
            independent: '무당층',
            other: '기타정당',
        };

        const totalPct = partyData.reduce((s, [, v]) => s + v, 0);

        let barHtml = '<div class="party-bar-chart">';
        partyData.forEach(([party, value]) => {
            const pct = (value / totalPct * 100).toFixed(1);
            const color = ElectionData.getPartyColor(party);
            const segName = POLL_PARTY_NAMES[party] || party;
            barHtml += `<div class="party-bar-segment" style="width:${pct}%;background:${color}" title="${segName}: ${value}%" role="img" aria-label="${segName}, ${value}%"></div>`;
        });
        barHtml += '</div>';

        barHtml += '<div class="party-bar-labels">';
        partyData.forEach(([party, value]) => {
            const color = ElectionData.getPartyColor(party);
            const name = POLL_PARTY_NAMES[party] || party;
            barHtml += `<span class="party-bar-label"><span class="party-bar-label-dot" style="background:${color}"></span>${name} ${value}%</span>`;
        });
        barHtml += '</div>';

        container.innerHTML = barHtml;
    }

    // ============================================
    // Gallup Source Citation (#4)
    // ============================================
    function renderGallupSource() {
        const container = document.getElementById('gallup-source');
        if (!container) return;

        const gallup = ElectionData.gallupNationalPoll;
        if (gallup) {
            const surveyDate = gallup.surveyDate || gallup.date || '';
            const publishDate = gallup.publishDate ? ` | 발표: ${gallup.publishDate}` : '';
            const sampleSize = gallup.sampleSize ? `${gallup.sampleSize.toLocaleString()}명` : '미상';
            const reportNo = gallup.reportNo ? `<div style="font-weight:600;color:var(--text-secondary);margin-bottom:4px">${gallup.reportNo}</div>` : '';
            const responseRate = gallup.responseRate ? ` | 응답률: ${gallup.responseRate}` : '';
            const sourceUrl = gallup.url || 'https://www.gallup.co.kr/gallupdb/reportContent.asp?seqNo=1626';
            container.innerHTML = `
                ${reportNo}
                <strong>출처:</strong> ${gallup.source} (${surveyDate}${publishDate})<br>
                조사방법: ${gallup.method}<br>
                표본수: ${sampleSize} | 오차범위: ±${gallup.margin}%p${responseRate}<br>
                <a href="${sourceUrl}" target="_blank" rel="noopener">
                    <i class="fas fa-external-link-alt"></i> 한국갤럽 조사 원문 보기 →
                </a>
            `;
        }
    }

    // ============================================
    // Footer Party Bar
    // ============================================
    function renderFooterPartyBar() {
        const container = document.getElementById('footer-party-bar');
        if (!container) return;

        const dominance = ElectionData.getPartyDominance();
        const total = Object.values(dominance).reduce((s, v) => s + v, 0);
        const sorted = Object.entries(dominance).sort((a, b) => b[1] - a[1]);

        container.innerHTML = sorted.map(([party, count]) => {
            const pct = (count / total * 100).toFixed(1);
            const color = ElectionData.getPartyColor(party);
            return `<div class="footer-party-segment" style="width:${pct}%;background:${color}"></div>`;
        }).join('');
    }

    // ============================================
    // Smart Search
    // ============================================

    /** 검색 인덱스 (최초 1회 빌드) — 지역 × 선거유형 조합 */
    let _searchIndex = null;
    let _dongRevIndex = null; // "regionKey:sigungu" → [dong1, dong2, ...] 역방향 매핑
    let _dongFwdIndex = null; // "dong" → [[regionKey, sigungu], ...] 원본 매핑
    let _dongFwdKeys = null; // 정렬된 dong 이름 배열 (힌트 prefix 검색용)
    function invalidateSearchIndex() { _searchIndex = null; }

    // 읍면동 검색 인덱스 로드 (96KB, 1회) → 양방향 인덱스 빌드
    fetch('data/static/dong_search_index.json')
        .then(r => r.ok ? r.json() : null)
        .then(data => {
            if (!data) return;
            _dongFwdIndex = data;
            _dongFwdKeys = Object.keys(data).sort();
            const rev = {};
            for (const [dong, locs] of Object.entries(data)) {
                for (const loc of locs) {
                    const key = `${loc[0]}:${loc[1]}`;
                    if (!rev[key]) rev[key] = [];
                    rev[key].push(dong);
                }
            }
            _dongRevIndex = rev;
            invalidateSearchIndex();
        })
        .catch(() => {});

    // 시도 약자 매핑 (전라남도→전남, 경상북도→경북 등)
    const _provinceAbbrev = {
        '서울특별시': '서울', '부산광역시': '부산', '대구광역시': '대구',
        '인천광역시': '인천', '광주광역시': '광주', '대전광역시': '대전',
        '울산광역시': '울산', '세종특별자치시': '세종',
        '경기도': '경기', '강원특별자치도': '강원',
        '충청북도': '충북', '충청남도': '충남',
        '전북특별자치도': '전북', '전라남도': '전남',
        '경상북도': '경북', '경상남도': '경남',
        '제주특별자치도': '제주',
    };

    // 이름에서 검색 별칭 생성 (접미사 제거, 구분자 분리)
    function _buildAliases(name) {
        const aliases = new Set();
        if (!name) return aliases;
        aliases.add(name);
        // "서울특별시" → "서울", "경기도" → "경기", "군산시" → "군산"
        const stripped = name
            .replace(/(특별자치도|특별자치시|특별시|광역시|도)$/, '')
            .replace(/(시|군|구)$/, '');
        if (stripped && stripped !== name) aliases.add(stripped);
        // 시도 약자 추가 (전라남도→전남 등)
        if (_provinceAbbrev[name]) aliases.add(_provinceAbbrev[name]);
        // "전북 군산·김제·부안갑" → ["전북", "군산", "김제", "부안", "군산·김제·부안갑"]
        // "불로ㆍ봉무동" → ["불로", "봉무동", "봉무"]
        name.split(/[\s·ㆍ,]+/).forEach(part => {
            if (part.length >= 2) {
                aliases.add(part);
                // "군산시김제시부안군갑" 같은 붙어있는 형태도 분리
                const subParts = part.replace(/(시|군|구)/g, '$1 ').trim().split(/\s+/);
                subParts.forEach(sp => {
                    const clean = sp.replace(/(시|군|구|갑|을|병|정)$/, '');
                    if (clean.length >= 2) aliases.add(clean);
                });
            }
        });
        return aliases;
    }

    function buildSearchIndex() {
        if (_searchIndex) return _searchIndex;
        const index = [];

        // 시도 레벨 선거유형
        const provinceTypes = [
            { electionType: 'governor', label: '광역단체장' },
            { electionType: 'superintendent', label: '교육감' },
            { electionType: 'council', label: '광역의원' },
            { electionType: 'localCouncil', label: '기초의원' },
            { electionType: 'councilProportional', label: '광역비례' },
            { electionType: 'localCouncilProportional', label: '기초비례' },
        ];

        // 시군구 레벨 선거유형
        const districtTypes = [
            { electionType: 'mayor', label: '기초단체장' },
            { electionType: 'council', label: '광역의원' },
            { electionType: 'localCouncil', label: '기초의원' },
            { electionType: 'localCouncilProportional', label: '기초비례' },
        ];

        // 1) 시도 (17개) × 선거유형
        Object.entries(ElectionData.regions).forEach(([key, region]) => {
            const aliases = _buildAliases(region.name);
            provinceTypes.forEach(pt => {
                index.push({
                    regionKey: key,
                    name: region.name,
                    nameEng: region.nameEng || '',
                    aliases: [...aliases, pt.label],
                    electionType: pt.electionType,
                    typeLabel: pt.label,
                    level: 'province',
                });
            });
        });

        // 2) 시군구 (226개) × 선거유형
        if (ElectionData.subRegionData) {
            Object.entries(ElectionData.subRegionData).forEach(([parentKey, districts]) => {
                const parent = ElectionData.getRegion(parentKey);
                if (!parent) return;
                const parentShort = parent.name.replace(/(특별자치도|특별자치시|특별시|광역시|도)$/, '');
                districts.forEach(d => {
                    const aliases = _buildAliases(d.name);
                    aliases.add(parentShort); // "경기" 검색으로 경기도 시군구도 찾기
                    const parentAbbrev = _provinceAbbrev[parent.name];
                    if (parentAbbrev && parentAbbrev !== parentShort) aliases.add(parentAbbrev);
                    // 읍면동 → 시군구 매핑 (dong_search_index 활용)
                    if (_dongRevIndex) {
                        const dongs = _dongRevIndex[`${parentKey}:${d.name}`];
                        if (dongs) {
                            for (const dong of dongs) {
                                aliases.add(dong);
                                // "광안제1동" → "광안제1" → "광안제" → "광안"
                                // "역삼1동" → "역삼1" → "역삼"
                                // "불로ㆍ봉무동" → "불로", "봉무"
                                const noSuffix = dong.replace(/(동|읍|면|리)$/, '');
                                if (noSuffix.length >= 2 && noSuffix !== dong) aliases.add(noSuffix);
                                const noNum = noSuffix.replace(/\d+$/, '');
                                if (noNum.length >= 2 && noNum !== noSuffix) aliases.add(noNum);
                                const noJe = noNum.replace(/제$/, '');
                                if (noJe.length >= 2 && noJe !== noNum) aliases.add(noJe);
                                // ㆍ 구분자 분리: "불로ㆍ봉무동" → "불로", "봉무"
                                if (dong.includes('ㆍ')) {
                                    dong.split('ㆍ').forEach(part => {
                                        const clean = part.replace(/(동|읍|면|리)$/, '').replace(/\d+$/, '').replace(/제$/, '');
                                        if (clean.length >= 2) aliases.add(clean);
                                    });
                                }
                            }
                        }
                    }
                    districtTypes.forEach(dt => {
                        index.push({
                            regionKey: parentKey,
                            subDistrict: d.name,
                            name: d.name,
                            parentName: parent.name,
                            aliases: [...aliases, dt.label],
                            electionType: dt.electionType,
                            typeLabel: dt.label,
                            level: 'district',
                        });
                    });
                });
            });
        }

        // 3) 재보궐 선거구 — 이름을 토큰화하여 개별 지역명으로도 검색 가능
        if (ElectionData._byElectionCache?.districts) {
            Object.entries(ElectionData._byElectionCache.districts).forEach(([key, d]) => {
                const parent = ElectionData.getRegion(d.region);
                const aliases = _buildAliases(d.district || key);
                aliases.add('재보궐');
                aliases.add('보궐');
                if (parent) {
                    const parentShort = parent.name.replace(/(특별자치도|특별자치시|특별시|광역시|도)$/, '');
                    aliases.add(parentShort);
                    const parentAbbrev = _provinceAbbrev[parent.name];
                    if (parentAbbrev && parentAbbrev !== parentShort) aliases.add(parentAbbrev);
                }
                index.push({
                    regionKey: d.region || key.split('-')[0],
                    subDistrict: key,
                    name: d.district || key,
                    parentName: parent?.name || '',
                    aliases: [...aliases],
                    electionType: 'byElection',
                    typeLabel: '재보궐',
                    level: 'district',
                    _byElectionKey: key,
                });
            });
        }

        _searchIndex = index;
        return index;
    }

    function setupSearch() {
        const input = document.getElementById('region-search');
        const results = document.getElementById('search-results');
        if (!input || !results) return;
        let activeIdx = -1;
        let _composing = false;       // IME 조합 중 여부
        let _pendingEnter = false;    // 조합 중 Enter → compositionend 후 실행 예약

        function doSearch(query) {
            if (!query) {
                results.classList.remove('active');
                results.innerHTML = '';
                activeIdx = -1;
                input.setAttribute('aria-expanded', 'false');
                return;
            }

            const index = buildSearchIndex();
            const q = query.toLowerCase();
            const matches = [];

            for (const item of index) {
                // 별칭 + 원본 이름 + 영문 이름에서 매칭
                const allTexts = [...(item.aliases || []), item.nameEng].filter(Boolean);
                let bestMatch = 0; // 0=no match, 1=partial, 2=startsWith, 3=exact

                for (const t of allTexts) {
                    if (t === query) { bestMatch = 3; break; }
                    if (t.startsWith(query)) { bestMatch = Math.max(bestMatch, 2); }
                    else if (t.includes(query) || t.toLowerCase().includes(q)) { bestMatch = Math.max(bestMatch, 1); }
                }
                if (bestMatch === 0) continue;

                let score = bestMatch * 40; // exact=120, starts=80, partial=40
                if (item.name.startsWith(query)) score += 30; // 원본 이름 직접 매칭 보너스
                if (item.level === 'province') score += 15;
                // 주요 선거유형 우선
                const typePriority = { governor: 7, superintendent: 6, mayor: 5, council: 4, localCouncil: 3, councilProportional: 2, localCouncilProportional: 1, byElection: 3 };
                score += (typePriority[item.electionType] || 0);
                matches.push({ ...item, score });
            }

            matches.sort((a, b) => b.score - a.score);

            // 읍면동 매칭 감지
            let limited;
            let _dongModal = false;
            let _dongHintItems = []; // 직접 매칭이 있어도 읍면동 매칭이 있으면 하단에 표시
            if (_dongRevIndex && matches.length > 0) {
                const hasDirectMatch = matches.some(m => {
                    const nameTexts = [m.name, m.name.replace(/(시|군|구)$/, '')];
                    return nameTexts.some(t => t.includes(query) || query.includes(t));
                });
                if (!hasDirectMatch) {
                    // 읍면동으로만 매칭 → 시군구별 1개로 중복 제거 + 모달 모드
                    const seen = new Set();
                    const deduped = [];
                    for (const m of matches) {
                        const key = `${m.regionKey}:${m.subDistrict || ''}`;
                        if (seen.has(key)) continue;
                        seen.add(key);
                        deduped.push(m);
                    }
                    _dongModal = true;
                    limited = deduped.slice(0, 20);
                } else {
                    limited = matches.slice(0, 20);
                    // 직접 매칭이 있어도 읍면동 후보가 있으면 힌트 표시
                    // 정렬 배열로 prefix 검색 (O(log N + M))
                    if (_dongFwdIndex && _dongFwdKeys) {
                        const seen = new Set();
                        // 1) prefix 매칭: 정렬 배열에서 이분 탐색
                        let lo = 0, hi = _dongFwdKeys.length;
                        while (lo < hi) {
                            const mid = (lo + hi) >> 1;
                            _dongFwdKeys[mid] < query ? lo = mid + 1 : hi = mid;
                        }
                        for (let i = lo; i < _dongFwdKeys.length && _dongFwdKeys[i].startsWith(query); i++) {
                            const dongKey = _dongFwdKeys[i];
                            for (const [rk, sigungu] of _dongFwdIndex[dongKey]) {
                                const k = `${rk}:${sigungu}`;
                                if (seen.has(k)) continue;
                                seen.add(k);
                                _dongHintItems.push({ dong: dongKey, regionKey: rk, subDistrict: sigungu, parentName: ElectionData.getRegion(rk)?.name || '' });
                            }
                        }
                        // 2) base 매칭: "광안" → "광안제1동" (prefix가 "광안제"라 위에서 안 잡힘)
                        if (_dongHintItems.length === 0) {
                            for (let i = lo; i < _dongFwdKeys.length && i < lo + 200; i++) {
                                const dongKey = _dongFwdKeys[i];
                                const base = dongKey.replace(/(동|읍|면)$/, '').replace(/\d+$/, '').replace(/제$/, '');
                                if (base === query) {
                                    for (const [rk, sigungu] of _dongFwdIndex[dongKey]) {
                                        const k = `${rk}:${sigungu}`;
                                        if (seen.has(k)) continue;
                                        seen.add(k);
                                        _dongHintItems.push({ dong: dongKey, regionKey: rk, subDistrict: sigungu, parentName: ElectionData.getRegion(rk)?.name || '' });
                                    }
                                }
                                if (!dongKey.startsWith(query.charAt(0))) break;
                            }
                        }
                    }
                }
            } else {
                limited = matches.slice(0, 20);
            }
            activeIdx = -1;

            const typeIcons = {
                governor: 'fa-landmark', superintendent: 'fa-graduation-cap',
                mayor: 'fa-building', council: 'fa-users', localCouncil: 'fa-user-friends',
                councilProportional: 'fa-chart-pie', localCouncilProportional: 'fa-chart-pie',
                byElection: 'fa-bolt'
            };
            const typeBadgeColors = {
                governor: '#3b82f6', superintendent: '#8b5cf6',
                mayor: '#059669', council: '#0891b2', localCouncil: '#0891b2',
                councilProportional: '#d97706', localCouncilProportional: '#d97706',
                byElection: '#f59e0b'
            };

            if (!limited.length) {
                results.innerHTML = `
                    <div class="search-result-item no-hover">
                        <div class="result-text">
                            <div class="result-name" style="color:var(--text-muted)">검색 결과가 없습니다</div>
                            <div class="result-desc">시도, 시군구, 선거구 이름으로 검색하세요</div>
                        </div>
                    </div>`;
            } else {
                results.innerHTML = limited.map((m, i) => {
                    const highlighted = highlightMatch(m.name, query);
                    const parentInfo = m.parentName ? `${m.parentName} > ` : '';
                    const icon = (_dongModal && m.subDistrict) ? 'fa-map-marker-alt' : (typeIcons[m.electionType] || 'fa-vote-yea');
                    const badgeColor = (_dongModal && m.subDistrict) ? '#6b7280' : (typeBadgeColors[m.electionType] || '#6b7280');
                    const badgeText = (_dongModal && m.subDistrict) ? '선거유형 선택' : m.typeLabel;
                    const dongModalAttr = (_dongModal && m.subDistrict) ? ' data-dong-modal="1"' : '';
                    return `
                        <div class="search-result-item" data-region="${m.regionKey}" ${m.subDistrict ? `data-subdistrict="${m.subDistrict}"` : ''} data-election-type="${m.electionType}"${dongModalAttr} data-idx="${i}">
                            <i class="fas ${icon}" style="color:${badgeColor};font-size:0.85rem;flex-shrink:0;width:18px;text-align:center;"></i>
                            <div class="result-text">
                                <div class="result-name">${highlighted}</div>
                                <div class="result-desc">${parentInfo}${(_dongModal && m.subDistrict) ? '읍면동 검색' : m.typeLabel}</div>
                            </div>
                            <span class="result-type-badge" style="background:${badgeColor}18;color:${badgeColor};border:1px solid ${badgeColor}30;">${badgeText}</span>
                        </div>`;
                }).join('');

                // 읍면동 힌트: 직접 매칭 결과 하단에 "선거구 찾기" 항목 추가
                if (_dongHintItems.length > 0) {
                    results.innerHTML += `<div style="border-top:1px solid var(--border);margin-top:4px;padding-top:4px;">` +
                        _dongHintItems.map((h, i) => `
                            <div class="search-result-item" data-dong-hint="${i}" data-region="${h.regionKey}" data-subdistrict="${h.subDistrict}" data-dong-modal="1" data-idx="${limited.length + i}">
                                <i class="fas fa-search-location" style="color:#8b5cf6;font-size:0.85rem;flex-shrink:0;width:18px;text-align:center;"></i>
                                <div class="result-text">
                                    <div class="result-name">${h.dong} <span style="color:var(--text-muted);font-weight:400;">선거구 찾기</span></div>
                                    <div class="result-desc">${h.parentName} > ${h.subDistrict}</div>
                                </div>
                                <span class="result-type-badge" style="background:#8b5cf618;color:#8b5cf6;border:1px solid #8b5cf630;">선거구</span>
                            </div>`).join('') + `</div>`;
                }
            }
            results.classList.add('active');
            results.scrollTop = 0;
            input.setAttribute('aria-expanded', 'true');
        }

        function highlightMatch(text, query) {
            const idx = text.indexOf(query);
            if (idx >= 0) {
                return text.slice(0, idx) + `<mark>${text.slice(idx, idx + query.length)}</mark>` + text.slice(idx + query.length);
            }
            return text;
        }

        function updateActive() {
            results.querySelectorAll('.search-result-item').forEach((el, i) => {
                el.classList.toggle('active', i === activeIdx);
            });
            const activeEl = results.querySelector('.search-result-item.active');
            if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
        }

        // ── 읍면동 검색 모달 (2단계: 지역 → 선거유형) ──
        const _dongModalEl = document.getElementById('dong-search-modal');
        const _dongModalContent = document.getElementById('dong-search-modal-content');
        let _dongSearchQuery = ''; // 모달 플로우 동안 원본 검색어 보존

        const _electionTypes = [
            { type: 'mayor',    icon: 'fa-building',     label: '기초단체장',  desc: '시장·군수·구청장', color: '#059669' },
            { type: 'council',  icon: 'fa-users',        label: '광역의원',    desc: '시·도의회 지역구', color: '#0891b2' },
            { type: 'localCouncil', icon: 'fa-user-friends', label: '기초의원', desc: '시·군·구의회 지역구', color: '#0891b2' },
            { type: 'localCouncilProportional', icon: 'fa-chart-pie', label: '기초비례', desc: '시·군·구의회 비례대표', color: '#d97706' },
        ];

        function _modalBtnStyle() {
            return `display:flex;align-items:center;gap:12px;padding:14px 16px;
                border:1px solid var(--border);border-radius:10px;background:var(--bg-elevated);
                cursor:pointer;transition:all 0.15s;text-align:left;width:100%;`;
        }

        function _bindHover(container) {
            container.querySelectorAll('button[data-action]').forEach(btn => {
                btn.addEventListener('mouseenter', () => { btn.style.borderColor = 'var(--accent)'; });
                btn.addEventListener('mouseleave', () => { btn.style.borderColor = 'var(--border)'; });
            });
        }

        // Step 1: 지역 선택 (여러 시군구가 매칭될 때)
        function showDongRegionModal(queryText, candidates) {
            if (!_dongModalEl || !_dongModalContent) return;
            _dongSearchQuery = queryText; // 원본 검색어 보존

            // 시군구가 1개면 바로 Step 2로
            if (candidates.length === 1) {
                const c = candidates[0];
                showDongElectionModal(c.regionKey, c.subDistrict, c.parentName);
                return;
            }

            _dongModalContent.innerHTML = `
                <h2 style="font-size:1.15rem;margin:0 0 4px;">"${escapeHtml(queryText)}" 검색 결과</h2>
                <p style="font-size:0.82rem;color:var(--text-muted);margin:0 0 18px;">지역을 선택하세요</p>
                <div style="display:flex;flex-direction:column;gap:8px;">
                    ${candidates.map((c, i) => `
                        <button data-action="region" data-idx="${i}" style="${_modalBtnStyle()}">
                            <i class="fas fa-map-marker-alt" style="color:#6b7280;font-size:1rem;width:20px;text-align:center;"></i>
                            <div>
                                <div style="font-weight:600;font-size:0.92rem;color:var(--text-primary);">${c.subDistrict}</div>
                                <div style="font-size:0.78rem;color:var(--text-muted);">${c.parentName}</div>
                            </div>
                        </button>
                    `).join('')}
                </div>`;

            _dongModalEl.classList.add('open');
            _bindHover(_dongModalContent);

            _dongModalContent.querySelectorAll('button[data-action="region"]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const c = candidates[parseInt(btn.dataset.idx)];
                    showDongElectionModal(c.regionKey, c.subDistrict, c.parentName);
                });
            });
        }

        // Step 2: 선거유형 선택
        function showDongElectionModal(regionKey, subDistrict, parentName) {
            if (!_dongModalEl || !_dongModalContent) return;

            _dongModalContent.innerHTML = `
                <h2 style="font-size:1.15rem;margin:0 0 4px;">${subDistrict}</h2>
                <p style="font-size:0.82rem;color:var(--text-muted);margin:0 0 18px;">${parentName} — 선거 유형을 선택하세요</p>
                <div style="display:flex;flex-direction:column;gap:8px;">
                    ${_electionTypes.map(t => `
                        <button data-action="type" data-type="${t.type}" style="${_modalBtnStyle()}">
                            <i class="fas ${t.icon}" style="color:${t.color};font-size:1rem;width:20px;text-align:center;"></i>
                            <div>
                                <div style="font-weight:600;font-size:0.92rem;color:var(--text-primary);">${t.label}</div>
                                <div style="font-size:0.78rem;color:var(--text-muted);">${t.desc}</div>
                            </div>
                        </button>
                    `).join('')}
                </div>`;

            _dongModalEl.classList.add('open');
            _bindHover(_dongModalContent);

            _dongModalContent.querySelectorAll('button[data-action="type"]').forEach(btn => {
                btn.addEventListener('click', () => {
                    _dongModalEl.classList.remove('open');
                    navigateToRegion(regionKey, subDistrict, btn.dataset.type, _dongSearchQuery);
                });
            });
        }

        // 읍면동 검색어로 해당 선거구를 찾는 함수
        function findDistrictByDong(regionKey, subDistrict, electionType, dongQuery) {
            if (!dongQuery) return Promise.resolve(null);
            const folder = (electionType === 'council') ? 'council' : 'basic_council';
            const prefix = (electionType === 'council') ? 'district_mapping' : 'basic_district_mapping';
            const url = `data/${folder}/${prefix}_${regionKey}.json`;
            return fetch(url).then(r => r.ok ? r.json() : null).then(data => {
                if (!data?.districts) return null;
                const q = dongQuery.replace(/(동|읍|면)$/, '');
                for (const d of data.districts) {
                    if (d.sigungu !== subDistrict) continue;
                    for (const dong of (d.dongs || [])) {
                        if (dong.includes(q) || q.includes(dong.replace(/(동|읍|면)$/, ''))) {
                            return d.name; // 선거구 이름 (예: "영암군 다선거구")
                        }
                    }
                }
                return null;
            }).catch(() => null);
        }

        function navigateToRegion(regionKey, subDistrict, electionType, dongQuery) {
            // 선거유형 전환
            if (electionType && electionType !== currentElectionType) {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                const targetBtn = document.querySelector(`.filter-btn[data-type="${electionType}"]`);
                if (targetBtn) targetBtn.classList.add('active');
                currentElectionType = electionType;
                updateElectionTypeLabel(electionType);
                if (MapModule && MapModule.setElectionType) {
                    MapModule.setElectionType(electionType);
                }
                toggleByelectionNote(electionType === 'byElection');
            }

            // 지역 이동
            currentRegionKey = regionKey;

            if (electionType === 'council') {
                const p = MapModule.switchToDistrictMap(regionKey);
                const goToDistrict = () => {
                    if (dongQuery) {
                        findDistrictByDong(regionKey, subDistrict, 'council', dongQuery).then(distName => {
                            if (distName && MapModule.switchToCouncilSubdistrictMap) {
                                MapModule.switchToCouncilSubdistrictMap(regionKey, subDistrict);
                                // 특정 선거구 선택
                                setTimeout(() => {
                                    if (MapModule.highlightDistrict) MapModule.highlightDistrict(distName);
                                    onConstituencySelected?.(regionKey, subDistrict, distName);
                                }, 400);
                            } else {
                                MapModule.switchToCouncilSubdistrictMap(regionKey, subDistrict);
                            }
                        });
                    } else {
                        MapModule.switchToCouncilSubdistrictMap(regionKey, subDistrict);
                    }
                };
                (p && p.then) ? p.then(goToDistrict) : setTimeout(goToDistrict, 300);
            } else if (electionType === 'localCouncil') {
                const p = MapModule.switchToDistrictMap(regionKey);
                const goToDistrict = () => {
                    if (dongQuery) {
                        findDistrictByDong(regionKey, subDistrict, 'localCouncil', dongQuery).then(distName => {
                            if (distName && MapModule.switchToBasicCouncilMap) {
                                MapModule.switchToBasicCouncilMap(regionKey, subDistrict);
                                setTimeout(() => {
                                    if (MapModule.highlightDistrict) MapModule.highlightDistrict(distName);
                                    onConstituencySelected?.(regionKey, subDistrict, distName);
                                }, 400);
                            } else {
                                MapModule.switchToBasicCouncilMap(regionKey, subDistrict);
                            }
                        });
                    } else {
                        MapModule.switchToBasicCouncilMap(regionKey, subDistrict);
                    }
                };
                (p && p.then) ? p.then(goToDistrict) : setTimeout(goToDistrict, 300);
            } else if (electionType === 'localCouncilProportional') {
                MapModule.switchToProportionalDistrictMap(regionKey);
                setTimeout(() => {
                    MapModule.switchToProportionalSigunguDetail(regionKey, subDistrict);
                }, 600);
            } else {
                // mayor — 시군구 지도 → 패널 직접 표시
                const p = MapModule.switchToDistrictMap(regionKey);
                const after = () => {
                    if (MapModule.highlightDistrict) MapModule.highlightDistrict(subDistrict);
                    const welcome = document.getElementById('panel-welcome');
                    if (welcome) welcome.style.display = 'none';
                    const panelHeader = document.querySelector('.panel-header');
                    if (panelHeader) panelHeader.style.display = '';
                    const panelTabs = document.querySelector('.panel-tabs');
                    if (panelTabs) panelTabs.style.display = '';
                    showMayorDistrictDetail(regionKey, subDistrict);
                };
                (p && p.then) ? p.then(after) : setTimeout(after, 300);
            }
        }

        function selectItem(el) {
            if (!el?.dataset.region) return;
            const electionType = el.dataset.electionType;
            const regionKey = el.dataset.region;
            const subDistrict = el.dataset.subdistrict || null;

            // Analytics: search
            trackEvent('search', {
                query: input.value.trim(),
                selectedName: el.querySelector('.result-name')?.textContent || null,
                regionKey,
                electionType,
                resultCount: results.querySelectorAll('.search-result-item[data-region]').length
            });

            // 읍면동 모달 모드
            if (subDistrict && el.dataset.dongModal) {
                // 힌트 항목이면 dong 이름을, 아니면 입력값을 검색어로 보존
                const hintDong = el.querySelector('.result-name')?.textContent?.replace(/ 선거구 찾기$/, '');
                _dongSearchQuery = (el.dataset.dongHint !== undefined && hintDong) ? hintDong : input.value.trim();
                const parentName = (ElectionData.getRegion(regionKey)?.name) || '';
                // 검색 UI 정리
                input.value = '';
                results.innerHTML = '';
                results.classList.remove('active');
                activeIdx = -1;
                // 드롭다운에서 특정 시군구를 클릭 → 바로 선거유형 선택
                showDongElectionModal(regionKey, subDistrict, parentName);
                return;
            }

            // 1) 선거유형 전환
            if (electionType && electionType !== currentElectionType) {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                const targetBtn = document.querySelector(`.filter-btn[data-type="${electionType}"]`);
                if (targetBtn) targetBtn.classList.add('active');
                currentElectionType = electionType;
                updateElectionTypeLabel(electionType);
                if (MapModule && MapModule.setElectionType) {
                    MapModule.setElectionType(electionType);
                }
                toggleByelectionNote(electionType === 'byElection');
            }

            // 2) 시도 선택 → 시군구가 있으면 선거유형별 드릴다운
            setTimeout(() => {
                if (!subDistrict) {
                    // 시도 레벨 선거 — 지도 선택 + 패널 표시
                    // MapModule.selectRegion이 지도 줌 + App.onRegionSelected 호출
                    if (MapModule && MapModule.selectRegion) {
                        MapModule.selectRegion(regionKey);
                    } else {
                        onRegionSelected(regionKey);
                    }
                    return;
                }

                currentRegionKey = regionKey;

                if (electionType === 'council') {
                    // 광역의원: 시도 시군구 → 해당 시군구 광역의원 선거구
                    const p = MapModule.switchToDistrictMap(regionKey);
                    const after = () => MapModule.switchToCouncilSubdistrictMap(regionKey, subDistrict);
                    (p && p.then) ? p.then(after) : setTimeout(after, 300);

                } else if (electionType === 'localCouncil') {
                    // 기초의원: 시도 시군구 → 해당 시군구 기초의원 선거구
                    const p = MapModule.switchToDistrictMap(regionKey);
                    const after = () => MapModule.switchToBasicCouncilMap(regionKey, subDistrict);
                    (p && p.then) ? p.then(after) : setTimeout(after, 300);

                } else if (electionType === 'localCouncilProportional') {
                    // 기초비례: 시도 시군구 → 해당 시군구 비례대표 상세
                    MapModule.switchToProportionalDistrictMap(regionKey);
                    setTimeout(() => {
                        MapModule.switchToProportionalSigunguDetail(regionKey, subDistrict);
                    }, 600);

                } else if (electionType === 'byElection') {
                    // 재보궐: 직접 onByElectionSelected 호출
                    onByElectionSelected(subDistrict);

                } else {
                    // 기초단체장(mayor) 등: 시군구 지도 → 패널 직접 표시
                    const p = MapModule.switchToDistrictMap(regionKey);
                    const after = () => {
                        if (MapModule.highlightDistrict) MapModule.highlightDistrict(subDistrict);
                        // welcome 숨기고 패널 헤더/탭 복원
                        const welcome = document.getElementById('panel-welcome');
                        if (welcome) welcome.style.display = 'none';
                        const panelHeader = document.querySelector('.panel-header');
                        if (panelHeader) panelHeader.style.display = '';
                        const panelTabs = document.querySelector('.panel-tabs');
                        if (panelTabs) panelTabs.style.display = '';
                        showMayorDistrictDetail(regionKey, subDistrict);
                    };
                    (p && p.then) ? p.then(after) : setTimeout(after, 300);
                }
            }, 100);

            input.value = '';
            results.innerHTML = '';
            results.classList.remove('active');
            activeIdx = -1;
        }

        // 입력 이벤트 (디바운스)
        let debounceTimer = null;
        input.addEventListener('input', (e) => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => doSearch(e.target.value.trim()), 80);
        });

        // 포커스 — 이미 텍스트가 있으면 드롭다운 다시 표시
        input.addEventListener('focus', () => {
            const q = input.value.trim();
            if (q) doSearch(q);
        });

        // 클릭
        results.addEventListener('mousedown', (e) => {
            // mousedown + preventDefault로 input blur 방지
            e.preventDefault();
            e.stopPropagation();
            selectItem(e.target.closest('.search-result-item'));
        });

        // 외부 클릭 — search-box 바깥 클릭 시에만 닫기
        document.addEventListener('mousedown', (e) => {
            if (!e.target.closest('.search-box')) {
                results.classList.remove('active');
            }
        });

        // Enter 공통 처리: dong-modal이면 지역 선택 모달, 아니면 selectItem
        function handleEnterSelect() {
            const items = results.querySelectorAll('.search-result-item[data-region]');
            if (!items.length) return;

            // dong-modal 항목이 있으면 → 지역 선택 모달
            const dongItems = results.querySelectorAll('.search-result-item[data-dong-modal]');
            if (dongItems.length > 0) {
                const queryText = input.value.trim();
                const seen = new Set();
                const candidates = [];
                dongItems.forEach(item => {
                    const k = `${item.dataset.region}:${item.dataset.subdistrict}`;
                    if (seen.has(k)) return;
                    seen.add(k);
                    candidates.push({
                        regionKey: item.dataset.region,
                        subDistrict: item.dataset.subdistrict,
                        parentName: (ElectionData.getRegion(item.dataset.region)?.name) || '',
                    });
                });
                input.value = '';
                results.innerHTML = '';
                results.classList.remove('active');
                activeIdx = -1;
                showDongRegionModal(queryText, candidates);
                return;
            }

            // 일반 검색: 선택된 항목 또는 첫 번째 항목
            if (activeIdx >= 0 && items[activeIdx]) {
                selectItem(items[activeIdx]);
            } else {
                selectItem(items[0]);
            }
        }

        // ── IME 조합 상태 추적 (한글/중국어/일본어) ──
        input.addEventListener('compositionstart', () => { _composing = true; });
        input.addEventListener('compositionend', () => {
            _composing = false;
            if (_pendingEnter) {
                _pendingEnter = false;
                // compositionend 후 input 이벤트 → doSearch 완료를 기다린 뒤 실행
                clearTimeout(debounceTimer);
                doSearch(input.value.trim());
                setTimeout(() => handleEnterSelect(), 20);
            }
        });

        // ── 키보드 탐색 ──
        input.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                const items = results.querySelectorAll('.search-result-item[data-region]');
                activeIdx = Math.min(activeIdx + 1, items.length - 1);
                updateActive();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                const items = results.querySelectorAll('.search-result-item[data-region]');
                activeIdx = Math.max(activeIdx - 1, 0);
                updateActive();
            } else if (e.key === 'Enter') {
                // IME 조합 중이면 선택을 미루고, compositionend에서 실행
                if (e.isComposing || _composing) {
                    _pendingEnter = true;
                    return;
                }
                e.preventDefault();
                handleEnterSelect();
            } else if (e.key === 'Escape') {
                results.classList.remove('active');
                input.blur();
                activeIdx = -1;
            }
        });

        // "/" 단축키: 검색창 포커스
        document.addEventListener('keydown', (e) => {
            if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
                const tag = document.activeElement?.tagName;
                if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;
                e.preventDefault();
                input.focus();
            }
        });

        // 검색 버튼 클릭 → Enter와 동일 동작
        const searchBtn = document.querySelector('.search-btn');
        if (searchBtn) {
            searchBtn.addEventListener('click', () => {
                if (input.value.trim()) handleEnterSelect();
            });
        }
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

        // Arrow key navigation between tabs (WAI-ARIA tabs pattern)
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
        currentTab = tabName;
        trackEvent('switchTab', {
            tab: tabName,
            electionType: currentElectionType,
            regionKey: currentRegionKey
        });
        updateHash();

        // Update tab buttons
        document.querySelectorAll('.panel-tab').forEach(t => {
            const isActive = t.dataset.tab === tabName;
            t.classList.toggle('active', isActive);
            t.setAttribute('aria-selected', isActive ? 'true' : 'false');
            t.setAttribute('tabindex', isActive ? '0' : '-1');
        });

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(tc => {
            tc.style.display = 'none';
        });
        const activeTab = document.getElementById(`tab-${tabName}`);
        if (activeTab) activeTab.style.display = 'block';

        // 탭 전환 시 스크롤 최상단으로 리셋
        const panelContent = document.querySelector('.panel-content');
        if (panelContent) panelContent.scrollTop = 0;

        // 탭 전환 시 로딩 표시 (비동기 탭)
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
        if ((currentElectionType === 'council' || currentElectionType === 'localCouncil')
            && currentDistrictName && typeof CouncilTab !== 'undefined') {
            CouncilTab.render(tabName, currentRegionKey, currentDistrictName, currentElectionType);
            return;
        }

        // 비례대표 → ProportionalTab에 위임
        if ((currentElectionType === 'councilProportional' || currentElectionType === 'localCouncilProportional')
            && typeof ProportionalTab !== 'undefined') {
            ProportionalTab.render(tabName, currentRegionKey, currentDistrictName, currentElectionType);
            return;
        }

        // 기존 로직 (governor, mayor, superintendent, byElection)
        // Render poll tab
        if (tabName === 'polls' && currentRegionKey) {
            if (typeof PollTab !== 'undefined') {
                PollTab.render(currentRegionKey, currentElectionType, currentDistrictName);
            }
        }

        if (tabName === 'candidates' && currentRegionKey) {
            // 의원급은 CouncilTab에서 처리 (위에서 return됨). 여기 도달하면 광역단체장/기초단체장/교육감만
            const councilTypes = ['council', 'localCouncil', 'councilProportional', 'localCouncilProportional'];
            if (!councilTypes.includes(currentElectionType)) {
                if (typeof CandidateTab !== 'undefined') {
                    CandidateTab.render(currentRegionKey, currentElectionType, currentDistrictName);
                }
            }
        }

        // Render news if news tab (lazy 로딩: 뉴스탭 전환 시에만 렌더)
        if (tabName === 'news' && currentRegionKey) {
            const newsRegion = _newsTabPendingRegion || currentRegionKey;
            _newsTabPendingRegion = null;
            if (typeof NewsTab !== 'undefined') {
                NewsTab.render(newsRegion, currentElectionType, currentDistrictName);
            }
        }

        if (tabName === 'history' && currentRegionKey) {
            if (typeof HistoryTab !== 'undefined') {
                HistoryTab.render(currentRegionKey, currentElectionType, currentDistrictName);
            }
        }
    }

    // ============================================
    // Panel
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

        // Mouse
        handle.addEventListener('mousedown', (e) => { startResize(e.clientX); e.preventDefault(); });
        document.addEventListener('mousemove', (e) => moveResize(e.clientX));
        document.addEventListener('mouseup', endResize);

        // Touch
        handle.addEventListener('touchstart', (e) => { startResize(e.touches[0].clientX); e.preventDefault(); }, { passive: false });
        document.addEventListener('touchmove', (e) => { if (isResizing) moveResize(e.touches[0].clientX); }, { passive: true });
        document.addEventListener('touchend', endResize);
    }

    // ── 모바일 패널 스와이프 닫기 (아래로 스와이프) ──
    function setupMobilePanelSwipe() {
        const panel = document.getElementById('detail-panel');
        const header = panel?.querySelector('.panel-header');
        if (!panel || !header) return;

        let swipeStartY = 0;
        let swiping = false;

        header.addEventListener('touchstart', (e) => {
            if (window.innerWidth > 768) return;
            swipeStartY = e.touches[0].clientY;
            swiping = true;
        }, { passive: true });

        header.addEventListener('touchmove', (e) => {
            if (!swiping || window.innerWidth > 768) return;
            const dy = e.touches[0].clientY - swipeStartY;
            if (dy > 10) {
                // 아래로 스와이프 → 닫기 미리보기
                panel.style.transform = `translateY(${Math.min(dy, 200)}px)`;
            }
        }, { passive: true });

        header.addEventListener('touchend', (e) => {
            if (!swiping || window.innerWidth > 768) return;
            swiping = false;
            const dy = (e.changedTouches[0]?.clientY || 0) - swipeStartY;
            if (dy > 80) {
                // 충분히 아래로 스와이프 → 닫기
                panel.classList.add('collapsed');
                panel.style.transform = '';
            } else {
                panel.style.transform = '';
            }
        }, { passive: true });
    }

    /** 지역이 선택되어 패널에 데이터가 표시된 상태인지 */
    let regionSelected = false;

    function openPanel() {
        const panel = document.getElementById('detail-panel');
        if (panel) {
            panel.classList.remove('collapsed');
            panel.style.transform = '';
        }
    }

    /** 패널이 이미 지역 데이터를 보여주는 상태면 현재 탭 유지, 아니면 overview로 */
    function switchTabForRegion() {
        // 뉴스탭 갱신 보장: 어떤 경로든 switchTabForRegion을 거치면 뉴스 pending 세팅
        _newsTabPendingRegion = currentRegionKey;

        if (regionSelected) {
            // 현재 탭 유지하되 새 지역 데이터로 갱신
            switchTab(currentTab);
        } else {
            switchTab('overview');
            regionSelected = true;
        }
    }

    function closePanel() {
        const panel = document.getElementById('detail-panel');
        if (panel) panel.classList.add('collapsed');
        currentRegionKey = null;
        currentDistrictName = null;
        regionSelected = false;

        // Deselect map region
        const mapContainer = document.querySelector('#korea-map');
        if (mapContainer) {
            mapContainer.querySelectorAll('.region').forEach(r => r.classList.remove('selected'));
            mapContainer.querySelectorAll('.district').forEach(d => d.classList.remove('selected'));
        }
    }

    // ============================================
    // Home Reset
    // ============================================
    function resetToHome() {
        toggleSuperintendentSummary(false);
        currentRegionKey = null;
        currentDistrictName = null;
        currentElectionType = null;

        const panel = document.getElementById('detail-panel');
        if (panel) panel.classList.remove('collapsed');

        // 헤더와 탭 숨기기
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
            currentTab = 'overview';
        }

        // 선거유형 필터 초기화
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        updateElectionTypeLabel(null);

        const searchInput = document.getElementById('region-search');
        if (searchInput) searchInput.value = '';
        const searchResults = document.getElementById('search-results');
        if (searchResults) searchResults.style.display = 'none';

        // 지도를 완전 초기 상태로 (선거유형 없음 → 무채색)
        if (MapModule) {
            if (MapModule.setElectionType) MapModule.setElectionType(null);
            else if (MapModule.switchToProvinceMap) MapModule.switchToProvinceMap();
        }
        toggleByelectionNote(false);

        // Clear the URL hash
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

        currentRegionKey = regionKey;
        currentDistrictName = null;

        // 기초의원/기초비례: 광역 선택 시 welcome 유지 (시군구 선택 전)
        if (currentElectionType === 'localCouncilProportional' || currentElectionType === 'localCouncil') {
            if (options?.subDistrict) {
                if (currentElectionType === 'localCouncilProportional') {
                    showLocalCouncilProportionalDetail(regionKey, options.subDistrict);
                } else {
                    showLocalCouncilDistrictDetail(regionKey, options.subDistrict);
                }
                switchTabForRegion();
                openPanel();
            }
            // 시군구 지도만 표시하고 패널은 welcome 유지
            return;
        }

        // Analytics: selectRegion
        trackEvent('selectRegion', {
            regionKey,
            districtName: currentDistrictName,
            electionType: currentElectionType
        });

        // Hide welcome, show content — 헤더와 탭 복원 + 페이드인
        const welcome = document.getElementById('panel-welcome');
        if (welcome) welcome.style.display = 'none';
        const panelHeader = document.querySelector('.panel-header');
        if (panelHeader) panelHeader.style.display = '';
        const panelTabs = document.querySelector('.panel-tabs');
        if (panelTabs) panelTabs.style.display = '';
        const _dp = document.getElementById('detail-panel');
        if (_dp) { _dp.classList.remove('panel-fade-in'); void _dp.offsetWidth; _dp.classList.add('panel-fade-in'); }

        // 이전 뷰의 잔여 UI 초기화
        resetSharedUI();

        // Branch based on election type
        switch (currentElectionType) {
            case 'governor':
                renderGovernorView(regionKey, region);
                break;
            case 'superintendent':
                renderSuperintendentView(regionKey, region);
                break;
            case 'mayor':
                renderMayorProvinceView(regionKey, region);
                break;
            case 'council':
                renderCouncilProvinceView(regionKey, region);
                break;
            case 'localCouncil':
                renderLocalCouncilProvinceView(regionKey, region);
                break;
            case 'councilProportional':
                renderCouncilProportionalView(regionKey, region);
                break;
            case 'localCouncilProportional':
                // 기초비례는 시군구 선택 전에는 패널 안 열림 (welcome 유지)
                break;
            case 'byElection':
                renderByElectionProvinceView(regionKey, region);
                break;
            default:
                renderGovernorView(regionKey, region);
        }

        // Switch to overview and show it
        switchTabForRegion();
        openPanel();
        updateRegionBadge(region);

        // Highlight on map (only in province mode)
        if (MapModule.getMapMode && MapModule.getMapMode() === 'province') {
            MapModule.highlightRegion(regionKey);
        }

        // Keep map navigator in sync with province selection
        if (MapModule.updateBreadcrumb) {
            MapModule.updateBreadcrumb('province', regionKey);
        }

        updateHash({ usePushState: true });
    }

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
        document.getElementById('panel-region-name').textContent = region.name;
        document.getElementById('panel-region-info').textContent =
            `유권자 ${(region.voters / 10000).toFixed(0)}만명 | ${region.subRegions}개 시군구 | 후보 ${region.candidates.length}명`;

        // Show standard tabs
        configurePanelTabs(['overview', 'polls', 'candidates', 'news', 'history']);
        toggleSuperintendentSummary(false);

        if (typeof OverviewTab !== 'undefined') {
            OverviewTab.render(regionKey, currentElectionType, currentDistrictName);
        }
        // 뉴스탭은 lazy 로딩 — 탭 전환 시 renderNewsTab 호출 (API 쿼터 절약)
        _newsTabPendingRegion = regionKey;
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

        configurePanelTabs(['overview', 'candidates', 'news']);

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
            OverviewTab.render(regionKey, currentElectionType, currentDistrictName);
        }
        _newsTabPendingRegion = regionKey;
    }

    // ============================================
    // Superintendent View (교육감)
    // ============================================
    function renderSuperintendentView(regionKey, region) {
        const data = ElectionData.getSuperintendentData(regionKey);

        document.getElementById('panel-region-name').textContent = `${region.name} 교육감`;
        document.getElementById('panel-region-info').textContent =
            `교육감 선거 | 후보 ${data ? data.candidates.length : 0}명 | 정당 추천 없음`;

        configurePanelTabs(['overview', 'polls', 'candidates', 'news', 'history']);
        toggleSuperintendentSummary(true);

        // Render superintendent overview
        renderSuperintendentOverview(regionKey, region, data);
        if (typeof OverviewTab !== 'undefined') {
            OverviewTab.render(regionKey, currentElectionType, currentDistrictName);
        }
        // 뉴스탭은 lazy 로딩 — 탭 전환 시 renderNewsTab 호출 (API 쿼터 절약)
        _newsTabPendingRegion = regionKey;
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

        configurePanelTabs(['overview', 'candidates', 'news', 'history']);
        toggleSuperintendentSummary(false);

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
        _newsTabPendingRegion = regionKey;
    }

    function renderCouncilProportionalView(regionKey, region) {
        toggleSuperintendentSummary(false);
        renderProportionalView(regionKey, region, 'councilProportional');
    }

    function renderLocalCouncilProportionalView(regionKey, region) {
        // 기초비례는 시군구 선택 전에는 정보탭을 열지 않음
        resetPanelToWelcome();
    }

    // ============================================
    // Mayor Province View (기초단체장 - 시도 선택 후)
    // ============================================
    function renderMayorProvinceView(regionKey, region) {
        document.getElementById('panel-region-name').textContent = `${region.name} 기초단체장`;
        document.getElementById('panel-region-info').textContent =
            `시군구를 선택하면 기초단체장 후보 정보를 확인할 수 있습니다.`;

        configurePanelTabs(['overview', 'candidates', 'news', 'history']);
        toggleSuperintendentSummary(false);

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
        _newsTabPendingRegion = regionKey;
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

        configurePanelTabs(['overview', 'polls', 'candidates', 'news', 'history']);
        toggleSuperintendentSummary(false);

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
        _newsTabPendingRegion = regionKey;
    }

    function showCouncilMunicipalityDetail(regionKey, municipality) {
        const councilData = ElectionData.getCouncilData(regionKey);
        const constituencies = councilData?.municipalities?.[municipality] || [];
        const totalCandidates = constituencies.reduce((sum, c) => sum + (c.members?.length || c.candidates?.length || 0), 0);

        // 후보 데이터 lazy-load
        ElectionData.loadCouncilCandidates?.(regionKey, 'council');

        document.getElementById('panel-region-name').textContent = `${municipality} 광역의원`;
        document.getElementById('panel-region-info').textContent = `${constituencies.length}개 지역구 · ${totalCandidates}명`;
        configurePanelTabs(['overview', 'polls', 'candidates', 'news', 'history']);
        toggleSuperintendentSummary(false);

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
                        onConstituencySelected(regionKey, municipality, constituencyName);
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
        onConstituencySelected(regionKey, municipality, district.name);
    }

    function showCouncilSubdistrictPanel(regionKey, districtName) {
        document.getElementById('panel-region-name').textContent = `${districtName} 읍면동`;
        document.getElementById('panel-region-info').textContent = '읍면동 경계를 확인하세요.';

        configurePanelTabs(['overview', 'news']);
        toggleSuperintendentSummary(false);

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

        switchTabForRegion();
        openPanel();
    }

    // ============================================
    // Local Council Province View (기초의원 - 시도 선택 후)
    // ============================================
    function renderLocalCouncilProvinceView(regionKey, region) {
        document.getElementById('panel-region-name').textContent = `${region.name} 기초의원`;
        document.getElementById('panel-region-info').textContent =
            `시군구를 선택하면 기초의원 선거구를 확인할 수 있습니다.`;

        configurePanelTabs(['overview', 'polls', 'candidates', 'news', 'history']);
        toggleSuperintendentSummary(false);

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
        _newsTabPendingRegion = regionKey;
    }

    // ============================================
    // By-election Selected Handler
    // ============================================
    function onByElectionSelected(key) {
        const data = ElectionData.getByElectionData(key);
        if (!data) return;

        currentElectionType = 'byElection';
        currentDistrictName = key; // byelection key로 저장 (개요 매칭용)

        toggleSuperintendentSummary(false);
        const welcome = document.getElementById('panel-welcome');
        if (welcome) welcome.style.display = 'none';

        const _ph = document.querySelector('.panel-header');
        if (_ph) _ph.style.display = '';
        const _pt = document.querySelector('.panel-tabs');
        if (_pt) _pt.style.display = '';

        document.getElementById('panel-region-name').textContent = data.district;
        document.getElementById('panel-region-info').textContent =
            `${data.subType || '재보궐선거'} | ${data.type} | 후보 ${data.candidates.length}명`;

        configurePanelTabs(['overview', 'polls', 'candidates', 'news', 'history']);

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
        currentRegionKey = regionKey;
        if (typeof OverviewTab !== 'undefined') {
            OverviewTab.render(regionKey, currentElectionType, currentDistrictName);
        }

        switchTabForRegion();
        openPanel();
    }

    // ============================================
    // Configure Panel Tabs per Election Type
    // ============================================
    function configurePanelTabs(visibleTabs) {
        document.querySelectorAll('.panel-tab').forEach(tab => {
            const tabName = tab.dataset.tab;
            tab.style.display = visibleTabs.includes(tabName) ? '' : 'none';
        });
    }

    // ============================================
    // Breadcrumb Navigation Callback
    // ============================================
    function onBreadcrumbNational() {
        resetPanelToWelcome();
    }

    function onDistrictSelected(regionKey, districtName) {
        if (!regionKey || !districtName) return;

        if (currentRegionKey !== regionKey) {
            onRegionSelected(regionKey, { subDistrict: districtName });
            return;
        }

        if (currentElectionType === 'council') {
            if (MapModule && MapModule.switchToSubdistrictMap) {
                MapModule.switchToSubdistrictMap(regionKey, districtName);
            }
            showCouncilSubdistrictPanel(regionKey, districtName);
            return;
        }

        // Election-type-specific handling
        if (currentElectionType === 'mayor') {
            showMayorDistrictDetail(regionKey, districtName);
        } else if (currentElectionType === 'localCouncil') {
            showLocalCouncilDistrictDetail(regionKey, districtName);
        } else if (currentElectionType === 'localCouncilProportional') {
            showLocalCouncilProportionalDetail(regionKey, districtName);
        } else {
            switchTabForRegion();
            openPanel();
            selectDistrict(regionKey, districtName);
        }
    }

    // ============================================
    // Mayor District Detail (기초단체장 시군구 선택)
    // ============================================
    function showMayorDistrictDetail(regionKey, districtName) {
        const summary = ElectionData.getDistrictSummary(regionKey, districtName);
        const canonicalDistrict = ElectionData.getSubRegionByName(regionKey, districtName)?.name || districtName;
        const displayDistrict = summary?.name || districtName;
        currentDistrictName = canonicalDistrict;
        const mayorData = ElectionData.getMayorData(regionKey, canonicalDistrict);

        document.getElementById('panel-region-name').textContent = `${displayDistrict} 기초단체장`;
        document.getElementById('panel-region-info').textContent =
            `기초단체장 선거 | 후보 ${mayorData ? mayorData.candidates.length : 0}명`;

        configurePanelTabs(['overview', 'polls', 'candidates', 'news', 'history']);

        // prev-election-result, current-governor는 OverviewTab에서 처리

        const issuesContainer = document.getElementById('key-issues');
        if (issuesContainer) {
            const subRegion = ElectionData.getSubRegionByName(regionKey, canonicalDistrict);
            issuesContainer.innerHTML = `<div class="issues-list"><span class="issue-tag">${subRegion?.keyIssue || '지역 현안'}</span></div>`;
        }

        // 현직 정보 + 개요 카드 렌더링
        if (typeof OverviewTab !== 'undefined') {
            OverviewTab.render(regionKey, currentElectionType, currentDistrictName);
        }

        // 뉴스탭 lazy 로딩용
        _newsTabPendingRegion = regionKey;

        switchTabForRegion();
        openPanel();

        // Update breadcrumb
        if (MapModule.updateBreadcrumb) {
            MapModule.updateBreadcrumb('district', regionKey, displayDistrict);
        }

        updateHash({ usePushState: true });
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

        configurePanelTabs(['overview', 'polls', 'candidates', 'news', 'history']);

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
                    onConstituencySelected(regionKey, districtName, constituencyName);
                });
            });
        } else if (prevContainer) {
            prevContainer.innerHTML = `<p style="color:var(--text-muted);text-align:center;padding:16px;">기초의원 데이터를 준비 중입니다.</p>`;
        }

        const govContainer = document.getElementById('current-governor');
        if (govContainer) govContainer.innerHTML = '';
        const issuesContainer = document.getElementById('key-issues');
        if (issuesContainer) issuesContainer.innerHTML = '';

        switchTabForRegion();
        openPanel();

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

        currentDistrictName = districtName;

        document.getElementById('panel-region-name').textContent = `${districtName} 기초의원 비례대표`;
        document.getElementById('panel-region-info').textContent = `${regionName} ${districtName} · 정당 투표로 의석 배분`;

        configurePanelTabs(['overview', 'candidates', 'news', 'history']);
        toggleSuperintendentSummary(false);

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
        _newsTabPendingRegion = regionKey;

        switchTabForRegion();
        openPanel();

        if (MapModule.updateBreadcrumb) {
            MapModule.updateBreadcrumb('district', regionKey, districtName);
        }
    }

    function onSubdistrictSelected(regionKey, districtName, subdistrictName) {
        if (!subdistrictName) return;

        document.getElementById('panel-region-name').textContent = subdistrictName;
        document.getElementById('panel-region-info').textContent = `${districtName} 읍면동`;

        configurePanelTabs(['overview', 'news']);
        toggleSuperintendentSummary(false);

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

        switchTabForRegion();
        openPanel();
    }

    // ============================================
    // Districts Tab (#7 시군구)
    // ============================================
    function renderDistrictsTab(regionKey) {
        const container = document.getElementById('districts-list');
        if (!container) return;

        const region = ElectionData.getRegion(regionKey);
        const subRegions = ElectionData.getSubRegions(regionKey);
        const mapWrap = document.querySelector('.districts-map-wrap');
        if (mapWrap) {
            mapWrap.style.display = 'block';
        }
        renderDistrictsMap(regionKey, subRegions);
        renderDistrictDetail(null);

        if (!subRegions || subRegions.length === 0) {
            container.innerHTML = `
                <div class="district-no-data">
                    <i class="fas fa-map-marked-alt"></i>
                    <p>${region ? region.name : '해당 지역'}의 시군구 데이터를<br>준비 중입니다.</p>
                </div>
            `;
            return;
        }

        let html = `
            <div class="district-info-header">
                <h4><i class="fas fa-map-signs"></i> ${region.name} 시군구 (${subRegions.length}개)</h4>
                <p>각 시군구를 클릭하면 해당 지역의 최신 선거 뉴스를 확인할 수 있습니다.</p>
            </div>
        `;

        html += subRegions.map(district => {
            const partyColor = ElectionData.getPartyColor(district.leadParty || 'independent');
            const bgColor = partyColor + '18';
            return `
                <div class="district-card" data-district="${district.name}">
                    <div class="district-icon" style="background:${bgColor};color:${partyColor}">
                        <i class="fas fa-building"></i>
                    </div>
                    <span class="district-name">${district.name}</span>
                    <span class="district-party-indicator" style="background:${partyColor}" title="${ElectionData.getPartyName(district.leadParty || 'independent')}"></span>
                    <span class="district-arrow"><i class="fas fa-chevron-right"></i></span>
                </div>
            `;
        }).join('');

        container.innerHTML = html;

        container.onclick = (e) => {
            const card = e.target.closest('.district-card');
            if (!card?.dataset.district) return;
            selectDistrict(regionKey, card.dataset.district);
        };
    }

    function renderDistrictsMap(regionKey, subRegions) {
        const mapContainer = document.getElementById('districts-map-container');
        const svgEl = document.getElementById('districts-map');
        if (!mapContainer || !svgEl) return;

        const width = mapContainer.clientWidth;
        const height = mapContainer.clientHeight;

        const svg = d3.select(svgEl);
        svg.selectAll('*').remove();
        svg.attr('width', width).attr('height', height);

        if (width === 0 || height === 0) {
            setTimeout(() => renderDistrictsMap(regionKey, subRegions), 150);
            return;
        }

        loadDistrictGeo().then(geo => {
            if (geo && geo.features && geo.features.length) {
                const region = ElectionData.getRegion(regionKey);
                const filtered = geo.features.filter(feature => matchesProvince(feature, region));
                if (filtered.length) {
                    renderDistrictGeo(svg, width, height, regionKey, filtered);
                    return;
                }
            }
            // 지오JSON 로드 실패 시 바둑판식 대신 아무것도 표시하지 않음
            // (사용자가 무조건 실제 지도를 원함)
            console.warn('District GeoJSON not available - real map cannot be rendered');
        });
    }

    function loadDistrictGeo() {
        if (districtGeoCache) return Promise.resolve(districtGeoCache);
        if (districtGeoPromise) return districtGeoPromise;

        // 로컬 파일 우선 사용 (더 빠르고 안정적)
        const localUrl = './data/skorea-municipalities-2018-topo.json';
        const externalUrl = 'https://raw.githubusercontent.com/southkorea/southkorea-maps/master/kostat/2018/json/skorea-municipalities-2018-topo.json';

        districtGeoPromise = fetch(localUrl)
            .then(res => res.ok ? res.json() : null)
            .catch(err => {
                console.warn('Local GeoJSON load failed, trying external URL:', err);
                return fetch(externalUrl).then(res => res.ok ? res.json() : null);
            })
            .then(topo => {
                if (!topo) return null;
                const objectKey = Object.keys(topo.objects)[0];
                const geo = topojson.feature(topo, topo.objects[objectKey]);
                districtGeoCache = geo;
                return geo;
            })
            .catch(err => {
                console.warn('District topojson load failed completely:', err);
                return null;
            });
        return districtGeoPromise;
    }

    function getPropValue(props, keys) {
        for (const key of keys) {
            if (props[key]) return props[key];
        }
        return null;
    }

    function normalizeRegionName(name) {
        if (!name) return '';
        return name
            .replace(/\s/g, '')
            .replace(/특별자치시|특별자치도|특별시|광역시|도/g, '');
    }

    // data.js 지역 코드 → GeoJSON 5자리 SIG 코드 앞 2자리 매핑
    // (두 파일이 서로 다른 행정코드 체계를 사용하기 때문에 변환 필요)
    const DATA_CODE_TO_GEO_PREFIX = {
        '11': '11',  // 서울특별시
        '26': '21',  // 부산광역시
        '27': '22',  // 대구광역시
        '28': '23',  // 인천광역시
        '29': '24',  // 광주광역시
        '30': '25',  // 대전광역시
        '31': '26',  // 울산광역시
        '36': '29',  // 세종특별자치시
        '41': '31',  // 경기도
        '42': '32',  // 강원특별자치도
        '43': '33',  // 충청북도
        '44': '34',  // 충청남도
        '45': '35',  // 전북특별자치도
        '46': '36',  // 전라남도
        '47': '37',  // 경상북도
        '48': '38',  // 경상남도
        '50': '39',  // 제주특별자치도
    };

    function matchesProvince(feature, region) {
        if (!feature || !region) return false;
        const props = feature.properties || {};

        // GeoJSON 파일의 속성은 'name'과 'code' 두 가지
        // code: 5자리 SIG 코드 (예: '21010' = 부산 중구)
        // 앞 2자리가 시도 코드 (GeoJSON 기준)
        const geoCode = props.code;
        if (geoCode && region.code) {
            const geoPrefix = DATA_CODE_TO_GEO_PREFIX[String(region.code)];
            if (geoPrefix && String(geoCode).startsWith(geoPrefix)) return true;
        }

        return false;
    }

    function getDistrictName(feature) {
        const props = feature.properties || {};
        const name = getPropValue(props, [
            'SIG_KOR_NM', 'SIG_NM', 'SIG_NAME', 'NAME_2', 'name_2',
            'KOR_NM', 'NAME', 'name'
        ]);
        return name || '미상';
    }

    function getEffectiveDistrictName(regionKey, districtName) {
        if (currentElectionType !== 'mayor') return districtName;
        const raw = String(districtName || '');
        // 경남: 창원특례시 5개 구 → 창원시
        if (regionKey === 'gyeongnam' && /^(의창구|성산구|마산합포구|마산회원구|진해구|창원(특례)?시)$/.test(raw)) return '창원시';
        // 경기
        if (regionKey === 'gyeonggi'  && /^수원시(장안구|권선구|팔달구|영통구)$/.test(raw))    return '수원시';
        if (regionKey === 'gyeonggi'  && /^성남시(수정구|중원구|분당구)$/.test(raw))           return '성남시';
        if (regionKey === 'gyeonggi'  && /^안양시(만안구|동안구)$/.test(raw))                  return '안양시';
        if (regionKey === 'gyeonggi'  && /^안산시(상록구|단원구)$/.test(raw))                  return '안산시';
        if (regionKey === 'gyeonggi'  && /^용인시(처인구|기흥구|수지구)$/.test(raw))           return '용인시';
        if (regionKey === 'gyeonggi'  && /^고양시(덕양구|일산동구|일산서구)$/.test(raw))       return '고양시';
        // 충북
        if (regionKey === 'chungbuk'  && /^청주시(상당구|서원구|흥덕구|청원구)$/.test(raw))   return '청주시';
        // 충남
        if (regionKey === 'chungnam'  && /^천안시(동남구|서북구)$/.test(raw))                  return '천안시';
        // 전북
        if (regionKey === 'jeonbuk'   && /^전주시(완산구|덕진구)$/.test(raw))                  return '전주시';
        // 경북
        if (regionKey === 'gyeongbuk' && /^포항시(남구|북구)$/.test(raw))                     return '포항시';
        return districtName;
    }

    function renderDistrictGeo(svg, width, height, regionKey, features) {
        const fc = { type: 'FeatureCollection', features };
        const projection = d3.geoMercator().fitExtent([[6, 6], [width - 6, height - 6]], fc);
        const path = d3.geoPath().projection(projection);
        const g = svg.append('g');

        g.selectAll('path')
            .data(features)
            .enter()
            .append('path')
            .attr('class', 'district-tile')
            .attr('data-district', d => getEffectiveDistrictName(regionKey, getDistrictName(d)))
            .attr('d', path)
            .attr('fill', d => {
                const name = getEffectiveDistrictName(regionKey, getDistrictName(d));
                const district = ElectionData.getSubRegionByName(regionKey, name);
                const party = district?.leadParty || 'independent';
                return ElectionData.getPartyColor(party) + '22';
            })
            .attr('stroke', d => {
                const name = getEffectiveDistrictName(regionKey, getDistrictName(d));
                const district = ElectionData.getSubRegionByName(regionKey, name);
                const party = district?.leadParty || 'independent';
                return ElectionData.getPartyColor(party);
            })
            .attr('stroke-width', 1)
            .on('click', (event, d) => {
                selectDistrict(regionKey, getEffectiveDistrictName(regionKey, getDistrictName(d)));
            });

        if (features.length <= 40) {
            g.selectAll('text')
                .data(features)
                .enter()
                .append('text')
                .attr('class', 'district-tile-label')
                .attr('transform', d => {
                    const [x, y] = path.centroid(d);
                    return `translate(${x}, ${y})`;
                })
                .text(d => {
                    const name = getDistrictName(d);
                    return name.length > 6 ? name.slice(0, 6) + '…' : name;
                });
        }

        if (currentDistrictName) {
            svg.selectAll('.district-tile').classed('selected', function() {
                return d3.select(this).attr('data-district') === currentDistrictName;
            });
        }
    }

    function renderDistrictFallbackTiles(svg, width, height, regionKey, subRegions) {
        if (!subRegions || subRegions.length === 0) {
            return;
        }

        const count = subRegions.length;
        const cols = Math.ceil(Math.sqrt(count));
        const rows = Math.ceil(count / cols);
        const pad = 6;
        const cellW = Math.max(40, (width - pad * (cols + 1)) / cols);
        const cellH = Math.max(26, (height - pad * (rows + 1)) / rows);

        const g = svg.append('g').attr('transform', `translate(${pad}, ${pad})`);

        subRegions.forEach((district, idx) => {
            const col = idx % cols;
            const row = Math.floor(idx / cols);
            const x = col * (cellW + pad);
            const y = row * (cellH + pad);
            const partyColor = ElectionData.getPartyColor(district.leadParty || 'independent');
            const fill = partyColor + '33';

            const group = g.append('g')
                .attr('class', 'district-tile')
                .attr('data-district', district.name)
                .attr('transform', `translate(${x}, ${y})`)
                .on('click', () => selectDistrict(regionKey, district.name));

            group.append('rect')
                .attr('width', cellW)
                .attr('height', cellH)
                .attr('rx', 8)
                .attr('fill', fill)
                .attr('stroke', partyColor)
                .attr('stroke-width', 1);

            group.append('text')
                .attr('class', 'district-tile-label')
                .attr('x', cellW / 2)
                .attr('y', cellH / 2)
                .text(district.name.length > 6 ? district.name.slice(0, 6) + '…' : district.name);
        });

        if (currentDistrictName) {
            svg.selectAll('.district-tile').classed('selected', function() {
                return d3.select(this).attr('data-district') === currentDistrictName;
            });
        }
    }

    function selectDistrict(regionKey, districtName) {
        currentDistrictName = districtName;

        const summary = ElectionData.getDistrictSummary(regionKey, districtName);
        renderDistrictDetail(summary);

        // highlight list
        document.querySelectorAll('#districts-list .district-card').forEach(card => {
            card.classList.toggle('selected', card.dataset.district === districtName);
        });

        // highlight map tiles
        const svg = d3.select('#districts-map');
        svg.selectAll('.district-tile').classed('selected', function() {
            return d3.select(this).attr('data-district') === districtName;
        });
    }

    function renderDistrictDetail(summary) {
        const detail = document.getElementById('district-detail');
        if (!detail) return;

        if (!summary) {
            detail.classList.remove('active');
            detail.innerHTML = '';
            return;
        }

        const partyColor = ElectionData.getPartyColor(summary.leadParty);
        const seatsValue = typeof summary.council.seats === 'number'
            ? `${summary.council.seats}석`
            : summary.council.seats;
        detail.innerHTML = `
            <div class="district-detail-title">
                <span class="party-color-dot" style="background:${partyColor}"></span>
                <h4>${summary.name}</h4>
            </div>
            <div class="district-detail-grid">
                <div class="district-detail-card">
                    <div class="district-detail-label">기초단체장</div>
                    <div class="district-detail-value">${summary.unknown ? summary.mayor.status : (summary.mayor.name ? `${summary.mayor.name} (${ElectionData.getPartyName(summary.mayor.party)})` : ElectionData.getPartyName(summary.mayor.party))}</div>
                </div>
                <div class="district-detail-card">
                    <div class="district-detail-label">기초의원 의석</div>
                    <div class="district-detail-value">${seatsValue}</div>
                </div>
                <div class="district-detail-card">
                    <div class="district-detail-label">우세 정당</div>
                    <div class="district-detail-value">${summary.unknown ? '데이터 준비 중' : ElectionData.getPartyName(summary.leadParty)}</div>
                </div>
                <div class="district-detail-card">
                    <div class="district-detail-label">주요 현안</div>
                    <div class="district-detail-value">${summary.keyIssue}</div>
                </div>
            </div>
            <div class="district-detail-meta">${summary.unknown ? '해당 시군구 데이터는 준비 중입니다.' : '선관위 등록 데이터 기준. 일부 정보는 준비 중입니다.'}</div>
        `;
        detail.classList.add('active');
    }

    // ============================================
    // News Tab (#8 실시간 뉴스)
    // ============================================
    // 교육 전문 언론사 (뉴스 부스트 대상)
    // 교육 전문 언론사
    const EDUCATION_MEDIA_HOSTS = [
        'hangyo.com',           // 한국교육신문
        'edupress.kr',          // 교육프레스
        'veritas-a.com',        // 베리타스알파
        'educhosun.com',        // 에듀조선
        'edujin.co.kr',         // 에듀진
        'dhnews.co.kr',         // 대학저널
        'eduin.net',            // 에듀인뉴스
        'eduinnews.co.kr',      // 교육인뉴스
        'naeil.com',            // 내일신문 (교육면 강점)
        'ilyosisa.co.kr',       // 일요시사 (교육)
        'kfta.or.kr',           // 한국교총
        'eduhope.net',          // 교육희망
    ];

    // 지역방송사 (전국)
    const REGIONAL_BROADCAST_HOSTS = [
        'knn.co.kr',            // KNN (부산경남)
        'tbc.co.kr',            // TBC (대구)
        'tjb.co.kr',            // TJB (대전충남)
        'kbc.co.kr',            // 광주방송
        'ubc.co.kr',            // UBC (울산)
        'cjb.co.kr',            // CJB (청주충북)
        'g1tv.co.kr',           // G1 (강원)
        'jbn.co.kr',            // JTV (전북)
        'jmbc.co.kr',           // MBC경남
        'cstv.co.kr',           // CCS (충남)
        'jibs.co.kr',           // JIBS (제주)
        'obs.co.kr',            // OBS (경인)
        'mbn.co.kr',            // MBN
    ];

    function mergeUniqueArrays(...arrays) {
        return [...new Set(arrays.flat())];
    }

    // ============================================
    // Initialize on DOM Ready
    // ============================================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Public API
    // ============================================
    // Council Constituency Selected (의원급 선거구 선택)
    // ============================================
    function onConstituencySelected(regionKey, municipalityName, constituencyName) {
        if (!regionKey || !constituencyName) return;

        currentRegionKey = regionKey;
        currentDistrictName = constituencyName;

        const label = currentElectionType === 'localCouncil' ? '기초의원' : '광역의원';
        document.getElementById('panel-region-name').textContent = constituencyName;
        document.getElementById('panel-region-info').textContent = `${municipalityName} ${label}`;

        configurePanelTabs(['overview', 'polls', 'candidates', 'news', 'history']);
        toggleSuperintendentSummary(false);

        const welcome = document.getElementById('panel-welcome');
        if (welcome) welcome.style.display = 'none';

        const _ph = document.querySelector('.panel-header');
        if (_ph) _ph.style.display = '';
        const _pt = document.querySelector('.panel-tabs');
        if (_pt) _pt.style.display = '';

        // 불필요한 빈 박스 숨기기
        const overviewCard = document.querySelector('.election-overview-card');
        if (overviewCard) { overviewCard.style.display = 'none'; }
        const districtDetail = document.getElementById('district-detail');
        if (districtDetail) districtDetail.style.display = 'none';

        // CouncilTab으로 렌더링 위임 (후보 JSON 로드 포함)
        if (typeof CouncilTab !== 'undefined') {
            CouncilTab.render('overview', regionKey, constituencyName, currentElectionType);
        }

        // 뉴스탭 lazy 로딩용
        _newsTabPendingRegion = regionKey;

        switchTabForRegion();
        openPanel();

        if (MapModule.updateBreadcrumb) {
            MapModule.updateBreadcrumb('constituency', regionKey, constituencyName);
        }

        updateHash({ usePushState: true });
    }

    // ============================================
    // Hash-based URL Routing (deep linking)
    // ============================================
    let _hashUpdateSuppressed = false;

    function updateHash({ usePushState = false } = {}) {
        if (_hashUpdateSuppressed) return;
        const parts = [
            currentElectionType || '',
            currentRegionKey || '',
            currentDistrictName || '',
            currentTab || 'overview'
        ];
        const hash = '#/' + parts.map(encodeURIComponent).join('/');
        if (window.location.hash !== hash) {
            if (usePushState) {
                history.pushState(null, '', hash);
            } else {
                history.replaceState(null, '', hash);
            }
        }
    }

    function parseHash() {
        const hash = window.location.hash.replace('#/', '');
        if (!hash) return null;
        const parts = hash.split('/').map(decodeURIComponent);
        return {
            electionType: parts[0] || null,
            regionKey: parts[1] || null,
            districtName: parts[2] || null,
            tabName: parts[3] || 'overview'
        };
    }

    function restoreFromHash() {
        const state = parseHash();
        if (!state || !state.electionType) return;

        _hashUpdateSuppressed = true;

        // Set election type
        const filterBtn = document.querySelector(`.filter-btn[data-type="${state.electionType}"]`);
        if (filterBtn) filterBtn.click();

        // Select region (after a small delay for map to update)
        if (state.regionKey) {
            setTimeout(() => {
                _hashUpdateSuppressed = true;

                // For constituency-based types with a districtName, route via onConstituencySelected or onDistrictSelected
                if (state.districtName) {
                    const councilTypes = ['council', 'localCouncil'];
                    if (state.electionType === 'byElection') {
                        // 재보궐: onByElectionSelected로 직접 이동
                        onByElectionSelected(state.districtName);
                        setTimeout(() => {
                            _hashUpdateSuppressed = true;
                            if (state.tabName && state.tabName !== 'overview') {
                                switchTab(state.tabName);
                            }
                            _hashUpdateSuppressed = false;
                            updateHash();
                        }, 300);
                    } else if (councilTypes.includes(state.electionType)) {
                        // Need to select the region first, then the constituency
                        onRegionSelected(state.regionKey);
                        setTimeout(() => {
                            _hashUpdateSuppressed = true;
                            onConstituencySelected(state.regionKey, '', state.districtName);
                            // Switch tab after constituency selection
                            if (state.tabName && state.tabName !== 'overview') {
                                setTimeout(() => {
                                    _hashUpdateSuppressed = true;
                                    switchTab(state.tabName);
                                    _hashUpdateSuppressed = false;
                                    updateHash();
                                }, 200);
                            } else {
                                _hashUpdateSuppressed = false;
                                updateHash();
                            }
                        }, 300);
                    } else {
                        // mayor or other district-based types
                        onRegionSelected(state.regionKey);
                        setTimeout(() => {
                            _hashUpdateSuppressed = true;
                            onDistrictSelected(state.regionKey, state.districtName);
                            if (state.tabName && state.tabName !== 'overview') {
                                setTimeout(() => {
                                    _hashUpdateSuppressed = true;
                                    switchTab(state.tabName);
                                    _hashUpdateSuppressed = false;
                                    updateHash();
                                }, 200);
                            } else {
                                _hashUpdateSuppressed = false;
                                updateHash();
                            }
                        }, 300);
                    }
                } else {
                    onRegionSelected(state.regionKey);
                    // Switch tab
                    if (state.tabName && state.tabName !== 'overview') {
                        setTimeout(() => {
                            _hashUpdateSuppressed = true;
                            switchTab(state.tabName);
                            _hashUpdateSuppressed = false;
                            updateHash();
                        }, 200);
                    } else {
                        _hashUpdateSuppressed = false;
                        updateHash();
                    }
                }
            }, 300);
        } else {
            _hashUpdateSuppressed = false;
            updateHash();
        }
    }

    window.addEventListener('popstate', () => {
        restoreFromHash();
    });

    // ── Analytics: 이벤트 위임 (clickPoll, clickNews, shareClick) ──
    document.addEventListener('click', (e) => {
        // clickPoll: NESDC 링크 클릭
        const pollLink = e.target.closest('a[href*="nesdc.go.kr/poll/pollDetailView"]');
        if (pollLink) {
            const match = pollLink.href.match(/nttId=(\d+)/);
            trackEvent('clickPoll', {
                pollId: match ? match[1] : null,
                regionKey: currentRegionKey
            });
        }

        // clickNews: 뉴스 링크 클릭
        const newsLink = e.target.closest('.news-live-item[href]');
        if (newsLink) {
            const category = newsLink.closest('[data-category]')?.dataset.category || null;
            trackEvent('clickNews', {
                newsUrl: newsLink.href,
                category,
                regionKey: currentRegionKey
            });
        }

        // shareClick: 공유 버튼 (추후 구현 대비)
        const shareBtn = e.target.closest('[data-share-type]');
        if (shareBtn) {
            trackEvent('shareClick', {
                type: shareBtn.dataset.shareType,
                regionKey: currentRegionKey
            });
        }
    });

    return {
        onRegionSelected,
        onDistrictSelected,
        onSubdistrictSelected,
        onByElectionSelected,
        onConstituencySelected,
        onBreadcrumbNational,
        closePanel,
        switchTab,
        trackShareClick: (type) => trackEvent('shareClick', { type, regionKey: currentRegionKey }),
        getElectionType: () => currentElectionType,
        applyTermTooltips,
        __debug: {
            evaluateNewsCase: typeof NewsTab !== 'undefined' ? NewsTab.evaluateNewsCase : null,
            buildPollSelection: typeof PollTab !== 'undefined' ? PollTab.buildSelection : null
        }
    };

    // ============================================
    // Election Term Tooltips
    // ============================================
    function applyTermTooltips(container) {
        const terms = window._electionTerms;
        if (!terms || !container) return;
        container.querySelectorAll('.panel-card h4, .filter-btn span, .panel-tab').forEach(el => {
            // Skip elements that already have tooltips applied
            if (el.querySelector('.term-tooltip')) return;
            Object.entries(terms).forEach(([term, desc]) => {
                if (el.textContent.includes(term)) {
                    el.innerHTML = el.innerHTML.replace(
                        term,
                        `<span class="term-tooltip" title="${desc}" tabindex="0">${term}</span>`
                    );
                }
            });
        });
    }
})();
