// ============================================
// 6.3 전국지방선거 선거 캘린더 시스템
// Layer 1: 시간 기준 | Layer 2A: 법적 필수 | Layer 2B: 편의 로직
// ============================================

const ElectionCalendar = (() => {

    // ─── Layer 1: 시간 기준 ───
    // 모든 시간 판정은 이 함수를 통해서만.
    // 해외 접속(재외국민)도 KST 기준으로 판정.
    const getKST = () => {
        const now = new Date();
        const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
        return new Date(utc + (9 * 3600000));
    };

    // 날짜 상수 — 문자열 비교 금지, Date 객체 + KST만 사용
    const DATES = {
        // 예비후보 등록
        PRE_REG_GOVERNOR:     new Date('2026-02-03T00:00:00+09:00'),
        PRE_REG_COUNCIL:      new Date('2026-02-20T00:00:00+09:00'),
        PRE_REG_GUN:          new Date('2026-03-22T00:00:00+09:00'),

        // 법적 기한
        RESIGNATION_DEADLINE: new Date('2026-03-05T00:00:00+09:00'),
        PROPORTIONAL_RESIGN:  new Date('2026-05-04T00:00:00+09:00'),

        // 선거인명부
        VOTER_LIST_START:     new Date('2026-05-12T00:00:00+09:00'),
        VOTER_LIST_END:       new Date('2026-05-16T23:59:59+09:00'),

        // 후보자 등록
        CANDIDATE_REG_START:  new Date('2026-05-14T09:00:00+09:00'),
        CANDIDATE_REG_END:    new Date('2026-05-15T18:00:00+09:00'),

        // 선거운동
        CAMPAIGN_START:       new Date('2026-05-21T00:00:00+09:00'),
        CAMPAIGN_END:         new Date('2026-06-02T23:59:59+09:00'),

        // 여론조사 공표금지 (법적 필수 — 공직선거법 제108조)
        PUBLICATION_BAN_START: new Date('2026-05-28T00:00:00+09:00'),

        // 사전투표
        EARLY_VOTE_START:     new Date('2026-05-29T06:00:00+09:00'),
        EARLY_VOTE_END:       new Date('2026-05-30T18:00:00+09:00'),

        // 투표일
        ELECTION_DAY_START:   new Date('2026-06-03T06:00:00+09:00'),
        VOTE_END:             new Date('2026-06-03T18:00:00+09:00'),

        // 선거 후
        INAUGURATION:         new Date('2026-07-01T00:00:00+09:00'),
    };


    // ─── Layer 2A: 법적 필수 로직 (독립) ───
    // 공직선거법 제108조
    // 선거일 전 6일(5/28 00:00)부터 투표 마감(6/3 18:00)까지
    // 여론조사 결과 공표·보도 금지
    // 위반 시 3년 이하 징역 또는 600만원 이하 벌금
    //
    // ⚠️ 이 함수는:
    //   - getCurrentPhase()를 참조하지 않음
    //   - 다른 어떤 함수의 반환값에 의존하지 않음
    //   - DATES 상수와 getKST()만 사용
    //   - UI 숨김이 아니라 데이터 자체를 차단

    const isPublicationBanned = () => {
        const now = getKST();
        return now >= DATES.PUBLICATION_BAN_START && now < DATES.VOTE_END;
    };

    // 여론조사 데이터 접근 시 반드시 이 함수를 거침
    const getFilteredPolls = (polls) => {
        if (isPublicationBanned()) {
            return {
                polls: [],
                banned: true,
                notice: '선거법에 따라 여론조사 결과를 표시할 수 없습니다.\n' +
                        '공표금지 기간: 5월 28일 00:00 ~ 6월 3일 18:00\n' +
                        '근거: 공직선거법 제108조'
            };
        }
        return { polls: polls || [], banned: false, notice: null };
    };

    // 뉴스탭 여론조사 하부메뉴 차단
    const isNewsSubTabDisabled = (subTabName) => {
        if (subTabName === '여론조사' && isPublicationBanned()) {
            return {
                disabled: true,
                notice: '공표금지 기간에는 여론조사 관련 뉴스를 표시할 수 없습니다.'
            };
        }
        return { disabled: false, notice: null };
    };


    // ─── Layer 2B: 편의 로직 (phase 기반) ───
    // 법적 의무와 무관한 UX 편의 기능만 담당

    const getCurrentPhase = () => {
        const now = getKST();
        if (now < DATES.CANDIDATE_REG_START)  return 'PRE_REGISTRATION';
        if (now <= DATES.CANDIDATE_REG_END)   return 'REGISTRATION';
        if (now < DATES.CAMPAIGN_START)        return 'POST_REGISTRATION';
        if (now < DATES.EARLY_VOTE_START)      return 'CAMPAIGN';
        if (now <= DATES.EARLY_VOTE_END)       return 'EARLY_VOTING';
        if (now < DATES.ELECTION_DAY_START)    return 'PRE_ELECTION_DAY';
        if (now < DATES.VOTE_END)              return 'ELECTION_DAY';
        if (now < DATES.INAUGURATION)          return 'POST_ELECTION';
        return 'INAUGURATED';
    };

    const getDday = () => {
        const now = getKST();
        const election = new Date('2026-06-03T00:00:00+09:00');
        const diff = Math.ceil((election - now) / (1000 * 60 * 60 * 24));
        if (diff > 0) return `D-${diff}`;
        if (diff === 0) return 'D-DAY';
        return `D+${Math.abs(diff)}`;
    };

    const getCandidateSortMode = () => {
        const now = getKST();
        return now > DATES.CANDIDATE_REG_END ? 'ballot_number' : 'status_priority';
    };

    const getDefaultNewsSubTab = () => {
        const phase = getCurrentPhase();
        if (phase === 'CAMPAIGN' || phase === 'PRE_ELECTION_DAY') return '선거운동';
        return '전체';
    };

    const getBannerConfig = () => {
        const phase = getCurrentPhase();
        const now = getKST();

        // 선거인명부 열람 기간
        if (now >= DATES.VOTER_LIST_START && now <= DATES.VOTER_LIST_END) {
            return {
                show: true,
                text: '선거인명부 열람 기간입니다 (5/12~16)',
                type: 'info',
                icon: 'fas fa-clipboard-list',
                link: { label: '선관위 열람', url: 'https://www.nec.go.kr' }
            };
        }

        switch (phase) {
            case 'REGISTRATION':
                return {
                    show: true,
                    text: '후보자 등록 기간 (5/14~15)',
                    type: 'info',
                    icon: 'fas fa-user-plus',
                    link: null
                };

            case 'CAMPAIGN':
            case 'PRE_ELECTION_DAY':
                if (isPublicationBanned()) {
                    return {
                        show: true,
                        text: '여론조사 공표금지 기간 (5/28~6/3 18:00) | 공직선거법 제108조',
                        type: 'warning',
                        icon: 'fas fa-exclamation-triangle',
                        link: null
                    };
                }
                return {
                    show: true,
                    text: '공식 선거운동 기간 (5/21~6/2)',
                    type: 'campaign',
                    icon: 'fas fa-bullhorn',
                    link: null
                };

            case 'EARLY_VOTING':
                return {
                    show: true,
                    text: '사전투표 진행 중 | 06:00~18:00 | 전국 어디서나',
                    type: 'vote',
                    icon: 'fas fa-check-to-slot',
                    link: { label: '투표소 찾기', url: 'https://www.nec.go.kr' }
                };

            case 'ELECTION_DAY':
                return {
                    show: true,
                    text: '오늘은 투표일입니다 | 06:00~18:00',
                    type: 'vote',
                    icon: 'fas fa-check-to-slot',
                    link: { label: '투표소 찾기', url: 'https://www.nec.go.kr' }
                };

            case 'POST_ELECTION':
                // 선거 당일 18:00 이후 ~ 취임 전: 개표→결과 순서
                if (now < new Date('2026-06-04T06:00:00+09:00')) {
                    return {
                        show: true,
                        text: '투표가 마감되었습니다. 개표가 진행 중입니다.',
                        type: 'result',
                        icon: 'fas fa-chart-pie',
                        link: { label: '개표 현황', url: 'https://www.nec.go.kr' }
                    };
                }
                return {
                    show: true,
                    text: '제9회 전국동시지방선거가 종료되었습니다',
                    type: 'info',
                    icon: 'fas fa-flag-checkered',
                    link: null
                };

            default:
                return { show: false };
        }
    };

    // ─── Public API ───
    return {
        getKST,
        DATES,

        // Layer 2A — 법적 필수
        isPublicationBanned,
        getFilteredPolls,
        isNewsSubTabDisabled,

        // Layer 2B — 편의
        getCurrentPhase,
        getDday,
        getCandidateSortMode,
        getDefaultNewsSubTab,
        getBannerConfig,
    };
})();
