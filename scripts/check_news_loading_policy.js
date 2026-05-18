#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'tabs', 'news-tab.js'), 'utf8');

const checks = [
    {
        name: 'news requests use timeout wrapper',
        pass: source.includes('function fetchWithTimeout(')
            && source.includes('/api/news')
            && source.includes('/api/gnews')
            && (source.match(/fetchWithTimeout\(/g) || []).length >= 4
    },
    {
        name: 'google rss is not part of blocking Promise.all',
        pass: !/Promise\.all\(\s*\[\s*Promise\.allSettled\([^]*fetchGoogleNews/.test(source)
            && source.includes('NEWS_GNEWS_GRACE_MS')
            && source.includes('Promise.race')
    },
    {
        name: 'category prefetch is bounded',
        pass: source.includes('NEWS_PREFETCH_QUERY_LIMIT')
            && /queries\.slice\(0,\s*NEWS_PREFETCH_QUERY_LIMIT\)/.test(source)
            && source.includes('NEWS_PREFETCH_TIMEOUT_MS')
    },
    {
        name: 'stale cache can render before refresh',
        pass: source.includes('NEWS_STALE_CACHE_TTL_MS')
            && source.includes('_loadNewsCachePayload')
            && source.includes('먼저 표시하고 새 기사를 확인 중')
    }
];

const failed = checks.filter(check => !check.pass);

checks.forEach(check => {
    console.log(`${check.pass ? 'PASS' : 'FAIL'} | ${check.name}`);
});

if (failed.length) {
    console.error(`\nnews loading policy failed: ${failed.length}/${checks.length}`);
    process.exitCode = 1;
    return;
}

console.log(`\nnews loading policy passed: ${checks.length}/${checks.length}`);
