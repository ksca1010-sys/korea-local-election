// ============================================
// 6.3 전국지방선거 인터랙티브 선거 정보 지도
// App Module - Main Application Controller
// ============================================

const App = (() => {
    let currentRegionKey = null;
    let currentTab = 'overview';
    let currentDistrictName = null;
    let currentElectionType = null;
    let _newsTabPendingRegion = null; // lazy 뉴스 로딩: 지역 선택 시 저장, 뉴스탭 전환 시 실제 렌더
    let districtGeoCache = null;
    let districtGeoPromise = null;
    let historyComparisonChart = null;
    const NEWS_FILTER_CONFIG = window.NewsFilterConfig || {};
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
        try { ElectionData.loadCouncilMembersData(); } catch(e) { console.warn('loadCouncilMembersData error:', e); }
        // Load candidates data
        try { ElectionData.loadCandidatesData?.(); } catch(e) { console.warn('loadCandidatesData error:', e); }
        // Load by-election data
        try { ElectionData.loadByElectionData?.(); } catch(e) { console.warn('loadByElectionData error:', e); }
        // Load polls data (여론조사)
        try { await ElectionData.loadPollsData?.(); } catch(e) { console.warn('loadPollsData error:', e); }

        // Load local media pool (새 통합 풀) + 기존 registry + 지역 현안 키워드 → 병합
        try {
            const [poolResp, regResp, issuesResp] = await Promise.all([
                fetch('data/local_media_pool.json?v=' + Date.now()),
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

        // 개요 스크립트 영역
        const overviewCard = document.querySelector('.election-overview-card');
        if (overviewCard) overviewCard.style.display = '';
        const districtDetail = document.getElementById('district-detail');
        if (districtDetail) districtDetail.style.display = '';

        // 공유 컨테이너 초기화
        const ids = ['overview-summary', 'overview-key-issues', 'overview-risk-factor',
                      'current-governor', 'key-issues', 'candidates-list'];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = '';
        });
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

    // ============================================
    // Filter Count 동적 갱신 (election_stats.json 로드 후)
    // ============================================
    function updateFilterCounts() {
        const info = ElectionData.electionTypeInfo;
        if (!info) return;

        const typeMap = {
            governor: 'governor',
            superintendent: 'superintendent',
            mayor: 'mayor',
            council: 'council',
            localCouncil: 'localCouncil',
            councilProportional: 'councilProportional',
            localCouncilProportional: 'localCouncilProportional',
            byElection: 'byElection'
        };

        document.querySelectorAll('.filter-btn[data-type]').forEach(btn => {
            const type = btn.dataset.type;
            const typeInfo = info[typeMap[type] || type];
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

            wrap.addEventListener('mouseenter', () => {
                const rect = wrap.getBoundingClientRect();
                tooltip.style.left = (rect.right + 8) + 'px';
                tooltip.style.top = rect.top + 'px';
                // Keep tooltip within viewport
                const tipHeight = tooltip.offsetHeight || 150;
                if (rect.top + tipHeight > window.innerHeight) {
                    tooltip.style.top = Math.max(10, window.innerHeight - tipHeight - 10) + 'px';
                }
                tooltip.style.display = 'block';
            });

            wrap.addEventListener('mouseleave', () => {
                tooltip.style.display = 'none';
            });
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
    // Party Dominance
    // ============================================
    function renderPartyDominance() {
        const dominance = ElectionData.getPartyDominance();
        const container = document.getElementById('party-dominance');
        if (!container) return;

        const total = Object.values(dominance).reduce((s, v) => s + v, 0);
        const sorted = Object.entries(dominance).sort((a, b) => b[1] - a[1]);

        container.innerHTML = sorted.map(([party, count]) => {
            const color = ElectionData.getPartyColor(party);
            const name = ElectionData.getPartyName(party);
            const pct = (count / total * 100).toFixed(0);
            return `
                <div class="party-dominance-item">
                    <span class="party-color-dot" style="background:${color}"></span>
                    <span class="party-dominance-name">${name}</span>
                    <span class="party-dominance-count">${count}</span>
                    <div class="party-dominance-bar">
                        <div class="party-dominance-bar-fill" style="background:${color};width:${pct}%"></div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // ============================================
    // Hotspots
    // ============================================
    function renderHotspots() {
        const hotspots = ElectionData.getHotspots();
        const container = document.getElementById('hotspot-list');
        if (!container) return;

        container.innerHTML = hotspots.map((spot, idx) => {
            const region = ElectionData.getRegion(spot.key);
            const candidate = region?.candidates.find(c => c.id === spot.leading);
            const partyColor = candidate ? ElectionData.getPartyColor(candidate.party) : '#808080';

            return `
                <div class="hotspot-item ${spot.isWithinMargin ? 'within-margin' : ''}"
                     data-region="${spot.key}" onclick="App.onRegionSelected('${spot.key}')">
                    <span class="hotspot-rank">${idx + 1}</span>
                    <span class="hotspot-name">${spot.name}</span>
                    <span class="hotspot-gap" style="color:${parseFloat(spot.gap) < 5 ? '#f59e0b' : '#8b99b5'}">
                        ${spot.gap}%p
                    </span>
                </div>
            `;
        }).join('');
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

        const totalPct = partyData.reduce((s, [, v]) => s + v, 0);

        let barHtml = '<div class="party-bar-chart">';
        partyData.forEach(([party, value]) => {
            const pct = (value / totalPct * 100).toFixed(1);
            const color = ElectionData.getPartyColor(party);
            barHtml += `<div class="party-bar-segment" style="width:${pct}%;background:${color}" title="${ElectionData.getPartyName(party)}: ${value}%"></div>`;
        });
        barHtml += '</div>';

        barHtml += '<div class="party-bar-labels">';
        partyData.forEach(([party, value]) => {
            const color = ElectionData.getPartyColor(party);
            const name = ElectionData.parties[party]?.shortName || party;
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

    // 초성 매핑 테이블
    /** 검색 인덱스 (최초 1회 빌드) — 지역 × 선거유형 조합 */
    let _searchIndex = null;
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
            provinceTypes.forEach(pt => {
                index.push({
                    regionKey: key,
                    name: region.name,
                    nameEng: region.nameEng || '',
                    electionType: pt.electionType,
                    typeLabel: pt.label,
                    displayName: `${pt.label} ${region.name}`,
                    level: 'province',
                });
            });
        });

        // 2) 시군구 (226개) × 선거유형
        if (ElectionData.subRegionData) {
            Object.entries(ElectionData.subRegionData).forEach(([parentKey, districts]) => {
                const parent = ElectionData.getRegion(parentKey);
                if (!parent) return;
                districts.forEach(d => {
                    districtTypes.forEach(dt => {
                        index.push({
                            regionKey: parentKey,
                            subDistrict: d.name,
                            name: d.name,
                            parentName: parent.name,
                            electionType: dt.electionType,
                            typeLabel: dt.label,
                            displayName: `${dt.label} ${d.name}`,
                            level: 'district',
                        });
                    });
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

        function doSearch(query) {
            if (!query) {
                results.classList.remove('active');
                results.innerHTML = '';
                activeIdx = -1;
                return;
            }

            const index = buildSearchIndex();
            const q = query.toLowerCase();
            const matches = [];

            for (const item of index) {
                const texts = [item.name, item.nameEng, item.parentName].filter(Boolean);
                const matched = texts.some(t => t.includes(query) || t.toLowerCase().includes(q));
                if (!matched) continue;

                let score = 0;
                if (item.name.startsWith(query)) score += 100;
                else if (item.name.includes(query)) score += 50;
                if (item.level === 'province') score += 20;
                // 주요 선거유형 우선
                const typePriority = { governor: 7, superintendent: 6, mayor: 5, council: 4, localCouncil: 3, councilProportional: 2, localCouncilProportional: 1 };
                score += (typePriority[item.electionType] || 0);
                matches.push({ ...item, score });
            }

            matches.sort((a, b) => b.score - a.score);
            const limited = matches.slice(0, 20);
            activeIdx = -1;

            if (!limited.length) {
                results.innerHTML = `
                    <div class="search-result-item no-hover">
                        <div class="result-text">
                            <div class="result-name" style="color:var(--text-muted)">검색 결과가 없습니다</div>
                            <div class="result-desc">시도 또는 시군구 이름으로 검색하세요</div>
                        </div>
                    </div>`;
            } else {
                results.innerHTML = limited.map((m, i) => {
                    const highlighted = highlightMatch(m.name, query);
                    const parentInfo = m.parentName ? `${m.parentName} > ` : '';
                    return `
                        <div class="search-result-item" data-region="${m.regionKey}" ${m.subDistrict ? `data-subdistrict="${m.subDistrict}"` : ''} data-election-type="${m.electionType}" data-idx="${i}">
                            <div class="result-text">
                                <div class="result-name">${m.typeLabel} ${highlighted}</div>
                                <div class="result-desc">${parentInfo}${m.typeLabel}</div>
                            </div>
                            <span class="result-type-badge">${m.level === 'province' ? '시도' : '시군구'}</span>
                        </div>`;
                }).join('');
            }
            results.classList.add('active');
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

        function selectItem(el) {
            if (!el?.dataset.region) return;
            const electionType = el.dataset.electionType;
            const regionKey = el.dataset.region;
            const subDistrict = el.dataset.subdistrict || null;

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
                    // 시도 레벨 선거 (광역단체장, 교육감 등)
                    onRegionSelected(regionKey);
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

                } else {
                    // 기초단체장(mayor) 등: 시군구 지도 → 해당 시군구 선택
                    const p = MapModule.switchToDistrictMap(regionKey);
                    const after = () => {
                        if (MapModule.highlightDistrict) MapModule.highlightDistrict(subDistrict);
                        onDistrictSelected(regionKey, subDistrict);
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

        // 클릭
        results.addEventListener('click', (e) => {
            e.stopPropagation();
            selectItem(e.target.closest('.search-result-item'));
        });

        // 외부 클릭
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.search-box')) {
                results.classList.remove('active');
            }
        });

        // 키보드 탐색
        input.addEventListener('keydown', (e) => {
            const items = results.querySelectorAll('.search-result-item[data-region]');
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                activeIdx = Math.min(activeIdx + 1, items.length - 1);
                updateActive();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                activeIdx = Math.max(activeIdx - 1, 0);
                updateActive();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (activeIdx >= 0 && items[activeIdx]) {
                    selectItem(items[activeIdx]);
                } else if (items.length > 0) {
                    selectItem(items[0]);
                }
            } else if (e.key === 'Escape') {
                results.classList.remove('active');
                input.blur();
                activeIdx = -1;
            }
        });

        // 포커스
        input.addEventListener('focus', (e) => {
            if (e.target.value.trim().length > 0 && results.innerHTML) {
                results.classList.add('active');
            }
        });
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
            renderPollTab(currentRegionKey, currentElectionType, currentDistrictName);
        }

        if (tabName === 'candidates' && currentRegionKey) {
            // 의원급은 CouncilTab에서 처리 (위에서 return됨). 여기 도달하면 광역단체장/기초단체장/교육감만
            const councilTypes = ['council', 'localCouncil', 'councilProportional', 'localCouncilProportional'];
            if (!councilTypes.includes(currentElectionType)) {
                renderCandidatesTab(currentRegionKey);
            }
        }

        // Render news if news tab (lazy 로딩: 뉴스탭 전환 시에만 렌더)
        if (tabName === 'news' && currentRegionKey) {
            if (_newsTabPendingRegion) {
                renderNewsTab(_newsTabPendingRegion);
                _newsTabPendingRegion = null;
            } else {
                renderNewsTab(currentRegionKey);
            }
        }

        if (tabName === 'history' && currentRegionKey) {
            if (typeof HistoryTab !== 'undefined') {
                HistoryTab.render(currentRegionKey, currentElectionType, currentDistrictName);
            } else {
                renderHistoryTab(currentRegionKey);
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

        const searchInput = document.getElementById('region-search');
        if (searchInput) searchInput.value = '';
        const searchResults = document.getElementById('search-results');
        if (searchResults) searchResults.style.display = 'none';

        const mapContainer = document.querySelector('#korea-map');
        if (mapContainer) {
            mapContainer.querySelectorAll('.region').forEach(r => r.classList.remove('selected'));
            mapContainer.querySelectorAll('.district').forEach(d => d.classList.remove('selected'));
        }

        if (MapModule && MapModule.switchToProvinceMap) {
            MapModule.switchToProvinceMap();
        }
        toggleByelectionNote(false);

        document.getElementById('zoom-reset')?.click();

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
                renderGovernorView(regionKey, region);
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

        renderOverviewTab(regionKey);
        // 뉴스탭은 lazy 로딩 — 탭 전환 시 renderNewsTab 호출 (API 쿼터 절약)
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
        renderOverviewTab(regionKey);
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

        // 개요 스크립트 영역 숨기기 (비례대표에서는 불필요)
        const overviewCard = document.querySelector('.election-overview-card');
        if (overviewCard) { overviewCard.style.display = 'none'; }
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
        renderOverviewTab(regionKey);

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

        // prev-election-result, current-governor는 renderOverviewTab에서 처리

        const issuesContainer = document.getElementById('key-issues');
        if (issuesContainer) {
            const subRegion = ElectionData.getSubRegionByName(regionKey, canonicalDistrict);
            issuesContainer.innerHTML = `<div class="issues-list"><span class="issue-tag">${subRegion?.keyIssue || '지역 현안'}</span></div>`;
        }

        // 현직 정보 + 개요 카드 렌더링
        renderOverviewTab(regionKey);

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
    // Overview Tab Rendering (#9 후보 제거됨)
    // ============================================
    function renderOverviewTab(regionKey) {
        const region = ElectionData.getRegion(regionKey);
        if (!region && currentElectionType !== 'byElection') return;

        // Election overview card (선거 쟁점 개요)
        const overviewCard = document.getElementById('election-overview-card');
        if (overviewCard && ElectionData.loadElectionOverview) {
            ElectionData.loadElectionOverview().then(() => {
                const ov = ElectionData.getElectionOverview(regionKey, currentElectionType, currentDistrictName);
                if (ov) {
                    overviewCard.style.display = '';
                    const trendBadge = document.getElementById('overview-trend-badge');
                    const updatedDate = document.getElementById('overview-updated-date');
                    const headline = document.getElementById('overview-headline');
                    const narrative = document.getElementById('overview-narrative');
                    const summary = document.getElementById('overview-summary');
                    const issues = document.getElementById('overview-key-issues');
                    const risk = document.getElementById('overview-risk-factor');
                    if (trendBadge) trendBadge.textContent = ov.trend || '';
                    if (updatedDate) {
                        const updated = ElectionData._overviewCache?.meta?.lastUpdated || '';
                        updatedDate.innerHTML = `${updated} <span style="font-size:var(--text-micro);color:var(--text-muted);margin-left:var(--space-4);">AI 분석</span>`;
                    }
                    if (headline) headline.textContent = ov.headline || '';

                    // narrative 모드: narrative가 있으면 summary 대신 표시
                    if (narrative && ov.narrative) {
                        narrative.textContent = ov.narrative;
                        narrative.style.display = '';
                        if (summary) summary.style.display = 'none';
                    } else {
                        if (narrative) narrative.style.display = 'none';
                        if (summary) {
                            summary.textContent = ov.summary || '';
                            summary.style.display = '';
                        }
                    }

                    if (issues && Array.isArray(ov.keyIssues)) {
                        issues.innerHTML = ov.keyIssues.map(i =>
                            `<span class="issue-tag"><i class="fas fa-hashtag"></i> ${i}</span>`
                        ).join('');
                    }
                    if (risk && ov.riskFactor) {
                        risk.innerHTML = `<i class="fas fa-exclamation-triangle"></i> <strong>핵심 변수:</strong> ${ov.riskFactor}
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
                                    `<span style="font-size:var(--text-caption);background:rgba(255,255,255,0.06);padding:2px 8px;border-radius:4px;">${r.name} ${r.support}%</span>`
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
            });
        }

        // Previous election result (선거유형별 분기)
        // 재보궐: onByElectionSelected에서 이미 렌더링했으므로 건드리지 않음
        const prevContainer = document.getElementById('prev-election-result');
        if (prevContainer && currentElectionType !== 'byElection') {
            if (currentElectionType === 'superintendent') {
                // 교육감: 역대 데이터에서 최근 1건
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
            } else if (currentElectionType === 'mayor' && currentDistrictName) {
                // 기초단체장: mayor_history.json에서 지난 선거결과 표시
                const mayorHist = ElectionData.getMayorHistoricalData(regionKey, currentDistrictName);
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
                // 광역단체장: 기존 로직
                const prev = region.prevElection;
                const winColor = ElectionData.getPartyColor(prev.winner);
                const runColor = ElectionData.getPartyColor(prev.runner);
                prevContainer.innerHTML = `
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
            } else {
                prevContainer.innerHTML = '';
            }
        }

        // Current officeholder (선거유형별 분기)
        // 재보궐: onByElectionSelected에서 후보 카드로 이미 렌더링
        const govContainer = document.getElementById('current-governor');
        if (govContainer && currentElectionType !== 'byElection') {
            let gov = null;
            let govColor = '';
            let label = '';

            if (currentElectionType === 'superintendent') {
                const supt = ElectionData.getSuperintendentData(regionKey);
                if (supt?.currentSuperintendent) {
                    const s = supt.currentSuperintendent;
                    govColor = ElectionData.getSuperintendentColor(s.stance);
                    const sinceText = s.since ? ` ${s.since}년~` : '';
                    govContainer.innerHTML = `
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
                } else {
                    govContainer.innerHTML = '';
                }
            } else if (currentElectionType === 'mayor' && currentDistrictName) {
                // 기초단체장 현직자: subRegionData에서 가져오기
                const distSummary = ElectionData.getDistrictSummary(regionKey, currentDistrictName);
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
                    govContainer.innerHTML = `
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
                }
            }
        }

        // Key issues
        const issuesContainer = document.getElementById('key-issues');
        if (issuesContainer) {
            issuesContainer.innerHTML = renderRegionIssuesHtml(regionKey);
        }
    }

    function destroyHistoryComparisonChart() {
        if (historyComparisonChart) {
            historyComparisonChart.destroy();
            historyComparisonChart = null;
        }
    }

    function buildEmptyTabMessage(message, icon = 'fa-circle-info') {
        return `
            <div class="no-data-message">
                <i class="fas ${icon}"></i>
                <p>${message}</p>
            </div>
        `;
    }

    function getCandidateStatusMeta(status) {
        switch (status) {
            case 'DECLARED':
                return {
                    label: '출마 선언',
                    style: 'background:rgba(59,130,246,0.14);color:#93c5fd;border:1px solid rgba(59,130,246,0.24);'
                };
            case 'EXPECTED':
                return {
                    label: '거론',
                    style: 'background:rgba(245,158,11,0.14);color:#fbbf24;border:1px solid rgba(245,158,11,0.24);'
                };
            case 'RUMORED':
                return {
                    label: '하마평',
                    style: 'background:rgba(168,85,247,0.14);color:#d8b4fe;border:1px solid rgba(168,85,247,0.24);'
                };
            case 'NOMINATED':
                return {
                    label: '공천확정',
                    style: 'background:rgba(20,184,166,0.14);color:#5eead4;border:1px solid rgba(20,184,166,0.24);'
                };
            case 'WITHDRAWN':
                return {
                    label: '사퇴',
                    style: 'background:rgba(128,128,128,0.14);color:#94a3b8;border:1px solid rgba(128,128,128,0.24);text-decoration:line-through;'
                };
            default:
                return null;
        }
    }


    function buildCandidateTabModel(regionKey) {
        // 재보궐: byelection.json에서 후보 로드
        if (currentElectionType === 'byElection' && currentDistrictName) {
            const byeData = ElectionData.getByElectionData(currentDistrictName);
            if (byeData) {
                return {
                    title: `${byeData.district} 국회의원 재보궐 후보`,
                    candidates: (byeData.candidates || [])
                        .filter(c => c.status !== 'WITHDRAWN')
                        .map(c => ({
                            name: c.name,
                            badgeLabel: ElectionData.getPartyName(c.party || c.partyKey || 'independent'),
                            badgeColor: ElectionData.getPartyColor(c.party || c.partyKey || 'independent'),
                            age: c.age,
                            career: c.career || '',
                            pledges: Array.isArray(c.pledges) ? c.pledges.filter(Boolean) : [],
                            status: c.status,
                            statusMeta: getCandidateStatusMeta(c.status),
                            incumbent: false,
                        })),
                    emptyMessage: '등록된 재보궐 후보 데이터가 없습니다. 공천 확정 후 업데이트됩니다.'
                };
            }
        }

        const region = ElectionData.getRegion(regionKey);
        if (!region) {
            return { title: '후보자 정보', candidates: [], emptyMessage: '후보자 데이터를 찾을 수 없습니다.' };
        }

        if (currentElectionType === 'governor') {
            const incumbentName = region.currentGovernor?.name || '';
            return {
                title: `${region.name} 광역단체장 후보`,
                candidates: (region.candidates || []).map((candidate) => ({
                    name: candidate.name,
                    badgeLabel: ElectionData.getPartyName(candidate.party),
                    badgeColor: ElectionData.getPartyColor(candidate.party),
                    age: candidate.age,
                    career: candidate.career,
                    pledges: Array.isArray(candidate.pledges) ? candidate.pledges.filter(Boolean) : [],
                    status: candidate.status,
                    statusMeta: getCandidateStatusMeta(candidate.status),
                    incumbent: incumbentName === candidate.name
                })),
                emptyMessage: '등록된 광역단체장 후보 데이터가 없습니다.'
            };
        }

        if (currentElectionType === 'superintendent') {
            const data = ElectionData.getSuperintendentData(regionKey);
            const incumbentName = data?.currentSuperintendent?.name || '';
            return {
                title: `${region.name} 교육감 후보`,
                candidates: (data?.candidates || []).map((candidate) => ({
                    name: candidate.name,
                    badgeLabel: candidate.stance || '교육계',
                    badgeColor: ElectionData.getSuperintendentColor(candidate.stance),
                    age: candidate.age,
                    career: candidate.career,
                    pledges: Array.isArray(candidate.pledges) ? candidate.pledges.filter(Boolean) : [],
                    supportLabel: (Number.isFinite(Number(candidate.support)) && Number(candidate.support) > 0) ? `최근 조사 ${Number(candidate.support).toFixed(1)}%` : '',
                    incumbent: incumbentName === candidate.name
                })),
                emptyMessage: '등록된 교육감 후보 데이터가 없습니다.'
            };
        }

        if (currentElectionType === 'mayor') {
            if (!currentDistrictName) {
                return {
                    title: `${region.name} 기초단체장 후보`,
                    candidates: [],
                    emptyMessage: '지도에서 시군구를 선택하면 해당 지역 기초단체장 후보를 확인할 수 있습니다.'
                };
            }

            const canonicalDistrict = ElectionData.getSubRegionByName(regionKey, currentDistrictName)?.name || currentDistrictName;
            const mayorData = ElectionData.getMayorData?.(regionKey, canonicalDistrict);
            const districtSummary = ElectionData.getDistrictSummary?.(regionKey, canonicalDistrict);
            const pollCandidates = ElectionData.getPollCandidates?.(regionKey, 'mayor', canonicalDistrict) || [];
            const candidates = mayorData?.candidates?.length
                ? mayorData.candidates
                : pollCandidates.map((candidate, index) => ({
                    id: `${regionKey}-${canonicalDistrict}-${index}`,
                    name: candidate.name,
                    party: candidate.party || districtSummary?.leadParty || 'independent',
                    age: null,
                    career: '',
                    pledges: []
                }));

            return {
                title: `${canonicalDistrict} 기초단체장 후보`,
                candidates: candidates.map((candidate) => ({
                    name: candidate.name,
                    badgeLabel: ElectionData.getPartyName(candidate.party),
                    badgeColor: ElectionData.getPartyColor(candidate.party),
                    age: candidate.age,
                    career: candidate.career,
                    pledges: Array.isArray(candidate.pledges) ? candidate.pledges.filter(Boolean) : [],
                    incumbent: districtSummary?.mayor?.name === candidate.name
                })),
                emptyMessage: `${canonicalDistrict} 기초단체장 후보 데이터가 아직 연결되지 않았습니다.`
            };
        }

        // 비례대표: 정당별 의석 배분 표시
        if (currentElectionType === 'councilProportional' || currentElectionType === 'localCouncilProportional') {
            const isCouncilProp = currentElectionType === 'councilProportional';
            const typeLabel = isCouncilProp ? '광역 비례대표' : '기초 비례대표';
            const propData = isCouncilProp
                ? ElectionData.getProportionalCouncilRegion(regionKey)
                : ElectionData.getProportionalLocalCouncilRegion(regionKey);

            if (propData) {
                const parties = (propData.parties || []).filter(p => p.seats > 0);
                const candidates = parties.map(p => ({
                    name: `${ElectionData.getPartyName(p.party)} (${p.seats}석)`,
                    badgeLabel: `${p.seats}석`,
                    badgeColor: ElectionData.getPartyColor(p.party),
                    career: p.voteShare ? `득표율 ${p.voteShare}%` : '',
                    pledges: [],
                }));
                return {
                    title: `${region.name} ${typeLabel} 정당별 의석`,
                    candidates,
                    emptyMessage: `${typeLabel} 데이터가 없습니다.`
                };
            }
        }

        // 광역의원/기초의원: 현직 의원 데이터 표시
        if (currentElectionType === 'council' || currentElectionType === 'localCouncil') {
            const typeLabel = currentElectionType === 'council' ? '광역의원' : '기초의원';
            // 현직 의원 데이터 가져오기
            const councilData = ElectionData.getCouncilData(regionKey);
            const members = [];
            if (councilData?.municipalities) {
                Object.values(councilData.municipalities).forEach(constituencies => {
                    constituencies.forEach(c => {
                        (c.candidates || []).forEach(m => {
                            members.push({
                                name: m.name,
                                badgeLabel: ElectionData.getPartyName(m.party || 'independent'),
                                badgeColor: ElectionData.getPartyColor(m.party || 'independent'),
                                career: c.name || '',
                                pledges: [],
                                incumbent: true,
                                statusMeta: { label: '현직', style: 'background:rgba(59,130,246,0.2);color:#60a5fa' },
                            });
                        });
                    });
                });
            }
            return {
                title: `${region.name} ${typeLabel} 현직 의원`,
                candidates: members,
                emptyMessage: `${typeLabel} 의원 데이터가 아직 연결되지 않았습니다.`
            };
        }

        return {
            title: `${region.name} 후보자 정보`,
            candidates: [],
            emptyMessage: '현재 선택한 선거 유형은 후보자 탭을 아직 지원하지 않습니다.'
        };
    }

    function renderCandidateCompareTable(candidates) {
        const compareTargets = candidates.filter((candidate) => candidate.pledges?.length);
        if (compareTargets.length < 2) return '';
        const rowCount = Math.min(3, Math.max(...compareTargets.map((candidate) => candidate.pledges.length)));
        const header = compareTargets.map((candidate) => `
            <div class="compare-col-header">
                <div style="font-weight:700;color:var(--text-primary)">${candidate.name}</div>
                <div style="font-size:0.8rem;color:var(--text-muted);margin-top:3px;">${candidate.badgeLabel}</div>
            </div>
        `).join('');
        const rows = Array.from({ length: rowCount }, (_, index) => `
            <div class="compare-row">
                ${compareTargets.map((candidate) => `
                    <div class="compare-cell">${candidate.pledges[index] ? `${index + 1}. ${candidate.pledges[index]}` : '-'}</div>
                `).join('')}
            </div>
        `).join('');
        return `
            <div class="compare-table">
                <div class="compare-header">${header}</div>
                ${rows}
            </div>
        `;
    }

    function renderCandidatesTab(regionKey) {
        const listEl = document.getElementById('candidates-list');
        const compareCardEl = document.getElementById('candidate-compare-card');
        const compareEl = document.getElementById('candidate-compare');
        if (!listEl || !compareCardEl || !compareEl) return;

        const model = buildCandidateTabModel(regionKey);
        // Layer 2B: 정렬 모드 판정
        const sortMode = typeof ElectionCalendar !== 'undefined'
            ? ElectionCalendar.getCandidateSortMode()
            : 'status_priority';

        if (sortMode === 'ballot_number') {
            // 5/15 이후: 기호순 정렬 (기호번호 없으면 뒤로)
            model.candidates.sort((a, b) => (a.ballotNumber || 999) - (b.ballotNumber || 999));
        } else {
            // 상태 우선순위 정렬: 공천확정 > 출마선언 > 거론 > 하마평 > 사퇴
            const statusOrder = { NOMINATED: 0, DECLARED: 1, EXPECTED: 2, RUMORED: 3, WITHDRAWN: 4 };
            model.candidates.sort((a, b) => {
                const sa = statusOrder[a.status] ?? 1;
                const sb = statusOrder[b.status] ?? 1;
                return sa - sb;
            });
        }
        if (!model.candidates.length) {
            listEl.innerHTML = buildEmptyTabMessage(model.emptyMessage, 'fa-user-tie');
            compareEl.innerHTML = '';
            compareCardEl.style.display = 'none';
            return;
        }

        listEl.innerHTML = `
            <div class="cand-count-summary">
                <i class="fas fa-list-ul"></i>${model.title} · ${model.candidates.length}명
            </div>
            ${model.candidates.map((candidate) => {
                const statusClass = candidate.status === 'NOMINATED' ? 'status-nominated'
                    : candidate.status === 'DECLARED' ? 'status-declared' : '';
                return `
                <div class="candidate-card-full ${statusClass}">
                    <div class="candidate-header">
                        <div class="candidate-avatar" style="background:${candidate.badgeColor}">
                            ${candidate.name?.charAt(0) || '?'}
                        </div>
                        <div style="flex:1;min-width:0;">
                            <div class="candidate-info">
                                <span class="candidate-name">${candidate.name}</span>
                                ${candidate.age ? `<span class="candidate-age">${candidate.age}세</span>` : ''}
                                <span class="party-badge" style="background:${candidate.badgeColor};display:inline-block;padding:1px 6px;border-radius:3px;font-size:0.8rem;color:white;">${candidate.badgeLabel}</span>
                            </div>
                            <div class="candidate-career">${candidate.career || '<span style="color:var(--text-muted);font-style:italic">경력 정보 수집 중</span>'}</div>
                            ${candidate.supportLabel ? `<div class="cand-core-message">${candidate.supportLabel}</div>` : ''}
                        </div>
                    </div>
                    ${candidate.pledges?.length ? `
                        <div class="candidate-pledges">
                            <div class="pledges-title">주요 공약</div>
                            ${candidate.pledges.slice(0, 3).map((pledge, index) => `
                                <div class="pledge-item">
                                    <span class="pledge-num">${index + 1}</span>
                                    <span>${pledge}</span>
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}
                    <div class="cand-card-footer">
                        ${candidate.incumbent ? `<span class="cand-incumbent-badge"><i class="fas fa-star"></i>현직</span>` : ''}
                        ${candidate.statusMeta ? `<span class="cand-status-badge" style="${candidate.statusMeta.style}">${candidate.statusMeta.label}</span>` : ''}
                    </div>
                </div>
            `;}).join('')}
        `;

        const compareHtml = renderCandidateCompareTable(model.candidates);
        compareEl.innerHTML = compareHtml;
        compareCardEl.style.display = compareHtml ? '' : 'none';
    }

    function getHistoryEmptyMessage() {
        if (currentElectionType === 'superintendent') {
            return '교육감 역대 비교 데이터는 아직 연결되지 않았습니다.';
        }
        if (currentElectionType === 'mayor' && !currentDistrictName) {
            return '시군구를 선택하면 역대 기초단체장 선거 결과를 확인할 수 있습니다.';
        }
        if (currentElectionType === 'mayor') {
            return '이 시군구의 역대 선거 데이터가 없습니다.';
        }
        return '현재 선택한 선거 유형의 역대 비교 데이터가 없습니다.';
    }

    function truncatePartyLabel(label) {
        const text = String(label || '');
        return text.length > 5 ? `${text.slice(0, 5)}…` : text;
    }

    function getHistoryBlocKey(partyKey) {
        if (partyKey === 'democratic' || partyKey === '진보') return 'democratic';
        if (partyKey === 'ppp' || partyKey === '보수') return 'ppp';
        if (partyKey === 'independent') return 'independent';
        if (partyKey === '중도') return 'other';
        return 'other';
    }

    function getHistoryBlocLabel(blocKey) {
        if (currentElectionType === 'superintendent') {
            switch (blocKey) {
                case 'democratic': return '진보';
                case 'ppp': return '보수';
                case 'other': return '중도';
                default: return '기타';
            }
        }
        switch (blocKey) {
            case 'democratic':
                return '민주계';
            case 'ppp':
                return '보수계';
            case 'independent':
                return '무소속';
            default:
                return '제3정당';
        }
    }

    function renderHistoryTab(regionKey) {
        const flowEl = document.getElementById('history-party-flow');
        const resultsEl = document.getElementById('history-results');
        const canvas = document.getElementById('history-turnout-chart');
        if (!flowEl || !resultsEl || !canvas) return;

        const chartCardTitle = canvas.closest('.panel-card')?.querySelector('h4');
        const chartEmptyId = 'history-turnout-empty';
        let emptyEl = document.getElementById(chartEmptyId);
        if (!emptyEl) {
            emptyEl = document.createElement('div');
            emptyEl.id = chartEmptyId;
            emptyEl.style.display = 'none';
            canvas.insertAdjacentElement('afterend', emptyEl);
        }

        const history = currentElectionType === 'governor'
            ? (ElectionData.getHistoricalData(regionKey) || [])
            : currentElectionType === 'superintendent'
            ? (ElectionData.getSuperintendentHistoricalData(regionKey) || [])
            : currentElectionType === 'mayor' && currentDistrictName
            ? (ElectionData.getMayorHistoricalData(regionKey, currentDistrictName) || [])
            : [];

        if (!history.length) {
            destroyHistoryComparisonChart();
            canvas.style.display = 'none';
            emptyEl.style.display = '';
            emptyEl.innerHTML = buildEmptyTabMessage(getHistoryEmptyMessage(), 'fa-clock-rotate-left');
            if (chartCardTitle) {
                chartCardTitle.innerHTML = '<i class="fas fa-chart-area"></i> 역대 선거 그래프';
            }
            flowEl.innerHTML = buildEmptyTabMessage(getHistoryEmptyMessage(), 'fa-shuffle');
            resultsEl.innerHTML = buildEmptyTabMessage(getHistoryEmptyMessage(), 'fa-table-list');
            return;
        }

        const changeCount = history.reduce((count, entry, index) => {
            if (index === 0) return count;
            return count + (history[index - 1].winner !== entry.winner ? 1 : 0);
        }, 0);
        const avgTurnout = (history.reduce((sum, entry) => sum + (Number(entry.turnout) || 0), 0) / history.length).toFixed(1);
        const winnerCounts = history.reduce((counts, entry) => {
            const blocKey = getHistoryBlocKey(entry.winner);
            counts.set(blocKey, (counts.get(blocKey) || 0) + 1);
            return counts;
        }, new Map());
        const dominantParty = [...winnerCounts.entries()].sort((a, b) => b[1] - a[1])[0] || ['other', 0];
        const dominantPartyLabel = getHistoryBlocLabel(dominantParty[0]);
        const historyBlocPalette = currentElectionType === 'superintendent'
            ? {
                democratic: ElectionData.getSuperintendentColor('진보'),
                ppp: ElectionData.getSuperintendentColor('보수'),
                other: ElectionData.getSuperintendentColor('중도'),
                independent: '#a0a0a0'
            }
            : {
                democratic: ElectionData.getPartyColor('democratic'),
                ppp: ElectionData.getPartyColor('ppp'),
                other: ElectionData.getPartyColor('other'),
                independent: ElectionData.getPartyColor('independent')
            };
        const blocAppearances = history.reduce((counts, entry) => {
            const winnerBloc = getHistoryBlocKey(entry.winner);
            counts.set(winnerBloc, (counts.get(winnerBloc) || 0) + 1);
            if (entry.runner) {
                const runnerBloc = getHistoryBlocKey(entry.runner);
                counts.set(runnerBloc, (counts.get(runnerBloc) || 0) + 1);
            }
            return counts;
        }, new Map());
        const chartDatasets = [...blocAppearances.entries()]
            .filter(([, count]) => count > 0)
            .sort((a, b) => b[1] - a[1])
            .map(([blocKey]) => ({
                label: getHistoryBlocLabel(blocKey),
                data: history.map((entry) => {
                    // 같은 계열이 1·2위 모두일 때 합산 방지: 최고 득표율만 사용
                    let best = null;
                    if (getHistoryBlocKey(entry.winner) === blocKey) best = Number(entry.rate) || 0;
                    if (entry.runner && getHistoryBlocKey(entry.runner) === blocKey) {
                        const runnerVal = Number(entry.runnerRate) || 0;
                        best = best !== null ? Math.max(best, runnerVal) : runnerVal;
                    }
                    return best !== null ? Number(best.toFixed(1)) : null;
                }),
                borderColor: historyBlocPalette[blocKey],
                backgroundColor: `${historyBlocPalette[blocKey]}22`,
                tension: 0.28,
                fill: false,
                spanGaps: true,
                pointRadius: 4,
                pointHoverRadius: 6,
                borderWidth: 2.5
            }));

        flowEl.innerHTML = `
            <div class="hpf-timeline">
                ${history.map((entry, index) => {
                    const winnerPartyLabel = truncatePartyLabel(entry.winnerPartyLabel || entry.winnerParty || ElectionData.getHistoricalPartyName(entry.winner, entry.election));
                    const color = ElectionData.getPartyColor(entry.winner);
                    const changed = index > 0 && history[index - 1].winner !== entry.winner;
                    return `
                        <div class="hpf-node">
                            ${changed ? '<span class="hpf-change-mark">교체</span>' : ''}
                            <div class="hpf-dot" style="background:${color}"></div>
                            <div class="hpf-label">${entry.year}</div>
                            <div class="hpf-party" style="color:${color}">${winnerPartyLabel}</div>
                        </div>
                        ${index < history.length - 1 ? `<div class="hpf-line" style="background:${color}"></div>` : ''}
                    `;
                }).join('')}
            </div>
            <div class="hpf-summary">
                <div class="hpf-stat">
                    <span class="hpf-stat-val">${changeCount}회</span>
                    <span class="hpf-stat-lbl">정권 교체</span>
                </div>
                <div class="hpf-stat">
                    <span class="hpf-stat-val">${dominantPartyLabel} ${dominantParty[1]}회</span>
                    <span class="hpf-stat-lbl">최다 승리</span>
                </div>
                <div class="hpf-stat">
                    <span class="hpf-stat-val">${avgTurnout}%</span>
                    <span class="hpf-stat-lbl">평균 투표율</span>
                </div>
            </div>
        `;

        resultsEl.innerHTML = history.map((entry) => {
            const winnerColor = currentElectionType === 'superintendent'
                ? ElectionData.getSuperintendentColor(entry.winner) || ElectionData.getPartyColor(entry.winner)
                : ElectionData.getPartyColor(entry.winner);
            const runnerColor = currentElectionType === 'superintendent'
                ? ElectionData.getSuperintendentColor(entry.runner) || ElectionData.getPartyColor(entry.runner || 'independent')
                : ElectionData.getPartyColor(entry.runner || 'independent');
            const winnerPct = Number(entry.rate) || 0;
            const runnerPct = Number(entry.runnerRate) || 0;
            return `
                <div class="ht-row">
                    <div class="ht-left">
                        <span class="ht-year">${entry.year}</span>
                    </div>
                    <div class="ht-center">
                        <div class="ht-bar-track">
                            <div class="ht-bar-fill" style="width:${winnerPct}%;background:${winnerColor}"></div>
                        </div>
                        <div class="ht-names">
                            <span><span class="ht-dot" style="background:${winnerColor}"></span>${entry.winnerName} <b>${winnerPct.toFixed(1)}%</b></span>
                            <span class="ht-sub"><span class="ht-dot" style="background:${runnerColor}"></span>${entry.runnerName || '-'} ${runnerPct.toFixed(1)}%</span>
                        </div>
                    </div>
                </div>
            `;
        }).reverse().join('');

        destroyHistoryComparisonChart();
        const chartCard = document.getElementById('history-chart-card');
        if (chartCard) {
            chartCard.style.display = '';
            chartCard.querySelector('h4')?.remove();
            const h4 = document.createElement('h4');
            h4.innerHTML = '<i class="fas fa-chart-area"></i> 정당 계열 득표율 변화';
            chartCard.insertBefore(h4, canvas);
        }
        canvas.style.display = '';
        emptyEl.style.display = 'none';

        // Y축 범위를 데이터에 맞게 자동 산출
        const allVals = chartDatasets.flatMap(ds => ds.data).filter(v => v !== null);
        const yMin = Math.max(0, Math.floor((Math.min(...allVals) - 5) / 10) * 10);
        const yMax = Math.min(100, Math.ceil((Math.max(...allVals) + 5) / 10) * 10);

        historyComparisonChart = new Chart(canvas, {
            type: 'line',
            data: {
                labels: history.map((entry) => `${entry.year}`),
                datasets: chartDatasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                aspectRatio: 2,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    legend: {
                        labels: {
                            color: getComputedStyle(document.documentElement).getPropertyValue('--chart-legend').trim() || '#cbd5e1',
                            usePointStyle: true,
                            boxWidth: 10
                        }
                    },
                    tooltip: {
                        backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--tooltip-bg').trim() || 'rgba(26, 34, 54, 0.95)',
                        borderColor: getComputedStyle(document.documentElement).getPropertyValue('--tooltip-border').trim() || 'rgba(59, 130, 246, 0.3)',
                        borderWidth: 1,
                        padding: 10,
                        cornerRadius: 8,
                        titleColor: getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim() || '#DDE1FF',
                        bodyColor: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() || '#A9C7FF',
                        callbacks: {
                            label: (ctx) => {
                                if (ctx.raw === null) return null;
                                return `${ctx.dataset.label}: ${ctx.raw}%`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--chart-tick').trim() || '#94a3b8' },
                        grid: { color: getComputedStyle(document.documentElement).getPropertyValue('--chart-grid-line').trim() || 'rgba(148,163,184,0.08)' }
                    },
                    y: {
                        min: yMin,
                        max: yMax,
                        ticks: {
                            color: getComputedStyle(document.documentElement).getPropertyValue('--chart-tick').trim() || '#94a3b8',
                            callback: (value) => `${value}%`,
                            stepSize: 10
                        },
                        grid: { color: getComputedStyle(document.documentElement).getPropertyValue('--chart-grid-line').trim() || 'rgba(148,163,184,0.08)' }
                    }
                }
            }
        });

        // Accessible sr-only table for screen readers
        {
            const prevSr = canvas.nextElementSibling;
            if (prevSr && prevSr.classList.contains('sr-only')) prevSr.remove();
            const tbl = document.createElement('table');
            tbl.className = 'sr-only';
            tbl.innerHTML =
                `<caption>정당 계열 득표율 변화</caption>` +
                `<tr><th>연도</th>${chartDatasets.map(ds => `<th>${ds.label}</th>`).join('')}</tr>` +
                history.map((entry, i) => {
                    return `<tr><td>${entry.year}</td>${chartDatasets.map(ds => {
                        const v = ds.data[i];
                        return `<td>${v !== null ? v + '%' : '-'}</td>`;
                    }).join('')}</tr>`;
                }).join('');
            canvas.setAttribute('aria-hidden', 'true');
            canvas.parentNode.insertBefore(tbl, canvas.nextSibling);
        }
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

    function buildSuperintendentNewsCategories(regionKey, regionName) {
        const exactBase = `"${regionName} 교육감"`;
        const exactEdu = `"${regionName}" "교육감"`;

        const governorExclude = ['도지사', '지사 후보', '시장 후보', '시장', '구청장', '군수',
            '광역단체장', '반도체', '공장', '국회의원', '국회',
            '시의원', '도의원', '군의원', '기초의원', '지방의원', '지역위원장', '지역 밀착'];

        // 교육언론 + 지역방송 + 지역신문(LocalMediaRegistry) 통합 부스트
        const localRegistry = window.LocalMediaRegistry?.regions?.[regionKey];
        const localHosts = [
            ...(localRegistry?.province?.hosts?.tier1 || []),
            ...(localRegistry?.province?.hosts?.tier2 || [])
        ];
        const allBoostHosts = [...EDUCATION_MEDIA_HOSTS, ...REGIONAL_BROADCAST_HOSTS, ...localHosts];

        // 지역신문명으로 직접 검색하는 쿼리 생성
        const localMediaNames = localRegistry?.province?.priorityNames?.slice(0, 2) || [];
        const localSearchQueries = localMediaNames.map(name => `${name} 교육감`);

        return [
            {
                label: '전체', icon: 'fas fa-newspaper', categoryId: 'all',
                query: `${exactBase} 선거`,
                maxAgeDays: 60,
                altQueries: [`${exactEdu} 선거 후보`],
                focusKeywords: ['교육감', '교육', '선거', '후보', '출마'],
                boostHosts: allBoostHosts, boostWeight: 5, localMediaPriority: true, _regionKey: regionKey,
                strict: { mustAny: ['교육감'], titleMustAny: ['교육감'], targetAny: [regionName], excludeAny: governorExclude },
                relaxed: { mustAny: ['교육감'], targetAny: [regionName], excludeAny: governorExclude }
            },
            {
                label: '여론조사', icon: 'fas fa-chart-bar', categoryId: 'polls',
                query: `${exactBase} 여론조사`,
                maxAgeDays: 60,
                altQueries: [`${exactEdu} 지지율 적합도`],
                focusKeywords: ['여론조사', '지지율', '적합도', '교육감'],
                boostHosts: allBoostHosts, boostWeight: 5, localMediaPriority: true, _regionKey: regionKey,
                strict: { mustAny: ['교육감'], targetAny: ['여론조사', '지지율', '적합도'], excludeAny: governorExclude },
                relaxed: { mustAny: ['교육감'], targetAny: ['여론조사', '지지율'], excludeAny: governorExclude }
            },
            {
                label: '후보·인물', icon: 'fas fa-user', categoryId: 'candidates',
                query: `${exactBase} 후보 출마`,
                maxAgeDays: 60,
                altQueries: [`${exactEdu} 후보 출마`],
                focusKeywords: ['교육감', '후보', '출마', '경력'],
                boostHosts: allBoostHosts, boostWeight: 5, localMediaPriority: true, _regionKey: regionKey,
                strict: { mustAny: ['교육감'], titleMustAny: ['교육감'], targetAny: [regionName], excludeAny: governorExclude },
                relaxed: { mustAny: ['교육감'], targetAny: [regionName], excludeAny: governorExclude }
            },
            {
                label: '교육정책', icon: 'fas fa-school', categoryId: 'policy',
                query: `${exactEdu} 공약 교육정책`,
                maxAgeDays: 60,
                altQueries: [`${exactBase} 공약 교육정책`],
                focusKeywords: ['교육감', '교육청', '공약', '정책', '학교'],
                boostHosts: allBoostHosts, boostWeight: 5, localMediaPriority: true, _regionKey: regionKey,
                strict: { mustAny: ['교육감', '교육청'], targetAny: [regionName], excludeAny: governorExclude },
                relaxed: { mustAny: ['교육감'], targetAny: [regionName], excludeAny: governorExclude }
            }
        ].map(cat => ({
            ...cat,
            preferPopularity: true,
            // 교육감: 지역성 가중치를 높임 (광역단체장 0.15 → 교육감 0.25)
            scoreWeightsOverride: { time: 0.28, relevance: 0.25, credibility: 0.15, locality: 0.25, engagement: 0.07 }
        }));
    }

    function buildProportionalNewsCategories(regionKey, regionName, electionType) {
        const typeLabel = electionType === 'councilProportional' ? '광역비례' : '기초비례';
        return [
            {
                label: '전체', icon: 'fas fa-newspaper', categoryId: 'all',
                query: `"${regionName}" 비례대표 지방선거 정당`,
                maxAgeDays: 60,
                altQueries: [`${regionName} 비례대표 공천 정당`],
                focusKeywords: ['비례대표', '정당', '명부', '공천'],
                strict: { mustAny: ['비례대표', '비례'], targetAny: [regionName, '지방선거'], excludeAny: ['국회', '총선'] },
                relaxed: { mustAny: ['비례대표', '비례'], targetAny: ['지방선거'], excludeAny: ['국회', '총선'] }
            },
            {
                label: '정당 지지율', icon: 'fas fa-chart-pie', categoryId: 'partySupport',
                query: `"${regionName}" 정당지지율 지방선거`,
                maxAgeDays: 60,
                altQueries: [`${regionName} 정당 지지율 지방선거`],
                focusKeywords: ['정당지지율', '정당지지도', '정당'],
                strict: { mustAny: ['정당지지율', '정당지지도', '정당 지지'], targetAny: [regionName], excludeAny: ['국회', '총선', '대선'] },
                relaxed: { mustAny: ['정당', '지지율'], targetAny: [regionName], excludeAny: ['국회', '총선', '대선'] }
            }
        ];
    }

    function buildCouncilNewsCategories(regionKey, regionName, electionType) {
        const typeLabel = electionType === 'council' ? '광역의원' : '기초의원';
        const typeShort = electionType === 'council' ? '시도의원' : '기초의원';
        const localRegistry = window.LocalMediaRegistry?.regions?.[regionKey];
        const localHosts = [
            ...(localRegistry?.province?.hosts?.tier1 || []),
            ...(localRegistry?.province?.hosts?.tier2 || [])
        ];

        // 광역·기초의원은 전국언론보다 지역언론이 실질적으로 더 중요 →
        // preferPopularity + locality 가중치 높게 설정
        const councilScoreWeights = { time: 0.22, relevance: 0.18, credibility: 0.06, locality: 0.48, engagement: 0.06 };

        return [
            {
                label: '전체', icon: 'fas fa-newspaper', categoryId: 'all',
                query: `"${regionName}" "${typeShort}" 선거 공천`,
                maxAgeDays: 60,
                altQueries: [`${regionName} ${typeLabel} 공천 선거구`],
                focusKeywords: [typeShort, typeLabel, '공천', '선거구', '후보'],
                boostHosts: localHosts, boostWeight: 5, localMediaPriority: true, _regionKey: regionKey,
                preferPopularity: true, scoreWeightsOverride: councilScoreWeights,
                strict: { mustAny: [typeShort, typeLabel, '의원'], targetAny: [regionName], excludeAny: ['도지사', '교육감', '국회의원', '국회'] },
                relaxed: { mustAny: [typeShort, typeLabel], targetAny: [regionName], excludeAny: ['도지사', '교육감', '국회의원'] }
            },
            {
                label: '공천·경선', icon: 'fas fa-vote-yea', categoryId: 'nomination',
                query: `"${regionName}" "${typeShort}" 공천 경선`,
                maxAgeDays: 60,
                altQueries: [`${regionName} ${typeLabel} 공천 경선`],
                focusKeywords: ['공천', '경선', '당선권', '전략공천', '컷오프'],
                boostHosts: localHosts, boostWeight: 5, localMediaPriority: true, _regionKey: regionKey,
                preferPopularity: true, scoreWeightsOverride: councilScoreWeights,
                strict: { mustAny: ['공천', '경선', '전략공천'], targetAny: [regionName, typeShort, typeLabel], excludeAny: ['도지사', '교육감', '국회의원'] },
                relaxed: { mustAny: ['공천', '경선'], targetAny: [regionName], excludeAny: ['도지사', '교육감'] }
            },
            {
                label: '후보·인물', icon: 'fas fa-user', categoryId: 'candidates',
                query: `"${regionName}" "${typeShort}" 후보 출마`,
                maxAgeDays: 60,
                altQueries: [`${regionName} ${typeLabel} 후보 출마`],
                focusKeywords: [typeShort, '후보', '출마', '현역'],
                boostHosts: localHosts, boostWeight: 5, localMediaPriority: true, _regionKey: regionKey,
                preferPopularity: true, scoreWeightsOverride: councilScoreWeights,
                strict: { mustAny: [typeShort, typeLabel], targetAny: ['후보', '출마', '현역', regionName], excludeAny: ['도지사', '교육감', '국회의원'] },
                relaxed: { mustAny: [typeShort, typeLabel], targetAny: [regionName], excludeAny: ['도지사', '교육감'] }
            }
        ];
    }

    function buildMayorNewsCategories(regionKey, regionName, districtName) {
        const title = districtName.endsWith('구') ? '구청장' : districtName.endsWith('군') ? '군수' : '시장';
        const bundle = getDebugRegionMediaBundle(regionKey, districtName);
        const localHosts = bundle.primaryHosts || [];

        // 후보자 이름 쿼리 — 해당 시군구 후보자 이름으로 직접 검색
        const districtCandidates = (() => {
            try {
                const allCands = window.ElectionData?.getMayorCandidates?.(regionKey) || {};
                const list = allCands[districtName] || [];
                return list.filter(c => c.status !== 'WITHDRAWN').map(c => c.name).slice(0, 4);
            } catch (e) { return []; }
        })();
        const candQueries = districtCandidates.map(n => `${n} ${districtName}`);

        // 지역 현안 키워드 — REGIONAL_ISSUES JSON에서 로드 (있으면 사용)
        const issueKeywords = (() => {
            try {
                const key = `${regionKey}_${districtName}`;
                return window.REGIONAL_ISSUES?.[key] || window.REGIONAL_ISSUES?.[districtName] || [];
            } catch (e) { return []; }
        })();
        const issueQuery = issueKeywords.length ? `${districtName} ${issueKeywords.slice(0, 3).join(' ')}` : null;

        // 풀 언론사명 쿼리 — 소형 지역 언론사는 Naver 검색에 잘 안 나오므로
        // 언론사명으로 직접 검색해 수집을 보강
        const poolMediaQueries = (() => {
            try {
                const muni = window.LocalMediaPool?.municipal?.[districtName];
                if (!muni) return [];
                // names 중 URL 패턴이 아닌 한글 언론사명만 추출
                const korNames = (muni.names || [])
                    .filter(n => n && !/\.(kr|com|net|org|co\.kr|tv)$/i.test(n) && /[가-힣]/.test(n));
                // 최대 3개: "청송군민신문 청송군 선거" 형태
                return korNames.slice(0, 3).map(n => `${n} ${districtName}`);
            } catch(e) { return []; }
        })();

        return [
            {
                label: '전체', icon: 'fas fa-newspaper', categoryId: 'all',
                query: `${districtName}${title} 선거 후보`,
                maxAgeDays: 60,
                altQueries: [
                    `${districtName}${title} 출마 예비후보`,
                    ...candQueries.slice(0, 1)
                ].filter(Boolean),
                focusKeywords: [districtName, title, '선거', '후보', '출마', '예비후보', '출판기념회'],
                boostHosts: localHosts,
                strict: { mustAny: [districtName], targetAny: [title, '선거', '후보', '출마', '예비후보', '공천', '출판기념회'], excludeAny: ['도지사', '교육감', '국회의원'] },
                relaxed: { mustAny: [districtName], targetAny: [title, '선거'], excludeAny: ['도지사', '교육감'] }
            },
            {
                label: '여론조사', icon: 'fas fa-chart-bar', categoryId: 'polls',
                query: `${districtName}${title} 여론조사`,
                maxAgeDays: 60,
                altQueries: [
                    `${districtName}${title} 지지율 가상대결`
                ],
                focusKeywords: ['여론조사', '지지율', '적합도', '가상대결', districtName],
                boostHosts: localHosts,
                strict: { mustAny: [districtName], targetAny: ['여론조사', '지지율', '적합도', '가상대결'], excludeAny: ['도지사', '교육감'] },
                relaxed: { mustAny: [districtName], targetAny: ['여론조사', '지지율'], excludeAny: ['도지사', '교육감'] }
            },
            {
                label: '후보·인물', icon: 'fas fa-user', categoryId: 'candidates',
                query: `${districtName}${title} 후보 출마`,
                maxAgeDays: 60,
                altQueries: [
                    `${districtName}${title} 공천 경선 예비후보`,
                    ...candQueries.slice(0, 1)
                ].filter(Boolean),
                focusKeywords: [districtName, title, '후보', '출마', '공천', '예비후보', '출판기념회', '경선', ...districtCandidates],
                boostHosts: localHosts,
                strict: { mustAny: [districtName], targetAny: ['후보', '출마', '공천', '예비후보', '출판기념회', title, ...districtCandidates], excludeAny: ['도지사', '교육감', '국회의원'] },
                relaxed: { mustAny: [districtName], targetAny: [title, '후보', '출마'], excludeAny: ['도지사', '교육감'] }
            },
            {
                label: '공약·정책', icon: 'fas fa-scroll', categoryId: 'policy',
                query: `${districtName}${title} 공약 정책`,
                maxAgeDays: 60,
                altQueries: [
                    `${districtName}${title} 공약 현안 비전`
                ],
                focusKeywords: [districtName, '공약', '정책', '현안', '비전', ...issueKeywords.slice(0, 3)],
                boostHosts: localHosts,
                strict: { mustAny: [districtName], targetAny: ['공약', '정책', '현안', '비전', title, ...issueKeywords.slice(0, 3)], excludeAny: ['도지사', '교육감'] },
                relaxed: { mustAny: [districtName], targetAny: ['공약', '정책'], excludeAny: ['도지사', '교육감'] }
            },
        ].map(cat => ({
            ...cat, localMediaPriority: true, _regionKey: regionKey, _districtName: districtName, boostWeight: 5,
            preferPopularity: true,
            scoreWeightsOverride: { time: 0.22, relevance: 0.18, credibility: 0.06, locality: 0.48, engagement: 0.06 }
        }));
    }

    function renderNewsTab(regionKey) {
        const container = document.getElementById('news-feed');
        if (!container) { console.warn('[뉴스] news-feed 컨테이너 없음'); return; }

        const region = ElectionData.getRegion(regionKey);
        if (!region && currentElectionType !== 'byElection') return;

        let regionName = region?.name || '';
        if (currentElectionType === 'byElection' && currentDistrictName) {
            const byeData = ElectionData.getByElectionData(currentDistrictName);
            regionName = byeData?.district || currentDistrictName;
        }
        let categories;

        if (currentElectionType === 'byElection' && currentDistrictName) {
            // 재보궐: byelection key에서 지역구명 가져오기
            const byeData = ElectionData.getByElectionData(currentDistrictName);
            const distName = byeData?.district || currentDistrictName;
            const exactDist = `"${distName}"`;
            // 총선·대선·전당대회 관련 기사 혼입 방지 (지역구명이 총선 기사에도 등장하므로)
            const byeExclude = ['국회의원', '총선', '대선', '대통령', '전당대회', '당대표', '원내대표', '당권'];
            categories = [
                {
                    label: '전체', icon: 'fas fa-newspaper', categoryId: 'all',
                    query: `${exactDist} 보궐`,
                    maxAgeDays: 60,
                    altQueries: [`${exactDist} 후보 출마 공천`],
                    focusKeywords: ['보궐', '재보궐', '후보', '공천', '출마', '선거', '여론조사', '공약'],
                    strict: { mustAny: [distName], targetAny: [distName, distName.split(' ').pop(), '보궐', '선거', '후보', '공천', '출마'], excludeAny: byeExclude },
                    relaxed: { mustAny: [distName.split(' ').pop()], targetAny: [distName.split(' ').pop(), '보궐', '선거'], excludeAny: byeExclude }
                },
                {
                    label: '여론조사', icon: 'fas fa-chart-bar', categoryId: 'polls',
                    query: `${exactDist} 여론조사`,
                    maxAgeDays: 60,
                    altQueries: [`${exactDist} 지지율 적합도`],
                    focusKeywords: ['여론조사', '지지율', '적합도', '지지도'],
                    strict: { mustAny: [distName], targetAny: ['여론조사', '지지율', '적합도'], excludeAny: byeExclude },
                    relaxed: { mustAny: [distName], targetAny: ['여론조사', '지지율'], excludeAny: byeExclude }
                },
                {
                    label: '후보·인물', icon: 'fas fa-user', categoryId: 'candidates',
                    query: `${exactDist} 후보 공천 출마`,
                    maxAgeDays: 60,
                    altQueries: [`${exactDist} 예비후보 경선 출마`],
                    focusKeywords: ['후보', '공천', '출마', '경선', '예비후보', '출판기념회'],
                    strict: { mustAny: [distName], targetAny: ['후보', '출마', '공천'], excludeAny: byeExclude },
                    relaxed: { mustAny: [distName], excludeAny: byeExclude }
                },
                {
                    label: '공약·정책', icon: 'fas fa-scroll', categoryId: 'policy',
                    query: `${exactDist} 공약 정책`,
                    maxAgeDays: 60,
                    altQueries: [`${exactDist} 현안 쟁점 공약`],
                    focusKeywords: ['공약', '정책', '현안', '쟁점', '과제', '비전'],
                    strict: { mustAny: [distName], targetAny: ['공약', '정책', '현안'], excludeAny: byeExclude },
                    relaxed: { mustAny: [distName], excludeAny: byeExclude }
                },
            ];
        } else if (currentElectionType === 'superintendent') {
            categories = buildSuperintendentNewsCategories(regionKey, regionName);
        } else if (currentElectionType === 'mayor' && currentDistrictName) {
            categories = buildMayorNewsCategories(regionKey, regionName, currentDistrictName);
        } else if (currentElectionType === 'council' || currentElectionType === 'localCouncil') {
            categories = buildCouncilNewsCategories(regionKey, regionName, currentElectionType);
        } else if (currentElectionType === 'councilProportional' || currentElectionType === 'localCouncilProportional') {
            categories = buildProportionalNewsCategories(regionKey, regionName, currentElectionType);
        } else {
            const governorQueryBase = getGovernorQueryBase(regionName);
            const governorFocusTerms = getGovernorFocusTerms(regionName, governorQueryBase);
            const governorRoleTerms = getGovernorRoleTerms(regionName, governorQueryBase);
            categories = buildNewsCategories(regionKey, regionName, governorQueryBase, governorFocusTerms, governorRoleTerms);
        }

        let html = `
            <div class="news-live">
                <div class="news-live-header">
                    <div class="news-live-actions" id="news-live-actions">
                        ${categories.map((cat, idx) => `
                            <button class="news-live-btn ${idx === 0 ? 'active' : ''}" data-query="${cat.query}" data-idx="${idx}">
                                ${cat.label}
                            </button>
                        `).join('')}
                    </div>
                    <div class="news-sort-toggle" id="news-sort-toggle">
                        <button class="news-sort-btn active" data-sort="date"><i class="fas fa-clock"></i> 최신</button>
                        <button class="news-sort-btn" data-sort="score"><i class="fas fa-star"></i> 종합</button>
                    </div>
                </div>
                <div class="news-live-list" id="news-live-list"></div>
                <button class="news-load-more-btn" id="news-load-more-btn" style="display:none">
                    <i class="fas fa-plus"></i> 더보기
                </button>
            </div>
        `;

        container.innerHTML = html;
        setupLatestNews(regionName, categories, regionKey);

        // 지역 언론사 목록
        const localMediaEl = document.getElementById('news-local-media');
        if (localMediaEl) {
            // 기초선거(시장/군수/구청장)일 때는 시군구 전용 언론사를 우선 표시
            const isMayorElection = currentElectionType === 'mayor' && currentDistrictName;
            const districtMediaTags = (() => {
                if (!isMayorElection) return null;
                const muni = window.LocalMediaPool?.municipal?.[currentDistrictName];
                if (!muni) return null;
                // 한글명이 있는 것만, URL 패턴 제외
                const korNames = (muni.names || [])
                    .filter(n => n && !/\.(kr|com|net|org|co\.kr|tv)$/i.test(n) && /[가-힣]/.test(n));
                const allNames = [
                    ...korNames,
                    ...(muni.hosts || []).filter(h => !korNames.length).slice(0, 4)
                ].slice(0, 8);
                if (!allNames.length) return null;
                return allNames.map(n => `<span class="local-media-tag district">${n}</span>`).join('');
            })();

            const registry = window.LocalMediaRegistry?.regions?.[regionKey];
            const province = registry?.province;
            const provinceOutlets = province?.outlets?.length ? province.outlets : null;

            if (districtMediaTags) {
                // 기초선거: 시군구 전용 언론사 표시
                const districtLabel = currentDistrictName;
                const provinceTagsHtml = provinceOutlets
                    ? `<div style="margin-top:6px">${provinceOutlets.slice(0, 5).map(o =>
                        `<span class="local-media-tag">${o.name}</span>`).join('')}</div>` : '';
                localMediaEl.innerHTML = `
                    <details class="local-media-details">
                        <summary><i class="fas fa-map-marker-alt"></i> ${districtLabel} 지역 언론사</summary>
                        <div class="local-media-list">${districtMediaTags}${provinceTagsHtml}</div>
                    </details>
                `;
            } else if (provinceOutlets) {
                // 광역선거: 광역 언론사 표시
                const tier1Hosts = province.hosts?.tier1 || [];
                const outletItems = provinceOutlets.slice(0, 8).map(o => {
                    const isTier1 = tier1Hosts.some(h => province.priorityNames?.indexOf(o.name) < 3);
                    return `<span class="local-media-tag${isTier1 ? ' tier1' : ''}">${o.name}</span>`;
                }).join('');
                localMediaEl.innerHTML = `
                    <details class="local-media-details">
                        <summary><i class="fas fa-building"></i> ${regionName} 지역 언론사</summary>
                        <div class="local-media-list">${outletItems}</div>
                    </details>
                `;
            } else {
                localMediaEl.innerHTML = '';
            }
        }
    }

    function getGovernorQueryBase(regionName) {
        if (!regionName) return '';
        const aliasTerms = getRegionAliasTerms(regionName);
        const shortAlias = aliasTerms.find((name) => /^[가-힣]{2,3}$/.test(name)) || aliasTerms[0] || regionName;
        if (regionName.includes('세종')) return '세종시장';
        if (regionName.endsWith('도') || regionName.includes('특별자치도')) {
            if (shortAlias === '제주') return '제주도지사';
            return `${shortAlias}도지사`;
        }
        return `${shortAlias}시장`;
    }

    function getRegionAliasTerms(regionName) {
        if (!regionName) return [];
        const aliases = [regionName];
        const regionShortMap = {
            '서울특별시': '서울',
            '부산광역시': '부산',
            '대구광역시': '대구',
            '인천광역시': '인천',
            '광주광역시': '광주',
            '대전광역시': '대전',
            '울산광역시': '울산',
            '세종특별자치시': '세종',
            '경기도': '경기',
            '강원특별자치도': '강원',
            '충청북도': '충북',
            '충청남도': '충남',
            '전북특별자치도': '전북',
            '전라남도': '전남',
            '경상북도': '경북',
            '경상남도': '경남',
            '제주특별자치도': '제주'
        };
        if (regionShortMap[regionName]) aliases.push(regionShortMap[regionName]);
        const short = regionName
            .replace('특별자치도', '')
            .replace('특별자치시', '')
            .replace('특별시', '')
            .replace('광역시', '')
            .replace(/도$/, '')
            .trim();
        if (short && short !== regionName) aliases.push(short);
        return [...new Set(aliases.filter(Boolean))];
    }

    function getGovernorFocusTerms(regionName, governorQueryBase) {
        const aliasTerms = getRegionAliasTerms(regionName);
        const terms = [governorQueryBase, regionName, '광역단체장', ...aliasTerms];
        if (regionName.endsWith('도') || regionName.includes('특별자치도')) {
            aliasTerms.forEach((alias) => {
                terms.push(`${alias}지사`, `${alias}도지사`);
            });
        } else {
            aliasTerms.forEach((alias) => {
                terms.push(`${alias}시장`);
            });
        }
        return [...new Set(terms.filter(Boolean))];
    }

    function getGovernorRoleTerms(regionName, governorQueryBase) {
        const aliasTerms = getRegionAliasTerms(regionName);
        const terms = [governorQueryBase];
        if (regionName.includes('도') || regionName.includes('특별자치도')) {
            terms.push('도지사', '지사');
        } else if (regionName.includes('세종')) {
            terms.push('시장', '세종시장');
        } else {
            terms.push('시장');
        }
        if (regionName.endsWith('도') || regionName.includes('특별자치도')) {
            aliasTerms.forEach((alias) => {
                terms.push(`${alias}지사`, `${alias}도지사`);
            });
        } else {
            aliasTerms.forEach((alias) => {
                terms.push(`${alias}시장`);
            });
        }
        return [...new Set(terms.filter(Boolean))];
    }

    function normalizeKeyword(value) {
        return String(value || '').replace(/\s+/g, ' ').trim();
    }

    function getRegionIssueKeywords(regionKey) {
        const region = ElectionData.getRegion(regionKey);
        const baseIssues = Array.isArray(region?.keyIssues) ? region.keyIssues : [];
        const derivedIssuesRaw = ElectionData.getRegionIssues(regionKey);
        const derivedIssues = Array.isArray(derivedIssuesRaw)
            ? derivedIssuesRaw.map((issue) => {
                if (typeof issue === 'string') return issue;
                if (issue && typeof issue === 'object') return issue.title || issue.issue || '';
                return '';
            })
            : [];
        return mergeUniqueArrays(
            baseIssues.map(normalizeKeyword).filter(Boolean),
            derivedIssues.map(normalizeKeyword).filter(Boolean)
        );
    }

    function getRegionActorKeywords(regionKey) {
        const region = ElectionData.getRegion(regionKey);
        if (!region) return [];
        const governor = (ElectionData.getCurrentOfficeholder && ElectionData.getCurrentOfficeholder(regionKey, 'governor')) || region.currentGovernor || null;
        const governorName = normalizeKeyword(governor?.name || '');
        const candidates = Array.isArray(region.candidates)
            ? region.candidates.map((c) => normalizeKeyword(c?.name || '')).filter(Boolean)
            : [];
        return mergeUniqueArrays(governorName ? [governorName] : [], candidates);
    }

    function applyRegionSpecificCategoryTuning(category, regionKey, regionName, governorQueryBase) {
        if (!category || typeof category !== 'object') return category;
        const tuned = { ...category };
        const regionAliases = getRegionAliasTerms(regionName);
        const issueKeywords = getRegionIssueKeywords(regionKey);
        const actorKeywords = getRegionActorKeywords(regionKey);
        const topIssues = issueKeywords.slice(0, 6);
        const topActors = actorKeywords.slice(0, 4);

        tuned.focusKeywords = mergeUniqueArrays(tuned.focusKeywords, topIssues.slice(0, 3));
        tuned.altQueries = mergeUniqueArrays(tuned.altQueries, []);

        // 지역별 튜닝: altQueries 추가는 최소화 (API 쿼터 절약)
        // 기본 altQueries(1개)로 충분 — 지역 이슈/인물은 focusKeywords로 보강

        ['strict', 'relaxed'].forEach((level) => {
            const rule = tuned[level];
            if (!rule || typeof rule !== 'object') return;
            rule.targetAny = mergeUniqueArrays(rule.targetAny, regionAliases);
            rule.requiredRegionAny = mergeUniqueArrays(rule.requiredRegionAny, regionAliases);
            rule.boostAny = mergeUniqueArrays(rule.boostAny, topIssues);
            if (tuned.categoryId === 'candidate') {
                rule.boostAny = mergeUniqueArrays(rule.boostAny, topActors);
                rule.targetAny = mergeUniqueArrays(rule.targetAny, topActors);
            }
            if (tuned.categoryId === 'policy') {
                rule.mustAny = mergeUniqueArrays(rule.mustAny, ['공약', '정책', '핵심공약', '이행계획']);
            }
        });

        return tuned;
    }

    function getNewsCategoryTemplates() {
        const templates = NEWS_FILTER_CONFIG.categoryTemplates;
        if (Array.isArray(templates) && templates.length) return templates;
        return [];
    }

    function getRegionFilterOverrides(regionKey) {
        const overrides = NEWS_FILTER_CONFIG.regionOverrides || {};
        return overrides[regionKey] || {};
    }

    function mergeUniqueArrays(baseArr, overrideArr) {
        return Array.from(new Set([...(Array.isArray(baseArr) ? baseArr : []), ...(Array.isArray(overrideArr) ? overrideArr : [])]));
    }

    function deepMergeNewsConfig(baseObj, overrideObj) {
        if (!overrideObj || typeof overrideObj !== 'object') return baseObj;
        const out = Array.isArray(baseObj) ? [...baseObj] : { ...(baseObj || {}) };
        Object.entries(overrideObj).forEach(([key, value]) => {
            if (Array.isArray(value)) {
                out[key] = mergeUniqueArrays(out[key], value);
                return;
            }
            if (value && typeof value === 'object') {
                out[key] = deepMergeNewsConfig(out[key] || {}, value);
                return;
            }
            out[key] = value;
        });
        return out;
    }

    function applyNewsTemplateValue(value, context) {
        if (typeof value === 'string') {
            return value.replace(/\{\{([A-Z_]+)\}\}/g, (_, key) => String(context[key] || ''));
        }
        if (Array.isArray(value)) {
            return value.map(v => applyNewsTemplateValue(v, context));
        }
        if (value && typeof value === 'object') {
            const out = {};
            Object.entries(value).forEach(([k, v]) => {
                out[k] = applyNewsTemplateValue(v, context);
            });
            return out;
        }
        return value;
    }

    function buildNewsCategories(regionKey, regionName, governorQueryBase, governorFocusTerms, governorRoleTerms) {
        const templates = getNewsCategoryTemplates();
        if (!templates.length) {
            return [
                {
                    label: '전체 선거 뉴스',
                    icon: 'fas fa-newspaper',
                    categoryId: 'all',
                    query: `${governorQueryBase} 지방선거`,
                    maxAgeDays: 180,
                    focusKeywords: ['선거', '지사', '후보', '공약'],
                    strict: {
                        mustAny: ['선거', '후보', '공약'],
                        targetAny: [governorQueryBase, '도지사', '지사'],
                        requiredGovernorAny: governorFocusTerms,
                        requiredGovernorRoleAny: governorRoleTerms,
                        excludeAny: ['교육감', '교육청']
                    }
                }
            ];
        }
        const context = {
            REGION_NAME: regionName,
            GOVERNOR_QUERY_BASE: governorQueryBase
        };
        const regionOverrides = getRegionFilterOverrides(regionKey);

        const phase = typeof ElectionCalendar !== 'undefined' ? ElectionCalendar.getCurrentPhase() : '';
        const showCampaign = phase === 'CAMPAIGN' || phase === 'PRE_ELECTION_DAY' || phase === 'EARLY_VOTING';
        return templates.filter(t => t.categoryId !== 'analysis' && (t.categoryId !== 'campaign' || showCampaign)).map((tpl) => {
            const built = applyNewsTemplateValue(tpl, context);
            const override = applyNewsTemplateValue(regionOverrides[built.categoryId] || {}, context);
            const merged = deepMergeNewsConfig(built, override);
            ['strict', 'relaxed'].forEach((level) => {
                const rule = merged[level];
                if (!rule || typeof rule !== 'object') return;
                if (rule.requiredGovernorAny === true) {
                    rule.requiredGovernorAny = governorFocusTerms;
                }
                if (rule.requiredGovernorRoleAny === true) {
                    rule.requiredGovernorRoleAny = governorRoleTerms;
                }
            });
            return applyRegionSpecificCategoryTuning(merged, regionKey, regionName, governorQueryBase);
        });
    }

    function setupLatestNews(regionName, categories, regionKey) {
        const actionWrap = document.getElementById('news-live-actions');
        const list = document.getElementById('news-live-list');
        if (!actionWrap || !list) return;
        const safeCategories = Array.isArray(categories) && categories.length
            ? categories
            : [{ query: `${regionName} 지방선거`, focusKeywords: [] }];

        actionWrap.addEventListener('click', (e) => {
            const btn = e.target.closest('.news-live-btn');
            if (!btn) return;

            // Layer 2A: 여론조사 카테고리 공표금지 체크
            const idx = Number(btn.dataset.idx || 0);
            const selected = safeCategories[idx] || safeCategories[0];
            if (typeof ElectionCalendar !== 'undefined' && selected.categoryId === 'polls') {
                const check = ElectionCalendar.isNewsSubTabDisabled('여론조사');
                if (check.disabled) {
                    list.innerHTML = `<div class="poll-ban-notice" style="padding:24px 16px">
                        <i class="fas fa-gavel"></i>
                        <p>${check.notice}</p>
                    </div>`;
                    actionWrap.querySelectorAll('.news-live-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    return;
                }
            }

            actionWrap.querySelectorAll('.news-live-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            fetchLatestNews(selected, regionKey);
        });

        const defaultSubTab = typeof ElectionCalendar !== 'undefined'
            ? ElectionCalendar.getDefaultNewsSubTab()
            : '전체';
        const defaultCat = safeCategories.find(c => c.label === defaultSubTab) || safeCategories[0];
        const defaultBtn = actionWrap.querySelector(`.news-live-btn[data-idx="${safeCategories.indexOf(defaultCat)}"]`);
        if (defaultBtn && safeCategories.indexOf(defaultCat) !== 0) {
            actionWrap.querySelectorAll('.news-live-btn').forEach(b => b.classList.remove('active'));
            defaultBtn.classList.add('active');
        }
        fetchLatestNews(defaultCat, regionKey);
    }

    function sanitizeHtml(text) {
        if (!text) return '';
        return text.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    }

    function getHostFromUrl(rawUrl) {
        if (!rawUrl) return '';
        try {
            return new URL(rawUrl).hostname.replace(/^www\./, '').toLowerCase();
        } catch (err) {
            return '';
        }
    }

    function isMajorOutlet(host) {
        if (!host) return false;
        return MAJOR_NEWS_HOSTS.some(major => host === major || host.endsWith(`.${major}`));
    }

    function evaluateCategoryMatch(item, category, mode = 'strict') {
        const title = (item.title || '').toLowerCase();
        const desc = (item.description || '').toLowerCase();
        const text = `${title} ${desc}`;

        const focusKeywords = Array.isArray(category?.focusKeywords) ? category.focusKeywords : [];
        const strict = mode === 'relaxed'
            ? (category?.relaxed || category?.strict || null)
            : (category?.strict || null);

        // Base keyword score
        let score = 0;
        for (const k of focusKeywords) {
            if (text.includes(String(k).toLowerCase())) score += 1;
        }

        if (!strict) {
            return { ok: focusKeywords.length === 0 || score > 0, score };
        }

        // 형태소 경계 보완: 2자 이하 단어는 앞뒤에 한글이 붙으면 다른 단어의 일부로 간주해 제외
        // 예: "지사" → "지사관" "고지사항" 오탐 방지. 3자 이상은 단순 includes 유지 (성능·실용성)
        const hasWord = (w, t) => {
            const s = String(w).toLowerCase();
            if (s.length >= 3) return t.includes(s);
            const re = new RegExp(`(?<![가-힣])${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![가-힣])`);
            return re.test(t);
        };
        const hasAny = (words) => Array.isArray(words) && words.some(w => hasWord(w, text));
        const pollText = `${item.title || ''} ${item.description || ''}`;
        const percentMatches = pollText.match(/[0-9]{1,2}(?:\.[0-9])?\s?%/g) || [];
        const hasPercentPattern = /([0-9]{1,2}(\.[0-9])?\s?%|[0-9]{1,2}\.[0-9]\s?%p|오차범위|표본오차|응답률|표본\s?[0-9])/i.test(pollText);
        const hasLocalChiefPattern = /[가-힣]{2,}(시장|군수|구청장)/.test(pollText);
        const hasPollCoreKeyword = /여론조사|지지율|지지도|가상대결|양자대결|다자대결|정당지지율|후보별/i.test(pollText);
        const hasPollMethodology = /표본오차|오차범위|응답률|신뢰수준|전화면접|ars|무선|유선|조사기관|표본수|조사기간|조사일시/i.test(pollText);
        const hasPollAgency = /리얼미터|한국갤럽|갤럽|nbs|한국리서치|엠브레인|코리아리서치|케이스탯리서치|입소스|넥스트리서치|조원씨앤아이|미디어토마토|한길리서치/i.test(pollText);
        const hasNonElectionSurveyContext = /검찰 조사|경찰 조사|감사 조사|실태조사|전수조사|진상조사|역학조사|교육청 조사|수사/i.test(pollText);

        // excludeAny 처리: 제목에 exclude 키워드가 있으면 제외
        // 단, 광역단체장 키워드도 동시에 있는 통합 기사는 감점만 (완전 제외하지 않음)
        if (hasAny(strict.excludeAny)) {
            const excludeInTitle = Array.isArray(strict.excludeAny) && strict.excludeAny.some(w => title.includes(String(w).toLowerCase()));
            const governorInTitle = Array.isArray(strict.requiredGovernorRoleAny) && strict.requiredGovernorRoleAny.some(w => title.includes(String(w).toLowerCase()));

            if (excludeInTitle && !governorInTitle) {
                // 교육감/구청장 등만 있고 도지사/시장이 없으면 완전 제외
                return { ok: false, score: 0 };
            }
            if (excludeInTitle && governorInTitle) {
                // 통합 기사 (도지사+교육감): 감점만
                score -= 2;
            }
        }
        if (!hasAny(strict.mustAny)) return { ok: false, score: 0 };
        if (!hasAny(strict.targetAny)) return { ok: false, score: 0 };
        if (strict.requiredGovernorAny && !hasAny(strict.requiredGovernorAny)) return { ok: false, score: 0 };
        if (strict.requiredGovernorRoleAny && !hasAny(strict.requiredGovernorRoleAny)) return { ok: false, score: 0 };
        if (strict.requiredRegionAny && !hasAny(strict.requiredRegionAny)) return { ok: false, score: 0 };
        // titleMustAny: 제목에도 반드시 포함돼야 하는 키워드 (설명에만 있고 제목과 무관한 기사 차단)
        if (Array.isArray(strict.titleMustAny) && strict.titleMustAny.length) {
            const hasInTitle = strict.titleMustAny.some(w => title.includes(String(w).toLowerCase()));
            if (!hasInTitle) return { ok: false, score: 0 };
        }
        if (hasLocalChiefPattern && strict.requiredGovernorRoleAny && !hasAny(strict.requiredGovernorRoleAny)) {
            return { ok: false, score: 0 };
        }
        if (strict.rejectLocalMayorOnly) {
            const hasMayorWord = hasAny(['시장']);
            const hasGovernorWord = hasAny(['도지사', '지사', '광역단체장', ...(strict.requiredGovernorRoleAny || [])]);
            if (hasMayorWord && !hasGovernorWord) {
                return { ok: false, score: 0 };
            }
        }

        if (category?.categoryId === 'poll' && !hasPercentPattern) {
            return { ok: false, score: 0 };
        }
        if (category?.categoryId === 'poll' && hasNonElectionSurveyContext) {
            return { ok: false, score: 0 };
        }
        if (category?.categoryId === 'poll') {
            if (!hasPollCoreKeyword) return { ok: false, score: 0 };
            if (!hasAny(['후보', '후보별', '가상대결', '양자대결', '다자대결', '지지율', '지지도', '찬반'])) {
                return { ok: false, score: 0 };
            }
            let pollEvidenceScore = 0;
            if (hasPercentPattern) pollEvidenceScore += 1;
            if (percentMatches.length >= 2) pollEvidenceScore += 1;
            if (hasPollMethodology) pollEvidenceScore += 1;
            if (hasPollAgency) pollEvidenceScore += 1;
            // description이 짧으면(50자 미만) API가 본문을 거의 안 준 것 — evidence 기준 1 완화
            const descIsShort = (item.description || '').length < 50;
            const requiredEvidence = mode === 'relaxed' ? (descIsShort ? 1 : 2) : (descIsShort ? 2 : 3);
            if (pollEvidenceScore < requiredEvidence) {
                return { ok: false, score: 0 };
            }
            score += pollEvidenceScore;
        }
        if (category?.categoryId === 'candidate' && !hasAny(['유세', '방문', '현장', '간담회', '회동', '면담', '지지선언', '출정식', '선거운동', '캠프', '선대위', '합류', '후보', '출마', '경선', '공천', '단일화'])) {
            return { ok: false, score: 0 };
        }
        if (category?.categoryId === 'policy' && !hasAny(['공약', '정책', '비전', '로드맵', '이행'])) {
            return { ok: false, score: 0 };
        }

        if (hasAny(strict.boostAny)) score += 2;
        if (title.includes('여론조사')) score += 1;
        if (hasPercentPattern) score += 1;

        // 언론사 가중치는 fetchLatestNews의 localityScore / credibilityScore 에서 일괄 처리
        // (여기서 relevance에 직접 더하면 점수 채널이 두 곳이 되어 locality가 이중 반영됨)
        // boostHosts는 필터 통과 여부(ok) 판단에만 참고하고 score에는 더하지 않음

        return { ok: true, score };
    }

    // ── 뉴스 캐시 (sessionStorage) ──
    const _newsCachePrefix = 'news_cache_';
    function _newsCacheKey(regionKey, catId) { return `${_newsCachePrefix}${regionKey}_${catId || 'all'}`; }
    function _saveNewsCache(regionKey, catId, items) {
        try {
            const payload = { ts: Date.now(), items: items.slice(0, 80) };
            sessionStorage.setItem(_newsCacheKey(regionKey, catId), JSON.stringify(payload));
        } catch (e) { /* storage full — ignore */ }
    }
    function _loadNewsCache(regionKey, catId, maxAgeMs) {
        try {
            const raw = sessionStorage.getItem(_newsCacheKey(regionKey, catId));
            if (!raw) return null;
            const payload = JSON.parse(raw);
            if (Date.now() - payload.ts > (maxAgeMs || 10 * 60 * 1000)) return null; // 기본 10분
            return payload.items;
        } catch (e) { return null; }
    }

    // 캐시 히트 시 인라인 렌더링 — fetchLatestNews의 필터/렌더 로직을 재사용
    function _renderNewsCacheInline(list, cachedItems, selectedCategory, regionKey, maxAgeDays, catId, category) {
        const items = cachedItems.slice(0, 15).map(item => {
            const title = (item.title || '').replace(/<[^>]+>/g, '');
            const link = item.originallink || item.link || '#';
            const press = (() => { try { return new URL(link).hostname.replace(/^www\./, ''); } catch(e) { return ''; } })();
            const pubDate = item.pubDate ? new Date(item.pubDate).toLocaleString('ko-KR') : '';
            return `<a class="news-live-item" href="${link}" target="_blank" rel="noopener">
                <div class="news-live-item-title">${title}</div>
                <div class="news-live-item-meta"><span class="news-press">${press}</span><span class="news-time">${pubDate}</span></div>
            </a>`;
        });
        if (items.length === 0) {
            list.innerHTML = '<div class="news-empty"><i class="fas fa-inbox"></i><p>관련 뉴스가 없습니다.</p></div>';
        } else {
            list.innerHTML = items.join('');
        }
        const loadMoreBtn = document.getElementById('news-load-more-btn');
        if (loadMoreBtn) loadMoreBtn.style.display = 'none';
    }

    async function fetchLatestNews(category, regionKey) {
        const list = document.getElementById('news-live-list');
        if (!list) return;

        // 더보기 버튼 초기화 — 이전 카테고리 핸들러 제거
        const loadMoreBtnInit = document.getElementById('news-load-more-btn');
        if (loadMoreBtnInit) {
            loadMoreBtnInit.style.display = 'none';
            loadMoreBtnInit.onclick = null;
        }

        const query = category?.query || '';
        const selectedCategory = category || { query: '', focusKeywords: [] };
        const maxAgeDays = Number.isFinite(Number(selectedCategory.maxAgeDays)) ? Number(selectedCategory.maxAgeDays) : 45;
        const queryCandidates = Array.from(new Set([query, ...(selectedCategory.altQueries || [])].filter(Boolean)));
        const catId = selectedCategory.categoryId || 'all';

        // ── 캐시 우선: 유효한 캐시가 있으면 API 호출 생략 (10분 TTL) ──
        const cachedFirst = _loadNewsCache(regionKey, catId, 10 * 60 * 1000);
        if (cachedFirst && cachedFirst.length > 0) {
            console.log(`[뉴스] 캐시 히트 (${regionKey}/${catId}), API 호출 생략`);
            _renderNewsCacheInline(list, cachedFirst, selectedCategory, regionKey, maxAgeDays, catId, category);
            return;
        }

        // 스켈레톤 로딩 UI
        list.innerHTML = Array.from({length: 4}, () => `
            <div class="news-skeleton-item">
                <div class="news-skeleton-badges"><div class="news-skeleton-badge"></div><div class="news-skeleton-badge"></div></div>
                <div class="news-skeleton-bar long"></div>
                <div class="news-skeleton-bar medium"></div>
                <div class="news-skeleton-meta"><div class="news-skeleton-bar short"></div><div class="news-skeleton-bar short"></div></div>
            </div>
        `).join('');

        try {
            const fetchedItems = [];
            const sortModes = ['date']; // sim 정렬 제거 — API 쿼터 절약
            let requestIdx = 0;
            for (const q of queryCandidates) {
                for (const sort of sortModes) {
                    // 두 번째 요청부터 300ms 간격을 두어 burst 방지
                    if (requestIdx++ > 0) await new Promise(r => setTimeout(r, 300));
                    const url = `${NEWS_PROXY_BASE}/api/news?query=${encodeURIComponent(q)}&display=50&sort=${sort}`;
                    let res, data;
                    // 429 backoff: 최대 2회 재시도
                    for (let attempt = 0; attempt < 3; attempt++) {
                        res = await fetch(url, { headers: { 'Accept': 'application/json' } });
                        if (res.status === 429) {
                            const wait = Math.min(1000 * Math.pow(2, attempt), 4000);
                            console.warn(`[뉴스] 429 rate limit, ${wait}ms 후 재시도 (${attempt + 1}/3)`);
                            await new Promise(r => setTimeout(r, wait));
                            continue;
                        }
                        break;
                    }
                    data = null;
                    try {
                        data = await res.json();
                    } catch (err) {
                        data = null;
                    }
                    if (!res.ok) {
                        const detail = data?.error ? ` (${data.error})` : '';
                        throw new Error(`News fetch failed${detail}`);
                    }
                    const items = Array.isArray(data?.items) ? data.items : [];
                    items.forEach((item, idx) => {
                        fetchedItems.push({
                            ...item,
                            __query: q,
                            __sort: sort,
                            __rank: idx + 1
                        });
                    });
                }
            }
            // 성공 시 캐시 저장
            if (fetchedItems.length > 0) {
                _saveNewsCache(regionKey, catId, fetchedItems);
            }
            const runFilter = (mode, dayLimit) => {
                const matched = fetchedItems.map(item => {
                    const m = evaluateCategoryMatch(item, selectedCategory, mode);
                    return { item, relevance: m.score, ok: m.ok };
                }).filter(x => x.ok);

                const normalizeTitleKey = (title) => String(title || '').toLowerCase().replace(/\s+/g, ' ').trim();
                // URL 기반 중복 추적: originallink가 같은 기사는 도메인이 달라도 동일 기사로 처리
                const seenUrls = new Set();
                const dedup = new Map();
                matched.forEach(({ item, relevance }) => {
                    const title = sanitizeHtml(item.title || '');
                    const origin = sanitizeHtml(item.originallink || item.link || '');
                    const host = getHostFromUrl(origin);
                    const publishedAt = item.pubDate ? Date.parse(item.pubDate) : 0;
                    // 동일 originallink는 먼저 들어온 것만 남김 (받아쓰기 중복 제거)
                    if (origin && origin !== '#') {
                        if (seenUrls.has(origin)) return;
                        seenUrls.add(origin);
                    }
                    const normalizedKey = `${normalizeTitleKey(title)}|${host}`;
                    const candidate = {
                        title,
                        link: item.originallink || item.link || '#',
                        host,
                        pubDateLabel: item.pubDate ? new Date(item.pubDate).toLocaleString('ko-KR') : '발행일 미상',
                        publishedAt: Number.isFinite(publishedAt) ? publishedAt : 0,
                        relevance,
                        dateRank: item.__sort === 'date' ? item.__rank : null,
                        simRank: item.__sort === 'sim' ? item.__rank : null
                    };
                    if (!candidate.title || !candidate.publishedAt) return;
                    const ageDays = (Date.now() - candidate.publishedAt) / (1000 * 60 * 60 * 24);
                    if (ageDays > dayLimit) return;
                    const existing = dedup.get(normalizedKey);
                    if (!existing) {
                        dedup.set(normalizedKey, candidate);
                        return;
                    }
                    existing.relevance = Math.max(existing.relevance, candidate.relevance);
                    if (!existing.dateRank || (candidate.dateRank && candidate.dateRank < existing.dateRank)) {
                        existing.dateRank = candidate.dateRank;
                    }
                    if (!existing.simRank || (candidate.simRank && candidate.simRank < existing.simRank)) {
                        existing.simRank = candidate.simRank;
                    }
                    if (candidate.publishedAt > existing.publishedAt) {
                        existing.publishedAt = candidate.publishedAt;
                        existing.pubDateLabel = candidate.pubDateLabel;
                        existing.link = candidate.link;
                    }
                });

                // ── 고도화 필터 엔진 ──
                // 후보자 이름 목록 (현재 선택된 지역)
                const regionData = ElectionData.getRegion(regionKey);
                const regionCandidates = (regionData?.candidates || []).map(c => c.name);
                const currentGovernor = ElectionData.getRegion(regionKey)?.currentGovernor?.name;
                const knownActors = [...regionCandidates, currentGovernor].filter(Boolean);
                const regionObj = ElectionData.getRegion(regionKey);
                const regionName = regionObj?.name || '';
                const regionAliases = getRegionAliasTerms(regionName);

                // 선거유형 분류 패턴
                const patterns = {
                    governor: /도지사|지사|광역단체장|시도지사/,
                    mayor: /[가-힣]{2,4}(시장|군수|구청장)/,
                    superintendent: /교육감|교육청/,
                    national: /대통령|대선|총선|국회의원|[가-힣]{2,8}(갑|을|병|정)/,
                    noise: /스포츠|프로야구|프로축구|K리그|KBO|드라마|영화|예능|콘서트|공연|사망사고|교통사고|살인|폭행|성범죄|마약/,
                };

                const filteredDedup = Array.from(dedup.values()).map(item => {
                    const t = (item.title || '') + ' ' + (item.description || '');
                    let penalty = 0;
                    let signals = [];

                    // 1. 다른 지역 감지 (강한 감점)
                    if (regionKey && mentionsOtherRegion(t, regionKey)) {
                        penalty += 0.4;
                        signals.push('other_region');
                    }

                    // 2. 선거유형 불일치 (기초단체장/교육감/국회의원 기사)
                    if (patterns.mayor.test(t) && !patterns.governor.test(t)) {
                        penalty += 0.3;
                        signals.push('local_mayor');
                    }
                    if (patterns.superintendent.test(t) && !patterns.governor.test(t)) {
                        penalty += 0.35;
                        signals.push('superintendent');
                    }
                    if (patterns.national.test(t)) {
                        penalty += 0.25;
                        signals.push('national');
                    }

                    // 3. 노이즈 (스포츠/연예/범죄)
                    if (patterns.noise.test(t)) {
                        penalty += 0.5;
                        signals.push('noise');
                    }

                    // 4. 후보자 이름 매칭 (보너스)
                    const mentionedActor = knownActors.find(name => t.includes(name));
                    if (mentionedActor) {
                        penalty -= 0.15;
                        signals.push('known_actor');
                    }

                    // 5. 지역명 직접 언급 (보너스)
                    const mentionsRegion = regionAliases.some(a => a && t.includes(a));
                    if (mentionsRegion) {
                        penalty -= 0.1;
                        signals.push('region_match');
                    }

                    item._filterPenalty = Math.max(0, penalty);
                    item._filterSignals = signals;
                    return item;
                }).filter(item => item._filterPenalty < 0.35); // 0.35 이상이면 제거

                const items = filteredDedup;
                const rankToScore = (rank) => {
                    if (!rank) return 0;
                    return Math.max(0, 1 - (Math.min(50, rank) - 1) / 49);
                };

                // 지역 언론사 host 목록 구성 (Registry + Pool 병합)
                const registry = window.LocalMediaRegistry?.regions?.[regionKey];
                const localTier1 = registry?.province?.hosts?.tier1 || [];
                const localTier2 = registry?.province?.hosts?.tier2 || [];
                // LocalMediaPool에서 추가 host 수집
                const poolHosts = (() => {
                    const pool = window.LocalMediaPool;
                    if (!pool) return [];
                    const hosts = new Set();
                    const regionObj = ElectionData.getRegion(regionKey);
                    const rName = regionObj?.name || '';
                    // 광역 매체: {hosts: [...], names: [...], media: [...]}
                    const metro = pool.metro?.[rName];
                    if (metro?.hosts) metro.hosts.forEach(h => hosts.add(h));
                    // 시군구 매체
                    if (currentDistrictName) {
                        const muni = pool.municipal?.[currentDistrictName];
                        if (muni?.hosts) muni.hosts.forEach(h => hosts.add(h));
                    }
                    return [...hosts];
                })();
                const allLocalHosts = [...new Set([...localTier1, ...localTier2, ...poolHosts])];
                const isLocalMedia = (host) => {
                    if (!host) return false;
                    return allLocalHosts.some(h => host === h || host.endsWith(`.${h}`));
                };
                const isLocalTier1 = (host) => {
                    if (!host) return false;
                    return localTier1.some(h => host === h || host.endsWith(`.${h}`));
                };
                // 시군구 전용 매체 (pool.municipal 에 등록된 것) → 기초지역 뉴스에서 최우선
                const districtHosts = (() => {
                    const pool = window.LocalMediaPool;
                    if (!pool || !currentDistrictName) return new Set();
                    const muni = pool.municipal?.[currentDistrictName];
                    const hosts = new Set();
                    if (muni?.hosts) muni.hosts.forEach(h => hosts.add(h));
                    return hosts;
                })();
                const isDistrictMedia = (host) => {
                    if (!host || districtHosts.size === 0) return false;
                    return [...districtHosts].some(h => host === h || host.endsWith(`.${h}`));
                };

                if (preferPopularity) {
                    const defaultSw = NEWS_FILTER_CONFIG.scoreWeights || { time: 0.32, relevance: 0.30, credibility: 0.18, locality: 0.15, engagement: 0.05 };
                    const sw = selectedCategory.scoreWeightsOverride || defaultSw;
                    const localPriority = !!selectedCategory.localMediaPriority;
                    // relevance 정규화: 카테고리별 focusKeywords 수 + boostAny 2점 + 기타 보너스 4점을 상한으로 사용
                    // 하드코딩 /8 대신 카테고리 실제 가중치 상한에 맞춘 동적 maxScore
                    const focusCount = Array.isArray(selectedCategory.focusKeywords) ? selectedCategory.focusKeywords.length : 0;
                    const boostMax = 2; // boostAny 최대 보너스
                    const extraMax = 4; // 여론조사 evidence + 기타 보너스
                    const relevanceMaxScore = Math.max(focusCount + boostMax + extraMax, 8);
                    items.forEach((item) => {
                        const ageDays = (Date.now() - item.publishedAt) / (1000 * 60 * 60 * 24);
                        const recencyScore = Math.max(0, 1 - (ageDays / Math.max(1, dayLimit)));
                        const simScore = rankToScore(item.simRank);
                        const relevanceScore = Math.min(1, item.relevance / relevanceMaxScore);
                        // localMediaPriority 카테고리(의원/재보궐)에서는 전국지 credibility를 0.55로 캡핑
                        // → 지역언론이 전국지보다 credibility에서 역전당하지 않게 보정
                        const rawCred = isMajorOutlet(item.host) ? 1 : isLocalTier1(item.host) ? 0.85 : isLocalMedia(item.host) ? 0.75 : 0.4;
                        const credibilityScore = (localPriority && isMajorOutlet(item.host)) ? 0.55 : rawCred;
                        // localityScore: 시군구 전용 매체 1.0 → 광역 지역언론 0.8 → 비지역 0
                        const localityScore = isDistrictMedia(item.host) ? 1.0 : isLocalMedia(item.host) ? 0.8 : 0;
                        item.isLocalMedia = isLocalMedia(item.host);
                        item.isDistrictMedia = isDistrictMedia(item.host);
                        item.rankScore = (recencyScore * sw.time)
                            + (relevanceScore * sw.relevance)
                            + (credibilityScore * sw.credibility)
                            + (localityScore * sw.locality)
                            + (simScore * sw.engagement);
                    });
                    items.sort((a, b) => (b.rankScore - a.rankScore) || (b.relevance - a.relevance) || (b.publishedAt - a.publishedAt));
                    return items;
                }

                items.sort((a, b) => (b.relevance - a.relevance) || (b.publishedAt - a.publishedAt));
                const majorItems = items.filter(item => isMajorOutlet(item.host));
                const otherItems = items.filter(item => !isMajorOutlet(item.host));
                return [...majorItems, ...otherItems];
            };

            let allItems = runFilter('strict', maxAgeDays);
            // relaxed 폴백 조건: 기사가 5건 미만이면서 평균 relevance가 2 이하인 경우만 허용
            // (기사 수만으로 폴백하면 품질 낮은 기사가 대거 유입됨)
            const strictAvgRelevance = allItems.length
                ? allItems.reduce((s, x) => s + (x.relevance || 0), 0) / allItems.length
                : 0;
            if (allItems.length < 5 && strictAvgRelevance <= 2) {
                allItems = runFilter('relaxed', maxAgeDays);
            }

            if (!allItems.length) {
                const catLabel = selectedCategory.label || '전체';
                list.innerHTML = `
                    <div class="news-error">
                        <div class="news-error-icon"><i class="fas fa-newspaper"></i></div>
                        <div class="news-error-title">'${catLabel}' 관련 뉴스가 없습니다</div>
                        <div class="news-error-detail">최근 ${maxAgeDays}일 이내 해당 카테고리의 뉴스가 검색되지 않았습니다.<br>다른 카테고리를 선택해보세요.</div>
                    </div>`;
                const loadMoreBtn = document.getElementById('news-load-more-btn');
                if (loadMoreBtn) loadMoreBtn.style.display = 'none';
                return;
            }

            // 카테고리 배지 매핑
            const catBadges = {
                'all': { label: '종합', color: '#3b82f6' },
                'poll': { label: '여론조사', color: '#f59e0b' },
                'candidate': { label: '후보·인물', color: '#22d3ee' },
                'policy': { label: '공약·정책', color: '#14b8a6' },
            };
            const currentCatId = selectedCategory.categoryId || 'all';
            const catBadge = catBadges[currentCatId] || catBadges.all;

            function renderNewsItem(item) {
                const press = item.host || '출처 미상';
                const isMajor = isMajorOutlet(item.host);
                const ageDays = Math.floor((Date.now() - item.publishedAt) / (1000 * 60 * 60 * 24));
                const freshBadge = ageDays <= 1 ? '<span class="news-badge news-badge-fresh">NEW</span>' : '';
                const majorBadge = isMajor ? '<span class="news-badge news-badge-major">주요</span>' : '';
                const localBadge = item.isDistrictMedia
                    ? '<span class="news-badge news-badge-district">토속</span>'
                    : item.isLocalMedia
                        ? '<span class="news-badge news-badge-local">지역</span>'
                        : '';
                const timeText = ageDays === 0 ? '오늘' : ageDays === 1 ? '어제' : `${ageDays}일 전`;
                return `
                    <a class="news-live-item" href="${item.link}" target="_blank" rel="noopener">
                        <div class="news-live-item-badges">${freshBadge}${majorBadge}${localBadge}<span class="news-badge" style="background:${catBadge.color}22;color:${catBadge.color};border-color:${catBadge.color}44">${catBadge.label}</span></div>
                        <div class="news-live-item-title">${item.title}</div>
                        <div class="news-live-item-meta">
                            <span class="news-press">${press}</span>
                            <span class="news-time">${timeText}</span>
                        </div>
                    </a>
                `;
            }

            let showCount = 6;
            let currentSort = 'date';
            let sortedItems = [...allItems];

            function refreshList() {
                if (currentSort === 'date') {
                    sortedItems = [...allItems].sort((a, b) => b.publishedAt - a.publishedAt);
                } else {
                    sortedItems = [...allItems].sort((a, b) => {
                        const sa = (a.rankScore || 0) - (a._filterPenalty || 0);
                        const sb = (b.rankScore || 0) - (b._filterPenalty || 0);
                        return sb - sa;
                    });
                }
                list.innerHTML = sortedItems.slice(0, showCount).map(renderNewsItem).join('');
                const loadMoreBtn = document.getElementById('news-load-more-btn');
                if (loadMoreBtn) loadMoreBtn.style.display = showCount < sortedItems.length ? '' : 'none';
            }

            refreshList();

            // 더보기 버튼
            const loadMoreBtn = document.getElementById('news-load-more-btn');
            if (loadMoreBtn) {
                loadMoreBtn.onclick = () => {
                    showCount += 6;
                    refreshList();
                };
            }

            // 정렬 토글
            const sortToggle = document.getElementById('news-sort-toggle');
            if (sortToggle) {
                sortToggle.addEventListener('click', (e) => {
                    const btn = e.target.closest('.news-sort-btn');
                    if (!btn) return;
                    sortToggle.querySelectorAll('.news-sort-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    currentSort = btn.dataset.sort;
                    showCount = 6;
                    refreshList();
                });
            }
        } catch (err) {
            // 캐시 fallback — API 실패 시 최근 캐시 사용 (30분까지 허용)
            const cached = _loadNewsCache(regionKey, catId, 30 * 60 * 1000);
            if (cached && cached.length > 0) {
                console.warn('[뉴스] API 실패, 캐시 fallback 사용', err.message);
                // 캐시된 fetchedItems를 주입하여 재시도 없이 렌더
                // 간략 렌더: 캐시된 항목 직접 표시
                const cacheAge = Math.round((Date.now() - (JSON.parse(sessionStorage.getItem(_newsCacheKey(regionKey, catId)))?.ts || Date.now())) / 60000);
                list.innerHTML = `<div style="padding:6px 10px;font-size:0.72rem;color:var(--text-muted);background:rgba(245,158,11,0.08);border-radius:6px;margin-bottom:6px;">
                    <i class="fas fa-clock-rotate-left"></i> 네트워크 오류로 ${cacheAge}분 전 캐시를 표시합니다.
                    <button class="news-retry-btn" style="margin-left:8px;padding:2px 8px;font-size:0.7rem;" id="news-retry-btn"><i class="fas fa-redo"></i> 재시도</button>
                </div>` + cached.slice(0, 10).map(item => {
                    const title = (item.title || '').replace(/<[^>]+>/g, '');
                    const link = item.originallink || item.link || '#';
                    const press = (() => { try { return new URL(link).hostname.replace(/^www\./, ''); } catch(e) { return ''; } })();
                    const pubDate = item.pubDate ? new Date(item.pubDate).toLocaleString('ko-KR') : '';
                    return `<a class="news-live-item" href="${link}" target="_blank" rel="noopener">
                        <div class="news-live-item-title">${title}</div>
                        <div class="news-live-item-meta"><span class="news-press">${press}</span><span class="news-time">${pubDate}</span></div>
                    </a>`;
                }).join('');
                const retryBtn = document.getElementById('news-retry-btn');
                if (retryBtn) retryBtn.onclick = () => fetchLatestNews(category, regionKey);
                const loadMoreBtn = document.getElementById('news-load-more-btn');
                if (loadMoreBtn) loadMoreBtn.style.display = 'none';
                return;
            }

            const message = err?.message || '';
            const isTimeout = message.includes('timeout') || message.includes('AbortError');
            const missingKey = message.includes('Missing NAVER_CLIENT_ID/NAVER_CLIENT_SECRET');
            let icon, title, detail;
            if (missingKey) {
                icon = 'fas fa-key';
                title = 'API 키 미설정';
                detail = 'NAVER_CLIENT_ID/NAVER_CLIENT_SECRET 환경변수를 설정한 뒤 뉴스 프록시를 다시 실행하세요.';
            } else if (isTimeout) {
                icon = 'fas fa-clock';
                title = '응답 시간 초과';
                detail = '네트워크 상태를 확인하고 다시 시도해주세요.';
            } else {
                icon = 'fas fa-satellite-dish';
                title = '뉴스를 불러오지 못했습니다';
                detail = '뉴스 프록시 서버 실행 상태를 확인하세요.';
            }
            list.innerHTML = `
                <div class="news-error">
                    <div class="news-error-icon"><i class="${icon}"></i></div>
                    <div class="news-error-title">${title}</div>
                    <div class="news-error-detail">${detail}</div>
                    <button class="news-retry-btn" id="news-retry-btn"><i class="fas fa-redo"></i> 다시 시도</button>
                </div>`;
            const retryBtn = document.getElementById('news-retry-btn');
            if (retryBtn) {
                retryBtn.onclick = () => fetchLatestNews(category, regionKey);
            }
        }
    }

    function renderPollTab(regionKey, electionType, districtName) {
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

            // 1위 히어로
            const [leaderName, leaderPct] = sorted[0] || ['', 0];
            const leaderCand = _findCandidateParty(polls, leaderName);
            const leaderColor = leaderCand ? ElectionData.getPartyColor(leaderCand) : 'var(--text-muted)';
            const leaderParty = leaderCand ? ElectionData.getPartyName(leaderCand) : '';

            // 나머지 후보 바차트
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

            // 격차 뱃지
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

            // 돌출 조사 여부
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
                    // 오차범위 자동 해석
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

    // ── 통합 추세 계산 (가중 이동평균) ──
    function _calcConsensusTrend(polls, windowDays = 21) {
        const cutoff = Date.now() - windowDays * 86400000;
        const recent = polls.filter(p => {
            const d = p.surveyDate?.end || p.publishDate || '';
            return d && Date.parse(d) >= cutoff && p.results?.some(r => r.support > 0);
        });

        if (recent.length < 2) return null;

        // 후보별 가중평균
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

        // 1위-2위 격차 계산
        const gaps = withResults.map(p => {
            const sorted = [...p.results].filter(r => r.support > 0).sort((a, b) => b.support - a.support);
            return { nttId: p.nttId, gap: sorted.length >= 2 ? sorted[0].support - sorted[1].support : 0 };
        });

        const avgGap = gaps.reduce((s, g) => s + g.gap, 0) / gaps.length;
        const sdGap = Math.sqrt(gaps.reduce((s, g) => s + Math.pow(g.gap - avgGap, 2), 0) / gaps.length);

        const outlierIds = new Set();
        if (sdGap > 0) {
            gaps.forEach(g => {
                const z = Math.abs(g.gap - avgGap) / sdGap;
                if (z >= 2.0) outlierIds.add(g.nttId);
            });
        }

        return { outlierIds };
    }

    function getElectionTypeLabel(type) {
        switch (type) {
            case 'governor':
                return '광역단체장';
            case 'mayor':
                return '기초단체장';
            case 'superintendent':
                return '교육감';
            default:
                return '선거';
        }
    }

    function getDebugRegionMediaBundle(regionKey, districtName = null) {
        const registryRegion = window.LocalMediaRegistry?.regions?.[regionKey] || {};
        const configRegion = NEWS_FILTER_CONFIG.regionalMedia?.[regionKey] || {};
        const canonicalDistrict = districtName
            ? (ElectionData.getSubRegionByName?.(regionKey, districtName)?.name || districtName)
            : null;
        const municipalityEntry = canonicalDistrict ? registryRegion?.municipalities?.[canonicalDistrict] || {} : {};
        const provinceEntry = registryRegion?.province || {};

        return {
            canonicalDistrict,
            provinceHosts: {
                tier1: mergeUniqueArrays(provinceEntry?.hosts?.tier1, configRegion?.tier1),
                tier2: mergeUniqueArrays(provinceEntry?.hosts?.tier2, configRegion?.tier2)
            },
            districtHosts: {
                tier1: mergeUniqueArrays(municipalityEntry?.hosts?.tier1, municipalityEntry?.tier1Hosts),
                tier2: mergeUniqueArrays(municipalityEntry?.hosts?.tier2, municipalityEntry?.tier2Hosts)
            },
            priorityNames: canonicalDistrict
                ? mergeUniqueArrays(municipalityEntry?.priorityNames, provinceEntry?.priorityNames)
                : mergeUniqueArrays(provinceEntry?.priorityNames, configRegion?.priorityNames),
            primaryHosts: canonicalDistrict
                ? mergeUniqueArrays(
                    mergeUniqueArrays(
                        mergeUniqueArrays(municipalityEntry?.hosts?.tier1, municipalityEntry?.hosts?.tier2),
                        mergeUniqueArrays(provinceEntry?.hosts?.tier1, provinceEntry?.hosts?.tier2)
                    ),
                    mergeUniqueArrays(configRegion?.tier1, configRegion?.tier2)
                )
                : mergeUniqueArrays(
                    mergeUniqueArrays(provinceEntry?.hosts?.tier1, provinceEntry?.hosts?.tier2),
                    mergeUniqueArrays(configRegion?.tier1, configRegion?.tier2)
                )
        };
    }

    function buildDistrictOfficeLabel(districtName) {
        const normalized = normalizeKeyword(districtName);
        if (!normalized) return '';
        if (normalized.endsWith('군')) return `${normalized}수`;
        if (normalized.endsWith('구')) return `${normalized}청장`;
        if (normalized.endsWith('시')) return `${normalized}장`;
        return normalized;
    }

    function buildDebugNewsCategory(testCase, regionName, fallbackCategory) {
        const electionType = testCase.electionType || null;
        const districtName = testCase.districtName || null;
        if (!(electionType === 'mayor' && districtName)) {
            return fallbackCategory;
        }

        const canonicalDistrict = ElectionData.getSubRegionByName?.(testCase.regionKey, districtName)?.name || districtName;
        const officeLabel = buildDistrictOfficeLabel(canonicalDistrict);
        const categoryId = testCase.categoryId || 'all';
        const base = {
            categoryId,
            query: `${officeLabel} 후보 선거`,
            altQueries: [`${canonicalDistrict} 기초단체장 후보 선거`],
            focusKeywords: [canonicalDistrict, officeLabel, '후보', '선거', '공약', '출마', '경선', '유세'],
            strict: {
                mustAny: ['후보', '선거', '공약', '출마', '경선', '유세', '등록'],
                targetAny: [canonicalDistrict, officeLabel, '기초단체장'],
                boostAny: [canonicalDistrict, officeLabel],
                excludeAny: ['교육감', '교육청', ...(NEWS_FILTER_CONFIG.globalExcludeKeywords || [])]
            },
            relaxed: {
                mustAny: ['후보', '선거', '공약', '출마', '경선', '유세', '등록'],
                targetAny: [canonicalDistrict, officeLabel],
                boostAny: [canonicalDistrict, officeLabel],
                excludeAny: ['교육감', '교육청', ...(NEWS_FILTER_CONFIG.globalExcludeKeywords || [])]
            }
        };

        if (categoryId === 'candidate') {
            base.query = `${officeLabel} 출마 경선 공천`;
        } else if (categoryId === 'poll') {
            base.query = `${officeLabel} 여론조사 지지율`;
            base.strict.mustAny = ['여론조사', '지지율', '지지도', '가상대결', '양자대결', '다자대결'];
            base.strict.targetAny = [canonicalDistrict, officeLabel, '후보'];
            base.relaxed.mustAny = base.strict.mustAny.slice();
            base.relaxed.targetAny = base.strict.targetAny.slice();
        }

        return base;
    }

    function mentionsOtherRegion(text, regionKey) {
        const currentAliases = getRegionAliasTerms(ElectionData.getRegion(regionKey)?.name || '');
        return Object.entries(ElectionData.regions || {}).some(([otherKey, region]) => {
            if (otherKey === regionKey) return false;
            const aliases = getRegionAliasTerms(region?.name || '');
            const hasOther = aliases.some((alias) => alias && text.includes(alias));
            if (!hasOther) return false;
            const hasCurrent = currentAliases.some((alias) => alias && text.includes(alias));
            return !hasCurrent;
        });
    }

    function mentionsNationalDistrictRace(text) {
        return /[가-힣]{2,8}(갑|을|병|정)/.test(text);
    }

    function hostMatches(host, targets) {
        if (!host || !Array.isArray(targets)) return false;
        return targets.some((target) => host === target || host.endsWith(`.${target}`));
    }

    function buildNewsQueryPlan(testCase) {
        const region = ElectionData.getRegion(testCase.regionKey);
        if (!region) {
            return { primaryQueries: [], secondaryQueries: [], categoryId: testCase.categoryId || 'all' };
        }

        const regionName = region.name;
        const governorQueryBase = getGovernorQueryBase(regionName);
        const governorFocusTerms = getGovernorFocusTerms(regionName, governorQueryBase);
        const governorRoleTerms = getGovernorRoleTerms(regionName, governorQueryBase);
        const categories = buildNewsCategories(testCase.regionKey, regionName, governorQueryBase, governorFocusTerms, governorRoleTerms);
        const fallbackCategory = categories.find((entry) => entry.categoryId === (testCase.categoryId || 'all')) || categories[0] || {};
        const selectedCategory = buildDebugNewsCategory(testCase, regionName, fallbackCategory);
        const bundle = getDebugRegionMediaBundle(testCase.regionKey, testCase.districtName || null);

        return {
            categoryId: selectedCategory.categoryId || testCase.categoryId || 'all',
            primaryQueries: mergeUniqueArrays(
                [selectedCategory.query, ...(selectedCategory.altQueries || [])].filter(Boolean),
                bundle.primaryHosts.map((host) => `site:${host}`)
            ),
            secondaryQueries: bundle.priorityNames || []
        };
    }

    function scoreNewsLocality(item, regionKey, districtName = null) {
        const signals = NEWS_FILTER_CONFIG.localitySignals || {};
        const text = `${item.title || ''} ${item.description || ''}`;
        const host = getHostFromUrl(item.link || item.originallink || '');
        const bundle = getDebugRegionMediaBundle(regionKey, districtName);

        if (districtName) {
            if (hostMatches(host, bundle.districtHosts.tier1)) return signals.tier1 || 1;
            if (hostMatches(host, bundle.districtHosts.tier2)) return signals.tier2 || 0.82;
            if (hostMatches(host, bundle.provinceHosts.tier1)) {
                return signals.tier1 || 1;
            }
            if (hostMatches(host, bundle.provinceHosts.tier2)) {
                return signals.tier2 || 0.82;
            }
            if ((bundle.priorityNames || []).some((name) => text.includes(name))) {
                return signals.outletMentionDistrict || 0.74;
            }
            return 0;
        }

        if (hostMatches(host, bundle.provinceHosts.tier1)) return signals.tier1 || 1;
        if (hostMatches(host, bundle.provinceHosts.tier2)) return signals.tier2 || 0.82;
        if ((bundle.priorityNames || []).some((name) => text.includes(name))) {
            return signals.outletMentionProvince || 0.62;
        }
        return 0;
    }

    function scoreNewsCredibility(host, regionKey, districtName = null) {
        const tiers = NEWS_FILTER_CONFIG.credibilityTiers || {};
        const scores = tiers.scores || {};
        const national = tiers.national || {};
        const bundle = getDebugRegionMediaBundle(regionKey, districtName);

        if (hostMatches(host, national.tier1)) return scores.tier1 || 1;
        if (hostMatches(host, national.tier2)) return scores.tier2 || 0.82;
        if (hostMatches(host, national.tier3)) return scores.tier3 || 0.64;
        if (hostMatches(host, bundle.districtHosts.tier1) || hostMatches(host, bundle.provinceHosts.tier1)) {
            return scores.regionalTier1 || 0.76;
        }
        if (hostMatches(host, bundle.districtHosts.tier2) || hostMatches(host, bundle.provinceHosts.tier2)) {
            return scores.regionalTier2 || 0.68;
        }
        return scores.unknown || 0.45;
    }

    function evaluateNewsCase(testCase) {
        const region = ElectionData.getRegion(testCase.regionKey);
        if (!region) {
            return {
                strict: { ok: false, score: 0 },
                relaxed: { ok: false, score: 0 },
                effectiveOk: false,
                localityScore: 0,
                credibilityScore: 0,
                host: ''
            };
        }

        const regionName = region.name;
        const governorQueryBase = getGovernorQueryBase(regionName);
        const governorFocusTerms = getGovernorFocusTerms(regionName, governorQueryBase);
        const governorRoleTerms = getGovernorRoleTerms(regionName, governorQueryBase);
        const categories = buildNewsCategories(testCase.regionKey, regionName, governorQueryBase, governorFocusTerms, governorRoleTerms);
        const fallbackCategory = categories.find((entry) => entry.categoryId === (testCase.categoryId || 'all')) || categories[0] || {};
        const selectedCategory = buildDebugNewsCategory(testCase, regionName, fallbackCategory);
        const item = {
            title: testCase.title || '',
            description: testCase.description || '',
            link: testCase.link || ''
        };
        const text = `${item.title} ${item.description}`;
        const globalExcludes = Array.isArray(NEWS_FILTER_CONFIG.globalExcludeKeywords) ? NEWS_FILTER_CONFIG.globalExcludeKeywords : [];
        if (globalExcludes.some((keyword) => text.includes(keyword))) {
            return {
                strict: { ok: false, score: 0 },
                relaxed: { ok: false, score: 0 },
                effectiveOk: false,
                localityScore: scoreNewsLocality(item, testCase.regionKey, testCase.districtName || null),
                credibilityScore: scoreNewsCredibility(getHostFromUrl(item.link), testCase.regionKey, testCase.districtName || null),
                host: getHostFromUrl(item.link)
            };
        }
        if (!testCase.districtName && mentionsOtherRegion(item.title || '', testCase.regionKey)) {
            return {
                strict: { ok: false, score: 0 },
                relaxed: { ok: false, score: 0 },
                effectiveOk: false,
                localityScore: scoreNewsLocality(item, testCase.regionKey, testCase.districtName || null),
                credibilityScore: scoreNewsCredibility(getHostFromUrl(item.link), testCase.regionKey, testCase.districtName || null),
                host: getHostFromUrl(item.link)
            };
        }
        if (!testCase.districtName && mentionsNationalDistrictRace(item.title || '')) {
            return {
                strict: { ok: false, score: 0 },
                relaxed: { ok: false, score: 0 },
                effectiveOk: false,
                localityScore: scoreNewsLocality(item, testCase.regionKey, testCase.districtName || null),
                credibilityScore: scoreNewsCredibility(getHostFromUrl(item.link), testCase.regionKey, testCase.districtName || null),
                host: getHostFromUrl(item.link)
            };
        }
        const strict = evaluateCategoryMatch(item, selectedCategory, 'strict');
        const relaxed = evaluateCategoryMatch(item, selectedCategory, 'relaxed');
        const host = getHostFromUrl(item.link);

        return {
            strict,
            relaxed,
            effectiveOk: !!(strict.ok || relaxed.ok),
            localityScore: scoreNewsLocality(item, testCase.regionKey, testCase.districtName || null),
            credibilityScore: scoreNewsCredibility(host, testCase.regionKey, testCase.districtName || null),
            host
        };
    }

    function getPollHeaderTitle(regionKey, electionType, districtName = null) {
        const region = ElectionData.getRegion(regionKey);
        const regionName = region?.name || '';
        if (electionType === 'mayor' && districtName) {
            return `${districtName} ${getElectionTypeLabel(electionType)}`;
        }
        return `${regionName} ${getElectionTypeLabel(electionType)}`.trim();
    }

    function getFallbackCandidateNames(regionKey, electionType, districtName = null) {
        if (electionType === 'governor') {
            return (ElectionData.getRegion(regionKey)?.candidates || []).map((candidate) => candidate.name).filter(Boolean);
        }
        if (electionType === 'superintendent') {
            return (ElectionData.getSuperintendentData(regionKey)?.candidates || []).map((candidate) => candidate.name).filter(Boolean);
        }
        if (electionType === 'mayor' && districtName) {
            const summary = ElectionData.getDistrictSummary?.(regionKey, districtName);
            return summary?.mayor?.name ? [summary.mayor.name] : [];
        }
        return [];
    }

    function buildPollTrendChart(polls, regionKey, electionType, districtName = null) {
        const forcedReferenceRegions = {
            governor: new Set(['gwangju', 'jeju', 'gyeongnam']),
            superintendent: new Set(['busan', 'daegu', 'incheon', 'daejeon'])
        };
        const forcedTrendRegions = {
            superintendent: new Set(['gyeongbuk', 'gyeongnam'])
        };
        const counts = new Map();
        const latestSupport = new Map();
        const officialFallbackNames = getFallbackCandidateNames(regionKey, electionType, districtName);
        const supplementalPollNames = ElectionData.getPollCandidates?.(regionKey, electionType, districtName)?.map((candidate) => candidate.name) || [];
        const forceTrend = forcedTrendRegions[electionType]?.has(regionKey);
        // 교육감은 무정당 선거 → 정당지지도 결과(정당명·정치인명)가 후보명으로 오염 방지
        // 광역단체장 후보 제거 + 2건 이상 등장한 이름만 신뢰
        let cleanSupplemental = supplementalPollNames;
        if (electionType === 'superintendent') {
            const governorNames = new Set((ElectionData.getRegion(regionKey)?.candidates || []).map((c) => c.name).filter(Boolean));
            const freqMap = new Map();
            polls.forEach((poll) => {
                const seen = new Set();
                (poll.results || []).forEach((r) => {
                    const name = normalizeKeyword(r?.candidateName || '');
                    if (name && !seen.has(name)) { seen.add(name); freqMap.set(name, (freqMap.get(name) || 0) + 1); }
                });
            });
            cleanSupplemental = supplementalPollNames.filter((name) =>
                !governorNames.has(name) && (freqMap.get(name) || 0) >= 2
            );
        }
        const knownNames = new Set(
            forceTrend && cleanSupplemental.length >= 2
                ? mergeUniqueArrays(cleanSupplemental, officialFallbackNames)
                : officialFallbackNames.length
                    ? officialFallbackNames
                    : mergeUniqueArrays(officialFallbackNames, cleanSupplemental)
        );

        polls.forEach((poll) => {
            (poll.results || []).forEach((result) => {
                const name = normalizeKeyword(result?.candidateName || '');
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
            return {
                type: 'line',
                datasetLabels: labels
            };
        }

        if (electionType === 'governor' || electionType === 'superintendent') {
            const fallbackCandidates = mergeUniqueArrays(
                labels,
                officialFallbackNames.length ? officialFallbackNames : supplementalPollNames
            ).slice(0, 5);

            if (fallbackCandidates.length >= 2 || polls.length) {
                return {
                    type: 'bar',
                    datasetLabels: ['참고 지지율'],
                    labels: fallbackCandidates
                };
            }
        }

        return null;
    }

    function buildPollSelection(testCase) {
        const regionKey = testCase.regionKey;
        const electionType = testCase.electionType || 'governor';
        const districtName = testCase.districtName || null;
        const polls = ElectionData.getPollsForSelection(regionKey, electionType, districtName);
        const firstPoll = polls[0] || null;
        const municipalities = [...new Set(polls.map((poll) => normalizeKeyword(poll.municipality)).filter(Boolean))];
        const headerTitle = getPollHeaderTitle(regionKey, electionType, districtName);

        if (electionType === 'mayor' && !districtName) {
            return {
                polls,
                count: polls.length,
                municipalities,
                headerTitle,
                chartMode: 'activity',
                chartReason: 'activity',
                chart: {
                    type: 'bar',
                    datasetLabels: ['조사 수'],
                    labels: municipalities
                },
                firstPoll
            };
        }

        const chart = buildPollTrendChart(polls, regionKey, electionType, districtName);
        const chartReason = !chart
            ? 'no-candidate-results'
            : chart.type === 'line'
                ? 'trend'
                : 'reference-support';

        return {
            polls,
            count: polls.length,
            municipalities,
            headerTitle,
            chartMode: 'trend',
            chartReason,
            chart,
            firstPoll
        };
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
                    if (councilTypes.includes(state.electionType)) {
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

    return {
        onRegionSelected,
        onDistrictSelected,
        onSubdistrictSelected,
        onByElectionSelected,
        onConstituencySelected,
        onBreadcrumbNational,
        closePanel,
        switchTab,
        getElectionType: () => currentElectionType,
        applyTermTooltips,
        __debug: {
            evaluateNewsCase,
            buildNewsQueryPlan,
            buildPollSelection
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
