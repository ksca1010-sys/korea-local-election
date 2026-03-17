#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const baseDir = path.resolve(__dirname, '..');
const pollsPath = path.join(baseDir, 'data', 'polls', 'polls.json');
const outputPath = path.join(baseDir, 'data', 'local_media_registry.json');
const overridesPath = path.join(baseDir, 'data', 'local_media_registry_overrides.json');

const NATIONAL_MEDIA_PATTERNS = [
    /뉴스토마토/i,
    /폴리뉴스/i,
    /뉴시스/i,
    /뉴스1/i,
    /뉴스원/i,
    /프레시안/i,
    /포털신문/i,
    /천지일보/i,
    /에너지경제신문/i,
    /시사저널/i,
    /KPI뉴스/i,
    /프라임경제/i,
    /뉴데일리/i,
    /스트레이트뉴스/i,
    /오마이뉴스/i,
    /브레이크뉴스/i,
    /위키트리/i,
    /내외경제TV/i,
    /에브리뉴스/i,
    /더퍼블릭/i,
    /공감신문/i,
    /펜앤마이크/i,
    /파이낸스투데이/i,
    /서울의소리/i,
    /중앙일보/i,
    /동아일보/i,
    /조선일보/i,
    /한겨레/i,
    /한국일보/i,
    /매일경제/i,
    /한국경제/i,
    /머니투데이/i,
    /이데일리/i,
    /프레시안/i,
    /오피니언뷰/i,
    /이로운넷/i,
    /뉴스티앤티/i,
    /사장남천동/i,
    /케이저널/i,
    /고성국TV/i,
    /더파워미디어/i,
    /미디어트리뷴/i,
    /위클리오늘/i,
    /코리아투데이뉴스/i,
    /영남매일뉴스/i,
    /뉴스핌/i,
    /데일리안/i,
    /아이뉴스24/i,
    /서울경제TV/i,
    /브레이크뉴스/i,
    /데일리임팩트/i,
    /엔에스피통신/i,
    /글로벌경제신문/i,
    /동양뉴스/i,
    /뉴스웍스/i,
    /뉴스투데이/i,
    /위키트리/i,
    /YTN/i,
    /전남매거진/i,
    /대로미디어/i,
    /^KOPRA$/i
];

const NON_MEDIA_PATTERNS = [
    /취재본부/i,
    /지역본부/i,
    /본부장/i,
    /자체\s*조사/i,
    /리서치/i,
    /컨설팅/i,
    /조사기관/i,
    /위원회/i,
    /연대/i,
    /후보/i,
    /공천/i,
    /총연합회/i,
    /회장/i,
    /상임공동대표/i,
    /민주진보/i,
    /단일화/i,
    /추진위원회/i,
    /로컬에너지랩/i,
    /윈지코리아컨설팅/i,
    /스노우볼/i,
    /여론조사꽃/i,
    /대한민국 자유/i,
    /언론인연합회/i,
    /언론인협회/i,
    /총연합회/i,
    /신문총연합회/i,
    /사단법인/i
];

const MEDIA_NAME_PATTERNS = [
    /일보$/i,
    /신문$/i,
    /신문사$/i,
    /방송/i,
    /MBC/i,
    /KBS/i,
    /CBS/i,
    /^KNN$/i,
    /^TBC$/i,
    /^JIBS/i,
    /^G1방송$/i,
    /^ubc울산방송$/i,
    /^KCTV제주방송$/i,
    /뉴스/i,
    /저널/i,
    /투데이/i,
    /시대/i,
    /소리/i,
    /타임즈/i,
    /포스트/i,
    /헤럴드/i,
    /미디어/i,
    /매일$/i
];

const PRIORITY_NAME_PATTERNS = [
    /굿모닝충청/i,
    /미디어제주/i,
    /제주의소리/i,
    /헤드라인제주/i,
    /당진시대/i,
    /산청시대/i,
    /보은사람들/i,
    /연천신문/i,
    /포천뉴스/i,
    /장성투데이/i,
    /부안독립신문/i,
    /광양시민신문/i,
    /원주신문/i,
    /횡성희망신문/i,
    /중부매일/i,
    /경남매일/i
];

function normalizeName(value) {
    return String(value || '')
        .replace(/\([^)]*\)/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/\s*취재 본부\s*/g, ' 취재본부 ')
        .trim();
}

function normalizeHost(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .replace(/\/.*$/, '');
}

function loadOverrides() {
    try {
        return JSON.parse(fs.readFileSync(overridesPath, 'utf-8'));
    } catch (error) {
        return { global: {}, regions: {} };
    }
}

function extractNames(clientOrg) {
    const raw = String(clientOrg || '');
    const colonIndex = raw.indexOf(':');
    const namesPart = colonIndex >= 0 ? raw.slice(colonIndex + 1) : raw;
    return namesPart
        .split(/[\/,]/)
        .map(normalizeName)
        .filter(Boolean);
}

function isLocalMediaName(name) {
    if (!name || name.length < 2) return false;
    if (/^(KBS|MBC|SBS|CBS)$/.test(name)) return false;
    if (NON_MEDIA_PATTERNS.some((pattern) => pattern.test(name))) return false;
    if (NATIONAL_MEDIA_PATTERNS.some((pattern) => pattern.test(name))) return false;
    if (!MEDIA_NAME_PATTERNS.some((pattern) => pattern.test(name)) && !PRIORITY_NAME_PATTERNS.some((pattern) => pattern.test(name))) return false;
    return true;
}

function getScope(item) {
    const clientOrg = String(item.clientOrg || '');
    if (clientOrg.includes('구·시·군단위')) return 'municipality';
    if (item.municipality) return 'municipality';
    return 'province';
}

function getTypeLabels(clientOrg) {
    const labels = [];
    const raw = String(clientOrg || '');
    if (raw.includes('방송사')) labels.push('broadcast');
    if (raw.includes('신문')) labels.push('newspaper');
    if (raw.includes('인터넷언론')) labels.push('internet');
    if (!labels.length) labels.push('other');
    return labels;
}

function getOrCreateRegion(regions, regionKey) {
    if (!regions[regionKey]) {
        regions[regionKey] = {
            province: { outlets: [] },
            municipalities: {}
        };
    }
    return regions[regionKey];
}

function getOrCreateMunicipality(region, municipality) {
    if (!region.municipalities[municipality]) {
        region.municipalities[municipality] = { outlets: [] };
    }
    return region.municipalities[municipality];
}

function addOutlet(target, name, typeLabels) {
    let outlet = target.outlets.find((entry) => entry.name === name);
    if (!outlet) {
        outlet = { name, count: 0, types: [] };
        target.outlets.push(outlet);
    }
    outlet.count += 1;
    outlet.types = Array.from(new Set([...outlet.types, ...typeLabels])).sort();
}

function getPriorityWeight(outlet) {
    const types = Array.isArray(outlet.types) ? outlet.types : [];
    if (types.includes('broadcast')) return 3;
    if (types.includes('newspaper')) return 2;
    if (types.includes('internet')) return 1;
    return 0;
}

function getBucketOverrides(overrides, regionKey, municipality = null) {
    const global = overrides?.global || {};
    const region = overrides?.regions?.[regionKey] || {};
    const scopeOverrides = municipality
        ? (region.municipalities?.[municipality] || {})
        : (region.province || {});
    const globalScopeOverrides = municipality
        ? (global.municipalities || {})
        : (global.province || {});
    const mergeNames = (key) => [
        ...(Array.isArray(global[key]) ? global[key] : []),
        ...(Array.isArray(globalScopeOverrides[key]) ? globalScopeOverrides[key] : []),
        ...(Array.isArray(region[key]) ? region[key] : []),
        ...(Array.isArray(scopeOverrides[key]) ? scopeOverrides[key] : [])
    ].map(normalizeName).filter(Boolean);
    const uniqueOrdered = (values) => {
        const seen = new Set();
        return values.filter((value) => {
            if (seen.has(value)) return false;
            seen.add(value);
            return true;
        });
    };
    const mergeHosts = (key) => uniqueOrdered([
        ...(Array.isArray(global[key]) ? global[key] : []),
        ...(Array.isArray(globalScopeOverrides[key]) ? globalScopeOverrides[key] : []),
        ...(Array.isArray(region[key]) ? region[key] : []),
        ...(Array.isArray(scopeOverrides[key]) ? scopeOverrides[key] : [])
    ].map(normalizeHost).filter(Boolean));
    const mergeSeedOutlets = () => [
        ...(Array.isArray(global.seedOutlets) ? global.seedOutlets : []),
        ...(Array.isArray(globalScopeOverrides.seedOutlets) ? globalScopeOverrides.seedOutlets : []),
        ...(Array.isArray(region.seedOutlets) ? region.seedOutlets : []),
        ...(Array.isArray(scopeOverrides.seedOutlets) ? scopeOverrides.seedOutlets : [])
    ].map((entry) => {
        if (!entry || typeof entry !== 'object') return null;
        const name = normalizeName(entry.name);
        if (!name) return null;
        const types = Array.isArray(entry.types) ? entry.types.filter(Boolean) : [];
        return { name, types };
    }).filter(Boolean);
    const promoted = uniqueOrdered(mergeNames('promoteNames'));
    return {
        excludeNames: new Set(mergeNames('excludeNames')),
        promoteNames: new Set(promoted),
        promoteRanks: new Map(promoted.map((name, index) => [name, index])),
        seedOutlets: mergeSeedOutlets(),
        tier1Hosts: mergeHosts('tier1Hosts'),
        tier2Hosts: mergeHosts('tier2Hosts')
    };
}

function isPriorityOutlet(outlet) {
    if (!outlet || !outlet.name) return false;
    if (NON_MEDIA_PATTERNS.some((pattern) => pattern.test(outlet.name))) return false;
    if (NATIONAL_MEDIA_PATTERNS.some((pattern) => pattern.test(outlet.name))) return false;
    if (PRIORITY_NAME_PATTERNS.some((pattern) => pattern.test(outlet.name))) return true;
    if (getPriorityWeight(outlet) >= 2) return true;
    return outlet.count >= 2 && MEDIA_NAME_PATTERNS.some((pattern) => pattern.test(outlet.name));
}

function finalizeBucket(bucket, limit, bucketOverrides = {
    excludeNames: new Set(),
    promoteNames: new Set(),
    promoteRanks: new Map(),
    seedOutlets: [],
    tier1Hosts: [],
    tier2Hosts: []
}) {
    bucketOverrides.seedOutlets.forEach((seed) => {
        let outlet = bucket.outlets.find((entry) => normalizeName(entry.name) === seed.name);
        if (!outlet) {
            outlet = { name: seed.name, count: 0, types: [] };
            bucket.outlets.push(outlet);
        }
        outlet.types = Array.from(new Set([...(outlet.types || []), ...(seed.types || [])])).sort();
    });
    bucket.outlets = bucket.outlets.filter((entry) => !bucketOverrides.excludeNames.has(normalizeName(entry.name)));
    bucket.outlets.sort((left, right) => {
        const leftRank = bucketOverrides.promoteRanks.get(normalizeName(left.name));
        const rightRank = bucketOverrides.promoteRanks.get(normalizeName(right.name));
        const leftPromoted = Number.isInteger(leftRank);
        const rightPromoted = Number.isInteger(rightRank);
        if (leftPromoted || rightPromoted) {
            if (!leftPromoted) return 1;
            if (!rightPromoted) return -1;
            if (leftRank !== rightRank) return leftRank - rightRank;
        }
        if (right.count !== left.count) return right.count - left.count;
        if (getPriorityWeight(right) !== getPriorityWeight(left)) {
            return getPriorityWeight(right) - getPriorityWeight(left);
        }
        return left.name.localeCompare(right.name, 'ko');
    });
    const priorityCandidates = bucket.outlets.filter((entry) =>
        bucketOverrides.promoteNames.has(normalizeName(entry.name)) || isPriorityOutlet(entry)
    );
    bucket.priorityNames = priorityCandidates.slice(0, limit).map((entry) => entry.name);
    const tier1Hosts = Array.isArray(bucketOverrides.tier1Hosts) ? bucketOverrides.tier1Hosts : [];
    const tier2Hosts = Array.isArray(bucketOverrides.tier2Hosts)
        ? bucketOverrides.tier2Hosts.filter((host) => !tier1Hosts.includes(host))
        : [];
    if (tier1Hosts.length || tier2Hosts.length) {
        bucket.hosts = {
            tier1: tier1Hosts,
            tier2: tier2Hosts
        };
    }
}

function buildRegistry(polls) {
    const regions = {};
    const regionEntries = polls.regions || {};
    const overrides = loadOverrides();

    Object.entries(regionEntries).forEach(([regionKey, items]) => {
        items.forEach((item) => {
            if (!item || !item.clientOrg || !item.regionKey) return;
            const names = extractNames(item.clientOrg).filter(isLocalMediaName);
            if (!names.length) return;

            const region = getOrCreateRegion(regions, regionKey);
            const scope = getScope(item);
            const typeLabels = getTypeLabels(item.clientOrg);

            names.forEach((name) => {
                addOutlet(region.province, name, typeLabels);
                if (scope === 'municipality' && item.municipality) {
                    addOutlet(getOrCreateMunicipality(region, item.municipality), name, typeLabels);
                }
            });
        });
    });

    Object.entries(overrides?.regions || {}).forEach(([regionKey, regionOverride]) => {
        const region = getOrCreateRegion(regions, regionKey);
        Object.keys(regionOverride?.municipalities || {}).forEach((municipality) => {
            getOrCreateMunicipality(region, municipality);
        });
    });

    Object.entries(regions).forEach(([regionKey, region]) => {
        finalizeBucket(region.province, 8, getBucketOverrides(overrides, regionKey));
        Object.entries(region.municipalities).forEach(([municipalityName, municipality]) => {
            finalizeBucket(municipality, 5, getBucketOverrides(overrides, regionKey, municipalityName));
        });
    });

    return {
        generatedAt: new Date().toISOString(),
        source: '중앙선거여론조사심의위원회 polls.json 의뢰 매체명 기반 자동 수집',
        notes: [
            '전국단위·비매체성 이름은 필터링했습니다.',
            'province는 시도 단위 우선 매체, municipalities는 시군구 단위 우선 매체입니다.',
            'host 도메인은 overrides의 tier1Hosts/tier2Hosts로 보강할 수 있고, locality 점수와 site: 검색에 사용합니다.',
            'data/local_media_registry_overrides.json 으로 지역별 수동 보정과 seed 매체 주입이 가능합니다.'
        ],
        regions
    };
}

function main() {
    const polls = JSON.parse(fs.readFileSync(pollsPath, 'utf-8'));
    const registry = buildRegistry(polls);
    fs.writeFileSync(outputPath, `${JSON.stringify(registry, null, 2)}\n`, 'utf-8');
    console.log(`Wrote ${outputPath}`);
}

main();
