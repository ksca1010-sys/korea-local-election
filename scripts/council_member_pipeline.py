#!/usr/bin/env python3
"""
광역의원 현직의원 데이터 수집 파이프라인
────────────────────────────────────────
대상: 제8회 전국동시지방선거 (2022-06-01) 광역의원 당선인
출처: 선관위 역대선거정보시스템 (info.nec.go.kr)

출력: data/council/council_members.json
"""

import json
import os
import sys
import time
import urllib.request
import urllib.parse
import ssl
import re
from datetime import datetime
from pathlib import Path
from html.parser import HTMLParser

BASE_DIR = Path(__file__).parent.parent
OUTPUT_FILE = BASE_DIR / 'data' / 'council' / 'council_members.json'
TOPO_DIR = BASE_DIR / 'data' / 'council'

# ── 선관위 역대선거 정보시스템 ──
# info.nec.go.kr에서 당선인 명부 조회
NEC_INFO_BASE = 'http://info.nec.go.kr'

# SSL 설정
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

# 선관위 시도 코드 (info.nec.go.kr 전용)
NEC_CITY_CODES = {
    'seoul':    ('1100', '서울특별시'),
    'busan':    ('2600', '부산광역시'),
    'daegu':    ('2700', '대구광역시'),
    'incheon':  ('2800', '인천광역시'),
    'gwangju':  ('2900', '광주광역시'),
    'daejeon':  ('3000', '대전광역시'),
    'ulsan':    ('3100', '울산광역시'),
    'sejong':   ('3611', '세종특별자치시'),
    'gyeonggi': ('4100', '경기도'),
    'gangwon':  ('4200', '강원특별자치도'),
    'chungbuk': ('4300', '충청북도'),
    'chungnam': ('4400', '충청남도'),
    'jeonbuk':  ('4500', '전북특별자치도'),
    'jeonnam':  ('4600', '전라남도'),
    'gyeongbuk':('4700', '경상북도'),
    'gyeongnam':('4800', '경상남도'),
    'jeju':     ('4900', '제주특별자치도'),
}

# 정당 키 정규화
PARTY_KEY_MAP = {
    '더불어민주당': 'democratic',
    '민주당': 'democratic',
    '국민의힘': 'ppp',
    '조국혁신당': 'reform',
    '개혁신당': 'newReform',
    '진보당': 'progressive',
    '정의당': 'justice',
    '새로운미래': 'newFuture',
    '무소속': 'independent',
    '녹색정의당': 'justice',
}


def normalize_party(party_name: str) -> str:
    return PARTY_KEY_MAP.get(party_name.strip(), 'other')


# ── TopoJSON에서 선거구 목록 추출 ──
def load_topo_districts(region_key: str) -> list[str]:
    """TopoJSON에서 district_name 목록 추출"""
    topo_file = TOPO_DIR / f'council_districts_{region_key}_topo.json'
    if not topo_file.exists():
        return []
    with open(topo_file, encoding='utf-8') as f:
        topo = json.load(f)
    obj_key = list(topo['objects'].keys())[0]
    return [
        g['properties']['district_name']
        for g in topo['objects'][obj_key]['geometries']
        if 'district_name' in g.get('properties', {})
    ]


# ── HTML 파서: 선관위 당선인 페이지 ──
class NECElectedParser(HTMLParser):
    """info.nec.go.kr 당선인 정보 HTML 파싱"""

    def __init__(self):
        super().__init__()
        self.members = []
        self._in_table = False
        self._in_td = False
        self._current_row = []
        self._current_text = ''
        self._td_count = 0
        self._row_count = 0

    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)
        if tag == 'table':
            cls = attrs_dict.get('class', '')
            if 'table01' in cls or 'tablestyle' in cls:
                self._in_table = True
        if self._in_table and tag == 'td':
            self._in_td = True
            self._current_text = ''
        if self._in_table and tag == 'tr':
            self._current_row = []
            self._td_count = 0

    def handle_endtag(self, tag):
        if self._in_table and tag == 'td':
            self._in_td = False
            self._current_row.append(self._current_text.strip())
            self._td_count += 1
        if self._in_table and tag == 'tr':
            if self._td_count >= 3 and self._current_row:
                self._row_count += 1
                self.members.append(list(self._current_row))
        if tag == 'table' and self._in_table:
            self._in_table = False

    def handle_data(self, data):
        if self._in_td:
            self._current_text += data


# ── 선관위 data.nec.go.kr API (JSON) ──
API_BASE = 'https://data.nec.go.kr/open-data/api.do'
SG_ID_2022 = '20220601'


def fetch_api(params: dict, timeout: int = 15) -> dict | None:
    """선관위 오픈API 호출"""
    params['returnType'] = 'json'
    url = API_BASE + '?' + urllib.parse.urlencode(params, quote_via=urllib.parse.quote)
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
            raw = resp.read().decode('utf-8')
            return json.loads(raw)
    except Exception as e:
        print(f'  [API 오류] {e}', file=sys.stderr)
        return None


def fetch_elected_council_members_api(region_key: str) -> list[dict]:
    """선관위 data.nec.go.kr API로 2022 광역의원 당선인 조회"""
    city_code, city_name = NEC_CITY_CODES[region_key]
    members = []

    # 당선인 명부 API (dataId=6: 당선인)
    for data_id in ['6', '1']:
        result = fetch_api({
            'sgId': SG_ID_2022,
            'sgTypeCode': '5',  # 광역의원
            'dataId': data_id,
            'sdName': city_name,
            'numOfRows': '500',
        })

        if result and result.get('resultCode') == '00':
            rows = result.get('result', {}).get('rows', [])
            if rows:
                for row in rows:
                    name = (row.get('candNm') or row.get('name') or '').strip()
                    party = (row.get('jdName') or row.get('parNm') or '무소속').strip()
                    district = (row.get('sggName') or row.get('constit') or '').strip()
                    sigungu = (row.get('wiwName') or row.get('sigungu') or '').strip()

                    if not name:
                        continue

                    members.append({
                        'name': name,
                        'party': normalize_party(party),
                        'partyName': party,
                        'district': district,
                        'sigungu': sigungu,
                    })
                print(f'    → API dataId={data_id}: {len(rows)}명')
                break  # 성공하면 다음 dataId 시도 불필요
        time.sleep(0.3)

    return members


# ── 선관위 info.nec.go.kr HTML 스크래핑 (fallback) ──
def fetch_elected_html(region_key: str) -> list[dict]:
    """info.nec.go.kr 당선인 페이지 HTML 스크래핑"""
    city_code, city_name = NEC_CITY_CODES[region_key]

    # 당선인 통계 페이지 URL
    url = (
        f'{NEC_INFO_BASE}/electioninfo/electionInfo_report.xhtml'
        f'?electionId=0020220601'
        f'&requestURI=/electioninfo/0020220601/vc/vccp09.jsp'
        f'&statementId=VCCP09'
        f'&electionCode=5'  # 광역의원
        f'&cityCode={city_code}'
    )

    try:
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
            'Accept': 'text/html',
        })
        with urllib.request.urlopen(req, timeout=20, context=ctx) as resp:
            html = resp.read().decode('utf-8', errors='replace')

        parser = NECElectedParser()
        parser.feed(html)

        members = []
        for row in parser.members:
            # 일반적으로: [선거구명, 기호, 후보자명, 소속정당, 득표수, ...]
            if len(row) < 4:
                continue
            # 숫자만 있는 행(합계 등) 건너뛰기
            if all(c.isdigit() or c == ',' or c == '' for c in row):
                continue

            district = row[0] if len(row) > 0 else ''
            name = row[2] if len(row) > 2 else ''
            party = row[3] if len(row) > 3 else '무소속'

            if not name or name == '성명':
                continue

            members.append({
                'name': name.strip(),
                'party': normalize_party(party.strip()),
                'partyName': party.strip(),
                'district': district.strip(),
                'sigungu': '',
            })

        return members
    except Exception as e:
        print(f'  [HTML 스크래핑 오류] {e}', file=sys.stderr)
        return []


# ── 선거구명 매칭 ──
def normalize_district_name(name: str) -> str:
    """선거구명 정규화 (공백, '제' 처리)"""
    name = re.sub(r'\s+', ' ', name.strip())
    # "종로구제1선거구" → "종로구 제1선거구"
    name = re.sub(r'(\S구|시|군)(제?\d+선거구)', r'\1 \2', name)
    # "종로구 1선거구" → "종로구 제1선거구"
    name = re.sub(r'(\s)(\d+선거구)', r'\1제\2', name)
    return name


def match_district_name(api_name: str, topo_names: list[str]) -> str | None:
    """API 선거구명을 TopoJSON district_name에 매칭"""
    normalized = normalize_district_name(api_name)

    # 1) 정확히 매칭
    if normalized in topo_names:
        return normalized

    # 2) 정규화 후 매칭
    for tn in topo_names:
        if normalize_district_name(tn) == normalized:
            return tn

    # 3) 부분 매칭 (시군구명 + 번호)
    m = re.match(r'(.+?)\s*제?(\d+)\s*선거구', normalized)
    if m:
        base, num = m.group(1), m.group(2)
        for tn in topo_names:
            if base in tn and f'제{num}선거구' in tn:
                return tn

    # 4) 단일 선거구 ("XX군 선거구" 형태)
    base_name = normalized.replace(' 선거구', '').strip()
    for tn in topo_names:
        if tn.startswith(base_name) and '선거구' in tn:
            return tn

    return None


# ── 메인 파이프라인 ──
def collect_all_council_members():
    """전국 17개 시도 광역의원 당선인 수집"""
    all_data = {}
    total_members = 0
    total_matched = 0
    total_unmatched = 0

    for region_key in NEC_CITY_CODES:
        city_code, city_name = NEC_CITY_CODES[region_key]
        print(f'\n[{city_name}] ({region_key})')

        # TopoJSON 선거구 목록 로드
        topo_districts = load_topo_districts(region_key)
        print(f'  TopoJSON 선거구: {len(topo_districts)}개')

        # API로 시도
        print(f'  선관위 API 조회...')
        members = fetch_elected_council_members_api(region_key)

        if not members:
            print(f'  API 실패, HTML 스크래핑 시도...')
            members = fetch_elected_html(region_key)

        if not members:
            print(f'  ❌ 데이터 수집 실패')
            all_data[region_key] = {'members': [], 'source': 'none'}
            continue

        print(f'  수집된 의원: {len(members)}명')

        # 선거구명 매칭
        matched_members = []
        unmatched = []

        for m in members:
            district_name = match_district_name(m['district'], topo_districts)
            if district_name:
                m['district'] = district_name  # 정규화된 이름으로 교체
                matched_members.append(m)
            else:
                unmatched.append(m)

        if unmatched:
            print(f'  ⚠️  매칭 실패 {len(unmatched)}명:')
            for u in unmatched[:5]:
                print(f'     {u["district"]} - {u["name"]}')
            if len(unmatched) > 5:
                print(f'     ... 외 {len(unmatched) - 5}명')

        # 선거구별로 그룹화
        district_members = {}
        for m in matched_members:
            d = m['district']
            if d not in district_members:
                district_members[d] = []
            district_members[d].append({
                'name': m['name'],
                'party': m['party'],
                'partyName': m['partyName'],
            })

        all_data[region_key] = {
            'members': matched_members,
            'districtMembers': district_members,
            'source': 'nec-2022',
            'totalMembers': len(matched_members),
            'totalDistricts': len(district_members),
            'unmatchedCount': len(unmatched),
        }

        total_members += len(matched_members)
        total_matched += len(matched_members)
        total_unmatched += len(unmatched)

        print(f'  ✅ 매칭 {len(matched_members)}명 / {len(district_members)}개 선거구')
        time.sleep(0.5)

    return all_data, total_members, total_matched, total_unmatched


def save_output(data: dict, total: int, matched: int, unmatched: int):
    """결과 저장"""
    output = {
        '_meta': {
            'description': '광역의원 현직의원 데이터 (2022 지방선거 당선인 기준)',
            'source': '선관위 역대선거정보시스템 (info.nec.go.kr)',
            'electionId': '20220601',
            'electionName': '제8회 전국동시지방선거',
            'generatedAt': datetime.now().isoformat(),
            'totalMembers': total,
            'matchedMembers': matched,
            'unmatchedMembers': unmatched,
        },
        'regions': {}
    }

    for region_key, region_data in data.items():
        output['regions'][region_key] = {
            'districtMembers': region_data.get('districtMembers', {}),
            'totalMembers': region_data.get('totalMembers', 0),
            'totalDistricts': region_data.get('totalDistricts', 0),
        }

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f'\n💾 저장: {OUTPUT_FILE}')
    print(f'   총 {total}명 ({matched} 매칭, {unmatched} 미매칭)')


if __name__ == '__main__':
    print('='*60)
    print('광역의원 현직의원 데이터 수집 파이프라인')
    print('='*60)

    # API 연결 확인
    print('\n선관위 API 연결 확인...')
    test = fetch_api({
        'sgId': SG_ID_2022,
        'sgTypeCode': '5',
        'dataId': '6',
        'sdName': '서울특별시',
        'numOfRows': '5',
    })
    if test and test.get('resultCode') == '00':
        print('  ✅ API 연결 성공')
    else:
        print(f'  ⚠️  API 응답: {test}')
        print('  HTML 스크래핑 모드로 대체합니다.')

    data, total, matched, unmatched = collect_all_council_members()
    save_output(data, total, matched, unmatched)
    print('\n✅ 완료!')
