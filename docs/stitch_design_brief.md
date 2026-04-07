# 알선거 (VoteMap) — 디자인 의뢰 자료

> 서비스: 알선거 — 아는 만큼 보이는 선거
> URL: https://korea-local-election.pages.dev
> 스택: 바닐라 HTML + CSS + JS (프레임워크 없음)
> 테마: 다크 모드 고정

---

## 1. 화면 구조

```
┌──────────────────────────────────────────────────────────────┐
│ [헤더] 로고 + 검색 + D-day                                    │
├──────────┬───────────────────────────┬───────────────────────┤
│ [사이드바] │     [중앙 지도]            │   [우측 정보 패널]     │
│ 320px    │     flex: 1               │   420px              │
│          │                           │                      │
│ 선거종류   │   D3.js 대한민국 지도       │  [개요] [여론조사]     │
│ 필터 버튼  │   TopoJSON 렌더링          │  [후보자] [뉴스]      │
│          │                           │  [역대선거]            │
│ 전국 통계  │   줌/검색/범례 오버레이      │                      │
│          │                           │  탭별 컨텐츠 렌더링     │
├──────────┴───────────────────────────┴───────────────────────┤
│ [푸터] 알선거 | 아는 만큼 보이는 선거                             │
└──────────────────────────────────────────────────────────────┘
```

모바일(768px 이하): 사이드바 숨김, 패널 하단 슬라이드업

---

## 2. 현재 디자인 시스템 (CSS 변수)

```css
:root {
    /* 배경 3단계 */
    --bg-primary: #0F1117;
    --bg-secondary: #161922;
    --bg-tertiary: #1C1F2E;

    /* 텍스트 4단계 */
    --text-primary: #FFFFFF;
    --text-secondary: #B0B8C8;
    --text-muted: #6B7280;
    --text-disabled: #404759;

    /* 테두리 */
    --border-subtle: rgba(255, 255, 255, 0.06);
    --border-default: rgba(255, 255, 255, 0.10);

    /* 정당색 (고정 — 변경 금지) */
    --party-democratic: #1A5CF0;  /* 더불어민주당 */
    --party-ppp: #E61E2B;         /* 국민의힘 */
    --party-reform: #FF6D2E;      /* 조국혁신당 */
    --party-justice: #00A85A;     /* 정의당 */
    --party-independent: #6B7280; /* 무소속 */

    /* 시맨틱 */
    --color-info: #3B82F6;
    --color-success: #22C55E;
    --color-warning: #F59E0B;
    --color-danger: #EF4444;

    /* 타이포 */
    --text-display: 32px;
    --text-headline: 22px;
    --text-title: 18px;
    --text-body: 15px;
    --text-caption: 13px;
    --text-micro: 12px;

    /* 간격 4px 단위 */
    --space-4: 4px; --space-8: 8px; --space-12: 12px;
    --space-16: 16px; --space-24: 24px; --space-32: 32px;
}
```

---

## 3. 핵심 HTML 구조 (index.html 발췌)

```html
<!-- 헤더 -->
<header id="main-header">
    <div class="header-left">
        <button id="home-link" class="logo">
            <img src="logo-small.png" alt="알선거" style="height:32px;">
            <span class="logo-text">알선거</span>
        </button>
        <span class="header-subtitle">제9회 전국동시지방선거 | 2026.06.03</span>
    </div>
    <div class="header-center">
        <div class="search-box">
            <i class="fas fa-search"></i>
            <input type="text" id="region-search" placeholder="지역명 검색...">
        </div>
    </div>
    <div class="header-right">
        <div class="dday-counter">
            <span class="dday-label">D-DAY</span>
            <span class="dday-number" id="dday-number">D-76</span>
        </div>
    </div>
</header>

<!-- 사이드바 -->
<aside class="sidebar">
    <div class="sidebar-section">
        <h3 class="section-title">선거 종류</h3>
        <div class="election-type-filters">
            <button class="filter-btn active" data-type="governor">
                <span class="filter-icon"><i class="fas fa-landmark"></i></span>
                <span>광역단체장</span>
                <span class="filter-count">17</span>
            </button>
            <!-- 총 8개 선거종류 버튼 -->
        </div>
    </div>
    <div class="sidebar-section">
        <h3 class="section-title">전국 현황</h3>
        <div class="stat-grid">
            <div class="stat-card">
                <div class="stat-value">44,167,027</div>
                <div class="stat-label">유권자</div>
            </div>
            <!-- 4개 통계 카드 -->
        </div>
    </div>
</aside>

<!-- 중앙 지도 -->
<section id="map-section">
    <div class="map-controls">
        <!-- 줌, 범례, 브레드크럼 -->
    </div>
    <div id="map-container">
        <svg id="korea-map"></svg>
    </div>
</section>

<!-- 우측 정보 패널 -->
<aside class="detail-panel" id="detail-panel">
    <div class="panel-header">
        <div class="panel-title-area">
            <h2 id="panel-region-name">경기도</h2>
            <p class="panel-subtitle" id="panel-region-info">광역단체장 선거</p>
        </div>
        <button class="panel-close" id="panel-close">×</button>
    </div>
    <div class="panel-tabs">
        <button class="panel-tab active" data-tab="overview">개요</button>
        <button class="panel-tab" data-tab="polls">여론조사</button>
        <button class="panel-tab" data-tab="candidates">후보자</button>
        <button class="panel-tab" data-tab="news">뉴스</button>
        <button class="panel-tab" data-tab="history">역대선거</button>
    </div>
    <div class="panel-content">
        <!-- 탭별 컨텐츠 -->
        <div id="tab-overview" class="tab-content">
            <div class="panel-card">
                <h4><i class="fas fa-clipboard-list"></i> 개요</h4>
                <div id="prev-election-result"></div>
            </div>
            <div class="panel-card">
                <h4><i class="fas fa-user-tie"></i> 현직자 정보</h4>
                <div id="current-governor"></div>
            </div>
        </div>
        <div id="tab-polls" class="tab-content" style="display:none;">
            <!-- 여론조사: 통합추세 + 추이차트 + 카드목록 -->
        </div>
        <div id="tab-candidates" class="tab-content" style="display:none;">
            <!-- 후보자 카드 -->
        </div>
        <div id="tab-news" class="tab-content" style="display:none;">
            <!-- 뉴스 피드 -->
        </div>
        <div id="tab-history" class="tab-content" style="display:none;">
            <!-- 역대선거 결과 -->
        </div>
    </div>
</aside>
```

---

## 4. 주요 컴포넌트 CSS

### 카드
```css
.panel-card {
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: 12px;
    padding: var(--space-16);
    margin-bottom: var(--space-12);
}
```

### 탭
```css
.panel-tab {
    flex: 1;
    padding: var(--space-12) var(--space-16);
    border-bottom: 2px solid transparent;
    color: var(--text-muted);
    font-size: var(--text-body);
}
.panel-tab.active {
    color: var(--text-primary);
    font-weight: 600;
    border-bottom-color: var(--text-primary);
}
```

### 여론조사 바차트
```css
.poll-card-result-info {
    display: flex;
    align-items: baseline;
    gap: var(--space-6);
}
.poll-card-candidate { font-size: var(--text-title); font-weight: 600; }
.poll-card-support { margin-left: auto; font-size: var(--text-title); font-weight: 600; }
.poll-card-bar-bg { height: 8px; background: rgba(255,255,255,0.04); border-radius: 4px; }
.poll-card-bar { height: 100%; border-radius: 4px; /* 정당색 inline */ }
```

### 선거종류 필터 버튼
```css
.filter-btn {
    display: flex;
    align-items: center;
    width: 100%;
    padding: var(--space-12) var(--space-16);
    background: transparent;
    border: none;
    border-radius: 8px;
    color: var(--text-secondary);
}
.filter-btn.active {
    background: rgba(59, 130, 246, 0.1);
    color: var(--color-info);
}
```

---

## 5. 디자인 개선 요청 사항

1. **전체적인 레이아웃 밸런스**: 사이드바 / 지도 / 패널 3분할 비율
2. **지도 위 UI**: 줌 버튼, 범례, 검색 — 미니멀하면서 기능적
3. **정보 패널 카드**: 현재 너무 밋밋. 정보 위계를 시각적으로 강화
4. **여론조사 탭**: "3초 만에 누가 앞서는지" — 핵심 정보 부각
5. **모바일 UX**: 하단 패널 슬라이드 + 사이드바 시트

---

## 6. 디자인 원칙

- 토스/카카오 스타일 미니멀
- 그라데이션/드롭쉐도우 없음 (flat)
- 배경색 차이로 깊이 표현
- 정당색은 고정 (변경 금지)
- 정보 위계: 핵심 숫자 크게, 보조 정보 작게
- border-radius: 12px 통일 (뱃지만 4px)
- transition: 0.15s

---

## 7. 참고 URL

- **라이브**: https://korea-local-election.pages.dev
- **디자인 가이드**: docs/디자인가이드.md
- **UX 화면흐름**: docs/UX_화면흐름.md
