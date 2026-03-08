// ============================================
// NEC / 공공데이터포털 교육감 후보 정보 모듈
// ============================================

const NECData = (() => {
    const REGION_NAME_MAP = {
        seoul: '서울특별시',
        busan: '부산광역시',
        daegu: '대구광역시',
        incheon: '인천광역시',
        gwangju: '광주광역시',
        daejeon: '대전광역시',
        ulsan: '울산광역시',
        sejong: '세종특별자치시',
        gyeonggi: '경기도',
        gangwon: '강원도',
        chungbuk: '충청북도',
        chungnam: '충청남도',
        jeonbuk: '전라북도',
        jeonnam: '전라남도',
        gyeongbuk: '경상북도',
        gyeongnam: '경상남도',
        jeju: '제주특별자치도'
    };

    const SERVICE_KEY = window.NEC_SERVICE_KEY || '';
    const PROXY_BASE = window.NEC_PROXY_BASE || '';
    const SG_ID = window.NEC_SGID || '20240603';
    const SG_TYPECODE = window.NEC_SGTYPECODE || '11';
    const DATA_ID = window.NEC_DATA_ID || '2';
    const API_URL = window.NEC_API_URL || 'https://data.nec.go.kr/open-data/api.do';

    const cache = new Map();
    const inflight = new Map();

    const stanceRules = [
        { label: '진보', patterns: [/진보/, /민주/, /정의/, /노동/, /녹색/] },
        { label: '보수', patterns: [/보수/, /국민/, /국힘/, /자유/, /한나라/, /미래/, /공화/] }
    ];

    const FIELD_ALIASES = {
        id: ['huboid', 'candId', 'candNo', 'id', 'candidateId'],
        name: ['candNm', 'name', 'candidateName', 'houser', 'sname', '가나다'],
        party: ['jdName', 'party', 'partyNm', 'parNm', 'affiliation'],
        career: ['career', 'career1', 'career2', 'candCareer', 'careerTxt'],
        vote: ['dugyul', 'dugyulRate', 'voteRate', 'voteRatio', 'dug'],
        incumbent: ['incumbent', 'incumbentYn', 'currCnt', 'currAfter', 'careerflag']
    };

    function getSdName(regionKey) {
        if (!regionKey) return null;
        return REGION_NAME_MAP[regionKey] || null;
    }

    function normalizeText(value) {
        return (value || '').toString().trim().toLowerCase();
    }

    function pickField(item, aliases) {
        for (const key of aliases) {
            if (item?.[key] !== undefined && item[key] !== null && item[key] !== '') {
                return item[key];
            }
        }
        return null;
    }

    function safeParseFloat(value) {
        if (typeof value === 'number') return value;
        if (typeof value === 'string') {
            const normalized = value.replace('%', '').replace(',', '.').trim();
            if (normalized === '') return null;
            const parsed = parseFloat(normalized);
            return Number.isNaN(parsed) ? null : parsed;
        }
        return null;
    }

    function determineStance(party) {
        const normalized = normalizeText(party);
        for (const rule of stanceRules) {
            if (rule.patterns.some(pattern => pattern.test(normalized))) {
                return rule.label;
            }
        }
        if (normalized.includes('무소속') || normalized.includes('없음') || normalized === '') {
            return '중도';
        }
        return '중도';
    }

    function getStanceForParty(party) {
        return determineStance(party);
    }

    function getStanceColor(stance) {
        if (!stance) return '#8b99b5';
        const value = stance.toString().trim().toLowerCase();
        if (value.includes('진보')) return '#2E8BFF';
        if (value.includes('보수')) return '#E61E2B';
        if (value.includes('중도')) return '#45B97C';
        return '#8b99b5';
    }

    function parseCandidates(regionKey, rawItems = []) {
        return rawItems.map(item => {
            const name = pickField(item, FIELD_ALIASES.name) || ''; // some records use upper-case
            const party = pickField(item, FIELD_ALIASES.party) || '무소속';
            const career = pickField(item, FIELD_ALIASES.career) || '';
            const votePercent = safeParseFloat(pickField(item, FIELD_ALIASES.vote));
            const incumbentText = pickField(item, FIELD_ALIASES.incumbent);
            const incumbent = ['Y', 'y', '1', '현직', '재선', '재직'].some(val => {
                if (!incumbentText) return false;
                return normalizeText(incumbentText).includes(normalizeText(val));
            });
            const stance = determineStance(party);
            return {
                id: pickField(item, FIELD_ALIASES.id) || `${regionKey}-${name}`,
                name,
                party,
                career,
                votePercent,
                stance,
                incumbent,
                raw: item
            };
        }).filter(c => c.name);
    }

    function normalizeResponsePayload(raw, regionKey) {
        if (!raw) return null;
        let items = [];

        if (raw.items) {
            if (Array.isArray(raw.items)) {
                items = raw.items;
            } else if (Array.isArray(raw.items.item)) {
                items = raw.items.item;
            } else if (raw.items.item) {
                items = [raw.items.item];
            }
        } else if (raw.response?.body?.items) {
            const responseItems = raw.response.body.items;
            if (Array.isArray(responseItems)) {
                items = responseItems;
            } else if (Array.isArray(responseItems.item)) {
                items = responseItems.item;
            } else if (responseItems.item) {
                items = [responseItems.item];
            }
        } else if (Array.isArray(raw.item)) {
            items = raw.item;
        }

        if (!items.length) return { candidates: [], totalCount: 0 };

        const parsed = parseCandidates(regionKey, items);
        const totalCount = raw.response?.body?.totalCount ?? parsed.length;

        return {
            candidates: parsed,
            totalCount,
            raw
        };
    }

    async function fetchDirect(regionKey, sdName, sgIdOverride) {
        if (!sdName || !SERVICE_KEY) return null;
        const url = new URL(API_URL);
        url.searchParams.set('dataId', DATA_ID);
        url.searchParams.set('resultType', 'json');
        url.searchParams.set('sgId', sgIdOverride || SG_ID);
        url.searchParams.set('sgTypecode', SG_TYPECODE);
        url.searchParams.set('sdName', sdName);
        url.searchParams.set('numOfRows', '50');
        url.searchParams.set('pageNo', '1');
        url.searchParams.set('ServiceKey', SERVICE_KEY);
        const response = await fetch(url.toString());
        if (!response.ok) {
            throw new Error(`NEC API failed (${response.status})`);
        }
        const json = await response.json();
        return normalizeResponsePayload(json, regionKey);
    }

    async function fetchViaProxy(regionKey, sdName, sgIdOverride) {
        if (!PROXY_BASE) return null;
        const url = new URL(`${PROXY_BASE.replace(/\/$/, '')}/api/nec/superintendents`);
        url.searchParams.set('region', regionKey);
        url.searchParams.set('sdName', sdName || '');
        url.searchParams.set('sgId', sgIdOverride || SG_ID);
        url.searchParams.set('sgTypecode', SG_TYPECODE);
        const response = await fetch(url.toString(), {
            headers: { 'Accept': 'application/json' }
        });
        if (!response.ok) {
            throw new Error(`NEC proxy failed (${response.status})`);
        }
        const json = await response.json();
        return normalizeResponsePayload(json, regionKey);
    }

    async function fetchCandidates(regionKey) {
        if (!regionKey) return null;
        if (cache.has(regionKey)) return cache.get(regionKey);
        if (inflight.has(regionKey)) return inflight.get(regionKey);

        const sdName = getSdName(regionKey);
        const fetcher = PROXY_BASE ? () => fetchViaProxy(regionKey, sdName) : () => fetchDirect(regionKey, sdName);
        if (!fetcher) return null;

        const promise = fetcher()
            .then(result => {
                if (result?.candidates?.length) {
                    cache.set(regionKey, { ...result, regionKey, regionName: sdName });
                    return cache.get(regionKey);
                }
                return null;
            })
            .catch(err => {
                console.warn('NECData.fetchCandidates', err);
                return null;
            })
            .finally(() => {
                inflight.delete(regionKey);
            });

        inflight.set(regionKey, promise);
        return promise;
    }

    function getCachedCandidates(regionKey) {
        return cache.get(regionKey) || null;
    }

    function isFetching(regionKey) {
        return inflight.has(regionKey);
    }

    return {
        fetchCandidates,
        getCachedCandidates,
        isFetching,
        getStanceForParty,
        getStanceColor
    };
})();
