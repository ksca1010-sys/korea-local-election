/**
 * ClarityConsent — Microsoft Clarity PIPA 동의 게이트
 * 사용자 동의 없이 Clarity를 로드하지 않음 (PIPA 준수)
 */
const ClarityConsent = (() => {
    const STORAGE_KEY = 'clarity_consent';
    const CLARITY_ID = 'vxpaked5fs';
    const EXPIRY_MS = 365 * 24 * 60 * 60 * 1000; // 365일

    function _getConsent() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            const data = JSON.parse(raw);
            if (!data.timestamp || Date.now() - data.timestamp > EXPIRY_MS) {
                localStorage.removeItem(STORAGE_KEY);
                return null;
            }
            return data;
        } catch (e) {
            console.warn('[ClarityConsent] localStorage read failed:', e);
            return null;
        }
    }

    function _setConsent(status) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                status: status,
                timestamp: Date.now()
            }));
        } catch (e) {
            console.warn('[ClarityConsent] localStorage write failed:', e);
        }
    }

    function _loadClarity() {
        if (document.querySelector('script[src*="clarity.ms"]')) return;
        (function(c,l,a,r,i,t,y){
            c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
            t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
            y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
        })(window, document, "clarity", "script", CLARITY_ID);
        // ConsentV2 API: 동의 상태 전달
        if (typeof window.clarity === 'function') {
            window.clarity("consent");
        }
    }

    function _showBanner() {
        const banner = document.createElement('div');
        banner.id = 'clarity-consent-banner';
        banner.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:9999;background:#1a1a2e;border-top:1px solid rgba(255,255,255,0.1);padding:12px 16px;display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;font-size:14px;color:#ccc;';
        banner.innerHTML = `
            <span>사이트 개선을 위해 Microsoft Clarity 세션 기록에 동의하시겠습니까?</span>
            <button id="clarity-accept" style="background:#4CAF50;color:#fff;border:none;padding:6px 16px;border-radius:4px;cursor:pointer;font-size:14px;">동의</button>
            <button id="clarity-reject" style="background:transparent;color:#aaa;border:1px solid #555;padding:6px 16px;border-radius:4px;cursor:pointer;font-size:14px;">거부</button>
        `;
        document.body.appendChild(banner);

        document.getElementById('clarity-accept').addEventListener('click', () => {
            _setConsent('accepted');
            banner.remove();
            _loadClarity();
        });
        document.getElementById('clarity-reject').addEventListener('click', () => {
            _setConsent('rejected');
            banner.remove();
        });
    }

    function init() {
        const consent = _getConsent();
        if (consent && consent.status === 'accepted') {
            _loadClarity();
            return;
        }
        if (consent && consent.status === 'rejected') {
            return; // 거부 상태 — 배너 재표시 안 함 (per D-07)
        }
        // 동의 기록 없음 — 배너 표시
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', _showBanner);
        } else {
            _showBanner();
        }
    }

    init();

    return { init };
})();
