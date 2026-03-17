#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { baseDir, loadAppDebug } = require('./news_debug_runtime');

const registryPath = path.join(baseDir, 'data', 'local_media_registry.json');
const overridesPath = path.join(baseDir, 'data', 'local_media_registry_overrides.json');

function buildOfficeLabel(districtName) {
    if (districtName.endsWith('군')) return `${districtName}수`;
    if (districtName.endsWith('구')) return `${districtName}청장`;
    if (districtName.endsWith('시')) return `${districtName}장`;
    return districtName;
}

function buildSyntheticCase(regionKey, regionEntry, districtName, municipalityEntry) {
    const host = municipalityEntry.hosts.tier1[0];
    const outletName = municipalityEntry.priorityNames?.[0]
        || regionEntry.province.priorityNames?.[0]
        || host;
    const officeLabel = buildOfficeLabel(districtName);

    return {
        name: `${regionKey}-${districtName}-registry-host`,
        regionKey,
        electionType: 'mayor',
        districtName,
        categoryId: 'all',
        title: `${outletName}, ${officeLabel} 후보 공약 발표`,
        description: `${officeLabel} 선거에서 지역 현안 공약 경쟁`,
        link: `https://${host}/news/articleView.html?idxno=1000001`,
        expectedOk: true,
        expectedLocalityMin: 1,
        expectedPrimaryIncludes: [`site:${host}`]
    };
}

function main() {
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    const overrides = JSON.parse(fs.readFileSync(overridesPath, 'utf8'));
    const { app } = loadAppDebug();

    const checks = [];
    const missingRegistryEntries = [];
    const missingRegistryHosts = [];

    Object.entries(overrides.regions || {}).forEach(([regionKey, regionOverride]) => {
        const regionEntry = registry.regions?.[regionKey];
        Object.entries(regionOverride.municipalities || {}).forEach(([districtName, municipalityOverride]) => {
            const tier1Hosts = Array.isArray(municipalityOverride.tier1Hosts) ? municipalityOverride.tier1Hosts : [];
            if (!tier1Hosts.length) return;

            const municipalityEntry = regionEntry?.municipalities?.[districtName];
            if (!municipalityEntry) {
                missingRegistryEntries.push(`${regionKey}:${districtName}`);
                return;
            }

            const registryHosts = municipalityEntry.hosts?.tier1 || [];
            const primaryHost = tier1Hosts[0];
            if (!registryHosts.includes(primaryHost)) {
                missingRegistryHosts.push(`${regionKey}:${districtName}:${primaryHost}`);
                return;
            }

            const testCase = buildSyntheticCase(regionKey, regionEntry, districtName, municipalityEntry);
            const result = app.__debug.evaluateNewsCase(testCase);
            const queryPlan = app.__debug.buildNewsQueryPlan(testCase);
            const queryPrimaryOk = queryPlan.primaryQueries.some((query) => query.includes(`site:${primaryHost}`));
            const localityOk = result.localityScore >= 1;
            const pass = result.effectiveOk === true && queryPrimaryOk && localityOk;

            checks.push({
                districtName,
                regionKey,
                host: primaryHost,
                localityScore: result.localityScore,
                effectiveOk: result.effectiveOk,
                queryPrimaryOk,
                pass
            });
        });
    });

    checks.forEach((entry) => {
        const status = entry.pass ? 'PASS' : 'FAIL';
        console.log([
            status,
            `${entry.regionKey}:${entry.districtName}`,
            entry.host,
            `effective=${entry.effectiveOk}`,
            `locality=${entry.localityScore.toFixed(2)}`,
            `queryPrimary=${entry.queryPrimaryOk}`
        ].join(' | '));
    });

    if (missingRegistryEntries.length) {
        console.error(`\nMissing generated registry entries for ${missingRegistryEntries.length} municipality mappings.`);
        missingRegistryEntries.forEach((entry) => console.error(entry));
        process.exitCode = 1;
        return;
    }

    if (missingRegistryHosts.length) {
        console.error(`\nMissing generated registry hosts for ${missingRegistryHosts.length} municipality mappings.`);
        missingRegistryHosts.forEach((entry) => console.error(entry));
        process.exitCode = 1;
        return;
    }

    const failed = checks.filter((entry) => !entry.pass);
    if (failed.length) {
        console.error(`\n${failed.length} registry host check(s) failed.`);
        process.exitCode = 1;
        return;
    }

    console.log(`\nAll ${checks.length} municipality host checks passed.`);
}

main();
