#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const baseDir = path.resolve(__dirname, '..');

function readJson(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(baseDir, relativePath), 'utf8'));
}

const regions = readJson('data/static/regions.json');
const subRegionData = readJson('data/static/sub_regions.json');
const byElectionData = readJson('data/candidates/byelection.json');

const context = {
    console,
    setTimeout,
    clearTimeout,
    fetch: () => Promise.resolve({ ok: false }),
    ElectionData: {
        regions,
        subRegionData,
        _byElectionCache: byElectionData,
        getRegion(key) {
            return regions[key] || null;
        }
    }
};
context.globalThis = context;

const source = fs
    .readFileSync(path.join(baseDir, 'js/search.js'), 'utf8')
    .replace('const SearchModule = (() => {', 'globalThis.SearchModule = (() => {');

vm.createContext(context);
vm.runInContext(source, context, { filename: 'js/search.js' });

const provinceAbbrev = {
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

const provinceTypes = [
    ['governor', '광역단체장'],
    ['superintendent', '교육감'],
    ['council', '광역의원'],
    ['localCouncil', '기초의원'],
    ['councilProportional', '광역비례'],
    ['localCouncilProportional', '기초비례']
];

const districtTypes = [
    ['mayor', '기초단체장'],
    ['council', '광역의원'],
    ['localCouncil', '기초의원'],
    ['localCouncilProportional', '기초비례']
];

function regionShortName(region) {
    return provinceAbbrev[region.name]
        || region.name.replace(/(특별자치도|특별자치시|특별시|광역시|도)$/, '');
}

function normalizeSearchText(text) {
    return String(text || '').toLowerCase().replace(/[\s·ㆍ,._-]+/g, '');
}

function buildSearchTokens(text) {
    return String(text || '')
        .split(/[\s·ㆍ,._-]+/)
        .map(normalizeSearchText)
        .filter((token) => token.length >= 2);
}

function search(index, query) {
    const q = query.toLowerCase();
    const normalizedQuery = normalizeSearchText(query);
    const queryTokens = buildSearchTokens(query);
    const typePriority = {
        governor: 7,
        superintendent: 6,
        mayor: 5,
        council: 4,
        localCouncil: 3,
        councilProportional: 2,
        localCouncilProportional: 1,
        byElection: 3
    };

    const matches = [];
    for (const item of index) {
        const allTexts = [...(item.aliases || []), item.nameEng].filter(Boolean);
        const normalizedTexts = allTexts.map(normalizeSearchText);
        let bestMatch = 0;

        for (let i = 0; i < allTexts.length; i++) {
            const text = allTexts[i];
            const normalizedText = normalizedTexts[i];
            if (text === query || normalizedText === normalizedQuery) {
                bestMatch = 3;
                break;
            }
            if (text.startsWith(query) || normalizedText.startsWith(normalizedQuery)) {
                bestMatch = Math.max(bestMatch, 2);
            } else if (
                text.includes(query)
                || text.toLowerCase().includes(q)
                || normalizedText.includes(normalizedQuery)
            ) {
                bestMatch = Math.max(bestMatch, 1);
            }
        }

        if (bestMatch === 0 && queryTokens.length > 1) {
            const tokenMatched = queryTokens.every((token) =>
                normalizedTexts.some((text) => text.includes(token) || token.includes(text))
            );
            if (tokenMatched) bestMatch = 2;
        }

        if (bestMatch === 0) continue;

        let score = bestMatch * 40;
        if (item.name.startsWith(query)) score += 30;
        if (item.level === 'province') score += 15;
        score += typePriority[item.electionType] || 0;
        matches.push({ ...item, score });
    }

    return matches.sort((a, b) => b.score - a.score).slice(0, 20);
}

function hasResult(index, query, predicate) {
    return search(index, query).some(predicate);
}

function main() {
    const index = context.SearchModule.buildSearchIndex();
    const failures = [];
    const stats = {
        provinceCases: 0,
        districtCases: 0,
        byelectionCases: 0
    };

    const expectedProvince = Object.entries(regions).reduce((count, [regionKey]) => {
        return count + provinceTypes.filter(([type]) => !(regionKey === 'jeonnam' && (type === 'governor' || type === 'superintendent'))).length;
    }, 0);
    const expectedDistrict = Object.values(subRegionData).reduce((count, districts) => count + districts.length * districtTypes.length, 0);
    const expectedByelection = Object.keys(byElectionData.districts || {}).length;
    const expectedTotal = expectedProvince + expectedDistrict + expectedByelection;

    if (index.length !== expectedTotal) {
        failures.push(`검색 인덱스 수 불일치: ${index.length} != ${expectedTotal}`);
    }

    for (const [regionKey, region] of Object.entries(regions)) {
        const shortName = regionShortName(region);
        for (const [electionType, label] of provinceTypes) {
            if (regionKey === 'jeonnam' && (electionType === 'governor' || electionType === 'superintendent')) continue;

            const predicate = (item) =>
                item.regionKey === regionKey
                && item.electionType === electionType
                && !item.subDistrict;
            for (const query of [`${shortName} ${label}`, `${region.name} ${label}`]) {
                stats.provinceCases += 1;
                if (!hasResult(index, query, predicate)) failures.push(`${query}: ${regionKey}/${electionType} 결과 없음`);
            }
        }
    }

    for (const [regionKey, districts] of Object.entries(subRegionData)) {
        const region = regions[regionKey];
        const shortName = regionShortName(region);
        for (const district of districts) {
            for (const [electionType, label] of districtTypes) {
                const predicate = (item) =>
                    item.regionKey === regionKey
                    && item.subDistrict === district.name
                    && item.electionType === electionType;
                for (const query of [`${shortName} ${district.name} ${label}`, `${region.name} ${district.name} ${label}`]) {
                    stats.districtCases += 1;
                    if (!hasResult(index, query, predicate)) {
                        failures.push(`${query}: ${regionKey}/${district.name}/${electionType} 결과 없음`);
                    }
                }
            }
        }
    }

    for (const [key, district] of Object.entries(byElectionData.districts || {})) {
        const predicate = (item) => item.electionType === 'byElection' && item._byElectionKey === key;
        const compactDistrict = normalizeSearchText(district.district);
        for (const query of [`${district.district} 재보궐`, `${compactDistrict} 재보궐`]) {
            stats.byelectionCases += 1;
            if (!hasResult(index, query, predicate)) failures.push(`${query}: ${key} 재보궐 결과 없음`);
        }
    }

    const jeonnamMergedCases = [
        ['전남 광역단체장', 'governor'],
        ['전남 교육감', 'superintendent']
    ];
    for (const [query, electionType] of jeonnamMergedCases) {
        stats.provinceCases += 1;
        if (!hasResult(index, query, (item) => item.regionKey === 'gwangju' && item.electionType === electionType && !item.subDistrict)) {
            failures.push(`${query}: 전남광주통합특별시/${electionType} 결과 없음`);
        }
    }

    if (failures.length) {
        failures.slice(0, 50).forEach((failure) => console.error(`FAIL | ${failure}`));
        if (failures.length > 50) console.error(`... ${failures.length - 50} more failures`);
        process.exitCode = 1;
        return;
    }

    console.log(
        `PASS search coverage: index=${index.length}, provinceCases=${stats.provinceCases}, `
        + `districtCases=${stats.districtCases}, byelectionCases=${stats.byelectionCases}`
    );
}

main();
