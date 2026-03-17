const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const baseDir = path.resolve(__dirname, '..');
const dataDir = path.join(baseDir, 'data');
const legacyQueuePath = path.join(dataDir, 'poll_observation_queue.tsv');
const observationRoot = path.join(dataDir, 'poll_observations');
const queueDir = path.join(observationRoot, 'queue');
const archiveDir = path.join(observationRoot, 'archive');
const casesPath = path.join(__dirname, 'poll_regression_cases.json');

const REQUIRED_HEADERS = [
    'name',
    'regionKey',
    'electionType',
    'districtName',
    'expectedMinCount',
    'expectedMaxCount',
    'expectedChartMode',
    'expectedChartType',
    'expectedMunicipalityCountMin',
    'expectedFirstMunicipality',
    'expectedHeaderIncludes',
    'expectedFirstTitleIncludes',
    'expectedDatasetLabels',
    'expectedDatasetCountMin',
    'note'
];
const HEADER_LINE = `${REQUIRED_HEADERS.join('\t')}\n`;

const VALID_REGION_KEYS = new Set([
    'seoul', 'busan', 'daegu', 'incheon', 'gwangju', 'daejeon', 'ulsan', 'sejong',
    'gyeonggi', 'gangwon', 'chungbuk', 'chungnam', 'jeonbuk', 'jeonnam', 'gyeongbuk', 'gyeongnam', 'jeju'
]);

const VALID_ELECTION_TYPES = new Set(['governor', 'mayor', 'superintendent']);
const VALID_CHART_MODES = new Set(['trend', 'activity']);
const VALID_CHART_TYPES = new Set(['line', 'bar']);

function ensureQueueInfrastructure() {
    fs.mkdirSync(queueDir, { recursive: true });
    fs.mkdirSync(archiveDir, { recursive: true });
    if (!fs.existsSync(legacyQueuePath)) {
        fs.writeFileSync(legacyQueuePath, HEADER_LINE, 'utf8');
    }
}

function listQueueFiles() {
    const files = [];
    if (fs.existsSync(legacyQueuePath)) files.push(legacyQueuePath);
    if (fs.existsSync(queueDir)) {
        const regionalFiles = fs.readdirSync(queueDir)
            .filter((name) => name.endsWith('.tsv') && !name.startsWith('_') && !name.startsWith('.'))
            .sort()
            .map((name) => path.join(queueDir, name));
        files.push(...regionalFiles);
    }
    return files;
}

function getQueueRegionKey(filePath) {
    if (path.resolve(filePath) === path.resolve(legacyQueuePath)) return null;
    if (!filePath.startsWith(queueDir)) return null;
    return path.basename(filePath, '.tsv');
}

function readTsv(filePath) {
    const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
    const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (!lines.length) return [];

    const headers = lines[0].split('\t').map((value) => value.trim());
    const missing = REQUIRED_HEADERS.filter((header) => !headers.includes(header));
    if (missing.length) {
        throw new Error(`Missing TSV headers in ${filePath}: ${missing.join(', ')}`);
    }

    return lines.slice(1).map((line, index) => {
        const cells = line.split('\t');
        const row = {};
        headers.forEach((header, headerIndex) => {
            row[header] = String(cells[headerIndex] || '').trim();
        });
        row.__line = index + 2;
        row.__sourcePath = filePath;
        row.__queueRegionKey = getQueueRegionKey(filePath);
        return row;
    }).filter((row) => REQUIRED_HEADERS.some((header) => String(row[header] || '').trim().length > 0));
}

function parseInteger(value, fieldName, lineNo, sourcePath) {
    const normalized = String(value || '').trim();
    if (!normalized) return undefined;
    if (!/^-?\d+$/.test(normalized)) {
        throw new Error(`Invalid ${fieldName} at ${sourcePath}:${lineNo}: ${value}`);
    }
    return Number(normalized);
}

function parseList(value) {
    return String(value || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
}

function createCaseName(row) {
    if (row.name) return row.name;
    const basis = [
        row.regionKey,
        row.electionType || 'governor',
        row.districtName || '',
        row.expectedChartMode || '',
        row.expectedChartType || ''
    ].join('|');
    const digest = crypto.createHash('sha1').update(basis).digest('hex').slice(0, 8);
    return `${row.regionKey}-${row.electionType || 'governor'}-${digest}`;
}

function normalizeRow(row) {
    if (!row.regionKey) throw new Error(`regionKey is required at ${row.__sourcePath}:${row.__line}`);
    if (!VALID_REGION_KEYS.has(row.regionKey)) {
        throw new Error(`Unknown regionKey at ${row.__sourcePath}:${row.__line}: ${row.regionKey}`);
    }

    const electionType = row.electionType || 'governor';
    if (!VALID_ELECTION_TYPES.has(electionType)) {
        throw new Error(`Unknown electionType at ${row.__sourcePath}:${row.__line}: ${electionType}`);
    }

    const expectedChartMode = row.expectedChartMode || undefined;
    if (expectedChartMode && !VALID_CHART_MODES.has(expectedChartMode)) {
        throw new Error(`Unknown expectedChartMode at ${row.__sourcePath}:${row.__line}: ${expectedChartMode}`);
    }

    const expectedChartType = row.expectedChartType || undefined;
    if (expectedChartType && !VALID_CHART_TYPES.has(expectedChartType)) {
        throw new Error(`Unknown expectedChartType at ${row.__sourcePath}:${row.__line}: ${expectedChartType}`);
    }

    return {
        name: createCaseName(row),
        regionKey: row.regionKey,
        electionType,
        districtName: row.districtName || undefined,
        expectedMinCount: parseInteger(row.expectedMinCount, 'expectedMinCount', row.__line, row.__sourcePath),
        expectedMaxCount: parseInteger(row.expectedMaxCount, 'expectedMaxCount', row.__line, row.__sourcePath),
        expectedChartMode,
        expectedChartType,
        expectedMunicipalityCountMin: parseInteger(row.expectedMunicipalityCountMin, 'expectedMunicipalityCountMin', row.__line, row.__sourcePath),
        expectedFirstMunicipality: row.expectedFirstMunicipality || undefined,
        expectedHeaderIncludes: parseList(row.expectedHeaderIncludes),
        expectedFirstTitleIncludes: parseList(row.expectedFirstTitleIncludes),
        expectedDatasetLabels: parseList(row.expectedDatasetLabels),
        expectedDatasetCountMin: parseInteger(row.expectedDatasetCountMin, 'expectedDatasetCountMin', row.__line, row.__sourcePath),
        note: row.note || '',
        __sourcePath: row.__sourcePath,
        __line: row.__line,
        __queueRegionKey: row.__queueRegionKey
    };
}

function sanitizeArchiveName(filePath) {
    return path.relative(dataDir, filePath).replace(/[\\/]/g, '__');
}

function archiveProcessedFile(filePath, timestampLabel) {
    const raw = fs.readFileSync(filePath, 'utf8');
    const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (lines.length <= 1) return null;

    const archiveName = `${timestampLabel}__${sanitizeArchiveName(filePath)}`;
    const archivePath = path.join(archiveDir, archiveName);
    fs.writeFileSync(archivePath, raw.endsWith('\n') ? raw : `${raw}\n`, 'utf8');
    fs.writeFileSync(filePath, HEADER_LINE, 'utf8');
    return archivePath;
}

function buildObservationSignature(entry) {
    return [
        entry.regionKey,
        entry.electionType || 'governor',
        entry.districtName || '',
        entry.expectedChartMode || '',
        entry.expectedChartType || ''
    ].join('|');
}

function collectIncomingObservations() {
    ensureQueueInfrastructure();
    const queueFiles = listQueueFiles();
    const sourceEntries = queueFiles.map((filePath) => ({
        filePath,
        rows: readTsv(filePath)
    }));
    const activeSources = sourceEntries.filter((entry) => entry.rows.length > 0);
    const incoming = activeSources.flatMap((entry) => entry.rows.map(normalizeRow));

    return {
        queueFiles,
        activeSources,
        incoming,
        existing: JSON.parse(fs.readFileSync(casesPath, 'utf8'))
    };
}

function validateIncomingObservations(incoming, existing) {
    const errors = [];
    const warnings = [];
    const nameIndex = new Map();
    const signatureIndex = new Map();
    const existingSignatureIndex = new Map(existing.map((entry) => [buildObservationSignature(entry), entry.name]));

    incoming.forEach((entry) => {
        const location = `${entry.__sourcePath}:${entry.__line}`;

        if (entry.__queueRegionKey && entry.regionKey !== entry.__queueRegionKey) {
            errors.push(`${location} regionKey mismatch: file=${entry.__queueRegionKey}, row=${entry.regionKey}`);
        }

        if (nameIndex.has(entry.name)) {
            errors.push(`${location} duplicate name with ${nameIndex.get(entry.name)}`);
        } else {
            nameIndex.set(entry.name, location);
        }

        const signature = buildObservationSignature(entry);
        if (signatureIndex.has(signature)) {
            errors.push(`${location} duplicate observation signature with ${signatureIndex.get(signature)}`);
        } else {
            signatureIndex.set(signature, location);
        }

        const existingName = existingSignatureIndex.get(signature);
        if (existingName && existingName !== entry.name) {
            warnings.push(`${location} matches existing case signature ${existingName} with a different name`);
        }
    });

    return { errors, warnings };
}

module.exports = {
    archiveDir,
    archiveProcessedFile,
    baseDir,
    casesPath,
    collectIncomingObservations,
    ensureQueueInfrastructure,
    HEADER_LINE,
    legacyQueuePath,
    listQueueFiles,
    normalizeRow,
    queueDir,
    readTsv,
    validateIncomingObservations
};
