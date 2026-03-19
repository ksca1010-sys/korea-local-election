// ============================================
// 6.3 전국지방선거 인터랙티브 선거 정보 지도
// Election Data Module
// ============================================

const ElectionData = (() => {
    // 정당 정보 (민주당: 밝은 파랑, 혁신당: 진한 남색으로 구분)
    const parties = {
        democratic: { name: '더불어민주당', color: '#2E8BFF', shortName: '민주당' },
        ppp: { name: '국민의힘', color: '#E61E2B', shortName: '국민의힘' },
        reform: { name: '조국혁신당', color: '#3B6ABF', shortName: '혁신당' }, // 원색 #0A1747 → 다크 테마 가독성 보정
        newReform: { name: '개혁신당', color: '#FF7210', shortName: '개혁신당' },
        progressive: { name: '진보당', color: '#D6001C', shortName: '진보당' },
        justice: { name: '정의당', color: '#FFCC00', shortName: '정의당' },
        newFuture: { name: '새로운미래', color: '#45B97C', shortName: '새미래' },
        // greenJustice(녹색정의당)은 2024.5.15 해산됨 → 정의당+녹색당 각각 독립
        independent: { name: '무소속', color: '#a0a0a0', shortName: '무소속' },
        other: { name: '기타정당', color: '#9370DB', shortName: '기타' }
    };

    // 선거 회차별 당시 정당명 (민선 1기~9기)
    const historicalPartyNames = {
        democratic: {
            1: '민주당', 2: '새정치국민회의', 3: '새천년민주당',
            4: '열린우리당', 5: '민주당', 6: '새정치민주연합',
            7: '더불어민주당', 8: '더불어민주당', 9: '더불어민주당'
        },
        ppp: {
            1: '민주자유당', 2: '한나라당', 3: '한나라당',
            4: '한나라당', 5: '한나라당', 6: '새누리당',
            7: '자유한국당', 8: '국민의힘', 9: '국민의힘'
        },
        other: {
            1: '자유민주연합', 2: '자유민주연합', 3: '자유민주연합',
            4: '기타정당', 5: '자유선진당', 6: '기타정당',
            7: '기타정당', 8: '기타정당', 9: '기타정당'
        },
        independent: {},
        reform: {}, newReform: {}, progressive: {}, justice: {}, newFuture: {}
    };

    // 선거일 정보
    const electionDate = new Date('2026-06-03T00:00:00+09:00');
    const preVoteDates = {
        start: new Date('2026-05-29T06:00:00+09:00'),
        end: new Date('2026-05-30T18:00:00+09:00')
    };
    const electionCalendarSources = [
        {
            label: '중앙선관위 주요사무일정',
            url: 'https://m.nec.go.kr/site/nec/ex/bbs/View.do?bcIdx=289351&cbIdx=1104'
        },
        {
            label: '한눈에 보는 지방선거 일정',
            url: 'https://us.nec.go.kr/us/bbs/B0000265/view.do?category1=us&category2=usnamgu&deleteCd=0&menuNo=800043&nttId=274671&pageIndex=1'
        },
        {
            label: '공직선거법 제108조',
            url: 'https://www.law.go.kr/법령/공직선거법/제108조'
        }
    ];
    const electionCalendar = [
        {
            id: 'report-ban',
            title: '의정활동 보고 금지',
            category: 'rule',
            audience: '국회의원·지방의원',
            description: '의정활동 보고는 6월 3일 투표 마감 전까지 제한된다.',
            startDate: '2026-03-05',
            endDate: '2026-06-03',
            endTime: '18:00'
        },
        {
            id: 'deepfake-ban',
            title: '딥페이크 영상 등을 이용한 선거운동 금지',
            category: 'rule',
            audience: '누구든지',
            description: 'AI 합성물 등 딥페이크 기반 선거운동은 6월 3일 투표 마감 전까지 금지된다.',
            startDate: '2026-03-05',
            endDate: '2026-06-03',
            endTime: '18:00'
        },
        {
            id: 'preliminary-registration-gun',
            title: '군수·지역구군의원 예비후보자 등록 시작',
            category: 'registration',
            audience: '군수·지역구군의원',
            description: '3월 22일부터 해당 선거의 예비후보 등록 신청이 가능하다.',
            startDate: '2026-03-22'
        },
        {
            id: 'independent-recommendation',
            title: '무소속후보자 추천장 검인·교부',
            category: 'registration',
            audience: '교육감·무소속 예정자',
            description: '교육감선거후보자 및 무소속후보 예정자에게 추천장을 검인·교부한다.',
            startDate: '2026-05-09',
            endDate: '2026-05-15'
        },
        {
            id: 'candidate-registration',
            title: '후보자 등록 신청',
            category: 'registration',
            audience: '전체 후보자',
            description: '선거구위원회에서 후보자 등록을 접수한다.',
            startDate: '2026-05-14',
            endDate: '2026-05-15',
            startTime: '09:00',
            endTime: '18:00',
            timeLabel: '매일 09:00~18:00'
        },
        {
            id: 'voter-roll-and-absentee',
            title: '선거인명부 작성·거소투표 신고',
            category: 'admin',
            audience: '구·군의 장 / 거소투표 대상자',
            description: '선거인명부를 작성하고 거소투표 신고를 받는 기간이다.',
            startDate: '2026-05-14',
            endDate: '2026-05-16'
        },
        {
            id: 'official-campaign',
            title: '공식 선거운동 기간',
            category: 'campaign',
            audience: '정당·후보자',
            description: '5월 21일부터 6월 2일까지 법정 선거운동이 가능하다.',
            startDate: '2026-05-21',
            endDate: '2026-06-02'
        },
        {
            id: 'poll-blackout',
            title: '선거여론조사 결과 공표 금지',
            category: 'poll',
            audience: '언론·조사기관·누구든지',
            description: '공직선거법 제108조 기준으로 5월 28일부터 6월 3일 투표 마감 시각까지 공표·인용보도가 금지된다.',
            startDate: '2026-05-28',
            endDate: '2026-06-03',
            endTime: '18:00'
        },
        {
            id: 'early-voting',
            title: '사전투표',
            category: 'vote',
            audience: '유권자',
            description: '별도 신고 없이 전국 사전투표소 어디서나 투표할 수 있다.',
            startDate: '2026-05-29',
            endDate: '2026-05-30',
            startTime: '06:00',
            endTime: '18:00',
            timeLabel: '매일 06:00~18:00'
        },
        {
            id: 'election-day',
            title: '선거일 투표 및 개표',
            category: 'vote',
            audience: '유권자·선관위',
            description: '6월 3일 본투표와 개표가 진행된다.',
            startDate: '2026-06-03',
            startTime: '06:00',
            endTime: '18:00',
            timeLabel: '06:00~18:00'
        }
    ];

    function createKoreaDate(dateString, timeString = '00:00') {
        return new Date(`${dateString}T${timeString}:00+09:00`);
    }

    function getSeoulDateKey(date) {
        return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
    }

    function getElectionCalendar(referenceDate = new Date()) {
        const now = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
        const todayKey = getSeoulDateKey(now);

        return electionCalendar
            .map((event) => {
                const startDate = createKoreaDate(event.startDate, event.startTime || '00:00');
                const endDate = createKoreaDate(event.endDate || event.startDate, event.endTime || '23:59');
                const isActive = startDate <= now && now <= endDate;
                const isUpcoming = now < startDate;

                return {
                    ...event,
                    startDate,
                    endDate,
                    isActive,
                    isUpcoming,
                    startsToday: getSeoulDateKey(startDate) === todayKey,
                    endsToday: getSeoulDateKey(endDate) === todayKey,
                    daysUntilStart: Math.ceil((startDate - now) / (1000 * 60 * 60 * 24))
                };
            })
            .filter((event) => event.isActive || event.isUpcoming)
            .sort((a, b) => a.startDate - b.startDate || a.endDate - b.endDate);
    }

    function getElectionCalendarSections(referenceDate = new Date()) {
        const events = getElectionCalendar(referenceDate);
        return {
            active: events.filter((event) => event.isActive),
            upcoming: events.filter((event) => event.isUpcoming)
        };
    }

    // 17개 시도 지역 데이터
    const regions = {
        'seoul': {
            code: '11', name: '서울특별시', nameEng: 'Seoul',
            population: 9304000, voters: 8310000,
            currentGovernor: { name: '오세훈', party: 'ppp', since: 2021 },
            prevElection: { winner: 'ppp', winnerName: '오세훈', rate: 59.0, runner: 'democratic', runnerName: '송영길', runnerRate: 39.2, turnout: 50.6 },
            keyIssues: ['주거 안정', '교통 인프라', '도시 재생', '미세먼지 대책'],
            subRegions: 25,
            candidates: [
                { id: 'seoul-1', name: '정원오', party: 'democratic', age: 57, career: '3선 성동구청장 / 前 임종석 의원 보좌관', photo: null, status: 'DECLARED', dataSource: 'news', pledges: ['시민 중심 행정 혁신', '세금 아깝지 않은 서울', '성동 모델 서울 확장'] },
                { id: 'seoul-2', name: '박주민', party: 'democratic', age: 52, career: '3선 국회의원 (은평갑) / 변호사', photo: null, status: 'DECLARED', dataSource: 'news', pledges: ['기회특별시 서울', '서울투자공사 설립', '강북 바이오 클러스터'] },
                { id: 'seoul-3', name: '김영배', party: 'democratic', age: 58, career: '재선 국회의원 (성북갑) / 前 성북구청장 3선 / 前 청와대 민정비서관', photo: null, status: 'DECLARED', dataSource: 'news', pledges: ['시간평등특별시', '10분 역세권 서울', '마을버스 완전 공영화'] },
                { id: 'seoul-4', name: '전현희', party: 'democratic', age: 61, career: '3선 국회의원 / 前 국민권익위원장 / 치과의사·변호사', photo: null, status: 'DECLARED', dataSource: 'news', pledges: ['DDP 철거 후 서울 돔 건설', 'AI 서울 신문고', '서울형 돌봄 기본소득'] },
                { id: 'seoul-5', name: '김형남', party: 'democratic', age: 35, career: '前 군인권센터 사무국장 / 민주당 시민참여 선대위 위원장', photo: null, status: 'DECLARED', dataSource: 'news', pledges: ['세대교체 서울', '시민 참여형 행정'] },
                { id: 'seoul-6', name: '윤희숙', party: 'ppp', age: 56, career: '前 국회의원 (서초갑) / KDI 연구위원 / 경제학 박사', photo: null, status: 'DECLARED', dataSource: 'news', pledges: ['용적률 500% 제4종 주거지역', '홍릉 AI 밸리', '창동 서울시 2청사'] },
                { id: 'seoul-7', name: '이상규', party: 'ppp', age: 60, career: '국민의힘 성북을 당협위원장 / 경영인', photo: null, status: 'DECLARED', dataSource: 'news', pledges: ['서울 대개조'] },
                { id: 'seoul-8', name: '김정철', party: 'newReform', age: 49, career: '개혁신당 최고위원 / 형사법 전문 변호사', photo: null, status: 'DECLARED', dataSource: 'news', pledges: ['양당 구태 타파', '서울 행정 혁신'] },
                { id: 'seoul-9', name: '한동훈', party: 'independent', age: 52, career: '前 국민의힘 대표 / 前 법무부장관 / 검사장 출신', photo: null, status: 'RUMORED', dataSource: 'news', pledges: [] }
            ],
            polls: [
                { date: '2026-01-15', source: '한국갤럽', data: { 'seoul-1': 38.2, 'seoul-2': 41.5, 'seoul-3': 12.1 }, margin: 3.1, sampleSize: 1003 },
                { date: '2026-01-29', source: '리얼미터', data: { 'seoul-1': 39.8, 'seoul-2': 40.1, 'seoul-3': 11.5 }, margin: 2.8, sampleSize: 1502 },
                { date: '2026-02-12', source: '한국갤럽', data: { 'seoul-1': 41.2, 'seoul-2': 39.8, 'seoul-3': 11.0 }, margin: 3.1, sampleSize: 1005 },
                { date: '2026-02-24', source: '리얼미터', data: { 'seoul-1': 42.1, 'seoul-2': 38.5, 'seoul-3': 11.8 }, margin: 2.9, sampleSize: 1500 }
            ],
            partySupport: { democratic: 42.1, ppp: 38.5, reform: 11.8, newReform: 3.2, progressive: 1.5, independent: 2.9 },
            demographics: {
                '18-29': { democratic: 48, ppp: 28, reform: 16, other: 8 },
                '30-39': { democratic: 50, ppp: 25, reform: 15, other: 10 },
                '40-49': { democratic: 45, ppp: 35, reform: 12, other: 8 },
                '50-59': { democratic: 38, ppp: 45, reform: 10, other: 7 },
                '60+': { democratic: 30, ppp: 55, reform: 5, other: 10 }
            },
            hotspot: true
        },
        'busan': {
            code: '26', name: '부산광역시', nameEng: 'Busan',
            population: 3239000, voters: 2884000,
            currentGovernor: { name: '박형준', party: 'ppp', since: 2021 },
            prevElection: { winner: 'ppp', winnerName: '박형준', rate: 66.4, runner: 'democratic', runnerName: '변성완', runnerRate: 32.2, turnout: 47.5 },
            keyIssues: ['가덕도 신공항', '도심 쇠퇴 대응', '청년 인구 유출', '해양 관광'],
            subRegions: 16,
            candidates: [
                { id: 'busan-1', name: '전재수', party: 'democratic', age: null, career: '現 국회의원 (북구갑) / 前 해양수산부 장관', photo: null, status: 'EXPECTED', dataSource: 'news', pledges: ['해수부 공공기관 부산 이전', '동남투자공사 설립', '해사전문법원 신설'] },
                { id: 'busan-2', name: '박형준', party: 'ppp', age: 66, career: '現 부산시장 (3선 도전) / 前 국회의원·청와대 정무수석', photo: null, status: 'DECLARED', dataSource: 'news', pledges: ['글로벌 도시 부산 완성'] },
                { id: 'busan-3', name: '주진우', party: 'ppp', age: null, career: '現 국회의원 (해운대갑)', photo: null, status: 'DECLARED', dataSource: 'news', pledges: ['글로벌 해양수도', 'AI 메카 조성'] },
                { id: 'busan-4', name: '이재성', party: 'democratic', age: null, career: '前 민주당 부산시당위원장 / 이재명 인재영입 2호', photo: null, status: 'DECLARED', dataSource: 'news', pledges: ['다대포 테마파크 유치', '북항 해수부 신청사'] },
                { id: 'busan-5', name: '윤택근', party: 'progressive', age: null, career: '前 민주노총 수석부위원장 / 前 부산지하철노조 위원장', photo: null, status: 'DECLARED', dataSource: 'news', pledges: ['노동자 시장', '좋은 일자리·공공성'] },
                { id: 'busan-6', name: '정이한', party: 'newReform', age: 37, career: '개혁신당 대변인 / 前 국회의원 선임비서관', photo: null, status: 'DECLARED', dataSource: 'news', pledges: ['젊은 부산', '청년 인구 유출 방지'] }
            ],
            polls: [
                { date: '2026-01-15', source: '한국갤럽', data: { 'busan-1': 35.5, 'busan-2': 44.2, 'busan-3': 8.1 }, margin: 3.5, sampleSize: 800 },
                { date: '2026-01-29', source: '리얼미터', data: { 'busan-1': 37.1, 'busan-2': 42.8, 'busan-3': 7.5 }, margin: 3.2, sampleSize: 1002 },
                { date: '2026-02-12', source: '한국갤럽', data: { 'busan-1': 38.5, 'busan-2': 41.0, 'busan-3': 8.8 }, margin: 3.5, sampleSize: 805 },
                { date: '2026-02-24', source: '리얼미터', data: { 'busan-1': 39.2, 'busan-2': 40.5, 'busan-3': 8.2 }, margin: 3.1, sampleSize: 1005 }
            ],
            partySupport: { democratic: 39.2, ppp: 40.5, reform: 8.2, newReform: 5.8, progressive: 2.1, independent: 4.2 },
            demographics: {
                '18-29': { democratic: 45, ppp: 30, reform: 15, other: 10 },
                '30-39': { democratic: 46, ppp: 28, reform: 14, other: 12 },
                '40-49': { democratic: 40, ppp: 38, reform: 12, other: 10 },
                '50-59': { democratic: 35, ppp: 48, reform: 8, other: 9 },
                '60+': { democratic: 25, ppp: 60, reform: 4, other: 11 }
            },
            hotspot: true
        },
        'daegu': {
            code: '27', name: '대구광역시', nameEng: 'Daegu',
            population: 2351000, voters: 2052000,
            currentGovernor: { name: '김정기', party: '-', since: 2025, acting: true, actingReason: '홍준표 대선 출마 사퇴' },
            prevElection: { winner: 'ppp', winnerName: '홍준표', rate: 78.8, runner: 'democratic', runnerName: '서재헌', runnerRate: 18.0, turnout: 48.1 },
            keyIssues: ['대구경북통합신공항', '산업 구조 전환', '인구 감소', '의료 인프라'],
            subRegions: 8,
            candidates: [
                { id: 'daegu-1', name: '이진숙', party: 'ppp', age: null, career: '前 방송통신위원장 / 前 대전MBC 사장', photo: null, status: 'DECLARED', dataSource: 'news', pledges: ['대구 살리기'] },
                { id: 'daegu-2', name: '추경호', party: 'ppp', age: null, career: '3선 국회의원 (달성) / 前 경제부총리', photo: null, status: 'DECLARED', dataSource: 'news', pledges: ['대구 경제 재건'] },
                { id: 'daegu-3', name: '주호영', party: 'ppp', age: null, career: '6선 국회의원 (수성갑) / 現 국회 부의장', photo: null, status: 'DECLARED', dataSource: 'news', pledges: ['대구 재도약'] },
                { id: 'daegu-4', name: '윤재옥', party: 'ppp', age: null, career: '4선 국회의원 (달서을) / 前 원내대표', photo: null, status: 'DECLARED', dataSource: 'news', pledges: ['야전사령관형 리더십'] },
                { id: 'daegu-5', name: '최은석', party: 'ppp', age: null, career: '초선 국회의원 (동구·군위) / 前 CJ제일제당 대표', photo: null, status: 'DECLARED', dataSource: 'news', pledges: ['기업 경영 DNA로 대구 경제 재건'] },
                { id: 'daegu-6', name: '유영하', party: 'ppp', age: null, career: '초선 국회의원 (북구갑) / 前 윤석열 대통령 변호사', photo: null, status: 'DECLARED', dataSource: 'news', pledges: [] },
                { id: 'daegu-7', name: '홍석준', party: 'ppp', age: null, career: '前 국회의원 (달서갑)', photo: null, status: 'DECLARED', dataSource: 'news', pledges: [] },
                { id: 'daegu-8', name: '김부겸', party: 'democratic', age: null, career: '前 국무총리 / 前 행안부 장관 / 前 국회의원 (수성)', photo: null, status: 'RUMORED', dataSource: 'news', pledges: [] }
            ],
            polls: [
                { date: '2026-01-15', source: '한국갤럽', data: { 'daegu-1': 25.5, 'daegu-2': 55.2 }, margin: 4.0, sampleSize: 600 },
                { date: '2026-02-12', source: '리얼미터', data: { 'daegu-1': 27.8, 'daegu-2': 52.1 }, margin: 3.8, sampleSize: 802 },
                { date: '2026-02-24', source: '한국갤럽', data: { 'daegu-1': 28.5, 'daegu-2': 51.8 }, margin: 4.0, sampleSize: 603 }
            ],
            partySupport: { democratic: 28.5, ppp: 51.8, reform: 7.5, newReform: 5.2, progressive: 1.8, independent: 5.2 },
            demographics: {
                '18-29': { democratic: 38, ppp: 35, reform: 15, other: 12 },
                '30-39': { democratic: 35, ppp: 38, reform: 14, other: 13 },
                '40-49': { democratic: 28, ppp: 50, reform: 10, other: 12 },
                '50-59': { democratic: 22, ppp: 60, reform: 6, other: 12 },
                '60+': { democratic: 15, ppp: 72, reform: 3, other: 10 }
            },
            hotspot: false
        },
        'incheon': {
            code: '28', name: '인천광역시', nameEng: 'Incheon',
            population: 3054000, voters: 2583000,
            currentGovernor: { name: '유정복', party: 'ppp', since: 2022 },
            prevElection: { winner: 'ppp', winnerName: '유정복', rate: 52.1, runner: 'democratic', runnerName: '박남춘', runnerRate: 44.5, turnout: 49.2 },
            keyIssues: ['인천공항 연계 발전', '수도권 교통', '영종도 개발', '제조업 활성화'],
            subRegions: 10,
            candidates: [
                { id: 'incheon-1', name: '박찬대', party: 'democratic', age: 60, career: '4선 국회의원 (연수갑) / 前 원내대표·대표권한대행 / 공인회계사', photo: null, status: 'DECLARED', dataSource: 'news', pledges: ['기업가적 인천 대전환', '공익·민간 이익 공유'] },
                { id: 'incheon-2', name: '유정복', party: 'ppp', age: 68, career: '現 인천시장 (3선 도전) / 前 행안부·농림부 장관', photo: null, status: 'DECLARED', dataSource: 'news', pledges: ['천원주택 확대', '인천 제2의료원', 'F1 그랑프리 유치'] },
                { id: 'incheon-3', name: '박남춘', party: 'democratic', age: null, career: '前 인천시장 / 前 국회의원', photo: null, status: 'RUMORED', dataSource: 'poll', pledges: [] },
                { id: 'incheon-4', name: '김교흥', party: 'democratic', age: null, career: '現 국회의원 (서구갑) / 前 인천시 정무부시장', photo: null, status: 'RUMORED', dataSource: 'poll', pledges: [] },
                { id: 'incheon-5', name: '이기붕', party: 'newReform', age: null, career: '개혁신당 인천시당위원장', photo: null, status: 'DECLARED', dataSource: 'news', pledges: [] }
            ],
            polls: [
                { date: '2026-01-15', source: '리얼미터', data: { 'incheon-1': 40.2, 'incheon-2': 39.8, 'incheon-3': 10.5 }, margin: 3.2, sampleSize: 1002 },
                { date: '2026-02-12', source: '한국갤럽', data: { 'incheon-1': 42.5, 'incheon-2': 38.1, 'incheon-3': 10.8 }, margin: 3.5, sampleSize: 800 },
                { date: '2026-02-24', source: '리얼미터', data: { 'incheon-1': 43.1, 'incheon-2': 37.5, 'incheon-3': 11.2 }, margin: 3.0, sampleSize: 1100 }
            ],
            partySupport: { democratic: 43.1, ppp: 37.5, reform: 11.2, newReform: 3.5, progressive: 1.5, independent: 3.2 },
            demographics: {
                '18-29': { democratic: 50, ppp: 25, reform: 16, other: 9 },
                '30-39': { democratic: 48, ppp: 27, reform: 14, other: 11 },
                '40-49': { democratic: 44, ppp: 36, reform: 11, other: 9 },
                '50-59': { democratic: 40, ppp: 42, reform: 10, other: 8 },
                '60+': { democratic: 32, ppp: 52, reform: 6, other: 10 }
            },
            hotspot: true
        },
        'gwangju': {
            code: '29', name: '광주광역시', nameEng: 'Gwangju',
            population: 1389000, voters: 1200000,
            currentGovernor: { name: '강기정', party: 'democratic', since: 2022 },
            prevElection: { winner: 'democratic', winnerName: '강기정', rate: 74.9, runner: 'ppp', runnerName: '주기환', runnerRate: 15.9, turnout: 37.66 },
            keyIssues: ['광주-전남 행정통합', 'AI 산업 육성', '광주형 일자리', '문화수도'],
            subRegions: 5,
            candidates: [
                { id: 'gwangju-1', name: '민형배', party: 'democratic', age: 58, career: '재선 국회의원 (광산을) / 前 광산구청장(재선)', photo: null, status: 'EXPECTED', dataSource: 'news', pledges: [] },
                { id: 'gwangju-2', name: '강기정', party: 'democratic', age: 62, career: '現 광주시장 (재선 도전) / 前 청와대 정무수석 / 3선 국회의원', photo: null, status: 'EXPECTED', dataSource: 'news', pledges: ['AI 산업 수도 광주', '광주형 일자리 2.0'] },
                { id: 'gwangju-3', name: '정준호', party: 'democratic', age: null, career: '초선 국회의원 (북구갑)', photo: null, status: 'RUMORED', dataSource: 'news', pledges: [] },
                { id: 'gwangju-4', name: '문인', party: 'democratic', age: null, career: '現 광주 북구청장 / 前 광주시 행정부시장', photo: null, status: 'EXPECTED', dataSource: 'news', pledges: [] },
                { id: 'gwangju-5', name: '이병훈', party: 'democratic', age: null, career: '前 국회의원 (동구남구을)', photo: null, status: 'EXPECTED', dataSource: 'news', pledges: [] },
                { id: 'gwangju-6', name: '이형석', party: 'democratic', age: null, career: '前 국회의원 (북구을) / 前 민주당 최고위원', photo: null, status: 'EXPECTED', dataSource: 'news', pledges: [] },
                { id: 'gwangju-7', name: '이종욱', party: 'progressive', age: null, career: '前 민주노총 광주지역본부장 / 30년 공무원', photo: null, status: 'DECLARED', dataSource: 'news', pledges: [] },
                { id: 'gwangju-8', name: '이정현', party: 'ppp', age: null, career: '前 3선 국회의원 / 前 새누리당 대표', photo: null, status: 'DECLARED', dataSource: 'news', pledges: [] }
            ],
            polls: [
                { date: '2026-01-15', source: '한국갤럽', data: { 'gwangju-1': 52.1, 'gwangju-2': 30.5 }, margin: 4.2, sampleSize: 500 },
                { date: '2026-02-24', source: '리얼미터', data: { 'gwangju-1': 50.8, 'gwangju-2': 32.1 }, margin: 3.8, sampleSize: 700 }
            ],
            partySupport: { democratic: 50.8, ppp: 8.5, reform: 32.1, newReform: 2.5, progressive: 3.2, independent: 2.9 },
            demographics: {
                '18-29': { democratic: 45, ppp: 8, reform: 35, other: 12 },
                '30-39': { democratic: 48, ppp: 7, reform: 33, other: 12 },
                '40-49': { democratic: 55, ppp: 10, reform: 28, other: 7 },
                '50-59': { democratic: 58, ppp: 12, reform: 22, other: 8 },
                '60+': { democratic: 55, ppp: 15, reform: 18, other: 12 }
            },
            hotspot: false
        },
        'daejeon': {
            code: '30', name: '대전광역시', nameEng: 'Daejeon',
            population: 1441000, voters: 1237000,
            currentGovernor: { name: '이장우', party: 'ppp', since: 2022 },
            prevElection: { winner: 'ppp', winnerName: '이장우', rate: 51.2, runner: 'democratic', runnerName: '허태정', runnerRate: 48.8, turnout: 49.8 },
            keyIssues: ['대전-충남 행정통합', '과학기술 클러스터', '도심 교통', '세종시 연계'],
            subRegions: 5,
            candidates: [
                { id: 'daejeon-1', name: '이장우', party: 'ppp', age: 61, career: '現 대전시장 (재선 도전) / 前 3선 국회의원 (동구)', photo: null, status: 'DECLARED', dataSource: 'news', pledges: ['2048 대전 그랜드 플랜', '스마트시티'] },
                { id: 'daejeon-2', name: '이상민', party: 'ppp', age: null, career: '前 국회의원 / 現 국민의힘 대전시당위원장', photo: null, status: 'EXPECTED', dataSource: 'news', pledges: [] },
                { id: 'daejeon-3', name: '허태정', party: 'democratic', age: 60, career: '前 대전시장 (민선7기) / 前 국회의원 (유성을)', photo: null, status: 'DECLARED', dataSource: 'news', pledges: ['한국 제2경제수도', '대전충남 행정통합'] },
                { id: 'daejeon-4', name: '박범계', party: 'democratic', age: null, career: '現 국회의원 (서구을) / 前 법무부장관', photo: null, status: 'DECLARED', dataSource: 'news', pledges: ['실리콘밸리형 이노베이션 허브'] },
                { id: 'daejeon-5', name: '장철민', party: 'democratic', age: null, career: '재선 국회의원 (동구)', photo: null, status: 'DECLARED', dataSource: 'news', pledges: [] },
                { id: 'daejeon-6', name: '장종태', party: 'democratic', age: null, career: '초선 국회의원 (서구갑)', photo: null, status: 'DECLARED', dataSource: 'news', pledges: [] }
            ],
            polls: [
                { date: '2026-01-15', source: '리얼미터', data: { 'daejeon-1': 44.5, 'daejeon-2': 42.1 }, margin: 3.5, sampleSize: 800 },
                { date: '2026-02-24', source: '한국갤럽', data: { 'daejeon-1': 46.2, 'daejeon-2': 40.8 }, margin: 3.8, sampleSize: 700 }
            ],
            partySupport: { democratic: 46.2, ppp: 40.8, reform: 6.5, newReform: 2.8, progressive: 1.2, independent: 2.5 },
            demographics: {
                '18-29': { democratic: 52, ppp: 28, reform: 12, other: 8 },
                '30-39': { democratic: 50, ppp: 30, reform: 10, other: 10 },
                '40-49': { democratic: 46, ppp: 38, reform: 8, other: 8 },
                '50-59': { democratic: 42, ppp: 45, reform: 6, other: 7 },
                '60+': { democratic: 35, ppp: 52, reform: 4, other: 9 }
            },
            hotspot: true
        },
        'ulsan': {
            code: '31', name: '울산광역시', nameEng: 'Ulsan',
            population: 1090000, voters: 935000,
            currentGovernor: { name: '김두겸', party: 'ppp', since: 2022 },
            prevElection: { winner: 'ppp', winnerName: '김두겸', rate: 59.8, runner: 'democratic', runnerName: '송철호', runnerRate: 40.2, turnout: 50.1 },
            keyIssues: ['자동차 산업 전환', '수소 경제', '울산 혁신도시', '환경 문제'],
            subRegions: 5,
            candidates: [
                { id: 'ulsan-1', name: '김두겸', party: 'ppp', age: 68, career: '現 울산시장 (재선 도전) / 前 남구청장', photo: null, status: 'EXPECTED', dataSource: 'news', pledges: ['34조원 투자 유치 지속', '분산에너지 특화지역'] },
                { id: 'ulsan-2', name: '박맹우', party: 'ppp', age: null, career: '前 울산시장(2선) / 前 국회의원', photo: null, status: 'DECLARED', dataSource: 'news', pledges: [] },
                { id: 'ulsan-3', name: '김상욱', party: 'democratic', age: null, career: '現 국회의원 (남구갑)', photo: null, status: 'DECLARED', dataSource: 'news', pledges: ['민주도시·AX 선도도시'] },
                { id: 'ulsan-4', name: '김종훈', party: 'progressive', age: null, career: '現 울산 동구청장 / 前 국회의원 / 현대중공업 노조 출신', photo: null, status: 'DECLARED', dataSource: 'news', pledges: ['범진보 후보 단일화'] },
                { id: 'ulsan-5', name: '안재현', party: 'democratic', age: null, career: '前 노무현재단 울산 상임대표', photo: null, status: 'DECLARED', dataSource: 'news', pledges: ['부유식 해상풍력 완수'] },
                { id: 'ulsan-6', name: '이선호', party: 'democratic', age: null, career: '前 청와대 자치발전비서관 / 前 울주군수', photo: null, status: 'DECLARED', dataSource: 'news', pledges: [] }
            ],
            polls: [
                { date: '2026-01-15', source: '한국갤럽', data: { 'ulsan-1': 40.8, 'ulsan-2': 45.2 }, margin: 4.0, sampleSize: 600 },
                { date: '2026-02-24', source: '리얼미터', data: { 'ulsan-1': 42.5, 'ulsan-2': 43.8 }, margin: 3.5, sampleSize: 800 }
            ],
            partySupport: { democratic: 42.5, ppp: 43.8, reform: 5.5, newReform: 3.2, progressive: 2.5, independent: 2.5 },
            demographics: {
                '18-29': { democratic: 48, ppp: 30, reform: 12, other: 10 },
                '30-39': { democratic: 46, ppp: 32, reform: 10, other: 12 },
                '40-49': { democratic: 44, ppp: 40, reform: 6, other: 10 },
                '50-59': { democratic: 38, ppp: 48, reform: 5, other: 9 },
                '60+': { democratic: 30, ppp: 58, reform: 3, other: 9 }
            },
            hotspot: true
        },
        'sejong': {
            code: '36', name: '세종특별자치시', nameEng: 'Sejong',
            population: 391000, voters: 301000,
            currentGovernor: { name: '최민호', party: 'ppp', since: 2022 },
            prevElection: { winner: 'ppp', winnerName: '최민호', rate: 52.8, runner: 'democratic', runnerName: '이춘희', runnerRate: 47.2, turnout: 52.3 },
            keyIssues: ['행정수도 완성', '세종-대전 연계', '신도시 인프라', '교육 환경'],
            subRegions: 1,
            candidates: [
                { id: 'sejong-1', name: '최민호', party: 'ppp', age: 70, career: '現 세종시장 / 前 국무총리 비서실장 / 31년 관료', photo: null, status: 'DECLARED', dataSource: 'news', pledges: ['대한민국에서 가장 살기 좋은 도시', '글로벌 행정수도 완성'] },
                { id: 'sejong-2', name: '조상호', party: 'democratic', age: null, career: '前 국정기획위원 / 前 세종시 경제부시장', photo: null, status: 'DECLARED', dataSource: 'news', pledges: ['삼수도론', '경제 중심 행정수도'] },
                { id: 'sejong-3', name: '이춘희', party: 'democratic', age: null, career: '前 세종시장 2·3대 / 前 행정도시건설청장', photo: null, status: 'DECLARED', dataSource: 'news', pledges: ['행정수도 완성 마지막 기회'] },
                { id: 'sejong-4', name: '김수현', party: 'democratic', age: null, career: '더민주세종혁신회의 상임대표', photo: null, status: 'DECLARED', dataSource: 'news', pledges: [] },
                { id: 'sejong-5', name: '황운하', party: 'reform', age: null, career: '現 비례대표 국회의원 (조국혁신당) / 前 대전경찰청장', photo: null, status: 'DECLARED', dataSource: 'news', pledges: ['행정수도 완성의 종결자'] },
                { id: 'sejong-6', name: '고준일', party: 'democratic', age: null, career: '前 세종시의회 의장', photo: null, status: 'DECLARED', dataSource: 'news', pledges: [] },
                { id: 'sejong-7', name: '이준배', party: 'ppp', age: null, career: '前 세종시 경제부시장 / 前 국토부 과장', photo: null, status: 'RUMORED', dataSource: 'news', pledges: [] }
            ],
            polls: [
                { date: '2026-02-24', source: '리얼미터', data: { 'sejong-1': 48.5, 'sejong-2': 44.2 }, margin: 4.5, sampleSize: 500 }
            ],
            partySupport: { democratic: 48.5, ppp: 44.2, reform: 3.5, newReform: 1.5, progressive: 0.8, independent: 1.5 },
            demographics: {
                '18-29': { democratic: 55, ppp: 28, reform: 10, other: 7 },
                '30-39': { democratic: 55, ppp: 26, reform: 10, other: 9 },
                '40-49': { democratic: 50, ppp: 35, reform: 6, other: 9 },
                '50-59': { democratic: 42, ppp: 48, reform: 4, other: 6 },
                '60+': { democratic: 35, ppp: 55, reform: 2, other: 8 }
            },
            hotspot: true
        },
        'gyeonggi': {
            code: '41', name: '경기도', nameEng: 'Gyeonggi',
            population: 13742000, voters: 11595000,
            currentGovernor: { name: '김동연', party: 'democratic', since: 2022 },
            prevElection: { winner: 'democratic', winnerName: '김동연', rate: 49.1, runner: 'ppp', runnerName: '김은혜', runnerRate: 48.9, turnout: 50.8 },
            keyIssues: ['GTX 완성', '신도시 교통', '반도체 클러스터', '수도권 균형발전'],
            subRegions: 31,
            candidates: [
                { id: 'gyeonggi-1', name: '김동연', party: 'democratic', age: 69, career: '現 경기도지사 / 前 경제부총리 겸 기재부 장관', photo: null, status: 'DECLARED', dataSource: 'news', pledges: ['경기국제공항 추진', '경기북도 신설', '피지컬 AI 비전'] },
                { id: 'gyeonggi-2', name: '양향자', party: 'ppp', age: null, career: '삼성전자 상무 출신 / 국민의힘 최고위원', photo: null, status: 'DECLARED', dataSource: 'news', pledges: ['반도체 산업 육성', '첨단산업 기반 경기도'] },
                { id: 'gyeonggi-3', name: '추미애', party: 'democratic', age: 67, career: '6선 국회의원 / 前 민주당 대표 / 前 법무부 장관', photo: null, status: 'DECLARED', dataSource: 'news', pledges: ['경기 혁신 주도'] },
                { id: 'gyeonggi-4', name: '한준호', party: 'democratic', age: null, career: '재선 국회의원 (고양을) / 前 대통령 수행실장', photo: null, status: 'DECLARED', dataSource: 'news', pledges: ['이재명 정부 실용주의 경기도 완성'] },
                { id: 'gyeonggi-5', name: '권칠승', party: 'democratic', age: null, career: '3선 국회의원 (화성병) / 前 중기부 장관', photo: null, status: 'DECLARED', dataSource: 'news', pledges: ['최소 환승 교통체계', '중입자 암 치료센터'] },
                { id: 'gyeonggi-6', name: '양기대', party: 'democratic', age: null, career: '前 광명시장(재선) / 前 국회의원 (광명을)', photo: null, status: 'DECLARED', dataSource: 'news', pledges: [] },
                { id: 'gyeonggi-7', name: '함진규', party: 'ppp', age: 67, career: '前 한국도로공사 사장 / 前 재선 국회의원 (시흥) / 前 정책위의장', photo: null, status: 'DECLARED', dataSource: 'news', pledges: [] },
                { id: 'gyeonggi-8', name: '홍성규', party: 'progressive', age: 52, career: '진보당 수석대변인 / 화성노동인권센터 소장', photo: null, status: 'DECLARED', dataSource: 'news', pledges: ['경기 노동부지사 임명', '사회대개혁'] }
            ],
            polls: [
                { date: '2026-01-15', source: '한국갤럽', data: { 'gyeonggi-1': 43.5, 'gyeonggi-2': 37.8, 'gyeonggi-3': 10.2 }, margin: 2.5, sampleSize: 1500 },
                { date: '2026-01-29', source: '리얼미터', data: { 'gyeonggi-1': 44.2, 'gyeonggi-2': 36.5, 'gyeonggi-3': 11.0 }, margin: 2.2, sampleSize: 2000 },
                { date: '2026-02-12', source: '한국갤럽', data: { 'gyeonggi-1': 44.8, 'gyeonggi-2': 36.1, 'gyeonggi-3': 10.5 }, margin: 2.5, sampleSize: 1502 },
                { date: '2026-02-24', source: '리얼미터', data: { 'gyeonggi-1': 45.5, 'gyeonggi-2': 35.2, 'gyeonggi-3': 11.2 }, margin: 2.2, sampleSize: 2005 }
            ],
            partySupport: { democratic: 45.5, ppp: 35.2, reform: 11.2, newReform: 3.5, progressive: 1.8, independent: 2.8 },
            demographics: {
                '18-29': { democratic: 52, ppp: 25, reform: 15, other: 8 },
                '30-39': { democratic: 50, ppp: 26, reform: 14, other: 10 },
                '40-49': { democratic: 46, ppp: 34, reform: 12, other: 8 },
                '50-59': { democratic: 42, ppp: 40, reform: 10, other: 8 },
                '60+': { democratic: 32, ppp: 52, reform: 6, other: 10 }
            },
            hotspot: false
        },
        'gangwon': {
            code: '42', name: '강원특별자치도', nameEng: 'Gangwon',
            population: 1507000, voters: 1332000,
            currentGovernor: { name: '김진태', party: 'ppp', since: 2022 },
            prevElection: { winner: 'ppp', winnerName: '김진태', rate: 54.1, runner: 'democratic', runnerName: '이광재', runnerRate: 45.9, turnout: 52.5 },
            keyIssues: ['관광 산업 활성화', '인구 소멸 대응', '특별자치도 자치권', '동해안 개발'],
            subRegions: 18,
            candidates: [
                { id: 'gangwon-1', name: '우상호', party: 'democratic', age: 63, career: '前 대통령비서실 정무수석 / 4선 국회의원 (서대문갑) / 前 원내대표', photo: null, status: 'DECLARED', dataSource: 'news', pledges: ['이해관계 조율·관리형 리더십', '강원 발전 예산 확보'] },
                { id: 'gangwon-2', name: '김진태', party: 'ppp', age: 62, career: '現 강원도지사 / 前 3선 국회의원 / 검사 출신', photo: null, status: 'DECLARED', dataSource: 'news', pledges: ['미래산업 글로벌도시', 'AI·첨단산업 120개 사업'] },
                { id: 'gangwon-3', name: '염동열', party: 'ppp', age: 65, career: '前 재선 국회의원 (태백·영월·평창·정선)', photo: null, status: 'DECLARED', dataSource: 'news', pledges: [] }
            ],
            polls: [
                { date: '2026-01-15', source: '한국갤럽', data: { 'gangwon-1': 42.1, 'gangwon-2': 45.8 }, margin: 3.8, sampleSize: 700 },
                { date: '2026-02-24', source: '리얼미터', data: { 'gangwon-1': 44.2, 'gangwon-2': 43.5 }, margin: 3.5, sampleSize: 800 }
            ],
            partySupport: { democratic: 44.2, ppp: 43.5, reform: 5.0, newReform: 3.0, progressive: 1.5, independent: 2.8 },
            demographics: {
                '18-29': { democratic: 50, ppp: 30, reform: 10, other: 10 },
                '30-39': { democratic: 48, ppp: 32, reform: 10, other: 10 },
                '40-49': { democratic: 44, ppp: 40, reform: 6, other: 10 },
                '50-59': { democratic: 40, ppp: 48, reform: 4, other: 8 },
                '60+': { democratic: 35, ppp: 55, reform: 3, other: 7 }
            },
            hotspot: true
        },
        'chungbuk': {
            code: '43', name: '충청북도', nameEng: 'Chungbuk',
            population: 1597000, voters: 1373000,
            currentGovernor: { name: '김영환', party: 'ppp', since: 2022 },
            prevElection: { winner: 'ppp', winnerName: '김영환', rate: 58.2, runner: 'democratic', runnerName: '노영민', runnerRate: 41.8, turnout: 51.8 },
            keyIssues: ['오송 참사 후속대책', '바이오 산업', '충북선 고속화', '균형발전'],
            subRegions: 11,
            candidates: [
                { id: 'chungbuk-1', name: '김영환', party: 'ppp', age: 63, career: '現 충북도지사 (재선 도전) / 前 3선 국회의원', photo: null, status: 'EXPECTED', dataSource: 'news', pledges: ['오송 바이오클러스터', '충북 반도체 단지', 'KTX 충북선 연장'] },
                { id: 'chungbuk-2', name: '신용한', party: 'democratic', age: null, career: '現 지방시대위 부위원장 / 前 교수', photo: null, status: 'DECLARED', dataSource: 'news', pledges: ['새로운 충북 개척', '젊은 충북'] },
                { id: 'chungbuk-3', name: '노영민', party: 'democratic', age: null, career: '前 대통령 비서실장 / 前 주중 대사 / 3선 국회의원 (흥덕)', photo: null, status: 'DECLARED', dataSource: 'news', pledges: ['국정 노하우 활용 지역 발전'] },
                { id: 'chungbuk-4', name: '송기섭', party: 'democratic', age: null, career: '前 진천군수 (3선)', photo: null, status: 'DECLARED', dataSource: 'news', pledges: ['충북특별중심도 건설'] },
                { id: 'chungbuk-5', name: '한범덕', party: 'democratic', age: null, career: '前 청주시장 (재선)', photo: null, status: 'DECLARED', dataSource: 'news', pledges: [] },
                { id: 'chungbuk-6', name: '조길형', party: 'ppp', age: null, career: '前 충주시장 (재선)', photo: null, status: 'DECLARED', dataSource: 'news', pledges: [] },
                { id: 'chungbuk-7', name: '윤갑근', party: 'ppp', age: null, career: '前 충북도당위원장 / 前 대구고검 검사장', photo: null, status: 'DECLARED', dataSource: 'news', pledges: ['대한민국 중심 충북의 시대'] },
                { id: 'chungbuk-8', name: '윤희근', party: 'ppp', age: null, career: '前 경찰청장 (23대) / 국민의힘 입당', photo: null, status: 'DECLARED', dataSource: 'news', pledges: ['결과로 증명하는 도지사', '반도체·바이오·AI 성장동력'] }
            ],
            polls: [
                { date: '2026-01-15', source: '리얼미터', data: { 'chungbuk-1': 45.8, 'chungbuk-2': 41.2 }, margin: 3.5, sampleSize: 800 },
                { date: '2026-02-24', source: '한국갤럽', data: { 'chungbuk-1': 47.2, 'chungbuk-2': 39.5 }, margin: 3.8, sampleSize: 700 }
            ],
            partySupport: { democratic: 47.2, ppp: 39.5, reform: 5.8, newReform: 3.0, progressive: 1.5, independent: 3.0 },
            demographics: {
                '18-29': { democratic: 52, ppp: 28, reform: 10, other: 10 },
                '30-39': { democratic: 50, ppp: 30, reform: 8, other: 12 },
                '40-49': { democratic: 48, ppp: 36, reform: 6, other: 10 },
                '50-59': { democratic: 44, ppp: 42, reform: 5, other: 9 },
                '60+': { democratic: 38, ppp: 50, reform: 4, other: 8 }
            },
            hotspot: true
        },
        'chungnam': {
            code: '44', name: '충청남도', nameEng: 'Chungnam',
            population: 2136000, voters: 1825000,
            currentGovernor: { name: '김태흠', party: 'ppp', since: 2022 },
            prevElection: { winner: 'ppp', winnerName: '김태흠', rate: 53.9, runner: 'democratic', runnerName: '양승조', runnerRate: 46.1, turnout: 51.2 },
            keyIssues: ['대전-충남 행정통합', '서해안 산업벨트', '농업 혁신', '천안-아산 메가시티'],
            subRegions: 15,
            candidates: [
                { id: 'chungnam-1', name: '김태흠', party: 'ppp', age: 58, career: '現 충남도지사 / 前 3선 국회의원 (보령·서천)', photo: null, status: 'EXPECTED', dataSource: 'news', pledges: ['AI 대전환', '당진항 복합물류단지', '대전·충남 행정통합'] },
                { id: 'chungnam-2', name: '박수현', party: 'democratic', age: null, career: '現 국회의원 (공주·부여·청양) / 前 청와대 대변인·국민소통수석', photo: null, status: 'DECLARED', dataSource: 'news', pledges: ['충남대전 AI 기본사회', '대전충남 통합 완성'] },
                { id: 'chungnam-3', name: '양승조', party: 'democratic', age: null, career: '前 충남도지사 / 4선 국회의원 (천안갑)', photo: null, status: 'WITHDRAWN', dataSource: 'news', pledges: ['대전충남 통합특별시'] },
                { id: 'chungnam-4', name: '복기왕', party: 'democratic', age: null, career: '現 국회의원 (아산갑) / 前 아산시장(재선)', photo: null, status: 'EXPECTED', dataSource: 'news', pledges: [] },
                { id: 'chungnam-5', name: '나소열', party: 'ppp', age: null, career: '現 국회의원 (천안갑) / 前 천안시장', photo: null, status: 'RUMORED', dataSource: 'news', pledges: [] }
            ],
            polls: [
                { date: '2026-01-15', source: '한국갤럽', data: { 'chungnam-1': 44.5, 'chungnam-2': 43.2 }, margin: 3.5, sampleSize: 800 },
                { date: '2026-02-24', source: '리얼미터', data: { 'chungnam-1': 46.0, 'chungnam-2': 41.8 }, margin: 3.2, sampleSize: 1000 }
            ],
            partySupport: { democratic: 46.0, ppp: 41.8, reform: 5.2, newReform: 3.0, progressive: 1.2, independent: 2.8 },
            demographics: {
                '18-29': { democratic: 50, ppp: 30, reform: 10, other: 10 },
                '30-39': { democratic: 48, ppp: 32, reform: 8, other: 12 },
                '40-49': { democratic: 46, ppp: 38, reform: 6, other: 10 },
                '50-59': { democratic: 42, ppp: 44, reform: 5, other: 9 },
                '60+': { democratic: 38, ppp: 50, reform: 4, other: 8 }
            },
            hotspot: true
        },
        'jeonbuk': {
            code: '45', name: '전북특별자치도', nameEng: 'Jeonbuk',
            population: 1722000, voters: 1518000,
            currentGovernor: { name: '김관영', party: 'democratic', since: 2022 },
            prevElection: { winner: 'democratic', winnerName: '김관영', rate: 82.1, runner: 'ppp', runnerName: '조배숙', runnerRate: 17.9, turnout: 50.9 },
            keyIssues: ['특별자치도 자치권', '새만금 개발', '탄소중립', '농생명 산업'],
            subRegions: 14,
            candidates: [
                { id: 'jeonbuk-1', name: '김관영', party: 'democratic', age: 58, career: '現 전북도지사 (재선 도전) / 前 3선 국회의원 (군산)', photo: null, status: 'DECLARED', dataSource: 'news', pledges: ['전북특별자치도 특례 확대', '새만금 활성화'] },
                { id: 'jeonbuk-2', name: '안호영', party: 'democratic', age: null, career: '3선 국회의원 (완주·진안·무주·장수) / 現 환경노동위원장', photo: null, status: 'DECLARED', dataSource: 'news', pledges: [] },
                { id: 'jeonbuk-3', name: '이원택', party: 'democratic', age: null, career: '재선 국회의원 (전주갑) / 前 전북도 정무부지사', photo: null, status: 'DECLARED', dataSource: 'news', pledges: [] },
                { id: 'jeonbuk-4', name: '정헌율', party: 'democratic', age: null, career: '現 익산시장 (3선, 연임제한)', photo: null, status: 'DECLARED', dataSource: 'news', pledges: [] }
            ],
            polls: [
                { date: '2026-02-24', source: '리얼미터', data: { 'jeonbuk-1': 55.2, 'jeonbuk-2': 28.5 }, margin: 3.8, sampleSize: 700 }
            ],
            partySupport: { democratic: 55.2, ppp: 8.5, reform: 28.5, newReform: 2.0, progressive: 3.5, independent: 2.3 },
            demographics: {
                '18-29': { democratic: 48, ppp: 8, reform: 32, other: 12 },
                '30-39': { democratic: 50, ppp: 7, reform: 30, other: 13 },
                '40-49': { democratic: 58, ppp: 9, reform: 25, other: 8 },
                '50-59': { democratic: 60, ppp: 10, reform: 22, other: 8 },
                '60+': { democratic: 58, ppp: 12, reform: 20, other: 10 }
            },
            hotspot: false
        },
        'jeonnam': {
            code: '46', name: '전라남도', nameEng: 'Jeonnam',
            population: 1777000, voters: 1565000,
            currentGovernor: { name: '김영록', party: 'democratic', since: 2018 },
            prevElection: { winner: 'democratic', winnerName: '김영록', rate: 75.7, runner: 'ppp', runnerName: '이정현', runnerRate: 18.8, turnout: 50.9 },
            keyIssues: ['광주-전남 행정통합', '에너지 전환', '농어촌 활성화', '인구 소멸'],
            subRegions: 22,
            candidates: [
                { id: 'jeonnam-1', name: '김영록', party: 'democratic', age: 68, career: '現 전남도지사 (3선 도전) / 前 농림부 장관 / 3선 국회의원', photo: null, status: 'EXPECTED', dataSource: 'news', pledges: ['전남 해상풍력 허브', '광주-전남 메가시티'] },
                { id: 'jeonnam-2', name: '주철현', party: 'democratic', age: null, career: '現 국회의원 (여수갑) / 現 전남도당위원장 / 前 여수시장', photo: null, status: 'EXPECTED', dataSource: 'news', pledges: [] },
                { id: 'jeonnam-3', name: '신정훈', party: 'democratic', age: null, career: '現 국회의원 (나주·화순) / 現 행안위원장', photo: null, status: 'DECLARED', dataSource: 'news', pledges: [] },
                { id: 'jeonnam-4', name: '이개호', party: 'democratic', age: null, career: '4선 국회의원 (담양·함평·영광·장성) / 前 농림부 장관', photo: null, status: 'EXPECTED', dataSource: 'news', pledges: [] },
                { id: 'jeonnam-5', name: '서삼석', party: 'democratic', age: null, career: '3선 국회의원 (영암·무안·신안) / 前 무안군수', photo: null, status: 'RUMORED', dataSource: 'news', pledges: [] },
                { id: 'jeonnam-6', name: '김화진', party: 'ppp', age: null, career: '現 국민의힘 전남도당위원장 (4연임)', photo: null, status: 'DECLARED', dataSource: 'news', pledges: [] }
            ],
            polls: [
                { date: '2026-02-24', source: '한국갤럽', data: { 'jeonnam-1': 58.5, 'jeonnam-2': 25.2 }, margin: 4.0, sampleSize: 600 }
            ],
            partySupport: { democratic: 58.5, ppp: 6.8, reform: 25.2, newReform: 2.5, progressive: 4.0, independent: 3.0 },
            demographics: {
                '18-29': { democratic: 50, ppp: 6, reform: 30, other: 14 },
                '30-39': { democratic: 52, ppp: 5, reform: 28, other: 15 },
                '40-49': { democratic: 60, ppp: 7, reform: 24, other: 9 },
                '50-59': { democratic: 62, ppp: 8, reform: 22, other: 8 },
                '60+': { democratic: 60, ppp: 10, reform: 18, other: 12 }
            },
            hotspot: false
        },
        'gyeongbuk': {
            code: '47', name: '경상북도', nameEng: 'Gyeongbuk',
            population: 2500000, voters: 2224000,
            currentGovernor: { name: '이철우', party: 'ppp', since: 2018 },
            prevElection: { winner: 'ppp', winnerName: '이철우', rate: 78.0, runner: 'democratic', runnerName: '임미애', runnerRate: 22.0, turnout: 49.5 },
            keyIssues: ['포항 지진 복구', '경북 북부 발전', '울릉도 개발', '반도체 산업'],
            subRegions: 23,
            candidates: [
                { id: 'gyeongbuk-1', name: '이철우', party: 'ppp', age: 71, career: '現 경북도지사 (3선 도전) / 前 5선 국회의원 (김천)', photo: null, status: 'DECLARED', dataSource: 'news', pledges: ['대구경북신공항 완수', '국가산업단지 조성'] },
                { id: 'gyeongbuk-2', name: '권오을', party: 'democratic', age: null, career: '現 국가보훈부 장관 / 前 3선 국회의원 (안동)', photo: null, status: 'WITHDRAWN', dataSource: 'news', pledges: [] },
                { id: 'gyeongbuk-3', name: '오중기', party: 'democratic', age: null, career: '民 포항북 지역위원장 / 前 청와대 균형발전비서관실', photo: null, status: 'EXPECTED', dataSource: 'news', pledges: ['대기업 상생 생태계', '청년창업 메카'] },
                { id: 'gyeongbuk-4', name: '임미애', party: 'democratic', age: null, career: '現 비례대표 국회의원 / 前 경북도의원', photo: null, status: 'RUMORED', dataSource: 'news', pledges: [] }
            ],
            polls: [
                { date: '2026-01-15', source: '리얼미터', data: { 'gyeongbuk-1': 22.8, 'gyeongbuk-2': 58.5 }, margin: 3.8, sampleSize: 800 },
                { date: '2026-02-24', source: '한국갤럽', data: { 'gyeongbuk-1': 24.5, 'gyeongbuk-2': 56.2 }, margin: 4.0, sampleSize: 600 }
            ],
            partySupport: { democratic: 24.5, ppp: 56.2, reform: 6.5, newReform: 5.8, progressive: 1.5, independent: 5.5 },
            demographics: {
                '18-29': { democratic: 35, ppp: 38, reform: 14, other: 13 },
                '30-39': { democratic: 30, ppp: 42, reform: 12, other: 16 },
                '40-49': { democratic: 24, ppp: 55, reform: 8, other: 13 },
                '50-59': { democratic: 20, ppp: 62, reform: 5, other: 13 },
                '60+': { democratic: 15, ppp: 72, reform: 3, other: 10 }
            },
            hotspot: false
        },
        'gyeongnam': {
            code: '48', name: '경상남도', nameEng: 'Gyeongnam',
            population: 3201000, voters: 2780000,
            currentGovernor: { name: '박완수', party: 'ppp', since: 2022 },
            prevElection: { winner: 'ppp', winnerName: '박완수', rate: 65.7, runner: 'democratic', runnerName: '양문석', runnerRate: 29.4, turnout: 49.8 },
            keyIssues: ['조선 산업 부활', '진주 혁신도시', '김해 가덕도 연계', '농촌 활성화'],
            subRegions: 18,
            candidates: [
                { id: 'gyeongnam-1', name: '김경수', party: 'democratic', age: null, career: '現 지방시대위원장 / 前 경남도지사 (민선7기)', photo: null, status: 'DECLARED', dataSource: 'news', pledges: [] },
                { id: 'gyeongnam-2', name: '박완수', party: 'ppp', age: 71, career: '現 경남도지사 / 前 3선 창원시장', photo: null, status: 'EXPECTED', dataSource: 'news', pledges: ['산업 경쟁력 강화', '도정 연속성'] },
                { id: 'gyeongnam-3', name: '조해진', party: 'ppp', age: null, career: '前 3선 국회의원 (밀양·의령·함안·창녕)', photo: null, status: 'DECLARED', dataSource: 'news', pledges: ['남부권 제2 수도권', '부울경 통합 지자체'] },
                { id: 'gyeongnam-4', name: '전희영', party: 'progressive', age: null, career: '前 전교조 위원장', photo: null, status: 'DECLARED', dataSource: 'news', pledges: [] }
            ],
            polls: [
                { date: '2026-01-15', source: '한국갤럽', data: { 'gyeongnam-1': 38.5, 'gyeongnam-2': 46.8 }, margin: 3.5, sampleSize: 800 },
                { date: '2026-02-24', source: '리얼미터', data: { 'gyeongnam-1': 41.2, 'gyeongnam-2': 44.5 }, margin: 3.0, sampleSize: 1000 }
            ],
            partySupport: { democratic: 41.2, ppp: 44.5, reform: 5.8, newReform: 3.5, progressive: 2.0, independent: 3.0 },
            demographics: {
                '18-29': { democratic: 48, ppp: 30, reform: 12, other: 10 },
                '30-39': { democratic: 45, ppp: 32, reform: 10, other: 13 },
                '40-49': { democratic: 40, ppp: 42, reform: 8, other: 10 },
                '50-59': { democratic: 35, ppp: 50, reform: 5, other: 10 },
                '60+': { democratic: 28, ppp: 60, reform: 3, other: 9 }
            },
            hotspot: true
        },
        'jeju': {
            code: '50', name: '제주특별자치도', nameEng: 'Jeju',
            population: 664000, voters: 567000,
            currentGovernor: { name: '오영훈', party: 'democratic', since: 2022 },
            prevElection: { winner: 'democratic', winnerName: '오영훈', rate: 55.1, runner: 'ppp', runnerName: '허향진', runnerRate: 39.5, turnout: 53.5 },
            keyIssues: ['제주 제2공항', '관광 산업 혁신', '환경 보전', '이주민 정책'],
            subRegions: 2,
            candidates: [
                { id: 'jeju-1', name: '문대림', party: 'democratic', age: 61, career: '現 국회의원 (제주시을) / 前 제주도의회 의장(최연소)', photo: null, status: 'DECLARED', dataSource: 'news', pledges: ['5천억 민생회복 추경', '20조원 투자 유치'] },
                { id: 'jeju-2', name: '오영훈', party: 'democratic', age: 57, career: '現 제주도지사 (재선 도전) / 前 국회의원', photo: null, status: 'DECLARED', dataSource: 'news', pledges: ['AI·에너지·우주산업 중심 미래 제주', '재생에너지 연금'] },
                { id: 'jeju-3', name: '위성곤', party: 'democratic', age: 58, career: '3선 국회의원 (서귀포) / 現 기후위기특별위원장', photo: null, status: 'DECLARED', dataSource: 'news', pledges: ['제주사회 대전환 6대 비전'] },
                { id: 'jeju-4', name: '문성유', party: 'ppp', age: null, career: '前 기재부 기획조정실장 / 前 KAMCO 사장', photo: null, status: 'DECLARED', dataSource: 'news', pledges: ['1차 산업 인력통합관리센터'] },
                { id: 'jeju-5', name: '양윤녕', party: 'democratic', age: null, career: '前 소나무당 → 민주당 복당 / 前 제주도의원', photo: null, status: 'DECLARED', dataSource: 'news', pledges: [] }
            ],
            polls: [
                { date: '2026-01-15', source: '한국갤럽', data: { 'jeju-1': 40.2, 'jeju-2': 35.8, 'jeju-3': 12.5 }, margin: 4.5, sampleSize: 500 },
                { date: '2026-02-24', source: '리얼미터', data: { 'jeju-1': 42.5, 'jeju-2': 33.8, 'jeju-3': 13.2 }, margin: 4.0, sampleSize: 600 }
            ],
            partySupport: { democratic: 42.5, ppp: 33.8, reform: 5.5, newReform: 2.0, progressive: 1.5, independent: 14.7 },
            demographics: {
                '18-29': { democratic: 48, ppp: 25, reform: 10, other: 17 },
                '30-39': { democratic: 45, ppp: 28, reform: 8, other: 19 },
                '40-49': { democratic: 42, ppp: 35, reform: 6, other: 17 },
                '50-59': { democratic: 40, ppp: 40, reform: 5, other: 15 },
                '60+': { democratic: 35, ppp: 45, reform: 4, other: 16 }
            },
            hotspot: false
        }
    };

    // 전국 통계 요약
    const nationalSummary = {
        totalVoters: Object.values(regions).reduce((sum, r) => sum + r.voters, 0),
        totalPopulation: Object.values(regions).reduce((sum, r) => sum + r.population, 0),
        totalCandidates: Object.values(regions).reduce((sum, r) => sum + r.candidates.length, 0),
        officialStats: {
            electionTypes: 7,
            regions: 17,
            sigungu: 226,
            votersFinalized: false,
            votersText: '확정 전'
        },
        electionTypes: [
            { name: '광역단체장', count: 17, description: '시도지사 선거' },
            { name: '기초단체장', count: 226, description: '시장·군수·구청장 선거' },
            { name: '광역의원', count: 779, description: '시도의회의원 선거' },
            { name: '기초의원', count: 2601, description: '시군구의회의원 선거' },
            { name: '교육감', count: 17, description: '시도교육감 선거' },
            { name: '비례대표 광역의원', count: 93, description: '시도의회 비례대표' },
            { name: '비례대표 기초의원', count: 386, description: '시군구의회 비례대표' }
        ],
        byElection: {
            name: '국회의원 재보궐선거',
            count: 6,
            districts: ['인천 연수구갑', '인천 계양구을', '경기 평택시을', '경기 안산시갑', '충남 아산시을', '전북 군산·김제·부안갑']
        }
    };

    // ============================================
    // 역대 선거 데이터 (7회 2018, 8회 2022)
    // ============================================
    // 역대 광역단체장 선거 결과 (민선 1기~8기, 1995~2022)
    const historicalElections = {
        seoul: [
            { election: 1, year: 1995, winner: 'democratic', winnerName: '조순', rate: 42.4, runner: 'independent', runnerName: '박찬종', runnerRate: 33.5, turnout: 68.4 },
            { election: 2, year: 1998, winner: 'democratic', winnerName: '고건', rate: 53.5, runner: 'ppp', runnerName: '최병렬', runnerRate: 44.0, turnout: 52.7 },
            { election: 3, year: 2002, winner: 'ppp', winnerName: '이명박', rate: 52.3, runner: 'democratic', runnerName: '김민석', runnerRate: 43.0, turnout: 48.9 },
            { election: 4, year: 2006, winner: 'ppp', winnerName: '오세훈', rate: 63.3, runner: 'democratic', runnerName: '강금실', runnerRate: 25.9, turnout: 51.6 },
            { election: 5, year: 2010, winner: 'ppp', winnerName: '오세훈', rate: 47.4, runner: 'democratic', runnerName: '한명숙', runnerRate: 47.2, turnout: 54.5 },
            { election: 6, year: 2014, winner: 'democratic', winnerName: '박원순', rate: 56.1, runner: 'ppp', runnerName: '정몽준', runnerRate: 44.7, turnout: 56.8 },
            { election: 7, year: 2018, winner: 'democratic', winnerName: '박원순', rate: 52.6, runner: 'ppp', runnerName: '김문수', runnerRate: 20.6, turnout: 60.2 },
            { election: 8, year: 2022, winner: 'ppp', winnerName: '오세훈', rate: 59.0, runner: 'democratic', runnerName: '송영길', runnerRate: 39.2, turnout: 50.9 }
        ],
        busan: [
            { election: 1, year: 1995, winner: 'ppp', winnerName: '문정수', rate: 51.4, runner: 'democratic', runnerName: '노무현', runnerRate: 37.6, turnout: 68.4 },
            { election: 2, year: 1998, winner: 'ppp', winnerName: '안상영', rate: 45.1, runner: 'independent', runnerName: '김기재', runnerRate: 43.5, turnout: 52.7 },
            { election: 3, year: 2002, winner: 'ppp', winnerName: '안상영', rate: 63.8, runner: 'democratic', runnerName: '한이헌', runnerRate: 19.4, turnout: 48.9 },
            { election: 4, year: 2006, winner: 'ppp', winnerName: '허남식', rate: 68.8, runner: 'democratic', runnerName: '오거돈', runnerRate: 21.3, turnout: 51.6 },
            { election: 5, year: 2010, winner: 'ppp', winnerName: '허남식', rate: 57.0, runner: 'democratic', runnerName: '김정길', runnerRate: 43.0, turnout: 54.5 },
            { election: 6, year: 2014, winner: 'ppp', winnerName: '서병수', rate: 51.8, runner: 'independent', runnerName: '오거돈', runnerRate: 48.2, turnout: 56.8 },
            { election: 7, year: 2018, winner: 'democratic', winnerName: '오거돈', rate: 58.6, runner: 'ppp', runnerName: '서병수', runnerRate: 35.4, turnout: 60.2 },
            { election: 8, year: 2022, winner: 'ppp', winnerName: '박형준', rate: 66.4, runner: 'democratic', runnerName: '변성완', runnerRate: 32.2, turnout: 50.9 }
        ],
        daegu: [
            { election: 1, year: 1995, winner: 'independent', winnerName: '문희갑', rate: 36.8, runner: 'other', runnerName: '이의익', runnerRate: 22.1, turnout: 68.4, runnerPartyLabel: '자유민주연합' },
            { election: 2, year: 1998, winner: 'ppp', winnerName: '문희갑', rate: 72.0, runner: 'other', runnerName: '이의익', runnerRate: 20.7, turnout: 52.7, runnerPartyLabel: '자유민주연합' },
            { election: 3, year: 2002, winner: 'ppp', winnerName: '조해녕', rate: 61.2, runner: 'independent', runnerName: '이재용', runnerRate: 38.8, turnout: 48.9 },
            { election: 4, year: 2006, winner: 'ppp', winnerName: '김범일', rate: 72.8, runner: 'independent', runnerName: '이재용', runnerRate: 18.8, turnout: 51.6 },
            { election: 5, year: 2010, winner: 'ppp', winnerName: '김범일', rate: 76.4, runner: 'democratic', runnerName: '이승천', runnerRate: 15.3, turnout: 54.5 },
            { election: 6, year: 2014, winner: 'ppp', winnerName: '권영진', rate: 55.6, runner: 'democratic', runnerName: '김부겸', runnerRate: 41.5, turnout: 56.8 },
            { election: 7, year: 2018, winner: 'ppp', winnerName: '권영진', rate: 52.2, runner: 'democratic', runnerName: '임대윤', runnerRate: 41.4, turnout: 60.2 },
            { election: 8, year: 2022, winner: 'ppp', winnerName: '홍준표', rate: 78.8, runner: 'democratic', runnerName: '서재헌', runnerRate: 18.0, turnout: 50.9 }
        ],
        incheon: [
            { election: 1, year: 1995, winner: 'ppp', winnerName: '최기선', rate: 40.8, runner: 'democratic', runnerName: '신용석', runnerRate: 31.7, turnout: 68.4 },
            { election: 2, year: 1998, winner: 'other', winnerName: '최기선', rate: 53.5, runner: 'ppp', runnerName: '안상수', runnerRate: 34.0, turnout: 52.7, winnerPartyLabel: '국민신당' },
            { election: 3, year: 2002, winner: 'ppp', winnerName: '안상수', rate: 56.2, runner: 'democratic', runnerName: '박상은', runnerRate: 32.1, turnout: 48.9 },
            { election: 4, year: 2006, winner: 'ppp', winnerName: '안상수', rate: 63.7, runner: 'democratic', runnerName: '최기선', runnerRate: 22.0, turnout: 51.6 },
            { election: 5, year: 2010, winner: 'democratic', winnerName: '송영길', rate: 52.1, runner: 'ppp', runnerName: '안상수', runnerRate: 45.5, turnout: 54.5 },
            { election: 6, year: 2014, winner: 'ppp', winnerName: '유정복', rate: 49.4, runner: 'democratic', runnerName: '송영길', runnerRate: 49.1, turnout: 56.8 },
            { election: 7, year: 2018, winner: 'democratic', winnerName: '박남춘', rate: 59.3, runner: 'ppp', runnerName: '유정복', runnerRate: 34.4, turnout: 60.2 },
            { election: 8, year: 2022, winner: 'ppp', winnerName: '유정복', rate: 51.8, runner: 'democratic', runnerName: '박남춘', runnerRate: 44.6, turnout: 50.9 }
        ],
        gwangju: [
            { election: 1, year: 1995, winner: 'democratic', winnerName: '송언종', rate: 89.7, runner: 'ppp', runnerName: '김동환', runnerRate: 10.3, turnout: 68.4 },
            { election: 2, year: 1998, winner: 'democratic', winnerName: '고재유', rate: 67.2, runner: 'independent', runnerName: '이승채', runnerRate: 32.8, turnout: 52.7 },
            { election: 3, year: 2002, winner: 'democratic', winnerName: '박광태', rate: 46.8, runner: 'independent', runnerName: '정동년', runnerRate: 27.0, turnout: 48.9 },
            { election: 4, year: 2006, winner: 'democratic', winnerName: '박광태', rate: 55.2, runner: 'democratic', runnerName: '조영택', runnerRate: 33.6, turnout: 51.6 },
            { election: 5, year: 2010, winner: 'democratic', winnerName: '강운태', rate: 58.8, runner: 'other', runnerName: '정찬용', runnerRate: 14.5, turnout: 54.5, runnerPartyLabel: '민주노동당' },
            { election: 6, year: 2014, winner: 'democratic', winnerName: '윤장현', rate: 59.2, runner: 'independent', runnerName: '강운태', runnerRate: 31.6, turnout: 56.8 },
            { election: 7, year: 2018, winner: 'democratic', winnerName: '이용섭', rate: 83.6, runner: 'ppp', runnerName: '나경채', runnerRate: 6.2, turnout: 60.2 },
            { election: 8, year: 2022, winner: 'democratic', winnerName: '강기정', rate: 74.9, runner: 'ppp', runnerName: '주기환', runnerRate: 15.9, turnout: 50.9 }
        ],
        daejeon: [
            { election: 1, year: 1995, winner: 'other', winnerName: '홍선기', rate: 63.8, runner: 'ppp', runnerName: '염홍철', runnerRate: 20.9, turnout: 68.4, winnerPartyLabel: '자유민주연합' },
            { election: 2, year: 1998, winner: 'other', winnerName: '홍선기', rate: 73.7, runner: 'independent', runnerName: '송천영', runnerRate: 18.1, turnout: 52.7, winnerPartyLabel: '자유민주연합' },
            { election: 3, year: 2002, winner: 'ppp', winnerName: '염홍철', rate: 46.6, runner: 'other', runnerName: '홍선기', runnerRate: 40.2, turnout: 48.9, runnerPartyLabel: '자유민주연합' },
            { election: 4, year: 2006, winner: 'ppp', winnerName: '박성효', rate: 44.5, runner: 'democratic', runnerName: '염홍철', runnerRate: 42.5, turnout: 51.6 },
            { election: 5, year: 2010, winner: 'other', winnerName: '염홍철', rate: 48.4, runner: 'ppp', runnerName: '박성효', runnerRate: 28.2, turnout: 54.5, winnerPartyLabel: '자유선진당' },
            { election: 6, year: 2014, winner: 'democratic', winnerName: '권선택', rate: 51.7, runner: 'ppp', runnerName: '박성효', runnerRate: 48.3, turnout: 56.8 },
            { election: 7, year: 2018, winner: 'democratic', winnerName: '허태정', rate: 56.4, runner: 'ppp', runnerName: '박성효', runnerRate: 32.5, turnout: 60.2 },
            { election: 8, year: 2022, winner: 'ppp', winnerName: '이장우', rate: 51.2, runner: 'democratic', runnerName: '허태정', runnerRate: 48.8, turnout: 50.9 }
        ],
        ulsan: [
            { election: 2, year: 1998, winner: 'ppp', winnerName: '심완구', rate: 42.7, runner: 'independent', runnerName: '송철호', runnerRate: 39.4, turnout: 52.7 },
            { election: 3, year: 2002, winner: 'ppp', winnerName: '박맹우', rate: 53.1, runner: 'other', runnerName: '송철호', runnerRate: 43.6, turnout: 48.9, runnerPartyLabel: '민주노동당' },
            { election: 4, year: 2006, winner: 'ppp', winnerName: '박맹우', rate: 66.6, runner: 'other', runnerName: '노옥희', runnerRate: 24.3, turnout: 51.6, runnerPartyLabel: '민주노동당' },
            { election: 5, year: 2010, winner: 'ppp', winnerName: '박맹우', rate: 63.0, runner: 'other', runnerName: '김창현', runnerRate: 27.9, turnout: 54.5, runnerPartyLabel: '민주노동당' },
            { election: 6, year: 2014, winner: 'ppp', winnerName: '김기현', rate: 64.6, runner: 'other', runnerName: '조승수', runnerRate: 29.6, turnout: 56.8, runnerPartyLabel: '정의당' },
            { election: 7, year: 2018, winner: 'democratic', winnerName: '송철호', rate: 55.3, runner: 'ppp', runnerName: '김기현', runnerRate: 38.8, turnout: 60.2 },
            { election: 8, year: 2022, winner: 'ppp', winnerName: '김두겸', rate: 59.8, runner: 'democratic', runnerName: '송철호', runnerRate: 40.2, turnout: 50.9 }
        ],
        sejong: [
            { election: 6, year: 2014, winner: 'democratic', winnerName: '이춘희', rate: 56.1, runner: 'ppp', runnerName: '유한식', runnerRate: 43.9, turnout: 56.8 },
            { election: 7, year: 2018, winner: 'democratic', winnerName: '이춘희', rate: 72.2, runner: 'ppp', runnerName: '송아영', runnerRate: 18.0, turnout: 60.2 },
            { election: 8, year: 2022, winner: 'ppp', winnerName: '최민호', rate: 52.8, runner: 'democratic', runnerName: '이춘희', runnerRate: 47.2, turnout: 50.9 }
        ],
        gyeonggi: [
            { election: 1, year: 1995, winner: 'ppp', winnerName: '이인제', rate: 40.6, runner: 'democratic', runnerName: '장경우', runnerRate: 29.6, turnout: 68.4 },
            { election: 2, year: 1998, winner: 'democratic', winnerName: '임창열', rate: 54.3, runner: 'ppp', runnerName: '손학규', runnerRate: 45.7, turnout: 52.7 },
            { election: 3, year: 2002, winner: 'ppp', winnerName: '손학규', rate: 58.4, runner: 'democratic', runnerName: '진념', runnerRate: 36.0, turnout: 48.9 },
            { election: 4, year: 2006, winner: 'ppp', winnerName: '김문수', rate: 60.0, runner: 'democratic', runnerName: '진대제', runnerRate: 30.6, turnout: 51.6 },
            { election: 5, year: 2010, winner: 'ppp', winnerName: '김문수', rate: 52.1, runner: 'other', runnerName: '유시민', runnerRate: 47.9, turnout: 54.5, runnerPartyLabel: '국민참여당' },
            { election: 6, year: 2014, winner: 'ppp', winnerName: '남경필', rate: 50.4, runner: 'democratic', runnerName: '김진표', runnerRate: 49.6, turnout: 56.8 },
            { election: 7, year: 2018, winner: 'democratic', winnerName: '이재명', rate: 56.4, runner: 'ppp', runnerName: '남경필', runnerRate: 33.6, turnout: 60.2 },
            { election: 8, year: 2022, winner: 'democratic', winnerName: '김동연', rate: 49.1, runner: 'ppp', runnerName: '김은혜', runnerRate: 48.9, turnout: 50.9 }
        ],
        gangwon: [
            { election: 1, year: 1995, winner: 'other', winnerName: '최각규', rate: 65.8, runner: 'ppp', runnerName: '이상룡', runnerRate: 34.2, turnout: 68.4, winnerPartyLabel: '자유민주연합' },
            { election: 2, year: 1998, winner: 'ppp', winnerName: '김진선', rate: 39.3, runner: 'other', runnerName: '한호선', runnerRate: 33.8, turnout: 52.7, runnerPartyLabel: '자유민주연합' },
            { election: 3, year: 2002, winner: 'ppp', winnerName: '김진선', rate: 71.1, runner: 'democratic', runnerName: '남동우', runnerRate: 28.9, turnout: 48.9 },
            { election: 4, year: 2006, winner: 'ppp', winnerName: '김진선', rate: 72.9, runner: 'democratic', runnerName: '이창복', runnerRate: 19.6, turnout: 51.6 },
            { election: 5, year: 2010, winner: 'democratic', winnerName: '이광재', rate: 53.4, runner: 'ppp', runnerName: '이계진', runnerRate: 46.6, turnout: 54.5 },
            { election: 6, year: 2014, winner: 'democratic', winnerName: '최문순', rate: 50.6, runner: 'ppp', runnerName: '최흥집', runnerRate: 48.2, turnout: 56.8 },
            { election: 7, year: 2018, winner: 'democratic', winnerName: '최문순', rate: 66.6, runner: 'independent', runnerName: '정창수', runnerRate: 33.4, turnout: 60.2 },
            { election: 8, year: 2022, winner: 'ppp', winnerName: '김진태', rate: 54.1, runner: 'democratic', runnerName: '이광재', runnerRate: 45.9, turnout: 50.9 }
        ],
        chungbuk: [
            { election: 1, year: 1995, winner: 'other', winnerName: '주병덕', rate: 36.4, runner: 'democratic', runnerName: '이용희', runnerRate: 24.5, turnout: 68.4, winnerPartyLabel: '자유민주연합' },
            { election: 2, year: 1998, winner: 'other', winnerName: '이원종', rate: 74.1, runner: 'ppp', runnerName: '주병덕', runnerRate: 25.9, turnout: 52.7, winnerPartyLabel: '자유민주연합' },
            { election: 3, year: 2002, winner: 'ppp', winnerName: '이원종', rate: 58.6, runner: 'other', runnerName: '구천서', runnerRate: 33.5, turnout: 48.9, runnerPartyLabel: '자유민주연합' },
            { election: 4, year: 2006, winner: 'ppp', winnerName: '정우택', rate: 63.8, runner: 'democratic', runnerName: '한범덕', runnerRate: 26.6, turnout: 51.6 },
            { election: 5, year: 2010, winner: 'democratic', winnerName: '이시종', rate: 49.6, runner: 'ppp', runnerName: '정우택', runnerRate: 48.5, turnout: 54.5 },
            { election: 6, year: 2014, winner: 'democratic', winnerName: '이시종', rate: 50.3, runner: 'ppp', runnerName: '윤진식', runnerRate: 48.2, turnout: 56.8 },
            { election: 7, year: 2018, winner: 'democratic', winnerName: '이시종', rate: 65.4, runner: 'ppp', runnerName: '박경국', runnerRate: 26.6, turnout: 60.2 },
            { election: 8, year: 2022, winner: 'ppp', winnerName: '김영환', rate: 58.2, runner: 'democratic', runnerName: '노영민', runnerRate: 41.8, turnout: 50.9 }
        ],
        chungnam: [
            { election: 1, year: 1995, winner: 'other', winnerName: '심대평', rate: 67.9, runner: 'ppp', runnerName: '박중배', runnerRate: 19.2, turnout: 68.4, winnerPartyLabel: '자유민주연합' },
            { election: 2, year: 1998, winner: 'other', winnerName: '심대평', rate: 84.6, runner: 'ppp', runnerName: '한청수', runnerRate: 15.4, turnout: 52.7, winnerPartyLabel: '자유민주연합' },
            { election: 3, year: 2002, winner: 'other', winnerName: '심대평', rate: 67.0, runner: 'ppp', runnerName: '박태권', runnerRate: 33.0, turnout: 48.9, winnerPartyLabel: '자유민주연합' },
            { election: 4, year: 2006, winner: 'ppp', winnerName: '이완구', rate: 46.7, runner: 'other', runnerName: '이명수', runnerRate: 27.0, turnout: 51.6, runnerPartyLabel: '자유민주연합' },
            { election: 5, year: 2010, winner: 'democratic', winnerName: '안희정', rate: 41.4, runner: 'other', runnerName: '박상돈', runnerRate: 38.8, turnout: 54.5, runnerPartyLabel: '자유선진당' },
            { election: 6, year: 2014, winner: 'democratic', winnerName: '안희정', rate: 49.8, runner: 'ppp', runnerName: '정진석', runnerRate: 48.1, turnout: 56.8 },
            { election: 7, year: 2018, winner: 'democratic', winnerName: '양승조', rate: 63.7, runner: 'ppp', runnerName: '이인제', runnerRate: 34.6, turnout: 60.2 },
            { election: 8, year: 2022, winner: 'ppp', winnerName: '김태흠', rate: 53.9, runner: 'democratic', runnerName: '양승조', runnerRate: 46.1, turnout: 50.9 }
        ],
        jeonbuk: [
            { election: 1, year: 1995, winner: 'democratic', winnerName: '유종근', rate: 67.2, runner: 'ppp', runnerName: '강현욱', runnerRate: 32.8, turnout: 68.4 },
            { election: 2, year: 1998, winner: 'democratic', winnerName: '유종근', rate: 100.0, runner: null, runnerName: '(무투표)', runnerRate: 0, turnout: 52.7 },
            { election: 3, year: 2002, winner: 'democratic', winnerName: '강현욱', rate: 74.6, runner: 'independent', runnerName: '손주항', runnerRate: 17.1, turnout: 48.9 },
            { election: 4, year: 2006, winner: 'democratic', winnerName: '김완주', rate: 58.9, runner: 'democratic', runnerName: '정균환', runnerRate: 28.6, turnout: 51.6 },
            { election: 5, year: 2010, winner: 'democratic', winnerName: '김완주', rate: 72.9, runner: 'ppp', runnerName: '정운천', runnerRate: 16.4, turnout: 54.5 },
            { election: 6, year: 2014, winner: 'democratic', winnerName: '송하진', rate: 69.2, runner: 'ppp', runnerName: '박철곤', runnerRate: 20.5, turnout: 56.8 },
            { election: 7, year: 2018, winner: 'democratic', winnerName: '송하진', rate: 75.0, runner: 'ppp', runnerName: '임정엽', runnerRate: 17.8, turnout: 60.2 },
            { election: 8, year: 2022, winner: 'democratic', winnerName: '김관영', rate: 82.1, runner: 'ppp', runnerName: '조배숙', runnerRate: 17.9, turnout: 50.9 }
        ],
        jeonnam: [
            { election: 1, year: 1995, winner: 'democratic', winnerName: '허경만', rate: 73.5, runner: 'ppp', runnerName: '전석홍', runnerRate: 26.5, turnout: 68.4 },
            { election: 2, year: 1998, winner: 'democratic', winnerName: '허경만', rate: 100.0, runner: null, runnerName: '(무투표)', runnerRate: 0, turnout: 52.7 },
            { election: 3, year: 2002, winner: 'democratic', winnerName: '박태영', rate: 57.8, runner: 'independent', runnerName: '송재구', runnerRate: 24.2, turnout: 48.9 },
            { election: 4, year: 2006, winner: 'democratic', winnerName: '박준영', rate: 67.7, runner: 'democratic', runnerName: '서범석', runnerRate: 19.2, turnout: 51.6 },
            { election: 5, year: 2010, winner: 'democratic', winnerName: '박준영', rate: 68.3, runner: 'ppp', runnerName: '김대식', runnerRate: 13.4, turnout: 54.5 },
            { election: 6, year: 2014, winner: 'democratic', winnerName: '이낙연', rate: 78.0, runner: 'other', runnerName: '이성수', runnerRate: 12.5, turnout: 56.8, runnerPartyLabel: '통합진보당' },
            { election: 7, year: 2018, winner: 'democratic', winnerName: '김영록', rate: 77.1, runner: 'other', runnerName: '민영삼', runnerRate: 10.6, turnout: 60.2, runnerPartyLabel: '민주평화당' },
            { election: 8, year: 2022, winner: 'democratic', winnerName: '김영록', rate: 75.7, runner: 'ppp', runnerName: '이정현', runnerRate: 18.8, turnout: 50.9 }
        ],
        gyeongbuk: [
            { election: 1, year: 1995, winner: 'ppp', winnerName: '이의근', rate: 37.9, runner: 'independent', runnerName: '이판석', runnerRate: 34.3, turnout: 68.4 },
            { election: 2, year: 1998, winner: 'ppp', winnerName: '이의근', rate: 72.0, runner: 'other', runnerName: '이판석', runnerRate: 28.0, turnout: 52.7, runnerPartyLabel: '자유민주연합' },
            { election: 3, year: 2002, winner: 'ppp', winnerName: '이의근', rate: 85.5, runner: 'independent', runnerName: '조영건', runnerRate: 14.5, turnout: 48.9 },
            { election: 4, year: 2006, winner: 'ppp', winnerName: '김관용', rate: 81.0, runner: 'independent', runnerName: '박명재', runnerRate: 19.0, turnout: 51.6 },
            { election: 5, year: 2010, winner: 'ppp', winnerName: '김관용', rate: 78.0, runner: 'democratic', runnerName: '홍의락', runnerRate: 13.0, turnout: 54.5 },
            { election: 6, year: 2014, winner: 'ppp', winnerName: '김관용', rate: 77.1, runner: 'democratic', runnerName: '오중기', runnerRate: 17.0, turnout: 56.8 },
            { election: 7, year: 2018, winner: 'ppp', winnerName: '이철우', rate: 54.9, runner: 'democratic', runnerName: '오중기', runnerRate: 34.8, turnout: 60.2 },
            { election: 8, year: 2022, winner: 'ppp', winnerName: '이철우', rate: 78.0, runner: 'democratic', runnerName: '임미애', runnerRate: 22.0, turnout: 50.9 }
        ],
        gyeongnam: [
            { election: 1, year: 1995, winner: 'ppp', winnerName: '김혁규', rate: 63.8, runner: 'other', runnerName: '김용균', runnerRate: 36.2, turnout: 68.4, runnerPartyLabel: '자유민주연합' },
            { election: 2, year: 1998, winner: 'ppp', winnerName: '김혁규', rate: 74.6, runner: 'democratic', runnerName: '강신화', runnerRate: 12.8, turnout: 52.7 },
            { election: 3, year: 2002, winner: 'ppp', winnerName: '김혁규', rate: 74.5, runner: 'democratic', runnerName: '김두관', runnerRate: 16.9, turnout: 48.9 },
            { election: 4, year: 2006, winner: 'ppp', winnerName: '김태호', rate: 64.1, runner: 'democratic', runnerName: '김두관', runnerRate: 24.7, turnout: 51.6 },
            { election: 5, year: 2010, winner: 'independent', winnerName: '김두관', rate: 51.5, runner: 'ppp', runnerName: '이달곤', runnerRate: 48.5, turnout: 54.5 },
            { election: 6, year: 2014, winner: 'ppp', winnerName: '홍준표', rate: 59.8, runner: 'democratic', runnerName: '김경수', runnerRate: 36.6, turnout: 56.8 },
            { election: 7, year: 2018, winner: 'democratic', winnerName: '김경수', rate: 56.8, runner: 'ppp', runnerName: '김태호', runnerRate: 40.1, turnout: 60.2 },
            { election: 8, year: 2022, winner: 'ppp', winnerName: '박완수', rate: 65.7, runner: 'democratic', runnerName: '양문석', runnerRate: 29.4, turnout: 50.9 }
        ],
        jeju: [
            { election: 1, year: 1995, winner: 'independent', winnerName: '신구범', rate: 40.6, runner: 'ppp', runnerName: '우근민', runnerRate: 32.5, turnout: 68.4 },
            { election: 2, year: 1998, winner: 'democratic', winnerName: '우근민', rate: 52.8, runner: 'independent', runnerName: '신구범', runnerRate: 30.8, turnout: 52.7 },
            { election: 3, year: 2002, winner: 'democratic', winnerName: '우근민', rate: 51.4, runner: 'ppp', runnerName: '신구범', runnerRate: 45.4, turnout: 48.9 },
            { election: 4, year: 2006, winner: 'independent', winnerName: '김태환', rate: 45.0, runner: 'ppp', runnerName: '현명관', runnerRate: 44.0, turnout: 51.6 },
            { election: 5, year: 2010, winner: 'independent', winnerName: '우근민', rate: 41.4, runner: 'independent', runnerName: '현명관', runnerRate: 40.6, turnout: 54.5 },
            { election: 6, year: 2014, winner: 'ppp', winnerName: '원희룡', rate: 61.2, runner: 'democratic', runnerName: '신구범', runnerRate: 34.6, turnout: 56.8 },
            { election: 7, year: 2018, winner: 'independent', winnerName: '원희룡', rate: 50.3, runner: 'democratic', runnerName: '문대림', runnerRate: 41.8, turnout: 60.2 },
            { election: 8, year: 2022, winner: 'democratic', winnerName: '오영훈', rate: 55.1, runner: 'ppp', runnerName: '허향진', runnerRate: 39.5, turnout: 50.9 }
        ]
    };

    // 격전지 Top 10 계산
    function getHotspots() {
        const hotspots = [];
        Object.entries(regions).forEach(([key, region]) => {
            const latestPoll = region.polls[region.polls.length - 1];
            if (!latestPoll) return;
            const pollValues = Object.values(latestPoll.data);
            pollValues.sort((a, b) => b - a);
            const gap = pollValues.length >= 2 ? pollValues[0] - pollValues[1] : 100;
            hotspots.push({
                key,
                name: region.name,
                gap: gap.toFixed(1),
                margin: latestPoll.margin,
                leading: Object.keys(latestPoll.data).find(k => latestPoll.data[k] === pollValues[0]),
                leadingRate: pollValues[0],
                runnerRate: pollValues[1] || 0,
                isWithinMargin: gap <= latestPoll.margin * 2
            });
        });
        return hotspots.sort((a, b) => a.gap - b.gap).slice(0, 10);
    }

    // D-day 계산
    function getDday() {
        const now = new Date();
        const diff = electionDate - now;
        return Math.ceil(diff / (1000 * 60 * 60 * 24));
    }

    // 전국 정당별 우세 지역 수
    function getPartyDominance() {
        const dominance = {};
        Object.values(regions).forEach(region => {
            const latestPoll = region.polls[region.polls.length - 1];
            if (!latestPoll) return;
            const leadingCandidate = Object.entries(latestPoll.data).sort((a, b) => b[1] - a[1])[0];
            const candidate = region.candidates.find(c => c.id === leadingCandidate[0]);
            if (candidate) {
                const party = candidate.party;
                dominance[party] = (dominance[party] || 0) + 1;
            }
        });
        return dominance;
    }

    // 뉴스 검색 URL 생성 (네이버 뉴스 실시간 링크)
    function getNewsSearchUrl(regionKey) {
        const region = regions[regionKey];
        if (!region) return '#';
        return `https://search.naver.com/search.naver?where=news&query=${encodeURIComponent(region.name + ' 지방선거 2026')}`;
    }

    // 한국갤럽 전국 정당 지지율 데이터 (#4)
    // 데일리 오피니언 제655호 (2026년 3월 2주)
    const gallupNationalPoll = {
        source: '한국갤럽',
        surveyDate: '2026년 3월 2주',
        publishDate: '2026-03-12',
        sampleSize: 1002,
        method: '',
        confidence: '95%',
        margin: 3.1,
        responseRate: '',
        reportNo: '데일리 오피니언 제655호',
        url: 'https://www.gallup.co.kr/gallupdb/reportContent.asp?seqNo=1625',
        data: {
            democratic: 47,
            ppp: 20,
            reform: 2,
            independent: 28
        }
    };

    // 선거종류 상세 정보 (#3 호버 정보)
    const electionTypeInfo = {
        governor: {
            name: '광역단체장',
            count: 17,
            description: '시도지사 선거',
            detail: '17개 시·도의 광역자치단체장을 선출합니다. 서울특별시장, 부산광역시장 등 광역단체의 최고 행정 책임자를 뽑는 선거입니다.',
            term: '4년',
            votersPer: '유권자 1인당 1표'
        },
        mayor: {
            name: '기초단체장',
            count: 226,
            description: '시장·군수·구청장 선거',
            detail: '226개 시·군·구의 기초자치단체장을 선출합니다. 기초단체의 행정 책임자로서 주민 생활과 가장 밀접한 선거입니다.',
            term: '4년',
            votersPer: '유권자 1인당 1표'
        },
        council: {
            name: '광역의원',
            count: 779,
            description: '시도의회의원 선거',
            detail: '시·도의회 지역구 의원을 선출합니다. 광역자치단체의 조례 제정, 예산 심의 등 입법 기능을 수행합니다.',
            term: '4년',
            votersPer: '유권자 1인당 1표 (+ 비례대표 1표)'
        },
        localCouncil: {
            name: '기초의원',
            count: 2601,
            description: '시군구의회의원 선거',
            detail: '시·군·구의회 지역구 의원을 선출합니다. 기초자치단체의 조례 제정, 예산 심의 등 주민 생활에 직접 영향을 미치는 입법 기능을 합니다.',
            term: '4년',
            votersPer: '유권자 1인당 1표 (+ 비례대표 1표)'
        },
        superintendent: {
            name: '교육감',
            count: 17,
            description: '시도교육감 선거',
            detail: '17개 시·도의 교육감을 선출합니다. 교육 자치의 최고 책임자로서 지역 교육 정책을 총괄합니다. 정당 추천 없이 출마합니다.',
            term: '4년',
            votersPer: '유권자 1인당 1표'
        },
        councilProportional: {
            name: '광역의원 비례대표',
            count: 93,
            description: '시도의회 비례대표 선거',
            detail: '시·도의회 비례대표 의원을 선출합니다. 정당 투표를 통해 득표율에 비례하여 의석을 배분합니다.',
            term: '4년',
            votersPer: '유권자 1인당 1표 (정당투표)'
        },
        localCouncilProportional: {
            name: '기초의원 비례대표',
            count: 386,
            description: '시군구의회 비례대표 선거',
            detail: '시·군·구의회 비례대표 의원을 선출합니다. 정당 투표를 통해 득표율에 비례하여 의석을 배분합니다.',
            term: '4년',
            votersPer: '유권자 1인당 1표 (정당투표)'
        },
        byElection: {
            name: '재보궐선거',
            count: 6,
            description: '국회의원 보궐선거',
            detail: '공석이 된 6개 국회의원 지역구(인천 연수구갑, 인천 계양구을, 경기 평택시을, 경기 안산시갑, 충남 아산시을, 전북 군산·김제·부안갑)의 재보궐선거입니다.',
            term: '잔여 임기',
            votersPer: '유권자 1인당 1표'
        }
    };

    // 시군구 데이터 (#7 - 광역 클릭 시 시군구 목록)
    // 기준: 2022년 제8회 전국동시지방선거 당선 결과 (실제 데이터)
    // mayor: 현직 시군구청장 정보 (이름, 당적, 대행 여부)
    const subRegionData = {
        'seoul': [
            { name: '종로구', population: 148000, leadParty: 'ppp', mayor: { name: '정문헌', party: 'ppp' }, keyIssue: '도심 재생' ,
            voters: 129816,
            prevElection: { turnout: 54.4 } },
            { name: '중구', population: 125000, leadParty: 'ppp', mayor: { name: '김길성', party: 'ppp' }, keyIssue: '관광 활성화' ,
            voters: 112039,
            prevElection: { turnout: 53.8 } },
            { name: '용산구', population: 228000, leadParty: 'independent', mayor: { name: '박희영', party: 'independent' }, keyIssue: '용산공원 개발' ,
            voters: 199061,
            prevElection: { turnout: 52.6 } },
            { name: '성동구', population: 298000, leadParty: 'democratic', mayor: { name: null, party: 'independent', acting: true, actingReason: '정원오 서울시장 출마 사퇴 (2026.3)' }, keyIssue: '성수 도시재생' ,
            voters: 251990,
            prevElection: { turnout: 55.5 } },
            { name: '광진구', population: 345000, leadParty: 'ppp', mayor: { name: '김경호', party: 'ppp' }, keyIssue: '교통 개선' ,
            voters: 305462,
            prevElection: { turnout: 51.4 } },
            { name: '동대문구', population: 343000, leadParty: 'ppp', mayor: { name: '이필형', party: 'ppp' }, keyIssue: '패션산업 활성화' ,
            voters: 302024,
            prevElection: { turnout: 52.0 } },
            { name: '중랑구', population: 388000, leadParty: 'democratic', mayor: { name: '류경기', party: 'democratic' }, keyIssue: '주거 환경 개선' ,
            voters: 348762,
            prevElection: { turnout: 51.0 } },
            { name: '성북구', population: 427000, leadParty: 'democratic', mayor: { name: '이승로', party: 'democratic' }, keyIssue: '교육 인프라' ,
            voters: 379123,
            prevElection: { turnout: 53.3 } },
            { name: '강북구', population: 297000, leadParty: 'democratic', mayor: { name: '이순희', party: 'democratic' }, keyIssue: '균형 발전' ,
            voters: 268130,
            prevElection: { turnout: 49.7 } },
            { name: '도봉구', population: 316000, leadParty: 'ppp', mayor: { name: '오언석', party: 'ppp' }, keyIssue: '교통 접근성' ,
            voters: 280913,
            prevElection: { turnout: 52.9 } },
            { name: '노원구', population: 507000, leadParty: 'democratic', mayor: { name: '오승록', party: 'democratic' }, keyIssue: '교육·일자리' ,
            voters: 441748,
            prevElection: { turnout: 55.5 } },
            { name: '은평구', population: 465000, leadParty: 'democratic', mayor: { name: '김미경', party: 'democratic' }, keyIssue: '도시 재생' ,
            voters: 418387,
            prevElection: { turnout: 51.6 } },
            { name: '서대문구', population: 304000, leadParty: 'ppp', mayor: { name: '이성헌', party: 'ppp' }, keyIssue: '대학가 활성화' ,
            voters: 271718,
            prevElection: { turnout: 54.1 } },
            { name: '마포구', population: 368000, leadParty: 'ppp', mayor: { name: '박강수', party: 'ppp' }, keyIssue: '문화 산업' ,
            voters: 324528,
            prevElection: { turnout: 53.9 } },
            { name: '양천구', population: 448000, leadParty: 'ppp', mayor: { name: '이기재', party: 'ppp' }, keyIssue: '교육 특구' ,
            voters: 378444,
            prevElection: { turnout: 55.4 } },
            { name: '강서구', population: 565000, leadParty: 'democratic', mayor: { name: '진교훈', party: 'democratic' }, keyIssue: '마곡지구 개발' ,
            voters: 504606,
            prevElection: { turnout: 51.7 } },
            { name: '구로구', population: 396000, leadParty: 'democratic', mayor: { name: '장인홍', party: 'democratic' }, keyIssue: '디지털단지 재생' ,
            voters: 353697,
            prevElection: { turnout: 53.2 } },
            { name: '금천구', population: 229000, leadParty: 'democratic', mayor: { name: '유성훈', party: 'democratic' }, keyIssue: '산업 전환' ,
            voters: 212879,
            prevElection: { turnout: 49.7 } },
            { name: '영등포구', population: 388000, leadParty: 'ppp', mayor: { name: '최호권', party: 'ppp' }, keyIssue: '여의도 개발' ,
            voters: 340017,
            prevElection: { turnout: 53.3 } },
            { name: '동작구', population: 389000, leadParty: 'ppp', mayor: { name: '박일하', party: 'ppp' }, keyIssue: '주거 안정' ,
            voters: 344280,
            prevElection: { turnout: 54.4 } },
            { name: '관악구', population: 488000, leadParty: 'democratic', mayor: { name: '박준희', party: 'democratic' }, keyIssue: '청년 주거' ,
            voters: 450180,
            prevElection: { turnout: 50.4 } },
            { name: '서초구', population: 422000, leadParty: 'ppp', mayor: { name: '전성수', party: 'ppp' }, keyIssue: '교육·문화' ,
            voters: 342589,
            prevElection: { turnout: 56.0 } },
            { name: '강남구', population: 533000, leadParty: 'ppp', mayor: { name: '조성명', party: 'ppp' }, keyIssue: '도시 경쟁력' ,
            voters: 450895,
            prevElection: { turnout: 53.6 } },
            { name: '송파구', population: 655000, leadParty: 'ppp', mayor: { name: '서강석', party: 'ppp' }, keyIssue: '교통 인프라' ,
            voters: 569507,
            prevElection: { turnout: 55.0 } },
            { name: '강동구', population: 448000, leadParty: 'ppp', mayor: { name: '이수희', party: 'ppp' }, keyIssue: '신도시 개발' ,
            voters: 397544,
            prevElection: { turnout: 53.8 } }
        ],
        'busan': [
            { name: '중구', population: 40000, leadParty: 'ppp', mayor: { name: '최진봉', party: 'ppp' }, keyIssue: '원도심 재생' },
            { name: '서구', population: 99000, leadParty: 'ppp', mayor: { name: '공한수', party: 'ppp' }, keyIssue: '도심 활성화' ,
            voters: 93426,
            prevElection: { turnout: 50.4 } },
            { name: '동구', population: 81000, leadParty: 'ppp', mayor: { name: '김진홍', party: 'ppp' }, keyIssue: '항만 재개발' ,
            voters: 80869,
            prevElection: { turnout: 50.5 } },
            { name: '영도구', population: 105000, leadParty: 'ppp', mayor: { name: '김기재', party: 'ppp' }, keyIssue: '조선산업' ,
            voters: 99395,
            prevElection: { turnout: 50.5 } },
            { name: '부산진구', population: 352000, leadParty: 'ppp', mayor: { name: '김영욱', party: 'ppp' }, keyIssue: '서면 상권' ,
            voters: 313025,
            prevElection: { turnout: 47.6 } },
            { name: '동래구', population: 265000, leadParty: 'ppp', mayor: { name: '장준용', party: 'ppp' }, keyIssue: '전통시장' ,
            voters: 234034,
            prevElection: { turnout: 49.9 } },
            { name: '남구', population: 261000, leadParty: 'ppp', mayor: { name: '박재범', party: 'ppp' }, keyIssue: '유엔기념공원' ,
            voters: 227019,
            prevElection: { turnout: 52.2 } },
            { name: '북구', population: 277000, leadParty: 'ppp', mayor: { name: '오태원', party: 'ppp' }, keyIssue: '교통 개선' ,
            voters: 245787,
            prevElection: { turnout: 51.3 } },
            { name: '해운대구', population: 406000, leadParty: 'ppp', mayor: { name: '김성수', party: 'ppp' }, keyIssue: '관광 인프라' ,
            voters: 337958,
            prevElection: { turnout: 48.8 } },
            { name: '사하구', population: 305000, leadParty: 'ppp', mayor: { name: '이갑준', party: 'ppp' }, keyIssue: '낙동강 환경' ,
            voters: 268863,
            prevElection: { turnout: 47.1 } },
            { name: '금정구', population: 228000, leadParty: 'ppp', mayor: { name: '김재윤', party: 'ppp' }, keyIssue: '대학가 활성화' ,
            voters: 200445,
            prevElection: { turnout: 51.3 } },
            { name: '강서구', population: 120000, leadParty: 'ppp', mayor: { name: '김형찬', party: 'ppp' }, keyIssue: '가덕도 신공항' },
            { name: '연제구', population: 204000, leadParty: 'ppp', mayor: { name: '주석수', party: 'ppp' }, keyIssue: '행정중심' ,
            voters: 180173,
            prevElection: { turnout: 51.1 } },
            { name: '수영구', population: 170000, leadParty: 'democratic', mayor: { name: '유동철', party: 'democratic' }, keyIssue: '해양스포츠' ,
            voters: 156247,
            prevElection: { turnout: 47.9 } },
            { name: '사상구', population: 211000, leadParty: 'ppp', mayor: { name: '조병길', party: 'ppp' }, keyIssue: '산업단지 전환' ,
            voters: 184625,
            prevElection: { turnout: 47.5 } },
            { name: '기장군', population: 188000, leadParty: 'ppp', mayor: { name: '정원희', party: 'ppp' }, keyIssue: '신도시 개발' ,
            voters: 143871,
            prevElection: { turnout: 44.7 } }
        ],
        'daegu': [
            { name: '중구', population: 73000, leadParty: 'ppp', mayor: { name: '류규하', party: 'ppp' }, keyIssue: '원도심 재생' },
            { name: '동구', population: 337000, leadParty: 'ppp', mayor: { name: '윤석준', party: 'ppp' }, keyIssue: '혁신도시' },
            { name: '서구', population: 165000, leadParty: 'ppp', mayor: { name: '류한국', party: 'ppp' }, keyIssue: '산업 전환' },
            { name: '남구', population: 140000, leadParty: 'ppp', mayor: { name: '조재구', party: 'ppp' }, keyIssue: '앞산 관광' },
            { name: '북구', population: 428000, leadParty: 'ppp', mayor: { name: '배광식', party: 'ppp' }, keyIssue: '교통 인프라' },
            { name: '수성구', population: 421000, leadParty: 'ppp', mayor: { name: '김대권', party: 'ppp' }, keyIssue: '교육 특구' ,
            voters: 349048,
            prevElection: { turnout: 45.1 } },
            { name: '달서구', population: 551000, leadParty: 'ppp', mayor: { name: '이태훈', party: 'ppp' }, keyIssue: '성서산단 전환' },
            { name: '달성군', population: 270000, leadParty: 'ppp', mayor: { name: '최재훈', party: 'ppp' }, keyIssue: '테크노폴리스' ,
            voters: 214580,
            prevElection: { turnout: 42.6 } }
        ],
        'incheon': [
            { name: '중구', population: 120000, leadParty: 'ppp', mayor: { name: '김정헌', party: 'ppp' }, keyIssue: '차이나타운 관광' },
            { name: '동구', population: 63000, leadParty: 'ppp', mayor: { name: '김찬진', party: 'ppp' }, keyIssue: '원도심 재생' },
            { name: '미추홀구', population: 384000, leadParty: 'ppp', mayor: { name: '이영훈', party: 'ppp' }, keyIssue: '주거 재정비' ,
            voters: 358612,
            prevElection: { turnout: 44.7 } },
            { name: '연수구', population: 374000, leadParty: 'ppp', mayor: { name: '이재호', party: 'ppp' }, keyIssue: '송도 국제도시' ,
            voters: 317883,
            prevElection: { turnout: 51.7 } },
            { name: '남동구', population: 512000, leadParty: 'ppp', mayor: { name: '박종효', party: 'ppp' }, keyIssue: '산업단지 혁신' ,
            voters: 441226,
            prevElection: { turnout: 48.1 } },
            { name: '부평구', population: 492000, leadParty: 'democratic', mayor: { name: '차준택', party: 'democratic' }, keyIssue: '지역경제 활성화' ,
            voters: 426463,
            prevElection: { turnout: 47.5 } },
            { name: '계양구', population: 290000, leadParty: 'democratic', mayor: { name: '윤환', party: 'democratic' }, keyIssue: '신도시 개발' ,
            voters: 258156,
            prevElection: { turnout: 56.1 } },
            { name: '서구', population: 550000, leadParty: 'ppp', mayor: { name: '강범석', party: 'ppp' }, keyIssue: '청라 국제도시' },
            { name: '강화군', population: 65000, leadParty: 'independent', mayor: { name: '유천호', party: 'independent' }, keyIssue: '접경지역 발전' ,
            voters: 63147,
            prevElection: { turnout: 61.9 } },
            { name: '옹진군', population: 20000, leadParty: 'ppp', mayor: { name: '문경복', party: 'ppp' }, keyIssue: '섬 지역 발전' ,
            voters: 18895,
            prevElection: { turnout: 67.2 } }
        ],
        'gwangju': [
            { name: '동구', population: 92000, leadParty: 'democratic', mayor: { name: '임택', party: 'democratic' }, keyIssue: '문화전당 활성화' },
            { name: '서구', population: 283000, leadParty: 'democratic', mayor: { name: '김이강', party: 'democratic' }, keyIssue: '상무지구 발전' },
            { name: '남구', population: 197000, leadParty: 'democratic', mayor: { name: '김병내', party: 'democratic' }, keyIssue: '양림동 재생' },
            { name: '북구', population: 425000, leadParty: 'democratic', mayor: { name: '문인', party: 'democratic' }, keyIssue: '첨단과학단지' },
            { name: '광산구', population: 404000, leadParty: 'democratic', mayor: { name: '박병규', party: 'democratic' }, keyIssue: '하남산단 전환' }
        ],
        'daejeon': [
            { name: '동구', population: 218000, leadParty: 'ppp', mayor: { name: '박희조', party: 'ppp' }, keyIssue: '대전역세권 개발' },
            { name: '중구', population: 230000, leadParty: 'democratic', mayor: { name: '김제선', party: 'democratic' }, keyIssue: '원도심 활성화' },
            { name: '서구', population: 470000, leadParty: 'ppp', mayor: { name: '서철모', party: 'ppp' }, keyIssue: '둔산 도심 혁신' },
            { name: '유성구', population: 370000, leadParty: 'democratic', mayor: { name: '정용래', party: 'democratic' }, keyIssue: '과학벨트' ,
            voters: 289980,
            prevElection: { turnout: 51.6 } },
            { name: '대덕구', population: 178000, leadParty: 'ppp', mayor: { name: '최충규', party: 'ppp' }, keyIssue: '대덕연구단지' ,
            voters: 152766,
            prevElection: { turnout: 49.8 } }
        ],
        'ulsan': [
            { name: '중구', population: 217000, leadParty: 'ppp', mayor: { name: '김영길', party: 'ppp' }, keyIssue: '도심 재생 및 상권 활성화' },
            { name: '남구', population: 335000, leadParty: 'ppp', mayor: { name: '서동욱', party: 'ppp' }, keyIssue: '석유화학 산업 전환' },
            { name: '동구', population: 94000, leadParty: 'progressive', mayor: { name: null, party: 'independent', acting: true, actingReason: '김종훈 울산시장 출마 사퇴 (2026.1)' }, keyIssue: '조선업 구조조정' },
            { name: '북구', population: 197000, leadParty: 'ppp', mayor: { name: '박천동', party: 'ppp' }, keyIssue: '자동차 산업 클러스터' },
            { name: '울주군', population: 277000, leadParty: 'ppp', mayor: { name: '이순걸', party: 'ppp' }, keyIssue: '원전 안전 및 지역 발전' ,
            voters: 189051,
            prevElection: { turnout: 52.6 } }
        ],
        'sejong': [
            { name: '세종시', population: 380000, leadParty: 'ppp', mayor: { name: '최민호', party: 'ppp' }, keyIssue: '행정수도 완성 및 인프라 확충' }
        ],
        'jeju': [
            { name: '제주시', population: 493000, leadParty: 'ppp', mayor: { name: '이상봉', party: 'ppp' }, keyIssue: '관광 혁신' },
            { name: '서귀포시', population: 183000, leadParty: 'ppp', mayor: { name: '이종우', party: 'ppp' }, keyIssue: '감귤산업·관광' }
        ],
        'gangwon': [
            { name: '춘천시', population: 285000, leadParty: 'democratic', mayor: { name: '육동한', party: 'democratic' }, keyIssue: '관광 인프라 확대' ,
            voters: 244406,
            prevElection: { turnout: 56.4 } },
            { name: '원주시', population: 360000, leadParty: 'ppp', mayor: { name: '원강수', party: 'ppp' }, keyIssue: '혁신도시 활성화' ,
            voters: 304060,
            prevElection: { turnout: 51.8 } },
            { name: '강릉시', population: 213000, leadParty: 'ppp', mayor: { name: '김홍규', party: 'ppp' }, keyIssue: '관광 산업 육성' ,
            voters: 185804,
            prevElection: { turnout: 54.9 } },
            { name: '동해시', population: 90000, leadParty: 'ppp', mayor: { name: '심규언', party: 'ppp' }, keyIssue: '항만 물류 발전' ,
            voters: 76886,
            prevElection: { turnout: 54.7 } },
            { name: '태백시', population: 42000, leadParty: 'ppp', mayor: { name: '이상호', party: 'ppp' }, keyIssue: '폐광 지역 경제 전환' ,
            voters: 35236,
            prevElection: { turnout: 64.0 } },
            { name: '속초시', population: 82000, leadParty: 'ppp', mayor: { name: '이병선', party: 'ppp' }, keyIssue: '관광 특구 개발' ,
            voters: 71621,
            prevElection: { turnout: 51.8 } },
            { name: '삼척시', population: 65000, leadParty: 'ppp', mayor: { name: '박상수', party: 'ppp' }, keyIssue: '해양 자원 개발' ,
            voters: 57023,
            prevElection: { turnout: 65.8 } },
            { name: '홍천군', population: 68000, leadParty: 'ppp', mayor: { name: '신영재', party: 'ppp' }, keyIssue: '농촌 고령화 대책' ,
            voters: 60743,
            prevElection: { turnout: 60.8 } },
            { name: '횡성군', population: 44000, leadParty: 'ppp', mayor: { name: '김명기', party: 'ppp' }, keyIssue: '한우 산업 지원' ,
            voters: 41777,
            prevElection: { turnout: 66.4 } },
            { name: '영월군', population: 38000, leadParty: 'ppp', mayor: { name: '최명서', party: 'ppp' }, keyIssue: '폐광 지역 재생' ,
            voters: 34371,
            prevElection: { turnout: 66.3 } },
            { name: '평창군', population: 41000, leadParty: 'ppp', mayor: { name: '심재국', party: 'ppp' }, keyIssue: '올림픽 유산 활용' ,
            voters: 37372,
            prevElection: { turnout: 67.9 } },
            { name: '정선군', population: 35000, leadParty: 'democratic', mayor: { name: '최승준', party: 'democratic' }, keyIssue: '카지노 지역 경제' ,
            voters: 32001,
            prevElection: { turnout: 69.0 } },
            { name: '철원군', population: 44000, leadParty: 'ppp', mayor: { name: '이현종', party: 'ppp' }, keyIssue: '접경 지역 개발' ,
            voters: 37099,
            prevElection: { turnout: 60.5 } },
            { name: '화천군', population: 25000, leadParty: 'ppp', mayor: { name: '최문순', party: 'ppp' }, keyIssue: '군사시설 보호구역 해제' ,
            voters: 21055,
            prevElection: { turnout: 65.7 } },
            { name: '양구군', population: 22000, leadParty: 'ppp', mayor: { name: '서흥원', party: 'ppp' }, keyIssue: '접경 지역 지원' ,
            voters: 18552,
            prevElection: { turnout: 69.0 } },
            { name: '인제군', population: 31000, leadParty: 'democratic', mayor: { name: '최상기', party: 'democratic' }, keyIssue: '생태관광 개발' ,
            voters: 27939,
            prevElection: { turnout: 66.4 } },
            { name: '고성군', population: 27000, leadParty: 'democratic', mayor: { name: '함명준', party: 'democratic' }, keyIssue: '금강산 관광 재개' ,
            voters: 24776,
            prevElection: { turnout: 67.7 } },
            { name: '양양군', population: 27000, leadParty: 'ppp', mayor: { name: '김진하', party: 'ppp' }, keyIssue: '서핑 관광 활성화' ,
            voters: 25359,
            prevElection: { turnout: 65.7 } }
        ],
        'chungbuk': [
            { name: '청주시', population: 855000, leadParty: 'ppp', mayor: { name: '이범석', party: 'ppp' }, keyIssue: '반도체 클러스터 유치' ,
            voters: 712524,
            prevElection: { turnout: 46.4 } },
            { name: '충주시', population: 210000, leadParty: 'ppp', mayor: { name: null, party: 'independent', acting: true, actingReason: '조길형 충북도지사 출마 사퇴 (2026.1)' }, keyIssue: '기업도시 활성화' ,
            voters: 181044,
            prevElection: { turnout: 49.6 } },
            { name: '제천시', population: 132000, leadParty: 'ppp', mayor: { name: '김창규', party: 'ppp' }, keyIssue: '바이오 산업 육성' ,
            voters: 115563,
            prevElection: { turnout: 54.3 } },
            { name: '보은군', population: 32000, leadParty: 'ppp', mayor: { name: '최재형', party: 'ppp' }, keyIssue: '농촌 인구 감소 대책' ,
            voters: 28963,
            prevElection: { turnout: 67.5 } },
            { name: '옥천군', population: 51000, leadParty: 'democratic', mayor: { name: '황규철', party: 'democratic' }, keyIssue: '교통 인프라 개선' ,
            voters: 44686,
            prevElection: { turnout: 64.6 } },
            { name: '영동군', population: 44000, leadParty: 'ppp', mayor: { name: '정영철', party: 'ppp' }, keyIssue: '포도 산업 지원' ,
            voters: 41123,
            prevElection: { turnout: 66.0 } },
            { name: '증평군', population: 38000, leadParty: 'democratic', mayor: { name: '이재영', party: 'democratic' }, keyIssue: '산업단지 확장' ,
            voters: 31366,
            prevElection: { turnout: 54.3 } },
            { name: '진천군', population: 85000, leadParty: 'democratic', mayor: { name: null, party: 'independent', acting: true, actingReason: '송기섭 충북도지사 출마 사퇴 (2026.2)' }, keyIssue: '혁신도시 정주 환경' ,
            voters: 71725,
            prevElection: { turnout: 48.2 } },
            { name: '괴산군', population: 36000, leadParty: 'ppp', mayor: { name: '송인헌', party: 'ppp' }, keyIssue: '유기농 특구 발전' ,
            voters: 34674,
            prevElection: { turnout: 68.4 } },
            { name: '음성군', population: 95000, leadParty: 'democratic', mayor: { name: '조병옥', party: 'democratic' }, keyIssue: '산업단지 교통 개선' ,
            voters: 81419,
            prevElection: { turnout: 49.9 } },
            { name: '단양군', population: 29000, leadParty: 'ppp', mayor: { name: '김문근', party: 'ppp' }, keyIssue: '관광 자원 개발' ,
            voters: 25692,
            prevElection: { turnout: 67.8 } }
        ],
        'chungnam': [
            { name: '천안시', population: 660000, leadParty: 'ppp', mayor: { name: null, party: 'independent', acting: true, actingReason: '박상돈 시장 당선무효 (2025.4)' }, keyIssue: '수도권 연계 교통망' ,
            voters: 548022,
            prevElection: { turnout: 42.2 } },
            { name: '공주시', population: 106000, leadParty: 'ppp', mayor: { name: '최원철', party: 'ppp' }, keyIssue: '백제 문화유산 활용' ,
            voters: 91847,
            prevElection: { turnout: 56.0 } },
            { name: '보령시', population: 100000, leadParty: 'ppp', mayor: { name: '김동일', party: 'ppp' }, keyIssue: '석탄화력 전환 대책' ,
            voters: 86264,
            prevElection: { turnout: 60.9 } },
            { name: '아산시', population: 340000, leadParty: 'democratic', mayor: { name: '오세현', party: 'democratic' }, keyIssue: '반도체 산업 인프라' ,
            voters: 268765,
            prevElection: { turnout: 44.4 } },
            { name: '서산시', population: 175000, leadParty: 'ppp', mayor: { name: '이완섭', party: 'ppp' }, keyIssue: '석유화학 산업 환경' ,
            voters: 148744,
            prevElection: { turnout: 48.6 } },
            { name: '논산시', population: 118000, leadParty: 'ppp', mayor: { name: '백성현', party: 'ppp' }, keyIssue: '군부대 이전 대책' ,
            voters: 99942,
            prevElection: { turnout: 53.8 } },
            { name: '계룡시', population: 44000, leadParty: 'ppp', mayor: { name: '이응우', party: 'ppp' }, keyIssue: '군사도시 자족기능' ,
            voters: 34875,
            prevElection: { turnout: 55.4 } },
            { name: '당진시', population: 168000, leadParty: 'ppp', mayor: { name: '오성환', party: 'ppp' }, keyIssue: '제철소 환경 문제' ,
            voters: 140008,
            prevElection: { turnout: 46.3 } },
            { name: '금산군', population: 51000, leadParty: 'ppp', mayor: { name: '박범인', party: 'ppp' }, keyIssue: '인삼 산업 글로벌화' ,
            voters: 44747,
            prevElection: { turnout: 64.1 } },
            { name: '부여군', population: 63000, leadParty: 'democratic', mayor: { name: '박정현', party: 'democratic' }, keyIssue: '백제 역사 관광' ,
            voters: 57322,
            prevElection: { turnout: 63.6 } },
            { name: '서천군', population: 51000, leadParty: 'ppp', mayor: { name: '김기웅', party: 'ppp' }, keyIssue: '해양 생태 보전' ,
            voters: 45864,
            prevElection: { turnout: 63.8 } },
            { name: '청양군', population: 30000, leadParty: 'democratic', mayor: { name: '김돈곤', party: 'democratic' }, keyIssue: '농촌 인구 유입' ,
            voters: 27932,
            prevElection: { turnout: 70.5 } },
            { name: '홍성군', population: 89000, leadParty: 'ppp', mayor: { name: '이용록', party: 'ppp' }, keyIssue: '내포신도시 개발' ,
            voters: 84260,
            prevElection: { turnout: 54.3 } },
            { name: '예산군', population: 79000, leadParty: 'ppp', mayor: { name: '최재구', party: 'ppp' }, keyIssue: '농업 기반 경제' ,
            voters: 69069,
            prevElection: { turnout: 56.1 } },
            { name: '태안군', population: 47000, leadParty: 'democratic', mayor: { name: '가세로', party: 'democratic' }, keyIssue: '해양 환경 복원' ,
            voters: 55435,
            prevElection: { turnout: 62.6 } }
        ],
        'jeonbuk': [
            { name: '전주시', population: 658000, leadParty: 'democratic', mayor: { name: '우범기', party: 'democratic' }, keyIssue: '탄소 산업 전환' ,
            voters: 550442,
            prevElection: { turnout: 40.4 } },
            { name: '군산시', population: 265000, leadParty: 'democratic', mayor: { name: '강임준', party: 'democratic' }, keyIssue: '산업단지 구조조정' ,
            voters: 224926,
            prevElection: { turnout: 38.7 } },
            { name: '익산시', population: 285000, leadParty: 'democratic', mayor: { name: '정헌율', party: 'democratic' }, keyIssue: '보석산업 활성화' ,
            voters: 239077,
            prevElection: { turnout: 44.9 } },
            { name: '정읍시', population: 108000, leadParty: 'democratic', mayor: { name: '이학수', party: 'democratic' }, keyIssue: '방사광 가속기 활용' ,
            voters: 93307,
            prevElection: { turnout: 58.2 } },
            { name: '남원시', population: 78000, leadParty: 'democratic', mayor: { name: '최경식', party: 'democratic' }, keyIssue: '관광 문화 도시' ,
            voters: 69007,
            prevElection: { turnout: 64.5 } },
            { name: '김제시', population: 83000, leadParty: 'democratic', mayor: { name: '정성주', party: 'democratic' }, keyIssue: '농업 스마트화' ,
            voters: 72358,
            prevElection: { turnout: 59.0 } },
            { name: '완주군', population: 97000, leadParty: 'democratic', mayor: { name: '유희태', party: 'democratic' }, keyIssue: '혁신도시 연계 발전' ,
            voters: 78284,
            prevElection: { turnout: 52.9 } },
            { name: '진안군', population: 24000, leadParty: 'democratic', mayor: { name: '전춘성', party: 'democratic' }, keyIssue: '고원 관광 개발' ,
            voters: 22634,
            prevElection: { turnout: 73.4 } },
            { name: '무주군', population: 23000, leadParty: 'independent', mayor: { name: '황인홍', party: 'independent' }, keyIssue: '리조트 관광 활성화' ,
            voters: 21279,
            prevElection: { turnout: 76.4 } },
            { name: '장수군', population: 21000, leadParty: 'democratic', mayor: { name: '최훈식', party: 'democratic' }, keyIssue: '농촌 체류형 관광' ,
            voters: 19380,
            prevElection: { turnout: 75.3 } },
            { name: '임실군', population: 27000, leadParty: 'independent', mayor: { name: '심민', party: 'independent' }, keyIssue: '치즈 산업 특화' ,
            voters: 24346,
            prevElection: { turnout: 72.4 } },
            { name: '순창군', population: 26000, leadParty: 'independent', mayor: { name: '최영일', party: 'independent' }, keyIssue: '장류 산업 육성' ,
            voters: 23898,
            prevElection: { turnout: 77.8 } },
            { name: '고창군', population: 53000, leadParty: 'democratic', mayor: { name: '심덕섭', party: 'democratic' }, keyIssue: '유네스코 생물권 보전' ,
            voters: 47581,
            prevElection: { turnout: 72.9 } },
            { name: '부안군', population: 52000, leadParty: 'democratic', mayor: { name: '권익현', party: 'democratic' }, keyIssue: '새만금 개발 사업' ,
            voters: 45614,
            prevElection: { turnout: 60.3 } }
        ],
        'jeonnam': [
            { name: '목포시', population: 218000, leadParty: 'democratic', mayor: { name: '박홍률', party: 'democratic' }, keyIssue: '원도심 재생 사업' ,
            voters: 183412,
            prevElection: { turnout: 52.9 } },
            { name: '여수시', population: 278000, leadParty: 'democratic', mayor: { name: '정기명', party: 'democratic' }, keyIssue: '석유화학 환경 관리' ,
            voters: 236881,
            prevElection: { turnout: 46.1 } },
            { name: '순천시', population: 282000, leadParty: 'independent', mayor: { name: '노관규', party: 'independent' }, keyIssue: '생태수도 조성' ,
            voters: 235432,
            prevElection: { turnout: 54.4 } },
            { name: '나주시', population: 115000, leadParty: 'democratic', mayor: { name: '윤병태', party: 'democratic' }, keyIssue: '에너지 신산업 클러스터' ,
            voters: 98951,
            prevElection: { turnout: 53.6 } },
            { name: '광양시', population: 155000, leadParty: 'independent', mayor: { name: '정인화', party: 'independent' }, keyIssue: '제철소 탄소중립' ,
            voters: 126604,
            prevElection: { turnout: 54.6 } },
            { name: '담양군', population: 46000, leadParty: 'reform', mayor: { name: '정철원', party: 'reform' }, keyIssue: '대나무 생태 관광' ,
            voters: 41720,
            prevElection: { turnout: 63.8 } },
            { name: '곡성군', population: 27000, leadParty: 'democratic', mayor: { name: '이상철', party: 'democratic' }, keyIssue: '기차마을 관광' ,
            voters: 25196,
            prevElection: { turnout: 74.0 } },
            { name: '구례군', population: 25000, leadParty: 'democratic', mayor: { name: '김순호', party: 'democratic' }, keyIssue: '지리산 생태 관광' ,
            voters: 22848,
            prevElection: { turnout: 76.2 } },
            { name: '고흥군', population: 62000, leadParty: 'democratic', mayor: { name: '공영민', party: 'democratic' }, keyIssue: '우주항공 산업 육성' ,
            voters: 57371,
            prevElection: { turnout: 77.9 } },
            { name: '보성군', population: 39000, leadParty: 'democratic', mayor: { name: '김철우', party: 'democratic' }, keyIssue: '녹차 산업 활성화' },
            { name: '화순군', population: 62000, leadParty: 'democratic', mayor: { name: '구복규', party: 'democratic' }, keyIssue: '고인돌 유적 활용' ,
            voters: 55284,
            prevElection: { turnout: 58.7 } },
            { name: '장흥군', population: 35000, leadParty: 'democratic', mayor: { name: '김성', party: 'democratic' }, keyIssue: '통합의학 특구' ,
            voters: 32510,
            prevElection: { turnout: 71.5 } },
            { name: '강진군', population: 33000, leadParty: 'independent', mayor: { name: '강진원', party: 'independent' }, keyIssue: '도자기 문화 관광' ,
            voters: 30148,
            prevElection: { turnout: 72.8 } },
            { name: '해남군', population: 68000, leadParty: 'democratic', mayor: { name: '명현관', party: 'democratic' }, keyIssue: '해양에너지 개발' },
            { name: '영암군', population: 54000, leadParty: 'democratic', mayor: { name: '우승희', party: 'democratic' }, keyIssue: 'F1 경기장 활용' ,
            voters: 46851,
            prevElection: { turnout: 61.2 } },
            { name: '무안군', population: 92000, leadParty: 'independent', mayor: { name: '김산', party: 'independent' }, keyIssue: '공항 연계 개발' ,
            voters: 74895,
            prevElection: { turnout: 55.2 } },
            { name: '함평군', population: 31000, leadParty: 'democratic', mayor: { name: '이상익', party: 'democratic' }, keyIssue: '나비축제 관광' ,
            voters: 28381,
            prevElection: { turnout: 64.2 } },
            { name: '영광군', population: 53000, leadParty: 'independent', mayor: { name: '강종만', party: 'independent' }, keyIssue: '원전 해체 대책' ,
            voters: 45299,
            prevElection: { turnout: 70.2 } },
            { name: '장성군', population: 43000, leadParty: 'democratic', mayor: { name: '김한종', party: 'democratic' }, keyIssue: '교육 특구 조성' ,
            voters: 38470,
            prevElection: { turnout: 68.9 } },
            { name: '완도군', population: 47000, leadParty: 'democratic', mayor: { name: '신우철', party: 'democratic' }, keyIssue: '해조류 산업 수출' ,
            voters: 42697,
            prevElection: { turnout: 69.8 } },
            { name: '진도군', population: 30000, leadParty: 'independent', mayor: { name: '김희수', party: 'independent' }, keyIssue: '해양문화 관광' ,
            voters: 26748,
            prevElection: { turnout: 76.3 } },
            { name: '신안군', population: 38000, leadParty: 'independent', mayor: { name: '박우량', party: 'independent' }, keyIssue: '태양광 섬 에너지' ,
            voters: 35246,
            prevElection: { turnout: 74.9 } }
        ],
        'gyeongbuk': [
            { name: '포항시', population: 502000, leadParty: 'ppp', mayor: { name: null, party: 'independent', acting: true, actingReason: '이강덕 경북도지사 출마 사퇴 (2026.2)' }, keyIssue: '지진 피해 복구 및 안전' ,
            voters: 427687,
            prevElection: { turnout: 45.9 } },
            { name: '경주시', population: 254000, leadParty: 'ppp', mayor: { name: '주낙영', party: 'ppp' }, keyIssue: '문화유산 관광 활성화' ,
            voters: 220490,
            prevElection: { turnout: 49.7 } },
            { name: '김천시', population: 140000, leadParty: 'ppp', mayor: { name: '배낙호', party: 'ppp' }, keyIssue: '교통 허브 도시' ,
            voters: 120471,
            prevElection: { turnout: 55.8 } },
            { name: '안동시', population: 158000, leadParty: 'ppp', mayor: { name: '권기창', party: 'ppp' }, keyIssue: '전통문화 수도 조성' ,
            voters: 135862,
            prevElection: { turnout: 54.9 } },
            { name: '구미시', population: 412000, leadParty: 'ppp', mayor: { name: '김장호', party: 'ppp' }, keyIssue: '전자산업 구조 전환' ,
            voters: 337510,
            prevElection: { turnout: 42.8 } },
            { name: '영주시', population: 103000, leadParty: 'ppp', mayor: { name: null, party: 'independent', acting: true, actingReason: '박남서 시장 당선무효 (2025.3)' }, keyIssue: '소백산 관광 개발' ,
            voters: 89061,
            prevElection: { turnout: 63.2 } },
            { name: '영천시', population: 100000, leadParty: 'independent', mayor: { name: '최기문', party: 'independent' }, keyIssue: '농업 첨단화' ,
            voters: 90932,
            prevElection: { turnout: 56.9 } },
            { name: '상주시', population: 96000, leadParty: 'ppp', mayor: { name: '강영석', party: 'ppp' }, keyIssue: '농촌 인구 감소' ,
            voters: 84980,
            prevElection: { turnout: 64.0 } },
            { name: '문경시', population: 70000, leadParty: 'ppp', mayor: { name: '신현국', party: 'ppp' }, keyIssue: '옛길 관광 자원화' ,
            voters: 64160,
            prevElection: { turnout: 62.9 } },
            { name: '경산시', population: 280000, leadParty: 'ppp', mayor: { name: '조현일', party: 'ppp' }, keyIssue: '대구 연계 교통망' ,
            voters: 230676,
            prevElection: { turnout: 43.4 } },
            { name: '의성군', population: 50000, leadParty: 'independent', mayor: { name: '김주수', party: 'independent' }, keyIssue: '마늘 산업 지원' ,
            voters: 47168,
            prevElection: { turnout: 74.1 } },
            { name: '청송군', population: 24000, leadParty: 'ppp', mayor: { name: '윤경희', party: 'ppp' }, keyIssue: '지질공원 관광' ,
            voters: 22790,
            prevElection: { turnout: 73.9 } },
            { name: '영양군', population: 16000, leadParty: 'ppp', mayor: { name: '오도창', party: 'ppp' }, keyIssue: '고추 산업 보호' ,
            voters: 14920,
            prevElection: { turnout: 77.3 } },
            { name: '영덕군', population: 35000, leadParty: 'ppp', mayor: { name: '김광열', party: 'ppp' }, keyIssue: '대게 어업 지원' ,
            voters: 32124,
            prevElection: { turnout: 67.1 } },
            { name: '청도군', population: 42000, leadParty: 'ppp', mayor: { name: '김하수', party: 'ppp' }, keyIssue: '소싸움 축제 관광' ,
            voters: 38574,
            prevElection: { turnout: 70.8 } },
            { name: '고령군', population: 33000, leadParty: 'ppp', mayor: { name: '이남철', party: 'ppp' }, keyIssue: '대가야 역사 관광' ,
            voters: 27757,
            prevElection: { turnout: 62.8 } },
            { name: '성주군', population: 44000, leadParty: 'ppp', mayor: { name: '이병환', party: 'ppp' }, keyIssue: '참외 산업 수출' ,
            voters: 39451,
            prevElection: { turnout: 67.5 } },
            { name: '칠곡군', population: 120000, leadParty: 'ppp', mayor: { name: '김재욱', party: 'ppp' }, keyIssue: '산업단지 교통' ,
            voters: 96081,
            prevElection: { turnout: 43.7 } },
            { name: '예천군', population: 55000, leadParty: 'ppp', mayor: { name: '김학동', party: 'ppp' }, keyIssue: '곤충산업 특구' },
            { name: '봉화군', population: 31000, leadParty: 'ppp', mayor: { name: '박현국', party: 'ppp' }, keyIssue: '산촌 생태 관광' ,
            voters: 27996,
            prevElection: { turnout: 67.4 } },
            { name: '울진군', population: 48000, leadParty: 'ppp', mayor: { name: '손병복', party: 'ppp' }, keyIssue: '원전 지역 발전' ,
            voters: 42063,
            prevElection: { turnout: 67.3 } },
            { name: '울릉군', population: 9000, leadParty: 'independent', mayor: { name: '남한권', party: 'independent' }, keyIssue: '독도 영토 관리' ,
            voters: 8339,
            prevElection: { turnout: 81.5 } },
            { name: '군위군', population: 22000, leadParty: 'ppp', mayor: { name: '김진열', party: 'ppp' }, keyIssue: '대구 편입 후 발전' ,
            voters: 22054,
            prevElection: { turnout: 80.9 } }
        ],
        'gyeongnam': [
            { name: '창원시', population: 1040000, leadParty: 'ppp', mayor: { name: '김종양', party: 'ppp' }, keyIssue: '기계산업 스마트 전환' ,
            voters: 874558,
            prevElection: { turnout: 51.7 } },
            { name: '진주시', population: 350000, leadParty: 'ppp', mayor: { name: '조규일', party: 'ppp' }, keyIssue: '항공 산업 클러스터' ,
            voters: 292168,
            prevElection: { turnout: 53.1 } },
            { name: '통영시', population: 128000, leadParty: 'ppp', mayor: { name: '천영기', party: 'ppp' }, keyIssue: '해양 관광 도시' ,
            voters: 106064,
            prevElection: { turnout: 57.7 } },
            { name: '사천시', population: 112000, leadParty: 'ppp', mayor: { name: '박동식', party: 'ppp' }, keyIssue: '항공우주 산업 육성' ,
            voters: 93946,
            prevElection: { turnout: 59.1 } },
            { name: '김해시', population: 540000, leadParty: 'ppp', mayor: { name: '홍태용', party: 'ppp' }, keyIssue: '부산 연계 교통망' ,
            voters: 444484,
            prevElection: { turnout: 45.8 } },
            { name: '밀양시', population: 105000, leadParty: 'ppp', mayor: { name: '안병태', party: 'ppp' }, keyIssue: '송전탑 갈등 해결' ,
            voters: 92419,
            prevElection: { turnout: 54.7 } },
            { name: '거제시', population: 230000, leadParty: 'democratic', mayor: { name: '변광용', party: 'democratic' }, keyIssue: '조선업 경기 회복' ,
            voters: 193369,
            prevElection: { turnout: 51.4 } },
            { name: '양산시', population: 360000, leadParty: 'ppp', mayor: { name: '나동연', party: 'ppp' }, keyIssue: '부산 베드타운 인프라' ,
            voters: 294411,
            prevElection: { turnout: 47.0 } },
            { name: '의령군', population: 26000, leadParty: 'independent', mayor: { name: '오태완', party: 'independent' }, keyIssue: '농촌 소멸 위기 대응' ,
            voters: 24291,
            prevElection: { turnout: 75.0 } },
            { name: '함안군', population: 64000, leadParty: 'ppp', mayor: { name: '조근제', party: 'ppp' }, keyIssue: '아라가야 역사 관광' ,
            voters: 54125,
            prevElection: { turnout: 59.3 } },
            { name: '창녕군', population: 60000, leadParty: 'ppp', mayor: { name: '성낙인', party: 'ppp' }, keyIssue: '우포늪 생태 관광' ,
            voters: 53616,
            prevElection: { turnout: 64.1 } },
            { name: '고성군', population: 52000, leadParty: 'ppp', mayor: { name: '이상근', party: 'ppp' }, keyIssue: '공룡 화석 관광' },
            { name: '남해군', population: 42000, leadParty: 'democratic', mayor: { name: '장충남', party: 'democratic' }, keyIssue: '독일마을 관광 개발' ,
            voters: 38538,
            prevElection: { turnout: 70.6 } },
            { name: '하동군', population: 45000, leadParty: 'independent', mayor: { name: '하승철', party: 'independent' }, keyIssue: '녹차 재배 산업' ,
            voters: 39428,
            prevElection: { turnout: 73.8 } },
            { name: '산청군', population: 34000, leadParty: 'ppp', mayor: { name: '이승화', party: 'ppp' }, keyIssue: '한방 산업 특구' ,
            voters: 31488,
            prevElection: { turnout: 69.6 } },
            { name: '함양군', population: 38000, leadParty: 'independent', mayor: { name: '진병영', party: 'independent' }, keyIssue: '산삼 항노화 산업' ,  /* 무소속 당선 후 2024.3 국민의힘 복당 */
            voters: 34399,
            prevElection: { turnout: 75.6 } },
            { name: '거창군', population: 61000, leadParty: 'ppp', mayor: { name: '구인모', party: 'ppp' }, keyIssue: '사과 산업 지원' ,
            voters: 52803,
            prevElection: { turnout: 65.8 } },
            { name: '합천군', population: 43000, leadParty: 'ppp', mayor: { name: '김윤철', party: 'ppp' }, keyIssue: '해인사 문화 관광' ,
            voters: 39435,
            prevElection: { turnout: 69.4 } }
        ],
        'gyeonggi': [
            { name: '수원시', population: 1184000, leadParty: 'democratic', mayor: { name: '이재준', party: 'democratic' }, keyIssue: '교통 혁신' ,
            voters: 1012553,
            prevElection: { turnout: 51.3 } },
            { name: '성남시', population: 927000, leadParty: 'ppp', mayor: { name: '신상진', party: 'ppp' }, keyIssue: '판교 테크노밸리' ,
            voters: 798508,
            prevElection: { turnout: 56.6 } },
            { name: '의정부시', population: 458000, leadParty: 'ppp', mayor: { name: '김동근', party: 'ppp' }, keyIssue: '교통 개선' ,
            voters: 400177,
            prevElection: { turnout: 47.0 } },
            { name: '안양시', population: 553000, leadParty: 'democratic', mayor: { name: '최대호', party: 'democratic' }, keyIssue: '도시재생' ,
            voters: 474037,
            prevElection: { turnout: 56.3 } },
            { name: '부천시', population: 815000, leadParty: 'democratic', mayor: { name: '조용익', party: 'democratic' }, keyIssue: '문화 도시' ,
            voters: 702974,
            prevElection: { turnout: 49.4 } },
            { name: '광명시', population: 293000, leadParty: 'democratic', mayor: { name: '박승원', party: 'democratic' }, keyIssue: '광명역세권' ,
            voters: 247233,
            prevElection: { turnout: 56.5 } },
            { name: '평택시', population: 570000, leadParty: 'democratic', mayor: { name: '정장선', party: 'democratic' }, keyIssue: '미군기지 이전' ,
            voters: 478356,
            prevElection: { turnout: 43.5 } },
            { name: '동두천시', population: 95000, leadParty: 'ppp', mayor: { name: '박형덕', party: 'ppp' }, keyIssue: '지역 활성화' ,
            voters: 81074,
            prevElection: { turnout: 49.0 } },
            { name: '안산시', population: 650000, leadParty: 'ppp', mayor: { name: '이민근', party: 'ppp' }, keyIssue: '다문화 정책' ,
            voters: 571619,
            prevElection: { turnout: 45.6 } },
            { name: '고양시', population: 1077000, leadParty: 'ppp', mayor: { name: '이동환', party: 'ppp' }, keyIssue: 'GTX 개통' ,
            voters: 924690,
            prevElection: { turnout: 52.3 } },
            { name: '과천시', population: 72000, leadParty: 'ppp', mayor: { name: '신계용', party: 'ppp' }, keyIssue: '정부청사 이전' ,
            voters: 65220,
            prevElection: { turnout: 65.4 } },
            { name: '구리시', population: 197000, leadParty: 'ppp', mayor: { name: '백경현', party: 'ppp' }, keyIssue: '교통 혁신' ,
            voters: 164045,
            prevElection: { turnout: 53.8 } },
            { name: '남양주시', population: 730000, leadParty: 'ppp', mayor: { name: '주광덕', party: 'ppp' }, keyIssue: '교통 인프라' ,
            voters: 610260,
            prevElection: { turnout: 49.1 } },
            { name: '오산시', population: 233000, leadParty: 'ppp', mayor: { name: '이권재', party: 'ppp' }, keyIssue: '교육 도시' ,
            voters: 190375,
            prevElection: { turnout: 43.7 } },
            { name: '시흥시', population: 510000, leadParty: 'democratic', mayor: { name: '임병택', party: 'democratic' }, keyIssue: '스마트시티' ,
            voters: 431352,
            prevElection: { turnout: 45.2 } },
            { name: '군포시', population: 267000, leadParty: 'ppp', mayor: { name: '하은호', party: 'ppp' }, keyIssue: '주거 안정' ,
            voters: 231192,
            prevElection: { turnout: 55.5 } },
            { name: '의왕시', population: 160000, leadParty: 'ppp', mayor: { name: '김성제', party: 'ppp' }, keyIssue: '교통 접근성' ,
            voters: 138928,
            prevElection: { turnout: 58.0 } },
            { name: '하남시', population: 310000, leadParty: 'ppp', mayor: { name: '이현재', party: 'ppp' }, keyIssue: '미사 신도시' ,
            voters: 266856,
            prevElection: { turnout: 52.4 } },
            { name: '용인시', population: 1081000, leadParty: 'ppp', mayor: { name: '이상일', party: 'ppp' }, keyIssue: '반도체 클러스터' ,
            voters: 889545,
            prevElection: { turnout: 54.2 } },
            { name: '파주시', population: 480000, leadParty: 'democratic', mayor: { name: '김경일', party: 'democratic' }, keyIssue: '접경지역 발전' ,
            voters: 403729,
            prevElection: { turnout: 46.3 } },
            { name: '이천시', population: 222000, leadParty: 'ppp', mayor: { name: '김경희', party: 'ppp' }, keyIssue: 'SK하이닉스' ,
            voters: 188563,
            prevElection: { turnout: 47.1 } },
            { name: '안성시', population: 188000, leadParty: 'democratic', mayor: { name: '김보라', party: 'democratic' }, keyIssue: '농업 혁신' ,
            voters: 163518,
            prevElection: { turnout: 50.0 } },
            { name: '김포시', population: 480000, leadParty: 'ppp', mayor: { name: '김병수', party: 'ppp' }, keyIssue: '교통 혁신' ,
            voters: 392604,
            prevElection: { turnout: 49.9 } },
            { name: '화성시', population: 920000, leadParty: 'democratic', mayor: { name: '정명근', party: 'democratic' }, keyIssue: '삼성 반도체' ,
            voters: 711229,
            prevElection: { turnout: 47.3 } },
            { name: '광주시', population: 390000, leadParty: 'ppp', mayor: { name: '방세환', party: 'ppp' }, keyIssue: '신도시 인프라' ,
            voters: 329651,
            prevElection: { turnout: 46.2 } },
            { name: '양주시', population: 235000, leadParty: 'ppp', mayor: { name: '강수현', party: 'ppp' }, keyIssue: '신도시 개발' ,
            voters: 197751,
            prevElection: { turnout: 48.1 } },
            { name: '포천시', population: 148000, leadParty: 'ppp', mayor: { name: '백영현', party: 'ppp' }, keyIssue: '관광·교통' ,
            voters: 131980,
            prevElection: { turnout: 51.4 } },
            { name: '여주시', population: 112000, leadParty: 'ppp', mayor: { name: '이충우', party: 'ppp' }, keyIssue: '농업·관광' ,
            voters: 98333,
            prevElection: { turnout: 51.5 } },
            { name: '연천군', population: 43000, leadParty: 'ppp', mayor: { name: '김덕현', party: 'ppp' }, keyIssue: '접경지역 지원' ,
            voters: 37898,
            prevElection: { turnout: 60.2 } },
            { name: '가평군', population: 62000, leadParty: 'ppp', mayor: { name: '서태원', party: 'ppp' }, keyIssue: '관광 산업' ,
            voters: 55791,
            prevElection: { turnout: 59.4 } },
            { name: '양평군', population: 118000, leadParty: 'ppp', mayor: { name: '전진선', party: 'ppp' }, keyIssue: '친환경 관광' ,
            voters: 107165,
            prevElection: { turnout: 59.2 } }
        ]
    };

    // 교육감 성향 색상 (정당 색상과 충돌하지 않는 독립 팔레트)
    const superintendentStanceColors = {
        '진보': '#4CAF50',   // Green
        '보수': '#FF9800',   // Orange
        '중도': '#2196F3'    // Blue
    };

    // 현직 교육감 데이터 (2026.3 기준, 2022 제8회 지방선거 + 2024.10 서울 보궐 반영)
    const superintendents = {
        'seoul':    { region: '서울',  currentSuperintendent: { name: '정근식', stance: '진보', since: 2024, career: '현 교육감 (보궐)', note: '보궐선거(2024.10) 당선, 조희연 후임' },    candidates: [{ name: '정근식', stance: '진보', support: 38.5, career: '현 교육감 (보궐)' }, { name: '이재광', stance: '보수', support: 35.2, career: '前 서울시교육청 부교육감' }] },
        'busan':    { region: '부산',  currentSuperintendent: { name: '하윤수', stance: '보수', since: 2022, career: '현 교육감', note: '2022 당선, 부산교대 총장 출신' },                  candidates: [{ name: '하윤수', stance: '보수', support: 40.5, career: '현 교육감' }, { name: '김성호', stance: '진보', support: 42.1, career: '前 교육청 부교육감' }] },
        'daegu':    { region: '대구',  currentSuperintendent: { name: '강은희', stance: '보수', since: 2018, career: '현 교육감', note: '2022 재선, 유일 여성 보수 교육감' },               candidates: [{ name: '강은희', stance: '보수', support: 44.2, career: '현 교육감' }, { name: '박성혁', stance: '진보', support: 32.1, career: '前 교육시민단체 대표' }] },
        'incheon':  { region: '인천',  currentSuperintendent: { name: '도성훈', stance: '진보', since: 2018, career: '현 교육감', note: '2022 재선, 전교조 경력' },                         candidates: [{ name: '도성훈', stance: '진보', support: 41.3, career: '현 교육감' }, { name: '김현기', stance: '보수', support: 38.7, career: '前 인천교육청 국장' }] },
        'gwangju':  { region: '광주',  currentSuperintendent: { name: '이정선', stance: '진보', since: 2022, career: '현 교육감', note: '2022 당선, 광주교대 총장 출신' },                  candidates: [{ name: '이정선', stance: '진보', support: 17.6, career: '현 교육감' }, { name: '김용태', stance: '중도', support: 23.4, career: '교육계 인사' }, { name: '정성홍', stance: '진보', support: 20.8, career: '교육계 인사' }, { name: '오경미', stance: '진보', support: 15.1, career: '교육계 인사' }] },
        'daejeon':  { region: '대전',  currentSuperintendent: { name: '설동호', stance: '중도', since: 2014, career: '현 교육감', note: '2022 3선, 언론사별 성향 분류 상이' },               candidates: [{ name: '설동호', stance: '중도', support: 45.8, career: '현 교육감' }, { name: '김동건', stance: '진보', support: 31.2, career: '前 교육청 부교육감' }] },
        'ulsan':    { region: '울산',  currentSuperintendent: { name: '노옥희', stance: '진보', since: 2018, career: '현 교육감', note: '2022 재선, 전교조 울산지부장 출신' },               candidates: [{ name: '노옥희', stance: '진보', support: 43.6, career: '현 교육감' }, { name: '이상봉', stance: '보수', support: 37.9, career: '前 학교장' }] },
        'sejong':   { region: '세종',  currentSuperintendent: { name: '최교진', stance: '진보', since: 2014, career: '현 교육감', note: '2022 3선' },                                       candidates: [{ name: '최교진', stance: '진보', support: 48.2, career: '현 교육감' }, { name: '강태중', stance: '보수', support: 33.1, career: '前 교육정책연구원장' }] },
        'gyeonggi': { region: '경기',  currentSuperintendent: { name: '임태희', stance: '보수', since: 2022, career: '현 교육감', note: '2022 당선, 13년만 보수 교육감' },                   candidates: [{ name: '임태희', stance: '보수', support: 41.8, career: '현 교육감' }, { name: '신현석', stance: '진보', support: 39.5, career: '前 교육청 부교육감' }] },
        'gangwon':  { region: '강원',  currentSuperintendent: { name: '신경호', stance: '보수', since: 2022, career: '현 교육감', note: '2022 당선' },                                       candidates: [{ name: '신경호', stance: '보수', support: 40.3, career: '현 교육감' }, { name: '민병희', stance: '진보', support: 38.8, career: '前 교육감' }] },
        'chungbuk': { region: '충북',  currentSuperintendent: { name: '윤건영', stance: '보수', since: 2022, career: '현 교육감', note: '2022 당선, 청주교대 총장 출신' },                   candidates: [{ name: '윤건영', stance: '보수', support: 42.5, career: '현 교육감' }, { name: '심의보', stance: '진보', support: 35.6, career: '前 교육청 장학관' }] },
        'chungnam': { region: '충남',  currentSuperintendent: { name: '김지철', stance: '진보', since: 2014, career: '현 교육감', note: '2022 3선, 전교조 경력' },                           candidates: [{ name: '김지철', stance: '진보', support: 44.7, career: '현 교육감' }, { name: '오연호', stance: '보수', support: 36.2, career: '前 교육위원' }] },
        'jeonbuk':  { region: '전북',  currentSuperintendent: { name: '서거석', stance: '진보', since: 2022, career: '현 교육감', note: '2022 당선, 전북대 총장 출신' },                     candidates: [{ name: '서거석', stance: '진보', support: 46.3, career: '현 교육감' }, { name: '이창식', stance: '보수', support: 29.8, career: '前 교육청 부교육감' }] },
        'jeonnam':  { region: '전남',  currentSuperintendent: { name: '김대중', stance: '진보', since: 2022, career: '현 교육감', note: '2022 당선, 전교조 경력' },                          candidates: [{ name: '김대중', stance: '진보', support: 50.1, career: '현 교육감' }, { name: '박정일', stance: '보수', support: 27.3, career: '前 학교장' }] },
        'gyeongbuk': { region: '경북', currentSuperintendent: { name: '임종식', stance: '보수', since: 2018, career: '현 교육감', note: '2022 재선' },                                       candidates: [{ name: '임종식', stance: '보수', support: 23.9, career: '현 교육감' }, { name: '임준희', stance: '중도', support: 1.2, career: '교육계 인사' }] },
        'gyeongnam': { region: '경남', currentSuperintendent: { name: '박종훈', stance: '진보', since: 2014, career: '현 교육감', note: '2022 3선, 전교조 경력' },                           candidates: [{ name: '박종훈', stance: '진보', support: 43.9, career: '현 교육감' }, { name: '김태진', stance: '보수', support: 37.4, career: '前 교육청 부교육감' }] },
        'jeju':     { region: '제주',  currentSuperintendent: { name: '김광수', stance: '보수', since: 2022, career: '현 교육감', note: '2022 당선' },                                       candidates: [{ name: '김광수', stance: '보수', support: 41.2, career: '현 교육감' }, { name: '이석문', stance: '진보', support: 38.6, career: '前 교육감' }] }
    };

    // 교육감 역대 선거 결과 (직선제: 2007~2022, winner/runner는 성향)
    // 교육감은 정당 공천이 없으므로 진보/보수/중도로 분류
    const superintendentHistory = {
        seoul:    [
            { election: 2, year: 2010, winner: '진보', winnerName: '곽노현', rate: 44.5, runner: '보수', runnerName: '이원희', runnerRate: 42.3, turnout: 54.5 },
            { election: 3, year: 2014, winner: '진보', winnerName: '조희연', rate: 33.4, runner: '보수', runnerName: '고승덕', runnerRate: 32.9, turnout: 56.8 },
            { election: 4, year: 2018, winner: '진보', winnerName: '조희연', rate: 47.8, runner: '보수', runnerName: '조영달', runnerRate: 28.0, turnout: 60.2 },
            { election: 5, year: 2022, winner: '진보', winnerName: '조희연', rate: 45.6, runner: '보수', runnerName: '조전혁', runnerRate: 44.6, turnout: 50.9 }
        ],
        busan:    [
            { election: 2, year: 2010, winner: '보수', winnerName: '임혜경', rate: 33.0, runner: '진보', runnerName: '김석준', runnerRate: 31.1, turnout: 54.5 },
            { election: 3, year: 2014, winner: '보수', winnerName: '김석준', rate: 40.6, runner: '진보', runnerName: '임혜경', runnerRate: 34.9, turnout: 56.8 },
            { election: 4, year: 2018, winner: '진보', winnerName: '김석준', rate: 43.5, runner: '보수', runnerName: '하윤수', runnerRate: 39.6, turnout: 60.2 },
            { election: 5, year: 2022, winner: '보수', winnerName: '하윤수', rate: 52.8, runner: '진보', runnerName: '김석준', runnerRate: 26.2, turnout: 50.9 }
        ],
        daegu:    [
            { election: 2, year: 2010, winner: '보수', winnerName: '이청우', rate: 44.4, runner: '보수', runnerName: '반상진', runnerRate: 38.2, turnout: 54.5 },
            { election: 3, year: 2014, winner: '보수', winnerName: '우동기', rate: 53.5, runner: '보수', runnerName: '이수진', runnerRate: 23.2, turnout: 56.8 },
            { election: 4, year: 2018, winner: '보수', winnerName: '강은희', rate: 50.2, runner: '진보', runnerName: '김인경', runnerRate: 21.1, turnout: 60.2 },
            { election: 5, year: 2022, winner: '보수', winnerName: '강은희', rate: 66.5, runner: '진보', runnerName: '박성혁', runnerRate: 27.7, turnout: 50.9 }
        ],
        incheon:  [
            { election: 2, year: 2010, winner: '진보', winnerName: '나길채', rate: 43.2, runner: '보수', runnerName: '김점덕', runnerRate: 39.7, turnout: 54.5 },
            { election: 3, year: 2014, winner: '진보', winnerName: '이청연', rate: 41.4, runner: '보수', runnerName: '이기찬', runnerRate: 38.1, turnout: 56.8 },
            { election: 4, year: 2018, winner: '진보', winnerName: '도성훈', rate: 47.2, runner: '보수', runnerName: '고승의', runnerRate: 30.8, turnout: 60.2 },
            { election: 5, year: 2022, winner: '진보', winnerName: '도성훈', rate: 45.2, runner: '보수', runnerName: '이달곤', runnerRate: 43.2, turnout: 50.9 }
        ],
        gwangju:  [
            { election: 2, year: 2010, winner: '진보', winnerName: '장휘국', rate: 57.4, runner: '진보', runnerName: '박우식', runnerRate: 18.3, turnout: 54.5 },
            { election: 3, year: 2014, winner: '진보', winnerName: '장휘국', rate: 61.8, runner: '진보', runnerName: '이정선', runnerRate: 21.5, turnout: 56.8 },
            { election: 4, year: 2018, winner: '진보', winnerName: '장휘국', rate: 67.3, runner: '진보', runnerName: '이정선', runnerRate: 15.1, turnout: 60.2 },
            { election: 5, year: 2022, winner: '진보', winnerName: '이정선', rate: 41.8, runner: '진보', runnerName: '정성홍', runnerRate: 22.4, turnout: 50.9 }
        ],
        daejeon:  [
            { election: 2, year: 2010, winner: '중도', winnerName: '설동호', rate: 34.8, runner: '진보', runnerName: '김기동', runnerRate: 31.5, turnout: 54.5 },
            { election: 3, year: 2014, winner: '중도', winnerName: '설동호', rate: 48.8, runner: '진보', runnerName: '김기동', runnerRate: 40.5, turnout: 56.8 },
            { election: 4, year: 2018, winner: '중도', winnerName: '설동호', rate: 50.5, runner: '진보', runnerName: '김기동', runnerRate: 28.2, turnout: 60.2 },
            { election: 5, year: 2022, winner: '중도', winnerName: '설동호', rate: 52.3, runner: '보수', runnerName: '이영우', runnerRate: 25.1, turnout: 50.9 }
        ],
        ulsan:    [
            { election: 2, year: 2010, winner: '보수', winnerName: '김복만', rate: 52.7, runner: '진보', runnerName: '노옥희', runnerRate: 47.3, turnout: 54.5 },
            { election: 3, year: 2014, winner: '보수', winnerName: '김복만', rate: 50.5, runner: '진보', runnerName: '노옥희', runnerRate: 49.5, turnout: 56.8 },
            { election: 4, year: 2018, winner: '진보', winnerName: '노옥희', rate: 53.8, runner: '보수', runnerName: '김복만', runnerRate: 46.2, turnout: 60.2 },
            { election: 5, year: 2022, winner: '진보', winnerName: '노옥희', rate: 51.8, runner: '보수', runnerName: '천창수', runnerRate: 48.2, turnout: 50.9 }
        ],
        sejong:   [
            { election: 4, year: 2018, winner: '진보', winnerName: '최교진', rate: 62.4, runner: '보수', runnerName: '오경석', runnerRate: 37.6, turnout: 60.2 },
            { election: 5, year: 2022, winner: '진보', winnerName: '최교진', rate: 55.2, runner: '보수', runnerName: '강태중', runnerRate: 44.8, turnout: 50.9 }
        ],
        gyeonggi: [
            { election: 2, year: 2010, winner: '진보', winnerName: '김상곤', rate: 50.2, runner: '보수', runnerName: '이재정', runnerRate: 49.8, turnout: 54.5 },
            { election: 3, year: 2014, winner: '진보', winnerName: '이재정', rate: 33.7, runner: '보수', runnerName: '이범희', runnerRate: 33.4, turnout: 56.8 },
            { election: 4, year: 2018, winner: '진보', winnerName: '이재정', rate: 52.3, runner: '보수', runnerName: '인요한', runnerRate: 29.5, turnout: 60.2 },
            { election: 5, year: 2022, winner: '보수', winnerName: '임태희', rate: 50.6, runner: '진보', runnerName: '이재정', runnerRate: 37.1, turnout: 50.9 }
        ],
        gangwon:  [
            { election: 2, year: 2010, winner: '진보', winnerName: '민병희', rate: 42.5, runner: '보수', runnerName: '임창환', runnerRate: 38.2, turnout: 54.5 },
            { election: 3, year: 2014, winner: '진보', winnerName: '민병희', rate: 51.2, runner: '보수', runnerName: '박운서', runnerRate: 48.8, turnout: 56.8 },
            { election: 4, year: 2018, winner: '진보', winnerName: '민병희', rate: 55.1, runner: '보수', runnerName: '이상인', runnerRate: 44.9, turnout: 60.2 },
            { election: 5, year: 2022, winner: '보수', winnerName: '신경호', rate: 51.7, runner: '진보', runnerName: '민병희', runnerRate: 48.3, turnout: 50.9 }
        ],
        chungbuk: [
            { election: 2, year: 2010, winner: '보수', winnerName: '이기우', rate: 47.1, runner: '진보', runnerName: '심의보', runnerRate: 39.8, turnout: 54.5 },
            { election: 3, year: 2014, winner: '진보', winnerName: '김병우', rate: 47.8, runner: '보수', runnerName: '이기우', runnerRate: 43.1, turnout: 56.8 },
            { election: 4, year: 2018, winner: '진보', winnerName: '김병우', rate: 56.2, runner: '보수', runnerName: '심의보', runnerRate: 43.8, turnout: 60.2 },
            { election: 5, year: 2022, winner: '보수', winnerName: '윤건영', rate: 52.1, runner: '진보', runnerName: '심의보', runnerRate: 47.9, turnout: 50.9 }
        ],
        chungnam: [
            { election: 2, year: 2010, winner: '진보', winnerName: '김지철', rate: 45.2, runner: '보수', runnerName: '최병우', runnerRate: 37.5, turnout: 54.5 },
            { election: 3, year: 2014, winner: '진보', winnerName: '김지철', rate: 56.3, runner: '보수', runnerName: '오세열', runnerRate: 43.7, turnout: 56.8 },
            { election: 4, year: 2018, winner: '진보', winnerName: '김지철', rate: 60.8, runner: '보수', runnerName: '오세열', runnerRate: 39.2, turnout: 60.2 },
            { election: 5, year: 2022, winner: '진보', winnerName: '김지철', rate: 51.4, runner: '보수', runnerName: '오연호', runnerRate: 48.6, turnout: 50.9 }
        ],
        jeonbuk: [
            { election: 2, year: 2010, winner: '진보', winnerName: '김승환', rate: 62.3, runner: '보수', runnerName: '양춘삼', runnerRate: 20.4, turnout: 54.5 },
            { election: 3, year: 2014, winner: '진보', winnerName: '김승환', rate: 73.6, runner: '중도', runnerName: '김규성', runnerRate: 26.4, turnout: 56.8 },
            { election: 4, year: 2018, winner: '진보', winnerName: '김승환', rate: 76.2, runner: '중도', runnerName: '황종현', runnerRate: 23.8, turnout: 60.2 },
            { election: 5, year: 2022, winner: '진보', winnerName: '서거석', rate: 63.5, runner: '보수', runnerName: '이창식', runnerRate: 36.5, turnout: 50.9 }
        ],
        jeonnam:  [
            { election: 2, year: 2010, winner: '진보', winnerName: '장만채', rate: 57.1, runner: '진보', runnerName: '이봉길', runnerRate: 22.8, turnout: 54.5 },
            { election: 3, year: 2014, winner: '진보', winnerName: '장만채', rate: 72.5, runner: '진보', runnerName: '고석규', runnerRate: 27.5, turnout: 56.8 },
            { election: 4, year: 2018, winner: '진보', winnerName: '장석웅', rate: 68.3, runner: '보수', runnerName: '고영진', runnerRate: 31.7, turnout: 60.2 },
            { election: 5, year: 2022, winner: '진보', winnerName: '김대중', rate: 54.1, runner: '보수', runnerName: '박정일', runnerRate: 25.8, turnout: 50.9 }
        ],
        gyeongbuk: [
            { election: 2, year: 2010, winner: '보수', winnerName: '이영우', rate: 56.5, runner: '보수', runnerName: '안양옥', runnerRate: 33.2, turnout: 54.5 },
            { election: 3, year: 2014, winner: '보수', winnerName: '이영우', rate: 58.1, runner: '진보', runnerName: '안양옥', runnerRate: 41.9, turnout: 56.8 },
            { election: 4, year: 2018, winner: '보수', winnerName: '임종식', rate: 55.3, runner: '진보', runnerName: '이영국', runnerRate: 44.7, turnout: 60.2 },
            { election: 5, year: 2022, winner: '보수', winnerName: '임종식', rate: 58.9, runner: '진보', runnerName: '안형준', runnerRate: 41.1, turnout: 50.9 }
        ],
        gyeongnam: [
            { election: 2, year: 2010, winner: '보수', winnerName: '고대준', rate: 49.1, runner: '진보', runnerName: '권정호', runnerRate: 42.5, turnout: 54.5 },
            { election: 3, year: 2014, winner: '진보', winnerName: '박종훈', rate: 50.8, runner: '보수', runnerName: '고대준', runnerRate: 49.2, turnout: 56.8 },
            { election: 4, year: 2018, winner: '진보', winnerName: '박종훈', rate: 60.5, runner: '보수', runnerName: '권정오', runnerRate: 39.5, turnout: 60.2 },
            { election: 5, year: 2022, winner: '진보', winnerName: '박종훈', rate: 51.1, runner: '보수', runnerName: '김태진', runnerRate: 48.9, turnout: 50.9 }
        ],
        jeju:     [
            { election: 2, year: 2010, winner: '진보', winnerName: '이석문', rate: 52.8, runner: '보수', runnerName: '양성봉', runnerRate: 47.2, turnout: 54.5 },
            { election: 3, year: 2014, winner: '진보', winnerName: '이석문', rate: 55.1, runner: '보수', runnerName: '고석화', runnerRate: 44.9, turnout: 56.8 },
            { election: 4, year: 2018, winner: '진보', winnerName: '이석문', rate: 58.6, runner: '보수', runnerName: '김광수', runnerRate: 41.4, turnout: 60.2 },
            { election: 5, year: 2022, winner: '보수', winnerName: '김광수', rate: 51.2, runner: '진보', runnerName: '이석문', runnerRate: 48.8, turnout: 50.9 }
        ]
    };

    // BEGIN NESDC_LATEST_POLLS
    const latestPolls = [];
    // END NESDC_LATEST_POLLS
    let generatedElectionDataCache = null;

    // ============================================
    // Mock Election Data Generator
    // ============================================
    function generateMockElectionData(forceRefresh = false) {
        if (generatedElectionDataCache && !forceRefresh) {
            return generatedElectionDataCache;
        }
        const surnames = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황', '안', '송', '류', '홍'];
        const givenNames = ['민수', '영희', '지훈', '수진', '현우', '미경', '성호', '은영', '태훈', '지영', '상현', '혜진', '동욱', '나래', '준호', '소영', '재혁', '유진', '승민', '다은', '정훈', '서연', '원석', '미래', '기철', '보람', '대성', '하늘', '용준', '세진'];

        const allRegionKeys = ['seoul', 'busan', 'daegu', 'incheon', 'gwangju', 'daejeon', 'ulsan', 'sejong', 'gyeonggi', 'gangwon', 'chungbuk', 'chungnam', 'jeonbuk', 'jeonnam', 'gyeongbuk', 'gyeongnam', 'jeju'];

        // --- Deterministic random helpers ---
        function hash(str) {
            let h = 0;
            for (let i = 0; i < str.length; i++) {
                h = ((h << 5) - h) + str.charCodeAt(i);
                h |= 0;
            }
            return Math.abs(h);
        }

        function seededRandom(seed) {
            // Returns a value between 0 and 1 based on the seed
            const x = Math.sin(seed) * 10000;
            return x - Math.floor(x);
        }

        function pickName(seed) {
            return surnames[seed % surnames.length] + givenNames[(seed * 7 + 3) % givenNames.length];
        }

        function pickAge(seed) {
            return 40 + (seed % 26); // 40-65
        }

        function pickFrom(arr, seed) {
            return arr[seed % arr.length];
        }

        // --- Career pools ---
        const mayorCareers = ['前 시의원', '前 구청 부구청장', '시민단체 대표', '前 국회의원 보좌관', '교수', '前 도의원', '前 구청장', '변호사', '前 시청 국장', '사업가', '前 군수', '前 시의회 의장'];
        const councilCareers = ['前 시의원', '현 시의원', '시민운동가', '前 구의원', '교수', '변호사', '前 공무원', '기업인', '노동운동가', '前 구청 과장'];
        const localCouncilCareers = ['현 구의원', '前 구의원', '통장', '시민단체 활동가', '자영업', '교사', '사회복지사', '전문직', '前 동장', '마을활동가'];
        const superintendentCareers = ['현 교육감', '前 교육부 차관', '대학교수', '前 교육위원', '교육시민단체 대표', '前 교육청 부교육감', '前 학교장', '교육정책연구원장'];
        const superintendentPledges = [
            ['학급당 학생수 20명 이하', '무상교육 확대', '디지털 교육 혁신'],
            ['교권 보호 강화', '영재교육 확대', '학교 안전 강화'],
            ['교육 격차 해소', '돌봄교실 확대', '진로교육 내실화'],
            ['학교 시설 현대화', '교원 처우 개선', '특수교육 확대'],
            ['AI 교육 도입', '자율형 학교 확대', '체육·예술 교육 강화']
        ];
        const educationIssues = [
            '학급당 학생수', '교권 보호', '디지털 교육', '무상급식',
            '돌봄 서비스', '교육 격차', '학교 안전', '입시 제도',
            '교원 처우', '특수교육', '학교 시설', '방과후 프로그램'
        ];

        const pollSources = ['한국갤럽', '리얼미터', 'KSOI', 'NBS'];
        const pollDates = ['2026-01-15', '2026-01-29', '2026-02-12', '2026-02-24'];

        const thirdParties = ['reform', 'newReform', 'independent'];
        const subDistrictLabels = ['가', '나', '다', '라', '마'];

        // ============================================
        // 1. Mayor (기초단체장) Data
        // ============================================
        const mayor = {};
        Object.keys(subRegionData).forEach(regionKey => {
            const districts = subRegionData[regionKey];
            if (!districts) return;
            mayor[regionKey] = {};

            districts.forEach((district, districtIdx) => {
                const key = `${regionKey}-${districtIdx}-mayor`;
                const seed = hash(key);
                const leadParty = district.leadParty || 'democratic';
                const opponentParty = leadParty === 'democratic' ? 'ppp' : 'democratic';
                const hasThird = seededRandom(seed + 99) > 0.45;
                const numCandidates = hasThird ? 3 : 2;

                const candidates = [];
                // Lead candidate
                candidates.push({
                    id: `${regionKey}-${districtIdx}-mayor-0`,
                    name: pickName(seed),
                    party: leadParty,
                    age: pickAge(seed + 10),
                    career: pickFrom(mayorCareers, seed + 20)
                });
                // Opponent
                candidates.push({
                    id: `${regionKey}-${districtIdx}-mayor-1`,
                    name: pickName(seed + 50),
                    party: opponentParty,
                    age: pickAge(seed + 60),
                    career: pickFrom(mayorCareers, seed + 70)
                });
                // Third (if applicable)
                if (hasThird) {
                    candidates.push({
                        id: `${regionKey}-${districtIdx}-mayor-2`,
                        name: pickName(seed + 100),
                        party: pickFrom(thirdParties, seed + 110),
                        age: pickAge(seed + 120),
                        career: pickFrom(mayorCareers, seed + 130)
                    });
                }

                // Generate 2 polls
                const polls = [];
                for (let p = 0; p < 2; p++) {
                    const pSeed = seed + p * 1000;
                    const leadPct = 38 + seededRandom(pSeed) * 17; // 38-55
                    const oppPct = 30 + seededRandom(pSeed + 1) * 18; // 30-48
                    const thirdPct = hasThird ? (5 + seededRandom(pSeed + 2) * 10) : 0; // 5-15
                    const total = leadPct + oppPct + thirdPct;
                    const norm = 100 / total;

                    const data = {};
                    data[candidates[0].id] = parseFloat((leadPct * norm * 0.85).toFixed(1));
                    data[candidates[1].id] = parseFloat((oppPct * norm * 0.85).toFixed(1));
                    if (hasThird) {
                        data[candidates[2].id] = parseFloat((thirdPct * norm * 0.85).toFixed(1));
                    }

                    polls.push({
                        date: pollDates[p * 2],
                        source: pickFrom(pollSources, pSeed),
                        data: data,
                        margin: parseFloat((2.5 + seededRandom(pSeed + 3) * 2).toFixed(1)),
                        sampleSize: 500 + Math.floor(seededRandom(pSeed + 4) * 600)
                    });
                }

                mayor[regionKey][district.name] = {
                    candidates,
                    polls,
                    leadParty
                };
            });
        });

        // ============================================
        // 2. Council (광역의원) Data
        // ============================================
        const council = {};
        Object.keys(subRegionData).forEach(regionKey => {
            const districts = subRegionData[regionKey];
            if (!districts) return;

            const councilDistricts = districts.map((subRegion, idx) => {
                const key = `${regionKey}-${idx}-council`;
                const seed = hash(key);
                const seats = subRegion.population > 300000 ? 2 : 1;
                const leadParty = subRegion.leadParty || 'democratic';
                const opponentParty = leadParty === 'democratic' ? 'ppp' : 'democratic';
                const hasThird = seededRandom(seed + 200) > 0.5;

                const candidates = [];
                candidates.push({
                    id: `${regionKey}-${idx}-council-0`,
                    name: pickName(seed + 300),
                    party: leadParty,
                    age: pickAge(seed + 310),
                    career: pickFrom(councilCareers, seed + 320)
                });
                candidates.push({
                    id: `${regionKey}-${idx}-council-1`,
                    name: pickName(seed + 350),
                    party: opponentParty,
                    age: pickAge(seed + 360),
                    career: pickFrom(councilCareers, seed + 370)
                });
                if (hasThird) {
                    candidates.push({
                        id: `${regionKey}-${idx}-council-2`,
                        name: pickName(seed + 400),
                        party: pickFrom(thirdParties, seed + 410),
                        age: pickAge(seed + 420),
                        career: pickFrom(councilCareers, seed + 430)
                    });
                }

                return {
                    name: `${subRegion.name} 선거구`,
                    municipality: subRegion.name,
                    seats,
                    candidates,
                    leadParty
                };
            });

            council[regionKey] = { districts: councilDistricts };
        });

        // ============================================
        // 3. LocalCouncil (기초의원) Data
        // ============================================
        const localCouncil = {};
        Object.keys(subRegionData).forEach(regionKey => {
            const districts = subRegionData[regionKey];
            if (!districts) return;
            localCouncil[regionKey] = {};

            districts.forEach((subRegion, districtIdx) => {
                const population = subRegion.population || 100000;
                const totalSeats = Math.max(7, Math.round(population / 50000));
                const numSubDistricts = Math.min(5, Math.max(3, Math.round(totalSeats / 3)));
                const leadParty = subRegion.leadParty || 'democratic';

                const subDistricts = [];
                let assignedSeats = 0;

                for (let i = 0; i < numSubDistricts; i++) {
                    const key = `${regionKey}-${districtIdx}-local-${i}`;
                    const seed = hash(key);
                    const isLast = (i === numSubDistricts - 1);
                    const seats = isLast
                        ? Math.max(2, totalSeats - assignedSeats)
                        : (2 + (seed % 2)); // 2 or 3
                    assignedSeats += seats;

                    const opponentParty = leadParty === 'democratic' ? 'ppp' : 'democratic';
                    const hasThird = seededRandom(seed + 500) > 0.4;

                    const candidates = [];
                    // Generate candidates: seats + 1 or seats + 2 to have competition
                    const numCandidates = seats + 1 + (hasThird ? 1 : 0);
                    for (let c = 0; c < numCandidates; c++) {
                        let cParty;
                        if (c === 0) cParty = leadParty;
                        else if (c === 1) cParty = opponentParty;
                        else if (c < seats) cParty = pickFrom([leadParty, opponentParty], seed + c);
                        else cParty = pickFrom(thirdParties, seed + c * 7);

                        candidates.push({
                            id: `${regionKey}-${districtIdx}-local-${i}-${c}`,
                            name: pickName(seed + c * 13 + 600),
                            party: cParty,
                            age: pickAge(seed + c * 11 + 610),
                            career: pickFrom(localCouncilCareers, seed + c * 9 + 620)
                        });
                    }

                    // Use label style based on region count
                    const subDistrictName = numSubDistricts <= 5
                        ? `${subRegion.name} ${subDistrictLabels[i]}선거구`
                        : `제${i + 1}선거구`;

                    subDistricts.push({
                        name: subDistrictName,
                        seats,
                        candidates,
                        leadParty: (seededRandom(seed + 700) > 0.3) ? leadParty : opponentParty
                    });
                }

                localCouncil[regionKey][subRegion.name] = {
                    totalSeats,
                    districts: subDistricts
                };
            });
        });

        // ============================================
        // 4. Superintendent (교육감) Data
        // ============================================
        const superintendent = {};
        const stances = ['진보', '보수', '중도'];

        allRegionKeys.forEach(regionKey => {
            const key = `${regionKey}-superintendent`;
            const seed = hash(key);
            const region = regions[regionKey];
            const regionName = region ? region.name : regionKey;
            const hasThird = seededRandom(seed + 800) > 0.45;
            const numCandidates = hasThird ? 3 : 2;

            const candidates = [];
            for (let i = 0; i < numCandidates; i++) {
                const cSeed = seed + i * 100 + 900;
                candidates.push({
                    id: `${regionKey}-superintendent-${i}`,
                    name: pickName(cSeed),
                    stance: stances[i % stances.length],
                    party: null,
                    age: pickAge(cSeed + 10),
                    career: pickFrom(superintendentCareers, cSeed + 20),
                    pledges: superintendentPledges[cSeed % superintendentPledges.length]
                });
            }

            // Generate polls
            const polls = [];
            const numPolls = 1 + (seed % 2); // 1 or 2 polls
            for (let p = 0; p < numPolls; p++) {
                const pSeed = seed + p * 2000;
                const firstPct = 35 + seededRandom(pSeed) * 20; // 35-55
                const secondPct = 30 + seededRandom(pSeed + 1) * 18; // 30-48
                const thirdPct = hasThird ? (5 + seededRandom(pSeed + 2) * 12) : 0;
                const total = firstPct + secondPct + thirdPct;
                const norm = 90 / total;

                const data = {};
                data[candidates[0].id] = parseFloat((firstPct * norm).toFixed(1));
                data[candidates[1].id] = parseFloat((secondPct * norm).toFixed(1));
                if (hasThird) {
                    data[candidates[2].id] = parseFloat((thirdPct * norm).toFixed(1));
                }

                polls.push({
                    date: pollDates[p * 2],
                    source: pickFrom(pollSources, pSeed + 5),
                    data: data,
                    margin: parseFloat((3.0 + seededRandom(pSeed + 6) * 2).toFixed(1)),
                    sampleSize: 400 + Math.floor(seededRandom(pSeed + 7) * 600)
                });
            }

            // Key issues (education-related)
            const keyIssues = [];
            const numIssues = 3 + (seed % 2);
            for (let j = 0; j < numIssues; j++) {
                keyIssues.push(educationIssues[(seed + j * 3) % educationIssues.length]);
            }

            superintendent[regionKey] = {
                regionName,
                candidates,
                polls,
                keyIssues
            };
        });

        // ============================================
        // 5. ByElection (재보궐) Data
        // ============================================
        // 2026.03.09 기준 확정 5개 재보궐선거 지역
        const byElectionDefs = [
            {
                key: 'incheon-yeonsu',
                region: 'incheon',
                district: '인천 연수구갑',
                type: '국회의원 보궐',
                subType: '보궐선거',
                reason: '박찬대 의원 인천시장 출마 사퇴 예정',
                previousMember: { name: '박찬대', party: 'democratic', term: '3선' },
                status: '확정예정',
                voters: 148000,
                keyIssues: ['송도국제도시 발전', '교통 인프라', '교육 환경', '인천시장 공백'],
                prevElection: { winner: 'democratic', winnerName: '박찬대', rate: 52.4, runner: 'ppp', runnerName: '정승연', runnerRate: 46.1, turnout: 67.2 }
            },
            {
                key: 'incheon-gyeyang',
                region: 'incheon',
                district: '인천 계양구을',
                type: '국회의원 보궐',
                subType: '보궐선거',
                reason: '이재명 대통령 당선에 따른 궐위',
                previousMember: { name: '이재명', party: 'democratic', term: '' },
                status: '확정',
                voters: 152000,
                keyIssues: ['인천 신도시 교통', '주거 인프라', '교육 환경', '환경 보전'],
                prevElection: { winner: 'democratic', winnerName: '이재명', rate: 50.6, runner: 'ppp', runnerName: '윤형선', runnerRate: 45.2, turnout: 52.8 }
            },
            {
                key: 'gyeonggi-pyeongtaek',
                region: 'gyeonggi',
                district: '경기 평택시을',
                type: '국회의원 보궐',
                subType: '재선거',
                reason: '이병진 의원 선거법 위반 유죄 확정 (벌금 700만원)',
                previousMember: { name: '이병진', party: 'democratic', term: '' },
                status: '확정',
                voters: 165000,
                keyIssues: ['평택 반도체 클러스터', '국제도시 개발', '교통 인프라', '주한미군 상생'],
                prevElection: { winner: 'democratic', winnerName: '이병진', rate: 51.2, runner: 'ppp', runnerName: '공병호', runnerRate: 44.8, turnout: 50.3 }
            },
            {
                key: 'chungnam-asan',
                region: 'chungnam',
                district: '충남 아산시을',
                type: '국회의원 보궐',
                subType: '보궐선거',
                reason: '강훈식 대통령비서실장 취임에 따른 사퇴',
                previousMember: { name: '강훈식', party: 'democratic', term: '' },
                status: '확정',
                voters: 129000,
                keyIssues: ['아산 신도시 발전', '삼성 디스플레이 클러스터', '교통 인프라', '인구 유입 대응'],
                prevElection: { winner: 'democratic', winnerName: '강훈식', rate: 53.2, runner: 'ppp', runnerName: '이명수', runnerRate: 43.1, turnout: 51.5 }
            },
            {
                key: 'jeonbuk-gunsan',
                region: 'jeonbuk',
                district: '전북 군산·김제·부안갑',
                type: '국회의원 보궐',
                subType: '재선거',
                reason: '신영대 의원 선거사무장 경선조작 유죄 확정',
                previousMember: { name: '신영대', party: 'democratic', term: '' },
                status: '확정',
                voters: 170000,
                keyIssues: ['새만금 개발', '군산 조선 산업', '농어업 지원', '지역 균형발전'],
                prevElection: { winner: 'democratic', winnerName: '신영대', rate: 55.8, runner: 'ppp', runnerName: '박진술', runnerRate: 32.1, turnout: 48.9 }
            }
        ];

        const byElection = {};
        byElectionDefs.forEach(def => {
            const seed = hash(def.key + '-byelection');

            const candidates = [];
            const byParties = ['democratic', 'ppp', 'reform'];
            for (let i = 0; i < 3; i++) {
                const cSeed = seed + i * 100 + 1500;
                candidates.push({
                    id: `${def.key}-byelection-${i}`,
                    name: pickName(cSeed),
                    party: byParties[i],
                    age: pickAge(cSeed + 10),
                    career: pickFrom(mayorCareers, cSeed + 20)
                });
            }

            // 3 polls
            const polls = [];
            for (let p = 0; p < 3; p++) {
                const pSeed = seed + p * 3000;
                const demPct = 38 + seededRandom(pSeed) * 15; // 38-53
                const pppPct = 35 + seededRandom(pSeed + 1) * 14; // 35-49
                const reformPct = 5 + seededRandom(pSeed + 2) * 10; // 5-15

                const data = {};
                data[candidates[0].id] = parseFloat(demPct.toFixed(1));
                data[candidates[1].id] = parseFloat(pppPct.toFixed(1));
                data[candidates[2].id] = parseFloat(reformPct.toFixed(1));

                polls.push({
                    date: pollDates[p < 3 ? p : 2],
                    source: pickFrom(pollSources, pSeed + 5),
                    data: data,
                    margin: parseFloat((2.5 + seededRandom(pSeed + 6) * 2).toFixed(1)),
                    sampleSize: 600 + Math.floor(seededRandom(pSeed + 7) * 500)
                });
            }

            byElection[def.key] = {
                region: def.region,
                district: def.district,
                type: def.type,
                subType: def.subType || '보궐선거',
                reason: def.reason,
                previousMember: def.previousMember || null,
                status: def.status || '확정',
                voters: def.voters,
                candidates,
                polls,
                keyIssues: def.keyIssues,
                prevElection: def.prevElection
            };
        });

        generatedElectionDataCache = {
            mayor,
            council,
            localCouncil,
            superintendent,
            byElection
        };
        return generatedElectionDataCache;
    }

    // Public API
    return {
        parties,
        regions,
        electionDate,
        preVoteDates,
        electionCalendarSources,
        nationalSummary,
        superintendents,
        gallupNationalPoll,
        electionTypeInfo,
        subRegionData,
        latestPolls,
        getHotspots,
        getDday,
        getElectionCalendar,
        getElectionCalendarSections,
        getElectionCalendarSources: () => electionCalendarSources,
        getPartyDominance,
        getNewsSearchUrl,
        getRegion: (key) => regions[key],
        getSubRegions: (key) => subRegionData[key] || [],
        getSubRegionByName: (regionKey, districtName) => {
            const list = subRegionData[regionKey] || [];
            return list.find(d => d.name === districtName) || null;
        },
        getDistrictFullName: (regionKey, districtName) => {
            const region = regions[regionKey];
            return region ? `${region.name} ${districtName}` : districtName;
        },
        getDistrictSummary: (regionKey, districtName) => {
            const district = (subRegionData[regionKey] || []).find(d => d.name === districtName);
            if (!district) {
                return {
                    name: districtName,
                    population: 0,
                    keyIssue: '데이터 준비 중',
                    leadParty: 'independent',
                    unknown: true,
                    mayor: { party: 'independent', status: '데이터 준비 중' },
                    council: { seats: '자료 없음', majorityParty: 'independent' }
                };
            }
            const population = district.population || 0;
            const estimatedSeats = Math.max(7, Math.round(population / 50000));
            const leadParty = district.leadParty || 'independent';
            const mayorData = district.mayor || {};
            return {
                name: district.name,
                population,
                keyIssue: district.keyIssue || '지역 현안',
                leadParty,
                unknown: false,
                mayor: {
                    name: mayorData.name || null,
                    party: mayorData.party || leadParty,
                    acting: mayorData.acting || false,
                    actingReason: mayorData.actingReason || null
                },
                council: {
                    seats: estimatedSeats,
                    majorityParty: leadParty
                }
            };
        },
        getPartyColor: (partyKey) => parties[partyKey]?.color || '#808080',
        getPartyName: (partyKey) => parties[partyKey]?.name || '무소속',
        getLeadingParty: (regionKey) => {
            const region = regions[regionKey];
            if (!region) return null;
            const entries = Object.entries(region.partySupport);
            entries.sort((a, b) => b[1] - a[1]);
            return entries[0][0];
        },
        getSuperintendentData: (regionKey) => superintendents[regionKey] || null,
        getSuperintendentColor: (stance) => superintendentStanceColors[stance] || '#888888',
        getSuperintendentStance(regionKey, candidateName) {
            const data = superintendents[regionKey];
            if (!data) return null;
            const match = (data.candidates || []).find(c => c.name === candidateName);
            return match?.stance || null;
        },
        superintendentStanceColors,
        // ── 기초단체장 후보 데이터 (mayor_candidates.json) ──
        _mayorCandidatesCache: null,
        loadMayorCandidates() {
            if (this._mayorCandidatesCache) return Promise.resolve(this._mayorCandidatesCache);
            return fetch('data/candidates/mayor_candidates.json')
                .then(r => r.ok ? r.json() : null)
                .then(data => {
                    this._mayorCandidatesCache = data;
                    console.log(`[MayorCandidates] Loaded: ${data?._meta?.lastUpdated || 'unknown'}`);
                    return data;
                })
                .catch(err => { console.warn('[MayorCandidates] Failed:', err); return null; });
        },
        getMayorData: function(regionKey, districtName) {
            const cache = this._mayorCandidatesCache;
            if (cache?.candidates?.[regionKey]?.[districtName]) {
                const cands = cache.candidates[regionKey][districtName]
                    .filter(c => c.status !== 'WITHDRAWN')
                    .map((c, i) => ({
                        id: `${regionKey}-${districtName}-${i}`,
                        name: c.name,
                        party: c.party || 'independent',
                        career: c.career || '',
                        pledges: c.pledges || [],
                        status: c.status,
                        dataSource: c.dataSource,
                    }));
                if (cands.length) return { candidates: cands };
            }
            // fallback: mock data
            const data = generateMockElectionData();
            return data?.mayor?.[regionKey]?.[districtName] || null;
        },
        getByElectionData: (key) => {
            // 외부 JSON 로드 데이터 우선, 없으면 mock fallback
            const ext = ElectionData._byElectionCache;
            if (ext) {
                if (key) {
                    const dist = ext.districts?.[key];
                    if (!dist) return null;
                    // 외부 JSON 후보 → 프론트엔드 형식으로 정규화
                    const candidates = (dist.candidates || [])
                        .filter(c => c.status !== 'WITHDRAWN')
                        .map((c, i) => ({
                            id: `${key}-byelection-${i}`,
                            name: c.name,
                            party: c.partyKey || c.party || 'independent',
                            career: c.career || '',
                            pledges: c.pledges || [],
                            status: c.status || 'DECLARED'
                        }));
                    return { ...dist, candidates };
                }
                // 전체 반환
                const all = {};
                Object.entries(ext.districts || {}).forEach(([k, d]) => {
                    const candidates = (d.candidates || [])
                        .filter(c => c.status !== 'WITHDRAWN')
                        .map((c, i) => ({
                            id: `${k}-byelection-${i}`,
                            name: c.name,
                            party: c.partyKey || c.party || 'independent',
                            career: c.career || '',
                            pledges: c.pledges || [],
                            status: c.status || 'DECLARED'
                        }));
                    all[k] = { ...d, candidates };
                });
                return all;
            }
            const data = generateMockElectionData();
            return key ? data.byElection[key] : data.byElection;
        },
        getAllByElections: () => {
            return ElectionData.getByElectionData();
        },
        generateMockElectionData,

        // ── 지역 이슈 API ──
        getRegionIssues: (regionKey) => {
            const derived = window.DerivedIssuesData;
            if (!derived || !derived.regions || !derived.regions[regionKey]) return [];
            return derived.regions[regionKey].issues || [];
        },
        getDerivedIssueSignals: (regionKey) => {
            const derived = window.DerivedIssuesData;
            if (!derived?.regions?.[regionKey]) return {};
            return derived.regions[regionKey].signals || {};
        },
        getDerivedIssuesMeta: (regionKey) => {
            const derived = window.DerivedIssuesData;
            if (!derived) return null;
            return { updatedAt: derived.updatedAt, methodology: derived.methodology };
        },

        // ── 역대 선거 데이터 API ──
        historicalElections,
        getHistoricalData: (regionKey) => historicalElections[regionKey] || [],
        getSuperintendentHistoricalData: (regionKey) => superintendentHistory[regionKey] || [],
        getHistoricalPartyName: (partyKey, election) => {
            if (!partyKey) return '';
            const names = historicalPartyNames[partyKey];
            if (names && names[election]) return names[election];
            return parties[partyKey]?.name || partyKey;
        },

        // ── 비례대표 데이터 API ──
        _proportionalCouncilCache: null,
        _proportionalLocalCouncilCache: null,

        loadProportionalCouncilData() {
            if (this._proportionalCouncilCache) return Promise.resolve(this._proportionalCouncilCache);
            return fetch('data/proportional_council.json')
                .then(r => r.ok ? r.json() : null)
                .then(data => { this._proportionalCouncilCache = data; return data; })
                .catch(() => null);
        },

        loadProportionalLocalCouncilData() {
            if (this._proportionalLocalCouncilCache) return Promise.resolve(this._proportionalLocalCouncilCache);
            return fetch('data/proportional_local_council.json')
                .then(r => r.ok ? r.json() : null)
                .then(data => { this._proportionalLocalCouncilCache = data; return data; })
                .catch(() => null);
        },

        getProportionalCouncilRegion(regionKey) {
            const data = this._proportionalCouncilCache;
            return data?.regions?.[regionKey] || null;
        },

        getProportionalLocalCouncilRegion(regionKey) {
            const data = this._proportionalLocalCouncilCache;
            return data?.regions?.[regionKey] || null;
        },

        getProportionalLocalCouncilSigungu(regionKey, sigunguName) {
            const region = this.getProportionalLocalCouncilRegion(regionKey);
            return region?.sigungus?.[sigunguName] || null;
        },

        // ── 광역의원 현직의원 데이터 API ──
        _councilMembersCache: null,
        loadCouncilMembersData() {
            if (this._councilMembersCache) return Promise.resolve(this._councilMembersCache);
            return fetch('data/council/council_members.json')
                .then(r => r.ok ? r.json() : null)
                .then(data => { this._councilMembersCache = data; return data; })
                .catch(() => null);
        },
        getCouncilMembers(regionKey, districtName) {
            const data = this._councilMembersCache;
            return data?.regions?.[regionKey]?.districtMembers?.[districtName] || [];
        },
        getCouncilData(regionKey) {
            // 호환성: map.js에서 getCouncilData 호출 시 빈 객체 반환
            const data = this._councilMembersCache;
            const region = data?.regions?.[regionKey];
            if (!region) return null;
            // districtMembers를 municipalities 형태로 변환
            const municipalities = {};
            Object.entries(region.districtMembers || {}).forEach(([dist, members]) => {
                // 선거구에서 시군구명 추출
                const m = dist.match(/^(.+?)\s+제?\d+선거구$/) || dist.match(/^(.+?)\s+선거구$/);
                const sgg = m ? m[1] : dist;
                if (!municipalities[sgg]) municipalities[sgg] = [];
                const leadParty = members[0]?.party || 'independent';
                municipalities[sgg].push({ name: dist, leadParty, members });
            });
            return { districts: Object.values(region.districtMembers).flat(), municipalities };
        },

        // ── 기초의원 시군구 데이터 조회 ──
        getLocalCouncilData(regionKey, districtName) {
            const members = this.getLocalCouncilMembers(regionKey, districtName);
            if (!members?.length) {
                // mock 데이터 폴백
                const mockData = localCouncil?.[regionKey]?.[districtName];
                return mockData || null;
            }
            // 현직 의원 데이터를 선거구별로 그룹핑
            const districtMap = {};
            members.forEach(m => {
                const dName = m.district || m.name || '미분류';
                if (!districtMap[dName]) districtMap[dName] = { name: dName, seats: 1, candidates: [], leadParty: 'independent' };
                districtMap[dName].candidates.push({
                    name: m.name, party: m.party || 'independent',
                    career: m.career || '', isIncumbent: true, status: 'DECLARED'
                });
                districtMap[dName].leadParty = m.party || districtMap[dName].leadParty;
            });
            const districts = Object.values(districtMap);
            return { districts, totalSeats: districts.reduce((sum, d) => sum + d.seats, 0) };
        },

        // ── 의원급 후보자 조회 (council-tab.js에서 사용) ──
        _councilCandidateCache: {},
        async loadCouncilCandidates(regionKey, electionType) {
            const folder = electionType === 'council' ? 'council' : 'local_council';
            const cacheKey = `${folder}_${regionKey}`;
            if (this._councilCandidateCache[cacheKey]) return;
            try {
                const data = await fetch(`data/candidates/${folder}/${regionKey}.json`).then(r => r.json());
                this._councilCandidateCache[cacheKey] = data;
            } catch(e) {
                this._councilCandidateCache[cacheKey] = { candidates: {} };
            }
        },
        getCouncilCandidates(regionKey, districtName, electionType) {
            const folder = electionType === 'council' ? 'council' : 'local_council';
            const cacheKey = `${folder}_${regionKey}`;
            const data = this._councilCandidateCache[cacheKey];
            if (data?.candidates?.[districtName]) {
                return data.candidates[districtName].filter(c => c.status !== 'WITHDRAWN');
            }
            // 폴백: 현직 의원 데이터에서 조회
            if (electionType === 'council') {
                const members = this.getCouncilMembers(regionKey, districtName);
                return members.map(m => ({
                    name: m.name, party: m.party || 'independent',
                    career: m.career || '', isIncumbent: true, status: 'DECLARED'
                }));
            }
            return [];
        },

        // ── 비례대표 데이터 ──
        _proportionalCache: null,
        async loadProportionalCandidates() {
            if (this._proportionalCache) return;
            try {
                this._proportionalCache = await fetch('data/candidates/proportional.json').then(r => r.json());
            } catch(e) {
                this._proportionalCache = {};
            }
        },
        getProportionalCandidates(regionKey, electionType) {
            const key = electionType === 'councilProportional' ? 'council_proportional' : 'local_council_proportional';
            return this._proportionalCache?.[key]?.[regionKey] || null;
        },
        getProportionalData(regionKey, electionType, districtName) {
            // 비례대표 개요 데이터 (의석 수, 현 정당별 구성)
            if (electionType === 'councilProportional') {
                return this._proportionalCouncilCache?.regions?.[regionKey] || null;
            }
            // 기초비례: 시군구 단위
            const regionData = this._proportionalLocalCouncilCache?.regions?.[regionKey];
            if (districtName && regionData?.sigungus?.[districtName]) {
                return regionData.sigungus[districtName];
            }
            // 시군구 미선택 시 시도 전체 합산
            if (regionData?.sigungus) {
                const allSgg = Object.values(regionData.sigungus);
                return {
                    totalSeats: allSgg.reduce((s, d) => s + (d.totalSeats || 0), 0),
                    parties: this._mergePartiesHelper(allSgg),
                };
            }
            return null;
        },

        _mergePartiesHelper(sigungus) {
            const partyMap = {};
            sigungus.forEach(sgg => {
                (sgg.parties || []).forEach(p => {
                    if (!partyMap[p.party]) partyMap[p.party] = { party: p.party, seats: 0 };
                    partyMap[p.party].seats += p.seats || 0;
                });
            });
            return Object.values(partyMap).sort((a, b) => b.seats - a.seats);
        },

        // ── 정당지지도 (비례대표용) — 순수 정당지지도만, 인물 지지율 제외 ──
        getPartySupport(regionKey) {
            if (!this._pollsCache?.regions?.[regionKey]) return [];
            const PARTY_NAMES = ['더불어민주당','국민의힘','조국혁신당','개혁신당','진보당','정의당',
                '무소속','새로운미래','기타','모름/무응답','없음','모르겠다','무응답','기본소득당','녹색당'];
            return this._pollsCache.regions[regionKey].filter(p => {
                const title = p.title || '';
                const types = p.classification?.electionTypes || [];
                if (!title.includes('정당지지도') && !types.includes('정당지지도')) return false;
                // 결과에 인물명이 있으면 제외 (정당명만 있어야 순수 정당지지도)
                const results = (p.results || []).filter(r => r.support > 0);
                if (!results.length) return false;
                const allPartyNames = results.every(r =>
                    !r.candidateName || PARTY_NAMES.some(pn => r.candidateName.includes(pn))
                );
                return allPartyNames;
            });
        },

        // ── 재보궐 외부 JSON 로드 API ──
        _byElectionCache: null,
        loadByElectionData() {
            if (this._byElectionCache) return Promise.resolve(this._byElectionCache);
            return fetch('data/candidates/byelection.json?v=' + Date.now())
                .then(r => r.ok ? r.json() : null)
                .then(data => {
                    this._byElectionCache = data;
                    const count = data?.districts ? Object.keys(data.districts).length : 0;
                    console.log(`[ByElectionData] Loaded: ${count} districts, updated ${data?._meta?.lastUpdated || 'unknown'}`);
                    return data;
                })
                .catch(err => {
                    console.warn('[ByElectionData] Failed to load, using mock data:', err);
                    return null;
                });
        },

        // ── 선거 통계 외부 JSON 로드 API ──
        _electionStatsLoaded: false,
        loadElectionStats() {
            if (this._electionStatsLoaded) return Promise.resolve();
            return fetch('data/election_stats.json?v=' + Date.now())
                .then(r => r.ok ? r.json() : null)
                .then(data => {
                    if (!data?.electionTypes) return;
                    // electionTypeInfo 갱신
                    Object.entries(data.electionTypes).forEach(([key, info]) => {
                        if (electionTypeInfo[key]) {
                            electionTypeInfo[key].count = info.count;
                            if (info.detail) electionTypeInfo[key].detail = info.detail;
                            if (info.description) electionTypeInfo[key].description = info.description;
                        }
                    });
                    // nationalSummary.electionTypes 갱신
                    nationalSummary.electionTypes.forEach(et => {
                        const match = Object.values(data.electionTypes).find(d => d.name === et.name);
                        if (match) et.count = match.count;
                    });
                    // officialStats 갱신
                    if (data.officialStats) {
                        Object.assign(nationalSummary.officialStats, data.officialStats);
                    }
                    // 재보궐 선거구 갱신
                    if (data.electionTypes.byElection?.districts) {
                        nationalSummary.byElection.count = data.electionTypes.byElection.count;
                        nationalSummary.byElection.districts = data.electionTypes.byElection.districts;
                    }
                    this._electionStatsLoaded = true;
                    const meta = data._meta || {};
                    console.log(`[ElectionStats] Loaded: ${meta.lastUpdated || 'unknown'}, finalized=${data.redistrictingStatus?.finalized || false}`);
                })
                .catch(err => {
                    console.warn('[ElectionStats] Failed to load, using embedded data:', err);
                });
        },

        // ── 기초의원 현직 의원 외부 JSON 로드 API ──
        _localCouncilMembersCache: null,
        loadLocalCouncilMembersData() {
            if (this._localCouncilMembersCache) return Promise.resolve(this._localCouncilMembersCache);
            return fetch('data/candidates/local_council_members.json')
                .then(r => r.ok ? r.json() : null)
                .then(data => {
                    this._localCouncilMembersCache = data;
                    if (data?._meta) {
                        console.log(`[LocalCouncilMembers] Loaded: ${data._meta.totalMembers || '?'}명, ${data._meta.totalSigungu || '?'}개 시군구`);
                    }
                    return data;
                })
                .catch(err => {
                    console.warn('[LocalCouncilMembers] Failed to load:', err);
                    return null;
                });
        },
        getLocalCouncilMembers(regionKey, sigunguName) {
            const data = this._localCouncilMembersCache;
            if (!data?.sigungus) return null;
            const key = `${regionKey}_${sigunguName}`;
            return data.sigungus[key] || null;
        },
        getLocalCouncilRegionSummary(regionKey) {
            const data = this._localCouncilMembersCache;
            if (!data?.sigungus) return null;
            const sigungus = Object.values(data.sigungus).filter(s => s.region === regionKey);
            if (!sigungus.length) return null;
            const parties = {};
            let totalMembers = 0;
            sigungus.forEach(sg => {
                Object.entries(sg.parties || {}).forEach(([p, c]) => {
                    parties[p] = (parties[p] || 0) + c;
                    totalMembers += c;
                });
            });
            return { totalMembers, totalSigungu: sigungus.length, parties };
        },

        // ── 교육감 현황 외부 JSON 로드 API ──
        _superintendentStatusLoaded: false,
        loadSuperintendentStatus() {
            if (this._superintendentStatusLoaded) return Promise.resolve();
            return fetch('data/candidates/superintendent_status.json')
                .then(r => r.ok ? r.json() : null)
                .then(data => {
                    if (!data?.superintendents) return;
                    Object.entries(data.superintendents).forEach(([regionKey, s]) => {
                        if (!superintendents[regionKey]) return;
                        const cur = superintendents[regionKey].currentSuperintendent;
                        if (cur) {
                            cur.name = s.name || cur.name;
                            if (s.stance) cur.stance = s.stance;
                            if (s.note) cur.note = s.note;
                            if (s.acting) {
                                cur.acting = true;
                                cur.actingReason = s.actingReason || '';
                            }
                        }
                    });
                    this._superintendentStatusLoaded = true;
                    console.log(`[SuperintendentStatus] Loaded: ${data._meta?.totalCount || '?'}명, updated ${data._meta?.lastUpdated || 'unknown'}`);
                })
                .catch(err => {
                    console.warn('[SuperintendentStatus] Failed to load:', err);
                });
        },

        // ── 교육감 후보 데이터 (superintendent.json) 로드 ──
        _superintendentCandidatesCache: null,
        loadSuperintendentCandidates() {
            if (this._superintendentCandidatesCache) return Promise.resolve(this._superintendentCandidatesCache);
            return fetch('data/candidates/superintendent.json')
                .then(r => r.ok ? r.json() : null)
                .then(data => {
                    this._superintendentCandidatesCache = data;
                    // superintendent.json의 후보를 기존 superintendents 데이터에 반영
                    if (data?.candidates) {
                        Object.entries(data.candidates).forEach(([regionKey, candidates]) => {
                            if (!superintendents[regionKey]) return;
                            // WITHDRAWN이 아닌 후보만
                            superintendents[regionKey].candidates = candidates
                                .filter(c => c.status !== 'WITHDRAWN')
                                .map(c => ({
                                    name: c.name,
                                    stance: c.stance || '중도',
                                    support: null,
                                    career: c.career || '',
                                    status: c.status,
                                    pledges: c.pledges || [],
                                    dataSource: c.dataSource,
                                }));
                        });
                    }
                    console.log(`[SuperintendentCandidates] Loaded: ${data?._meta?.lastUpdated || 'unknown'}`);
                    return data;
                })
                .catch(err => {
                    console.warn('[SuperintendentCandidates] Failed to load:', err);
                    return null;
                });
        },

        // ── 광역단체장 현황 외부 JSON 로드 API ──
        _governorStatusLoaded: false,
        loadGovernorStatus() {
            if (this._governorStatusLoaded) return Promise.resolve();
            return fetch('data/candidates/governor_status.json')
                .then(r => r.ok ? r.json() : null)
                .then(data => {
                    if (!data?.governors) return;
                    Object.entries(data.governors).forEach(([regionKey, g]) => {
                        if (!regions[regionKey]) return;
                        const existing = regions[regionKey].currentGovernor || {};
                        // acting 필드가 외부 JSON에 명시적으로 있을 때만 갱신, 없으면 기존 data.js 상태 보존
                        if ('acting' in g) {
                            regions[regionKey].currentGovernor = {
                                name: g.name || null,
                                party: g.party || 'independent'
                            };
                            if (g.acting) {
                                regions[regionKey].actingHead = {
                                    name: g.actingHead || null,
                                    reason: g.actingReason || ''
                                };
                                regions[regionKey].currentGovernor.acting = true;
                                regions[regionKey].currentGovernor.actingReason = g.actingReason || '';
                            } else {
                                delete regions[regionKey].actingHead;
                            }
                        } else if (existing.acting) {
                            // 외부 JSON에 acting 필드 없음 → 기존 권한대행 상태 보존
                            regions[regionKey].currentGovernor = {
                                ...existing,
                                party: existing.party || 'independent'
                            };
                        } else {
                            regions[regionKey].currentGovernor = {
                                name: g.name || null,
                                party: g.party || 'independent'
                            };
                        }
                    });
                    this._governorStatusLoaded = true;
                    const meta = data._meta || {};
                    console.log(`[GovernorStatus] Loaded: ${meta.totalCount || '?'}명, 권한대행 ${meta.actingCount || '?'}명, updated ${meta.lastUpdated || 'unknown'}`);
                })
                .catch(err => {
                    console.warn('[GovernorStatus] Failed to load:', err);
                });
        },

        // ── 기초단체장 현황 외부 JSON 로드 API ──
        _mayorStatusLoaded: false,
        loadMayorStatus() {
            if (this._mayorStatusLoaded) return Promise.resolve();
            return fetch('data/candidates/mayor_status.json')
                .then(r => r.ok ? r.json() : null)
                .then(data => {
                    if (!data?.mayors) return;
                    // 외부 JSON으로 subRegionData의 mayor 필드 갱신
                    Object.entries(data.mayors).forEach(([key, m]) => {
                        const regionKey = m.region;
                        const district = m.district;
                        const subRegions = subRegionData[regionKey];
                        if (!subRegions) return;
                        const target = subRegions.find(s => s.name === district);
                        if (!target) return;
                        const existingMayor = target.mayor || {};
                        if ('acting' in m) {
                            target.mayor = {
                                name: m.name || null,
                                party: m.party || 'independent'
                            };
                            if (m.acting) {
                                target.mayor.acting = true;
                                target.mayor.actingReason = m.actingReason || '';
                            }
                        } else if (existingMayor.acting) {
                            target.mayor = { ...existingMayor };
                        } else {
                            target.mayor = {
                                name: m.name || null,
                                party: m.party || 'independent'
                            };
                        }
                        // leadParty도 현직자 정당으로 동기화 (지도 색상 반영)
                        if (m.party && !m.acting) {
                            target.leadParty = m.party;
                        }
                    });
                    this._mayorStatusLoaded = true;
                    const meta = data._meta || {};
                    console.log(`[MayorStatus] Loaded: ${meta.totalCount || '?'}명, 권한대행 ${meta.actingCount || '?'}명, updated ${meta.lastUpdated || 'unknown'}`);
                })
                .catch(err => {
                    console.warn('[MayorStatus] Failed to load:', err);
                });
        },

        // ── 후보자 외부 JSON 로드 API ──
        _candidatesLoaded: false,
        loadCandidatesData() {
            if (this._candidatesLoaded) return Promise.resolve();
            return fetch('data/candidates/governor.json')
                .then(r => r.ok ? r.json() : null)
                .then(data => {
                    if (!data?.candidates) return;
                    // 외부 JSON 후보를 regions에 주입 (기존 하드코딩 대체)
                    Object.entries(data.candidates).forEach(([key, candidates]) => {
                        if (regions[key]) {
                            regions[key].candidates = candidates;
                        }
                    });
                    this._candidatesLoaded = true;
                    console.log(`[CandidateData] Loaded: ${Object.keys(data.candidates).length} regions, updated ${data._meta?.lastUpdated || 'unknown'}`);
                })
                .catch(err => {
                    console.warn('[CandidateData] Failed to load external candidates, using embedded data:', err);
                });
        },

        // ── 선관위 여론조사 실데이터 API ──
        _pollsCache: null,
        loadPollsData() {
            if (this._pollsCache) return Promise.resolve(this._pollsCache);
            return fetch('data/polls/polls.json')
                .then(r => r.ok ? r.json() : null)
                .then(data => { this._pollsCache = data; return data; })
                .catch(() => null);
        },
        getPollsForSelection(regionKey, electionType, districtName = null) {
            const polls = this._pollsCache?.regions?.[regionKey];
            if (!polls || !polls.length) return [];

            const region = this.getRegion(regionKey);
            const regionName = region?.name || '';
            const canonicalDistrict = districtName
                ? (this.getSubRegionByName(regionKey, districtName)?.name || districtName)
                : null;
            const officeKeyword = canonicalDistrict
                ? (canonicalDistrict.endsWith('군') ? '군수' : canonicalDistrict.endsWith('구') ? '구청장' : '시장')
                : '';
            const normalizeText = (value) => String(value || '').replace(/\s+/g, ' ').trim();
            const getPollDateValue = (poll) => {
                const publish = poll?.publishDate ? new Date(poll.publishDate) : null;
                if (publish && !isNaN(publish)) return publish.getTime();
                const surveyEnd = poll?.surveyDate?.end ? new Date(poll.surveyDate.end) : null;
                if (surveyEnd && !isNaN(surveyEnd)) return surveyEnd.getTime();
                const surveyStart = poll?.surveyDate?.start ? new Date(poll.surveyDate.start) : null;
                if (surveyStart && !isNaN(surveyStart)) return surveyStart.getTime();
                return 0;
            };
            const hasGovernorTitle = (title) => /광역단체장선거/.test(title);
            const hasMayorTitle = (title) => /기초단체장선거|시장선거|군수선거|구청장선거|시장 선거|군수 선거|구청장 선거/.test(title);
            const hasSuperintendentTitle = (title) => /교육감선거/.test(title);

            // 무효 후보명 (파싱 오류)
            const invalidNames = new Set([
                '내린','사보다','주보다','올랐다','없다','상승한',
                '위원회','역시장','밖인','타인물','회의원','정업무','권역',
                '전남','광주','전북','경남','경북','충남','충북','강원','울산','세종',
                '대변인','대구','부산','인천','대전','서울','경기','제주',
                '여성','남성','잘함','못함','한국당','민생당','정의당',
                '기본부','도지사','시장','군수','구청장',
                // 3라운드 크로스체크에서 발견된 PDF 파싱 쓰레기
                '마쳐야','사퇴','소속','중앙일보','엠브레인퍼블릭','중마동','정당',
                '지지율','지지도','후보','적합도','과반','기타','모름','무응답',
                // 뉴스 파싱 쓰레기 (지역명, 통계용어 등)
                '경인권','충청권','하락한','호남권','영남권','수도권',
                '잘모름','무당층','중도층','보수층','진보층','포인트',
                // 뉴스 파싱 2차 검증 추가
                '수석','지사','합계','응답','소속인','북도의원',
                // 실데이터 검증에서 반복 확인된 오염 토큰
                '비후보','항시장','비서실','경일보','일신문','양뉴스',
                '구소장','공약','전문성','경험','가능성','이어','부의장','부지사'
                ,'기타후보','잘모르겠다','적합한','경북교육감','통합교육감'
            ]);
            const isValidResultName = (name) => {
                const normalized = normalizeText(name);
                if (!normalized || normalized.length < 2 || normalized.length > 5) return false;
                if (invalidNames.has(normalized)) return false;
                if (!/^[가-힣]+$/.test(normalized)) return false;
                if (/표본|조사|샘플|오차|응답|신뢰|가중|전체|전 체|무선|유선|명$/.test(normalized)) return false;
                return true;
            };
            const getResultNames = (poll) => (poll.results || [])
                .map(r => normalizeText(r.candidateName))
                .filter(isValidResultName);

            // 대선/전국 단위 후보
            const nationalPresidentialNames = new Set([
                '이재명','김문수','이준석','한덕수','권성동',
                '여영국','조원진','심상정','오준호'
            ]);

            // 전국 주요 정치인 정당 사전 (여론조사에서 party null로 나오는 인사들)
            const knownPoliticianParty = {
                // 서울
                '정원오': 'democratic', '박주민': 'democratic', '김영배': 'democratic',
                '전현희': 'democratic', '김형남': 'democratic', '서영교': 'democratic',
                '오세훈': 'ppp', '나경원': 'ppp', '윤희숙': 'ppp', '이상규': 'ppp',
                '김정철': 'newReform', '한동훈': 'independent',
                '조국': 'reform',
                // 부산
                '전재수': 'democratic', '이재성': 'democratic',
                '박형준': 'ppp', '주진우': 'ppp',
                '윤택근': 'progressive', '정이한': 'newReform',
                // 대구
                '이진숙': 'ppp', '추경호': 'ppp', '주호영': 'ppp', '윤재옥': 'ppp',
                '최은석': 'ppp', '유영하': 'ppp', '홍석준': 'ppp',
                '김부겸': 'democratic',
                // 인천
                '박찬대': 'democratic', '유정복': 'ppp',
                // 광주
                '강기정': 'democratic', '이용섭': 'democratic', '신정훈': 'democratic',
                '정준호': 'democratic', '주철현': 'democratic', '이개호': 'democratic',
                '민형배': 'democratic', '이종욱': 'progressive', '이정현': 'ppp',
                // 대전
                '이장우': 'ppp', '허태정': 'democratic', '이동섭': 'democratic',
                // 울산
                '김두겸': 'ppp', '김종훈': 'democratic', '송철호': 'democratic',
                // 세종
                '최민호': 'ppp', '이춘희': 'democratic', '이준배': 'ppp',
                '조상호': 'democratic', '김수현': 'democratic', '황운하': 'reform',
                '고준일': 'democratic', '장철민': 'democratic', '강승규': 'ppp',
                '장동혁': 'ppp', '윤창현': 'ppp', '정구국': 'democratic',
                '장종태': 'democratic', '박수현': 'democratic',
                // 경기
                '김동연': 'democratic', '김은혜': 'ppp', '유동규': 'democratic',
                '송영길': 'democratic', '김동근': 'ppp',
                // 강원
                '김진태': 'ppp', '이광재': 'democratic',
                // 충북
                '조길형': 'ppp', '노영민': 'democratic', '이시종': 'democratic',
                '도종환': 'democratic', '송기섭': 'ppp',
                // 충남
                '김태흠': 'ppp', '양승조': 'democratic', '복기왕': 'democratic',
                '나소열': 'democratic', '소병훈': 'democratic',
                // 전북
                '김관영': 'democratic', '이춘석': 'democratic', '한정애': 'democratic',
                // 전남
                '김영록': 'democratic', '노관규': 'ppp',
                // 경북
                '이철우': 'ppp', '이강덕': 'ppp', '권오을': 'democratic',
                '김선동': 'independent',
                // 경남
                '박완수': 'ppp', '양문석': 'democratic', '전진숙': 'democratic',
                // 제주
                '오영훈': 'democratic', '고광효': 'ppp', '양윤녕': 'democratic'
            };

            const regionKnownNames = {
                seoul: ['전현희','김형남','서영교','오세훈','나경원','윤희숙','이상규','김정철','한동훈','조국'],
                busan: ['전재수','이재성','박형준','주진우','윤택근','정이한'],
                daegu: ['이진숙','추경호','주호영','윤재옥','최은석','유영하','홍석준','김부겸'],
                incheon: ['박찬대','유정복'],
                gwangju: ['강기정','이용섭','신정훈','정준호','주철현','이개호','민형배','이종욱','이정현'],
                daejeon: ['이장우','허태정','이동섭'],
                ulsan: ['김두겸','김종훈','송철호'],
                sejong: ['최민호','이춘희','이준배','조상호','김수현','황운하','고준일','장철민','강승규','장동혁','윤창현','정구국','장종태','박수현'],
                gyeonggi: ['김동연','김은혜','유동규','송영길','김동근'],
                gangwon: ['김진태','이광재'],
                chungbuk: ['조길형','노영민','이시종','도종환','송기섭'],
                chungnam: ['김태흠','양승조','복기왕','나소열','소병훈'],
                jeonbuk: ['김관영','이춘석','한정애'],
                jeonnam: ['김영록','노관규'],
                gyeongbuk: ['이철우','이강덕','권오을','김선동'],
                gyeongnam: ['박완수','양문석','전진숙'],
                jeju: ['오영훈','고광효','양윤녕']
            };

            const governorCandidateNames = new Set((region?.candidates || []).map(c => c.name).filter(Boolean));
            (regionKnownNames[regionKey] || []).forEach(name => governorCandidateNames.add(name));

            const otherGovernorCandidates = new Set();
            Object.entries(regions).forEach(([key, regionData]) => {
                if (key === regionKey) return;
                (regionData?.candidates || []).forEach(candidate => {
                    if (candidate?.name && !governorCandidateNames.has(candidate.name)) {
                        otherGovernorCandidates.add(candidate.name);
                    }
                });
                (regionKnownNames[key] || []).forEach(name => {
                    if (!governorCandidateNames.has(name)) otherGovernorCandidates.add(name);
                });
            });

            const districtCandidateHints = new Set();
            if (canonicalDistrict) {
                const districtHintCounts = new Map();
                let districtHintPollCount = 0;
                polls.forEach(poll => {
                    const title = normalizeText(poll.title);
                    const municipality = normalizeText(poll.municipality);
                    if (!municipality && !title.includes(canonicalDistrict)) return;
                    if (municipality && municipality !== canonicalDistrict) return;
                    if (!(poll.electionType === 'district_mayor' || hasMayorTitle(title) || title.includes(officeKeyword))) return;
                    districtHintPollCount += 1;

                    getResultNames(poll).forEach(name => {
                        if (governorCandidateNames.has(name) || nationalPresidentialNames.has(name)) return;
                        districtHintCounts.set(name, (districtHintCounts.get(name) || 0) + 1);
                    });
                });

                const districtSummary = this.getDistrictSummary(regionKey, canonicalDistrict);
                if (districtSummary?.mayor?.name) districtCandidateHints.add(districtSummary.mayor.name);
                districtHintCounts.forEach((count, name) => {
                    if (districtHintPollCount <= 1 || count >= 2) {
                        districtCandidateHints.add(name);
                    }
                });
                if (districtHintCounts.size && districtCandidateHints.size <= (districtSummary?.mayor?.name ? 1 : 0)) {
                    [...districtHintCounts.entries()]
                        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'))
                        .slice(0, 4)
                        .forEach(([name]) => districtCandidateHints.add(name));
                }
            }

            let filtered = [...polls];

            // 2단계: 대통령·정당지지도 전용 조사 제외
            filtered = filtered.filter(p => {
                const title = normalizeText(p.title);
                if (title.includes('대통령')) return false;
                // 정당지지도 전용 조사 제외 (단체장/교육감 선거 병행 조사는 유지)
                if (title.includes('정당지지도') && !/단체장|교육감|시장|군수|구청장/.test(title)) return false;
                return true;
            });

            // 4단계: 결과 정제 (PDF 파싱 쓰레기 공격적 필터)
            filtered = filtered.map(p => {
                const cleanResults = (p.results || []).filter(r => {
                    const name = normalizeText(r.candidateName);
                    const party = r.party || '';
                    // 기본 유효성
                    if (!isValidResultName(name)) return false;
                    if (r.support <= 0) return false;
                    // PDF 파싱 쓰레기 패턴 제거
                    if (/\x00/.test(name) || /\x00/.test(party)) return false;  // null 문자
                    if (/cid:\d+/.test(name) || /cid:\d+/.test(party)) return false;  // CID 폰트 참조
                    // 지지율이 비현실적 (100% 또는 95% 등은 메타데이터)
                    if (r.support >= 90) return false;
                    return true;
                });
                return { ...p, results: cleanResults };
            }).filter(p => {
                // 결과가 없어도 메타데이터(조사기관, 날짜 등)가 있으면 유지
                // (PDF 미파싱 조사도 등록현황 카드로 표시)
                if (!p.results.length && !p.pollOrg) return false;
                return true;
            });

            // 5단계: 중복 제거
            const seen = new Set();
            filtered = filtered.filter(p => {
                const nttKey = p.nttId ? String(p.nttId) : null;
                if (nttKey && seen.has('ntt:' + nttKey)) return false;
                if (nttKey) seen.add('ntt:' + nttKey);

                const resultsFingerprint = (p.results || [])
                    .map(r => `${r.candidateName}:${r.support}`)
                    .sort()
                    .join('|');
                if (!resultsFingerprint) return true;
                const contentKey = `${p.pollOrg}|${resultsFingerprint}`;
                if (seen.has('fp:' + contentKey)) return false;
                seen.add('fp:' + contentKey);

                return true;
            });

            // 6단계: 정당 매칭 (3중 소스: poll 원본 → 후보 DB → 정치인 사전)
            const candidatePartyMap = {};
            if (region && region.candidates) {
                region.candidates.forEach(c => {
                    if (c.name && c.party) candidatePartyMap[c.name] = c.party;
                });
            }
            filtered = filtered.map(p => ({
                ...p,
                results: (p.results || []).map(r => {
                    if (r.party) return r; // 이미 있으면 유지
                    const name = r.candidateName;
                    const matched = candidatePartyMap[name] || knownPoliticianParty[name] || null;
                    return matched ? { ...r, party: matched } : r;
                })
            }));

            const selected = filtered.map(poll => {
                if (!electionType) {
                    return { ...poll, _selectionScore: 1 };
                }

                const title = normalizeText(poll.title);
                const municipality = normalizeText(poll.municipality);
                const resultNames = getResultNames(poll);
                const governorHits = resultNames.filter(name => governorCandidateNames.has(name)).length;
                const otherGovernorHits = resultNames.filter(name => otherGovernorCandidates.has(name)).length;
                const nationalHits = resultNames.filter(name => nationalPresidentialNames.has(name)).length;
                const districtHits = canonicalDistrict
                    ? resultNames.filter(name => districtCandidateHints.has(name)).length
                    : 0;
                const governorTitle = hasGovernorTitle(title);
                const mayorTitle = hasMayorTitle(title);
                const superintendentTitle = hasSuperintendentTitle(title) || poll.electionType === 'superintendent';
                const mentionsRegion = !!regionName && title.includes(regionName);
                const mentionsDistrict = canonicalDistrict
                    ? municipality === canonicalDistrict || title.includes(canonicalDistrict)
                    : false;

                let score = 0;
                let matched = false;

                if (electionType === 'governor') {
                    score += municipality ? -120 : 20;
                    if (poll.electionType === 'district_mayor') score -= 180;
                    if (governorTitle) score += 45;
                    if (poll.electionType === 'mayor' && !municipality) score += 8;
                    if (mayorTitle) score -= 24;
                    if (mayorTitle && !governorTitle) score -= 120;
                    if (superintendentTitle) score -= 32;
                    if (mentionsRegion) score += 10;
                    score += governorHits * 14;
                    score -= otherGovernorHits * 14;
                    score -= nationalHits * 20;
                    if (resultNames.length && governorHits === 0) score -= 70;
                    if (resultNames.length && governorHits === 0 && otherGovernorHits >= Math.max(2, Math.ceil(resultNames.length * 0.5))) {
                        score -= 80;
                    }
                    matched = !municipality && score >= 38;
                } else if (electionType === 'superintendent') {
                    score += municipality ? -120 : 20;
                    if (superintendentTitle) score += 52;
                    if (poll.electionType === 'superintendent') score += 16;
                    if (governorTitle) score -= 18;
                    if (mayorTitle) score -= 18;
                    score -= nationalHits * 10;
                    // 도지사 후보가 results에 있으면 혼합 조사 → 교육감에서 제외
                    if (governorHits >= 2) score -= 60;
                    matched = !municipality && score >= 40;
                } else if (electionType === 'mayor') {
                    if (canonicalDistrict) {
                        if (municipality && municipality !== canonicalDistrict) score -= 180;
                        if (mentionsDistrict) score += 60;
                        if (municipality === canonicalDistrict) score += 30;
                        if (mayorTitle) score += 35;
                        if (officeKeyword && title.includes(officeKeyword)) score += 18;
                        if (poll.electionType === 'district_mayor') score += 22;
                        if (municipality === canonicalDistrict && poll.electionType === 'mayor') score += 6;
                        if (governorTitle) score -= 18;
                        if (superintendentTitle) score -= 40;
                        score += districtHits * 16;
                        if (districtCandidateHints.size && resultNames.length && districtHits === 0) score -= 120;
                        score -= otherGovernorHits * 8;
                        score -= nationalHits * 18;
                        if (resultNames.length && governorHits >= Math.max(2, districtHits + 1)) score -= 80;
                        matched = mentionsDistrict && score >= 60;
                    } else {
                        score += municipality ? 28 : -100;
                        if (mayorTitle || poll.electionType === 'district_mayor') score += 26;
                        if (governorTitle && !mayorTitle) score -= 40;
                        else if (governorTitle && mayorTitle) score -= 8;
                        if (superintendentTitle) score -= 40;
                        score -= nationalHits * 18;
                        if (resultNames.length && governorHits >= Math.max(2, Math.ceil(resultNames.length * 0.5))) score -= 70;
                        matched = !!municipality && score >= 35;
                    }
                }

                if (!matched) return null;
                return {
                    ...poll,
                    _selectionScore: score,
                    _selectionMeta: {
                        regionKey,
                        electionType,
                        districtName: canonicalDistrict,
                        scope: canonicalDistrict ? 'district' : electionType
                    }
                };
            }).filter(Boolean);

            return selected.sort((a, b) => getPollDateValue(b) - getPollDateValue(a));
        },
        getPollsByRegion(regionKey, electionType, districtName = null) {
            return this.getPollsForSelection(regionKey, electionType, districtName);
        },
        getPollCandidates(regionKey, electionType = 'governor', districtName = null) {
            // 해당 지역 여론조사에서 등장한 후보자 목록 추출 (최신 2개 조사 기준)
            const polls = this.getPollsByRegion(regionKey, electionType, districtName).slice(0, 2);
            const seen = new Map();
            polls.forEach(p => {
                (p.results || []).forEach(r => {
                    if (r.candidateName && !seen.has(r.candidateName)) {
                        seen.set(r.candidateName, { name: r.candidateName, party: r.party || null });
                    }
                });
            });
            return [...seen.values()];
        },

        // ── 여론조사 표시용 API (classification 기반 필터 우선) ──
        getLatestPollsForDisplay(regionKey, electionType = 'governor', districtName = null) {
            // classification 필드가 있는 poll은 새 필터로 처리
            const allPolls = this._pollsCache?.regions?.[regionKey] || [];
            const classifiedPolls = allPolls.filter(p => p.classification);

            if (classifiedPolls.length > 0) {
                const typeMap = {
                    'governor': 'governor', 'superintendent': 'superintendent',
                    'mayor': 'mayor', 'byElection': 'byelection',
                    'council': 'council', 'localCouncil': 'localCouncil',
                };
                const targetType = typeMap[electionType] || electionType;
                const canonicalDistrict = districtName
                    ? (this.getSubRegionByName(regionKey, districtName)?.name || districtName)
                    : null;

                let filtered = classifiedPolls.filter(p => {
                    const cls = p.classification;
                    const types = cls.electionTypes || [];
                    const region = cls.region || {};

                    // 선거종류 매칭
                    if (!types.includes(targetType)) return false;

                    // 지역 매칭
                    if (targetType === 'governor' || targetType === 'superintendent') {
                        return region.level === 'metro' || region.level === 'national';
                    }
                    if (targetType === 'mayor' && canonicalDistrict) {
                        return region.municipality === canonicalDistrict || region.level === 'metro';
                    }
                    if (targetType === 'byelection') {
                        return true; // 재보궐은 regionKey로 이미 필터됨
                    }
                    return true;
                });

                // 정당 매핑 + 정렬
                const getPollDate = (p) => {
                    const d = p.publishDate || p.surveyDate?.end || '';
                    return d ? new Date(d).getTime() : 0;
                };
                filtered.sort((a, b) => getPollDate(b) - getPollDate(a));

                if (filtered.length > 0) return filtered;
            }

            // fallback: 기존 로직
            return this.getPollsForSelection(regionKey, electionType, districtName);
        },

        getTrendGroups(regionKey, electionType = 'governor', districtName = null) {
            // 같은 조사기관의 2회 이상 조사를 그룹핑 (추이 차트용)
            const polls = this.getPollsForSelection(regionKey, electionType, districtName);
            const groups = {};
            polls.forEach(p => {
                if (!p.results || p.results.length < 2) return;
                const key = p.pollOrg || 'unknown';
                if (!groups[key]) groups[key] = { pollOrg: key, polls: [] };
                groups[key].polls.push(p);
            });

            const result = Object.values(groups)
                .filter(g => g.polls.length >= 2)
                .sort((a, b) => {
                    const aDate = a.polls[0]?.publishDate || '';
                    const bDate = b.polls[0]?.publishDate || '';
                    return bDate.localeCompare(aDate);
                });

            // 같은 기관 2건+ 그룹이 없으면 → 전체 기관 통합 추이 (3건 이상일 때)
            if (result.length === 0) {
                const allWithResults = polls.filter(p => p.results && p.results.length >= 2);
                if (allWithResults.length >= 2) {
                    result.push({ pollOrg: '전체 기관 통합', polls: allWithResults, _merged: true });
                }
            }

            return result;
        },

        getLatestPollPerElection(regionKey) {
            // 선거유형별 최신 1건 반환
            const result = {};
            ['governor', 'superintendent', 'mayor'].forEach(type => {
                const polls = this.getPollsForSelection(regionKey, type);
                if (polls.length > 0) result[type] = polls[0];
            });
            return result;
        },

        // ── 선거 쟁점 개요 ──
        _overviewCache: null,
        loadElectionOverview() {
            if (this._overviewCache) return Promise.resolve(this._overviewCache);
            return fetch('data/election_overview.json?v=' + Date.now())
                .then(r => r.ok ? r.json() : null)
                .then(data => { this._overviewCache = data; return data; })
                .catch(() => null);
        },
        getElectionOverview(regionKey, electionType, districtName) {
            const cache = this._overviewCache;
            if (!cache) return null;
            if (electionType === 'byElection' && districtName) {
                // 재보궐: districtName이 byelection key (예: incheon-yeonsu)
                return cache?.byelection?.[districtName] || null;
            }
            if (electionType === 'superintendent') {
                return cache?.superintendent?.[regionKey] || null;
            }
            if (electionType === 'mayor' && districtName) {
                return cache?.mayor?.[regionKey]?.[districtName] || null;
            }
            // 기본: 광역단체장
            return cache?.regions?.[regionKey] || null;
        },

        // ── 기초단체장 역대 선거 데이터 ──
        _mayorHistoryCache: null,
        loadMayorHistory() {
            if (this._mayorHistoryCache) return Promise.resolve(this._mayorHistoryCache);
            return fetch('data/mayor_history.json')
                .then(r => r.ok ? r.json() : null)
                .then(data => { this._mayorHistoryCache = data; return data; })
                .catch(() => null);
        },
        getMayorHistoricalData(regionKey, districtName) {
            const cache = this._mayorHistoryCache;
            if (!cache?.history) return [];
            const key = `${regionKey}/${districtName}`;
            return cache.history[key] || [];
        },

        // 기존 호환용
        getProportionalCouncilData() {
            const data = this._proportionalCouncilCache;
            if (!data) return null;
            return {
                name: '광역의원 비례대표',
                seats: Object.values(data.regions || {}).reduce((s, r) => s + (r.totalSeats || 0), 0),
                ballot: '정당투표',
                lastTurnout: 50.9,
                note: '2022 제8회 지선',
                partyAllocation: [],
                keyIssues: ['정당 득표율 기반 의석배분', '3% 봉쇄조항(지방선거)', '비례성 논란']
            };
        },

        getProportionalLocalCouncilData() {
            const data = this._proportionalLocalCouncilCache;
            if (!data) return null;
            return {
                name: '기초의원 비례대표',
                seats: Object.values(data.regions || {}).reduce((s, r) => {
                    return s + Object.values(r.sigungus || {}).reduce((ss, sg) => ss + (sg.totalSeats || 0), 0);
                }, 0),
                ballot: '정당투표',
                lastTurnout: 50.9,
                note: '2022 제8회 지선',
                partyAllocation: [],
                keyIssues: ['시군구별 정당투표', '소수정당 진입장벽', '지역구 연동']
            };
        }
    };
})();
