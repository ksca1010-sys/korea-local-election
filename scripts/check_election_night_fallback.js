#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');

function createApp({ search = '', localStorageValue = null } = {}) {
    const fallbackContainer = { style: { display: 'unset' } };
    const context = {
        AbortSignal,
        URLSearchParams,
        console,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        window: {
            NewsFilterConfig: {},
            innerWidth: 1024,
            location: { search },
            localStorage: {
                getItem: () => localStorageValue
            },
            addEventListener: () => {}
        },
        localStorage: {
            getItem: () => localStorageValue
        },
        location: { hostname: 'localhost' },
        document: {
            readyState: 'loading',
            body: {
                classList: {
                    toggle: () => {}
                }
            },
            addEventListener: () => {},
            getElementById: (id) => id === 'manual-fallback-container' ? fallbackContainer : null
        },
        Sidebar: { applyTermTooltips: () => {} },
        ElectionViews: {
            onSubdistrictSelected: () => {},
            onByElectionSelected: () => {}
        }
    };

    vm.createContext(context);
    const app = vm.runInContext(`${source}\nApp;`, context, { filename: 'js/app.js' });
    return { app, fallbackContainer };
}

{
    const { app, fallbackContainer } = createApp();
    app._setManualFallbackMode(true);
    assert.strictEqual(
        fallbackContainer.style.display,
        'none',
        'manual fallback must stay hidden for public users'
    );
}

{
    const { app, fallbackContainer } = createApp({ search: '?manualFallback=1' });
    app._setManualFallbackMode(true);
    assert.strictEqual(
        fallbackContainer.style.display,
        'block',
        'manual fallback should be available with manualFallback=1'
    );
}

{
    const { app, fallbackContainer } = createApp({ search: '?adminFallback=1' });
    app._setManualFallbackMode(true);
    assert.strictEqual(
        fallbackContainer.style.display,
        'block',
        'manual fallback should be available with adminFallback=1'
    );
}

{
    const { app, fallbackContainer } = createApp({ localStorageValue: '1' });
    app._setManualFallbackMode(true);
    assert.strictEqual(
        fallbackContainer.style.display,
        'block',
        'manual fallback should be available with the localStorage operator flag'
    );

    app._setManualFallbackMode(false);
    assert.strictEqual(
        fallbackContainer.style.display,
        'none',
        'manual fallback should hide when disabled even with the operator flag'
    );
}

console.log('election-night fallback gating passed');
