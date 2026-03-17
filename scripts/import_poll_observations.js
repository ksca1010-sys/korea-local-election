#!/usr/bin/env node

const fs = require('fs');
const {
    archiveDir,
    archiveProcessedFile,
    casesPath,
    collectIncomingObservations,
    legacyQueuePath,
    queueDir,
    validateIncomingObservations
} = require('./poll_observation_utils');

function main() {
    const { activeSources, incoming, existing } = collectIncomingObservations();

    if (!activeSources.length) {
        console.log(`No queued observations in ${legacyQueuePath} or ${queueDir}`);
        return;
    }

    const { errors, warnings } = validateIncomingObservations(incoming, existing);
    if (warnings.length) {
        warnings.forEach((warning) => console.warn(`WARN ${warning}`));
    }
    if (errors.length) {
        errors.forEach((error) => console.error(`ERROR ${error}`));
        process.exitCode = 1;
        return;
    }

    const indexByName = new Map(existing.map((entry, index) => [entry.name, index]));

    let inserted = 0;
    let updated = 0;
    incoming.forEach((entry) => {
        const payload = {
            name: entry.name,
            regionKey: entry.regionKey,
            electionType: entry.electionType
        };

        if (entry.districtName) payload.districtName = entry.districtName;
        if (Number.isInteger(entry.expectedMinCount)) payload.expectedMinCount = entry.expectedMinCount;
        if (Number.isInteger(entry.expectedMaxCount)) payload.expectedMaxCount = entry.expectedMaxCount;
        if (entry.expectedChartMode) payload.expectedChartMode = entry.expectedChartMode;
        if (entry.expectedChartType) payload.expectedChartType = entry.expectedChartType;
        if (Number.isInteger(entry.expectedMunicipalityCountMin)) payload.expectedMunicipalityCountMin = entry.expectedMunicipalityCountMin;
        if (entry.expectedFirstMunicipality) payload.expectedFirstMunicipality = entry.expectedFirstMunicipality;
        if (entry.expectedHeaderIncludes?.length) payload.expectedHeaderIncludes = entry.expectedHeaderIncludes;
        if (entry.expectedFirstTitleIncludes?.length) payload.expectedFirstTitleIncludes = entry.expectedFirstTitleIncludes;
        if (entry.expectedDatasetLabels?.length) payload.expectedDatasetLabels = entry.expectedDatasetLabels;
        if (Number.isInteger(entry.expectedDatasetCountMin)) payload.expectedDatasetCountMin = entry.expectedDatasetCountMin;

        if (indexByName.has(entry.name)) {
            existing[indexByName.get(entry.name)] = payload;
            updated += 1;
        } else {
            existing.push(payload);
            inserted += 1;
        }
    });

    fs.writeFileSync(casesPath, `${JSON.stringify(existing, null, 2)}\n`, 'utf8');

    const timestampLabel = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    const archives = activeSources
        .map((entry) => archiveProcessedFile(entry.filePath, timestampLabel))
        .filter(Boolean);

    console.log(`Imported ${incoming.length} poll observation(s): ${inserted} inserted, ${updated} updated.`);
    console.log(`Updated ${casesPath}`);
    console.log(`Archived ${archives.length} processed queue file(s) to ${archiveDir}`);
}

main();
