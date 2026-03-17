#!/usr/bin/env node
/**
 * data.js의 하드코딩 후보 데이터를 data/candidates/governor.json으로 추출
 * 한 번만 실행하면 됨 (초기 마이그레이션용)
 */
const fs = require('fs');
const path = require('path');

const dataJsPath = path.join(__dirname, '../../js/data.js');
const outputPath = path.join(__dirname, '../../data/candidates/governor.json');

const content = fs.readFileSync(dataJsPath, 'utf8');

// regions 객체에서 각 지역의 candidates 배열 추출
const regionKeys = [
    'seoul', 'busan', 'daegu', 'incheon', 'gwangju', 'daejeon', 'ulsan', 'sejong',
    'gyeonggi', 'gangwon', 'chungbuk', 'chungnam', 'jeonbuk', 'jeonnam', 'gyeongbuk', 'gyeongnam', 'jeju'
];

const result = {
    _meta: {
        version: '1.0.0',
        lastUpdated: new Date().toISOString().split('T')[0],
        source: 'manual (data.js export)',
        electionType: 'governor',
        description: '2026 6.3 지방선거 광역단체장 후보 데이터'
    },
    candidates: {}
};

regionKeys.forEach(key => {
    // candidates: [ ... ] 패턴을 찾아서 해당 지역의 candidates 추출
    // 지역 블록 시작을 찾음
    const regionPattern = new RegExp(`'${key}':\\s*\\{`);
    const regionMatch = content.match(regionPattern);
    if (!regionMatch) {
        console.warn(`Region ${key} not found`);
        result.candidates[key] = [];
        return;
    }

    const regionStart = content.indexOf(regionMatch[0]);
    // candidates: [ 찾기
    const candidatesStart = content.indexOf('candidates: [', regionStart);
    if (candidatesStart === -1 || candidatesStart > regionStart + 5000) {
        console.warn(`Candidates not found for ${key}`);
        result.candidates[key] = [];
        return;
    }

    // 대괄호 매칭으로 배열 끝 찾기
    let depth = 0;
    let arrayStart = content.indexOf('[', candidatesStart);
    let i = arrayStart;
    for (; i < content.length; i++) {
        if (content[i] === '[') depth++;
        if (content[i] === ']') {
            depth--;
            if (depth === 0) break;
        }
    }
    const arrayStr = content.substring(arrayStart, i + 1);

    // JS 객체 문법을 JSON으로 변환
    let jsonStr = arrayStr
        .replace(/(\w+):/g, '"$1":')    // key: → "key":
        .replace(/'/g, '"')              // ' → "
        .replace(/,\s*]/g, ']')          // trailing commas
        .replace(/,\s*}/g, '}')          // trailing commas
        .replace(/null/g, 'null');

    try {
        const candidates = eval(arrayStr); // JS 문법이므로 eval이 더 안전
        result.candidates[key] = candidates;
        console.log(`  ${key}: ${candidates.length} candidates`);
    } catch (e) {
        console.error(`  ${key}: parse error - ${e.message}`);
        result.candidates[key] = [];
    }
});

fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf8');
console.log(`\nExported to ${outputPath}`);
const total = Object.values(result.candidates).reduce((sum, arr) => sum + arr.length, 0);
console.log(`Total: ${total} candidates across ${regionKeys.length} regions`);
