const fs = require('fs');
const path = require('path');
const vm = require('vm');

const baseDir = path.resolve(__dirname, '..');

function createStubElement() {
    return {
        style: {},
        classList: { add() {}, remove() {}, toggle() {} },
        addEventListener() {},
        removeEventListener() {},
        appendChild() {},
        querySelector() { return null; },
        querySelectorAll() { return []; },
        setAttribute() {},
        getAttribute() { return null; },
        closest() { return null; },
        remove() {},
        innerHTML: '',
        textContent: '',
        value: '',
        title: ''
    };
}

function buildContext() {
    const documentStub = {
        readyState: 'loading',
        addEventListener() {},
        removeEventListener() {},
        getElementById() { return null; },
        querySelector() { return null; },
        querySelectorAll() { return []; },
        createElement() { return createStubElement(); },
        body: createStubElement()
    };

    const context = {
        console,
        window: {},
        document: documentStub,
        location: { hostname: 'localhost', hash: '' },
        history: { replaceState() {} },
        navigator: { userAgent: 'node' },
        URL,
        URLSearchParams,
        setTimeout,
        clearTimeout,
        setInterval() { return 0; },
        clearInterval() {},
        Event: function Event(type) { this.type = type; },
        fetch: async () => ({ ok: false, json: async () => null }),
        d3: {},
        MapModule: {},
        performance: { now: () => Date.now() }
    };

    context.window = context;
    context.global = context;
    return vm.createContext(context);
}

function loadScript(ctx, relativePath) {
    const filePath = path.join(baseDir, relativePath);
    const source = fs.readFileSync(filePath, 'utf8');
    vm.runInContext(source, ctx, { filename: filePath });
}

function loadAppDebug() {
    const ctx = buildContext();
    ctx.window.LocalMediaRegistry = JSON.parse(
        fs.readFileSync(path.join(baseDir, 'data', 'local_media_registry.json'), 'utf8')
    );

    loadScript(ctx, 'js/news_filters.js');
    loadScript(ctx, 'js/data.js');
    loadScript(ctx, 'js/app.js');

    const electionData = vm.runInContext('ElectionData', ctx);
    electionData._pollsCache = JSON.parse(
        fs.readFileSync(path.join(baseDir, 'data', 'polls', 'polls.json'), 'utf8')
    );

    const app = vm.runInContext('App', ctx);
    if (!app?.__debug?.evaluateNewsCase || !app?.__debug?.buildNewsQueryPlan || !app?.__debug?.buildPollSelection) {
        throw new Error('App.__debug helpers are unavailable');
    }

    return { ctx, app };
}

module.exports = {
    baseDir,
    loadAppDebug
};
