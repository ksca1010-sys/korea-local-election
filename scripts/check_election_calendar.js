#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const baseDir = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(baseDir, 'js', 'election-calendar.js'), 'utf8');
const ctx = vm.createContext({
    console,
    Blob: function Blob() {},
    URL: { createObjectURL() { return ''; }, revokeObjectURL() {} },
    document: { createElement() { return {}; }, body: { appendChild() {}, removeChild() {} } }
});

vm.runInContext(source, ctx, { filename: 'js/election-calendar.js' });

const ElectionCalendar = vm.runInContext('ElectionCalendar', ctx);

const cases = [
    {
        name: 'before publication ban start',
        instant: '2026-05-27T14:59:59Z',
        banned: false
    },
    {
        name: 'at publication ban start',
        instant: '2026-05-27T15:00:00Z',
        banned: true
    },
    {
        name: 'before vote close',
        instant: '2026-06-03T08:59:59Z',
        banned: true
    },
    {
        name: 'at vote close',
        instant: '2026-06-03T09:00:00Z',
        banned: false
    },
    {
        name: 'new-york early false positive regression',
        instant: '2026-05-27T02:00:00Z',
        banned: false
    },
    {
        name: 'new-york early release regression',
        instant: '2026-06-02T21:00:00Z',
        banned: true
    }
];

const failures = cases.filter((entry) => {
    const actual = ElectionCalendar.isPublicationBanned(new Date(entry.instant));
    console.log(`${actual === entry.banned ? 'PASS' : 'FAIL'} | ${entry.name} | ${entry.instant} | banned=${actual}`);
    return actual !== entry.banned;
});

if (failures.length) {
    console.error(`\n${failures.length} election calendar case(s) failed.`);
    process.exitCode = 1;
} else {
    console.log(`\nAll ${cases.length} election calendar cases passed.`);
}
