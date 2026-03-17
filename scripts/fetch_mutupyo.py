#!/usr/bin/env python3
"""
무투표당선 기초의원 데이터 수집 스크립트
나무위키에서 제8회 지방선거 기초의원 무투표당선 데이터를 추출합니다.
"""
import urllib.request, ssl, re, json, sys, time

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

PARTY_KEY_MAP = {
    '국민의힘': 'ppp', '더불어민주당': 'democratic', '정의당': 'justice',
    '진보당': 'progressive', '기본소득당': 'basicincome', '녹색당': 'green',
    '무소속': 'independent', '새로운물결': 'newwave', '노동당': 'labor',
    '시대전환': 'transition', '한국의희망': 'hopekorea', '국민의당': 'peoples',
}

# Party color codes from namu wiki background-color -> party
PARTY_COLOR_MAP = {
    '#004EA1': 'democratic',  # 더불어민주당 파랑
    '#004ea1': 'democratic',
    '#E61E2B': 'ppp',  # 국민의힘 빨강
    '#e61e2b': 'ppp',
    '#FFCC00': 'justice',  # 정의당 노랑
    '#ffcc00': 'justice',
    '#D6001C': 'progressive',  # 진보당
    '#d6001c': 'progressive',
    '#999999': 'independent',  # 무소속 회색
    '#808080': 'independent',
    '#2E8B57': 'green',  # 녹색당
}

REGIONS = {
    'seoul': {'name': '서울특별시', 'wiki': '서울특별시'},
    'busan': {'name': '부산광역시', 'wiki': '부산광역시'},
    'daegu': {'name': '대구광역시', 'wiki': '대구광역시'},
    'incheon': {'name': '인천광역시', 'wiki': '인천광역시'},
    'gwangju': {'name': '광주광역시', 'wiki': '광주광역시'},
    'daejeon': {'name': '대전광역시', 'wiki': '대전광역시'},
    'ulsan': {'name': '울산광역시', 'wiki': '울산광역시'},
    'gyeonggi': {'name': '경기도', 'wiki': '경기도'},
    'gangwon': {'name': '강원도', 'wiki': '강원도'},
    'chungbuk': {'name': '충청북도', 'wiki': '충청북도'},
    'chungnam': {'name': '충청남도', 'wiki': '충청남도'},
    'jeonbuk': {'name': '전라북도', 'wiki': '전북특별자치도'},
    'jeonnam': {'name': '전라남도', 'wiki': '전라남도'},
    'gyeongbuk': {'name': '경상북도', 'wiki': '경상북도'},
    'gyeongnam': {'name': '경상남도', 'wiki': '경상남도'},
}


def fetch_namu_page(region_wiki_name):
    """나무위키 기초의원 페이지 HTML 가져오기"""
    encoded = urllib.request.quote(f'제8회 전국동시지방선거/기초의회의원/{region_wiki_name}', safe='/')
    url = f'https://namu.wiki/w/{encoded}'
    req = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ko-KR,ko;q=0.9',
    })
    with urllib.request.urlopen(req, timeout=60, context=ctx) as resp:
        return resp.read().decode('utf-8')


def extract_mutupyo_from_html(html, region_key):
    """HTML에서 무투표당선 데이터 추출"""
    results = []  # list of {district, sigungu, members: [{name, party, partyName}]}

    # Find all 무투표 positions in HTML
    mutupyo_positions = [m.start() for m in re.finditer(r'무투표', html)]

    if not mutupyo_positions:
        return results

    # For each 무투표 occurrence, find the enclosing table and extract data
    for mp in mutupyo_positions:
        # Find the table that contains this 무투표 text
        # Look backwards for <table
        table_start = html.rfind('<table', max(0, mp - 5000), mp)
        if table_start == -1:
            continue

        # Find table end
        table_end = html.find('</table>', mp)
        if table_end == -1:
            continue
        table_end += len('</table>')

        table_html = html[table_start:table_end]

        # Extract border color to determine party
        border_match = re.search(r'border:\s*2px\s+solid\s+(#[0-9a-fA-F]+)', table_html)
        border_color = border_match.group(1).lower() if border_match else ''

        # Extract candidate name (in <strong> tags near the 무투표 text)
        # Look for pattern: number | name(hanja) | 무투표당선
        name_matches = re.findall(r'<strong[^>]*>([가-힣]{2,4})\([一-龥㐀-\U0002A6DF]+\)</strong>', table_html)
        if not name_matches:
            name_matches = re.findall(r'<strong[^>]*>([가-힣]{2,4})</strong>', table_html)

        # Get party from border color or from party link
        party_link = re.findall(r"title='([^']+)'", table_html)
        party_name = ''
        for pl in party_link:
            if pl in PARTY_KEY_MAP:
                party_name = pl
                break

        if not party_name and border_color:
            party_key = PARTY_COLOR_MAP.get(border_color, '')
            if party_key:
                for pn, pk in PARTY_KEY_MAP.items():
                    if pk == party_key:
                        party_name = pn
                        break

        party_key = PARTY_KEY_MAP.get(party_name, 'independent')

        # Get candidate name - take the first strong text that looks like a name
        candidate_name = ''
        for nm in name_matches:
            if len(nm) >= 2 and nm not in ('무투표', '당선', '기호'):
                candidate_name = nm
                break

        if candidate_name:
            results.append({
                'name': candidate_name,
                'party': party_key,
                'partyName': party_name or '무소속',
                'table_pos': mp  # for ordering
            })

    return results


def extract_districts_from_html(html):
    """HTML에서 구/선거구 구조 추출"""
    # Find section headings that contain 구/시/군 names
    # Namu wiki structure: h2=시도, h3=구/시/군, h4=지역구/비례, h5=선거구

    # Strategy: find all text content between table sections
    # and identify district names like "가선거구", "나선거구" etc.

    # Find all occurrences of X선거구 pattern in heading-like contexts
    district_pattern = re.compile(r'([가나다라마바사아자차카타파하])선거구')
    gu_pattern = re.compile(r'([가-힣]+[구군시])')

    # Build a position map: position -> (type, name)
    # type: 'gu' or 'district'
    markers = []

    # Find gu headings (h2, h3, h4 elements)
    for m in re.finditer(r'<h[2-4][^>]*>(.*?)</h[2-4]>', html, re.DOTALL):
        text = re.sub(r'<[^>]+>', '', m.group(1)).strip()
        gu_match = gu_pattern.search(text)
        if gu_match:
            gu_name = gu_match.group(1)
            # Skip generic headings
            if gu_name not in ('지역구', '비례대표'):
                markers.append((m.start(), 'gu', gu_name))

    # Find district sub-sections
    # Districts are often in bold or as sub-headings within the content
    for m in re.finditer(r'([가나다라마바사아자차카타파하])선거구', html):
        # Check if this is in a heading-like context (bold, heading tag, or standalone)
        before = html[max(0, m.start()-200):m.start()]
        if '<h' in before[-50:] or '<strong' in before[-50:] or '## ' in before[-20:]:
            markers.append((m.start(), 'district', m.group(0)))

    return markers


def process_region(region_key, region_info, missing_districts):
    """한 지역의 무투표당선 데이터 수집"""
    print(f"\n{'='*60}")
    print(f"Processing {region_key} ({region_info['name']})...")

    missing_for_region = [d for d in missing_districts if d.startswith(region_key + '/')]
    if not missing_for_region:
        print(f"  No missing districts")
        return {}

    print(f"  {len(missing_for_region)} missing districts")

    try:
        html = fetch_namu_page(region_info['wiki'])
        print(f"  Fetched {len(html)} bytes")
    except Exception as e:
        print(f"  Error fetching: {e}")
        return {}

    # Parse the full page to get all district data
    mutupyo_data = extract_mutupyo_from_html(html, region_key)
    print(f"  Found {len(mutupyo_data)} 무투표당선 entries")

    # Now we need to associate each 무투표 entry with its district
    # Strategy: Find section boundaries and match 무투표 entries to districts

    # Find all section markers (gu headings and district headings)
    all_headings = []
    for m in re.finditer(r'<h[2-5][^>]*>(.*?)</h[2-5]>', html, re.DOTALL):
        text = re.sub(r'<[^>]+>', '', m.group(1)).strip()
        text = text.replace('&#91;편집&#93;', '').strip()
        text = re.sub(r'^[\d.]+\s*', '', text).strip()
        all_headings.append((m.start(), text))

    # Build gu tracking
    current_gu = ''
    gu_positions = []
    for pos, text in all_headings:
        gu_match = re.search(r'([가-힣]+[구군시])$', text)
        if gu_match and text not in ('지역구', '비례대표'):
            gu_positions.append((pos, gu_match.group(1)))

    # Find district sub-headers within content
    # Look for bold text with 선거구 pattern
    district_positions = []
    # In namu wiki, district names often appear as: <strong>가선거구</strong> or in headings
    for m in re.finditer(r'([가나다라마바사아자차카타파하])선거구', html):
        district_positions.append((m.start(), m.group(0)))

    # For each 무투표 entry, find its gu and district
    matched = {}
    for entry in mutupyo_data:
        pos = entry['table_pos']

        # Find closest gu before this position
        gu = ''
        for gp, gn in gu_positions:
            if gp < pos:
                gu = gn

        # Find closest district before this position
        district = ''
        for dp, dn in district_positions:
            if dp < pos and dp > (pos - 5000):  # within 5000 chars
                district = dn

        if gu and district:
            full_district = f"{gu} {district}"
            if full_district not in matched:
                matched[full_district] = []
            matched[full_district].append({
                'name': entry['name'],
                'party': entry['party'],
                'partyName': entry['partyName']
            })

    print(f"  Matched to {len(matched)} districts:")
    for d, members in sorted(matched.items()):
        names = ', '.join(f"{m['name']}({m['partyName']})" for m in members)
        print(f"    {d}: {names}")

    return matched


def main():
    # Load current member data
    with open('data/basic_council/basic_council_members.json') as f:
        members = json.load(f)

    # Load topo districts to find what's missing
    import glob
    topo_districts = {}  # region/district_name
    bad_patterns = ['비고', '구역지역구', '비례지역구', '지역구 ', '지역목포시']

    for f_path in sorted(glob.glob('data/basic_council/*/*.json')):
        if 'basic_council_members' in f_path or '.geojson' in f_path:
            continue
        parts = f_path.split('/')
        region = parts[2]
        with open(f_path) as fp:
            topo = json.load(fp)
        obj_name = list(topo['objects'].keys())[0]
        for geom in topo['objects'][obj_name]['geometries']:
            name = geom['properties'].get('district_name', '')
            if name and not any(bp in name for bp in bad_patterns):
                key = f"{region}/{name}"
                topo_districts[key] = geom['properties'].get('seats', 2)

    # Find missing districts
    member_districts = set()
    for region, sigungus in members['regions'].items():
        for sg, dists in sigungus.items():
            for d in dists:
                member_districts.add(f"{region}/{d}")

    missing = sorted(set(topo_districts.keys()) - member_districts)
    print(f"Total topo districts: {len(topo_districts)}")
    print(f"Total member districts: {len(member_districts)}")
    print(f"Missing: {len(missing)}")

    # Process each region
    all_new_data = {}  # region -> {district -> [members]}

    for region_key, region_info in REGIONS.items():
        region_missing = [d for d in missing if d.startswith(region_key + '/')]
        if not region_missing:
            continue

        matched = process_region(region_key, region_info, missing)
        if matched:
            all_new_data[region_key] = matched

        time.sleep(1)  # Be polite to namu wiki

    # Merge with existing data
    added_count = 0
    for region_key, districts in all_new_data.items():
        for district_name, new_members in districts.items():
            # Find sigungu from district name
            sigungu_match = re.match(r'([가-힣]+[구군시])', district_name)
            if not sigungu_match:
                continue
            sigungu = sigungu_match.group(1)

            if region_key not in members['regions']:
                members['regions'][region_key] = {}
            if sigungu not in members['regions'][region_key]:
                members['regions'][region_key][sigungu] = {}

            if district_name not in members['regions'][region_key][sigungu]:
                members['regions'][region_key][sigungu][district_name] = new_members
                added_count += len(new_members)
                print(f"  Added: {region_key}/{district_name} ({len(new_members)} members)")

    # Update meta
    total_members = sum(
        len(ms)
        for sigungus in members['regions'].values()
        for dists in sigungus.values()
        for ms in dists.values()
    )
    total_districts = sum(
        len(dists)
        for sigungus in members['regions'].values()
        for dists in sigungus.values()
    )

    members['_meta']['totalMembers'] = total_members
    members['_meta']['totalDistricts'] = total_districts

    with open('data/basic_council/basic_council_members.json', 'w', encoding='utf-8') as f:
        json.dump(members, f, ensure_ascii=False, indent=2)

    print(f"\n{'='*60}")
    print(f"Added {added_count} new members")
    print(f"Total districts: {total_districts}")
    print(f"Total members: {total_members}")
    print(f"Remaining missing: {len(missing) - len([d for r in all_new_data.values() for d in r])}")


if __name__ == '__main__':
    main()
