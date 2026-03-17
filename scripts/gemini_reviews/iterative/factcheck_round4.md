# 수치 및 데이터 팩트체크 - Round 4/5

생성일: 2026-03-09 11:06
모델: gemini-2.5-flash

---

지금까지의 모든 분석 내용을 종합하여 2026년 6.3 전국지방선거 인터랙티브 지도 프로젝트의 실행 가능한 액션 아이템을 시급성 별로 정리해 드립니다.

---

### **2026년 6.3 전국지방선거 프로젝트 액션 아이템**

#### **즉시 수정 (코드 변경 1시간 이내)**
프로젝트의 사실 관계 오류를 바로잡고 신뢰도를 확보하기 위한 최우선 조치입니다.

1.  **광역/기초 비례 의석수 수정 및 보완**
    *   **무엇을 어디서 변경하는가:** `index.html` (사이드바 또는 관련 표시 영역)
    *   **변경 전/후 코드 또는 디자인:**
        ```html
        <!-- 변경 전 -->
        <p>광역의원: 789</p>
        <p>기초의원: 2,927</p>
        <p>광역비례: 47</p>
        <p>기초비례: 120</p>
        <p>재보궐: 4</p>

        <!-- 변경 후 -->
        <p>광역의원: 789 <span class="note">(지역구 의석, 제8회 지선 기준)</span></p>
        <p>기초의원: 2,927 <span class="note">(총 의석, 제8회 지선 기준)</span></p>
        <p>광역비례: 116 <span class="note">(제8회 지선 기준)</span></p> <!-- 47 -> 116으로 수정 -->
        <p>기초비례: 325 <span class="note">(제8회 지선 기준)</span></p> <!-- 120 -> 325으로 수정 -->
        <p>재보궐: 4 <span class="note">(예측치)</span></p>
        <p class="warning-note">※ 2026년 제9회 지방선거의 최종 의석수는 선거구 획정 결과에 따라 변경될 수 있습니다.</p>
        ```
    *   **예상 효과:** 잘못된 총 의석수 정보로 인한 혼란을 방지하고, 제8회 지방선거 기준 데이터를 정확하게 전달하여 프로젝트의 신뢰도를 크게 향상시킵니다. 2026년 선거구 미확정 상황에 대한 투명한 고지를 제공합니다.

2.  **지난 선거 결과(PrevElection) 런너업 후보 정보 수정**
    *   **무엇을 어디서 변경하는가:** `data.js` 파일 내 `regions` 객체의 `prevElection` 데이터
    *   **변경 전/후 코드 또는 디자인:**
        ```javascript
        // 변경 전 (일부 발췌)
        'busan': { /* ... */ prevElection: { winner: 'ppp', winnerName: '박형준', rate: 62.7, runner: 'democratic', runnerName: '김영춘', runnerRate: 34.1, turnout: 47.5 }, /* ... */ },
        'daegu': { /* ... */ prevElection: { winner: 'ppp', winnerName: '홍준표', rate: 78.75, runner: 'democratic', runnerName: '곽상언', runnerRate: 21.25, turnout: 48.1 }, /* ... */ },
        'gwangju': { /* ... */ prevElection: { winner: 'democratic', winnerName: '강기정', rate: 74.91, runner: 'democratic', runnerName: '이용섭', runnerRate: 25.09, turnout: 37.66 }, /* ... */ }

        // 변경 후 (실제 제8회 지방선거 결과 반영)
        'busan': { /* ... */ prevElection: { winner: 'ppp', winnerName: '박형준', rate: 62.7, runner: 'democratic', runnerName: '변성완', runnerRate: 34.1, turnout: 47.5 }, /* ... */ }, // 김영춘 -> 변성완
        'daegu': { /* ... */ prevElection: { winner: 'ppp', winnerName: '홍준표', rate: 78.75, runner: 'democratic', runnerName: '서재헌', runnerRate: 21.25, turnout: 48.1 }, /* ... */ }, // 곽상언 -> 서재헌
        'gwangju': { /* ... */ prevElection: { winner: 'democratic', winnerName: '강기정', rate: 74.91, runner: 'ppp', runnerName: '주기환', runnerRate: 14.15, turnout: 37.66 }, /* ... */ } // runner 당, 이름, 득표율 모두 수정
        ```
    *   **예상 효과:** 지난 선거 결과에 대한 정확한 정보를 제공하여 사용자에게 올바른 역사적 맥락을 전달합니다. 특히 광주처럼 런너업 정당이 완전히 다른 경우의 오해를 불식시켜 프로젝트 신뢰도를 크게 높입니다.

3.  **광역의원 비례대표 데이터 `totalSeats` 및 `parties[].seats` 전면 수정**
    *   **무엇을 어디서 변경하는가:** 제공된 `비례대표 데이터` JSON 파일 (`councilProportional.json` 추정)
    *   **변경 전/후 코드 또는 디자인:** (전체 17개 시도에 대해 중앙선거관리위원회 공식 자료를 기반으로 수정 필요)
        ```json
        // 변경 전 (일부 발췌)
        "seoul": { "totalSeats": 21, "parties": [{ "party": "ppp", "seats": 12 }, { "party": "democratic", "seats": 8 }, { "party": "justice", "seats": 1 }]},
        "busan": { "totalSeats": 9, "parties": [{ "party": "ppp", "seats": 6 }, { "party": "democratic", "seats": 3 }]},
        "gyeonggi": { "totalSeats": 27, "parties": [{ "party": "ppp", "seats": 15 }, { "party": "democratic", "seats": 11 }, { "party": "justice", "seats": 1 }]},
        "gangwon": { "totalSeats": 7, "parties": [{ "party": "ppp", "seats": 5 }, { "party": "democratic", "seats": 2 }]},
        "jeju": { "totalSeats": 5, "parties": [{ "party": "ppp", "seats": 3 }, { "party": "democratic", "seats": 2 }]}

        // 변경 후 (일부 발췌, 중앙선관위 제8회 지방선거 공식 결과 반영)
        "seoul": { "totalSeats": 10, "parties": [{ "party": "ppp", "seats": 5, "voteShare": 50.6 }, { "party": "democratic", "seats": 5, "voteShare": 42.3 }, { "party": "justice", "seats": 0, "voteShare": 4.2 }]}, // 총 10석: 국민의힘 5, 민주당 5
        "busan": { "totalSeats": 8, "parties": [{ "party": "ppp", "seats": 4, "voteShare": 59.8 }, { "party": "democratic", "seats": 4, "voteShare": 33.2 }]}, // 총 8석: 국민의힘 4, 민주당 4
        "gyeonggi": { "totalSeats": 20, "parties": [{ "party": "ppp", "seats": 10, "voteShare": 48.3 }, { "party": "democratic", "seats": 10, "voteShare": 43.1 }, { "party": "justice", "seats": 0, "voteShare": 4.6 }]}, // 총 20석: 국민의힘 10, 민주당 10
        "gangwon": { "totalSeats": 6, "parties": [{ "party": "ppp", "seats": 3, "voteShare": 54.8 }, { "party": "democratic", "seats": 3, "voteShare": 36.0 }]}, // 총 6석: 국민의힘 3, 민주당 3
        "jeju": { "totalSeats": 7, "parties": [{ "party": "ppp", "seats": 4, "voteShare": 47.8 }, { "party": "democratic", "seats": 3, "voteShare": 39.5 }]} // 총 7석: 국민의힘 4, 민주당 3
        ```
    *   **예상 효과:** 비례대표 의석 배분이라는 핵심 선거 데이터의 무결성을 확보하여, 프로젝트가 제시하는 의석수 정보의 정확성을 획기적으로 개선합니다. 이는 선거 제도 및 정당별 의회 구성에 대한 올바른 이해를 돕습니다.

4.  **조국혁신당 당색(HEX 코드) 가독성 개선 (다크 테마)**
    *   **무엇을 어디서 변경하는가:** CSS 또는 다크 테마 전환을 담당하는 JavaScript 로직 (필요시 `data.js`의 color 값도 함께 조정)
    *   **변경 전/후 코드 또는 디자인:**
        ```css
        /* 기본 테마 */
        .party-reform {
            color: #FFFFFF; /* 밝은 텍스트 */
            background-color: #0A1747; /* 진한 남색 */
        }

        /* 다크 테마 적용 시 */
        body.dark-theme .party-reform {
            background-color: #3F4770; /* #0A1747보다 밝은 계열의 남색으로 조정 */
            /* 또는 텍스트에 밝은 테두리 추가 */
            /* text-shadow: 0 0 2px #FFF, 0 0 2px #FFF, 0 0 2px #FFF; */
        }
        ```
    *   **예상 효과:** 어두운 배경에서 조국혁신당의 당색이 배경에 묻혀 정보가 잘 보이지 않는 문제를 해결하여, 다크 테마 사용자들도 중요한 정당 정보를 쉽게 인지할 수 있도록 사용자 경험을 개선합니다.

#### **단기 개선 (1-3일)**
프로젝트의 투명성과 정보의 맥락을 명확히 하는 작업입니다.

1.  **2026년 지방선거 데이터의 '예측성' 및 '임의성' 전면 고지**
    *   **무엇을 어디서 변경하는가:** `index.html` (페이지 상단, 푸터, 또는 팝업 등), `data.js` (주석 추가)
    *   **변경 전/후 코드 또는 디자인:**
        ```html
        <!-- index.html 상단 또는 눈에 띄는 위치에 추가 -->
        <div class="disclaimer-banner">
            <p><strong>※ 고지:</strong> 본 프로젝트의 후보자 정보, 여론조사, 인구 데이터, 선거구 획정 등은 2026년 3월 현재 가상으로 생성된 예측치 및 예시 데이터입니다. 실제 선거 정보는 중앙선거관리위원회의 공식 발표에 따라 추후 업데이트될 예정입니다.</p>
        </div>

        // data.js 파일 내 관련 데이터에 주석 추가 (예시)
        const regions = {
            'seoul': {
                // ...
                candidates: [
                    { /* ... */ }, // 2026년 가상 후보 데이터
                    { /* ... */ },
                    { /* ... */ }
                ],
                polls: [
                    { /* ... */ }, // 2026년 가상 여론조사 데이터
                    // ...
                ],
                demographics: { /* ... */ } // 2026년 가상 연령대별 지지율 데이터
                // ...
            }
        };
        ```
    *   **예상 효과:** 사용자가 프로젝트 데이터를 실제 정보로 오인하는 것을 방지하고, 프로젝트의 투명성을 높여 신뢰도를 확보합니다. 개발팀 내부에서도 데이터의 성격을 명확히 인지하게 합니다.

2.  **주요 데이터 출처 및 기준 시점 명확화**
    *   **무엇을 어디서 변경하는가:** `data.js` (각 데이터 블록 상단 또는 인접 위치에 주석으로 추가), `index.html` (필요시 UI에도 표시)
    *   **변경 전/후 코드 또는 디자인:**
        ```javascript
        // data.js 파일 내 (예시)
        // 2024년 2월 행정안전부 주민등록인구현황 기준
        // (유권자 수는 KOSIS 국가통계포털 기반 추정치)
        const regions = {
            'seoul': {
                code: '11', name: '서울특별시', nameEng: 'Seoul',
                population: 9411000, voters: 8234000,
                currentGovernor: { name: '오세훈', party: 'ppp', since: 2021 },
                // 중앙선거관리위원회 제8회 전국동시지방선거 개표 결과 (광역단체장) 기준
                prevElection: { winner: 'ppp', winnerName: '오세훈', rate: 59.0, runner: 'democratic', runnerName: '송영길', runnerRate: 39.2, turnout: 50.6 },
                // ...
            },
            // ...
        };

        // 중앙선거관리위원회 정당등록현황 (2024년 3월 기준)
        const parties = { /* ... */ };

        // 2026년 공직선거법 제34조, 제154조 및 2026년 달력 기준
        const electionDate = new Date('2026-06-03T00:00:00+09:00');
        const preVoteDates = { /* ... */ };
        ```
    *   **예상 효과:** 데이터의 신뢰성과 투명성을 높이고, 사용자가 정보의 출처를 쉽게 확인할 수 있도록 하여 프로젝트에 대한 신뢰를 강화합니다.

#### **중장기 개선 (1주 이상 소요 예상)**
사용자 경험 향상 및 미래 데이터 업데이트를 위한 계획 수립에 초점을 맞춥니다.

1.  **50대 이상 유권자를 위한 UI/UX 강화**
    *   **무엇을 어디서 변경하는가:** CSS, JavaScript (UI 컴포넌트), HTML (마크업 구조)
    *   **변경 전/후 코드 또는 디자인:**
        *   **가독성:** 기본 글꼴 크기 상향 조정 (예: `font-size: 1.1em;`), 사용자 글꼴 크기 조절 기능 추가, 텍스트-배경 명암 대비 WCAG AA 등급 이상 준수, 조국혁신당 당색 등 저대비 색상에 대한 다크모드 대응 로직 구현.
        *   **직관성:** 주요 정보(예상 당선인, 득표율, 의석수)는 큰 글씨와 명확한 시각적 요소로 강조. 복잡한 메뉴 대신 탭, 사이드바 등 단순한 내비게이션 구조 선호.
        *   **모바일 퍼스트:** 반응형 디자인 전반에 걸쳐 모바일 환경에서의 가독성, 터치 영역, 조작 용이성 재점검.
    *   **예상 효과:** 50대 이상 유권자를 포함한 모든 사용자가 정보를 더 쉽고 편안하게 탐색하고 이해할 수 있도록 하여, 프로젝트의 접근성과 만족도를 크게 향상시킵니다.

2.  **한국 유권자의 정치 정보 탐색 패턴 고려 기능 추가**
    *   **무엇을 어디서 변경하는가:** JavaScript (데이터 처리 및 시각화 로직), HTML (UI 요소 추가), CSS
    *   **변경 전/후 코드 또는 디자인:**
        *   **과거 선거 결과 비교:** 현재 예측 득표율과 `prevElection` 데이터를 병렬로 표시하거나 시계열 그래프로 변화 추이를 시각화.
        *   **지역 밀착형 공약 강조:** 지역 상세 페이지에서 `keyIssues`와 연관된 후보별 `pledges`를 비교하여 볼 수 있는 인터페이스 제공.
        *   **정당/후보 지지율 지역별 시각화:** 지도 클릭 시 해당 지역의 `partySupport` 및 `polls` 데이터를 막대 그래프, 파이 차트 등으로 간결하게 시각화하여 제공.
        *   **후보자 정보 충실성:** 실제 후보자 확정 시 고해상도 `photo` 이미지 추가. `career`와 `pledges`는 핵심 내용 위주로 요약 및 강조.
    *   **예상 효과:** 사용자가 지역의 정치적 흐름을 심층적으로 이해하고, 후보자 및 공약에 대한 정보를 효과적으로 비교 분석할 수 있도록 도와 지방선거에 대한 관심과 참여를 증진시킵니다.

3.  **2026년 선거구 획정 완료 후 데이터 업데이트 계획 수립**
    *   **무엇을 어디서 변경하는가:** 프로젝트 관리 계획 (코드 변경은 아니지만, 데이터 업데이트 주체, 시기, 방식 등을 문서화)
    *   **변경 전/후 코드 또는 디자인:** 현재는 2022년 기준 데이터와 '미정' 고지로 유지. 추후 획정 완료 시 관련 데이터(광역/기초 의원 의석수, 선거구 경계 등)를 공식 자료 기반으로 업데이트.
    *   **예상 효과:** 프로젝트가 미래 지향적인 목적을 달성할 수 있도록 장기적인 계획을 수립하고, 실제 선거 시점에 가장 정확한 최신 정보를 제공할 기반을 마련합니다.

---

이 실행 가능한 액션 아이템 목록이 프로젝트의 성공적인 개발과 정확성 확보에 큰 도움이 되기를 바랍니다.
