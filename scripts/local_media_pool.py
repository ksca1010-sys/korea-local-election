"""
전국 언론사 통합 풀 (BigKinds 104개 + 기초지역 자체 언론사)
=============================================================

구조:
  1. BIGKINDS_MEDIA: 빅카인즈 제공 104개 언론사 (카테고리별)
  2. METRO_MEDIA: 광역시도별 대표 언론사 (빅카인즈 + 비빅카인즈 구분)
  3. MUNICIPAL_MEDIA: 229개 시군구별 자체 언론사
  4. get_media_text(): 프롬프트용 media_text 생성
  5. get_media_pool(): 뉴스 수집용 전체 언론사 풀 반환

각 언론사에 source 태그:
  "bk"     = 빅카인즈 DB에서 검색/수집 가능
  "p"      = 네이버/다음 뉴스 검색으로 수집 (portal/rss)
"""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 1. 빅카인즈 제공 104개 언론사 (2026.03 기준)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

BIGKINDS = {
    "전국일간지": [
        "경향신문", "국민일보", "내일신문", "동아일보", "문화일보", "서울신문",
        "세계일보", "아시아투데이", "조선일보", "중앙일보", "한겨레", "한국일보",
    ],
    "경제일간지": [
        "대한경제", "매일경제", "머니투데이", "메트로경제", "브릿지경제", "서울경제",
        "아시아경제", "아주경제", "이데일리", "이투데이", "파이낸셜뉴스", "한국경제", "헤럴드경제",
    ],
    "지역일간지": [
        "강원도민일보", "강원일보", "경기신문", "경기일보", "경남도민일보", "경남신문",
        "경남일보", "경북도민일보", "경북매일신문", "경북일보", "경상일보", "경인일보",
        "광남일보", "광주매일신문", "광주일보", "국제신문", "금강일보", "기호일보",
        "남도일보", "대구신문", "대구일보", "대전일보", "동양일보", "매일신문",
        "무등일보", "부산일보", "새전북신문", "영남일보", "울산매일", "울산신문",
        "인천일보", "전남일보", "전라일보", "전북도민일보", "전북일보", "제민일보",
        "제주일보", "중도일보", "중부매일", "중부일보", "충북일보", "충청일보",
        "충청타임즈", "충청투데이", "한라일보",
    ],
    "지역주간지": [
        "당진시대", "설악신문", "영주시민신문", "평택시민신문", "홍성신문",
    ],
    "방송사": ["KBS", "MBC", "OBS", "SBS", "YTN"],
    "전문지": [
        "기자협회보", "디지털타임스", "미디어오늘", "소년한국일보", "시사IN",
        "일요신문", "전자신문", "주간한국", "한겨레21", "환경일보",
    ],
    "스포츠신문": ["스포츠서울", "스포츠월드", "스포츠한국"],
    "인터넷신문": [
        "EBN", "PD-저널", "노컷뉴스", "뉴스펭귄", "뉴스핌",
        "데일리안", "브레이크뉴스", "비즈워치", "쿠키뉴스", "프레시안", "헬로디디",
    ],
}

# 빅카인즈 전체 언론사 flat set (빠른 lookup용)
BIGKINDS_SET = set()
for _v in BIGKINDS.values():
    BIGKINDS_SET.update(_v)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 2. 광역시도별 대표 언론사 (source 태그 포함)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

METRO_MEDIA = {
    "서울특별시": [
        {"name": "서울신문", "src": "bk"},
        {"name": "서울경제", "src": "bk"},
        {"name": "SBS", "src": "bk"},
        {"name": "TBS", "src": "p"},
    ],
    "부산광역시": [
        {"name": "부산일보", "src": "bk"},
        {"name": "국제신문", "src": "bk"},
        {"name": "부산MBC", "src": "p"},
        {"name": "KNN", "src": "p"},
        {"name": "KBS부산", "src": "p"},
    ],
    "대구광역시": [
        {"name": "매일신문", "src": "bk"},
        {"name": "대구신문", "src": "bk"},
        {"name": "대구일보", "src": "bk"},
        {"name": "경북일보", "src": "bk"},
        {"name": "영남일보", "src": "bk"},
        {"name": "대구MBC", "src": "p"},
        {"name": "TBC", "src": "p"},
    ],
    "인천광역시": [
        {"name": "경인일보", "src": "bk"},
        {"name": "인천일보", "src": "bk"},
        {"name": "기호일보", "src": "bk"},
        {"name": "OBS", "src": "bk"},
        {"name": "인천투데이", "src": "p"},
    ],
    "광주광역시": [
        {"name": "광주일보", "src": "bk"},
        {"name": "광남일보", "src": "bk"},
        {"name": "광주매일신문", "src": "bk"},
        {"name": "무등일보", "src": "bk"},
        {"name": "광주MBC", "src": "p"},
        {"name": "KBC", "src": "p"},
        {"name": "KBS광주", "src": "p"},
    ],
    "대전광역시": [
        {"name": "대전일보", "src": "bk"},
        {"name": "충청투데이", "src": "bk"},
        {"name": "중도일보", "src": "bk"},
        {"name": "금강일보", "src": "bk"},
        {"name": "대전MBC", "src": "p"},
        {"name": "TJB", "src": "p"},
    ],
    "울산광역시": [
        {"name": "울산매일", "src": "bk"},
        {"name": "경상일보", "src": "bk"},
        {"name": "울산신문", "src": "bk"},
        {"name": "울산MBC", "src": "p"},
        {"name": "ubc울산방송", "src": "p"},
    ],
    "세종특별자치시": [
        {"name": "세종포스트", "src": "p"},
        {"name": "세종의소리", "src": "p"},
        {"name": "대전일보", "src": "bk"},
        {"name": "중도일보", "src": "bk"},
    ],
    "경기도": [
        {"name": "경인일보", "src": "bk"},
        {"name": "경기일보", "src": "bk"},
        {"name": "경기신문", "src": "bk"},
        {"name": "중부일보", "src": "bk"},
        {"name": "평택시민신문", "src": "bk"},
        {"name": "OBS", "src": "bk"},
        {"name": "수원일보", "src": "p"},
    ],
    "강원특별자치도": [
        {"name": "강원일보", "src": "bk"},
        {"name": "강원도민일보", "src": "bk"},
        {"name": "설악신문", "src": "bk"},
        {"name": "춘천MBC", "src": "p"},
        {"name": "G1방송", "src": "p"},
        {"name": "KBS춘천", "src": "p"},
    ],
    "충청북도": [
        {"name": "충북일보", "src": "bk"},
        {"name": "충청일보", "src": "bk"},
        {"name": "동양일보", "src": "bk"},
        {"name": "중부매일", "src": "bk"},
        {"name": "충청타임즈", "src": "bk"},
        {"name": "MBC충북", "src": "p"},
        {"name": "CJB청주방송", "src": "p"},
    ],
    "충청남도": [
        {"name": "충청투데이", "src": "bk"},
        {"name": "대전일보", "src": "bk"},
        {"name": "금강일보", "src": "bk"},
        {"name": "당진시대", "src": "bk"},
        {"name": "홍성신문", "src": "bk"},
        {"name": "충남일보", "src": "p"},
        {"name": "내포투데이", "src": "p"},
        {"name": "TJB", "src": "p"},
    ],
    "전북특별자치도": [
        {"name": "전북일보", "src": "bk"},
        {"name": "전북도민일보", "src": "bk"},
        {"name": "새전북신문", "src": "bk"},
        {"name": "전라일보", "src": "bk"},
        {"name": "전주MBC", "src": "p"},
        {"name": "JTV", "src": "p"},
        {"name": "KBS전주", "src": "p"},
    ],
    "전라남도": [
        {"name": "전남일보", "src": "bk"},
        {"name": "남도일보", "src": "bk"},
        {"name": "무등일보", "src": "bk"},
        {"name": "광남일보", "src": "bk"},
        {"name": "전남매일", "src": "p"},
        {"name": "광주MBC", "src": "p"},
        {"name": "목포MBC", "src": "p"},
        {"name": "여수MBC", "src": "p"},
        {"name": "KBC", "src": "p"},
    ],
    "경상북도": [
        {"name": "매일신문", "src": "bk"},
        {"name": "경북일보", "src": "bk"},
        {"name": "경북매일신문", "src": "bk"},
        {"name": "경북도민일보", "src": "bk"},
        {"name": "영주시민신문", "src": "bk"},
        {"name": "대구MBC", "src": "p"},
        {"name": "안동MBC", "src": "p"},
        {"name": "포항MBC", "src": "p"},
        {"name": "TBC", "src": "p"},
    ],
    "경상남도": [
        {"name": "경남신문", "src": "bk"},
        {"name": "경남도민일보", "src": "bk"},
        {"name": "경남일보", "src": "bk"},
        {"name": "MBC경남", "src": "p"},
        {"name": "KNN", "src": "p"},
        {"name": "KBS창원", "src": "p"},
    ],
    "제주특별자치도": [
        {"name": "제주일보", "src": "bk"},
        {"name": "한라일보", "src": "bk"},
        {"name": "제민일보", "src": "bk"},
        {"name": "제주의소리", "src": "p"},
        {"name": "제주MBC", "src": "p"},
        {"name": "JIBS", "src": "p"},
        {"name": "KBS제주", "src": "p"},
    ],
}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 3. 기초지역(시군구)별 자체 언론사
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

MUNICIPAL_MEDIA = {
    # ── 서울 (25구) ──
    "종로구": {"metro": "서울특별시", "media": [{"name": "종로타임즈", "src": "p"}]},
    "중구": {"metro": "서울특별시", "media": []},
    "용산구": {"metro": "서울특별시", "media": [{"name": "용산신문", "src": "p"}]},
    "성동구": {"metro": "서울특별시", "media": [{"name": "성동신문", "src": "p"}]},
    "광진구": {"metro": "서울특별시", "media": []},
    "동대문구": {"metro": "서울특별시", "media": []},
    "중랑구": {"metro": "서울특별시", "media": []},
    "성북구": {"metro": "서울특별시", "media": [{"name": "성북신문", "src": "p"}]},
    "강북구": {"metro": "서울특별시", "media": []},
    "도봉구": {"metro": "서울특별시", "media": []},
    "노원구": {"metro": "서울특별시", "media": [{"name": "노원신문", "src": "p"}]},
    "은평구": {"metro": "서울특별시", "media": [{"name": "은평시민신문", "src": "p"}]},
    "서대문구": {"metro": "서울특별시", "media": []},
    "마포구": {"metro": "서울특별시", "media": [{"name": "마포신문", "src": "p"}]},
    "양천구": {"metro": "서울특별시", "media": []},
    "강서구": {"metro": "서울특별시", "media": [{"name": "강서양천신문", "src": "p"}]},
    "구로구": {"metro": "서울특별시", "media": []},
    "금천구": {"metro": "서울특별시", "media": []},
    "영등포구": {"metro": "서울특별시", "media": []},
    "동작구": {"metro": "서울특별시", "media": []},
    "관악구": {"metro": "서울특별시", "media": [{"name": "관악신문", "src": "p"}]},
    "서초구": {"metro": "서울특별시", "media": []},
    "강남구": {"metro": "서울특별시", "media": [{"name": "강남신문", "src": "p"}]},
    "송파구": {"metro": "서울특별시", "media": [{"name": "송파타임즈", "src": "p"}]},
    "강동구": {"metro": "서울특별시", "media": []},

    # ── 부산 (16구군) ──
    "부산중구": {"metro": "부산광역시", "media": []},
    "부산서구": {"metro": "부산광역시", "media": []},
    "부산동구": {"metro": "부산광역시", "media": []},
    "영도구": {"metro": "부산광역시", "media": []},
    "부산진구": {"metro": "부산광역시", "media": []},
    "동래구": {"metro": "부산광역시", "media": []},
    "부산남구": {"metro": "부산광역시", "media": []},
    "부산북구": {"metro": "부산광역시", "media": []},
    "해운대구": {"metro": "부산광역시", "media": [{"name": "해운대신문", "src": "p"}]},
    "사하구": {"metro": "부산광역시", "media": []},
    "금정구": {"metro": "부산광역시", "media": []},
    "강서구_부산": {"metro": "부산광역시", "media": []},
    "연제구": {"metro": "부산광역시", "media": []},
    "수영구": {"metro": "부산광역시", "media": []},
    "사상구": {"metro": "부산광역시", "media": []},
    "기장군": {"metro": "부산광역시", "media": [{"name": "기장신문", "src": "p"}]},

    # ── 대구 (8구군) ──
    "대구중구": {"metro": "대구광역시", "media": []},
    "대구동구": {"metro": "대구광역시", "media": []},
    "대구서구": {"metro": "대구광역시", "media": []},
    "대구남구": {"metro": "대구광역시", "media": []},
    "대구북구": {"metro": "대구광역시", "media": []},
    "수성구": {"metro": "대구광역시", "media": []},
    "달서구": {"metro": "대구광역시", "media": []},
    "달성군": {"metro": "대구광역시", "media": [{"name": "달성신문", "src": "p"}]},

    # ── 인천 (10구군) ──
    "인천중구": {"metro": "인천광역시", "media": []},
    "인천동구": {"metro": "인천광역시", "media": []},
    "미추홀구": {"metro": "인천광역시", "media": []},
    "연수구": {"metro": "인천광역시", "media": []},
    "남동구": {"metro": "인천광역시", "media": []},
    "부평구": {"metro": "인천광역시", "media": [{"name": "부평신문", "src": "p"}]},
    "계양구": {"metro": "인천광역시", "media": []},
    "인천서구": {"metro": "인천광역시", "media": []},
    "강화군": {"metro": "인천광역시", "media": [{"name": "강화뉴스", "src": "p"}]},
    "옹진군": {"metro": "인천광역시", "media": []},

    # ── 광주 (5구) ──
    "광주동구": {"metro": "광주광역시", "media": []},
    "광주서구": {"metro": "광주광역시", "media": []},
    "광주남구": {"metro": "광주광역시", "media": []},
    "광주북구": {"metro": "광주광역시", "media": []},
    "광산구": {"metro": "광주광역시", "media": []},

    # ── 대전 (5구) ──
    "대전동구": {"metro": "대전광역시", "media": []},
    "대전중구": {"metro": "대전광역시", "media": []},
    "대전서구": {"metro": "대전광역시", "media": []},
    "유성구": {"metro": "대전광역시", "media": []},
    "대덕구": {"metro": "대전광역시", "media": []},

    # ── 울산 (5구군) ──
    "울산중구": {"metro": "울산광역시", "media": []},
    "울산남구": {"metro": "울산광역시", "media": []},
    "울산동구": {"metro": "울산광역시", "media": []},
    "울산북구": {"metro": "울산광역시", "media": []},
    "울주군": {"metro": "울산광역시", "media": [{"name": "울주신문", "src": "p"}]},

    # ── 세종 ──
    "세종시": {"metro": "세종특별자치시", "media": [
        {"name": "세종포스트", "src": "p"}, {"name": "세종의소리", "src": "p"},
    ]},

    # ── 경기 (31시군) ──
    "수원시": {"metro": "경기도", "media": [{"name": "수원일보", "src": "p"}, {"name": "수원화성신문", "src": "p"}]},
    "성남시": {"metro": "경기도", "media": [{"name": "성남신문", "src": "p"}, {"name": "성남일보", "src": "p"}]},
    "고양시": {"metro": "경기도", "media": [{"name": "고양신문", "src": "p"}]},
    "용인시": {"metro": "경기도", "media": [{"name": "용인시민신문", "src": "p"}]},
    "부천시": {"metro": "경기도", "media": [{"name": "부천타임즈", "src": "p"}]},
    "안산시": {"metro": "경기도", "media": [{"name": "안산신문", "src": "p"}]},
    "안양시": {"metro": "경기도", "media": [{"name": "안양신문", "src": "p"}]},
    "남양주시": {"metro": "경기도", "media": [{"name": "남양주투데이", "src": "p"}]},
    "화성시": {"metro": "경기도", "media": [{"name": "화성신문", "src": "p"}, {"name": "화성시민신문", "src": "p"}]},
    "평택시": {"metro": "경기도", "media": [{"name": "평택시민신문", "src": "bk"}]},
    "의정부시": {"metro": "경기도", "media": [{"name": "의정부신문", "src": "p"}]},
    "시흥시": {"metro": "경기도", "media": [{"name": "시흥신문", "src": "p"}]},
    "파주시": {"metro": "경기도", "media": [{"name": "파주신문", "src": "p"}]},
    "김포시": {"metro": "경기도", "media": [{"name": "김포신문", "src": "p"}]},
    "광명시": {"metro": "경기도", "media": [{"name": "광명시민신문", "src": "p"}]},
    "광주시": {"metro": "경기도", "media": [{"name": "광주신문", "src": "p"}]},
    "군포시": {"metro": "경기도", "media": [{"name": "군포신문", "src": "p"}]},
    "하남시": {"metro": "경기도", "media": [{"name": "하남신문", "src": "p"}]},
    "오산시": {"metro": "경기도", "media": [{"name": "오산신문", "src": "p"}]},
    "이천시": {"metro": "경기도", "media": [{"name": "이천신문", "src": "p"}]},
    "안성시": {"metro": "경기도", "media": [{"name": "안성신문", "src": "p"}]},
    "의왕시": {"metro": "경기도", "media": [{"name": "의왕신문", "src": "p"}]},
    "양평군": {"metro": "경기도", "media": [{"name": "양평시민의소리", "src": "p"}]},
    "여주시": {"metro": "경기도", "media": [{"name": "여주신문", "src": "p"}]},
    "과천시": {"metro": "경기도", "media": []},
    "구리시": {"metro": "경기도", "media": [{"name": "구리신문", "src": "p"}]},
    "포천시": {"metro": "경기도", "media": [{"name": "포천신문", "src": "p"}]},
    "양주시": {"metro": "경기도", "media": [{"name": "양주신문", "src": "p"}]},
    "동두천시": {"metro": "경기도", "media": [{"name": "동두천신문", "src": "p"}]},
    "가평군": {"metro": "경기도", "media": [{"name": "가평저널", "src": "p"}]},
    "연천군": {"metro": "경기도", "media": [{"name": "연천신문", "src": "p"}]},

    # ── 강원 (18시군) ──
    "춘천시": {"metro": "강원특별자치도", "media": [{"name": "춘천사람들", "src": "p"}]},
    "원주시": {"metro": "강원특별자치도", "media": [{"name": "원주투데이", "src": "p"}, {"name": "원주MBC", "src": "p"}]},
    "강릉시": {"metro": "강원특별자치도", "media": [{"name": "강릉뉴스", "src": "p"}, {"name": "MBC강원영동", "src": "p"}]},
    "동해시": {"metro": "강원특별자치도", "media": [{"name": "동해신문", "src": "p"}]},
    "태백시": {"metro": "강원특별자치도", "media": [{"name": "태백신문", "src": "p"}]},
    "속초시": {"metro": "강원특별자치도", "media": [{"name": "설악신문", "src": "bk"}]},
    "삼척시": {"metro": "강원특별자치도", "media": [{"name": "삼척신문", "src": "p"}]},
    "홍천군": {"metro": "강원특별자치도", "media": [{"name": "홍천뉴스", "src": "p"}]},
    "횡성군": {"metro": "강원특별자치도", "media": []},
    "영월군": {"metro": "강원특별자치도", "media": [{"name": "영월신문", "src": "p"}]},
    "평창군": {"metro": "강원특별자치도", "media": [{"name": "평창신문", "src": "p"}]},
    "정선군": {"metro": "강원특별자치도", "media": [{"name": "정선신문", "src": "p"}]},
    "철원군": {"metro": "강원특별자치도", "media": [{"name": "철원신문", "src": "p"}]},
    "화천군": {"metro": "강원특별자치도", "media": []},
    "양구군": {"metro": "강원특별자치도", "media": []},
    "인제군": {"metro": "강원특별자치도", "media": []},
    "고성군_강원": {"metro": "강원특별자치도", "media": []},
    "양양군": {"metro": "강원특별자치도", "media": []},

    # ── 충북 (11시군) ──
    "청주시": {"metro": "충청북도", "media": [{"name": "충청리뷰", "src": "p"}, {"name": "CJB청주방송", "src": "p"}]},
    "충주시": {"metro": "충청북도", "media": [{"name": "충주신문", "src": "p"}]},
    "제천시": {"metro": "충청북도", "media": [{"name": "제천신문", "src": "p"}]},
    "보은군": {"metro": "충청북도", "media": []},
    "옥천군": {"metro": "충청북도", "media": [{"name": "옥천신문", "src": "p"}]},
    "영동군": {"metro": "충청북도", "media": []},
    "증평군": {"metro": "충청북도", "media": []},
    "진천군": {"metro": "충청북도", "media": [{"name": "진천신문", "src": "p"}]},
    "괴산군": {"metro": "충청북도", "media": []},
    "음성군": {"metro": "충청북도", "media": []},
    "단양군": {"metro": "충청북도", "media": [{"name": "단양뉴스", "src": "p"}]},

    # ── 충남 (15시군) ──
    "천안시": {"metro": "충청남도", "media": [{"name": "천안신문", "src": "p"}]},
    "공주시": {"metro": "충청남도", "media": [{"name": "공주신문", "src": "p"}]},
    "보령시": {"metro": "충청남도", "media": [{"name": "보령신문", "src": "p"}]},
    "아산시": {"metro": "충청남도", "media": [{"name": "아산신문", "src": "p"}]},
    "서산시": {"metro": "충청남도", "media": [{"name": "서산신문", "src": "p"}]},
    "논산시": {"metro": "충청남도", "media": [{"name": "논산신문", "src": "p"}]},
    "계룡시": {"metro": "충청남도", "media": []},
    "당진시": {"metro": "충청남도", "media": [{"name": "당진시대", "src": "bk"}]},
    "금산군": {"metro": "충청남도", "media": [{"name": "금산신문", "src": "p"}]},
    "부여군": {"metro": "충청남도", "media": [{"name": "부여신문", "src": "p"}]},
    "서천군": {"metro": "충청남도", "media": []},
    "청양군": {"metro": "충청남도", "media": []},
    "홍성군": {"metro": "충청남도", "media": [{"name": "홍성신문", "src": "bk"}]},
    "예산군": {"metro": "충청남도", "media": [{"name": "예산신문", "src": "p"}]},
    "태안군": {"metro": "충청남도", "media": [{"name": "태안신문", "src": "p"}]},

    # ── 전북 (14시군) ──
    "전주시": {"metro": "전북특별자치도", "media": [{"name": "전주시민미디어", "src": "p"}]},
    "군산시": {"metro": "전북특별자치도", "media": [{"name": "군산신문", "src": "p"}]},
    "익산시": {"metro": "전북특별자치도", "media": [{"name": "익산신문", "src": "p"}]},
    "정읍시": {"metro": "전북특별자치도", "media": [{"name": "정읍신문", "src": "p"}]},
    "남원시": {"metro": "전북특별자치도", "media": [{"name": "남원신문", "src": "p"}]},
    "김제시": {"metro": "전북특별자치도", "media": [{"name": "김제신문", "src": "p"}]},
    "완주군": {"metro": "전북특별자치도", "media": []},
    "진안군": {"metro": "전북특별자치도", "media": []},
    "무주군": {"metro": "전북특별자치도", "media": []},
    "장수군": {"metro": "전북특별자치도", "media": []},
    "임실군": {"metro": "전북특별자치도", "media": []},
    "순창군": {"metro": "전북특별자치도", "media": []},
    "고창군": {"metro": "전북특별자치도", "media": [{"name": "고창신문", "src": "p"}]},
    "부안군": {"metro": "전북특별자치도", "media": [{"name": "부안신문", "src": "p"}]},

    # ── 전남 (22시군) ──
    "목포시": {"metro": "전라남도", "media": [{"name": "목포시민신문", "src": "p"}, {"name": "목포MBC", "src": "p"}]},
    "여수시": {"metro": "전라남도", "media": [{"name": "여수신문", "src": "p"}, {"name": "여수MBC", "src": "p"}]},
    "순천시": {"metro": "전라남도", "media": [{"name": "순천광장신문", "src": "p"}]},
    "나주시": {"metro": "전라남도", "media": [{"name": "나주신문", "src": "p"}]},
    "광양시": {"metro": "전라남도", "media": [{"name": "광양신문", "src": "p"}]},
    "담양군": {"metro": "전라남도", "media": [{"name": "담양뉴스", "src": "p"}]},
    "곡성군": {"metro": "전라남도", "media": []},
    "구례군": {"metro": "전라남도", "media": []},
    "고흥군": {"metro": "전라남도", "media": [{"name": "고흥신문", "src": "p"}]},
    "보성군": {"metro": "전라남도", "media": []},
    "화순군": {"metro": "전라남도", "media": [{"name": "화순뉴스", "src": "p"}]},
    "장흥군": {"metro": "전라남도", "media": [{"name": "장흥신문", "src": "p"}]},
    "강진군": {"metro": "전라남도", "media": [{"name": "강진신문", "src": "p"}]},
    "해남군": {"metro": "전라남도", "media": [{"name": "해남신문", "src": "p"}]},
    "영암군": {"metro": "전라남도", "media": [{"name": "영암신문", "src": "p"}]},
    "무안군": {"metro": "전라남도", "media": [{"name": "무안신문", "src": "p"}]},
    "함평군": {"metro": "전라남도", "media": []},
    "영광군": {"metro": "전라남도", "media": [{"name": "영광신문", "src": "p"}]},
    "장성군": {"metro": "전라남도", "media": [{"name": "장성신문", "src": "p"}]},
    "완도군": {"metro": "전라남도", "media": [{"name": "완도신문", "src": "p"}]},
    "진도군": {"metro": "전라남도", "media": [{"name": "진도신문", "src": "p"}]},
    "신안군": {"metro": "전라남도", "media": []},

    # ── 경북 (23시군) ──
    "포항시": {"metro": "경상북도", "media": [{"name": "경북신문", "src": "p"}, {"name": "포항MBC", "src": "p"}]},
    "경주시": {"metro": "경상북도", "media": [{"name": "경주신문", "src": "p"}]},
    "김천시": {"metro": "경상북도", "media": [{"name": "김천신문", "src": "p"}]},
    "안동시": {"metro": "경상북도", "media": [{"name": "안동뉴스", "src": "p"}, {"name": "안동MBC", "src": "p"}]},
    "구미시": {"metro": "경상북도", "media": [{"name": "구미신문", "src": "p"}]},
    "영주시": {"metro": "경상북도", "media": [{"name": "영주시민신문", "src": "bk"}]},
    "영천시": {"metro": "경상북도", "media": [{"name": "영천신문", "src": "p"}]},
    "상주시": {"metro": "경상북도", "media": [{"name": "상주신문", "src": "p"}]},
    "문경시": {"metro": "경상북도", "media": [{"name": "문경신문", "src": "p"}]},
    "경산시": {"metro": "경상북도", "media": [{"name": "경산신문", "src": "p"}]},
    "의성군": {"metro": "경상북도", "media": []},
    "청송군": {"metro": "경상북도", "media": []},
    "영양군": {"metro": "경상북도", "media": []},
    "영덕군": {"metro": "경상북도", "media": []},
    "청도군": {"metro": "경상북도", "media": []},
    "고령군": {"metro": "경상북도", "media": []},
    "성주군": {"metro": "경상북도", "media": []},
    "칠곡군": {"metro": "경상북도", "media": []},
    "예천군": {"metro": "경상북도", "media": [{"name": "예천신문", "src": "p"}]},
    "봉화군": {"metro": "경상북도", "media": []},
    "울진군": {"metro": "경상북도", "media": [{"name": "울진신문", "src": "p"}]},
    "울릉군": {"metro": "경상북도", "media": []},
    "군위군": {"metro": "대구광역시", "media": []},

    # ── 경남 (18시군) ──
    "창원시": {"metro": "경상남도", "media": [{"name": "MBC경남", "src": "p"}, {"name": "KBS창원", "src": "p"}]},
    "진주시": {"metro": "경상남도", "media": [{"name": "진주신문", "src": "p"}]},
    "통영시": {"metro": "경상남도", "media": [{"name": "통영신문", "src": "p"}]},
    "사천시": {"metro": "경상남도", "media": [{"name": "사천신문", "src": "p"}]},
    "김해시": {"metro": "경상남도", "media": [{"name": "김해뉴스", "src": "p"}]},
    "밀양시": {"metro": "경상남도", "media": [{"name": "밀양신문", "src": "p"}]},
    "거제시": {"metro": "경상남도", "media": [{"name": "거제신문", "src": "p"}]},
    "양산시": {"metro": "경상남도", "media": [{"name": "양산신문", "src": "p"}]},
    "의령군": {"metro": "경상남도", "media": []},
    "함안군": {"metro": "경상남도", "media": []},
    "창녕군": {"metro": "경상남도", "media": []},
    "고성군_경남": {"metro": "경상남도", "media": []},
    "남해군": {"metro": "경상남도", "media": [{"name": "남해신문", "src": "p"}]},
    "하동군": {"metro": "경상남도", "media": [{"name": "하동신문", "src": "p"}]},
    "산청군": {"metro": "경상남도", "media": []},
    "함양군": {"metro": "경상남도", "media": []},
    "거창군": {"metro": "경상남도", "media": [{"name": "거창신문", "src": "p"}]},
    "합천군": {"metro": "경상남도", "media": [{"name": "합천신문", "src": "p"}]},

    # ── 제주 (2시) ──
    "제주시": {"metro": "제주특별자치도", "media": [
        {"name": "제주일보", "src": "bk"}, {"name": "한라일보", "src": "bk"},
        {"name": "제민일보", "src": "bk"}, {"name": "제주의소리", "src": "p"},
    ]},
    "서귀포시": {"metro": "제주특별자치도", "media": [{"name": "서귀포신문", "src": "p"}]},
}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 4. 유틸리티 함수
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def get_media_text(municipality, max_items=8):
    """프롬프트용 media_text 생성 (이름만 반환)"""
    pool = get_media_pool(municipality)
    names = [m["name"] for m in pool[:max_items]]
    if not names:
        return "지역 주요 언론: (정보 없음)"
    return f"지역 주요 언론: {', '.join(names)}"


def get_media_pool(municipality):
    """
    기초지역의 전체 언론사 풀 반환 (자체 + 광역, source 태그 포함)
    반환: [{"name": "영암신문", "src": "p"}, {"name": "전남일보", "src": "bk"}, ...]
    """
    muni = MUNICIPAL_MEDIA.get(municipality)
    if not muni:
        metro = METRO_MEDIA.get(municipality)
        if metro:
            return list(metro)
        return []

    local_media = muni["media"]
    metro_media = METRO_MEDIA.get(muni["metro"], [])

    combined = []
    seen = set()
    for m in local_media + metro_media:
        if m["name"] not in seen:
            combined.append(m)
            seen.add(m["name"])
    return combined


def get_media_list(municipality):
    """이름만 리스트로 반환 (하위 호환용)"""
    return [m["name"] for m in get_media_pool(municipality)]


def get_bigkinds_only(municipality):
    """빅카인즈 DB에서 검색 가능한 언론사만 반환"""
    return [m for m in get_media_pool(municipality) if m["src"] == "bk"]


def get_portal_only(municipality):
    """포털/RSS로만 수집 가능한 언론사 반환"""
    return [m for m in get_media_pool(municipality) if m["src"] == "p"]
