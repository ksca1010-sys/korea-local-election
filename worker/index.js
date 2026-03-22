// Cloudflare Worker: Naver News API Proxy
// CORS 우회 + API 키 보호 + Cache API 캐싱

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
  'Access-Control-Max-Age': '86400',
};

const CACHE_TTL = 1800; // 30분 캐시

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    if (url.pathname === '/api/news') {
      return handleNewsSearch(url, env, request);
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  },
};

async function handleNewsSearch(url, env, request) {
  const query = url.searchParams.get('query') || '';
  const display = url.searchParams.get('display') || '50';
  const sort = url.searchParams.get('sort') || 'date';
  const start = url.searchParams.get('start') || '1';

  if (!query) {
    return jsonResponse({ error: 'query parameter required' }, 400);
  }

  const clientId = env.NAVER_CLIENT_ID;
  const clientSecret = env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return jsonResponse({ error: 'API credentials not configured' }, 500);
  }

  // ── Cache API: 동일 쿼리는 캐시에서 바로 응답 ──
  const cache = caches.default;
  // 캐시 키: query params만으로 정규화 (origin 무관)
  const cacheKey = new Request(
    `https://cache-key.internal/api/news?query=${encodeURIComponent(query)}&display=${display}&sort=${sort}&start=${start}`,
    { method: 'GET' }
  );

  const cached = await cache.match(cacheKey);
  if (cached) {
    // 캐시 히트 — CORS 헤더를 보장하여 반환
    const body = await cached.text();
    return new Response(body, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${CACHE_TTL}`,
        'X-Cache': 'HIT',
      },
    });
  }

  // ── Cache miss → 네이버 API 호출 ──
  const naverUrl = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(query)}&display=${display}&sort=${sort}&start=${start}`;

  try {
    const resp = await fetch(naverUrl, {
      headers: {
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret,
      },
    });

    const data = await resp.json();

    if (!resp.ok) {
      return jsonResponse({ error: data.errorMessage || 'Naver API error', code: data.errorCode }, resp.status);
    }

    // 성공 응답을 캐시에 저장
    const response = new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${CACHE_TTL}`,
        'X-Cache': 'MISS',
      },
    });

    // cache.put은 비동기이지만 응답 반환을 블로킹하지 않음
    const responseToCache = response.clone();
    await cache.put(cacheKey, responseToCache);

    return response;
  } catch (err) {
    return jsonResponse({ error: 'Fetch failed: ' + err.message }, 502);
  }
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
