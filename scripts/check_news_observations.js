#!/usr/bin/env node

const {
    collectIncomingObservations,
    legacyQueuePath,
    queueDir,
    validateIncomingObservations
} = require('./news_observation_utils');

function main() {
    const { activeSources, incoming, existing } = collectIncomingObservations();

    if (!activeSources.length) {
        console.log(`No queued observations in ${legacyQueuePath} or ${queueDir}`);
        return;
    }

    const { errors, warnings } = validateIncomingObservations(incoming, existing);

    const regionCounts = incoming.reduce((acc, entry) => {
        acc.set(entry.regionKey, (acc.get(entry.regionKey) || 0) + 1);
        return acc;
    }, new Map());

    Array.from(regionCounts.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .forEach(([regionKey, count]) => {
            console.log(`QUEUE | ${regionKey} | ${count}`);
        });

    warnings.forEach((warning) => console.warn(`WARN ${warning}`));
    errors.forEach((error) => console.error(`ERROR ${error}`));

    if (errors.length) {
        console.error(`\nObservation validation failed with ${errors.length} error(s).`);
        process.exitCode = 1;
        return;
    }

    console.log(`\nValidated ${incoming.length} queued observation(s) across ${regionCounts.size} region(s).`);
}

main();
