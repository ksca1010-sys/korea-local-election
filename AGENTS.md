# 선거정보지도 — 팩트 보존 실행 가이드
## 바닐라 JS 구조를 유지하면서 데이터 안정성 확보하기

> 현재 구조: index.html + css/style.css + js/ (7개 파일)
> 목표: 프레임워크 전환 없이, 파일 분리만으로 "한 곳 수정 → 다른 곳 깨짐" 방지

---

## 1. 현재 구조 진단

```
현재:
  index.html          ← HTML 구조 (좌측+중앙+우측 전부)
  css/style.css       ← 전체 스타일
  js/
    data.js           ← 🔴 모든 데이터가 여기에 뭉쳐있을 가능성
    app.js            ← 🔴 메인 로직 (초기화, 이벤트, 렌더링 혼재)
    map.js            ← 지도 렌더링
    charts.js         ← 차트
    nec.js            ← 선관위 연동
    issue_engine.js   ← 이슈 발굴
    derived_issues.js ← 파생 이슈
    news_filters.js   ← 뉴스 필터
```

**문제**: `data.js`에 후보자 정보, 여론조사, 이전 선거 결과, 지역 정보가 모두 섞여 있으면,
여론조사 데이터를 수정하다가 후보자 데이터의 변수명을 건드리거나,
`app.js`에서 개요탭을 수정하다가 뉴스탭 렌더링 함수를 망가뜨리게 됨.

---

## 2. 목표 구조 — data.js 쪼개기

```
변경 후:
  index.html
  css/style.css
  
  data/                          ← 🟢 NEW: 데이터 전용 폴더 (JSON)
    regions.json                 ← 17개 광역 + 226개 기초 목록
    candidates.json              ← 후보자 정보
    polls.json                   ← 여론조사 데이터
    prev-elections.json          ← 이전 선거 결과 (8회 지선)
    issues.json                  ← 지역 핵심이슈
    party-support.json           ← 정당 지지율
    
  js/
    data-loader.js               ← 🟢 NEW: JSON 파일 로드만 담당
    app.js                       ← 초기화 + 이벤트 바인딩만
    map.js                       ← 지도 (그대로)
    charts.js                    ← 차트 (그대로)
    nec.js                       ← 선관위 (그대로)
    issue_engine.js              ← 이슈 (그대로)
    derived_issues.js            ← 파생이슈 (그대로)
    news_filters.js              ← 뉴스 (그대로)
    
    tabs/                        ← 🟢 NEW: 탭별 렌더링 분리
      overview-tab.js            ← 개요탭 렌더링
      poll-tab.js                ← 여론조사탭 렌더링
      candidate-tab.js           ← 후보자탭 렌더링
      news-tab.js                ← 뉴스탭 렌더링
      history-tab.js             ← 역대비교탭 렌더링
```

---

## 3. 실행 단계 — 순서가 중요

### Step 1: data/ 폴더 만들고 JSON 분리 (2시간)

`data.js`에 있는 데이터를 종류별로 JSON 파일로 쪼갠다.

```javascript
// 현재 data.js (추정):
const REGIONS = { ... };           // → data/regions.json
const CANDIDATES = { ... };        // → data/candidates.json  
const POLLS = { ... };             // → data/polls.json
const PREV_ELECTIONS = { ... };    // → data/prev-elections.json
const ISSUES = { ... };            // → data/issues.json
const PARTY_SUPPORT = { ... };     // → data/party-support.json
```

```javascript
// 새로 만들 js/data-loader.js:
const DataLoader = {
  _cache: {},
  
  async load(name) {
    if (this._cache[name]) return this._cache[name];
    const res = await fetch(`data/${name}.json`);
    this._cache[name] = await res.json();
    return this._cache[name];
  },
  
  // 편의 메서드
  async regions()       { return this.load('regions'); },
  async candidates()    { return this.load('candidates'); },
  async polls()         { return this.load('polls'); },
  async prevElections() { return this.load('prev-elections'); },
  async issues()        { return this.load('issues'); },
  async partySupport()  { return this.load('party-support'); },
};
```

**효과**: 여론조사 데이터를 수정할 때 `data/polls.json`만 열면 됨. 후보자 데이터는 아예 다른 파일이라 실수로 건드릴 수 없음.

### Step 2: app.js에서 탭 렌더링 함수 분리 (3시간)

현재 `app.js`에 개요탭, 여론조사탭, 후보자탭, 뉴스탭, 역대비교탭의 렌더링 함수가 모두 들어있을 것. 이걸 파일로 분리.

```javascript
// js/tabs/overview-tab.js
const OverviewTab = {
  async render(region, electionType) {
    const candidates = await DataLoader.candidates();
    const prevElections = await DataLoader.prevElections();
    const issues = await DataLoader.issues();
    
    // 이 탭은 candidates, prevElections, issues만 사용
    // polls에 접근하지 않음 → polls를 수정해도 여기는 안 깨짐
    
    const filtered = candidates.filter(c => 
      c.region === region && c.electionType === electionType
    );
    
    document.getElementById('overview-content').innerHTML = 
      this._buildHTML(filtered, prevElections, issues);
  },
  
  _buildHTML(candidates, prevElections, issues) {
    // ... 렌더링 로직
  }
};
```

```javascript
// js/tabs/poll-tab.js
const PollTab = {
  async render(region, electionType) {
    const polls = await DataLoader.polls();
    
    // 이 탭은 polls만 사용
    // candidates를 수정해도 여기는 안 깨짐
    
    const filtered = polls.filter(p => 
      p.region === region && p.electionType === electionType
    );
    
    document.getElementById('poll-content').innerHTML = 
      this._buildHTML(filtered);
  },
  
  _buildHTML(polls) {
    // ... 렌더링 로직
  }
};
```

```javascript
// app.js — 이제 초기화와 이벤트만 담당
document.addEventListener('DOMContentLoaded', async () => {
  // 탭 전환 이벤트
  document.querySelectorAll('.info-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      const tabName = e.target.dataset.tab;
      switchTab(tabName);
    });
  });
});

function switchTab(tabName) {
  const region = getCurrentRegion();
  const electionType = getCurrentElectionType();
  
  switch(tabName) {
    case 'overview':   OverviewTab.render(region, electionType); break;
    case 'polls':      PollTab.render(region, electionType); break;
    case 'candidates': CandidateTab.render(region, electionType); break;
    case 'news':       NewsTab.render(region, electionType); break;
    case 'history':    HistoryTab.render(region, electionType); break;
  }
}
```

**효과**: 후보자탭을 수정할 때 `js/tabs/candidate-tab.js`만 열면 됨. 여론조사탭 파일은 열지도 않으니 깨질 수가 없음.

### Step 3: index.html에 스크립트 로드 순서 정리 (30분)

```html
<!-- data/는 fetch로 로드하므로 script 태그 불필요 -->

<!-- 유틸리티 (순서 중요) -->
<script src="js/data-loader.js"></script>

<!-- 독립 모듈 (순서 무관) -->
<script src="js/map.js"></script>
<script src="js/charts.js"></script>
<script src="js/nec.js"></script>
<script src="js/issue_engine.js"></script>
<script src="js/derived_issues.js"></script>
<script src="js/news_filters.js"></script>

<!-- 탭별 렌더러 (순서 무관, 서로 독립) -->
<script src="js/tabs/overview-tab.js"></script>
<script src="js/tabs/poll-tab.js"></script>
<script src="js/tabs/candidate-tab.js"></script>
<script src="js/tabs/news-tab.js"></script>
<script src="js/tabs/history-tab.js"></script>

<!-- 메인 앱 (가장 마지막) -->
<script src="js/app.js"></script>
```

### Step 4: AGENTS.md 작성 (30분)

프로젝트 루트에 이 파일을 만들면 Codex가 매 세션마다 자동으로 읽는다.

```markdown
# AGENTS.md — 선거정보지도 프로젝트 규칙

## 프로젝트 개요
6.3 전국동시지방선거 인터랙티브 선거 정보 지도
배포: https://korea-local-election.pages.dev
스택: 바닐라 HTML + CSS + JavaScript (프레임워크 없음)

## 파일 구조와 수정 규칙

### 데이터 파일 (data/*.json)
- 선거 관련 모든 팩트 데이터는 여기에만 저장
- 수정 시 반드시 출처 확인 후 변경
- 커밋 메시지에 출처 명시: "data: 인천시장 여론조사 추가 (NESDC #15890)"
- 시뮬레이션 데이터는 "isSimulation": true 필수

### 탭별 렌더러 (js/tabs/*.js)
- 각 탭 파일은 독립적. 다른 탭 파일을 import하거나 호출하지 않음
- 데이터는 반드시 DataLoader를 통해 접근
- 탭 파일끼리 전역 변수를 공유하지 않음

### 수정 시 영향 범위 (이것만 기억)
| 수정 대상 | 건드려도 되는 파일 | 건드리면 안 되는 파일 |
|----------|-------------------|---------------------|
| 여론조사탭 | data/polls.json, js/tabs/poll-tab.js | 다른 모든 파일 |
| 후보자탭 | data/candidates.json, js/tabs/candidate-tab.js | 다른 모든 파일 |
| 뉴스탭 | js/tabs/news-tab.js, js/news_filters.js | 다른 모든 파일 |
| 개요탭 | js/tabs/overview-tab.js | 다른 모든 파일 |
| 역대비교탭 | data/prev-elections.json, js/tabs/history-tab.js | 다른 모든 파일 |
| 지도 | js/map.js | 탭 파일들 |
| 좌측 패널 | app.js의 좌측 패널 관련 코드만 | 우측 탭 파일들 |

### 절대 금지 사항
1. data/*.json 파일에 함수나 로직을 넣지 않음 (순수 데이터만)
2. 탭 js 파일에서 다른 탭 js 파일의 함수를 호출하지 않음
3. 전역 변수로 탭 간 데이터를 전달하지 않음
4. data.js에 새 데이터를 추가하지 않음 (data/*.json에 추가)
5. 여론조사 수치를 소스 확인 없이 변경하지 않음

### 시뮬레이션 데이터 표기
- 실제 데이터가 아닌 모든 항목에 isSimulation: true 플래그
- UI에서 시뮬레이션 데이터는 "(모의)" 라벨 표시
- 푸터의 "시뮬레이션 데이터 포함" 고지 유지

## 선거 캘린더 규칙

### 시간 기준
- 모든 날짜 비교는 js/election-calendar.js의 getKST() 사용
- 문자열 날짜 비교 금지 ('2026-05-28' >= today 같은 코드 금지)
- Date 객체 + KST 변환만 허용

### 여론조사 공표금지 (법적 필수)
- isPublicationBanned() 함수로만 판정
- 이 함수는 getCurrentPhase()를 참조하지 않음 (완전 독립)
- 공표금지 시 polls 데이터 자체를 빈 배열로 반환 (UI 숨김이 아님)
- 5/28 00:00 ~ 6/3 18:00 (KST)

### 후보자 정렬
- 5/15 18:00 전: 상태 우선순위 정렬
- 5/15 18:00 후: 기호순
- getCandidateSortMode() 함수로 판정

### 배너
- getBannerConfig() 함수가 시기별 배너 내용 반환
- 1시간마다 자동 갱신

### 수정 시 주의
- election-calendar.js의 DATES 상수를 변경할 때는 반드시 커밋 메시지에 사유 기재
- isPublicationBanned() 함수를 수정하는 것은 법적 리스크를 수반하므로 최소한으로

## 현재 진행 상황
- D-76 (2026.03.19 기준)
- 예비후보 등록 진행 중, 공천 결과 3월 말~4월 확정 예정
- 여론조사: NESDC 등록 조사 수집 중
- 본후보 등록: 5/14~15
- 공표금지 기간: 5/28~6/3
```

---

## 4. Codex에서의 실행 명령어

이 작업을 Codex에서 하려면, 새 세션을 열고 아래 순서대로 지시:

```
1번째 지시:
"프로젝트 루트에 AGENTS.md를 만들어줘. 내용은 [위 AGENTS.md 내용 붙여넣기]"

2번째 지시:
"data/ 폴더를 만들고, 현재 js/data.js에 있는 데이터 객체들을
종류별로 JSON 파일로 분리해줘.
- 지역 정보 → data/regions.json
- 후보자 → data/candidates.json
- 여론조사 → data/polls.json
- 이전 선거 → data/prev-elections.json
- 이슈 → data/issues.json
- 정당 지지율 → data/party-support.json
그리고 js/data-loader.js를 만들어서 이 JSON들을 fetch로 로드하는 
DataLoader 객체를 만들어줘."

3번째 지시:
"app.js에서 각 탭(개요/여론조사/후보자/뉴스/역대비교)의 
렌더링 함수를 찾아서 js/tabs/ 폴더로 분리해줘.
각 탭 파일은 독립적으로 동작해야 하고,
데이터는 반드시 DataLoader를 통해서만 접근해야 해."

4번째 지시:
"index.html의 script 태그 순서를 정리해줘.
data-loader.js → 독립 모듈들 → 탭 파일들 → app.js 순서로."
```

**각 단계마다 사이트가 정상 동작하는지 확인 후 다음 단계로 넘어갈 것.**

---

## 5. 이 작업의 효과

| Before | After |
|--------|-------|
| 여론조사 수정하다가 후보자 데이터 깨짐 | polls.json만 열면 됨, candidates.json은 안 건드림 |
| 뉴스탭 수정하다가 개요탭 깨짐 | news-tab.js만 수정, overview-tab.js는 파일도 안 열음 |
| "어디서 깨졌는지 모르겠다" | 각 탭이 독립 파일이라 문제 범위가 명확 |
| Codex가 전체 app.js를 건드림 | AGENTS.md 규칙 덕에 해당 탭 파일만 수정 |
| 시뮬레이션 데이터와 실제 데이터 혼재 | JSON에 isSimulation 플래그로 구분 |

---

## 6. 작업 시간 추정

| 단계 | 작업 | 시간 |
|------|------|------|
| Step 1 | data/ 폴더 + JSON 분리 | 2시간 |
| Step 2 | 탭 렌더러 분리 | 3시간 |
| Step 3 | script 로드 순서 정리 | 30분 |
| Step 4 | AGENTS.md 작성 | 30분 |
| 검증 | 전체 동작 확인 | 1시간 |
| **합계** | | **약 7시간 (하루)** |

---

*"프레임워크를 바꾸지 않아도, 파일을 나누는 것만으로 실수의 80%를 막을 수 있다."*