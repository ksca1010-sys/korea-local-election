/**
 * 지역 핵심이슈 발굴 엔진 v4
 *
 * 접근법: 뉴스 제목 N-gram 빈도 분석 + YAKE 통계 특성 + 의미 필터링
 *
 * 1. 지역명으로 뉴스 수집
 * 2. 제목에서 한국어 조사 제거 → 명사구 추출
 * 3. 유니그램 + 바이그램 빈도 + 공기어(co-occurrence) 추적
 * 4. YAKE Relatedness: 다양한 단어와 공기하는 용어 = 범용어 → 감점
 * 5. 의미유형 필터: 대학/기관명, 행사명, 프로그램명 제거
 * 6. 결과가 0건이면 빈 배열 (허수 채우기 금지)
 *
 * 참고: YAKE (Yet Another Keyword Extractor) 5대 통계 특성
 *       + KR-WordRank 접미사 필터링을 브라우저 JS에 맞게 경량 구현
 */
window.IssueEngine = (function () {
    'use strict';

    const NEWS_PROXY = window.NEWS_PROXY_BASE || (location.hostname === 'localhost' ? 'http://localhost:8787' : '');
    const CACHE_TTL = 6 * 60 * 60 * 1000;
    const cache = {};

    // ── 지역명 ──
    const REGIONS = {
        seoul:    { short: '서울', full: '서울특별시', aliases: ['서울시'] },
        busan:    { short: '부산', full: '부산광역시', aliases: ['부산시'] },
        daegu:    { short: '대구', full: '대구광역시', aliases: ['대구시'] },
        incheon:  { short: '인천', full: '인천광역시', aliases: ['인천시'] },
        gwangju:  { short: '광주', full: '광주광역시', aliases: ['광주시'] },
        daejeon:  { short: '대전', full: '대전광역시', aliases: ['대전시'] },
        ulsan:    { short: '울산', full: '울산광역시', aliases: ['울산시'] },
        sejong:   { short: '세종', full: '세종특별자치시', aliases: ['세종시'] },
        gyeonggi: { short: '경기', full: '경기도', aliases: ['경기도'] },
        gangwon:  { short: '강원', full: '강원특별자치도', aliases: ['강원도'] },
        chungbuk: { short: '충북', full: '충청북도', aliases: ['충북'] },
        chungnam: { short: '충남', full: '충청남도', aliases: ['충남'] },
        jeonbuk:  { short: '전북', full: '전북특별자치도', aliases: ['전라북도'] },
        jeonnam:  { short: '전남', full: '전라남도', aliases: ['전남'] },
        gyeongbuk:{ short: '경북', full: '경상북도', aliases: ['경북'] },
        gyeongnam:{ short: '경남', full: '경상남도', aliases: ['경남'] },
        jeju:     { short: '제주', full: '제주특별자치도', aliases: ['제주도'] }
    };

    // ── 불용어: 이슈가 아닌 일반 정치/선거/뉴스 용어 ──
    const STOPWORDS = new Set([
        // 선거 일반
        '선거', '투표', '후보', '후보자', '출마', '공천', '캠프', '지지율', '여론조사',
        '당선', '낙선', '재선', '기호', '개표', '사전투표', '선거운동', '유세', '합동연설',
        '지방선거', '보궐선거', '대선', '총선', '격전지', '접전', '구도',
        // 정당
        '더불어민주당', '국민의힘', '민주당', '조국혁신당', '개혁신당', '진보당',
        '여당', '야당', '정당', '당대표', '원내대표', '비대위', '전당대회',
        // 직함·인물 패턴
        '대통령', '국회의원', '의원', '시장', '도지사', '군수', '구청장', '교육감',
        '장관', '총리', '비서관', '수석', '대변인', '전직', '현직', '후임', '전임',
        '시의원', '도의원', '군의원', '구의원',
        // 뉴스·미디어
        '기자', '뉴스', '보도', '취재', '기사', '속보', '단독', '인터뷰', '논평',
        '무등', '아침', '기자의눈', '헬로이슈토크', '전격시사', '스페셜', '월간중앙',
        '지자체', '이슈', '주간정치', '총점검',
        // 시간 표현
        '오늘', '내일', '어제', '최근', '현재', '올해', '내년', '지난해', '지난',
        '이번', '다음', '매우', '정말', '아주', '4년', '8기',
        // 지역 일반
        '지역', '주민', '시민', '도민', '군민', '구민', '주민들', '시민들',
        '지방', '기초', '광역',
        // 일반 동사/형용사/부사
        '필요', '중요', '강조', '발표', '예정', '진행', '추진', '논의', '대비', '대응',
        '관련', '대한', '위한', '통한', '따른', '대해', '통해', '위해',
        '것으로', '에서', '으로', '에게', '까지', '부터', '처럼',
        '있다', '없다', '했다', '된다', '한다', '이다', '밝혔다', '전했다',
        '사회', '경제', '문화', '정치', '국제', '사건', '사고',
        '성과', '비전', '변화', '도약', '혁신', '미래', '발전',
        '강화', '확대', '가능성', '박차', '속도', '본격', '본격화',
        '찬성', '반대', '원칙적', '선제',
        // 선거 프로세스
        '예비후보', '경선', '단일화', '공약', '토론회', '유세', '현수막', '단속',
        '브리핑', '모음', '프로그램', '협력', '출범', '이제',
        '깜깜', '각축전', '무주공산', '재선', '가도',
        // 행정 내부·의회
        '전보인사', '국·과장급', '인사', '조직', '기획조사', '기본계획',
        '소통간담회', '간담회', '토크', '상생토크', '출판기념회', '연석회',
        '권한대행', '5일제', '회의',
        // 시간·숫자 패턴
        '2026년', '2025년', '2024년', '6·3',
        // 기관명·행사성
        'RISE', '동국대', '투자유치', '포럼', '세미나', '총회', '정기총회',
        '성과공유', '공천신청', '전략공천', 'D-90',
        '사달났다', '효과분석', '지원사업', '사랑의열매',
        'Who', 'Is'
    ]);

    // ── 인물명 패턴: 2~3글자 한글 + 직함 조합은 이슈가 아님 ──
    const TITLE_PATTERNS = [
        '시장', '도지사', '군수', '구청장', '교육감', '의원', '대표', '위원장',
        '후보', '전직', '현직'
    ];

    // 이슈가 아닌 인물·기관·직함 참조 필터
    const INSTITUTION_SUFFIXES = [
        '시의회', '도의회', '군의회', '구의회', '교육청', '교육감', '도지사',
        '시장', '군수', '구청장', '지사', '의장', '부의장', '국회부의장',
        '시의원', '도의원', '군의원', '구의원', '광역시회'
    ];

    function isPersonOrInstitution(term) {
        const words = term.split(' ');
        // 2~3글자 순한글 = 인물명 가능성
        if (/^[가-힣]{2,3}$/.test(term)) return true;
        // 직함·기관 접미사
        if (INSTITUTION_SUFFIXES.some(s => term.endsWith(s))) return true;
        // 바이그램 인물 패턴
        if (words.length === 2) {
            if (words[0].length >= 2 && words[0].length <= 4 && TITLE_PATTERNS.some(t => words[1].includes(t))) return true;
            if (words[1].length >= 2 && words[1].length <= 4 && TITLE_PATTERNS.some(t => words[0].includes(t))) return true;
        }
        return false;
    }

    // ── 의미유형 필터: 이슈가 아닌 고유명사 ──
    // 대학교, 학교, 기관, 행사, 프로그램 등의 접미사
    const NON_ISSUE_SUFFIXES = [
        // 교육기관
        '대학교', '대학', '공대', '사대', '의대', '법대', '약대',
        '초등학교', '중학교', '고등학교', '초교', '중교', '고교',
        // 기관·조직
        '연구원', '연구소', '재단', '공사', '공단', '센터', '사업단',
        '협회', '협의회', '조합', '연합회', '상공회의소',
        '테크노파크', '테크노밸리', '산업단지', '혁신도시',
        '경찰청', '소방본부', '지방법원', '지검',
        '의료원', '보건소', '복지관', '진흥원', '정보원',
        // 행사·회의
        '공유회', '보고회', '설명회', '토론회', '간담회', '기념회',
        '축제', '박람회', '전시회', '체육대회', '대회', '발대식',
        '출범식', '개소식', '준공식', '착공식', '기공식', '이취임식',
        // 프로그램·사업
        '지원사업', '시범사업', '특별사업', '육성사업'
    ];

    // 지역명 접두 기관명 탐지 (경남테크노파크, 충북혁신도시 등)
    const REGION_PREFIXES = ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
        '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];
    const INSTITUTION_CORES = ['테크노파크', '테크노밸리', '혁신도시', '산업단지',
        '경제자유구역', '과학기술원', '연구원', '진흥원', '정보원', '문화재단',
        '관광공사', '도시공사', '개발공사', '환경공단'];

    // 선거/지방자치와 무관한 영역 (국가 관할, 범죄, 외교 등)
    const NON_LOCAL_PATTERNS = [
        /마약/, /범죄심리/, /범죄중독/, /수사기관/, /검찰수사/, /기소/,
        /사형/, /구속영장/, /피의자/, /피고인/,
        /외교/, /국방/, /미사일/, /북핵/, /한미동맹/,
        /금리인상/, /기준금리/, /환율/, /GDP/,
        /아이돌/, /드라마/, /프로야구/, /월드컵/,
        /심리학/, /사회학/, /범죄학/, /학술지/, /논문/
    ];

    // 지방자치 관련 정책 신호 (선거 이슈 가능성 높음)
    const LOCAL_POLICY_SIGNALS = [
        /교통/, /도로/, /철도/, /공항/, /항만/, /버스/, /지하철/,
        /복지/, /보육/, /어린이/, /노인/, /청년/, /출산/,
        /일자리/, /고용/, /취업/, /실업/,
        /개발/, /재개발/, /도시재생/, /균형발전/, /특구/,
        /행정통합/, /통합특별/, /자치분권/,
        /환경/, /폐기물/, /미세먼지/, /하천/, /수질/,
        /예산/, /세금/, /재정/, /부채/,
        /급식/, /돌봄/, /방과후/,
        /농업/, /어업/, /농촌/, /귀농/, /귀촌/,
        /주거/, /아파트/, /주택/, /임대/, /분양/,
        /안전/, /재난/, /소방/, /방재/,
        /관광/, /문화/, /축제/,
        /의료/, /병원/, /응급/
    ];

    function isNonIssueEntity(term) {
        // 접미사 기반 필터
        if (NON_ISSUE_SUFFIXES.some(s => term.endsWith(s))) return true;
        // 지역명+기관 복합명 (경남테크노파크, 충북혁신도시 등)
        if (REGION_PREFIXES.some(p => term.startsWith(p)) &&
            INSTITUTION_CORES.some(c => term.includes(c))) return true;
        // "국립~", "사립~" + 짧은 이름 = 기관명
        if (/^(국립|사립|공립|도립|시립|국가|민간)[가-힣]{2,6}$/.test(term)) return true;
        // 영문 포함 (프로그램명: RISE, UP, ESG 등)
        if (/[A-Za-z]/.test(term) && term.length <= 15) return true;
        // "N차년", "N단계", "N기" 등 프로그램 단계 표현
        if (/\d+(차년|단계|기|호|차|개년|개소|건)/.test(term)) return true;
        return false;
    }

    // 선거/지방자치 관할 밖 주제 필터
    function isNonLocalTopic(term) {
        return NON_LOCAL_PATTERNS.some(rx => rx.test(term));
    }

    // 지방자치 정책 관련 용어 → 보너스
    function hasLocalPolicySignal(term) {
        return LOCAL_POLICY_SIGNALS.some(rx => rx.test(term));
    }

    // ── 노이즈 바이그램 필터 ──
    function isNoiseBigram(bigram) {
        if (/^\d/.test(bigram)) return true;
        // 행정 내부·회의·행사
        if (/전보인사|국·과장|부대변인|임명|보고회|개최|회의|간담회|기념회|토크|소통|제\d+회|정기총회|성과공유|공천신청|전략공천|효과분석|사달났다/.test(bigram)) return true;
        if (/민선\s*\d/.test(bigram)) return true;
        if (/2026년|6·3/.test(bigram)) return true;
        // 의미유형 필터: 양쪽 단어 중 하나라도 기관/행사/프로그램이면 제거
        const words = bigram.split(' ');
        if (words.some(w => isNonIssueEntity(w))) return true;
        // 양쪽 단어가 인물명(2~3글자)
        if (words.length === 2 && /^[가-힣]{2,3}$/.test(words[0]) && /^[가-힣]{2,3}$/.test(words[1])) return true;
        // 직함 포함
        const titleSuffixes = ['시장', '도지사', '군수', '구청장', '교육감', '교육청', '시당', '도당', '의회', '의장', '의원'];
        if (words.some(w => titleSuffixes.some(t => w.endsWith(t)))) return true;
        // 인물명 + 어떤단어 패턴 (한쪽이 2~3글자 인명)
        if (words.length === 2) {
            const hasName = words.some(w => /^[가-힣]{2,3}$/.test(w));
            if (hasName) return true;
        }
        return false;
    }

    // ── 지역명 자체를 불용어에 추가 (각 지역 분석 시 동적으로) ──
    // 인접 지역 그룹 (행정통합 등 공동이슈가 있을 수 있는 지역쌍)
    const ADJACENT_REGIONS = {
        gwangju: ['jeonnam'], jeonnam: ['gwangju'],
        busan: ['gyeongnam'], gyeongnam: ['busan'],
        daegu: ['gyeongbuk'], gyeongbuk: ['daegu'],
        daejeon: ['chungnam', 'chungbuk', 'sejong'], chungnam: ['daejeon', 'sejong'],
        chungbuk: ['daejeon'], sejong: ['daejeon', 'chungnam'],
        jeonbuk: ['jeonnam']
    };

    function getRegionStopwords(regionKey) {
        const r = REGIONS[regionKey];
        if (!r) return new Set();
        const s = new Set([r.short, r.full, ...r.aliases]);
        s.add(r.short + '시');
        s.add(r.short + '도');
        s.add(r.short + '광역시');
        s.add(r.short + '특별시');
        // 비인접 지역명은 불용어 처리 (다른 지역 이슈가 키워드로 잡히는 것 방지)
        // 인접 지역은 제외 (광주-전남 행정통합 같은 공동이슈 보존)
        const adjacent = new Set(ADJACENT_REGIONS[regionKey] || []);
        for (const [key, val] of Object.entries(REGIONS)) {
            if (key === regionKey || adjacent.has(key)) continue;
            s.add(val.short);
            s.add(val.full);
            for (const a of val.aliases) s.add(a);
        }
        return s;
    }

    function stripHtml(str) {
        return (str || '').replace(/<[^>]*>/g, '').replace(/&[a-z]+;/gi, ' ').trim();
    }

    function getHost(url) {
        try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
    }

    // ── 한국어 조사 제거 (어절 → 명사구 추출) ──
    // 한국어 어절에서 후행 조사·어미를 제거하여 체언(명사) 부분을 추출
    const PARTICLE_PATTERN = /(은|는|이|가|을|를|에|의|와|과|도|로|으로|에서|에게|까지|부터|처럼|만|도|라|서|며|고|면|나|든|야|요|라고|이라|이다|했다|한다|된다|하는|하여|하고|해서|했고|되는|되고|됐다|에는|에도|에서는|으로는|이라는|에서의|과의|와의|로의|까지의|이나|이란|으로서|이며|이고|입니다|합니다|됩니다|있는|없는|있다|없다|한|할|함|됨|임|중|내|및|등|것|수|더|또|각|해|후|간|전)$/;

    function stripParticles(word) {
        if (word.length <= 1) return word;
        // 반복적으로 조사 제거 (최대 3회)
        let result = word;
        for (let i = 0; i < 3; i++) {
            const prev = result;
            result = result.replace(PARTICLE_PATTERN, '');
            if (result === prev || result.length <= 1) break;
        }
        return result;
    }

    // ── 유효한 명사구인지 판별 ──
    function isValidTerm(term, regionStops) {
        if (term.length < 2) return false;
        if (STOPWORDS.has(term)) return false;
        if (regionStops.has(term)) return false;
        if (/^\d+$/.test(term)) return false;
        // 숫자+한글 짧은 조합 (3일, 5월, 6·3 등)
        if (/^[\d·]+[가-힣]?$|^[가-힣]?[\d·]+$/.test(term) && term.length <= 4) return false;
        // 연도 패턴
        if (/^\d{4}년?$/.test(term)) return false;
        // 제N회 (의회 회차)
        if (/^제\d+회$/.test(term)) return false;
        // 의미유형: 대학/기관/행사/프로그램명은 이슈가 아님
        if (isNonIssueEntity(term)) return false;
        return true;
    }

    // ── 뉴스 수집 ──
    async function fetchNews(regionKey) {
        const r = REGIONS[regionKey];
        if (!r) return [];

        // 다양한 쿼리로 검색해 커버리지 확보
        const queries = [
            `"${r.full}" 선거 이슈`,
            `"${r.short}" 현안 문제`,
            `"${r.full}" 주요 과제`
        ];

        const allItems = [];
        for (const q of queries) {
            try {
                const url = `${NEWS_PROXY}/api/news?query=${encodeURIComponent(q)}&display=100&sort=date`;
                const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
                if (!res.ok) continue;
                const data = await res.json();
                if (Array.isArray(data?.items)) {
                    for (const item of data.items) {
                        allItems.push({
                            title: stripHtml(item.title || ''),
                            desc: stripHtml(item.description || ''),
                            pubDate: item.pubDate ? new Date(item.pubDate) : null,
                            source: getHost(item.originallink || item.link || '')
                        });
                    }
                }
            } catch (e) { /* skip */ }
        }

        // 30일 이내
        const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
        return allItems.filter(a => a.pubDate && a.pubDate.getTime() > cutoff);
    }

    // ── 핵심: N-gram 빈도 분석 + YAKE 공기어 추적 ──
    function extractNgrams(articles, regionKey) {
        const regionStops = getRegionStopwords(regionKey);
        const r = REGIONS[regionKey];

        // 지역 관련성 키워드: 제목이나 본문에 이 지역 언급이 있는 기사만 분석
        const regionTerms = r ? [r.short, r.full, ...r.aliases] : [];

        const uniFreq = {};
        const biFreq = {};
        const uniSources = {};
        const biSources = {};
        // YAKE Relatedness: 각 단어의 공기어(좌우 이웃) 추적
        const cooccurrence = {};  // term → Set of neighboring terms
        // YAKE Positional: 제목 내 위치 추적 (앞에 올수록 중요)
        const positionSum = {};   // term → sum of (1/position)
        const positionCount = {}; // term → count
        // 문장(기사) 다양성: 몇 개의 서로 다른 기사에서 등장하는지
        const articleCount = {};  // term → count of distinct articles

        let relevantArticleCount = 0;

        // 교차오염 방지: 다른 지역의 지역명 목록 구축
        const otherRegionTerms = [];
        for (const [key, val] of Object.entries(REGIONS)) {
            if (key === regionKey) continue;
            otherRegionTerms.push({ key, terms: [val.short, val.full, ...val.aliases] });
        }

        for (const article of articles) {
            const text = article.title;
            if (!text) continue;

            // 지역 관련성 체크: 제목에 해당 지역명이 포함되어야 함 (본문만으로는 부족)
            const titleHasRegion = regionTerms.some(t => text.includes(t));
            const descText = article.desc || '';

            // 제목에 지역명 없으면 → 본문에서라도 확인하되, 엄격 체크
            if (!titleHasRegion) {
                const descHasRegion = regionTerms.some(t => descText.includes(t));
                if (!descHasRegion) continue;
            }

            // 교차오염 필터: 제목에 다른 지역명이 있으면서 현재 지역명이 제목에 없으면 스킵
            // (예: 서울 분석 중인데 제목이 "광주·전남 행정통합 촉구"이면 제거)
            if (!titleHasRegion) {
                const titleHasOther = otherRegionTerms.some(o =>
                    o.terms.some(t => text.includes(t))
                );
                if (titleHasOther) continue;
            }

            // 제목에 다른 지역이 더 많이 언급되면 그 지역 기사 → 스킵
            if (titleHasRegion) {
                const myMentions = regionTerms.reduce((c, t) => c + (text.includes(t) ? 1 : 0), 0);
                let otherDominant = false;
                for (const o of otherRegionTerms) {
                    const otherMentions = o.terms.reduce((c, t) => c + (text.includes(t) ? 1 : 0), 0);
                    if (otherMentions > myMentions) { otherDominant = true; break; }
                }
                if (otherDominant) continue;
            }

            relevantArticleCount++;

            // 어절 분리 → 조사 제거
            const tokens = text
                .replace(/[^\w가-힣\s·-]/g, ' ')  // 특수문자 제거 (·과 -는 유지)
                .split(/\s+/)
                .map(t => stripParticles(t.trim()))
                .filter(t => isValidTerm(t, regionStops));

            const source = article.source || 'unknown';

            // 유니그램 + YAKE 특성 수집
            const seenUni = new Set();
            for (let idx = 0; idx < tokens.length; idx++) {
                const t = tokens[idx];
                if (!seenUni.has(t)) {
                    seenUni.add(t);
                    uniFreq[t] = (uniFreq[t] || 0) + 1;
                    if (!uniSources[t]) uniSources[t] = new Set();
                    uniSources[t].add(source);

                    // YAKE Positional: 제목 내 위치 (0-indexed → 1-indexed)
                    const pos = idx + 1;
                    positionSum[t] = (positionSum[t] || 0) + (1 / pos);
                    positionCount[t] = (positionCount[t] || 0) + 1;

                    // 기사 다양성
                    articleCount[t] = (articleCount[t] || 0) + 1;
                }

                // YAKE Relatedness: 좌우 이웃 추적
                if (!cooccurrence[t]) cooccurrence[t] = new Set();
                if (idx > 0) cooccurrence[t].add(tokens[idx - 1]);
                if (idx < tokens.length - 1) cooccurrence[t].add(tokens[idx + 1]);
            }

            // 바이그램 (인접 2어절 조합)
            for (let i = 0; i < tokens.length - 1; i++) {
                const bigram = tokens[i] + ' ' + tokens[i + 1];
                if (!biFreq[bigram]) {
                    biFreq[bigram] = 0;
                    biSources[bigram] = new Set();
                }
                biFreq[bigram]++;
                biSources[bigram].add(source);
            }
        }

        return {
            uniFreq, biFreq, uniSources, biSources,
            cooccurrence, positionSum, positionCount,
            articleCount, relevantArticleCount
        };
    }

    // ── YAKE-inspired 점수 계산 ──
    // relatedness가 높은 용어(많은 다른 단어와 공기) = 범용어 → 감점
    function calcYakeScore(term, freq, sourceCount, ngrams) {
        const { cooccurrence, positionSum, positionCount,
                articleCount, relevantArticleCount } = ngrams;

        // 1. 빈도 × 출처 다양성 (기존)
        const freqScore = freq * (1 + Math.log2(Math.max(1, sourceCount)));

        // 2. YAKE Positional: 제목 앞에 올수록 중요 (평균 1/pos)
        const avgPos = (positionSum[term] || 0) / Math.max(1, positionCount[term] || 1);
        const positional = 1 + avgPos;  // 1~2 range

        // 3. YAKE Relatedness (역): 공기어가 많을수록 범용 → 감점
        // 공기어 수 / 빈도 = 비율. 높으면 다양한 맥락에서 사용 = 범용어
        const coocCount = cooccurrence[term] ? cooccurrence[term].size : 0;
        const relatedness = coocCount / Math.max(1, freq);
        // relatedness 0~1: 낮으면 특정 맥락에서만 등장 = 좋음
        // 감점 계수: relatedness가 높으면 점수 낮춤
        const relPenalty = 1 / (1 + relatedness);  // 0.5~1 range

        // 4. 기사 다양성 (DifSentence): 다양한 기사에서 등장할수록 중요
        const artCount = articleCount[term] || 1;
        const artRatio = artCount / Math.max(1, relevantArticleCount);
        // 너무 많은 기사(>50%)에 등장하면 범용어 가능성
        const difSentence = artRatio > 0.5 ? 0.7 : (artRatio > 0.3 ? 0.85 : 1.0);

        // 최종 점수 = 빈도점수 × 위치가중 × 공기어감점 × 기사다양성조정
        return freqScore * positional * relPenalty * difSentence;
    }

    // ── 이슈 추출: YAKE 통계 특성 + 전국 대비 지역 특이도 ──
    function rankIssues(ngrams, totalArticles, nationalTerms) {
        const { uniFreq, biFreq, uniSources, biSources } = ngrams;
        const ntf = nationalTerms || {};
        const candidates = [];

        // 전국 배경 대비 지역 특이도 계산 (TF-IDF 개념)
        // 전국에서도 고빈도인 용어는 지역 특유 이슈가 아님
        function regionalDistinctiveness(term, localFreq) {
            const natFreq = ntf[term] || 0;
            if (natFreq === 0) return 1.2;  // 전국에 안 나오면 지역 특유 → 보너스
            const ratio = localFreq / Math.max(1, natFreq);
            // 지역 빈도 > 전국 빈도: 지역 특유
            // 지역 빈도 < 전국 빈도: 범용 → 감점
            if (ratio > 2) return 1.3;      // 지역에서 훨씬 많이 → 강한 보너스
            if (ratio > 1) return 1.1;      // 지역이 좀 더 많음
            if (ratio > 0.5) return 0.8;    // 비슷 → 약간 감점
            return 0.5;                      // 전국이 압도적 → 강한 감점
        }

        // 바이그램 후보
        for (const [bigram, freq] of Object.entries(biFreq)) {
            if (freq < 2) continue;
            if (isPersonOrInstitution(bigram)) continue;
            if (isNoiseBigram(bigram)) continue;
            if (isNonIssueEntity(bigram.replace(/\s/g, ''))) continue;
            if (isNonLocalTopic(bigram)) continue;  // 선거 관할 밖 주제 제거

            const sources = biSources[bigram];
            const sourceCount = sources ? sources.size : 0;
            if (sourceCount < 1) continue;

            // YAKE-inspired 점수
            const words = bigram.split(' ');
            const wordScores = words.map(w => calcYakeScore(w, uniFreq[w] || freq, sourceCount, ngrams));
            let score = Math.max(...wordScores) * (1 + Math.log2(Math.max(1, sourceCount)));

            // 전국 대비 지역 특이도 적용 (바이그램 구성어 중 최소값)
            const distinctScores = words.map(w => regionalDistinctiveness(w, uniFreq[w] || 0));
            score *= Math.min(...distinctScores);

            // 지방자치 정책 관련 용어 보너스
            if (hasLocalPolicySignal(bigram)) score *= 1.3;

            candidates.push({
                term: bigram,
                type: 'bigram',
                freq,
                sourceCount,
                score
            });
        }

        // 유니그램 후보
        for (const [term, freq] of Object.entries(uniFreq)) {
            if (freq < 3) continue;
            if (term.length < 3) continue;
            if (isPersonOrInstitution(term)) continue;
            if (isNonIssueEntity(term)) continue;
            if (isNonLocalTopic(term)) continue;  // 선거 관할 밖 주제 제거

            const inBigram = candidates.some(c =>
                c.type === 'bigram' && c.term.includes(term) && c.freq >= freq * 0.5
            );
            if (inBigram) continue;

            const sources = uniSources[term];
            const sourceCount = sources ? sources.size : 0;
            if (sourceCount < 2) continue;

            let score = calcYakeScore(term, freq, sourceCount, ngrams);
            // 전국 대비 지역 특이도
            score *= regionalDistinctiveness(term, freq);
            // 지방자치 정책 관련 용어 보너스
            if (hasLocalPolicySignal(term)) score *= 1.3;

            candidates.push({
                term,
                type: 'unigram',
                freq,
                sourceCount,
                score
            });
        }

        // 점수순 정렬
        candidates.sort((a, b) => b.score - a.score);

        // 중복 제거
        const result = [];
        for (const c of candidates) {
            const isDup = result.some(r => {
                if (r.term.includes(c.term) || c.term.includes(r.term)) return true;
                const rWords = new Set(r.term.replace(/[·-]/g, ' ').split(/\s+/));
                const cWords = new Set(c.term.replace(/[·-]/g, ' ').split(/\s+/));
                let overlap = 0;
                for (const w of cWords) { if (rWords.has(w)) overlap++; }
                return overlap > 0 && overlap >= Math.min(rWords.size, cWords.size);
            });

            if (!isDup) {
                result.push(c);
            }

            if (result.length >= 6) break;
        }

        return result;
    }

    // ── 이슈명 다듬기 ──
    function polishIssueName(term) {
        // 너무 짧거나 의미 불분명한 접미사 정리
        return term
            .replace(/\s+/g, ' ')
            .trim();
    }

    // ── 전국 배경 코퍼스: 범용 키워드 감지용 ──
    let nationalTermsCache = null;
    let nationalTermsTimestamp = 0;

    async function getNationalBackgroundTerms() {
        if (nationalTermsCache && (Date.now() - nationalTermsTimestamp < CACHE_TTL)) {
            return nationalTermsCache;
        }

        try {
            const queries = [
                '지방선거 이슈 2026',
                '선거 현안 과제'
            ];
            const allItems = [];
            for (const q of queries) {
                try {
                    const url = `${NEWS_PROXY}/api/news?query=${encodeURIComponent(q)}&display=100&sort=date`;
                    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
                    if (!res.ok) continue;
                    const data = await res.json();
                    if (Array.isArray(data?.items)) {
                        for (const item of data.items) {
                            allItems.push({ title: stripHtml(item.title || '') });
                        }
                    }
                } catch (e) { /* skip */ }
            }

            // 전국 뉴스에서 유니그램 빈도 추출 (지역 필터 없이)
            const termFreq = {};
            const emptyStops = new Set();
            for (const article of allItems) {
                const tokens = (article.title || '')
                    .replace(/[^\w가-힣\s·-]/g, ' ')
                    .split(/\s+/)
                    .map(t => stripParticles(t.trim()))
                    .filter(t => isValidTerm(t, emptyStops));
                const seen = new Set();
                for (const t of tokens) {
                    if (!seen.has(t)) {
                        seen.add(t);
                        termFreq[t] = (termFreq[t] || 0) + 1;
                    }
                }
            }

            nationalTermsCache = termFreq;
            nationalTermsTimestamp = Date.now();
            return termFreq;
        } catch (e) {
            return {};
        }
    }

    // ── 메인 API ──
    async function analyzeRegion(regionKey) {
        const cached = cache[regionKey];
        if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
            return cached.data;
        }

        try {
            // 지역 뉴스 + 전국 배경 동시 수집
            const [articles, nationalTerms] = await Promise.all([
                fetchNews(regionKey),
                getNationalBackgroundTerms()
            ]);

            if (articles.length < 10) {
                return getStaticIssues(regionKey);
            }

            const ngrams = extractNgrams(articles, regionKey);
            const ranked = rankIssues(ngrams, articles.length, nationalTerms);

            if (ranked.length === 0) {
                return getStaticIssues(regionKey);
            }

            const issues = ranked.map(r => polishIssueName(r.term));

            cache[regionKey] = { data: issues, timestamp: Date.now() };
            return issues;

        } catch (err) {
            return getStaticIssues(regionKey);
        }
    }

    // ── 정적 데이터 폴백 (허수 제거) ──
    function getStaticIssues(regionKey) {
        const derived = window.DerivedIssuesData;
        if (!derived?.regions?.[regionKey]) return [];

        const regionData = derived.regions[regionKey];
        const issues = [];

        for (const name of (regionData.issues || [])) {
            const sig = regionData.signals?.[name];
            if (!sig) continue;
            // 실제 뉴스 출처가 있고 최근 보도가 있는 것만
            if (sig.count30 >= 1 && Array.isArray(sig.topSources) && sig.topSources.length > 0) {
                issues.push(name);
            }
        }

        return issues;
    }

    return { analyzeRegion, getStaticIssues };
})();
