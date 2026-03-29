// build.js — esbuild minify pipeline for korea-local-election
// Minifies each JS file individually (IIFE/global pattern, not ES modules)
// Output: .deploy_dist/js/ and .deploy_dist/css/ (mirrors src structure)

const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const DIST = '.deploy_dist';

// JS entryPoints in index.html load order
const JS_FILES = [
    'js/news_filters.js',
    'js/utils.js',
    'js/app-state.js',
    'js/data-loader.js',
    'js/data.js',
    'js/derived_issues.js',
    'js/issue_engine.js',
    'js/nec.js',
    'js/map.js',
    'js/charts.js',
    'js/election-calendar.js',
    'js/tabs/history-tab.js',
    'js/tabs/council-tab.js',
    'js/tabs/proportional-tab.js',
    'js/tabs/candidate-tab.js',
    'js/tabs/poll-tab.js',
    'js/tabs/overview-tab.js',
    'js/tabs/news-tab.js',
    'js/sidebar.js',
    'js/search.js',
    'js/views/election-views.js',
    'js/views/district-map.js',
    'js/router.js',
    'js/clarity-consent.js',
    'js/app.js',
];

const CSS_FILES = [
    'css/style.css',
];

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function minifyJS() {
    console.log('[build] Minifying JS files...');

    // Collect existing files only (skip missing)
    const existing = JS_FILES.filter(f => fs.existsSync(f));

    // Build output dirs
    const outDirs = [...new Set(existing.map(f => path.join(DIST, path.dirname(f))))];
    outDirs.forEach(ensureDir);

    // Use outbase to preserve js/ prefix in output path
    await esbuild.build({
        entryPoints: existing,
        outbase: '.',
        outdir: DIST,
        bundle: false,
        minify: true,
        target: ['es2020'],
        sourcemap: false,
        logLevel: 'warning',
    });

    console.log(`[build] JS: ${existing.length} files minified → ${DIST}/js/`);
}

async function minifyCSS() {
    console.log('[build] Minifying CSS files...');

    const existing = CSS_FILES.filter(f => fs.existsSync(f));
    const outDirs = [...new Set(existing.map(f => path.join(DIST, path.dirname(f))))];
    outDirs.forEach(ensureDir);

    await esbuild.build({
        entryPoints: existing,
        outbase: '.',
        outdir: DIST,
        bundle: false,
        minify: true,
        logLevel: 'warning',
    });

    console.log(`[build] CSS: ${existing.length} files minified → ${DIST}/css/`);
}

async function main() {
    const start = Date.now();
    try {
        await minifyJS();
        await minifyCSS();
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        console.log(`[build] Done in ${elapsed}s`);
    } catch (err) {
        console.error('[build] FAILED:', err.message);
        process.exit(1);
    }
}

main();
