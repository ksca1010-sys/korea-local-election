// ============================================
// 6.3 전국지방선거 인터랙티브 선거 정보 지도
// Election Data Module
// ============================================

const ElectionData = (() => {
    // 정당 정보 (민주당: 밝은 파랑, 혁신당: 진한 남색으로 구분)
    const parties = {
        democratic: { name: '더불어민주당', color: '#2E8BFF', shortName: '민주당' },
        ppp: { name: '국민의힘', color: '#E61E2B', shortName: '국민의힘' },
        reform: { name: '조국혁신당', color: '#0A1747', shortName: '혁신당' },
        newReform: { name: '개혁신당', color: '#FF7210', shortName: '개혁신당' },
        progressive: { name: '진보당', color: '#D6001C', shortName: '진보당' },
        newFuture: { name: '새로운미래', color: '#45B97C', shortName: '새미래' },
        independent: { name: '무당층', color: '#808080', shortName: '무당층' }
    };

    // 선거일 정보
    const electionDate = new Date('2026-06-03T00:00:00+09:00');
    const preVoteDates = {
        start: new Date('2026-05-29T06:00:00+09:00'),
        end: new Date('2026-05-30T18:00:00+09:00')
    };

    // 17개 시도 지역 데이터
    const regions = {
        'seoul': {
            code: '11', name: '서울특별시', nameEng: 'Seoul',
            population: 9411000, voters: 8234000,
            currentGovernor: { name: '오세훈', party: 'ppp', since: 2021 },
            prevElection: { winner: 'ppp', winnerName: '오세훈', rate: 59.0, runner: 'democratic', runnerName: '송영길', runnerRate: 39.2, turnout: 50.6 },
            keyIssues: ['주거 안정', '교통 인프라', '도시 재생', '미세먼지 대책'],
            subRegions: 25,
            candidates: [
                { id: 'seoul-1', name: '박영수', party: 'democratic', age: 55, career: '前 국회의원 3선 / 前 서울시 정무부시장', photo: null, pledges: ['서울형 기본주택 10만호 공급', '지하철 요금 동결 5년', 'AI 기반 스마트시티 전환'] },
                { id: 'seoul-2', name: '김태호', party: 'ppp', age: 58, career: '현 서울시장 (재선 도전) / 前 국회의원', photo: null, pledges: ['한강 르네상스 2.0', '도심 항공교통(UAM) 상용화', '서울 글로벌 톱5 도시'] },
                { id: 'seoul-3', name: '이정미', party: 'reform', age: 52, career: '현 국회의원 / 前 시민단체 대표', photo: null, pledges: ['서울시 부패 제로 선언', '공공임대 30% 확대', '재벌 특혜 차단'] }
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
            population: 3350000, voters: 2890000,
            currentGovernor: { name: '박형준', party: 'ppp', since: 2021 },
            prevElection: { winner: 'ppp', winnerName: '박형준', rate: 62.7, runner: 'democratic', runnerName: '김영춘', runnerRate: 34.1, turnout: 47.5 },
            keyIssues: ['가덕도 신공항', '도심 쇠퇴 대응', '청년 인구 유출', '해양 관광'],
            subRegions: 16,
            candidates: [
                { id: 'busan-1', name: '정민기', party: 'democratic', age: 50, career: '현 국회의원 / 前 부산시 경제부시장', photo: null, pledges: ['가덕도 신공항 조기 완공', '부산형 청년 주거 지원', '원도심 재생 프로젝트'] },
                { id: 'busan-2', name: '한성윤', party: 'ppp', age: 56, career: '현 부산시장 (재선 도전) / 前 대학교수', photo: null, pledges: ['2030 엑스포 후속 도시개발', '스마트 해양도시 구축', '부산 메가시티 완성'] },
                { id: 'busan-3', name: '최영진', party: 'newReform', age: 48, career: '前 부산시의원 / 시민운동가', photo: null, pledges: ['부산 교통 혁신', '소상공인 지원 확대', '부산 문화 수도 선언'] }
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
            population: 2385000, voters: 2050000,
            currentGovernor: { name: '김정기', party: '-', since: 2025, acting: true, actingReason: '홍준표 대선 출마 사퇴' },
            prevElection: { winner: 'ppp', winnerName: '홍준표', rate: 78.75, runner: 'democratic', runnerName: '곽상언', runnerRate: 21.25, turnout: 48.1 },
            keyIssues: ['대구경북통합신공항', '산업 구조 전환', '인구 감소', '의료 인프라'],
            subRegions: 8,
            candidates: [
                { id: 'daegu-1', name: '서동민', party: 'democratic', age: 54, career: '前 국회의원 / 변호사', photo: null, pledges: ['대구 산업 혁신 벨리', '청년 일자리 5만개', '대중교통 무료화'] },
                { id: 'daegu-2', name: '윤재호', party: 'ppp', age: 60, career: '前 국회의원 3선 / 前 당대표', photo: null, pledges: ['대구경북통합신공항 완성', '첨단산업 유치', '대구 메디시티 조성'] }
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
            population: 2948000, voters: 2520000,
            currentGovernor: { name: '유정복', party: 'ppp', since: 2022 },
            prevElection: { winner: 'ppp', winnerName: '유정복', rate: 52.1, runner: 'democratic', runnerName: '박남춘', runnerRate: 44.5, turnout: 49.2 },
            keyIssues: ['인천공항 연계 발전', '수도권 교통', '영종도 개발', '제조업 활성화'],
            subRegions: 10,
            candidates: [
                { id: 'incheon-1', name: '이상현', party: 'democratic', age: 52, career: '현 국회의원 / 前 인천시 행정부시장', photo: null, pledges: ['GTX-D 조기 추진', '인천형 스마트산단 조성', '서해안 관광벨트'] },
                { id: 'incheon-2', name: '조성빈', party: 'ppp', age: 57, career: '현 인천시장 (재선 도전) / 前 구청장', photo: null, pledges: ['인천 제2경제자유구역', '바이오 의료 허브', '인천 문화 올림픽'] },
                { id: 'incheon-3', name: '강미정', party: 'reform', age: 47, career: '前 시의원 / 환경운동가', photo: null, pledges: ['인천 환경 재생', '공공의료 확대', '청년 창업 지원'] }
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
            population: 1441000, voters: 1230000,
            currentGovernor: { name: '강기정', party: 'democratic', since: 2022 },
            prevElection: { winner: 'democratic', winnerName: '강기정', rate: 74.91, runner: 'democratic', runnerName: '이용섭', runnerRate: 25.09, turnout: 37.66 },
            keyIssues: ['광주-전남 행정통합', 'AI 산업 육성', '광주형 일자리', '문화수도'],
            subRegions: 5,
            candidates: [
                { id: 'gwangju-1', name: '남궁현', party: 'democratic', age: 53, career: '현 광주시장 (재선 도전) / 前 비서실장', photo: null, pledges: ['AI 산업 수도 광주', '광주-전남 메가시티', '광주형 기본소득'] },
                { id: 'gwangju-2', name: '유광수', party: 'reform', age: 49, career: '현 국회의원 / 前 시민단체 대표', photo: null, pledges: ['광주 비리 척결', '시민 참여 예산제', '녹색 교통 혁명'] }
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
            population: 1452000, voters: 1240000,
            currentGovernor: { name: '이장우', party: 'ppp', since: 2022 },
            prevElection: { winner: 'ppp', winnerName: '이장우', rate: 50.2, runner: 'democratic', runnerName: '허태정', runnerRate: 45.5, turnout: 49.8 },
            keyIssues: ['대전-충남 행정통합', '과학기술 클러스터', '도심 교통', '세종시 연계'],
            subRegions: 5,
            candidates: [
                { id: 'daejeon-1', name: '장세윤', party: 'democratic', age: 51, career: '현 국회의원 / 前 대전시 정무부시장', photo: null, pledges: ['대전 과학벨트 활성화', 'BRT 확대', '대전-세종 광역교통망'] },
                { id: 'daejeon-2', name: '신동원', party: 'ppp', age: 55, career: '현 대전시장 (재선 도전) / 前 구청장', photo: null, pledges: ['대전 첨단산업 허브', '유성 과학단지 글로벌화', '스마트시티 대전'] }
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
            population: 1121000, voters: 950000,
            currentGovernor: { name: '김두겸', party: 'ppp', since: 2022 },
            prevElection: { winner: 'ppp', winnerName: '김두겸', rate: 55.8, runner: 'democratic', runnerName: '송철호', runnerRate: 40.5, turnout: 50.1 },
            keyIssues: ['자동차 산업 전환', '수소 경제', '울산 혁신도시', '환경 문제'],
            subRegions: 5,
            candidates: [
                { id: 'ulsan-1', name: '배준호', party: 'democratic', age: 53, career: '前 국회의원 / 노동운동가 출신', photo: null, pledges: ['울산 친환경 산업전환', '노동자 안전 강화', '울산형 주거 복지'] },
                { id: 'ulsan-2', name: '정희수', party: 'ppp', age: 58, career: '현 울산시장 (재선 도전) / 前 시의원', photo: null, pledges: ['수소 경제 수도 울산', '동해안 관광벨트', '울산 스마트팩토리'] }
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
            population: 388000, voters: 310000,
            currentGovernor: { name: '최민호', party: 'ppp', since: 2022 },
            prevElection: { winner: 'ppp', winnerName: '최민호', rate: 49.5, runner: 'democratic', runnerName: '이춘희', runnerRate: 46.8, turnout: 52.3 },
            keyIssues: ['행정수도 완성', '세종-대전 연계', '신도시 인프라', '교육 환경'],
            subRegions: 1,
            candidates: [
                { id: 'sejong-1', name: '고민석', party: 'democratic', age: 48, career: '前 세종시 부시장 / 행정고시 출신', photo: null, pledges: ['행정수도 완성', '세종 트램 조기 착공', '세종형 스마트시티'] },
                { id: 'sejong-2', name: '임재석', party: 'ppp', age: 52, career: '현 세종시장 (재선 도전)', photo: null, pledges: ['세종 자족도시 완성', '국제기구 유치', '교육 특구 조성'] }
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
            population: 13560000, voters: 11500000,
            currentGovernor: { name: '김동연', party: 'democratic', since: 2022 },
            prevElection: { winner: 'democratic', winnerName: '김동연', rate: 51.2, runner: 'ppp', runnerName: '김은혜', runnerRate: 45.8, turnout: 50.8 },
            keyIssues: ['GTX 완성', '신도시 교통', '반도체 클러스터', '수도권 균형발전'],
            subRegions: 31,
            candidates: [
                { id: 'gyeonggi-1', name: '문상호', party: 'democratic', age: 56, career: '현 경기도지사 (재선 도전) / 前 경제부총리', photo: null, pledges: ['경기도 반도체 밸리', 'GTX 완전 개통', '경기형 기본주거'] },
                { id: 'gyeonggi-2', name: '안현수', party: 'ppp', age: 54, career: '현 국회의원 / 前 성남시장', photo: null, pledges: ['경기 북부 신도시', '교통 혁명 10대 프로젝트', '경기도 규제 프리존'] },
                { id: 'gyeonggi-3', name: '홍서연', party: 'reform', age: 45, career: '현 국회의원 / 시민운동가', photo: null, pledges: ['경기도 부패 청산', '공공의료 확대', '환경 정의 실현'] }
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
            population: 1538000, voters: 1320000,
            currentGovernor: { name: '김진태', party: 'ppp', since: 2022 },
            prevElection: { winner: 'ppp', winnerName: '김진태', rate: 53.8, runner: 'democratic', runnerName: '이광재', runnerRate: 43.2, turnout: 52.5 },
            keyIssues: ['관광 산업 활성화', '인구 소멸 대응', '특별자치도 자치권', '동해안 개발'],
            subRegions: 18,
            candidates: [
                { id: 'gangwon-1', name: '윤호진', party: 'democratic', age: 50, career: '前 국회의원 / 前 원주시장', photo: null, pledges: ['강원 관광 르네상스', '인구 소멸 대응 특별법', '강원 교통 혁신'] },
                { id: 'gangwon-2', name: '박재경', party: 'ppp', age: 58, career: '현 강원도지사 (재선 도전)', photo: null, pledges: ['올림픽 레거시 활용', '강원 바이오 산업 육성', '특별자치도 완성'] }
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
            population: 1597000, voters: 1350000,
            currentGovernor: { name: '김영환', party: 'ppp', since: 2022 },
            prevElection: { winner: 'ppp', winnerName: '김영환', rate: 50.5, runner: 'democratic', runnerName: '노영민', runnerRate: 45.2, turnout: 51.8 },
            keyIssues: ['오송 참사 후속대책', '바이오 산업', '충북선 고속화', '균형발전'],
            subRegions: 11,
            candidates: [
                { id: 'chungbuk-1', name: '이동건', party: 'democratic', age: 52, career: '현 국회의원 / 前 청주시 부시장', photo: null, pledges: ['충북 안전도시 선언', '바이오 메디컬 허브', '충북선 KTX 추진'] },
                { id: 'chungbuk-2', name: '차명진', party: 'ppp', age: 56, career: '현 충북도지사 (재선 도전)', photo: null, pledges: ['충북 혁신성장 플랜', '오창 과학단지 확대', '충북 물류 허브'] }
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
            population: 2119000, voters: 1800000,
            currentGovernor: { name: '김태흠', party: 'ppp', since: 2022 },
            prevElection: { winner: 'ppp', winnerName: '김태흠', rate: 51.8, runner: 'democratic', runnerName: '양승조', runnerRate: 43.5, turnout: 51.2 },
            keyIssues: ['대전-충남 행정통합', '서해안 산업벨트', '농업 혁신', '천안-아산 메가시티'],
            subRegions: 15,
            candidates: [
                { id: 'chungnam-1', name: '황교현', party: 'democratic', age: 54, career: '前 국회의원 / 前 천안시장', photo: null, pledges: ['충남 농업 혁신', '서해안 관광 개발', '충남형 돌봄 체계'] },
                { id: 'chungnam-2', name: '송민규', party: 'ppp', age: 57, career: '현 충남도지사 (재선 도전)', photo: null, pledges: ['충남 첨단산업 유치', '충남 교통 혁명', '내포신도시 완성'] }
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
            population: 1786000, voters: 1520000,
            currentGovernor: { name: '김관영', party: 'democratic', since: 2022 },
            prevElection: { winner: 'democratic', winnerName: '김관영', rate: 48.5, runner: 'democratic', runnerName: '이성윤', runnerRate: 29.8, turnout: 48.5 },
            keyIssues: ['특별자치도 자치권', '새만금 개발', '탄소중립', '농생명 산업'],
            subRegions: 14,
            candidates: [
                { id: 'jeonbuk-1', name: '전영수', party: 'democratic', age: 55, career: '현 전북도지사 (재선 도전)', photo: null, pledges: ['새만금 완성', '전북 탄소중립 수도', '특별자치도 자치권 확대'] },
                { id: 'jeonbuk-2', name: '임성호', party: 'reform', age: 47, career: '현 국회의원 / 前 시민단체 대표', photo: null, pledges: ['전북 비리 척결', '청년 농부 육성', '지방소멸 대응'] }
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
            population: 1832000, voters: 1580000,
            currentGovernor: { name: '김영록', party: 'democratic', since: 2018 },
            prevElection: { winner: 'democratic', winnerName: '김영록', rate: 62.5, runner: 'democratic', runnerName: '양기대', runnerRate: 18.2, turnout: 46.8 },
            keyIssues: ['광주-전남 행정통합', '에너지 전환', '농어촌 활성화', '인구 소멸'],
            subRegions: 22,
            candidates: [
                { id: 'jeonnam-1', name: '박승현', party: 'democratic', age: 57, career: '前 국회의원 / 前 해남군수', photo: null, pledges: ['전남 신재생에너지 허브', '농어촌 활력 프로젝트', '전남 관광 르네상스'] },
                { id: 'jeonnam-2', name: '구자은', party: 'reform', age: 50, career: '현 국회의원', photo: null, pledges: ['전남 공정사회 실현', '청년 귀농 지원', '전남 의료 인프라 확충'] }
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
            population: 2626000, voters: 2280000,
            currentGovernor: { name: '이철우', party: 'ppp', since: 2018 },
            prevElection: { winner: 'ppp', winnerName: '이철우', rate: 77.95, runner: 'democratic', runnerName: '오중기', runnerRate: 22.04, turnout: 49.5 },
            keyIssues: ['포항 지진 복구', '경북 북부 발전', '울릉도 개발', '반도체 산업'],
            subRegions: 23,
            candidates: [
                { id: 'gyeongbuk-1', name: '오성택', party: 'democratic', age: 53, career: '前 국회의원 / 前 포항시 부시장', photo: null, pledges: ['경북 균형 발전', '포항 안전도시', '경북 청년 일자리'] },
                { id: 'gyeongbuk-2', name: '권대호', party: 'ppp', age: 59, career: '前 국회의원 3선 / 前 경북도 행정부지사', photo: null, pledges: ['경북 반도체 벨트', '동해안 에너지 클러스터', '경북 관광 100만'] }
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
            population: 3314000, voters: 2850000,
            currentGovernor: { name: '박완수', party: 'ppp', since: 2022 },
            prevElection: { winner: 'ppp', winnerName: '박완수', rate: 55.8, runner: 'democratic', runnerName: '양문석', runnerRate: 40.2, turnout: 49.8 },
            keyIssues: ['조선 산업 부활', '진주 혁신도시', '김해 가덕도 연계', '농촌 활성화'],
            subRegions: 18,
            candidates: [
                { id: 'gyeongnam-1', name: '하윤정', party: 'democratic', age: 51, career: '현 국회의원 / 前 창원시 부시장', photo: null, pledges: ['경남 조선 산업 부활', '경남형 돌봄 체계', '남해안 관광벨트'] },
                { id: 'gyeongnam-2', name: '김용태', party: 'ppp', age: 55, career: '현 경남도지사 (재선 도전)', photo: null, pledges: ['경남 방산 클러스터', '창원 스마트시티', '경남 수소 경제'] }
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
            population: 676000, voters: 560000,
            currentGovernor: { name: '오영훈', party: 'democratic', since: 2022 },
            prevElection: { winner: 'democratic', winnerName: '오영훈', rate: 48.5, runner: 'ppp', runnerName: '허향진', runnerRate: 38.2, turnout: 53.5 },
            keyIssues: ['제주 제2공항', '관광 산업 혁신', '환경 보전', '이주민 정책'],
            subRegions: 2,
            candidates: [
                { id: 'jeju-1', name: '양윤서', party: 'democratic', age: 50, career: '현 제주도지사 (재선 도전)', photo: null, pledges: ['제주 탄소제로섬', '제주형 관광 혁신', '제주 청년 정착 지원'] },
                { id: 'jeju-2', name: '김동현', party: 'ppp', age: 54, career: '前 국회의원 / 前 제주시장', photo: null, pledges: ['제주 제2공항 추진', '제주 의료 관광 허브', '제주 농업 수출 확대'] },
                { id: 'jeju-3', name: '고은비', party: 'independent', age: 44, career: '환경운동가 / 前 도의원', photo: null, pledges: ['제주 환경 최우선', '오버투어리즘 해결', '제주 원도심 재생'] }
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
            { name: '광역의원', count: 789, description: '시도의회의원 선거' },
            { name: '기초의원', count: 2927, description: '시군구의회의원 선거' },
            { name: '교육감', count: 17, description: '시도교육감 선거' },
            { name: '비례대표 광역의원', count: 85, description: '시도의회 비례대표' },
            { name: '비례대표 기초의원', count: 340, description: '시군구의회 비례대표' }
        ],
        byElection: {
            name: '국회의원 재보궐선거',
            count: 4,
            districts: ['인천 계양구을', '충남 아산시을', '경기 평택시을', '전북 군산·김제·부안갑']
        }
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
    // 데일리 오피니언 제654호 (2026년 3월 1주)
    const gallupNationalPoll = {
        source: '한국갤럽',
        surveyDate: '2026년 3월 1주',
        publishDate: '2026-03-05',
        sampleSize: 1001,
        method: '',
        confidence: '95%',
        margin: 3.1,
        responseRate: '',
        reportNo: '데일리 오피니언 제654호',
        url: 'https://www.gallup.co.kr/gallupdb/reportContent.asp?seqNo=1624',
        data: {
            democratic: 46,
            ppp: 21,
            reform: 3,
            newReform: 2,
            independent: 26
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
            count: 789,
            description: '시도의회의원 선거',
            detail: '시·도의회 지역구 의원을 선출합니다. 광역자치단체의 조례 제정, 예산 심의 등 입법 기능을 수행합니다.',
            term: '4년',
            votersPer: '유권자 1인당 1표 (+ 비례대표 1표)'
        },
        localCouncil: {
            name: '기초의원',
            count: 2927,
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
        byElection: {
            name: '재보궐선거',
            count: 4,
            description: '국회의원 보궐선거',
            detail: '공석이 된 4개 국회의원 지역구(서울 종로, 부산 연제, 인천 계양을, 경기 화성갑)의 보궐선거입니다.',
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
            { name: '용산구', population: 228000, leadParty: 'ppp', mayor: { name: '박희영', party: 'ppp' }, keyIssue: '용산공원 개발' ,
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
            { name: '강서구', population: 565000, leadParty: 'ppp', mayor: { name: '진교훈', party: 'democratic' }, keyIssue: '마곡지구 개발' ,
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
            { name: '관악구', population: 488000, leadParty: 'ppp', mayor: { name: '박준희', party: 'ppp' }, keyIssue: '청년 주거' ,
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
            { name: '남구', population: 261000, leadParty: 'democratic', mayor: { name: '오은택', party: 'ppp' }, keyIssue: '유엔기념공원' ,
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
            { name: '금정구', population: 228000, leadParty: 'ppp', mayor: { name: '윤일현', party: 'ppp' }, keyIssue: '대학가 활성화' ,
            voters: 200445,
            prevElection: { turnout: 51.3 } },
            { name: '강서구', population: 120000, leadParty: 'ppp', mayor: { name: '김형찬', party: 'ppp' }, keyIssue: '가덕도 신공항' },
            { name: '연제구', population: 204000, leadParty: 'ppp', mayor: { name: '주석수', party: 'ppp' }, keyIssue: '행정중심' ,
            voters: 180173,
            prevElection: { turnout: 51.1 } },
            { name: '수영구', population: 170000, leadParty: 'ppp', mayor: { name: '강성태', party: 'ppp' }, keyIssue: '해양스포츠' ,
            voters: 156247,
            prevElection: { turnout: 47.9 } },
            { name: '사상구', population: 211000, leadParty: 'ppp', mayor: { name: '조병길', party: 'ppp' }, keyIssue: '산업단지 전환' ,
            voters: 184625,
            prevElection: { turnout: 47.5 } },
            { name: '기장군', population: 188000, leadParty: 'ppp', mayor: { name: '정종복', party: 'ppp' }, keyIssue: '신도시 개발' ,
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
            { name: '강화군', population: 65000, leadParty: 'ppp', mayor: { name: '박용철', party: 'ppp' }, keyIssue: '접경지역 발전' ,
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
            { name: '태백시', population: 42000, leadParty: 'democratic', mayor: { name: '이상호', party: 'democratic' }, keyIssue: '폐광 지역 경제 전환' ,
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
            { name: '영월군', population: 38000, leadParty: 'democratic', mayor: { name: '최명서', party: 'democratic' }, keyIssue: '폐광 지역 재생' ,
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
            { name: '화천군', population: 25000, leadParty: 'democratic', mayor: { name: '최문순', party: 'democratic' }, keyIssue: '군사시설 보호구역 해제' ,
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
            { name: '목포시', population: 218000, leadParty: 'independent', mayor: { name: null, party: 'independent', acting: true, actingReason: '박홍률 시장 당선무효 (2025.3)' }, keyIssue: '원도심 재생 사업' ,
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
            { name: '곡성군', population: 27000, leadParty: 'democratic', mayor: { name: '조상래', party: 'democratic' }, keyIssue: '기차마을 관광' ,
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
            { name: '영광군', population: 53000, leadParty: 'democratic', mayor: { name: '장세일', party: 'democratic' }, keyIssue: '원전 해체 대책' ,
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
            { name: '신안군', population: 38000, leadParty: 'democratic', mayor: { name: null, party: 'independent', acting: true, actingReason: '박우량 군수 직위상실 (2025.3)' }, keyIssue: '태양광 섬 에너지' ,
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
            { name: '영천시', population: 100000, leadParty: 'ppp', mayor: { name: '최기문', party: 'ppp' }, keyIssue: '농업 첨단화' ,
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
            { name: '의성군', population: 50000, leadParty: 'ppp', mayor: { name: '김주수', party: 'ppp' }, keyIssue: '마늘 산업 지원' ,
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
            { name: '울릉군', population: 9000, leadParty: 'ppp', mayor: { name: '남한권', party: 'ppp' }, keyIssue: '독도 영토 관리' ,
            voters: 8339,
            prevElection: { turnout: 81.5 } },
            { name: '군위군', population: 22000, leadParty: 'ppp', mayor: { name: '김진열', party: 'ppp' }, keyIssue: '대구 편입 후 발전' ,
            voters: 22054,
            prevElection: { turnout: 80.9 } }
        ],
        'gyeongnam': [
            { name: '창원시', population: 1040000, leadParty: 'ppp', mayor: { name: null, party: 'independent', acting: true, actingReason: '홍남표 시장 당선무효 (2025.4)' }, keyIssue: '기계산업 스마트 전환' ,
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
            { name: '밀양시', population: 105000, leadParty: 'ppp', mayor: { name: '안병구', party: 'ppp' }, keyIssue: '송전탑 갈등 해결' ,
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
            { name: '창녕군', population: 60000, leadParty: 'independent', mayor: { name: '성낙인', party: 'independent' }, keyIssue: '우포늪 생태 관광' ,
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
            { name: '함양군', population: 38000, leadParty: 'ppp', mayor: { name: '진병영', party: 'ppp' }, keyIssue: '산삼 항노화 산업' ,  /* 무소속 당선 후 2024.3 국민의힘 복당 */
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
            { name: '안산시', population: 650000, leadParty: 'democratic', mayor: { name: '이민근', party: 'democratic' }, keyIssue: '다문화 정책' ,
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
            { name: '의왕시', population: 160000, leadParty: 'democratic', mayor: { name: '김성제', party: 'democratic' }, keyIssue: '교통 접근성' ,
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
            { name: '이천시', population: 222000, leadParty: 'democratic', mayor: { name: '김경희', party: 'democratic' }, keyIssue: 'SK하이닉스' ,
            voters: 188563,
            prevElection: { turnout: 47.1 } },
            { name: '안성시', population: 188000, leadParty: 'democratic', mayor: { name: '김보라', party: 'democratic' }, keyIssue: '농업 혁신' ,
            voters: 163518,
            prevElection: { turnout: 50.0 } },
            { name: '김포시', population: 480000, leadParty: 'ppp', mayor: { name: '김병수', party: 'ppp' }, keyIssue: '교통 혁신' ,
            voters: 392604,
            prevElection: { turnout: 49.9 } },
            { name: '화성시', population: 920000, leadParty: 'ppp', mayor: { name: '정명근', party: 'ppp' }, keyIssue: '삼성 반도체' ,
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
            { name: '연천군', population: 43000, leadParty: 'democratic', mayor: { name: '김덕현', party: 'democratic' }, keyIssue: '접경지역 지원' ,
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
        'gwangju':  { region: '광주',  currentSuperintendent: { name: '이정선', stance: '진보', since: 2022, career: '현 교육감', note: '2022 당선, 광주교대 총장 출신' },                  candidates: [{ name: '이정선', stance: '진보', support: 52.1, career: '현 교육감' }, { name: '윤한홍', stance: '보수', support: 28.4, career: '前 교육위원' }] },
        'daejeon':  { region: '대전',  currentSuperintendent: { name: '설동호', stance: '중도', since: 2014, career: '현 교육감', note: '2022 3선, 언론사별 성향 분류 상이' },               candidates: [{ name: '설동호', stance: '중도', support: 45.8, career: '현 교육감' }, { name: '김동건', stance: '진보', support: 31.2, career: '前 교육청 부교육감' }] },
        'ulsan':    { region: '울산',  currentSuperintendent: { name: '노옥희', stance: '진보', since: 2018, career: '현 교육감', note: '2022 재선, 전교조 울산지부장 출신' },               candidates: [{ name: '노옥희', stance: '진보', support: 43.6, career: '현 교육감' }, { name: '이상봉', stance: '보수', support: 37.9, career: '前 학교장' }] },
        'sejong':   { region: '세종',  currentSuperintendent: { name: '최교진', stance: '진보', since: 2014, career: '현 교육감', note: '2022 3선' },                                       candidates: [{ name: '최교진', stance: '진보', support: 48.2, career: '현 교육감' }, { name: '강태중', stance: '보수', support: 33.1, career: '前 교육정책연구원장' }] },
        'gyeonggi': { region: '경기',  currentSuperintendent: { name: '임태희', stance: '보수', since: 2022, career: '현 교육감', note: '2022 당선, 13년만 보수 교육감' },                   candidates: [{ name: '임태희', stance: '보수', support: 41.8, career: '현 교육감' }, { name: '신현석', stance: '진보', support: 39.5, career: '前 교육청 부교육감' }] },
        'gangwon':  { region: '강원',  currentSuperintendent: { name: '신경호', stance: '보수', since: 2022, career: '현 교육감', note: '2022 당선' },                                       candidates: [{ name: '신경호', stance: '보수', support: 40.3, career: '현 교육감' }, { name: '민병희', stance: '진보', support: 38.8, career: '前 교육감' }] },
        'chungbuk': { region: '충북',  currentSuperintendent: { name: '윤건영', stance: '보수', since: 2022, career: '현 교육감', note: '2022 당선, 청주교대 총장 출신' },                   candidates: [{ name: '윤건영', stance: '보수', support: 42.5, career: '현 교육감' }, { name: '심의보', stance: '진보', support: 35.6, career: '前 교육청 장학관' }] },
        'chungnam': { region: '충남',  currentSuperintendent: { name: '김지철', stance: '진보', since: 2014, career: '현 교육감', note: '2022 3선, 전교조 경력' },                           candidates: [{ name: '김지철', stance: '진보', support: 44.7, career: '현 교육감' }, { name: '오연호', stance: '보수', support: 36.2, career: '前 교육위원' }] },
        'jeonbuk':  { region: '전북',  currentSuperintendent: { name: '서거석', stance: '진보', since: 2022, career: '현 교육감', note: '2022 당선, 전북대 총장 출신' },                     candidates: [{ name: '서거석', stance: '진보', support: 46.3, career: '현 교육감' }, { name: '이창식', stance: '보수', support: 29.8, career: '前 교육청 부교육감' }] },
        'jeonnam':  { region: '전남',  currentSuperintendent: { name: '김대중', stance: '진보', since: 2022, career: '현 교육감', note: '2022 당선, 전교조 경력' },                          candidates: [{ name: '김대중', stance: '진보', support: 50.1, career: '현 교육감' }, { name: '박정일', stance: '보수', support: 27.3, career: '前 학교장' }] },
        'gyeongbuk': { region: '경북', currentSuperintendent: { name: '임종식', stance: '보수', since: 2018, career: '현 교육감', note: '2022 재선' },                                       candidates: [{ name: '임종식', stance: '보수', support: 46.8, career: '현 교육감' }, { name: '이병찬', stance: '진보', support: 30.5, career: '前 교육시민단체 대표' }] },
        'gyeongnam': { region: '경남', currentSuperintendent: { name: '박종훈', stance: '진보', since: 2014, career: '현 교육감', note: '2022 3선, 전교조 경력' },                           candidates: [{ name: '박종훈', stance: '진보', support: 43.9, career: '현 교육감' }, { name: '김태진', stance: '보수', support: 37.4, career: '前 교육청 부교육감' }] },
        'jeju':     { region: '제주',  currentSuperintendent: { name: '김광수', stance: '보수', since: 2022, career: '현 교육감', note: '2022 당선' },                                       candidates: [{ name: '김광수', stance: '보수', support: 41.2, career: '현 교육감' }, { name: '이석문', stance: '진보', support: 38.6, career: '前 교육감' }] }
    };

    // BEGIN NESDC_LATEST_POLLS
    const latestPolls = [];
    // END NESDC_LATEST_POLLS

    // ============================================
    // Mock Election Data Generator
    // ============================================
    function generateMockElectionData() {
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
        const byElectionDefs = [
            {
                key: 'incheon-gyeyang',
                region: 'incheon',
                district: '계양구을',
                type: '국회의원 보궐',
                reason: '대통령 당선으로 공석',
                voters: 152000, // 선거구 유권자 수 (2022 재보궐 기준)
                keyIssues: ['인천 신도시 교통', '주거 인프라', '교육 환경', '환경 보전'],
                prevElection: { winner: 'democratic', winnerName: '이재명', rate: 50.6, runner: 'ppp', runnerName: '윤형선', runnerRate: 45.2, turnout: 52.8 }
            },
            {
                key: 'chungnam-asan',
                region: 'chungnam',
                district: '아산시을',
                type: '국회의원 보궐',
                reason: '대통령비서실장 취임으로 공석',
                voters: 129000, // 선거구 유권자 수 (아산시 갑/을 분할 기준)
                keyIssues: ['아산 신도시 발전', '삼성 디스플레이 클러스터', '교통 인프라', '인구 유입 대응'],
                prevElection: { winner: 'democratic', winnerName: '강훈식', rate: 53.2, runner: 'ppp', runnerName: '이명수', runnerRate: 43.1, turnout: 51.5 }
            },
            {
                key: 'gyeonggi-pyeongtaek',
                region: 'gyeonggi',
                district: '평택시을',
                type: '국회의원 보궐',
                reason: '의원직 상실로 공석',
                voters: 165000, // 선거구 유권자 수 (평택시 갑/을/병 분할 기준)
                keyIssues: ['평택 반도체 클러스터', '국제도시 개발', '교통 인프라', '주한미군 상생'],
                prevElection: { winner: 'ppp', winnerName: '공병호', rate: 51.2, runner: 'democratic', runnerName: '최종현', runnerRate: 44.8, turnout: 50.3 }
            },
            {
                key: 'jeonbuk-gunsan',
                region: 'jeonbuk',
                district: '군산·김제·부안갑',
                type: '국회의원 보궐',
                reason: '의원직 상실로 공석',
                voters: 170000, // 선거구 유권자 수 (군산+김제+부안 갑/을 분할 기준)
                keyIssues: ['새만금 개발', '군산 조선 산업', '농어업 지원', '지역 균형발전'],
                prevElection: { winner: 'democratic', winnerName: '이원택', rate: 55.8, runner: 'ppp', runnerName: '박진술', runnerRate: 32.1, turnout: 48.9 }
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
                reason: def.reason,
                voters: def.voters,
                candidates,
                polls,
                keyIssues: def.keyIssues,
                prevElection: def.prevElection
            };
        });

        return {
            mayor,
            council,
            localCouncil,
            superintendent,
            byElection
        };
    }

    // Public API
    return {
        parties,
        regions,
        electionDate,
        preVoteDates,
        nationalSummary,
        superintendents,
        gallupNationalPoll,
        electionTypeInfo,
        subRegionData,
        latestPolls,
        getHotspots,
        getDday,
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
        getPartyName: (partyKey) => parties[partyKey]?.name || '무당층',
        getLeadingParty: (regionKey) => {
            const region = regions[regionKey];
            if (!region) return null;
            const entries = Object.entries(region.partySupport);
            entries.sort((a, b) => b[1] - a[1]);
            return entries[0][0];
        },
        getSuperintendentData: (regionKey) => superintendents[regionKey] || null,
        getSuperintendentColor: (stance) => superintendentStanceColors[stance] || '#888888',
        superintendentStanceColors,
        getByElectionData: () => {
            const data = generateMockElectionData();
            return data.byElection;
        },
        generateMockElectionData
    };
})();
