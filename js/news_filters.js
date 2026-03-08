window.NewsFilterConfig = {
  majorNewsHosts: [
    'yna.co.kr', 'newsis.com', 'news1.kr', 'yonhapnewstv.co.kr',
    'kbs.co.kr', 'imnews.imbc.com', 'mbc.co.kr', 'sbs.co.kr',
    'jtbc.co.kr', 'chosun.com', 'joongang.co.kr', 'donga.com',
    'hani.co.kr', 'khan.co.kr', 'seoul.co.kr', 'mk.co.kr',
    'hankyung.com', 'edaily.co.kr', 'fnnews.com', 'mt.co.kr',
    'sisajournal.com', 'ohmynews.com', 'nocutnews.co.kr'
  ],
  categoryTemplates: [
    {
      label: '전체 선거 뉴스',
      icon: 'fas fa-newspaper',
      query: '{{GOVERNOR_QUERY_BASE}} 지방선거 후보 공약 여론조사 -교육감 -구청장 -군수 -기초단체장 -정당대표 -당대표 -원내대표',
      categoryId: 'all',
      maxAgeDays: 45,
      preferPopularity: true,
      altQueries: [
        '{{GOVERNOR_QUERY_BASE}} 선거 -교육감 -구청장 -군수',
        '{{GOVERNOR_QUERY_BASE}} 후보 공약 -교육감 -구청장 -군수',
        '{{GOVERNOR_QUERY_BASE}} 여론조사 지지율 -교육감 -구청장 -군수',
        '{{REGION_NAME}} 도지사 선거 -교육감 -구청장 -군수'
      ],
      focusKeywords: ['선거', '지사', '시장', '후보', '공약', '여론조사'],
      strict: {
        mustAny: ['선거', '지방선거', '후보', '공약', '여론조사'],
        targetAny: ['{{GOVERNOR_QUERY_BASE}}', '도지사', '지사'],
        requiredGovernorAny: true,
        requiredGovernorRoleAny: true,
        boostAny: ['지방선거', '가상대결', '지지율', '출마', '공약 발표'],
        excludeAny: ['교육감', '교육청', '학교장', '기초단체장', '구청장', '군수', '정당대표', '당대표', '원내대표'],
        rejectLocalMayorOnly: true
      },
      relaxed: {
        mustAny: ['선거', '지방선거', '후보', '공약'],
        targetAny: ['{{GOVERNOR_QUERY_BASE}}', '도지사', '지사', '{{REGION_NAME}}'],
        requiredGovernorAny: true,
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
        requiredGovernorAny: true,
        requiredGovernorRoleAny: false,
        boostAny: ['오차범위', '표본', '응답률', '조사기관', '리얼미터', '한국갤럽'],
        excludeAny: ['교육감', '교육청', '수사', '검찰 조사', '경찰 조사', '기초단체장', '구청장', '군수', '정당대표', '당대표', '원내대표']
      }
    },
    {
      label: '후보자 동향',
      icon: 'fas fa-user-tie',
      query: '{{GOVERNOR_QUERY_BASE}} 유세 방문 간담회 회동 지지선언 출정식 -교육감 -구청장 -군수 -기초단체장 -정당대표 -당대표 -원내대표',
      categoryId: 'candidate',
      maxAgeDays: 45,
      altQueries: [
        '{{GOVERNOR_QUERY_BASE}} 후보 -교육감 -구청장 -군수',
        '{{GOVERNOR_QUERY_BASE}} 출마 -교육감 -구청장 -군수',
        '{{REGION_NAME}} 지사 후보 -교육감 -구청장 -군수',
        '{{REGION_NAME}} 선거운동 지사 -교육감 -구청장 -군수'
      ],
      focusKeywords: ['유세', '현장방문', '방문', '간담회', '회동', '면담', '지지선언', '출정식', '선거운동', '캠프', '선대위', '합류', '거리인사', '토론회'],
      strict: {
        mustAny: ['유세', '방문', '현장', '간담회', '회동', '면담', '지지선언', '출정식', '선거운동', '캠프', '선대위', '합류', '토론회', '출마', '경선', '공천', '단일화'],
        targetAny: ['지사', '도지사', '{{GOVERNOR_QUERY_BASE}}'],
        requiredGovernorAny: true,
        requiredGovernorRoleAny: true,
        boostAny: ['출정식', '현장 방문', '지역 방문', '지지선언', '선대위 출범', '캠프 합류'],
        excludeAny: ['교육감', '교육청', '정책공약집', '공약 발표', '정책 발표', '지지율', '여론조사', '기초단체장', '구청장', '군수', '정당대표', '당대표', '원내대표']
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
      label: '정책공약',
      icon: 'fas fa-bullhorn',
      query: '{{GOVERNOR_QUERY_BASE}} 공약 정책 발표 핵심공약 -교육감 -구청장 -군수 -기초단체장 -정당대표 -당대표 -원내대표',
      categoryId: 'policy',
      maxAgeDays: 45,
      altQueries: [
        '{{GOVERNOR_QUERY_BASE}} 정책공약 공약발표 -교육감 -구청장 -군수',
        '{{GOVERNOR_QUERY_BASE}} 핵심공약 이행계획 -교육감 -구청장 -군수',
        '{{REGION_NAME}} 도지사 공약 -교육감 -구청장 -군수',
        '{{REGION_NAME}} 도정 비전 공약 -교육감 -구청장 -군수'
      ],
      focusKeywords: ['공약', '정책', '발표', '비전', '정책공약', '핵심공약', '이행', '로드맵', '공약집', '이행계획'],
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
        requiredGovernorAny: true,
        requiredGovernorRoleAny: false,
        boostAny: ['핵심공약', '공약 발표', '정책 발표', '협약', '공약집', '이행계획'],
        excludeAny: ['교육감', '교육청', '기초단체장', '구청장', '군수', '정당대표', '당대표', '원내대표', '하남시장', '구리시장', '고양시장']
      }
    }
  ],
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
        },
        relaxed: {
          excludeAny: ['교육감', '교육청', '하남시장', '구리시장', '고양시장', '기초단체장', '구청장', '군수', '정당대표', '당대표', '원내대표']
        }
      },
      candidate: {
        query: '경기도지사 유세 방문 간담회 회동 지지선언 출정식 -교육감',
        strict: {
          excludeAny: ['교육감', '교육청', '하남시장', '구리시장', '고양시장', '기초단체장', '구청장', '군수', '정당대표', '당대표', '원내대표']
        },
        relaxed: {
          excludeAny: ['교육감', '교육청', '하남시장', '구리시장', '고양시장', '기초단체장', '구청장', '군수', '정당대표', '당대표', '원내대표']
        }
      },
      policy: {
        query: '경기도지사 공약 정책 발표 핵심공약 -교육감',
        altQueries: [
          '경기도지사 정책공약 공약발표',
          '경기도지사 핵심공약 이행계획',
          '경기도 도지사 공약',
          '경기도 도정 비전 공약'
        ],
        strict: {
          excludeAny: ['교육감', '교육청', '하남시장', '구리시장', '고양시장', '기초단체장', '구청장', '군수', '정당대표', '당대표', '원내대표']
        },
        relaxed: {
          excludeAny: ['교육감', '교육청', '하남시장', '구리시장', '고양시장', '기초단체장', '구청장', '군수', '정당대표', '당대표', '원내대표']
        }
      }
    }
  }
};
