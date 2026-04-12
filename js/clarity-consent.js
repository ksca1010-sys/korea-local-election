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
        const style = document.createElement('style');
        style.textContent = `
            @keyframes ccFadeIn { from { opacity:0 } to { opacity:1 } }
            @keyframes ccSlideUp { from { opacity:0; transform:translateY(20px) scale(0.97) } to { opacity:1; transform:translateY(0) scale(1) } }
            #clarity-consent-banner { animation: ccFadeIn 0.2s ease }
            #clarity-consent-card { animation: ccSlideUp 0.25s cubic-bezier(0.34,1.2,0.64,1) }
            #clarity-accept:hover { background: #3a7fff !important; }
            #clarity-reject:hover { background: rgba(255,255,255,0.06) !important; color: #c8d8f0 !important; }
        `;
        document.head.appendChild(style);

        const overlay = document.createElement('div');
        overlay.id = 'clarity-consent-banner';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.55);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:16px;';
        overlay.innerHTML = `
            <div id="clarity-consent-card" style="background:linear-gradient(145deg,#1a1f35,#141827);border:1px solid rgba(100,140,255,0.18);border-radius:16px;padding:36px 32px 28px;max-width:380px;width:100%;text-align:center;box-shadow:0 24px 64px rgba(0,0,0,0.6),0 0 0 1px rgba(255,255,255,0.04);">
                <div style="width:48px;height:48px;background:linear-gradient(135deg,rgba(74,143,255,0.2),rgba(74,143,255,0.08));border:1px solid rgba(74,143,255,0.3);border-radius:12px;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4a8fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                    </svg>
                </div>
                <h3 style="color:#f0f4ff;font-size:17px;font-weight:700;margin:0 0 8px;letter-spacing:-0.2px;">방문 분석에 동의해 주세요</h3>
                <p style="color:#6b84a8;font-size:13px;line-height:1.7;margin:0 0 8px;">Microsoft Clarity로 클릭·스크롤 패턴을 수집해<br>사이트 개선에 활용합니다.</p>
                <p style="color:#4a6080;font-size:12px;margin:0 0 28px;">개인 식별 정보는 수집하지 않습니다.</p>
                <div style="display:flex;gap:8px;">
                    <button id="clarity-reject" style="flex:1;background:rgba(255,255,255,0.04);color:#6b84a8;border:1px solid rgba(255,255,255,0.1);padding:11px 0;border-radius:10px;cursor:pointer;font-size:14px;font-weight:500;transition:all 0.15s;">거부</button>
                    <button id="clarity-accept" style="flex:2;background:linear-gradient(135deg,#4a8fff,#3a6fd8);color:#fff;border:none;padding:11px 0;border-radius:10px;cursor:pointer;font-size:14px;font-weight:600;transition:all 0.15s;box-shadow:0 4px 16px rgba(74,143,255,0.35);">동의하기</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        document.getElementById('clarity-accept').addEventListener('click', () => {
            _setConsent('accepted');
            overlay.remove();
            style.remove();
            _loadClarity();
        });
        document.getElementById('clarity-reject').addEventListener('click', () => {
            _setConsent('rejected');
            overlay.remove();
            style.remove();
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
