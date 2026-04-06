// ============================================
// 6.3 전국지방선거 인터랙티브 선거 정보 지도
// Sidebar Module - 사이드바 UI, 필터, 통계, 캘린더
// ============================================

// 여당/야당 → 보수/진보 변환 (중앙 정치 기준 여야 구분은 지방선거에 부적합)
function _normalizeTrend(trend) {
    if (!trend) return '';
    return trend
        .replace(/여당/g, '보수')
        .replace(/야당/g, '진보')
        .replace(/여야/g, '양당');
}

const Sidebar = (() => {
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
    // Mobile Filter Sheet
    // ============================================
    let _mobileFilterSheetReady = false;
    function setupMobileFilterSheet() {
        if (_mobileFilterSheetReady) return;
        const toggle = document.getElementById('mobile-filter-toggle');
        const sheet = document.getElementById('mobile-filter-sheet');
        const grid = document.getElementById('mobile-filter-grid');
        const backdrop = sheet?.querySelector('.mobile-filter-sheet-backdrop');
        if (!toggle || !sheet || !grid) return;
        _mobileFilterSheetReady = true;

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

    // ── 모바일 선거유형 플로팅 칩 ──
    let _mobileChipsReady = false;
    function setupMobileElectionChips() {
        if (_mobileChipsReady) return;
        const container = document.getElementById('mobile-election-chips');
        if (!container) return;
        _mobileChipsReady = true;

        const chipData = [
            { type: 'governor', icon: 'fa-landmark', label: '광역단체장' },
            { type: 'superintendent', icon: 'fa-graduation-cap', label: '교육감' },
            { type: 'mayor', icon: 'fa-building', label: '기초단체장' },
            { type: 'council', icon: 'fa-users', label: '광역의원' },
            { type: 'localCouncil', icon: 'fa-people-group', label: '기초의원' },
            { type: 'councilProportional', icon: 'fa-layer-group', label: '광역비례' },
            { type: 'localCouncilProportional', icon: 'fa-network-wired', label: '기초비례' },
            { type: 'byElection', icon: 'fa-calendar-check', label: '재보궐' },
        ];

        chipData.forEach(c => {
            const chip = document.createElement('button');
            chip.className = 'mobile-election-chip';
            chip.dataset.type = c.type;
            chip.innerHTML = `<i class="fas ${c.icon} chip-icon"></i><span>${c.label}</span>`;
            chip.addEventListener('click', () => {
                // 사이드바 원본 버튼 클릭
                const sidebarBtn = document.querySelector(`.sidebar .filter-btn[data-type="${c.type}"]`);
                if (sidebarBtn) sidebarBtn.click();
            });
            container.appendChild(chip);
        });

        // 사이드바 필터 활성 상태 → 칩 동기화 (디바운스)
        let _chipSyncTimer;
        function syncChips() {
            clearTimeout(_chipSyncTimer);
            _chipSyncTimer = setTimeout(() => {
                const activeType = document.querySelector('.sidebar .filter-btn.active')?.dataset?.type;
                container.querySelectorAll('.mobile-election-chip').forEach(chip => {
                    chip.classList.toggle('active', chip.dataset.type === activeType);
                });
                // 활성 칩이 보이도록 스크롤
                const activeChip = container.querySelector('.mobile-election-chip.active');
                if (activeChip) {
                    activeChip.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                }
            }, 50);
        }

        // 초기 동기화
        syncChips();

        // MutationObserver로 사이드바 변경 감시
        const sidebarBtns = document.querySelectorAll('.sidebar .filter-btn');
        const observer = new MutationObserver(syncChips);
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
        // 선거일 이후에는 라벨을 "선거일로부터"로 전환
        const labelEl = document.querySelector('#dday-counter .dday-label');
        if (labelEl && typeof ElectionCalendar !== 'undefined') {
            const phase = ElectionCalendar.getCurrentPhase();
            labelEl.textContent = (phase === 'POST_ELECTION' || phase === 'INAUGURATED') ? '선거일로부터' : '선거일까지';
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
        // 전남광주통합특별시: governor/superintendent는 jeonnam이 gwangju로 병합되어 16개
        const regions = ElectionData.regions;
        const regionCount = regions ? Object.keys(regions).length : 0;
        const mergedCount = (regions && regions['jeonnam']) ? regionCount - 1 : regionCount;
        if (regions) counts.governor = mergedCount;

        // 교육감: regions 키 수 (= 광역 수, 병합 반영)
        if (regions) counts.superintendent = mergedCount;

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
            // 모바일(터치) 환경에서는 툴팁 비활성
            wrap.onmouseenter = () => {
                if ('ontouchstart' in window || navigator.maxTouchPoints > 0) return;
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
                if (type === AppState.currentElectionType) {
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

                const prevType = AppState.currentElectionType;
                AppState.currentElectionType = type;
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
            AppState.currentDistrictName = null;
        }

        // Same unit & region selected → preserve region, re-render with new type
        const preserveRegion = (prevUnit === newUnit) && AppState.currentRegionKey;

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
            App.onRegionSelected(AppState.currentRegionKey);
        } else {
            // Different unit → reset to welcome state
            resetPanelToWelcome();
        }

        Router.updateHash();
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
        AppState.currentRegionKey = null;
        AppState.currentDistrictName = null;
        AppState.regionSelected = false;
        App.hideMiniCard();

        const panel = document.getElementById('detail-panel');
        if (window.innerWidth <= 768) {
            // 모바일: 패널 닫기
            if (panel) App.setPanelStage('collapsed', false);
        } else {
            if (panel) panel.classList.remove('collapsed');
        }

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
            AppState.currentTab = 'overview';
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
    // Configure Panel Tabs per Election Type
    // ============================================
    function configurePanelTabs(visibleTabs) {
        document.querySelectorAll('.panel-tab').forEach(tab => {
            const tabName = tab.dataset.tab;
            tab.style.display = visibleTabs.includes(tabName) ? '' : 'none';
        });
    }

    // ============================================
    // News Media Constants
    // ============================================
    // 교육 전문 언론사 (뉴스 부스트 대상)
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

    return {
        updateChartTheme, renderDday, renderElectionBanner, renderElectionCalendar,
        renderStats, syncCountsFromData, updateFilterCounts, animateNumber,
        setupFilterTooltips, setupFilterButtons, setupMobileFilterSheet,
        setupMobileElectionChips, setupBannerClose,
        getElectionUnit, onElectionTypeChanged, updateElectionTypeLabel,
        resetPanelToWelcome, resetSharedUI,
        toggleSuperintendentSummary, toggleByelectionNote,
        configurePanelTabs,
        renderNationalPartyBar, renderGallupSource, renderFooterPartyBar,
        applyTermTooltips,
        electionTypeIcons,
        EDUCATION_MEDIA_HOSTS, REGIONAL_BROADCAST_HOSTS, mergeUniqueArrays,
    };
})();
