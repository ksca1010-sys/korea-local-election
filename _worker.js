/**
 * Cloudflare Pages Worker
 * Facebook/SNS 크롤러에게 OG 메타태그 HTML을 직접 응답.
 * 일반 사용자는 정적 파일로 패스스루.
 */

const OG_HTML = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>알선거 — 아는 만큼 보이는 선거</title>
<meta property="og:type" content="website">
<meta property="og:title" content="알선거 — 아는 만큼 보이는 선거">
<meta property="og:description" content="제9회 전국동시지방선거 여론조사, 후보자 비교, 역대 선거 결과를 한눈에 확인하세요.">
<meta property="og:url" content="https://korea-local-election.pages.dev/">
<meta property="og:site_name" content="알선거">
<meta property="og:image" content="https://korea-local-eletion.pages.dev/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:type" content="image/png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="알선거 — 아는 만큼 보이는 선거">
<meta name="twitter:description" content="제9회 전국동시지방선거 여론조사, 후보자 비교, 역대 선거 결과를 한눈에 확인하세요.">
<meta name="twitter:image" content="https://korea-local-eletion.pages.dev/og-image.png">
</head>
<body></body>
</html>`;

const SOCIAL_BOT_PATTERN = /facebookexternalhit|Facebot|Twitterbot|LinkedInBot|WhatsApp|Slackbot|Discordbot|Kakaotalk|KakaoTalk-Scrap/i;

export default {
  async fetch(request, env) {
    const userAgent = request.headers.get('User-Agent') || '';

    if (SOCIAL_BOT_PATTERN.test(userAgent)) {
      return new Response(OG_HTML, {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' }
      });
    }

    return env.ASSETS.fetch(request);
  }
};
