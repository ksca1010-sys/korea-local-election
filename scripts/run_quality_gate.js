#!/usr/bin/env node

const { spawnSync } = require('child_process');
const path = require('path');

const baseDir = path.resolve(__dirname, '..');

const checks = [
    { name: 'news-observations', command: 'node', args: ['scripts/check_news_observations.js'] },
    { name: 'poll-observations', command: 'node', args: ['scripts/check_poll_observations.js'] },
    { name: 'news-regression', command: 'node', args: ['scripts/run_news_regression.js'] },
    { name: 'poll-regression', command: 'node', args: ['scripts/run_poll_regression.js'] },
    { name: 'local-media', command: 'node', args: ['scripts/check_local_media_registry.js'] }
];

function runCheck(check) {
    console.log(`\n== ${check.name} ==`);
    const result = spawnSync(check.command, check.args, {
        cwd: baseDir,
        encoding: 'utf8',
        stdio: 'pipe'
    });

    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);

    return {
        name: check.name,
        status: result.status === 0 ? 'PASS' : 'FAIL',
        code: result.status ?? 1
    };
}

function main() {
    const results = checks.map(runCheck);
    const failed = results.filter((entry) => entry.status !== 'PASS');

    console.log('\n== summary ==');
    results.forEach((entry) => {
        console.log(`${entry.status} ${entry.name}`);
    });

    if (failed.length) {
        console.error(`\nquality gate failed: ${failed.length}/${results.length}`);
        process.exitCode = 1;
        return;
    }

    console.log(`\nquality gate passed: ${results.length}/${results.length}`);
}

main();
