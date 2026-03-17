#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { loadAppDebug } = require('./news_debug_runtime');

const casesPath = path.join(__dirname, 'poll_regression_cases.json');

function includesAll(haystack, needles = []) {
    return needles.every((needle) => haystack.includes(needle));
}

function main() {
    const cases = JSON.parse(fs.readFileSync(casesPath, 'utf8'));
    const { app } = loadAppDebug();

    const results = cases.map((testCase) => {
        const result = app.__debug.buildPollSelection(testCase);
        const firstPoll = result.polls[0] || null;
        const chart = result.chart || null;

        const countOk = result.count >= Number(testCase.expectedMinCount || 0)
            && (!Number.isFinite(Number(testCase.expectedMaxCount)) || result.count <= Number(testCase.expectedMaxCount));
        const chartModeOk = !testCase.expectedChartMode || result.chartMode === testCase.expectedChartMode;
        const chartTypeOk = !testCase.expectedChartType
            || (testCase.expectedChartType === 'none' ? !chart : chart?.type === testCase.expectedChartType);
        const chartReasonOk = !testCase.expectedChartReason || result.chartReason === testCase.expectedChartReason;
        const headerOk = includesAll(result.headerTitle || '', testCase.expectedHeaderIncludes || []);
        const firstTitleOk = !Array.isArray(testCase.expectedFirstTitleIncludes)
            || !testCase.expectedFirstTitleIncludes.length
            || includesAll(firstPoll?.title || '', testCase.expectedFirstTitleIncludes);
        const firstMunicipalityOk = !testCase.expectedFirstMunicipality
            || (firstPoll?.municipality || null) === testCase.expectedFirstMunicipality;
        const datasetOk = !Array.isArray(testCase.expectedDatasetLabels)
            || !testCase.expectedDatasetLabels.length
            || testCase.expectedDatasetLabels.every((label) => (chart?.datasetLabels || []).includes(label));
        const datasetCountOk = !Number.isFinite(Number(testCase.expectedDatasetCountMin))
            || (chart?.datasetLabels || []).length >= Number(testCase.expectedDatasetCountMin);
        const municipalityCountOk = !Number.isFinite(Number(testCase.expectedMunicipalityCountMin))
            || (result.municipalities || []).length >= Number(testCase.expectedMunicipalityCountMin);

        return {
            ...testCase,
            count: result.count,
            chartMode: result.chartMode,
            chartType: chart?.type || null,
            headerTitle: result.headerTitle,
            firstTitle: firstPoll?.title || null,
            firstMunicipality: firstPoll?.municipality || null,
            municipalityCount: (result.municipalities || []).length,
            datasetLabels: chart?.datasetLabels || [],
            chartReason: result.chartReason || null,
            countOk,
            chartModeOk,
            chartTypeOk,
            chartReasonOk,
            headerOk,
            firstTitleOk,
            firstMunicipalityOk,
            datasetOk,
            datasetCountOk,
            municipalityCountOk,
            pass: countOk && chartModeOk && chartTypeOk && chartReasonOk && headerOk && firstTitleOk && firstMunicipalityOk && datasetOk && datasetCountOk && municipalityCountOk
        };
    });

    const failed = results.filter((entry) => !entry.pass);
    results.forEach((entry) => {
        const status = entry.pass ? 'PASS' : 'FAIL';
        console.log([
            status,
            entry.name,
            `count=${entry.count}`,
            `chartMode=${entry.chartMode}`,
            `chartType=${entry.chartType || '-'}`,
            `chartReason=${entry.chartReason || '-'}`,
            `municipalities=${entry.municipalityCount}`,
            `datasets=${entry.datasetLabels.join(',') || '-'}`,
            `header=${entry.headerOk}`,
            `firstTitle=${entry.firstTitleOk}`,
            `firstMunicipality=${entry.firstMunicipalityOk}`,
            `dataset=${entry.datasetOk}`,
            `datasetCount=${entry.datasetCountOk}`
        ].join(' | '));
    });

    if (failed.length) {
        console.error(`\n${failed.length} poll regression case(s) failed.`);
        process.exitCode = 1;
        return;
    }

    console.log(`\nAll ${results.length} poll regression cases passed.`);
}

main();
