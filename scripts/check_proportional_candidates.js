#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const baseDir = path.resolve(__dirname, '..');
const proportionalPath = path.join(baseDir, 'data/candidates/proportional.json');

function fail(message) {
    console.error(`FAIL ${message}`);
    process.exitCode = 1;
}

function countCandidates(data) {
    let council = 0;
    let local = 0;

    for (const region of Object.values(data.council_proportional || {})) {
        for (const party of region.parties || []) {
            council += (party.candidates || []).length;
        }
    }

    for (const region of Object.values(data.local_council_proportional || {})) {
        for (const sigungu of Object.values(region.sigungus || {})) {
            for (const party of sigungu.parties || []) {
                local += (party.candidates || []).length;
            }
        }
    }

    return { council, local };
}

function validateCandidates(data) {
    const errors = [];

    const checkCandidate = (candidate, location) => {
        if (!candidate.name) errors.push(`${location}: 후보자 이름 없음`);
        if (!candidate.partyName) errors.push(`${location} ${candidate.name || ''}: partyName 없음`);
        if (candidate.status !== 'NOMINATED') errors.push(`${location} ${candidate.name}: status=${candidate.status}`);
        if (candidate.officialStatus !== '등록') errors.push(`${location} ${candidate.name}: officialStatus=${candidate.officialStatus}`);
        if (candidate.dataSource !== 'nec_official') errors.push(`${location} ${candidate.name}: dataSource=${candidate.dataSource}`);
        if (candidate.sgTypecode !== '8' && candidate.sgTypecode !== '9') errors.push(`${location} ${candidate.name}: sgTypecode=${candidate.sgTypecode}`);
    };

    for (const [regionKey, region] of Object.entries(data.council_proportional || {})) {
        for (const party of region.parties || []) {
            if (!Array.isArray(party.candidates)) errors.push(`${regionKey} ${party.partyName || party.party}: candidates 배열 아님`);
            for (const candidate of party.candidates || []) {
                checkCandidate(candidate, `${regionKey} ${party.partyName || party.party}`);
                if (candidate.sgTypecode !== '8') errors.push(`${regionKey} ${candidate.name}: 광역비례 sgTypecode가 8이 아님`);
            }
        }
    }

    for (const [regionKey, region] of Object.entries(data.local_council_proportional || {})) {
        for (const [sigunguName, sigungu] of Object.entries(region.sigungus || {})) {
            for (const party of sigungu.parties || []) {
                if (!Array.isArray(party.candidates)) errors.push(`${regionKey} ${sigunguName} ${party.partyName || party.party}: candidates 배열 아님`);
                for (const candidate of party.candidates || []) {
                    checkCandidate(candidate, `${regionKey} ${sigunguName} ${party.partyName || party.party}`);
                    if (candidate.sgTypecode !== '9') errors.push(`${regionKey} ${sigunguName} ${candidate.name}: 기초비례 sgTypecode가 9가 아님`);
                }
            }
        }
    }

    return errors;
}

function main() {
    const data = JSON.parse(fs.readFileSync(proportionalPath, 'utf8'));
    const meta = data._meta || {};
    const counts = countCandidates(data);
    const expectedCouncil = meta.officialCounts?.councilProportional;
    const expectedLocal = meta.officialCounts?.localCouncilProportional;

    if (meta.officialSyncMode !== 'replace_registered_proportional_candidates') {
        fail(`officialSyncMode가 정식 비례 후보 동기화 상태가 아님: ${meta.officialSyncMode}`);
    }
    if (counts.council !== expectedCouncil) {
        fail(`광역비례 후보 수 불일치: ${counts.council} != ${expectedCouncil}`);
    }
    if (counts.local !== expectedLocal) {
        fail(`기초비례 후보 수 불일치: ${counts.local} != ${expectedLocal}`);
    }
    if (counts.council <= 0 || counts.local <= 0) {
        fail(`후보 수가 비정상입니다: council=${counts.council}, local=${counts.local}`);
    }

    const gwangjuPpp = data.council_proportional?.gwangju?.parties?.find((party) => party.partyName === '국민의힘');
    if (!gwangjuPpp || gwangjuPpp.candidates.length <= 0) {
        fail('광주광역시 광역의원 비례대표 국민의힘 후보가 비어 있음');
    }

    const fieldErrors = validateCandidates(data);
    if (fieldErrors.length) {
        fieldErrors.slice(0, 20).forEach((entry) => fail(entry));
    }

    if (process.exitCode) return;
    console.log(`PASS proportional candidates: council=${counts.council}, local=${counts.local}, updated=${meta.lastUpdated || 'unknown'}`);
}

main();
