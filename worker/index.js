// Cloudflare Worker: Naver News API Proxy
// CORS 우회 + API 키 보호 + Cache API 캐싱

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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

    if (url.pathname === '/api/gnews') {
      return handleGoogleNews(url, env, request);
    }

    if (url.pathname === '/analytics') {
      return handleAnalytics(request, env);
    }

    if (url.pathname === '/analytics/dump') {
      return handleAnalyticsDump(url, env);
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

// ── Google News RSS Proxy ──
async function handleGoogleNews(url, env, request) {
  const query = url.searchParams.get('query') || '';
  if (!query) {
    return jsonResponse({ error: 'query parameter required' }, 400);
  }

  // CF 캐시 체크
  const cache = caches.default;
  const cacheKey = new Request(
    `https://cache-key.internal/api/gnews?query=${encodeURIComponent(query)}`,
    { method: 'GET' }
  );

  const cached = await cache.match(cacheKey);
  if (cached) {
    const body = await cached.text();
    return new Response(body, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${CACHE_TTL}`,
        'X-Cache': 'HIT',
        'X-Source': 'gnews',
      },
    });
  }

  // Google News RSS fetch (재시도 포함)
  const gnewsUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ko&gl=KR&ceid=KR:ko`;

  try {
    let resp;
    for (let attempt = 0; attempt < 3; attempt++) {
      resp = await fetch(gnewsUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ElectionNewsBot/1.0)' },
      });
      if (resp.ok || resp.status < 500) break;
      if (attempt < 2) await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
    }

    if (!resp.ok) {
      return jsonResponse({ error: 'Google News fetch failed', status: resp.status }, 502);
    }

    const xml = await resp.text();

    // RSS XML → JSON 파싱 (경량 정규식 기반, 외부 라이브러리 없음)
    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    while ((match = itemRegex.exec(xml)) !== null && items.length < 50) {
      const block = match[1];
      const get = (tag) => {
        const m = block.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
        return m ? (m[1] || m[2] || '').trim() : '';
      };
      const title = get('title').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
      const link = get('link');
      const pubDate = get('pubDate');
      const source = get('source');
      // Google News description에 원본 출처 링크가 포함됨
      const desc = get('description').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&');

      if (title && link) {
        items.push({
          title,
          link,
          originallink: link,
          description: desc,
          pubDate,
          source,
          _provider: 'google',
        });
      }
    }

    const data = { items, total: items.length, provider: 'google' };
    const response = new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${CACHE_TTL}`,
        'X-Cache': 'MISS',
        'X-Source': 'gnews',
      },
    });

    // 캐시 저장
    await cache.put(cacheKey, response.clone());
    return response;
  } catch (err) {
    return jsonResponse({ error: 'Google News fetch failed: ' + err.message }, 502);
  }
}

// ── Analytics: 이벤트 수집 (KV 저장) ──
const VALID_EVENTS = new Set(['selectRegion', 'switchTab', 'clickPoll', 'clickNews', 'shareClick']);
const MAX_BODY_SIZE = 2048;

async function handleAnalytics(request, env) {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'POST only' }, 405);
  }

  const body = await request.text();
  if (body.length > MAX_BODY_SIZE) {
    return jsonResponse({ error: 'Payload too large' }, 413);
  }

  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  if (!payload.event || !VALID_EVENTS.has(payload.event)) {
    return jsonResponse({ error: 'Invalid event' }, 400);
  }

  // KV 키: 날짜별 버킷 + 랜덤 ID (시계열 조회 용이)
  const now = new Date();
  const dateKey = now.toISOString().slice(0, 10); // 2026-03-26
  const id = `${dateKey}:${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`;

  const record = {
    event: payload.event,
    data: payload.data || {},
    timestamp: payload.timestamp || now.toISOString(),
    receivedAt: now.toISOString(),
  };

  // KV에 저장 (90일 TTL)
  try {
    await env.ANALYTICS.put(`evt:${id}`, JSON.stringify(record), {
      expirationTtl: 86400 * 90,
    });

    // 날짜별 카운터 증가
    const counterKey = `count:${dateKey}:${payload.event}`;
    const prev = parseInt(await env.ANALYTICS.get(counterKey) || '0', 10);
    await env.ANALYTICS.put(counterKey, String(prev + 1), {
      expirationTtl: 86400 * 90,
    });

    return jsonResponse({ ok: true, id });
  } catch (err) {
    return jsonResponse({ error: 'KV write failed: ' + err.message }, 500);
  }
}

// ── Analytics: 조회 (간단 덤프) ──
async function handleAnalyticsDump(url, env) {
  const date = url.searchParams.get('date') || new Date().toISOString().slice(0, 10);
  const prefix = `evt:${date}:`;

  const list = await env.ANALYTICS.list({ prefix, limit: 1000 });
  const events = [];
  for (const key of list.keys) {
    const val = await env.ANALYTICS.get(key.name);
    if (val) events.push(JSON.parse(val));
  }

  // 카운터도 함께 반환
  const counts = {};
  for (const evt of VALID_EVENTS) {
    const c = await env.ANALYTICS.get(`count:${date}:${evt}`);
    if (c) counts[evt] = parseInt(c, 10);
  }

  return jsonResponse({ date, counts, events });
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
