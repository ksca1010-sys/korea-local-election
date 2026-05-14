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
        addEventListener() {},
        removeEventListener() {},
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
    ctx.window.LocalMediaPool = JSON.parse(
        fs.readFileSync(path.join(baseDir, 'data', 'local_media_pool.json'), 'utf8')
    );

    loadScript(ctx, 'js/news_filters.js');
    loadScript(ctx, 'js/utils.js');
    loadScript(ctx, 'js/election-calendar.js');
    loadScript(ctx, 'js/data.js');
    loadScript(ctx, 'js/tabs/poll-tab.js');
    loadScript(ctx, 'js/tabs/news-tab.js');

    const electionData = vm.runInContext('ElectionData', ctx);
    electionData._pollsCache = JSON.parse(
        fs.readFileSync(path.join(baseDir, 'data', 'polls', 'polls.json'), 'utf8')
    );
    electionData._mayorCandidatesCache = JSON.parse(
        fs.readFileSync(path.join(baseDir, 'data', 'candidates', 'mayor_candidates.json'), 'utf8')
    );

    const newsTab = vm.runInContext('NewsTab', ctx);
    const pollTab = vm.runInContext('PollTab', ctx);
    const app = {
        __debug: {
            evaluateNewsCase: newsTab?.evaluateNewsCase || null,
            buildNewsQueryPlan: newsTab?.buildNewsQueryPlan || null,
            buildPollSelection: pollTab?.buildSelection || null
        }
    };
    if (!app.__debug.evaluateNewsCase || !app.__debug.buildNewsQueryPlan || !app.__debug.buildPollSelection) {
        throw new Error('Debug helpers are unavailable');
    }

    return { ctx, app };
}

module.exports = {
    baseDir,
    loadAppDebug
};
