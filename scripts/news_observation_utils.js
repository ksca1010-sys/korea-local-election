const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const baseDir = path.resolve(__dirname, '..');
const dataDir = path.join(baseDir, 'data');
const legacyQueuePath = path.join(dataDir, 'news_observation_queue.tsv');
const observationRoot = path.join(dataDir, 'news_observations');
const queueDir = path.join(observationRoot, 'queue');
const archiveDir = path.join(observationRoot, 'archive');
const casesPath = path.join(__dirname, 'news_regression_cases.json');

const REQUIRED_HEADERS = [
    'name',
    'regionKey',
    'categoryId',
    'electionType',
    'districtName',
    'title',
    'description',
    'link',
    'expectedOk',
    'note'
];
const HEADER_LINE = `${REQUIRED_HEADERS.join('\t')}\n`;

const VALID_REGION_KEYS = new Set([
    'seoul', 'busan', 'daegu', 'incheon', 'gwangju', 'daejeon', 'ulsan', 'sejong',
    'gyeonggi', 'gangwon', 'chungbuk', 'chungnam', 'jeonbuk', 'jeonnam', 'gyeongbuk', 'gyeongnam', 'jeju'
]);

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

function parseBoolean(value, lineNo, sourcePath) {
    const normalized = String(value || '').trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'ok', 'pass'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n', 'reject', 'fail'].includes(normalized)) return false;
    throw new Error(`Invalid expectedOk at ${sourcePath}:${lineNo}: ${value}`);
}

function createCaseName(row) {
    if (row.name) return row.name;
    const basis = [
        row.regionKey,
        row.categoryId || 'all',
        row.electionType || 'governor',
        row.districtName || '',
        row.title || '',
        row.expectedOk
    ].join('|');
    const digest = crypto.createHash('sha1').update(basis).digest('hex').slice(0, 8);
    return `${row.regionKey}-${row.expectedOk ? 'accept' : 'reject'}-${digest}`;
}

function normalizeRow(row) {
    if (!row.regionKey) throw new Error(`regionKey is required at ${row.__sourcePath}:${row.__line}`);
    if (!VALID_REGION_KEYS.has(row.regionKey)) {
        throw new Error(`Unknown regionKey at ${row.__sourcePath}:${row.__line}: ${row.regionKey}`);
    }
    if (!row.title) throw new Error(`title is required at ${row.__sourcePath}:${row.__line}`);

    const expectedOk = parseBoolean(row.expectedOk, row.__line, row.__sourcePath);
    return {
        name: createCaseName({ ...row, expectedOk }),
        regionKey: row.regionKey,
        categoryId: row.categoryId || 'all',
        electionType: row.electionType || 'governor',
        districtName: row.districtName || undefined,
        title: row.title,
        description: row.description || '',
        link: row.link || 'https://example.com/manual-observation',
        expectedOk,
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

function getQueueRegionKey(filePath) {
    if (path.resolve(filePath) === path.resolve(legacyQueuePath)) return null;
    if (!filePath.startsWith(queueDir)) return null;
    return path.basename(filePath, '.tsv');
}

function buildObservationSignature(entry) {
    return [
        entry.regionKey,
        entry.categoryId || 'all',
        entry.electionType || 'governor',
        entry.districtName || '',
        entry.title || '',
        String(entry.expectedOk)
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
