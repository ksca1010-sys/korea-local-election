// Cloudflare Worker: Naver News API Proxy
// CORS 우회 + API 키 보호

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
  'Access-Control-Max-Age': '86400',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    if (url.pathname === '/api/news') {
      return handleNewsSearch(url, env);
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  },
};

async function handleNewsSearch(url, env) {
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

    return jsonResponse(data);
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
      'Cache-Control': 'public, max-age=300',
    },
  });
}
