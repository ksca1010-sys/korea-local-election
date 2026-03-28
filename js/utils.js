// ============================================
// 공유 유틸리티 함수 + 상수
// ============================================

// ── 뉴스 프록시 ──
const NEWS_PROXY_BASE = window.NEWS_PROXY_BASE || 'https://election-news-proxy.ksca1010.workers.dev';

// ── 주요 언론사 호스트 ──
const NEWS_FILTER_CONFIG = window.NewsFilterConfig || {};
const MAJOR_NEWS_HOSTS = Array.isArray(NEWS_FILTER_CONFIG.majorNewsHosts) && NEWS_FILTER_CONFIG.majorNewsHosts.length
    ? NEWS_FILTER_CONFIG.majorNewsHosts
    : [
    'yna.co.kr', 'newsis.com', 'news1.kr', 'yonhapnewstv.co.kr',
    'kbs.co.kr', 'imnews.imbc.com', 'mbc.co.kr', 'sbs.co.kr',
    'jtbc.co.kr', 'chosun.com', 'joongang.co.kr', 'donga.com',
    'hani.co.kr', 'khan.co.kr', 'seoul.co.kr', 'mk.co.kr',
    'hankyung.com', 'edaily.co.kr', 'fnnews.com', 'mt.co.kr',
    'sisajournal.com', 'ohmynews.com', 'nocutnews.co.kr'
];

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * 비침투적 토스트 알림 (자동 소멸)
 * @param {string} message - 표시할 메시지
 * @param {'info'|'warn'|'error'} type - 알림 유형
 * @param {number} duration - 표시 시간 (ms)
 */
function showToast(message, type = 'info', duration = 4000) {
    const toast = document.createElement('div');
    toast.className = 'toast-notification toast-' + type;
    toast.textContent = message;
    toast.setAttribute('role', 'alert');
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('toast-visible'));
    setTimeout(() => {
        toast.classList.remove('toast-visible');
        toast.addEventListener('transitionend', () => toast.remove(), { once: true });
        setTimeout(() => toast.remove(), 500); // fallback
    }, duration);
}
