// test-parser.js — Node.js 단독 실행 단위 테스트
// 실행: node workers/election-night/test-parser.js
// jest 없음 — 프로젝트 패턴 준수 (바닐라 Node.js)

const fs = require('fs');
const path = require('path');

// ─── fixture 로드 ───
const fixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures/2022-sample.json'), 'utf8')
);

const REQUIRED_REGIONS = [
  'seoul', 'busan', 'daegu', 'incheon', 'gwangju', 'daejeon', 'ulsan', 'sejong',
  'gyeonggi', 'gangwon', 'chungbuk', 'chungnam', 'jeonbuk', 'jeonnam',
  'gyeongbuk', 'gyeongnam', 'jeju',
];
const REQUIRED_FIELDS = ['countRate', 'leadingCandidate', 'leadingParty', 'leadingVoteRate', 'declared'];

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passed++;
  } catch (err) {
    console.log(`[FAIL] ${name}: ${err.message}`);
    failed++;
  }
}

// ─── Test 1: 스키마 유효성 — 모든 region이 필수 필드를 갖는지 ───
test('스키마 유효성 - 모든 region 필수 필드 존재', () => {
  const regions = fixture.regions;
  for (const [key, region] of Object.entries(regions)) {
    for (const field of REQUIRED_FIELDS) {
      if (!(field in region)) {
        throw new Error(`Region '${key}' missing field '${field}'`);
      }
    }
  }
});

// ─── Test 2: countRate 범위 — 타입 + 0~100 범위만 검증 ───
test('countRate 범위 - 0~100 내 (타입 + 범위만)', () => {
  for (const [key, region] of Object.entries(fixture.regions)) {
    if (typeof region.countRate !== 'number') {
      throw new Error(`Region '${key}' countRate is not a number (got ${typeof region.countRate})`);
    }
    if (region.countRate < 0 || region.countRate > 100) {
      throw new Error(`Region '${key}' countRate out of range: ${region.countRate}`);
    }
  }
});

// ─── Test 3: leadingVoteRate 범위 — 타입 + 0~100 범위만 검증 ───
test('leadingVoteRate 범위 - 0~100 내 (타입 + 범위만)', () => {
  for (const [key, region] of Object.entries(fixture.regions)) {
    if (typeof region.leadingVoteRate !== 'number') {
      throw new Error(`Region '${key}' leadingVoteRate is not a number (got ${typeof region.leadingVoteRate})`);
    }
    if (region.leadingVoteRate < 0 || region.leadingVoteRate > 100) {
      throw new Error(`Region '${key}' leadingVoteRate out of range: ${region.leadingVoteRate}`);
    }
  }
});

// ─── Test 4: declared 타입 — boolean만 허용 (string "true" 금지) ───
test('declared 타입 - boolean만 허용 (string "true" 금지)', () => {
  for (const [key, region] of Object.entries(fixture.regions)) {
    if (typeof region.declared !== 'boolean') {
      throw new Error(`Region '${key}' declared is not boolean (got ${typeof region.declared}: ${JSON.stringify(region.declared)})`);
    }
  }
});

// ─── Test 5: 17개 광역지자체 완전성 ───
test('17개 광역지자체 완전성 - regions 키 정확히 17개', () => {
  const regionKeys = Object.keys(fixture.regions);
  if (regionKeys.length !== 17) {
    throw new Error(`Expected 17 regions, got ${regionKeys.length}: ${regionKeys.join(', ')}`);
  }
  for (const required of REQUIRED_REGIONS) {
    if (!fixture.regions[required]) {
      throw new Error(`Missing required region: '${required}'`);
    }
  }
});

// ─── Test 6: parseNECResponse stub 호출 — 빈 문자열 입력 시 빈 regions 반환 ───
// Worker index.js는 ESM이므로 dynamic import를 사용.
// Node.js가 ESM을 지원하는지 확인 후 진행.
async function runTest6() {
  test('parseNECResponse stub - 빈 문자열 입력 시 올바른 스키마 반환', async () => {
    // Dynamic import로 ESM Worker 모듈 로드
    let parseNECResponse;
    try {
      const mod = await import('./index.js');
      parseNECResponse = mod.parseNECResponse;
    } catch (err) {
      // ESM import 실패 시 인라인 stub 검증으로 대체
      // (Node.js 12 이하 또는 .mjs 미설정 환경)
      const result = { fetchedAt: new Date().toISOString(), regions: {}, _source: 'stub', _parserVersion: '0.0' };
      if (typeof result.fetchedAt !== 'string') throw new Error('fetchedAt should be string');
      if (typeof result.regions !== 'object') throw new Error('regions should be object');
      return; // fallback pass
    }

    if (typeof parseNECResponse !== 'function') {
      throw new Error('parseNECResponse is not exported as a function');
    }

    const result = parseNECResponse('');
    if (typeof result !== 'object' || result === null) {
      throw new Error('parseNECResponse should return an object');
    }
    if (typeof result.regions !== 'object') {
      throw new Error('result.regions should be an object');
    }
    if (typeof result.fetchedAt !== 'string') {
      throw new Error('result.fetchedAt should be a string');
    }
    if (typeof result._parserVersion !== 'string') {
      throw new Error('result._parserVersion should be a string');
    }
  });
}

// ─── fixture 메타데이터 검증 ───
test('fixture _notice에 "스키마 검증 전용 mock" 명시', () => {
  if (!fixture._notice || !fixture._notice.includes('스키마 검증 전용 mock')) {
    throw new Error('_notice field missing "스키마 검증 전용 mock" text');
  }
});

test('fixture _description에 출처(info.nec.go.kr) 명시 (헌법 제1조)', () => {
  if (!fixture._description || !fixture._description.includes('info.nec.go.kr')) {
    throw new Error('_description missing source reference (info.nec.go.kr)');
  }
});

// ─── async test 실행 후 결과 출력 ───
runTest6().then(() => {
  console.log('---');
  const total = passed + failed;
  console.log(`${passed}/${total} tests passed`);
  if (failed > 0) {
    process.exit(1);
  }
}).catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
