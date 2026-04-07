// Cloudflare Worker: Election Night — NEC Polling + KV Cache
// 선거일(2026-06-03) 개표 데이터를 60초마다 info.nec.go.kr에서 수집하여 KV에 저장.
// 브라우저 클라이언트는 /results 엔드포인트로 폴링.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

const NEC_CONFIG = {
  USER_AGENT: 'ElectionInfoMap/1.0 (https://korea-local-election.pages.dev)',
  ELECTION_ID_2026: '0020260603',
  ELECTION_ID_2022: '0020220601',
  ELECTION_NIGHT_START: new Date('2026-06-03T18:00:00+09:00').getTime(),
  ELECTION_NIGHT_END:   new Date('2026-06-04T00:00:00+09:00').getTime(),
};

// ─── Scheduled handler (Cron Trigger: "* * * * *") ───
async function scheduled(controller, env, ctx) {
  const now = Date.now();

  // KST 기준 election_night 범위(18:00~24:00)만 실행
  if (now < NEC_CONFIG.ELECTION_NIGHT_START || now >= NEC_CONFIG.ELECTION_NIGHT_END) {
    console.log('[election-night] Outside election_night window, skipping poll.');
    return;
  }

  try {
    if (!env.ELECTION_RESULTS) {
      console.warn('[election-night] KV binding not found, skipping.');
      return;
    }
    const data = await fetchAndParseNEC(env);
    // KV put: TTL 120초 (2회 Cron 주기 내 브라우저에 항상 최신 제공)
    await env.ELECTION_RESULTS.put('latest', JSON.stringify(data), { expirationTtl: 120 });
    console.log('[election-night] KV updated at', new Date().toISOString());
  } catch (err) {
    console.error('[election-night] scheduled error:', err.message || err);
  }
}

// ─── Fetch handler (HTTP routes) ───
async function fetch(request, env) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  const url = new URL(request.url);

  if (url.pathname === '/results') {
    return handleResults(env);
  }

  if (url.pathname === '/health') {
    return new Response(JSON.stringify({ status: 'ok' }), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ error: 'Not found' }), {
    status: 404,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

async function handleResults(env) {
  // 선거 당일 개표 시간대 외엔 KV 읽기 없이 즉시 반환
  const now = Date.now();
  if (now < NEC_CONFIG.ELECTION_NIGHT_START || now >= NEC_CONFIG.ELECTION_NIGHT_END) {
    return new Response(JSON.stringify({ error: 'Not election night', regions: {} }), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  try {
    if (!env.ELECTION_RESULTS) {
      return new Response(JSON.stringify({ error: 'KV not configured', regions: {} }), {
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }
    const raw = await env.ELECTION_RESULTS.get('latest');
    if (!raw) {
      return new Response(JSON.stringify({ error: 'No data yet', regions: {} }), {
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }
    return new Response(raw, {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'KV read failed' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
}

// ─── NEC 폴링 + 파싱 ───

/**
 * NEC 개표 페이지를 가져와 파싱한 결과를 반환.
 * fetchedAt, electionId, sgTypecode, regions, _source, _parserVersion 포함.
 *
 * 현재: stub 구현 (NEC AJAX URL 미확정).
 * 2026-05-26 이전 2022 아카이브 Chrome DevTools 캡처 후 실제 URL 기입 예정.
 */
async function fetchAndParseNEC(env) {
  // TODO: 2022 아카이브 Chrome DevTools 캡처 후 실제 URL 기입
  // 마감: 2026-05-26 (D-08)
  const NEC_URL = ''; // placeholder

  if (!NEC_URL) {
    return {
      fetchedAt: new Date().toISOString(),
      regions: {},
      _source: 'stub',
      _parserVersion: '0.0',
    };
  }

  const resp = await globalThis.fetch(NEC_URL, {
    headers: {
      'User-Agent': NEC_CONFIG.USER_AGENT, // D-07: User-Agent 필수
      'Accept': 'text/html',
      'Referer': 'https://info.nec.go.kr/',
    },
  });

  const html = await resp.text();
  return parseNECResponse(html);
}

/**
 * NEC HTML 응답을 파싱하여 regions 객체 반환.
 *
 * regions 스키마 (per RESEARCH.md Pattern 6):
 * {
 *   [regionKey: string]: {
 *     countRate: number,       // 개표율 0~100
 *     leadingCandidate: string, // 현재 1위 후보명
 *     leadingParty: string,    // 현재 1위 정당 키
 *     leadingVoteRate: number, // 현재 1위 득표율 0~100
 *     declared: boolean,       // 선관위 공식 당선 확정 플래그만 (D-11)
 *   }
 * }
 *
 * ⚠️ declared: true는 선관위 공식 "당선" 플래그만 허용.
 *    수학적 추정으로 declared를 true로 설정하는 코드 절대 금지 (헌법 제2조, D-11).
 */
function parseNECResponse(html) {
  // 빈 입력 방어 (per D-01): falsy이거나 100자 미만이면 stub 반환
  if (!html || html.length < 100) {
    return {
      fetchedAt: new Date().toISOString(),
      electionId: NEC_CONFIG.ELECTION_ID_2026,
      sgTypecode: '11',
      regions: {},
      _source: 'stub',
      _parserVersion: '0.0',
    };
  }

  // 17개 광역지자체 한글명 → 영문 키 매핑
  // TODO(5/26): 실제 NEC HTML에서 지역명 표기 확인 (약칭/전체명 혼용 가능)
  const REGION_MAP = {
    '서울': 'seoul',
    '부산': 'busan',
    '대구': 'daegu',
    '인천': 'incheon',
    '광주': 'gwangju',
    '대전': 'daejeon',
    '울산': 'ulsan',
    '세종': 'sejong',
    '경기': 'gyeonggi',
    '강원': 'gangwon',
    '충북': 'chungbuk',
    '충남': 'chungnam',
    '전북': 'jeonbuk',
    '전남': 'jeonnam',
    '경북': 'gyeongbuk',
    '경남': 'gyeongnam',
    '제주': 'jeju',
  };

  // TODO(5/26): 정당 매핑 — 실제 정당 컬럼/텍스트 확인
  // NEC HTML에서 정당명이 어떻게 표기되는지 확인 후 조정
  const PARTY_MAP = {
    '국민의힘': 'ppp',
    '더불어민주당': 'democratic',
    '민주당': 'democratic',
    '개혁신당': 'reform',
    '조국혁신당': 'innovation',
    '진보당': 'progressive',
    '무소속': 'independent',
  };

  /**
   * HTML 태그 및 특수 엔티티 제거 헬퍼
   */
  function stripTags(str) {
    return str.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
  }

  const regions = {};

  try {
    // TODO(5/26): 실제 NEC HTML 구조 확인 후 조정 — 테이블 구조 또는 JSON 응답 확인
    // 현재: <tr>/<td> 기반 테이블 파싱 skeleton

    // <tr> 행 추출
    // TODO(5/26): 실제 NEC HTML에서 테이블 ID/class 확인 (예: id="table1", class="tbl_data" 등)
    const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;

    while ((rowMatch = rowPattern.exec(html)) !== null) {
      const rowHtml = rowMatch[1];

      // <td> 셀 추출
      // TODO(5/26): th/td 구분 확인 — 헤더 행 스킵 로직 필요할 수 있음
      const cellPattern = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      const cells = [];
      let cellMatch;

      while ((cellMatch = cellPattern.exec(rowHtml)) !== null) {
        cells.push(stripTags(cellMatch[1]));
      }

      // 최소 셀 수 확인 (지역명, 개표율, 후보명, 득표율 포함 예상)
      // TODO(5/26): 실제 컬럼 순서 확인 — 아래 인덱스는 추정값
      if (cells.length < 4) continue;

      // TODO(5/26): 실제 컬럼 순서 확인
      const regionName = cells[0];   // 컬럼 0: 지역명 (추정)
      const countRateStr = cells[1]; // 컬럼 1: 개표율 (추정, 예: "85.3%")
      const candidateName = cells[2]; // 컬럼 2: 후보명 (추정)
      const voteRateStr = cells[3];  // 컬럼 3: 득표율 (추정, 예: "54.1%")
      // TODO(5/26): 정당 컬럼 인덱스 확인 — cells[4] 또는 별도 파싱 필요
      const partyName = cells.length > 4 ? cells[4] : '';
      // TODO(5/26): 당선 컬럼 인덱스 확인 — cells[5] 또는 별도 속성/텍스트
      const declaredCell = cells.length > 5 ? cells[5] : '';

      // 지역명 매핑 확인
      const regionKey = REGION_MAP[regionName];
      if (!regionKey) continue; // 헤더 행 또는 인식 불가 행 스킵

      // 개표율 파싱 (예: "85.3%" → 85.3)
      // TODO(5/26): 실제 NEC HTML 구조 확인 후 조정
      const countRate = parseFloat(countRateStr.replace('%', '').trim());
      if (isNaN(countRate) || countRate < 0 || countRate > 100) {
        console.warn(`[parseNECResponse] Invalid countRate for ${regionKey}: "${countRateStr}"`);
        continue;
      }

      // 득표율 파싱 (예: "54.1%" → 54.1)
      // TODO(5/26): 실제 NEC HTML 구조 확인 후 조정
      const leadingVoteRate = parseFloat(voteRateStr.replace('%', '').trim());
      if (isNaN(leadingVoteRate) || leadingVoteRate < 0 || leadingVoteRate > 100) {
        console.warn(`[parseNECResponse] Invalid leadingVoteRate for ${regionKey}: "${voteRateStr}"`);
        continue;
      }

      // 정당 키 매핑
      // TODO(5/26): 실제 정당 컬럼/텍스트 확인
      const leadingParty = PARTY_MAP[partyName] || 'unknown';

      // 헌법 제2조: declared는 선관위 공식 플래그만 — HTML 셀에 "당선" 텍스트 존재 시에만 true
      // 수학적 추정(득표율 50% 초과 등)으로 declared를 판정하는 것은 절대 금지 (D-11)
      // TODO(5/26): 실제 NEC HTML에서 "당선" 표기 방식 확인 (텍스트, 이미지, 클래스 등)
      const declared = declaredCell.includes('당선'); // 헌법 제2조: declared는 선관위 공식 플래그만

      regions[regionKey] = {
        countRate,
        leadingCandidate: candidateName,
        leadingParty,
        leadingVoteRate,
        declared,
      };
    }
  } catch (err) {
    console.warn('[parseNECResponse] Parsing error:', err.message);
    // 파싱 실패 시 빈 regions 반환
    return {
      fetchedAt: new Date().toISOString(),
      electionId: NEC_CONFIG.ELECTION_ID_2026,
      sgTypecode: '11',
      regions: {},
      _source: 'info.nec.go.kr',
      _parserVersion: '1.0',
    };
  }

  if (Object.keys(regions).length === 0) {
    console.warn('[parseNECResponse] No regions parsed from HTML — check HTML structure and TODO(5/26) markers');
  }

  return {
    fetchedAt: new Date().toISOString(),
    electionId: NEC_CONFIG.ELECTION_ID_2026,
    sgTypecode: '11',
    regions,
    _source: 'info.nec.go.kr',
    _parserVersion: '1.0',
  };
}

export default { scheduled, fetch };

// 테스트용 export (Worker 런타임에서는 무시됨)
export { parseNECResponse, NEC_CONFIG };
