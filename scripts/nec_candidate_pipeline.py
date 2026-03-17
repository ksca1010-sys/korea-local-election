#!/usr/bin/env python3
"""
선관위 오픈API 후보자 데이터 파이프라인
────────────────────────────────────────
대상: 제9회 전국동시지방선거 (2026-06-03)
출처: https://data.nec.go.kr/open-data/api.do (선거통계시스템)

선거 유형코드 (SG_TYPECODE):
    2  = 광역단체장
    3  = 기초단체장 (시장/군수/구청장)
    5  = 광역의원
    6  = 기초의원
    8  = 교육감
    9  = 광역비례대표
   10  = 기초비례대표

사용법:
    python nec_candidate_pipeline.py --sgid 20260603 --type governor  # 광역단체장
    python nec_candidate_pipeline.py --sgid 20260603 --type mayor     # 기초단체장
    python nec_candidate_pipeline.py --sgid 20260603 --type council   # 광역의원
    python nec_candidate_pipeline.py --sgid 20260603 --type local     # 기초의원
    python nec_candidate_pipeline.py --mock                            # 목업 데이터 (후보 등록 전)
    python nec_candidate_pipeline.py --check-api                       # API 연결 확인
"""

import argparse
import json
import os
import sys
import time
import urllib.request
import urllib.parse
import ssl
from datetime import datetime
from pathlib import Path

# ── 설정 ──────────────────────────────────────────────────────────────────────
BASE_DIR   = Path(__file__).parent.parent
OUTPUT_DIR = BASE_DIR / 'data' / 'candidates'
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

API_BASE    = 'https://data.nec.go.kr/open-data/api.do'
SG_ID_2026  = '20260603'   # 2026 지방선거 선거 ID (확정 전 예상값)
SG_ID_2022  = '20220601'   # 제8회 (2022) – 테스트용

# 지역 코드표 (광역시도 코드 → KOSTAT 코드)
REGION_CODES = {
    'seoul':    ('11', '서울특별시'),
    'busan':    ('26', '부산광역시'),
    'daegu':    ('27', '대구광역시'),
    'incheon':  ('28', '인천광역시'),
    'gwangju':  ('29', '광주광역시'),
    'daejeon':  ('30', '대전광역시'),
    'ulsan':    ('31', '울산광역시'),
    'sejong':   ('36', '세종특별자치시'),
    'gyeonggi': ('41', '경기도'),
    'gangwon':  ('51', '강원특별자치도'),
    'chungbuk': ('43', '충청북도'),
    'chungnam': ('44', '충청남도'),
    'jeonbuk':  ('52', '전북특별자치도'),
    'jeonnam':  ('46', '전라남도'),
    'gyeongbuk':('47', '경상북도'),
    'gyeongnam':('48', '경상남도'),
    'jeju':     ('50', '제주특별자치도'),
}

TYPE_CODES = {
    'governor':  '2',   # 광역단체장
    'mayor':     '3',   # 기초단체장
    'council':   '5',   # 광역의원
    'local':     '6',   # 기초의원
    'superintendent': '8',  # 교육감
}

# 정당 키 정규화 (선관위 한글 정당명 → 내부 키)
PARTY_KEY_MAP = {
    '더불어민주당': 'democratic',
    '민주당':       'democratic',
    '국민의힘':     'ppp',
    '조국혁신당':   'reform',
    '개혁신당':     'newReform',
    '진보당':       'progressive',
    '정의당':       'justice',
    '새로운미래':   'newFuture',
    '무소속':       'independent',
}

# ── API 클라이언트 ──────────────────────────────────────────────────────────────
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE


def fetch_api(params: dict, service_key: str = '', timeout: int = 15) -> dict | None:
    """선관위 오픈API 호출 (JSON 응답)"""
    params['returnType'] = 'json'
    if service_key:
        params['serviceKey'] = service_key

    url = API_BASE + '?' + urllib.parse.urlencode(params, quote_via=urllib.parse.quote)
    try:
        with urllib.request.urlopen(url, timeout=timeout, context=ctx) as resp:
            raw = resp.read().decode('utf-8')
            return json.loads(raw)
    except Exception as e:
        print(f'  [API 오류] {e}', file=sys.stderr)
        return None


def check_api_availability() -> bool:
    """API 연결 가능 여부 확인 (2022년 데이터로 테스트)"""
    print('선관위 API 연결 확인 중...')
    result = fetch_api({
        'sgId': SG_ID_2022,
        'sgTypeCode': '2',
        'dataId': '1',  # 후보자 명부
        'sdName': '서울특별시',
        'numOfRows': '5',
    })
    if result and result.get('resultCode') == '00':
        print(f'  ✅ API 연결 성공 (결과코드: {result["resultCode"]})')
        return True
    print(f'  ❌ API 연결 실패: {result}')
    return False


# ── 데이터 정규화 ──────────────────────────────────────────────────────────────
def normalize_party(party_name: str) -> str:
    return PARTY_KEY_MAP.get(party_name, 'other')


def normalize_candidate(raw: dict, region_key: str, idx: int) -> dict:
    """선관위 API 응답 후보자 항목 → 내부 포맷 변환"""
    # 필드명이 버전별로 다를 수 있어 복수 키 시도
    def get(*keys, default=''):
        for k in keys:
            v = raw.get(k, '')
            if v and str(v).strip(): return str(v).strip()
        return default

    name    = get('candNm', 'candName', 'name')
    party   = get('jdName', 'parNm', 'party', default='무소속')
    age     = get('age', 'candAge', default='')
    career  = get('career', 'candCareer', 'career1', default='')
    num     = get('candNo', 'huboid', default=str(idx + 1))

    return {
        'id':     f'{region_key}-{num}',
        'name':   name,
        'party':  normalize_party(party),
        'partyName': party,  # 원본 정당명 보존
        'age':    int(age) if str(age).isdigit() else None,
        'career': career,
        'photo':  None,
        'pledges': [],
        'source': 'nec-api',
        'fetchedAt': datetime.now().isoformat(),
    }


# ── 실제 데이터 수집 ──────────────────────────────────────────────────────────
def fetch_governor_candidates(sg_id: str, service_key: str = '') -> dict:
    """광역단체장 후보 수집"""
    all_data = {}
    for region_key, (code, name) in REGION_CODES.items():
        print(f'  {name} 광역단체장 후보 조회...')
        result = fetch_api({
            'sgId': sg_id,
            'sgTypeCode': TYPE_CODES['governor'],
            'dataId': '1',
            'sdName': name,
            'numOfRows': '50',
        }, service_key)

        candidates = []
        if result and result.get('resultCode') == '00':
            rows = result.get('result', {}).get('rows', [])
            for i, row in enumerate(rows):
                candidates.append(normalize_candidate(row, region_key, i))
            print(f'    → {len(candidates)}명 수집')
        else:
            print(f'    → 데이터 없음 (후보 등록 전이거나 API 오류)')

        all_data[region_key] = candidates
        time.sleep(0.3)  # API 레이트 리밋 방지

    return all_data


def fetch_local_council_candidates(sg_id: str, region_key: str, sigungu: str, service_key: str = '') -> list:
    """기초의원 후보 수집 (시군구 단위)"""
    code, sd_name = REGION_CODES[region_key]
    result = fetch_api({
        'sgId': sg_id,
        'sgTypeCode': TYPE_CODES['local'],
        'dataId': '1',
        'sdName': sd_name,
        'wiwName': sigungu,
        'numOfRows': '200',
    }, service_key)

    if not result or result.get('resultCode') != '00':
        return []

    rows = result.get('result', {}).get('rows', [])
    return [normalize_candidate(r, f'{region_key}-{sigungu}', i) for i, r in enumerate(rows)]


# ── 목업 데이터 (후보 등록 전 개발용) ──────────────────────────────────────────
MOCK_CANDIDATES = {
    # 알려진/유력 출마 예정자 (2026-03 기준 언론 보도 기반)
    'seoul': [
        {'id': 'seoul-1', 'name': '이재명', 'party': 'democratic', 'partyName': '더불어민주당',
         'age': 62, 'career': '前 대통령 후보 / 前 경기도지사', 'photo': None,
         'pledges': ['서울형 기본주택 10만호', '지하철 요금 동결', 'AI 스마트시티'],
         'source': 'mock', 'note': '출마 여부 미확정'},
        {'id': 'seoul-2', 'name': '오세훈', 'party': 'ppp', 'partyName': '국민의힘',
         'age': 63, 'career': '현 서울시장 (3선 도전)', 'photo': None,
         'pledges': ['한강 르네상스 2.0', 'UAM 상용화', '서울 글로벌 톱5'],
         'source': 'mock', 'note': '재선 도전 유력'},
    ],
    'busan': [
        {'id': 'busan-1', 'name': '박형준', 'party': 'ppp', 'partyName': '국민의힘',
         'age': 62, 'career': '현 부산시장 (재선 도전)', 'photo': None,
         'pledges': ['2030 엑스포 레거시', '스마트 해양도시', '부산 메가시티'],
         'source': 'mock', 'note': '재선 도전 유력'},
    ],
    'daegu': [
        {'id': 'daegu-1', 'name': '홍준표', 'party': 'ppp', 'partyName': '국민의힘',
         'age': 70, 'career': '前 대구시장 / 前 대통령 후보', 'photo': None,
         'pledges': ['대구경북통합신공항', '첨단산업 유치', '대구 메디시티'],
         'source': 'mock', 'note': '대선 사퇴 후 복귀 여부 미확정'},
    ],
    'incheon': [
        {'id': 'incheon-1', 'name': '유정복', 'party': 'ppp', 'partyName': '국민의힘',
         'age': 66, 'career': '현 인천시장 (재선 도전)', 'photo': None,
         'pledges': ['제2경제자유구역', '바이오 의료 허브', '인천 문화 올림픽'],
         'source': 'mock', 'note': '재선 도전 유력'},
    ],
    'gwangju': [
        {'id': 'gwangju-1', 'name': '강기정', 'party': 'democratic', 'partyName': '더불어민주당',
         'age': 58, 'career': '현 광주시장 (재선 도전)', 'photo': None,
         'pledges': ['AI 산업 수도', '광주-전남 메가시티', '광주형 기본소득'],
         'source': 'mock', 'note': '재선 도전 유력'},
    ],
    'daejeon': [
        {'id': 'daejeon-1', 'name': '이장우', 'party': 'ppp', 'partyName': '국민의힘',
         'age': 61, 'career': '현 대전시장 (재선 도전)', 'photo': None,
         'pledges': ['대전 스마트시티', '공항 연결 광역교통', '과학기술 허브'],
         'source': 'mock', 'note': '재선 도전 유력'},
    ],
    'ulsan': [
        {'id': 'ulsan-1', 'name': '김두겸', 'party': 'ppp', 'partyName': '국민의힘',
         'age': 64, 'career': '현 울산시장 (재선 도전)', 'photo': None,
         'pledges': ['수소산업 클러스터', '방어진 재개발', '울산 문화도시'],
         'source': 'mock', 'note': '재선 도전 유력'},
    ],
    'sejong': [
        {'id': 'sejong-1', 'name': '최민호', 'party': 'ppp', 'partyName': '국민의힘',
         'age': 65, 'career': '현 세종시장 (재선 도전)', 'photo': None,
         'pledges': ['행정수도 완성', 'GTX 세종 연장', '스마트시티 2단계'],
         'source': 'mock', 'note': '재선 도전 유력'},
    ],
    'gyeonggi': [
        {'id': 'gyeonggi-1', 'name': '김동연', 'party': 'democratic', 'partyName': '더불어민주당',
         'age': 63, 'career': '현 경기도지사 (재선 도전) / 前 경제부총리', 'photo': None,
         'pledges': ['경기 기본소득 확대', 'GTX 전선망 완성', '반도체 메가클러스터'],
         'source': 'mock', 'note': '재선 도전 유력'},
    ],
    'gangwon': [
        {'id': 'gangwon-1', 'name': '김진태', 'party': 'ppp', 'partyName': '국민의힘',
         'age': 60, 'career': '현 강원도지사 (재선 도전)', 'photo': None,
         'pledges': ['강릉-서울 고속철도', '강원 관광 혁신', '2024 동계청소년올림픽 레거시'],
         'source': 'mock', 'note': '재선 도전 유력'},
    ],
    'chungbuk': [
        {'id': 'chungbuk-1', 'name': '김영환', 'party': 'ppp', 'partyName': '국민의힘',
         'age': 63, 'career': '현 충청북도지사 (재선 도전)', 'photo': None,
         'pledges': ['오송 바이오클러스터', '충북 반도체 단지', 'KTX 충북선 연장'],
         'source': 'mock', 'note': '재선 도전 유력'},
    ],
    'chungnam': [
        {'id': 'chungnam-1', 'name': '김태흠', 'party': 'ppp', 'partyName': '국민의힘',
         'age': 58, 'career': '현 충청남도지사 (재선 도전)', 'photo': None,
         'pledges': ['충남 첨단산업 벨트', '보령 해양관광', '충청권 메가시티'],
         'source': 'mock', 'note': '재선 도전 유력'},
    ],
    'jeonbuk': [
        {'id': 'jeonbuk-1', 'name': '김관영', 'party': 'democratic', 'partyName': '더불어민주당',
         'age': 58, 'career': '현 전북도지사 (재선 도전)', 'photo': None,
         'pledges': ['전북특별자치도 특례 확대', '새만금 투자 활성화', '전북형 기본소득'],
         'source': 'mock', 'note': '재선 도전 유력'},
    ],
    'jeonnam': [
        {'id': 'jeonnam-1', 'name': '김영록', 'party': 'democratic', 'partyName': '더불어민주당',
         'age': 68, 'career': '현 전라남도지사 (재선 도전)', 'photo': None,
         'pledges': ['전남 해상풍력 허브', '광주-전남 행정통합', '전남형 농업직불금'],
         'source': 'mock', 'note': '재선 도전 유력'},
    ],
    'gyeongbuk': [
        {'id': 'gyeongbuk-1', 'name': '이철우', 'party': 'ppp', 'partyName': '국민의힘',
         'age': 67, 'career': '현 경상북도지사 (3선 도전)', 'photo': None,
         'pledges': ['대구경북통합신공항', '경북 첨단소재 산업', '행정통합 완성'],
         'source': 'mock', 'note': '3선 도전 유력'},
    ],
    'gyeongnam': [
        {'id': 'gyeongnam-1', 'name': '박완수', 'party': 'ppp', 'partyName': '국민의힘',
         'age': 64, 'career': '현 경상남도지사 (재선 도전)', 'photo': None,
         'pledges': ['창원 방산 클러스터', '경남 수소산업', '남해안 관광벨트'],
         'source': 'mock', 'note': '재선 도전 유력'},
    ],
    'jeju': [
        {'id': 'jeju-1', 'name': '오영훈', 'party': 'democratic', 'partyName': '더불어민주당',
         'age': 57, 'career': '현 제주도지사 (재선 도전)', 'photo': None,
         'pledges': ['제주 제2공항 재추진', '카본프리 아일랜드', '제주 자치분권 강화'],
         'source': 'mock', 'note': '재선 도전 유력'},
    ],
}


# ── 출력 ─────────────────────────────────────────────────────────────────────
def save_json(data: dict, filename: str):
    path = OUTPUT_DIR / filename
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f'  💾 저장: {path}')


def generate_data_js_snippet(candidates_by_region: dict) -> str:
    """data.js에 붙여넣을 수 있는 candidates 블록 생성"""
    lines = ['// ── 자동 생성: nec_candidate_pipeline.py ──']
    lines.append(f'// 생성 시각: {datetime.now().strftime("%Y-%m-%d %H:%M")}')
    lines.append('')
    for region_key, cands in candidates_by_region.items():
        lines.append(f"// {REGION_CODES[region_key][1]}")
        lines.append(f"'{region_key}': {{")
        lines.append(f"  candidates: {json.dumps(cands, ensure_ascii=False, indent=4)},")
        lines.append('}},')
        lines.append('')
    return '\n'.join(lines)


# ── 메인 ─────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description='선관위 오픈API 후보자 데이터 파이프라인')
    parser.add_argument('--sgid', default=SG_ID_2026, help='선거 ID (기본: 20260603)')
    parser.add_argument('--type', choices=['governor', 'mayor', 'council', 'local', 'superintendent'],
                        default='governor', help='선거 유형')
    parser.add_argument('--region', help='특정 지역만 수집 (예: seoul)')
    parser.add_argument('--service-key', default='', help='선관위 API 서비스 키')
    parser.add_argument('--mock', action='store_true', help='목업 데이터 사용 (후보 등록 전)')
    parser.add_argument('--check-api', action='store_true', help='API 연결 확인만')
    parser.add_argument('--output-js', action='store_true', help='data.js 스니펫 추가 출력')
    args = parser.parse_args()

    print('=' * 60)
    print('선관위 후보자 데이터 파이프라인 v1.0')
    print(f'선거 ID: {args.sgid}  |  유형: {args.type}')
    print('=' * 60)

    if args.check_api:
        check_api_availability()
        return

    if args.mock:
        print('\n[목업 모드] 언론 보도 기반 예상 후보자 데이터 사용')
        data = MOCK_CANDIDATES
        if args.region:
            data = {args.region: MOCK_CANDIDATES.get(args.region, [])}

        # 요약
        total = sum(len(v) for v in data.values())
        print(f'  → {len(data)}개 지역, 총 {total}명')

        out = {
            'generatedAt': datetime.now().isoformat(),
            'mode': 'mock',
            'note': '후보 등록 전 목업 데이터 (2026.05 후보 등록 후 업데이트 예정)',
            'candidates': data,
        }
        save_json(out, f'candidates_governor_mock.json')

        if args.output_js:
            print('\n── data.js 스니펫 ──')
            print(generate_data_js_snippet(data))
        return

    # 실제 API 수집
    print(f'\n[API 수집 모드] 선거 ID: {args.sgid}')

    if args.type == 'governor':
        regions = {args.region: REGION_CODES[args.region]} if args.region else REGION_CODES
        print(f'{len(regions)}개 시도 광역단체장 후보 수집 시작...\n')
        data = fetch_governor_candidates(args.sgid, args.service_key)

        out = {
            'generatedAt': datetime.now().isoformat(),
            'sgId': args.sgid,
            'type': args.type,
            'candidates': data,
        }
        save_json(out, f'candidates_governor_{args.sgid}.json')

        total = sum(len(v) for v in data.values())
        print(f'\n✅ 완료: 총 {total}명 수집')

        if args.output_js:
            print('\n── data.js 스니펫 ──')
            print(generate_data_js_snippet(data))

    elif args.type == 'local':
        # 기초의원은 시군구 단위
        from scripts.basic_council_pipeline import parse_hwp_text  # noqa (참조)
        print('기초의원 후보는 시군구 단위 수집이 필요합니다.')
        print('사용법: --type local --region seoul --sigungu 강남구')
        print('(현재는 광역단체장/교육감 우선 구현)')
    else:
        print(f'[미구현] {args.type} 유형은 추후 지원 예정')


if __name__ == '__main__':
    main()
