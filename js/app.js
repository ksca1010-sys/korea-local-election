// ============================================
// 6.3 전국지방선거 인터랙티브 선거 정보 지도
// App Module - Main Application Controller
// ============================================

const App = (() => {
    let currentRegionKey = null;
    let currentTab = 'overview';
    let currentDistrictName = null;
    let currentElectionType = null;
    let districtGeoCache = null;
    let districtGeoPromise = null;
    let historyComparisonChart = null;
    const NEWS_FILTER_CONFIG = window.NewsFilterConfig || {};
    const NEWS_PROXY_BASE = window.NEWS_PROXY_BASE || 'http://localhost:8787';
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
    // Initialization
    // ============================================
    async function init() {
        // Render sidebar data
        renderDday();
        renderStats();
        renderNationalPartyBar();
        renderGallupSource();
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
        // Load governor status (광역단체장 현황 팩트체크 데이터)
        try { await ElectionData.loadGovernorStatus?.(); } catch(e) { console.warn('loadGovernorStatus error:', e); }
        // Load mayor status (기초단체장 현황 팩트체크 데이터)
        try { await ElectionData.loadMayorStatus?.(); } catch(e) { console.warn('loadMayorStatus error:', e); }
        // Load council members data (광역의원 현직 정보)
        try { ElectionData.loadCouncilMembersData(); } catch(e) { console.warn('loadCouncilMembersData error:', e); }
        // Load candidates data
        try { ElectionData.loadCandidatesData?.(); } catch(e) { console.warn('loadCandidatesData error:', e); }
        // Load by-election data
        try { ElectionData.loadByElectionData?.(); } catch(e) { console.warn('loadByElectionData error:', e); }

        // Initialize map
        await MapModule.init();
        if (MapModule.setElectionType) MapModule.setElectionType(null);

        // Setup event listeners
        setupSearch();
        setupTabs();
        setupPanelClose();
        setupHomeLink();

        // Hide loading screen
        setTimeout(() => {
            const loading = document.getElementById('loading-screen');
            if (loading) {
                loading.classList.add('hidden');
                setTimeout(() => loading.remove(), 500);
            }
        }, 800);

        // Update D-day every minute
        setInterval(renderDday, 60000);
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

    function toggleByelectionNote(show) {
        const note = document.getElementById('map-byelection-note');
        if (!note) return;
        note.classList.toggle('visible', show);
    }

    // ============================================
    // D-Day Counter
    // ============================================
    function renderDday() {
        const dday = ElectionData.getDday();
        const ddayEl = document.getElementById('dday-number');
        if (ddayEl) {
            ddayEl.textContent = dday > 0 ? `D-${dday}` : dday === 0 ? 'D-DAY' : `D+${Math.abs(dday)}`;
        }
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

        currentElectionType = type;
        onElectionTypeChanged(type);
    });
});

        // Update election type label
        updateElectionTypeLabel(null);
    }

    function onElectionTypeChanged(type) {
        // Reset panel to welcome state
        resetPanelToWelcome();

        // Update election type label on map
        updateElectionTypeLabel(type);

        // Tell the map to switch mode
        if (MapModule && MapModule.setElectionType) {
            MapModule.setElectionType(type);
        }

        toggleByelectionNote(type === 'byElection');
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

        const regionName = document.getElementById('panel-region-name');
        if (regionName) regionName.textContent = '지역을 선택하세요';
        const regionInfo = document.getElementById('panel-region-info');
        if (regionInfo) regionInfo.textContent = '';

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
            // Fallback: Calculate average party support across all regions
            const regions = ElectionData.regions;
            const totals = {};
            let count = 0;
            Object.values(regions).forEach(region => {
                Object.entries(region.partySupport).forEach(([party, value]) => {
                    totals[party] = (totals[party] || 0) + value;
                });
                count++;
            });
            const avg = {};
            Object.entries(totals).forEach(([party, total]) => {
                avg[party] = parseFloat((total / count).toFixed(1));
            });
            partyData = Object.entries(avg).sort((a, b) => {
                if (a[0] === 'independent') return 1;
                if (b[0] === 'independent') return -1;
                return b[1] - a[1];
            });
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
        document.querySelectorAll('.panel-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.dataset.tab;
                switchTab(tabName);
            });
        });
    }

    function switchTab(tabName) {
        currentTab = tabName;

        // Update tab buttons
        document.querySelectorAll('.panel-tab').forEach(t => {
            t.classList.toggle('active', t.dataset.tab === tabName);
        });

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(tc => {
            tc.style.display = 'none';
        });
        const activeTab = document.getElementById(`tab-${tabName}`);
        if (activeTab) activeTab.style.display = 'block';

        // Render chart if polls tab
        if (tabName === 'polls' && currentRegionKey) {
            setTimeout(() => ChartsModule.renderAllCharts(currentRegionKey), 100);
            renderLatestPolls(currentRegionKey);
        }

        if (tabName === 'candidates' && currentRegionKey) {
            renderCandidatesTab(currentRegionKey);
        }

        // Render news if news tab
        if (tabName === 'news' && currentRegionKey) {
            renderNewsTab(currentRegionKey);
        }

        if (tabName === 'history' && currentRegionKey) {
            renderHistoryTab(currentRegionKey);
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

    /** 지역이 선택되어 패널에 데이터가 표시된 상태인지 */
    let regionSelected = false;

    function openPanel() {
        const panel = document.getElementById('detail-panel');
        if (panel) panel.classList.remove('collapsed');
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

        const regionName = document.getElementById('panel-region-name');
        if (regionName) regionName.textContent = '지역을 선택하세요';
        const regionInfo = document.getElementById('panel-region-info');
        if (regionInfo) regionInfo.textContent = '';

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

        // Hide welcome, show content
        const welcome = document.getElementById('panel-welcome');
        if (welcome) welcome.style.display = 'none';

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
                renderLocalCouncilProportionalView(regionKey, region);
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
        renderNewsTab(regionKey);
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
        renderNewsTab(regionKey);
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

        const methodLabelMap = {
            'news-keyword-weighted-v1': '뉴스 키워드 가중치 v1',
            'news-detailed-topic-weighted-v2': '뉴스 세부주제 가중치 v2',
            'news-detailed-topic-weighted-v3': '뉴스 세부주제+추세 v3'
        };
        const methodLabel = methodLabelMap[meta.methodology] || meta.methodology;
        const evidenceItems = issues.map((issue) => {
            const sig = signals?.[issue];
            if (!sig) return null;
            const sourceText = Array.isArray(sig.topSources) && sig.topSources.length
                ? sig.topSources.join(', ')
                : '출처 집계 중';
            return `
                <div class="issues-evidence-item">
                    <span class="issue-name">${issue}</span>
                    <span class="issue-evidence-meta">7일 ${sig.count7 || 0}건 · 30일 ${sig.count30 || 0}건 · 추세 ${sig.trend || '유지'}</span>
                    <span class="issue-evidence-source">${sourceText}</span>
                </div>
            `;
        }).filter(Boolean).join('');

        return `
            ${tagsHtml}
            <div class="issues-meta">
                산출 시각: ${updatedText} · 방식: ${methodLabel}
            </div>
            ${evidenceItems ? `<div class="issues-evidence">${evidenceItems}</div>` : ''}
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
        if (!config) return;
        const data = config.getData();
        if (!data) return;

        document.getElementById('panel-region-name').textContent = `${region.name} ${config.label}`;
        document.getElementById('panel-region-info').textContent = data.description;

        configurePanelTabs(['overview', 'news']);

        const prevContainer = document.getElementById('prev-election-result');
        if (prevContainer) {
            prevContainer.innerHTML = `
                <div class="proportional-summary">
                    <div class="proportional-summary-row">
                        <span class="summary-label">비례대표석</span>
                        <strong>${data.seats}석</strong>
                        <span class="summary-meta">${data.ballot}</span>
                    </div>
                    <div class="proportional-summary-row">
                        <span class="summary-label">최근 투표율</span>
                        <strong>${data.lastTurnout}%</strong>
                        <span class="summary-meta">${data.note}</span>
                    </div>
                </div>
            `;
        }

        const govContainer = document.getElementById('current-governor');
        if (govContainer) {
            govContainer.innerHTML = `
                <div class="proportional-party-list">
                    ${data.partyAllocation.map(p => `
                        <div class="proportional-party-row">
                            <span class="party-dot" style="background:${ElectionData.getPartyColor(p.party)}"></span>
                            <span class="party-name">${ElectionData.getPartyName(p.party)}</span>
                            <span class="party-seats">${p.seats}석</span>
                            <span class="party-share">${p.share}%</span>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        const issuesContainer = document.getElementById('key-issues');
        if (issuesContainer) {
            issuesContainer.innerHTML = `
                <div class="issues-list">
                    ${data.keyIssues.map(issue => `<span class="issue-tag">${issue}</span>`).join('')}
                </div>
            `;
        }

        renderNewsTab(regionKey);
    }

    function renderCouncilProportionalView(regionKey, region) {
        toggleSuperintendentSummary(false);
        renderProportionalView(regionKey, region, 'councilProportional');
    }

    function renderLocalCouncilProportionalView(regionKey, region) {
        toggleSuperintendentSummary(false);
        renderProportionalView(regionKey, region, 'localCouncilProportional');
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

        renderNewsTab(regionKey);
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

        configurePanelTabs(['overview', 'news']);
        toggleSuperintendentSummary(false);

        const prevContainer = document.getElementById('prev-election-result');
        if (prevContainer) {
            if (!municipalities.length) {
                prevContainer.innerHTML = '<p style="color:var(--text-muted);text-align:center">광역의원 데이터가 준비 중입니다.</p>';
            } else {
                const html = [`<div class="municipality-grid">`];
                municipalities.forEach(([municipality, list]) => {
                    const totalCandidates = list.reduce((sum, c) => sum + c.candidates.length, 0);
                    const constituencyCount = list.length;
                    const partyColor = ElectionData.getPartyColor(list[0]?.leadParty || 'independent');
                    html.push(`
                        <button class="municipality-card" data-municipality="${municipality}" style="border-color:${partyColor};">
                            <div class="municipality-name">${municipality} 광역의원</div>
                            <div class="municipality-meta">${constituencyCount}개 지역구 · 후보 ${totalCandidates}명</div>
                            <div class="municipality-hint">지도를 클릭하거나 탭에서 상세보기</div>
                        </button>
                    `);
                });
                html.push(`</div>`);
                prevContainer.innerHTML = html.join('');

                prevContainer.querySelectorAll('.municipality-card').forEach(card => {
                    card.addEventListener('click', () => {
                        const municipality = card.dataset.municipality;
                        showCouncilMunicipalityDetail(regionKey, municipality);
                    });
                });
            }
        }

        const govContainer = document.getElementById('current-governor');
        if (govContainer) govContainer.innerHTML = '';
        const issuesContainer = document.getElementById('key-issues');
        if (issuesContainer) issuesContainer.innerHTML = '';

        renderNewsTab(regionKey);
    }

    function showCouncilMunicipalityDetail(regionKey, municipality) {
        const councilData = ElectionData.getCouncilData(regionKey);
        const constituencies = councilData?.municipalities?.[municipality] || [];
        const totalCandidates = constituencies.reduce((sum, c) => sum + c.candidates.length, 0);
        document.getElementById('panel-region-name').textContent = `${municipality} 광역의원`;
        document.getElementById('panel-region-info').textContent = `${constituencies.length}개 지역구 · 후보 ${totalCandidates}명`;
        configurePanelTabs(['overview', 'news']);
        toggleSuperintendentSummary(false);

        const prevContainer = document.getElementById('prev-election-result');
        if (prevContainer) {
            if (!constituencies.length) {
                prevContainer.innerHTML = '<p style="color:var(--text-muted);text-align:center">선거구 데이터가 없습니다.</p>';
            } else {
                prevContainer.innerHTML = `
                    <div class="constituency-list">
                        ${constituencies.map(c => `<button class="constituency-chip" data-constituency="${c.name}">${c.name}</button>`).join('')}
                    </div>
                    <p style="color:var(--text-muted);font-size:0.75rem;margin-top:8px">지역구를 클릭하면 후보 정보를 볼 수 있습니다.</p>
                `;
                prevContainer.querySelectorAll('.constituency-chip').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const constituencyName = btn.dataset.constituency;
                        const district = constituencies.find(c => c.name === constituencyName);
                        if (district) {
                            showCouncilConstituencyDetail(regionKey, municipality, district);
                        }
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
        const govContainer = document.getElementById('current-governor');
        if (!govContainer) return;

        document.getElementById('panel-region-name').textContent = `${municipality} ${district.name}`;
        document.getElementById('panel-region-info').textContent = `${district.seats}석 · 후보 ${district.candidates.length}명`;

        govContainer.innerHTML = `
            <div>
                <h5 style="color:var(--text-secondary);margin-bottom:8px;">${district.name} 후보</h5>
                ${district.candidates.map(c => {
                    const partyColor = ElectionData.getPartyColor(c.party);
                    return `
                        <div style="padding:8px;margin-bottom:6px;border-radius:6px;background:var(--bg-secondary);border-left:3px solid ${partyColor}">
                            <strong style="color:var(--text-primary)">${c.name}</strong>
                            <span class="party-badge" style="background:${partyColor};display:inline-block;padding:1px 6px;border-radius:3px;font-size:0.7rem;color:white;margin-left:6px">${ElectionData.getPartyName(c.party)}</span>
                            <div style="color:var(--text-muted);font-size:0.8rem;margin-top:4px">${c.career} | ${c.age}세</div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
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

        configurePanelTabs(['overview', 'news']);
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

        renderNewsTab(regionKey);
    }

    // ============================================
    // By-election Selected Handler
    // ============================================
    function onByElectionSelected(key) {
        const data = ElectionData.getByElectionData(key);
        if (!data) return;

        toggleSuperintendentSummary(false);
        const welcome = document.getElementById('panel-welcome');
        if (welcome) welcome.style.display = 'none';

        document.getElementById('panel-region-name').textContent = data.district;
        document.getElementById('panel-region-info').textContent =
            `${data.subType || '재보궐선거'} | ${data.type} | 후보 ${data.candidates.length}명`;

        configurePanelTabs(['overview', 'polls', 'candidates', 'news', 'history']);

        // Render by-election overview
        const prevContainer = document.getElementById('prev-election-result');
        if (prevContainer) {
            const prevElection = data.prevElection;
            const winColor = ElectionData.getPartyColor(prevElection.winner);
            const runColor = ElectionData.getPartyColor(prevElection.runner);
            const subTypeColor = data.subType === '보궐선거' ? '#f59e0b' : '#ef4444';

            prevContainer.innerHTML = `
                <div style="margin-bottom:12px;padding:8px 12px;border-radius:6px;background:${subTypeColor}15;border:1px solid ${subTypeColor}30;">
                    <span style="color:${subTypeColor};font-weight:600;font-size:0.85rem"><i class="fas fa-info-circle"></i> ${data.subType}</span>
                    <p style="color:var(--text-secondary);font-size:0.8rem;margin-top:4px">${data.reason}</p>
                </div>
                <h5 style="color:var(--text-secondary);margin-bottom:8px;">이전 선거 결과</h5>
                <div class="prev-result">
                    <div class="prev-winner">
                        <div class="name">${prevElection.winnerName}</div>
                        <span class="party-badge" style="background:${winColor}">${ElectionData.getPartyName(prevElection.winner)}</span>
                        <div class="rate" style="color:${winColor}">${prevElection.rate}%</div>
                    </div>
                    <div class="prev-vs">VS</div>
                    <div class="prev-winner">
                        <div class="name">${prevElection.runnerName}</div>
                        <span class="party-badge" style="background:${runColor}">${ElectionData.getPartyName(prevElection.runner)}</span>
                        <div class="rate" style="color:${runColor}">${prevElection.runnerRate}%</div>
                    </div>
                </div>
                <div class="prev-turnout">
                    <i class="fas fa-person-booth"></i> 투표율: ${prevElection.turnout}%
                </div>
            `;
        }

        // Candidates
        const govContainer = document.getElementById('current-governor');
        if (govContainer) {
            govContainer.innerHTML = `
                <h5 style="color:var(--text-secondary);margin-bottom:8px;">후보 현황</h5>
                ${data.candidates.map(c => {
                    const partyColor = ElectionData.getPartyColor(c.party);
                    return `
                        <div style="padding:8px;margin-bottom:6px;border-radius:6px;background:var(--bg-secondary);border-left:3px solid ${partyColor}">
                            <strong style="color:var(--text-primary)">${c.name}</strong>
                            <span class="party-badge" style="background:${partyColor};display:inline-block;padding:1px 6px;border-radius:3px;font-size:0.7rem;color:white;margin-left:6px">${ElectionData.getPartyName(c.party)}</span>
                            <div style="color:var(--text-muted);font-size:0.8rem;margin-top:4px">${c.career} | ${c.age}세</div>
                        </div>
                    `;
                }).join('')}
            `;
        }

        // Key issues
        const issuesContainer = document.getElementById('key-issues');
        if (issuesContainer) {
            issuesContainer.innerHTML = `<div class="issues-list">${data.keyIssues.map(issue => `<span class="issue-tag">${issue}</span>`).join('')}</div>`;
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
        const mayorData = ElectionData.getMayorData(regionKey, canonicalDistrict);

        document.getElementById('panel-region-name').textContent = `${displayDistrict} 기초단체장`;
        document.getElementById('panel-region-info').textContent =
            `기초단체장 선거 | 후보 ${mayorData ? mayorData.candidates.length : 0}명`;

        configurePanelTabs(['overview', 'polls', 'news']);

        if (mayorData) {
            const prevContainer = document.getElementById('prev-election-result');
            if (prevContainer) {
                prevContainer.innerHTML = `
                    <h5 style="color:var(--text-secondary);margin-bottom:8px;">기초단체장 후보</h5>
                    ${mayorData.candidates.map(c => {
                        const partyColor = ElectionData.getPartyColor(c.party);
                        return `
                            <div style="padding:10px;margin-bottom:6px;border-radius:8px;background:var(--bg-secondary);border-left:3px solid ${partyColor}">
                                <div style="display:flex;align-items:center;justify-content:space-between;">
                                    <div>
                                        <strong style="color:var(--text-primary)">${c.name}</strong>
                                        <span class="party-badge" style="background:${partyColor};display:inline-block;padding:1px 6px;border-radius:3px;font-size:0.7rem;color:white;margin-left:6px">${ElectionData.getPartyName(c.party)}</span>
                                    </div>
                                    <span style="color:var(--text-muted);font-size:0.8rem">${c.age}세</span>
                                </div>
                                <div style="color:var(--text-muted);font-size:0.8rem;margin-top:4px">${c.career}</div>
                            </div>
                        `;
                    }).join('')}
                `;
            }

            // Show poll bars
            const govContainer = document.getElementById('current-governor');
            if (govContainer && mayorData.polls && mayorData.polls.length > 0) {
                const latestPoll = mayorData.polls[mayorData.polls.length - 1];
                govContainer.innerHTML = `
                    <h5 style="color:var(--text-secondary);margin-bottom:8px;"><i class="fas fa-poll"></i> 최신 여론조사</h5>
                    ${mayorData.candidates.map(c => {
                        const pct = latestPoll.data[c.id] || 0;
                        const partyColor = ElectionData.getPartyColor(c.party);
                        return `
                            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                                <span style="min-width:50px;color:var(--text-primary);font-size:0.85rem">${c.name}</span>
                                <div style="flex:1;height:20px;background:var(--bg-tertiary);border-radius:4px;overflow:hidden;">
                                    <div style="height:100%;width:${pct}%;background:${partyColor};border-radius:4px;transition:width 0.5s"></div>
                                </div>
                                <span style="min-width:40px;text-align:right;color:var(--text-primary);font-weight:600;font-size:0.85rem">${pct}%</span>
                            </div>
                        `;
                    }).join('')}
                    <div style="color:var(--text-muted);font-size:0.7rem;margin-top:6px">
                        ${latestPoll.source} (${latestPoll.date}) | 표본수: ${latestPoll.sampleSize}명 | 오차범위: ±${latestPoll.margin}%p
                    </div>
                `;
            }
        }

        const issuesContainer = document.getElementById('key-issues');
        if (issuesContainer) {
            const subRegion = ElectionData.getSubRegionByName(regionKey, canonicalDistrict);
            issuesContainer.innerHTML = `<div class="issues-list"><span class="issue-tag">${subRegion?.keyIssue || '지역 현안'}</span></div>`;
        }

        switchTabForRegion();
        openPanel();

        // Update breadcrumb
        if (MapModule.updateBreadcrumb) {
            MapModule.updateBreadcrumb('district', regionKey, displayDistrict);
        }
    }

    // ============================================
    // Local Council District Detail (기초의원 시군구 선택)
    // ============================================
    function showLocalCouncilDistrictDetail(regionKey, districtName) {
        const lcData = ElectionData.getLocalCouncilData(regionKey, districtName);

        document.getElementById('panel-region-name').textContent = `${districtName} 기초의원`;
        document.getElementById('panel-region-info').textContent =
            `기초의원 선거구 ${lcData ? lcData.districts.length : 0}개 | 총 ${lcData ? lcData.totalSeats : 0}석`;

        configurePanelTabs(['overview', 'news']);

        const prevContainer = document.getElementById('prev-election-result');
        if (prevContainer && lcData) {
            let html = `<div class="local-council-districts">`;
            lcData.districts.forEach(d => {
                const partyColor = ElectionData.getPartyColor(d.leadParty);
                html += `
                    <div style="margin-bottom:12px;padding:10px;border-radius:8px;background:var(--bg-secondary);border-left:3px solid ${partyColor}">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                            <strong style="color:var(--text-primary)">${d.name}</strong>
                            <span style="color:var(--text-muted);font-size:0.8rem">${d.seats}석</span>
                        </div>
                        ${d.candidates.map(c => {
                            const cColor = ElectionData.getPartyColor(c.party);
                            return `
                                <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;font-size:0.8rem;">
                                    <span style="width:6px;height:6px;border-radius:50%;background:${cColor};flex-shrink:0"></span>
                                    <span style="color:var(--text-primary)">${c.name}</span>
                                    <span style="color:var(--text-muted);font-size:0.7rem">${ElectionData.getPartyName(c.party)}</span>
                                </div>
                            `;
                        }).join('')}
                    </div>
                `;
            });
            html += `</div>`;
            prevContainer.innerHTML = html;
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
        if (!region) return;

        // Election overview card (선거 쟁점 개요)
        const overviewCard = document.getElementById('election-overview-card');
        if (overviewCard && ElectionData.loadElectionOverview) {
            ElectionData.loadElectionOverview().then(() => {
                const ov = ElectionData.getElectionOverview(regionKey);
                if (ov) {
                    overviewCard.style.display = '';
                    const trendBadge = document.getElementById('overview-trend-badge');
                    const updatedDate = document.getElementById('overview-updated-date');
                    const headline = document.getElementById('overview-headline');
                    const summary = document.getElementById('overview-summary');
                    const issues = document.getElementById('overview-key-issues');
                    const risk = document.getElementById('overview-risk-factor');
                    if (trendBadge) trendBadge.textContent = ov.trend || '';
                    if (updatedDate) updatedDate.textContent = ElectionData._overviewCache?.meta?.lastUpdated || '';
                    if (headline) headline.textContent = ov.headline || '';
                    if (summary) summary.textContent = ov.summary || '';
                    if (issues && Array.isArray(ov.keyIssues)) {
                        issues.innerHTML = ov.keyIssues.map(i =>
                            `<span class="issue-tag"><i class="fas fa-hashtag"></i> ${i}</span>`
                        ).join('');
                    }
                    if (risk && ov.riskFactor) {
                        risk.innerHTML = `<i class="fas fa-exclamation-triangle"></i> <strong>핵심 변수:</strong> ${ov.riskFactor}`;
                    }
                } else {
                    overviewCard.style.display = 'none';
                }
            });
        }

        // Previous election result
        const prevContainer = document.getElementById('prev-election-result');
        if (prevContainer) {
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
                <div class="prev-turnout">
                    <i class="fas fa-person-booth"></i> 투표율: ${prev.turnout}%
                </div>
            `;
        }

        // Current governor
        const govContainer = document.getElementById('current-governor');
        if (govContainer) {
            const gov = (ElectionData.getCurrentOfficeholder && ElectionData.getCurrentOfficeholder(regionKey, 'governor')) || region.currentGovernor;
            if (!gov) {
                govContainer.innerHTML = '';
            } else {
                const govColor = ElectionData.getPartyColor(gov.party);
                const sinceText = Number.isFinite(Number(gov.since)) ? ` ${gov.since}년~` : '';
                const statusText = gov.acting ? ' 권한대행' : ' 재임중';
                govContainer.innerHTML = `
                    <div class="governor-info">
                        <div class="governor-avatar" style="background:${govColor}">
                            ${gov.name.charAt(0)}
                        </div>
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
            default:
                return null;
        }
    }

    function getCandidateSourceLabel(source) {
        switch (source) {
            case 'news':
                return '뉴스 기준';
            case 'poll':
                return '여론조사 기준';
            default:
                return '';
        }
    }

    function buildCandidateTabModel(regionKey) {
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
                    statusMeta: getCandidateStatusMeta(candidate.status),
                    sourceLabel: getCandidateSourceLabel(candidate.dataSource),
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
                    supportLabel: Number.isFinite(Number(candidate.support)) ? `최근 조사 ${Number(candidate.support).toFixed(1)}%` : '',
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
                    career: '실측 여론조사 기반 후보명',
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
                <div style="font-size:0.72rem;color:var(--text-muted);margin-top:3px;">${candidate.badgeLabel}</div>
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
            ${model.candidates.map((candidate) => `
                <div class="candidate-card-full">
                    <div class="candidate-header">
                        <div class="candidate-avatar" style="background:${candidate.badgeColor}">
                            ${candidate.name?.charAt(0) || '?'}
                        </div>
                        <div style="flex:1;min-width:0;">
                            <div class="candidate-info">
                                <span class="candidate-name">${candidate.name}</span>
                                ${candidate.age ? `<span class="candidate-age">${candidate.age}세</span>` : ''}
                                <span class="party-badge" style="background:${candidate.badgeColor};display:inline-block;padding:1px 6px;border-radius:3px;font-size:0.72rem;color:white;">${candidate.badgeLabel}</span>
                            </div>
                            <div class="candidate-career">${candidate.career || '경력 정보 집계 중'}</div>
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
                        ${candidate.sourceLabel ? `<span class="cand-source-badge"><i class="fas fa-database"></i>${candidate.sourceLabel}</span>` : ''}
                    </div>
                </div>
            `).join('')}
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
            return '시군구를 선택하면 후보 정보는 확인할 수 있지만, 기초단체장 역대 비교 데이터는 아직 준비 중입니다.';
        }
        if (currentElectionType === 'mayor') {
            return '기초단체장 역대 비교 데이터는 아직 준비 중입니다.';
        }
        return '현재 선택한 선거 유형의 역대 비교 데이터가 없습니다.';
    }

    function truncatePartyLabel(label) {
        const text = String(label || '');
        return text.length > 7 ? `${text.slice(0, 7)}…` : text;
    }

    function getHistoryBlocKey(partyKey) {
        if (partyKey === 'democratic') return 'democratic';
        if (partyKey === 'ppp') return 'ppp';
        if (partyKey === 'independent') return 'independent';
        return 'other';
    }

    function getHistoryBlocLabel(blocKey) {
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
            : [];

        if (!history.length) {
            destroyHistoryComparisonChart();
            canvas.style.display = 'none';
            emptyEl.style.display = '';
            emptyEl.innerHTML = buildEmptyTabMessage(getHistoryEmptyMessage(), 'fa-clock-rotate-left');
            if (chartCardTitle) {
                chartCardTitle.innerHTML = '<i class="fas fa-chart-area"></i> 역대 비교 그래프';
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
        const historyBlocPalette = {
            democratic: '#60a5fa',
            ppp: '#f87171',
            other: '#a78bfa',
            independent: '#94a3b8'
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
                    const winnerPartyLabel = truncatePartyLabel(entry.winnerPartyLabel || ElectionData.getHistoricalPartyName(entry.winner, entry.election));
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

        resultsEl.innerHTML = `
            <div class="ht-table">
                <div class="ht-header">
                    <div>회차</div>
                    <div>당선</div>
                    <div>2위</div>
                    <div>득표율</div>
                </div>
                ${history.map((entry) => {
                    const winnerColor = ElectionData.getPartyColor(entry.winner);
                    const runnerColor = ElectionData.getPartyColor(entry.runner || 'independent');
                    const winnerParty = entry.winnerPartyLabel || ElectionData.getHistoricalPartyName(entry.winner, entry.election);
                    const runnerParty = entry.runnerPartyLabel || ElectionData.getHistoricalPartyName(entry.runner, entry.election);
                    const gap = Math.max(0, (Number(entry.rate) || 0) - (Number(entry.runnerRate) || 0)).toFixed(1);
                    return `
                        <div class="ht-row">
                            <div class="ht-col-election">
                                <span class="ht-badge" style="background:${winnerColor}">민선 ${entry.election}기</span>
                                <span class="ht-year">${entry.year}</span>
                            </div>
                            <div class="ht-col-winner">
                                <span class="ht-name">${entry.winnerName}</span>
                                <span class="ht-party-tag" style="color:${winnerColor}">${winnerParty}</span>
                            </div>
                            <div class="ht-col-runner">
                                <span class="ht-name ht-runner-name">${entry.runnerName || '-'}</span>
                                <span class="ht-party-tag" style="color:${runnerColor}">${entry.runner ? runnerParty : '무투표'}</span>
                            </div>
                            <div class="ht-col-bar">
                                <div class="ht-bar-group">
                                    <div class="ht-bar-row">
                                        <div class="ht-bar" style="width:${Math.max(4, Number(entry.rate) || 0)}%;background:${winnerColor}"></div>
                                        <span class="ht-bar-val">${Number(entry.rate).toFixed(1)}%</span>
                                    </div>
                                    <div class="ht-bar-row">
                                        <div class="ht-bar" style="width:${Math.max(4, Number(entry.runnerRate) || 0)}%;background:${runnerColor}"></div>
                                        <span class="ht-bar-val ht-bar-sub">${Number(entry.runnerRate || 0).toFixed(1)}%</span>
                                    </div>
                                </div>
                                <div class="ht-gap">격차 ${gap}%p · 투표율 ${Number(entry.turnout || 0).toFixed(1)}%</div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;

        destroyHistoryComparisonChart();
        canvas.style.display = '';
        canvas.height = 220;
        emptyEl.style.display = 'none';
        if (chartCardTitle) {
            chartCardTitle.innerHTML = '<i class="fas fa-chart-area"></i> 정당 계열 득표율 변화';
        }
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
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    legend: {
                        labels: {
                            color: '#cbd5e1',
                            usePointStyle: true,
                            boxWidth: 10
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(26, 34, 54, 0.95)',
                        borderColor: 'rgba(59, 130, 246, 0.3)',
                        borderWidth: 1,
                        padding: 10,
                        cornerRadius: 8,
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
                        ticks: { color: '#94a3b8' },
                        grid: { color: 'rgba(148,163,184,0.08)' }
                    },
                    y: {
                        min: yMin,
                        max: yMax,
                        ticks: {
                            color: '#94a3b8',
                            callback: (value) => `${value}%`,
                            stepSize: 10
                        },
                        grid: { color: 'rgba(148,163,184,0.08)' }
                    }
                }
            }
        });
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
                    <div class="district-detail-label">기초의원 의석(추정)</div>
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
            <div class="district-detail-meta">${summary.unknown ? '해당 시군구 데이터는 준비 중입니다.' : '본 정보는 모의 데이터이며 지역별 추정치로 표시됩니다.'}</div>
        `;
        detail.classList.add('active');
    }

    // ============================================
    // News Tab (#8 실시간 뉴스)
    // ============================================
    function renderNewsTab(regionKey) {
        const container = document.getElementById('news-feed');
        if (!container) return;

        const region = ElectionData.getRegion(regionKey);
        if (!region) return;

        const mainSearchUrl = ElectionData.getNewsSearchUrl(regionKey);
        const regionName = region.name;
        const governorQueryBase = getGovernorQueryBase(regionName);
        const governorFocusTerms = getGovernorFocusTerms(regionName, governorQueryBase);
        const governorRoleTerms = getGovernorRoleTerms(regionName, governorQueryBase);

        const categories = buildNewsCategories(regionKey, regionName, governorQueryBase, governorFocusTerms, governorRoleTerms);

        let html = `
            <div class="news-live">
                <div class="news-live-header">
                    <div class="news-live-title"><i class="fas fa-bolt"></i> 최신 뉴스 6건</div>
                    <div class="news-live-actions" id="news-live-actions">
                        ${categories.map((cat, idx) => `
                            <button class="news-live-btn ${idx === 0 ? 'active' : ''}" data-query="${cat.query}" data-idx="${idx}">
                                ${cat.label}
                            </button>
                        `).join('')}
                    </div>
                </div>
                <div class="news-live-list" id="news-live-list"></div>
            </div>
            <a href="${mainSearchUrl}" target="_blank" rel="noopener" class="news-search-link">
                <i class="fas fa-search"></i>
                ${regionName} 최신 선거 뉴스 보기 (네이버 뉴스)
            </a>
            <div class="news-notice">
                <i class="fas fa-info-circle"></i>
                <span>최신 기사 기준으로 가져오되, 주요 언론사 기사를 우선 노출합니다. 링크를 클릭해 <strong>${regionName}</strong> 관련 뉴스를 원문으로 확인하세요.</span>
            </div>
        `;

        container.innerHTML = html;
        setupLatestNews(regionName, categories);
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

        if (tuned.categoryId === 'all') {
            tuned.altQueries = mergeUniqueArrays(tuned.altQueries, [
                `${governorQueryBase} 지방선거`,
                `${regionName} 광역단체장 선거`,
                topIssues[0] ? `${governorQueryBase} ${topIssues[0]}` : ''
            ].filter(Boolean));
        } else if (tuned.categoryId === 'poll') {
            tuned.altQueries = mergeUniqueArrays(tuned.altQueries, [
                `${governorQueryBase} 여론조사`,
                `${regionName} 지지율 여론조사`,
                topIssues[0] ? `${governorQueryBase} ${topIssues[0]} 여론조사` : ''
            ].filter(Boolean));
        } else if (tuned.categoryId === 'candidate') {
            tuned.altQueries = mergeUniqueArrays(tuned.altQueries, [
                `${governorQueryBase} 유세`,
                `${regionName} 지사 후보 동향`,
                topActors[0] ? `${governorQueryBase} ${topActors[0]} 방문` : ''
            ].filter(Boolean));
        } else if (tuned.categoryId === 'policy') {
            tuned.altQueries = mergeUniqueArrays(tuned.altQueries, [
                `${governorQueryBase} 공약`,
                `${regionName} 도정 공약`,
                topIssues[0] ? `${governorQueryBase} ${topIssues[0]} 공약` : '',
                topIssues[1] ? `${governorQueryBase} ${topIssues[1]} 정책` : ''
            ].filter(Boolean));
        }

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

        return templates.map((tpl) => {
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

    function setupLatestNews(regionName, categories) {
        const actionWrap = document.getElementById('news-live-actions');
        const list = document.getElementById('news-live-list');
        if (!actionWrap || !list) return;
        const safeCategories = Array.isArray(categories) && categories.length
            ? categories
            : [{ query: `${regionName} 지방선거`, focusKeywords: [] }];

        actionWrap.addEventListener('click', (e) => {
            const btn = e.target.closest('.news-live-btn');
            if (!btn) return;
            actionWrap.querySelectorAll('.news-live-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const idx = Number(btn.dataset.idx || 0);
            const selected = safeCategories[idx] || safeCategories[0];
            fetchLatestNews(selected);
        });

        fetchLatestNews(safeCategories[0]);
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

        const hasAny = (words) => Array.isArray(words) && words.some(w => text.includes(String(w).toLowerCase()));
        const pollText = `${item.title || ''} ${item.description || ''}`;
        const percentMatches = pollText.match(/[0-9]{1,2}(?:\.[0-9])?\s?%/g) || [];
        const hasPercentPattern = /([0-9]{1,2}(\.[0-9])?\s?%|[0-9]{1,2}\.[0-9]\s?%p|오차범위|표본오차|응답률|표본\s?[0-9])/i.test(pollText);
        const hasLocalChiefPattern = /[가-힣]{2,}(시장|군수|구청장)/.test(pollText);
        const hasPollCoreKeyword = /여론조사|지지율|지지도|가상대결|양자대결|다자대결|정당지지율|후보별/i.test(pollText);
        const hasPollMethodology = /표본오차|오차범위|응답률|신뢰수준|전화면접|ars|무선|유선|조사기관|표본수|조사기간|조사일시/i.test(pollText);
        const hasPollAgency = /리얼미터|한국갤럽|갤럽|nbs|한국리서치|엠브레인|코리아리서치|케이스탯리서치|입소스|넥스트리서치|조원씨앤아이|미디어토마토|한길리서치/i.test(pollText);
        const hasNonElectionSurveyContext = /검찰 조사|경찰 조사|감사 조사|실태조사|전수조사|진상조사|역학조사|교육청 조사|수사/i.test(pollText);

        if (hasAny(strict.excludeAny)) return { ok: false, score: 0 };
        if (!hasAny(strict.mustAny)) return { ok: false, score: 0 };
        if (!hasAny(strict.targetAny)) return { ok: false, score: 0 };
        if (strict.requiredGovernorAny && !hasAny(strict.requiredGovernorAny)) return { ok: false, score: 0 };
        if (strict.requiredGovernorRoleAny && !hasAny(strict.requiredGovernorRoleAny)) return { ok: false, score: 0 };
        if (strict.requiredRegionAny && !hasAny(strict.requiredRegionAny)) return { ok: false, score: 0 };
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
            const requiredEvidence = mode === 'relaxed' ? 2 : 3;
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

        return { ok: true, score };
    }

    async function fetchLatestNews(category) {
        const list = document.getElementById('news-live-list');
        if (!list) return;
        const query = category?.query || '';
        const selectedCategory = category || { query: '', focusKeywords: [] };
        const maxAgeDays = Number.isFinite(Number(selectedCategory.maxAgeDays)) ? Number(selectedCategory.maxAgeDays) : 45;
        const preferPopularity = !!selectedCategory.preferPopularity;
        const queryCandidates = Array.from(new Set([query, ...(selectedCategory.altQueries || [])].filter(Boolean)));

        list.innerHTML = '<div class="district-no-data"><p>최신 뉴스를 불러오는 중...</p></div>';

        try {
            const fetchedItems = [];
            const sortModes = preferPopularity ? ['date', 'sim'] : ['date'];
            for (const q of queryCandidates) {
                for (const sort of sortModes) {
                    const url = `${NEWS_PROXY_BASE}/api/news?query=${encodeURIComponent(q)}&display=50&sort=${sort}`;
                    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
                    let data = null;
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
            const runFilter = (mode, dayLimit) => {
                const matched = fetchedItems.map(item => {
                    const m = evaluateCategoryMatch(item, selectedCategory, mode);
                    return { item, relevance: m.score, ok: m.ok };
                }).filter(x => x.ok);

                const normalizeTitleKey = (title) => String(title || '').toLowerCase().replace(/\s+/g, ' ').trim();
                const dedup = new Map();
                matched.forEach(({ item, relevance }) => {
                    const title = sanitizeHtml(item.title || '');
                    const origin = sanitizeHtml(item.originallink || item.link || '');
                    const host = getHostFromUrl(origin);
                    const publishedAt = item.pubDate ? Date.parse(item.pubDate) : 0;
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

                const items = Array.from(dedup.values());
                const rankToScore = (rank) => {
                    if (!rank) return 0;
                    return Math.max(0, 1 - (Math.min(50, rank) - 1) / 49);
                };

                if (preferPopularity) {
                    items.forEach((item) => {
                        const ageDays = (Date.now() - item.publishedAt) / (1000 * 60 * 60 * 24);
                        const recencyScore = Math.max(0, 1 - (ageDays / Math.max(1, dayLimit)));
                        const simScore = rankToScore(item.simRank);
                        const dateScore = rankToScore(item.dateRank);
                        const relevanceScore = Math.min(1, item.relevance / 8);
                        const majorBoost = isMajorOutlet(item.host) ? 0.05 : 0;
                        item.rankScore = (simScore * 0.5) + (recencyScore * 0.25) + (dateScore * 0.1) + (relevanceScore * 0.15) + majorBoost;
                    });
                    items.sort((a, b) => (b.rankScore - a.rankScore) || (b.relevance - a.relevance) || (b.publishedAt - a.publishedAt));
                    return items;
                }

                items.sort((a, b) => (b.relevance - a.relevance) || (b.publishedAt - a.publishedAt));
                const majorItems = items.filter(item => isMajorOutlet(item.host));
                const otherItems = items.filter(item => !isMajorOutlet(item.host));
                return [...majorItems, ...otherItems];
            };

            let selectedItems = runFilter('strict', maxAgeDays).slice(0, 6);
            if (selectedItems.length < 3) {
                selectedItems = runFilter('relaxed', maxAgeDays).slice(0, 6);
            }

            if (!selectedItems.length) {
                list.innerHTML = `<div class="district-no-data"><p>선택한 카테고리에 맞는 최신 뉴스가 없습니다.</p><p style="margin-top:6px;color:var(--text-muted);font-size:0.8rem">최근 ${maxAgeDays}일(엄격) + 완화 규칙으로 재조회했습니다.</p></div>`;
                return;
            }

            list.innerHTML = selectedItems.map(item => {
                const press = item.host || '출처 미상';
                return `
                    <a class="news-live-item" href="${item.link}" target="_blank" rel="noopener" title="${item.title}">
                        <div class="news-live-item-title" title="${item.title}">${item.title}</div>
                        <div class="news-live-item-meta">${press} · ${item.pubDateLabel}</div>
                    </a>
                `;
            }).join('');
        } catch (err) {
            const message = err?.message || '';
            const missingKey = message.includes('Missing NAVER_CLIENT_ID/NAVER_CLIENT_SECRET');
            const helpText = missingKey
                ? 'NAVER_CLIENT_ID/NAVER_CLIENT_SECRET 환경변수를 설정한 뒤 뉴스 프록시를 다시 실행하세요.'
                : '뉴스 프록시 서버(기본 http://localhost:8787) 실행 상태를 확인하세요.';
            list.innerHTML = `<div class="district-no-data"><p>뉴스를 불러오지 못했습니다.</p><p style="margin-top:6px;color:var(--text-muted);font-size:0.8rem">${helpText}</p></div>`;
        }
    }

    function renderLatestPolls(regionKey) {
        const container = document.getElementById('latest-polls-list');
        if (!container) return;

        const all = Array.isArray(ElectionData.latestPolls) ? ElectionData.latestPolls : [];
        if (!all.length) {
            container.innerHTML = '<div class="district-no-data"><p>최신 등록현황 데이터가 없습니다.</p></div>';
            return;
        }

        const region = ElectionData.getRegion(regionKey);
        const regionName = region?.name || '';
        const filtered = regionName
            ? all.filter(item => String(item.title || '').includes(regionName))
            : [];
        const sorted = (filtered.length ? filtered : all)
            .slice()
            .sort((a, b) => (b.date_range || '').localeCompare(a.date_range || ''));
        const list = sorted.slice(0, 10);

        container.innerHTML = list.map(item => {
            const title = item.title || '제목 없음';
            const org = item.poll_org || '조사기관 미상';
            const date = item.date_range || '일시 미상';
            const url = item.url || '#';
            return `
                <a class="latest-poll-item" href="${url}" target="_blank" rel="noopener">
                    <div class="latest-poll-title">${title}</div>
                    <div class="latest-poll-meta">
                        <span>${org}</span>
                        <span>${date}</span>
                    </div>
                </a>
            `;
        }).join('');
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
            altQueries: [`${canonicalDistrict} 기초단체장 선거`, `${officeLabel} 공약`, `${officeLabel} 후보`],
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
        const knownNames = new Set(
            forceTrend && supplementalPollNames.length >= 2
                ? mergeUniqueArrays(supplementalPollNames, officialFallbackNames)
                : officialFallbackNames.length
                    ? officialFallbackNames
                    : mergeUniqueArrays(officialFallbackNames, supplementalPollNames)
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
    return {
        onRegionSelected,
        onDistrictSelected,
        onSubdistrictSelected,
        onByElectionSelected,
        onBreadcrumbNational,
        closePanel,
        switchTab,
        getElectionType: () => currentElectionType,
        __debug: {
            evaluateNewsCase,
            buildNewsQueryPlan,
            buildPollSelection
        }
    };
})();
