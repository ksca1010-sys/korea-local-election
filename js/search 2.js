/**
 * SearchModule — 검색 시스템 (app.js에서 추출)
 * 지역 × 선거유형 검색 인덱스 + 읍면동 검색 + 모바일 오버레이
 */
const SearchModule = (() => {

    // ============================================
    // Search Index & Variables
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
            if (electionType && electionType !== AppState.currentElectionType) {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                const targetBtn = document.querySelector(`.filter-btn[data-type="${electionType}"]`);
                if (targetBtn) targetBtn.classList.add('active');
                AppState.currentElectionType = electionType;
                Sidebar.updateElectionTypeLabel(electionType);
                if (MapModule && MapModule.setElectionType) {
                    MapModule.setElectionType(electionType);
                }
                Sidebar.toggleByelectionNote(electionType === 'byElection');
            }

            // 지역 이동
            AppState.currentRegionKey = regionKey;

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
                                    App.onConstituencySelected?.(regionKey, subDistrict, distName);
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
                                    App.onConstituencySelected?.(regionKey, subDistrict, distName);
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
                    ElectionViews.showMayorDistrictDetail(regionKey, subDistrict);
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
            App.trackEvent('search', {
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
            if (electionType && electionType !== AppState.currentElectionType) {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                const targetBtn = document.querySelector(`.filter-btn[data-type="${electionType}"]`);
                if (targetBtn) targetBtn.classList.add('active');
                AppState.currentElectionType = electionType;
                Sidebar.updateElectionTypeLabel(electionType);
                if (MapModule && MapModule.setElectionType) {
                    MapModule.setElectionType(electionType);
                }
                Sidebar.toggleByelectionNote(electionType === 'byElection');
            }

            // 2) 시도 선택 → 시군구가 있으면 선거유형별 드릴다운
            setTimeout(() => {
                if (!subDistrict) {
                    // 시도 레벨 선거 — 지도 선택 + 패널 표시
                    // MapModule.selectRegion이 지도 줌 + App.onRegionSelected 호출
                    if (MapModule && MapModule.selectRegion) {
                        MapModule.selectRegion(regionKey);
                    } else {
                        App.onRegionSelected(regionKey);
                    }
                    return;
                }

                AppState.currentRegionKey = regionKey;

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
                    App.onByElectionSelected(subDistrict);

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
                        ElectionViews.showMayorDistrictDetail(regionKey, subDistrict);
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

        // ── 모바일 전체화면 검색 오버레이 ──
        const mobileOverlay = document.getElementById('mobile-search-overlay');
        const mobileInput = document.getElementById('mobile-search-input');
        const mobileResults = document.getElementById('mobile-search-results');
        const mobileSearchToggle = document.getElementById('mobile-search-toggle');
        const mobileSearchClose = document.getElementById('mobile-search-close');

        if (mobileOverlay && mobileInput && mobileResults) {
            function openMobileSearch() {
                mobileOverlay.classList.add('active');
                mobileInput.value = '';
                mobileResults.innerHTML = '';
                requestAnimationFrame(() => mobileInput.focus());
            }
            function closeMobileSearch() {
                mobileOverlay.classList.remove('active');
                mobileInput.blur();
                mobileResults.innerHTML = '';
            }

            if (mobileSearchToggle) mobileSearchToggle.addEventListener('click', openMobileSearch);
            if (mobileSearchClose) mobileSearchClose.addEventListener('click', closeMobileSearch);

            // 뒤로가기(popstate) / Escape 시 모바일 검색 닫기
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && mobileOverlay.classList.contains('active')) {
                    closeMobileSearch();
                }
            });

            // 모바일 입력 → 데스크톱 검색 엔진 사용 → 결과 복제
            let mobileDebounce = null;
            mobileInput.addEventListener('input', () => {
                clearTimeout(mobileDebounce);
                mobileDebounce = setTimeout(() => {
                    const q = mobileInput.value.trim();
                    // 데스크톱 input에 값 설정하고 doSearch 호출
                    input.value = q;
                    doSearch(q);
                    // 결과를 모바일 오버레이로 복제
                    mobileResults.innerHTML = results.innerHTML;
                    // 데스크톱 드롭다운은 숨김
                    results.classList.remove('active');
                }, 80);
            });

            // 모바일 결과 항목 클릭
            mobileResults.addEventListener('click', (e) => {
                const item = e.target.closest('.search-result-item');
                if (!item) return;
                // 데스크톱 input 값 동기화 (dong modal 등에서 필요)
                input.value = mobileInput.value.trim();
                selectItem(item);
                closeMobileSearch();
            });

            // 모바일 Enter 키
            mobileInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.isComposing) {
                    e.preventDefault();
                    clearTimeout(mobileDebounce);
                    input.value = mobileInput.value.trim();
                    doSearch(input.value);
                    handleEnterSelect();
                    closeMobileSearch();
                }
            });
        }
    }

    return {
        setupSearch,
        invalidateSearchIndex,
        buildSearchIndex,
    };

})();
