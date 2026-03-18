// ============================================
// 뉴스탭 알고리즘 설계 계획서 기반 필터 설정
// Phase 1 MVP: 6개 하부메뉴 + 복합 점수 + 지역신문 Tier
// ============================================

window.NewsFilterConfig = {
  // ── Tier 1 전국 주요 언론사 ──
  majorNewsHosts: [
    'yna.co.kr', 'newsis.com', 'news1.kr', 'yonhapnewstv.co.kr',
    'kbs.co.kr', 'imnews.imbc.com', 'mbc.co.kr', 'sbs.co.kr',
    'jtbc.co.kr', 'chosun.com', 'joongang.co.kr', 'donga.com',
    'hani.co.kr', 'khan.co.kr', 'seoul.co.kr', 'mk.co.kr',
    'hankyung.com', 'edaily.co.kr', 'fnnews.com', 'mt.co.kr',
    'sisajournal.com', 'ohmynews.com', 'nocutnews.co.kr'
  ],

  // ── 점수 가중치 (계획서 3.2) ──
  scoreWeights: {
    time: 0.32,
    relevance: 0.30,
    credibility: 0.18,
    locality: 0.15,
    engagement: 0.05
  },

  localitySignals: {
    tier1: 1.0,
    tier2: 0.82,
    districtScopeBonus: 0.08,
    outletMentionProvince: 0.62,
    outletMentionDistrict: 0.74
  },

  // ── 비지방선거 키워드 (전국단위/국회의원/대선 등) ──
  globalExcludeKeywords: [
    '대선', '대통령', '총선', '국회의원', '국회',
    '보궐', '재보궐', '보선',
    '전당대회', '전대', '당대표', '원내대표', '당권'
  ],

  // ── 언론사 편집 신뢰도 Tier (지역성 점수와 분리) ──
  credibilityTiers: {
    national: {
      tier1: [ // 1.0 - 5대 종합일간지, 방송3사, 통신사
        'yna.co.kr', 'newsis.com', 'news1.kr',
        'kbs.co.kr', 'mbc.co.kr', 'sbs.co.kr',
        'chosun.com', 'joongang.co.kr', 'donga.com', 'hani.co.kr', 'khan.co.kr'
      ],
      tier2: [ // 0.8 - 경제지, 전문지
        'mk.co.kr', 'hankyung.com', 'edaily.co.kr', 'fnnews.com', 'mt.co.kr',
        'jtbc.co.kr', 'seoul.co.kr', 'sisajournal.com', 'newstapa.org'
      ],
      tier3: [ // 0.6 - 인터넷언론
        'ohmynews.com', 'nocutnews.co.kr', 'pressian.com', 'mediatoday.co.kr',
        'journalist.or.kr', 'newstof.com'
      ],
      tier4: [ // 0.52 - 전국 인터넷매체 (media_pool 자동 발견)
        'ekn.kr', 'weeklytoday.com', 'gukjenews.com', 'apnews.kr',
        'breaknews.com', 'kukinews.com', 'polinews.co.kr',
        'news.lghellovision.net', 'news.skbroadband.com', 'news.bbsi.co.kr'
      ]
    },
    scores: {
      tier1: 1.0,
      tier2: 0.82,
      tier3: 0.64,
      regionalTier1: 0.76,
      regionalTier2: 0.68,
      tier4: 0.52,
      unknown: 0.45
    }
  },

  // ── 광역시도별 지역언론 매핑 (계획서 6.2) ──
  regionalMedia: {
    seoul:    {
      tier1: ['seoulilbo.com', 'senews.co.kr'],
      tier2: [],
      priorityNames: ['서울일보', '서울뉴스통신']
    },
    busan:    {
      tier1: ['busan.com', 'kookje.co.kr'],
      tier2: ['knn.co.kr', 'busanmbc.co.kr'],
      priorityNames: ['부산일보', '국제신문', 'KNN', '부산MBC', '부산CBS']
    },
    daegu:    {
      tier1: ['imaeil.com', 'idaegu.co.kr'],
      tier2: ['dgmbc.co.kr', 'tbc.co.kr'],
      priorityNames: ['매일신문', '대구일보', 'TBC', '대구MBC']
    },
    incheon:  {
      tier1: ['incheonilbo.com', 'kihoilbo.co.kr', 'incheontimes.com'],
      tier2: ['kyeongin.com'],
      priorityNames: ['인천일보', '기호일보', '경인일보']
    },
    gwangju:  {
      tier1: ['kwangju.co.kr', 'kjdaily.com', 'mdilbo.com', 'ikbc.co.kr'],
      tier2: ['kjmbc.co.kr', 'gwangnam.co.kr'],
      priorityNames: ['광주일보', '무등일보', 'KBC광주방송', '광주MBC', '광남일보', 'KBS광주방송총국']
    },
    daejeon:  {
      tier1: ['daejonilbo.com'],
      tier2: ['cctoday.co.kr', 'tjmbc.co.kr'],
      priorityNames: ['대전일보', '충청투데이', 'KBS대전', '대전MBC', '굿모닝충청']
    },
    ulsan:    {
      tier1: ['iusm.co.kr', 'ujeil.com'],
      tier2: ['usanmbc.co.kr'],
      priorityNames: ['울산매일', '울산제일일보', 'ubc울산방송', '울산시민신문']
    },
    sejong:   {
      tier1: ['sjpost.co.kr'],
      tier2: ['daejonilbo.com'],
      priorityNames: ['세종포스트', '세종의소리', '대전투데이', 'KBS대전', '굿모닝충청']
    },
    gyeonggi: {
      tier1: ['kyeonggi.com', 'kyeongin.com', 'suwonilbo.co.kr'],
      tier2: ['incheonilbo.com'],
      priorityNames: ['경기일보', '중부일보', '경기신문', '경인일보', '수원일보']
    },
    gangwon:  { tier1: ['kwnews.co.kr', 'kado.net'], tier2: ['chmbc.co.kr'] },
    chungbuk: { tier1: ['cbilbo.com', 'ccdailynews.com'], tier2: ['cctoday.co.kr'] },
    chungnam: { tier1: ['cctoday.co.kr', 'cnnews.co.kr'], tier2: ['daejonilbo.com', 'naepo2day.co.kr'] },
    jeonbuk: {
      tier1: ['jjan.kr', 'jbdomin.co.kr', 'sjbnews.com'],
      tier2: ['jmbc.co.kr'],
      priorityNames: ['전북도민일보', '전북일보', '새전북신문', '전북제일신문', 'KBS전주', '전주일보']
    },
    jeonnam:  {
      tier1: ['jnilbo.com', 'honam.co.kr', 'namdonews.com', 'mdilbo.com', 'ikbc.co.kr'],
      tier2: ['kjmbc.co.kr', 'gwangnam.co.kr'],
      priorityNames: ['전남일보', '남도일보', '무등일보', 'KBC광주방송', '광주MBC', '광주일보']
    },
    gyeongbuk: { tier1: ['imaeil.com', 'gbnews.com'], tier2: ['dgmbc.co.kr'] },
    gyeongnam: {
      tier1: ['knnews.co.kr', 'gndomin.com'],
      tier2: ['chmbc.co.kr', 'knnb.co.kr'],
      priorityNames: ['경남도민일보', '경남신문', '경남일보', '경남매일', 'MBC경남', 'KNN']
    },
    jeju:     { tier1: ['jejuilbo.net', 'ihalla.com', 'jemin.com'], tier2: [] }
  },

  // ── 하부메뉴 키워드 매핑 (계획서 4.2) ──
  subTabKeywords: {
    poll: [
      '여론조사', '지지율', '지지도', '여심위', '선거여론조사심의위원회',
      'RDD', 'ARS', '표본오차', '신뢰수준', '응답률',
      '리얼미터', '한국갤럽', 'NBS', '엠브레인', '한길리서치'
    ],
    candidate: [
      '후보', '출마', '공천', '경선', '단수공천', '전략공천',
      '사퇴', '불출마', '입후보', '후보자등록', '후보군',
      '프로필', '이력', '재산', '전과'
    ],
    policy: [
      '공약', '정책', '매니페스토', '공약검증', '실현가능성',
      '재원조달', '예산', '시정방침', '도정철학',
      '교통', '복지', '교육', '일자리', '주거', '환경'
    ],
    analysis: [
      '판세', '전망', '분석', '격전지', '경합',
      '우세', '열세', '접전', '캐스팅보트', '정치지형',
      '여당', '야당', '민주당', '국민의힘', '세대별', '지역별'
    ],
    campaign: [
      '유세', '토론', '토론회', '선거운동', '거리유세',
      '선거법', '선거비용', '네거티브', '흑색선전', '허위사실',
      '선거사범', '기부행위', '사전선거운동'
    ]
  },

  // ── 6개 하부메뉴 카테고리 템플릿 (계획서 2.1 + 4.2) ──
  categoryTemplates: [
    {
      label: '전체',
      icon: 'fas fa-newspaper',
      query: '{{GOVERNOR_QUERY_BASE}} 지방선거 후보 공약 여론조사 -교육감 -구청장 -군수 -기초단체장 -정당대표 -당대표 -원내대표',
      categoryId: 'all',
      maxAgeDays: 60,
      preferPopularity: true,
      altQueries: [
        '{{GOVERNOR_QUERY_BASE}} 선거 -교육감 -구청장 -군수',
        '{{GOVERNOR_QUERY_BASE}} 후보 공약 -교육감 -구청장 -군수',
        '{{GOVERNOR_QUERY_BASE}} 여론조사 지지율 -교육감 -구청장 -군수',
        '{{REGION_NAME}} 도지사 선거 -교육감 -구청장 -군수'
      ],
      focusKeywords: ['선거', '지사', '시장', '후보', '공약', '여론조사'],
      strict: {
        mustAny: ['선거', '지방선거', '후보', '공약', '여론조사', '경선', '공천', '출마', '단일화', '선대위', '유세', '토론회'],
        targetAny: ['{{GOVERNOR_QUERY_BASE}}', '도지사', '지사'],
        requiredGovernorAny: true,
        requiredGovernorRoleAny: true,
        boostAny: ['지방선거', '가상대결', '지지율', '출마', '공약 발표'],
        excludeAny: ['교육감', '교육청', '학교장', '기초단체장', '구청장', '군수', '정당대표', '당대표', '원내대표'],
        rejectLocalMayorOnly: true
      },
      relaxed: {
        mustAny: ['선거', '지방선거', '후보', '공약', '출마', '공천', '경선', '단일화', '선대위', '유세', '토론회'],
        targetAny: ['{{GOVERNOR_QUERY_BASE}}', '도지사', '지사', '{{REGION_NAME}}'],
        requiredGovernorAny: false,
        requiredGovernorRoleAny: false,
        boostAny: ['지방선거', '도정', '출마', '공약 발표'],
        excludeAny: ['교육감', '교육청', '기초단체장', '구청장', '군수', '정당대표', '당대표', '원내대표'],
        rejectLocalMayorOnly: true
      }
    },
    {
      label: '여론조사',
      icon: 'fas fa-poll',
      query: '{{GOVERNOR_QUERY_BASE}} 여론조사 지지율 가상대결 오차범위 -교육감 -구청장 -군수 -기초단체장 -정당대표 -당대표 -원내대표',
      categoryId: 'poll',
      maxAgeDays: 45,
      altQueries: [
        '{{GOVERNOR_QUERY_BASE}} 지지율 여론조사 -교육감 -구청장 -군수',
        '{{REGION_NAME}} 지방선거 여론조사 지사 -교육감 -구청장 -군수',
        '{{GOVERNOR_QUERY_BASE}} 가상대결 양자대결 다자대결 -교육감 -구청장 -군수'
      ],
      focusKeywords: ['여론조사', '지지율', '지지도', '후보별', '가상대결', '다자대결', '양자대결', '이슈 여론조사', '찬반조사', '정당지지율', '표본오차', '응답률', '리얼미터', '한국갤럽', 'nbs'],
      strict: {
        mustAny: ['여론조사', '지지율', '지지도', '가상대결', '다자대결', '양자대결', '정당지지율', '찬반조사', '이슈 여론조사'],
        targetAny: ['후보', '후보별', '지사', '시장', '이슈', '현안', '정당', '도정', '공약', '가상대결', '양자대결', '다자대결', '찬반'],
        requiredGovernorAny: true,
        requiredGovernorRoleAny: true,
        boostAny: ['표본', '표본오차', '오차범위', '응답률', '조사기관', '리얼미터', '한국갤럽', 'nbs', '한국리서치', '엠브레인'],
        excludeAny: ['수사', '검찰 조사', '경찰 조사', '감사 조사', '실태조사', '교육감', '교육청', '기초단체장', '구청장', '군수', '정당대표', '당대표', '원내대표']
      },
      relaxed: {
        mustAny: ['여론조사', '지지율', '지지도', '가상대결', '양자대결', '다자대결'],
        targetAny: ['후보', '후보별', '지사', '도지사', '{{GOVERNOR_QUERY_BASE}}', '{{REGION_NAME}}'],
        requiredGovernorAny: false,
        requiredGovernorRoleAny: false,
        boostAny: ['오차범위', '표본', '응답률', '조사기관', '리얼미터', '한국갤럽'],
        excludeAny: ['교육감', '교육청', '수사', '검찰 조사', '경찰 조사', '기초단체장', '구청장', '군수', '정당대표', '당대표', '원내대표']
      }
    },
    {
      label: '후보·인물',
      icon: 'fas fa-user-tie',
      query: '{{GOVERNOR_QUERY_BASE}} 후보 출마 공천 경선 -교육감 -구청장 -군수 -기초단체장 -정당대표 -당대표 -원내대표',
      categoryId: 'candidate',
      maxAgeDays: 60,
      altQueries: [
        '{{GOVERNOR_QUERY_BASE}} 유세 방문 간담회 -교육감 -구청장 -군수',
        '{{GOVERNOR_QUERY_BASE}} 출마 경선 공천 -교육감 -구청장 -군수',
        '{{REGION_NAME}} 지사 후보 -교육감 -구청장 -군수',
        '{{REGION_NAME}} 선거운동 지사 -교육감 -구청장 -군수'
      ],
      focusKeywords: ['후보', '출마', '공천', '경선', '단일화', '사퇴', '입후보', '유세', '방문', '간담회', '회동', '지지선언', '캠프', '선대위', '토론회'],
      strict: {
        mustAny: ['후보', '출마', '경선', '공천', '단일화', '유세', '방문', '간담회', '회동', '지지선언', '출정식', '선거운동', '캠프', '선대위', '합류', '토론회'],
        targetAny: ['지사', '도지사', '{{GOVERNOR_QUERY_BASE}}'],
        requiredGovernorAny: true,
        requiredGovernorRoleAny: true,
        boostAny: ['출정식', '현장 방문', '지역 방문', '지지선언', '선대위 출범', '캠프 합류'],
        excludeAny: ['교육감', '교육청', '정책공약집', '공약 발표', '지지율', '여론조사', '기초단체장', '구청장', '군수', '정당대표', '당대표', '원내대표']
      },
      relaxed: {
        mustAny: ['후보', '출마', '경선', '공천', '단일화', '유세', '방문', '간담회', '회동', '지지선언', '선거운동'],
        targetAny: ['지사', '도지사', '{{GOVERNOR_QUERY_BASE}}', '{{REGION_NAME}}'],
        requiredGovernorAny: false,
        requiredGovernorRoleAny: false,
        boostAny: ['캠프', '선대위', '지지선언', '현장 방문', '지역 방문'],
        excludeAny: ['교육감', '교육청', '지지율', '여론조사', '기초단체장', '구청장', '군수', '정당대표', '당대표', '원내대표']
      }
    },
    {
      label: '공약·정책',
      icon: 'fas fa-bullhorn',
      query: '{{GOVERNOR_QUERY_BASE}} 공약 정책 발표 핵심공약 -교육감 -구청장 -군수 -기초단체장 -정당대표 -당대표 -원내대표',
      categoryId: 'policy',
      maxAgeDays: 60,
      altQueries: [
        '{{GOVERNOR_QUERY_BASE}} 정책공약 공약발표 -교육감 -구청장 -군수',
        '{{GOVERNOR_QUERY_BASE}} 핵심공약 이행계획 -교육감 -구청장 -군수',
        '{{REGION_NAME}} 도지사 공약 -교육감 -구청장 -군수',
        '{{REGION_NAME}} 도정 비전 공약 -교육감 -구청장 -군수'
      ],
      focusKeywords: ['공약', '정책', '발표', '비전', '정책공약', '핵심공약', '이행', '로드맵', '공약집', '이행계획', '매니페스토', '공약검증'],
      strict: {
        mustAny: ['공약', '정책', '비전', '정책공약', '정책발표', '핵심공약', '공약발표', '로드맵', '이행계획'],
        targetAny: ['지사', '도지사', '{{GOVERNOR_QUERY_BASE}}', '{{REGION_NAME}}', '도정'],
        requiredGovernorAny: true,
        requiredGovernorRoleAny: false,
        boostAny: ['정책 발표', '공약 발표', '핵심공약', '공약집', '이행계획', '정책협약', '비전 발표'],
        excludeAny: ['교육감', '교육청', '여론조사', '지지율', '기초단체장', '구청장', '군수', '정당대표', '당대표', '원내대표', '하남시장', '구리시장', '고양시장']
      },
      relaxed: {
        mustAny: ['공약', '정책', '비전', '정책공약', '로드맵', '이행', '공약발표'],
        targetAny: ['지사', '도지사', '{{GOVERNOR_QUERY_BASE}}', '도정', '{{REGION_NAME}}'],
        requiredGovernorAny: false,
        requiredGovernorRoleAny: false,
        boostAny: ['핵심공약', '공약 발표', '정책 발표', '협약', '공약집', '이행계획'],
        excludeAny: ['교육감', '교육청', '기초단체장', '구청장', '군수', '정당대표', '당대표', '원내대표', '하남시장', '구리시장', '고양시장']
      }
    },
    {
      label: '선거판세',
      icon: 'fas fa-chess',
      query: '{{GOVERNOR_QUERY_BASE}} 판세 전망 분석 격전지 경합 -교육감 -구청장 -군수 -기초단체장 -정당대표 -당대표 -원내대표',
      categoryId: 'analysis',
      maxAgeDays: 60,
      preferPopularity: true,
      altQueries: [
        '{{GOVERNOR_QUERY_BASE}} 전망 분석 -교육감 -구청장 -군수',
        '{{REGION_NAME}} 지방선거 판세 -교육감 -구청장 -군수',
        '{{REGION_NAME}} 격전지 경합 -교육감 -구청장 -군수'
      ],
      focusKeywords: ['판세', '전망', '분석', '격전지', '경합', '우세', '열세', '접전', '캐스팅보트', '정치지형'],
      strict: {
        mustAny: ['판세', '전망', '분석', '격전지', '경합', '접전', '정치지형', '우세', '열세'],
        targetAny: ['지사', '도지사', '{{GOVERNOR_QUERY_BASE}}', '{{REGION_NAME}}', '지방선거'],
        requiredGovernorAny: true,
        requiredGovernorRoleAny: false,
        boostAny: ['격전지', '경합', '접전', '정치지형', '판세분석', '세대별', '지역별', '[분석]', '[칼럼]', '[인터뷰]'],
        excludeAny: ['교육감', '교육청', '기초단체장', '구청장', '군수', '정당대표', '당대표', '원내대표']
      },
      relaxed: {
        mustAny: ['판세', '전망', '분석', '격전지', '경합', '접전', '선거', '정치'],
        targetAny: ['지사', '도지사', '{{GOVERNOR_QUERY_BASE}}', '{{REGION_NAME}}'],
        requiredGovernorAny: false,
        requiredGovernorRoleAny: false,
        boostAny: ['격전지', '접전', '캐스팅보트', '판세분석'],
        excludeAny: ['교육감', '교육청', '기초단체장', '구청장', '군수', '정당대표', '당대표', '원내대표']
      }
    },
    {
      label: '선거운동',
      icon: 'fas fa-bullhorn',
      query: '{{GOVERNOR_QUERY_BASE}} 유세 토론회 선거운동 선거법 -교육감 -구청장 -군수 -기초단체장 -정당대표 -당대표 -원내대표',
      categoryId: 'campaign',
      maxAgeDays: 45,
      altQueries: [
        '{{GOVERNOR_QUERY_BASE}} 토론 토론회 -교육감 -구청장 -군수',
        '{{GOVERNOR_QUERY_BASE}} 선거법 네거티브 -교육감 -구청장 -군수',
        '{{REGION_NAME}} 지사 유세 -교육감 -구청장 -군수'
      ],
      focusKeywords: ['유세', '토론', '토론회', '선거운동', '거리유세', '선거법', '선거비용', '네거티브', '흑색선전', '사전선거운동'],
      strict: {
        mustAny: ['유세', '토론', '토론회', '선거운동', '거리유세', '선거법', '네거티브', '사전선거운동', '선거비용', '기부행위'],
        targetAny: ['지사', '도지사', '{{GOVERNOR_QUERY_BASE}}', '{{REGION_NAME}}'],
        requiredGovernorAny: true,
        requiredGovernorRoleAny: false,
        boostAny: ['토론회', '합동 토론', '유세 현장', '거리 유세', '선거법 위반', '[선거법]'],
        excludeAny: ['교육감', '교육청', '기초단체장', '구청장', '군수', '정당대표', '당대표', '원내대표']
      },
      relaxed: {
        mustAny: ['유세', '토론', '토론회', '선거운동', '선거법', '네거티브', '거리유세'],
        targetAny: ['지사', '도지사', '{{GOVERNOR_QUERY_BASE}}', '{{REGION_NAME}}', '지방선거'],
        requiredGovernorAny: false,
        requiredGovernorRoleAny: false,
        boostAny: ['토론회', '합동 토론', '유세 현장'],
        excludeAny: ['교육감', '교육청', '기초단체장', '구청장', '군수', '정당대표', '당대표', '원내대표']
      }
    }
  ],

  // ── 경기도 region override (기존 유지) ──
  regionOverrides: {
    gyeonggi: {
      all: {
        query: '{{GOVERNOR_QUERY_BASE}} 지방선거 후보 공약 여론조사 -교육감 -하남시장 -구리시장 -고양시장',
        altQueries: [
          '{{GOVERNOR_QUERY_BASE}} 선거',
          '{{GOVERNOR_QUERY_BASE}} 후보 공약',
          '{{GOVERNOR_QUERY_BASE}} 여론조사 지지율',
          '경기도지사 선거'
        ],
        strict: {
          excludeAny: ['교육감', '교육청', '학교장', '하남시장', '구리시장', '고양시장', '수원시장', '성남시장', '기초단체장', '구청장', '군수', '정당대표', '당대표', '원내대표']
        },
        relaxed: {
          excludeAny: ['교육감', '교육청', '하남시장', '구리시장', '고양시장', '수원시장', '성남시장', '기초단체장', '구청장', '군수', '정당대표', '당대표', '원내대표']
        }
      },
      poll: {
        query: '경기도지사 여론조사 지지율 가상대결 오차범위 -교육감',
        strict: {
          excludeAny: ['교육감', '교육청', '하남시장', '구리시장', '고양시장', '기초단체장', '구청장', '군수', '정당대표', '당대표', '원내대표']
        }
      }
    }
  }
};
