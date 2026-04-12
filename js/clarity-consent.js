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
        const overlay = document.createElement('div');
        overlay.id = 'clarity-consent-banner';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;padding:16px;';
        overlay.innerHTML = `
            <div style="background:#1a1a2e;border:1px solid rgba(169,199,255,0.2);border-radius:12px;padding:32px;max-width:420px;width:100%;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,0.5);">
                <div style="font-size:32px;margin-bottom:12px;">📊</div>
                <h3 style="color:#fff;font-size:18px;font-weight:700;margin:0 0 10px;">사이트 개선에 도움을 주세요</h3>
                <p style="color:#8a9fc0;font-size:14px;line-height:1.6;margin:0 0 24px;">Microsoft Clarity를 통해 클릭·스크롤 패턴을 수집합니다.<br>개인정보는 수집하지 않습니다.</p>
                <div style="display:flex;gap:10px;justify-content:center;">
                    <button id="clarity-accept" style="background:#4a8fff;color:#fff;border:none;padding:10px 28px;border-radius:8px;cursor:pointer;font-size:15px;font-weight:600;">동의</button>
                    <button id="clarity-reject" style="background:transparent;color:#8a9fc0;border:1px solid rgba(255,255,255,0.15);padding:10px 28px;border-radius:8px;cursor:pointer;font-size:15px;">거부</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        document.getElementById('clarity-accept').addEventListener('click', () => {
            _setConsent('accepted');
            overlay.remove();
            _loadClarity();
        });
        document.getElementById('clarity-reject').addEventListener('click', () => {
            _setConsent('rejected');
            overlay.remove();
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
