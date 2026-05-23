#!/usr/bin/env node
/**
 * UI 진단 스크립트
 * 각 선거 유형 × 지역별로 데이터 가용성과 렌더링 조건을 검사
 *
 * 사용법: node scripts/run_ui_diagnostic.js
 */

const fs = require('fs');
const path = require('path');

const BASE = path.resolve(__dirname, '..');

// 데이터 로드
function loadJSON(filePath) {
    try {
        return JSON.parse(fs.readFileSync(path.join(BASE, filePath), 'utf-8'));
    } catch { return null; }
}

const governor = loadJSON('data/candidates/governor.json');
const superintendent = loadJSON('data/candidates/superintendent.json');
const superintendentStatus = loadJSON('data/candidates/superintendent_status.json');
const mayorCandidates = loadJSON('data/candidates/mayor_candidates.json');
const mayorStatus = loadJSON('data/candidates/mayor_status.json');
const polls = loadJSON('data/polls/polls.json');
const overview = loadJSON('data/election_overview.json');
const proportionalCouncil = loadJSON('data/proportional_council.json');
const councilMembers = loadJSON('data/council/council_members.json');
const regionsStatic = loadJSON('data/static/regions.json');
const subRegions = loadJSON('data/static/sub_regions.json');

const REGIONS = [
    'seoul','busan','daegu','incheon','gwangju','daejeon','ulsan','sejong',
    'gyeonggi','gangwon','chungbuk','chungnam','jeonbuk','jeonnam','gyeongbuk','gyeongnam','jeju'
];

const REGION_NAMES = {
    seoul:'서울',busan:'부산',daegu:'대구',incheon:'인천',gwangju:'광주',daejeon:'대전',
    ulsan:'울산',sejong:'세종',gyeonggi:'경기',gangwon:'강원',chungbuk:'충북',chungnam:'충남',
    jeonbuk:'전북',jeonnam:'전남',gyeongbuk:'경북',gyeongnam:'경남',jeju:'제주'
};

const NO_LOCAL_MAYOR_ELECTION_REGIONS = new Set(['sejong', 'jeju']);

function getMergedTarget(regionKey, electionType) {
    for (const [targetKey, region] of Object.entries(regionsStatic || {})) {
        const types = region?.mergedElectionTypes || [];
        if (region?.mergedWith === regionKey && types.includes(electionType)) {
            return targetKey;
        }
    }
    return regionKey;
}

function currentDistrictNames(regionKey) {
    const canonical = (subRegions?.[regionKey] || [])
        .map(item => typeof item === 'string' ? item : item?.name)
        .filter(Boolean);
    if (canonical.length) return canonical;

    return Object.values(mayorStatus?.mayors || {})
        .filter(info => info?.region === regionKey)
        .map(info => info.district)
        .filter(Boolean);
}

let totalIssues = 0;
let totalChecks = 0;

function check(condition, label) {
    totalChecks++;
    if (!condition) {
        totalIssues++;
        console.log(`  ❌ ${label}`);
        return false;
    }
    return true;
}

function section(title) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`  ${title}`);
    console.log('='.repeat(60));
}

// ── 1. 광역단체장 ──
section('1. 광역단체장');
for (const rk of REGIONS) {
    const rn = REGION_NAMES[rk];
    const dataRegion = getMergedTarget(rk, 'governor');
    const cands = governor?.candidates?.[dataRegion] || [];
    const ov = overview?.regions?.[dataRegion];

    const issues = [];
    if (!cands.length) issues.push('후보 없음');
    if (!ov) issues.push('개요 없음');
    if (!ov?.headline) issues.push('headline 없음');
    if (!ov?.summary) issues.push('summary 없음');

    if (issues.length) {
        console.log(`  ${rn}: ${issues.join(', ')}`);
        totalIssues += issues.length;
    }
    totalChecks += 4;
}

// ── 2. 교육감 ──
section('2. 교육감');
for (const rk of REGIONS) {
    const rn = REGION_NAMES[rk];
    const dataRegion = getMergedTarget(rk, 'superintendent');
    const status = superintendentStatus?.superintendents?.[rk];
    const cands = superintendent?.candidates?.[dataRegion] || [];
    const ov = overview?.superintendent?.[dataRegion];

    const issues = [];
    if (!status) issues.push('현직 정보 없음');
    if (!cands.length) issues.push('후보 없음');
    if (!ov) issues.push('개요 없음');
    if (!ov?.headline) issues.push('headline 없음');

    if (issues.length) {
        console.log(`  ${rn}: ${issues.join(', ')}`);
        totalIssues += issues.length;
    }
    totalChecks += 4;
}

// ── 3. 기초단체장 ──
section('3. 기초단체장');
const skippedMayorRegions = [];
for (const rk of REGIONS) {
    const rn = REGION_NAMES[rk];
    if (NO_LOCAL_MAYOR_ELECTION_REGIONS.has(rk)) {
        skippedMayorRegions.push(rn);
        continue;
    }
    const regionDistricts = currentDistrictNames(rk);
    const cands = mayorCandidates?.candidates?.[rk] || {};
    const ovRegion = overview?.mayor?.[rk] || {};

    let noOverview = 0;
    let noCands = 0;

    for (const district of regionDistricts) {
        if (!cands[district]?.length) noCands++;
        if (!ovRegion[district]) noOverview++;
        totalChecks += 2;
    }

    const issues = [];
    if (noCands > 0) issues.push(`후보 없음 ${noCands}/${regionDistricts.length}`);
    if (noOverview > 0) issues.push(`개요 없음 ${noOverview}/${regionDistricts.length}`);

    if (issues.length) {
        console.log(`  ${rn}: ${issues.join(', ')}`);
        totalIssues += noCands + noOverview;
    }
}

if (skippedMayorRegions.length) {
    console.log(`  참고: 기초단체장 직접선거 대상이 아닌 지역 제외 (${skippedMayorRegions.join(', ')})`);
}

const staleMayorStatus = Object.values(mayorStatus?.mayors || {})
    .filter(info => info?.region && info?.district)
    .filter(info => !currentDistrictNames(info.region).includes(info.district))
    .map(info => `${REGION_NAMES[info.region] || info.region} ${info.district}`);
if (staleMayorStatus.length) {
    console.log(`  참고: 현재 행정구역에서 제외된 현직 데이터 ${staleMayorStatus.length}건 (${staleMayorStatus.join(', ')})`);
}

// ── 4. 광역의원 ──
section('4. 광역의원');
for (const rk of REGIONS) {
    const rn = REGION_NAMES[rk];
    const members = councilMembers?.regions?.[rk];

    const issues = [];
    if (!members) issues.push('의원 데이터 없음');
    if (!members?.districtMembers || Object.keys(members.districtMembers).length === 0) issues.push('선거구별 의원 없음');

    if (issues.length) {
        console.log(`  ${rn}: ${issues.join(', ')}`);
        totalIssues += issues.length;
    }
    totalChecks += 2;
}

// ── 5. 비례대표 ──
section('5. 비례대표');
for (const rk of REGIONS) {
    const rn = REGION_NAMES[rk];
    const prop = proportionalCouncil?.regions?.[rk];

    const issues = [];
    if (!prop) issues.push('비례대표 데이터 없음');
    if (!prop?.parties?.length) issues.push('정당 의석 데이터 없음');

    if (issues.length) {
        console.log(`  ${rn}: ${issues.join(', ')}`);
        totalIssues += issues.length;
    }
    totalChecks += 2;
}

// ── 6. 여론조사 ──
section('6. 여론조사 (선거유형별)');
const pollsByType = { 'mayor(광역단체장)': 0, superintendent: 0, district_mayor: 0 };
const pollsWithResults = { 'mayor(광역단체장)': 0, superintendent: 0, district_mayor: 0 };

for (const [rk, regionPolls] of Object.entries(polls?.regions || {})) {
    for (const p of regionPolls) {
        const et = p.electionType || 'unknown';
        if (et === 'mayor' && !p.municipality) {
            pollsByType['mayor(광역단체장)']++;
            if (p.results?.length > 0) pollsWithResults['mayor(광역단체장)']++;
        } else if (et === 'superintendent') {
            pollsByType.superintendent++;
            if (p.results?.length > 0) pollsWithResults.superintendent++;
        } else if (et === 'district_mayor') {
            pollsByType.district_mayor++;
            if (p.results?.length > 0) pollsWithResults.district_mayor++;
        }
    }
}

for (const [type, count] of Object.entries(pollsByType)) {
    const withResults = pollsWithResults[type];
    const rate = count > 0 ? ((withResults / count) * 100).toFixed(1) : 0;
    console.log(`  ${type}: ${count}건 (파싱 완료 ${withResults}건, ${rate}%)`);
}

// ── 7. 개요 품질 ──
section('7. 개요 품질 검사');
let shortHeadlines = 0;
let longHeadlines = 0;
let shortSummaries = 0;
let emptyIssues = 0;

function checkOverviewQuality(ov, label) {
    if (!ov) return;
    if (ov.headline && ov.headline.length < 8) { shortHeadlines++; console.log(`  ${label}: headline 너무 짧음 (${ov.headline.length}자) "${ov.headline}"`); }
    if (ov.headline && ov.headline.length > 35) { longHeadlines++; console.log(`  ${label}: headline 너무 긺 (${ov.headline.length}자) "${ov.headline}"`); }
    if (ov.summary && ov.summary.length < 30) { shortSummaries++; console.log(`  ${label}: summary 너무 짧음 (${ov.summary.length}자)`); }
    if (!ov.keyIssues?.length) { emptyIssues++; console.log(`  ${label}: keyIssues 없음`); }
}

for (const rk of REGIONS) {
    checkOverviewQuality(overview?.regions?.[rk], `광역-${REGION_NAMES[rk]}`);
    checkOverviewQuality(overview?.superintendent?.[rk], `교육감-${REGION_NAMES[rk]}`);
}

// ── 결과 ──
section('진단 결과');
console.log(`  총 검사: ${totalChecks}건`);
console.log(`  이슈: ${totalIssues}건`);
console.log(`  통과율: ${((1 - totalIssues / totalChecks) * 100).toFixed(1)}%`);

if (totalIssues > 0) {
    process.exitCode = 1;
}
