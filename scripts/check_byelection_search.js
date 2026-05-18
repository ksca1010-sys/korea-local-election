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

function main() {
    const index = context.SearchModule.buildSearchIndex();
    const byElectionCount = index.filter((item) => item.electionType === 'byElection').length;
    const expectedCount = Object.keys(byElectionData.districts || {}).length;
    const failures = [];

    if (byElectionCount !== expectedCount) {
        failures.push(`재보궐 검색 인덱스 수 불일치: ${byElectionCount} != ${expectedCount}`);
    }

    const cases = [
        ['재보궐', 'incheon-yeonsu'],
        ['보궐', 'incheon-yeonsu'],
        ['연수구갑', 'incheon-yeonsu'],
        ['연수구 갑', 'incheon-yeonsu'],
        ['연수갑', 'incheon-yeonsu'],
        ['계양을', 'incheon-gyeyang'],
        ['평택을', 'gyeonggi-pyeongtaek'],
        ['안산갑', 'gyeonggi-ansan'],
        ['군산김제부안갑', 'jeonbuk-gunsan'],
        ['공주부여청양', 'chungnam-gongju'],
        ['서귀포', 'jeju-seogwipo'],
        ['광산구을', 'gwangju-gwangsan'],
        ['김용', 'gyeonggi-pyeongtaek'],
        ['조국', 'jeonbuk-gunsan']
    ];

    for (const [query, expectedKey] of cases) {
        const results = search(index, query);
        const found = results.find((item) => item.electionType === 'byElection' && item._byElectionKey === expectedKey);
        if (!found) {
            failures.push(`${query}: ${expectedKey} 재보궐 결과 없음`);
            continue;
        }
        console.log(`PASS | ${query} -> ${found.name} (${found._byElectionKey})`);
    }

    if (failures.length) {
        failures.forEach((failure) => console.error(`FAIL | ${failure}`));
        process.exitCode = 1;
        return;
    }

    console.log(`\nPASS byelection search: indexed=${byElectionCount}, cases=${cases.length}`);
}

main();
