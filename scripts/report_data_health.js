#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const newsObservationUtils = require('./news_observation_utils');
const pollObservationUtils = require('./poll_observation_utils');

const baseDir = path.resolve(__dirname, '..');
const NEWS_QA_PRIORITY = [
    'seoul', 'busan', 'gwangju', 'jeju',
    'gangwon', 'chungbuk', 'jeonnam', 'gyeongbuk',
    'gyeonggi', 'incheon', 'gyeongnam', 'chungnam',
    'jeonbuk', 'daejeon', 'daegu', 'ulsan', 'sejong'
];
const POLL_QA_PRIORITY = [
    'seoul', 'busan', 'gwangju', 'jeju',
    'gyeongbuk', 'gyeonggi', 'jeonnam', 'chungnam',
    'gangwon', 'incheon', 'daejeon', 'ulsan',
    'gyeongnam', 'jeonbuk', 'daegu', 'sejong'
];

function readJson(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(baseDir, relativePath), 'utf8'));
}

function pct(part, total) {
    if (!total) return '0.0';
    return ((part / total) * 100).toFixed(1);
}

function summarizePolls() {
    const state = readJson('data/polls/state.json');
    const polls = state.polls || [];
    const withRegistrationDate = polls.filter((poll) => poll.registrationDate).length;
    const withRegistrationId = polls.filter((poll) => poll.registrationId).length;
    const withResults = polls.filter((poll) => Array.isArray(poll.results) && poll.results.length > 0).length;
    const byElectionType = polls.reduce((acc, poll) => {
        const key = poll.electionType || 'unknown';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});
    const missingRegistration = polls
        .filter((poll) => !poll.registrationDate || !poll.registrationId)
        .slice(0, 10)
        .map((poll) => ({
            nttId: poll.nttId,
            title: poll.title,
            regionKey: poll.regionKey || null
        }));

    return {
        total: polls.length,
        withRegistrationDate,
        withRegistrationId,
        withResults,
        byElectionType,
        missingRegistration
    };
}

function summarizeLocalMedia() {
    const registry = readJson('data/local_media_registry.json');
    const regions = registry.regions || {};
    const regionKeys = Object.keys(regions);
    let provinceHostCoverage = 0;
    let municipalityTotal = 0;
    let municipalityWithTier1 = 0;

    regionKeys.forEach((regionKey) => {
        const region = regions[regionKey];
        const provinceHosts = region?.province?.hosts || {};
        if ((provinceHosts.tier1 || []).length || (provinceHosts.tier2 || []).length) {
            provinceHostCoverage += 1;
        }

        Object.values(region?.municipalities || {}).forEach((municipality) => {
            municipalityTotal += 1;
            if ((municipality?.hosts?.tier1 || []).length) {
                municipalityWithTier1 += 1;
            }
        });
    });

    return {
        provinces: regionKeys.length,
        provinceHostCoverage,
        municipalityTotal,
        municipalityWithTier1
    };
}

function summarizeRegressionFixtures() {
    const newsCases = readJson('scripts/news_regression_cases.json');
    const pollCases = readJson('scripts/poll_regression_cases.json');
    return {
        newsCases: newsCases.length,
        pollCases: pollCases.length
    };
}

function countFilesRecursively(dirPath) {
    if (!fs.existsSync(dirPath)) return 0;
    return fs.readdirSync(dirPath, { withFileTypes: true }).reduce((total, entry) => {
        const childPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            return total + countFilesRecursively(childPath);
        }
        return total + 1;
    }, 0);
}

function listArchiveRegions(archiveDir) {
    if (!fs.existsSync(archiveDir)) return [];
    const regionKeys = new Set();

    fs.readdirSync(archiveDir)
        .filter((name) => name.endsWith('.tsv'))
        .forEach((name) => {
            const match = name.match(/__queue__([a-z]+)\.tsv$/);
            if (match) regionKeys.add(match[1]);
        });

    return Array.from(regionKeys).sort((a, b) => a.localeCompare(b));
}

function formatRegionList(items) {
    return items.length ? items.join(', ') : '-';
}

function recommendQaRegions(priorityOrder, queueSummary, limit = 4) {
    const archived = new Set(queueSummary.archivedRegions);
    const queued = new Set(
        Object.entries(queueSummary.countsByRegion)
            .filter(([, count]) => count > 0)
            .map(([regionKey]) => regionKey)
    );

    const pendingQueue = priorityOrder.filter((regionKey) => queued.has(regionKey)).slice(0, limit);
    const nextQa = priorityOrder
        .filter((regionKey) => !queued.has(regionKey) && !archived.has(regionKey))
        .slice(0, limit);

    return {
        pendingQueue,
        nextQa
    };
}

function summarizeObservationQueue(utils) {
    utils.ensureQueueInfrastructure();
    const queueFiles = utils.listQueueFiles();
    const regionalFiles = fs.existsSync(utils.queueDir)
        ? fs.readdirSync(utils.queueDir)
            .filter((name) => name.endsWith('.tsv') && !name.startsWith('_') && !name.startsWith('.'))
            .sort()
        : [];
    const orderedRegionKeys = regionalFiles.map((name) => path.basename(name, '.tsv'));
    const countsByRegion = Object.fromEntries(orderedRegionKeys.map((regionKey) => [regionKey, 0]));
    let queued = 0;

    queueFiles.forEach((filePath) => {
        const rows = utils.readTsv(filePath);
        rows.forEach((row) => {
            const regionKey = row.regionKey || 'unknown';
            countsByRegion[regionKey] = (countsByRegion[regionKey] || 0) + 1;
            queued += 1;
        });
    });

    const sortedCounts = Object.fromEntries(
        Object.entries(countsByRegion).sort((a, b) => a[0].localeCompare(b[0]))
    );
    const regionSummary = Object.entries(sortedCounts)
        .map(([regionKey, count]) => `${regionKey}:${count}`)
        .join(', ');

    return {
        queued,
        activeRegions: Object.values(sortedCounts).filter((count) => count > 0).length,
        totalRegionalFiles: regionalFiles.length,
        archiveFiles: countFilesRecursively(utils.archiveDir),
        archivedRegions: listArchiveRegions(utils.archiveDir),
        countsByRegion: sortedCounts,
        regionSummary
    };
}

function main() {
    const polls = summarizePolls();
    const localMedia = summarizeLocalMedia();
    const regression = summarizeRegressionFixtures();
    const newsQueue = summarizeObservationQueue(newsObservationUtils);
    const pollQueue = summarizeObservationQueue(pollObservationUtils);
    const newsRecommendation = recommendQaRegions(NEWS_QA_PRIORITY, newsQueue);
    const pollRecommendation = recommendQaRegions(POLL_QA_PRIORITY, pollQueue);

    console.log('== data health ==');
    console.log(`polls.total=${polls.total}`);
    console.log(`polls.registrationDate=${polls.withRegistrationDate}/${polls.total} (${pct(polls.withRegistrationDate, polls.total)}%)`);
    console.log(`polls.registrationId=${polls.withRegistrationId}/${polls.total} (${pct(polls.withRegistrationId, polls.total)}%)`);
    console.log(`polls.withResults=${polls.withResults}/${polls.total} (${pct(polls.withResults, polls.total)}%)`);
    console.log(`polls.byElectionType=${JSON.stringify(polls.byElectionType)}`);
    console.log(`localMedia.provinces=${localMedia.provinceHostCoverage}/${localMedia.provinces}`);
    console.log(`localMedia.municipalityTier1=${localMedia.municipalityWithTier1}/${localMedia.municipalityTotal}`);
    console.log(`regression.newsCases=${regression.newsCases}`);
    console.log(`regression.pollCases=${regression.pollCases}`);
    console.log(`queues.newsQueued=${newsQueue.queued}`);
    console.log(`queues.newsRegions=${newsQueue.activeRegions}/${newsQueue.totalRegionalFiles}`);
    console.log(`queues.newsArchiveFiles=${newsQueue.archiveFiles}`);
    console.log(`queues.newsRegionSummary=${newsQueue.regionSummary}`);
    console.log(`queues.newsArchivedRegions=${formatRegionList(newsQueue.archivedRegions)}`);
    console.log(`recommend.newsPendingQueue=${formatRegionList(newsRecommendation.pendingQueue)}`);
    console.log(`recommend.newsNextQa=${formatRegionList(newsRecommendation.nextQa)}`);
    console.log(`queues.pollQueued=${pollQueue.queued}`);
    console.log(`queues.pollRegions=${pollQueue.activeRegions}/${pollQueue.totalRegionalFiles}`);
    console.log(`queues.pollArchiveFiles=${pollQueue.archiveFiles}`);
    console.log(`queues.pollRegionSummary=${pollQueue.regionSummary}`);
    console.log(`queues.pollArchivedRegions=${formatRegionList(pollQueue.archivedRegions)}`);
    console.log(`recommend.pollPendingQueue=${formatRegionList(pollRecommendation.pendingQueue)}`);
    console.log(`recommend.pollNextQa=${formatRegionList(pollRecommendation.nextQa)}`);

    if (polls.missingRegistration.length) {
        console.log('missingRegistration.sample=' + JSON.stringify(polls.missingRegistration));
    }
}

main();
