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
  USER_AGENT: 'ElectionInfoMap/1.0 (https://korea-local-eletion.pages.dev)',
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
  try {
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
  // TODO: 2022 아카이브 응답 포맷 확인 후 구현
  // 반환 스키마 (per RESEARCH.md Pattern 6):
  return {
    fetchedAt: new Date().toISOString(),
    electionId: NEC_CONFIG.ELECTION_ID_2026,
    sgTypecode: '11',
    regions: {},
    _source: 'info.nec.go.kr',
    _parserVersion: '1.0',
  };
}

export default { scheduled, fetch };

// 테스트용 export (Worker 런타임에서는 무시됨)
export { parseNECResponse, NEC_CONFIG };
