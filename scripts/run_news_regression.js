#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { loadAppDebug } = require('./news_debug_runtime');
const casesPath = path.join(__dirname, 'news_regression_cases.json');

function main() {
    const cases = JSON.parse(fs.readFileSync(casesPath, 'utf8'));
    const { app } = loadAppDebug();

    const results = cases.map((testCase) => {
        const result = app.__debug.evaluateNewsCase(testCase);
        const queryPlan = app.__debug.buildNewsQueryPlan(testCase);
        const expectedPrimaryIncludes = Array.isArray(testCase.expectedPrimaryIncludes) ? testCase.expectedPrimaryIncludes : [];
        const expectedSecondaryIncludes = Array.isArray(testCase.expectedSecondaryIncludes) ? testCase.expectedSecondaryIncludes : [];
        const localityOk = Number.isFinite(Number(testCase.expectedLocalityMin))
            ? result.localityScore >= Number(testCase.expectedLocalityMin)
            : true;
        const queryPrimaryOk = expectedPrimaryIncludes.every((needle) =>
            queryPlan.primaryQueries.some((query) => query.includes(needle))
        );
        const querySecondaryOk = expectedSecondaryIncludes.every((needle) =>
            queryPlan.secondaryQueries.some((query) => query.includes(needle))
        );
        return {
            ...testCase,
            effectiveOk: result.effectiveOk,
            strictOk: result.strict.ok,
            relaxedOk: result.relaxed.ok,
            localityScore: result.localityScore,
            credibilityScore: result.credibilityScore,
            host: result.host,
            localityOk,
            queryPrimaryOk,
            querySecondaryOk,
            pass: result.effectiveOk === testCase.expectedOk && localityOk && queryPrimaryOk && querySecondaryOk
        };
    });

    const failed = results.filter((entry) => !entry.pass);
    results.forEach((entry) => {
        const status = entry.pass ? 'PASS' : 'FAIL';
        console.log([
            status,
            entry.name,
            `expected=${entry.expectedOk}`,
            `actual=${entry.effectiveOk}`,
            `strict=${entry.strictOk}`,
            `relaxed=${entry.relaxedOk}`,
            `locality=${entry.localityScore.toFixed(2)}`,
            `localityCheck=${entry.localityOk}`,
            `cred=${entry.credibilityScore.toFixed(2)}`,
            `queryPrimary=${entry.queryPrimaryOk}`,
            `querySecondary=${entry.querySecondaryOk}`,
            entry.host || '-'
        ].join(' | '));
    });

    if (failed.length) {
        console.error(`\n${failed.length} regression case(s) failed.`);
        process.exitCode = 1;
        return;
    }

    console.log(`\nAll ${results.length} regression cases passed.`);
}

main();
