// ============================================
// News Tab — 실시간 뉴스 탭 렌더링
// app.js에서 분리됨
// ============================================

const NewsTab = (() => {

    // 세대 카운터: 지역/선거유형 전환 시 이전 fetch 결과 무시
    let _renderGeneration = 0;

    // ── 상수 ──
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

    // ── 뉴스 캐시 (sessionStorage) ──
    const _newsCachePrefix = 'news_cache_';
    let _currentElectionType = '';

    // ── 카테고리 빌더 함수들 ──

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
        // 국회의원 재보궐 뉴스 혼입 방지
        const excludeNational = ['국회', '총선', '보궐', '재보궐', '재선거', '국회의원'];
        return [
            {
                label: '전체', icon: 'fas fa-newspaper', categoryId: 'all',
                query: `"${regionName}" 비례대표 지방선거 정당`,
                maxAgeDays: 60,
                altQueries: [`${regionName} 비례대표 공천 정당 지방의회`],
                focusKeywords: ['비례대표', '정당', '명부', '공천', '지방의회'],
                strict: { mustAny: ['비례대표', '비례'], targetAny: [regionName, '지방선거', '지방의회'], excludeAny: excludeNational },
                relaxed: { mustAny: ['비례대표', '비례'], targetAny: ['지방선거', '지방의회'], excludeAny: excludeNational }
            },
            {
                label: '정당 지지율', icon: 'fas fa-chart-pie', categoryId: 'partySupport',
                query: `"${regionName}" 정당지지율 지방선거`,
                maxAgeDays: 60,
                altQueries: [`${regionName} 정당 지지율 지방선거`],
                focusKeywords: ['정당지지율', '정당지지도', '정당'],
                strict: { mustAny: ['정당지지율', '정당지지도', '정당 지지'], targetAny: [regionName], excludeAny: excludeNational.concat(['대선']) },
                relaxed: { mustAny: ['정당', '지지율'], targetAny: [regionName], excludeAny: excludeNational.concat(['대선']) }
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
        // 동명 지역 혼입 방지: 광역 약칭 추출 (예: "부산광역시" → "부산")
        const regionShort = (regionName || '').replace(/(특별시|광역시|특별자치시|특별자치도|도)$/, '');
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

        // 동명 시군구 판별 — 구/동/남/북/서/중구 등 여러 광역에 존재하는 이름
        const ambiguousNames = ['강서구','동구','남구','북구','서구','중구','달서구','수영구','사하구','연수구','부평구','계양구'];
        const needsRegionFilter = ambiguousNames.includes(districtName);
        const strictMustAny = needsRegionFilter ? [districtName, regionShort] : [districtName];

        return [
            {
                label: '전체', icon: 'fas fa-newspaper', categoryId: 'all',
                query: `${regionShort} ${districtName}${title} 선거 후보`,
                maxAgeDays: 60,
                altQueries: [
                    `${districtName}${title} 출마 예비후보`,
                    ...candQueries.slice(0, 1)
                ].filter(Boolean),
                focusKeywords: [districtName, title, '선거', '후보', '출마', '예비후보', '출판기념회'],
                boostHosts: localHosts,
                strict: { mustAny: strictMustAny, targetAny: [title, '선거', '후보', '출마', '예비후보', '공천', '출판기념회'], excludeAny: ['도지사', '교육감', '국회의원'] },
                relaxed: { mustAny: [districtName], targetAny: [title, '선거'], excludeAny: ['도지사', '교육감'] }
            },
            {
                label: '여론조사', icon: 'fas fa-chart-bar', categoryId: 'polls',
                query: `${regionShort} ${districtName}${title} 여론조사`,
                maxAgeDays: 60,
                altQueries: [
                    `${districtName}${title} 지지율 가상대결`
                ],
                focusKeywords: ['여론조사', '지지율', '적합도', '가상대결', districtName],
                boostHosts: localHosts,
                strict: { mustAny: strictMustAny, targetAny: ['여론조사', '지지율', '적합도', '가상대결'], excludeAny: ['도지사', '교육감'] },
                relaxed: { mustAny: [districtName], targetAny: ['여론조사', '지지율'], excludeAny: ['도지사', '교육감'] }
            },
            {
                label: '후보·인물', icon: 'fas fa-user', categoryId: 'candidates',
                query: `${regionShort} ${districtName}${title} 후보 출마`,
                maxAgeDays: 60,
                altQueries: [
                    `${districtName}${title} 공천 경선 예비후보`,
                    ...candQueries.slice(0, 1)
                ].filter(Boolean),
                focusKeywords: [districtName, title, '후보', '출마', '공천', '예비후보', '출판기념회', '경선', ...districtCandidates],
                boostHosts: localHosts,
                strict: { mustAny: strictMustAny, targetAny: ['후보', '출마', '공천', '예비후보', '출판기념회', title, ...districtCandidates], excludeAny: ['도지사', '교육감', '국회의원'] },
                relaxed: { mustAny: [districtName], targetAny: [title, '후보', '출마'], excludeAny: ['도지사', '교육감'] }
            },
            {
                label: '공약·정책', icon: 'fas fa-scroll', categoryId: 'policy',
                query: `${regionShort} ${districtName}${title} 공약 정책`,
                maxAgeDays: 60,
                altQueries: [
                    `${districtName}${title} 공약 현안 비전`
                ],
                focusKeywords: [districtName, '공약', '정책', '현안', '비전', ...issueKeywords.slice(0, 3)],
                boostHosts: localHosts,
                strict: { mustAny: strictMustAny, targetAny: ['공약', '정책', '현안', '비전', title, ...issueKeywords.slice(0, 3)], excludeAny: ['도지사', '교육감'] },
                relaxed: { mustAny: [districtName], targetAny: ['공약', '정책'], excludeAny: ['도지사', '교육감'] }
            },
        ].map(cat => ({
            ...cat, localMediaPriority: true, _regionKey: regionKey, _districtName: districtName, boostWeight: 5,
            preferPopularity: true,
            scoreWeightsOverride: { time: 0.22, relevance: 0.18, credibility: 0.06, locality: 0.48, engagement: 0.06 }
        }));
    }

    // ── 쿼리 헬퍼 ──

    function getGovernorQueryBase(regionName) {
        if (!regionName) return '';
        const aliasTerms = getRegionAliasTerms(regionName);
        const shortAlias = aliasTerms.find((name) => /^[가-힣]{2,3}$/.test(name)) || aliasTerms[0] || regionName;
        if (regionName.includes('세종')) return '세종시장';
        if (regionName.endsWith('도') || regionName.includes('특별자치도')) {
            if (shortAlias === '제주') return '제주지사';
            // 강원특별자치도/전북특별자치도 → "강원지사"/"전북지사" (2023년~ 명칭 변경)
            if (regionName.includes('특별자치도')) return `${shortAlias}지사`;
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

    // ── 데이터 헬퍼 ──

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

    // ── 설정·빌더 ──

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

    // ── 뉴스 Setup ──

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

    // ── 유틸리티 ──

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

    // ── 필터 ──

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

        if (category?.categoryId === 'polls' && !hasPercentPattern) {
            return { ok: false, score: 0 };
        }
        if (category?.categoryId === 'polls' && hasNonElectionSurveyContext) {
            return { ok: false, score: 0 };
        }
        if (category?.categoryId === 'polls') {
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

    // ── 캐시 ──

    function _newsCacheKey(regionKey, catId) { return `${_newsCachePrefix}${_currentElectionType}_${regionKey}_${catId || 'all'}`; }

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

    // ── Fetch ──

    async function fetchLatestNews(category, regionKey) {
        const list = document.getElementById('news-live-list');
        if (!list) return;

        // 비동기 완료 시 세대가 바뀌었으면 DOM 업데이트 건너뜀
        const fetchGen = _renderGeneration;

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
            // 세대 바뀌었으면 결과 폐기 (race condition 방지)
            if (fetchGen !== _renderGeneration) return;

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
                    // 시군구 매체 — districtName 파라미터 사용
                    const dn = selectedCategory._districtName || null;
                    if (dn) {
                        const muni = pool.municipal?.[dn];
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
                    const dn = selectedCategory._districtName || null;
                    if (!pool || !dn) return new Set();
                    const muni = pool.municipal?.[dn];
                    const hosts = new Set();
                    if (muni?.hosts) muni.hosts.forEach(h => hosts.add(h));
                    return hosts;
                })();
                const isDistrictMedia = (host) => {
                    if (!host || districtHosts.size === 0) return false;
                    return [...districtHosts].some(h => host === h || host.endsWith(`.${h}`));
                };

                // BUG FIX: was `if (preferPopularity)` — undeclared variable; use selectedCategory.preferPopularity
                if (selectedCategory.preferPopularity) {
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

            // 정렬 토글 (onclick으로 교체하여 리스너 누적 방지)
            const sortToggle = document.getElementById('news-sort-toggle');
            if (sortToggle) {
                sortToggle.onclick = (e) => {
                    const btn = e.target.closest('.news-sort-btn');
                    if (!btn) return;
                    sortToggle.querySelectorAll('.news-sort-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    currentSort = btn.dataset.sort;
                    showCount = 6;
                    refreshList();
                };
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

    // ── 디버그/미디어 번들 ──

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

    // ── 메인 render 함수 ──

    function render(regionKey, electionType, districtName) {
        if (typeof ElectionData === 'undefined') return;
        const container = document.getElementById('news-feed');
        if (!container) { console.warn('[뉴스] news-feed 컨테이너 없음'); return; }

        // 세대 카운터 증가 — 이전 비동기 fetch 결과 무시용
        const gen = ++_renderGeneration;
        _currentElectionType = electionType || '';

        const region = ElectionData.getRegion(regionKey);
        if (!region && electionType !== 'byElection') return;

        let regionName = region?.name || '';
        if (electionType === 'byElection' && districtName) {
            const byeData = ElectionData.getByElectionData(districtName);
            regionName = byeData?.district || districtName;
        }
        let categories;

        if (electionType === 'byElection' && districtName) {
            // 재보궐: byelection key에서 지역구명 가져오기
            const byeData = ElectionData.getByElectionData(districtName);
            const distName = byeData?.district || districtName;
            const exactDist = `"${distName}"`;
            // 총선·대선·전당대회 관련 기사 혼입 방지 (지역구명이 총선 기사에도 등장하므로)
            const byeExclude = ['총선', '대선', '대통령', '전당대회', '당대표', '원내대표', '당권'];
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
        } else if (electionType === 'superintendent') {
            categories = buildSuperintendentNewsCategories(regionKey, regionName);
        } else if (electionType === 'mayor' && districtName) {
            categories = buildMayorNewsCategories(regionKey, regionName, districtName);
        } else if (electionType === 'council' || electionType === 'localCouncil') {
            categories = buildCouncilNewsCategories(regionKey, regionName, electionType);
        } else if (electionType === 'councilProportional' || electionType === 'localCouncilProportional') {
            categories = buildProportionalNewsCategories(regionKey, regionName, electionType);
        } else {
            const governorQueryBase = getGovernorQueryBase(regionName);
            const governorFocusTerms = getGovernorFocusTerms(regionName, governorQueryBase);
            const governorRoleTerms = getGovernorRoleTerms(regionName, governorQueryBase);
            categories = buildNewsCategories(regionKey, regionName, governorQueryBase, governorFocusTerms, governorRoleTerms);
        }

        let html = `
            <div class="news-live">
                <div class="news-info-bar" style="padding:8px 12px;margin-bottom:8px;border-radius:6px;background:var(--bg-tertiary);font-size:0.75rem;line-height:1.6;color:var(--text-muted);">
                    <div style="margin-bottom:4px;color:var(--text-secondary);"><i class="fas fa-filter" style="margin-right:4px;"></i>지역 밀착 뉴스를 우선 제공합니다 — 복합 점수 정렬 <a href="#" onclick="document.getElementById('news-scoring-modal')?.classList.add('open'); return false;" style="color:var(--accent-blue);text-decoration:none;font-weight:600;">더 알아보기</a></div>
                    <div><i class="fas fa-info-circle" style="margin-right:4px;"></i>아래 뉴스는 네이버 뉴스 검색 결과이며, 알선거는 기사 내용의 정확성을 보장하지 않습니다.</div>
                </div>
                <div class="news-live-header">
                    <div class="news-live-actions" id="news-live-actions" role="tablist" aria-label="뉴스 카테고리">
                        ${categories.map((cat, idx) => `
                            <button class="news-live-btn ${idx === 0 ? 'active' : ''}" data-query="${cat.query}" data-idx="${idx}" role="tab" aria-selected="${idx === 0}">
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
            const isMayorElection = electionType === 'mayor' && districtName;
            const districtMediaTags = (() => {
                if (!isMayorElection) return null;
                const muni = window.LocalMediaPool?.municipal?.[districtName];
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
                const districtLabel = districtName;
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

    // ── 공개 API (테스트/디버그용으로도 노출) ──
    return {
        render,
        // 디버그/테스트용 내부 함수 노출
        evaluateCategoryMatch,
        getDebugRegionMediaBundle,
        buildNewsCategories,
        getGovernorQueryBase,
        getGovernorFocusTerms,
        getGovernorRoleTerms,
        getRegionAliasTerms,
        mergeUniqueArrays,
        mentionsOtherRegion,
        sanitizeHtml,
        getHostFromUrl,
        isMajorOutlet,
    };
})();
