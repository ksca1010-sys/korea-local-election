#!/usr/bin/env python3
"""
재보궐선거 뉴스 자동감지 + NEC 교차검증 파이프라인

1. Naver News API에서 재보궐 관련 뉴스 수집
2. 정규식으로 선거구/사유/유형 추출
3. NEC 선관위 데이터로 교차 검증
4. byelection_pending.json에 감지 결과 출력 (사람 검토 대기)

사용법:
  python3 scripts/candidate_pipeline/detect_byelection_news.py

환경변수:
  NAVER_CLIENT_ID     - 네이버 검색 API 클라이언트 ID
  NAVER_CLIENT_SECRET - 네이버 검색 API 시크릿
"""

import json
import os
import re
import ssl
import time
import urllib.request
import urllib.parse
from datetime import datetime, timedelta
from pathlib import Path
from email.utils import parsedate_to_datetime

# ============================================
# Paths
# ============================================
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
CANDIDATES_DIR = PROJECT_ROOT / 'data' / 'candidates'
EXISTING_FILE = CANDIDATES_DIR / 'byelection.json'
PENDING_FILE = CANDIDATES_DIR / 'byelection_pending.json'
STATE_FILE = CANDIDATES_DIR / 'byelection_news_state.json'
STATUS_UPDATES_FILE = CANDIDATES_DIR / 'byelection_status_updates.json'

CURRENT_YEAR = datetime.now().year

# ============================================
# Configuration
# ============================================
SEARCH_QUERIES = [
    '재보궐선거 확정',
    '보궐선거 공고 2026',
    '의원직 상실 보궐',
    '의원 사퇴 보궐선거',
    '당선무효 재선거 확정',
    '국회의원 보궐 2026',
    '지방의회 보궐 2026',
]

MAX_ARTICLES_PER_QUERY = 50
NEWS_LOOKBACK_DAYS = 14
CONFIDENCE_THRESHOLD = 50

# ============================================
# Region / District Mappings
# ============================================
REGION_NAME_MAP = {
    '서울': 'seoul', '부산': 'busan', '대구': 'daegu',
    '인천': 'incheon', '광주': 'gwangju', '대전': 'daejeon',
    '울산': 'ulsan', '세종': 'sejong', '경기': 'gyeonggi',
    '강원': 'gangwon', '충북': 'chungbuk', '충남': 'chungnam',
    '전북': 'jeonbuk', '전남': 'jeonnam', '경북': 'gyeongbuk',
    '경남': 'gyeongnam', '제주': 'jeju',
}

# 정당명 → partyKey
PARTY_MAP = {
    '더불어민주당': 'democratic', '민주당': 'democratic',
    '국민의힘': 'ppp',
    '개혁신당': 'newReform', '새로운미래': 'newFuture',
    '진보당': 'progressive', '정의당': 'justice',
    '조국혁신당': 'reform', '무소속': 'independent',
}

# ============================================
# Stage 1: News Collection
# ============================================
def fetch_naver_news(query, display=50):
    """Naver Search API로 뉴스 수집"""
    client_id = os.environ.get('NAVER_CLIENT_ID')
    client_secret = os.environ.get('NAVER_CLIENT_SECRET')

    if not client_id or not client_secret:
        return None

    url = 'https://openapi.naver.com/v1/search/news.json'
    params = urllib.parse.urlencode({
        'query': query,
        'display': min(display, 100),
        'sort': 'date',
    })

    req = urllib.request.Request(f'{url}?{params}')
    req.add_header('X-Naver-Client-Id', client_id)
    req.add_header('X-Naver-Client-Secret', client_secret)

    ctx = ssl.create_default_context()
    try:
        import certifi
        ctx.load_verify_locations(certifi.where())
    except ImportError:
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE

    try:
        with urllib.request.urlopen(req, timeout=15, context=ctx) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            return data.get('items', [])
    except Exception as e:
        print(f'  [WARN] Naver API error for "{query}": {e}')
        return []


def strip_html(text):
    """HTML 태그 제거"""
    return re.sub(r'<[^>]+>', '', text or '')


def collect_news():
    """모든 검색어로 뉴스 수집 (중복 제거)"""
    client_id = os.environ.get('NAVER_CLIENT_ID')
    if not client_id:
        print('[WARN] NAVER_CLIENT_ID not set, skipping news collection')
        return []

    # Load state for dedup
    seen_links = set()
    if STATE_FILE.exists():
        state = json.load(open(STATE_FILE, 'r', encoding='utf-8'))
        seen_links = set(state.get('seen_links', []))

    cutoff = datetime.now() - timedelta(days=NEWS_LOOKBACK_DAYS)
    articles = []
    all_links = set()

    for query in SEARCH_QUERIES:
        items = fetch_naver_news(query, MAX_ARTICLES_PER_QUERY)
        if items is None:
            break  # API key missing
        if not items:
            continue

        for item in items:
            link = item.get('originallink') or item.get('link', '')
            if link in all_links or link in seen_links:
                continue
            all_links.add(link)

            # Parse date
            pub_date_str = item.get('pubDate', '')
            try:
                pub_date = parsedate_to_datetime(pub_date_str)
                if pub_date.replace(tzinfo=None) < cutoff:
                    continue
            except Exception:
                continue

            articles.append({
                'title': strip_html(item.get('title', '')),
                'description': strip_html(item.get('description', '')),
                'link': link,
                'date': pub_date.strftime('%Y-%m-%d'),
                'query': query,
            })

        time.sleep(0.3)  # Rate limiting

    # Update state
    new_seen = seen_links | all_links
    # Keep only recent 1000 links
    if len(new_seen) > 1000:
        new_seen = set(list(new_seen)[-1000:])
    with open(STATE_FILE, 'w', encoding='utf-8') as f:
        json.dump({
            'seen_links': list(new_seen),
            'lastRun': datetime.now().isoformat(),
        }, f, ensure_ascii=False, indent=2)

    print(f'[NEWS] Collected {len(articles)} articles from {len(SEARCH_QUERIES)} queries')
    return articles


# ============================================
# Stage 2: Information Extraction
# ============================================
REASON_PATTERNS = [
    (re.compile(r'당선\s*무효'), '당선무효로 공석'),
    (re.compile(r'의원직\s*상실'), '의원직 상실로 공석'),
    (re.compile(r'선거법\s*위반.*유죄'), '선거법 위반 유죄 확정'),
    (re.compile(r'사퇴|사임'), '사퇴'),
    (re.compile(r'사망'), '사망으로 공석'),
    (re.compile(r'피선거권\s*상실'), '피선거권 상실'),
    (re.compile(r'궐원|궐위'), '궐원'),
    (re.compile(r'대통령.*당선'), '대통령 당선으로 궐위'),
]

ELECTION_TYPE_PATTERNS = [
    (re.compile(r'국회의원'), '국회의원'),
    (re.compile(r'광역단체장|도지사|특별시장|광역시장'), '광역단체장'),
    (re.compile(r'기초단체장|구청장|군수|시장'), '기초단체장'),
    (re.compile(r'광역의원|시\s*도\s*의원|도의원'), '광역의원'),
    (re.compile(r'기초의원|구의원|군의원|시의원'), '기초의원'),
]

SUB_TYPE_PATTERNS = [
    (re.compile(r'재선거'), '재선거'),
    (re.compile(r'보궐'), '보궐선거'),
]

# 선거구 패턴: "OO구갑", "OO시을", "OO군" 등
DISTRICT_PATTERN = re.compile(
    r'([가-힣]{1,4}(?:시|구|군|도)(?:[가-힣]{0,3}(?:시|구|군))?)\s*([갑을병정])?'
)

# 의원명 패턴: "OOO 의원", "OOO(정당)"
MEMBER_PATTERN = re.compile(
    r'([가-힣]{2,4})\s*(?:의원|전\s*의원|前\s*의원)'
)

# 정당 패턴
PARTY_PATTERN = re.compile(
    r'([가-힣]{2,6}(?:당|미래|신당|혁신당))'
)

# 추측성 키워드
SPECULATION_KEYWORDS = ['가능성', '전망', '검토', '논의', '추진', '예상', '관측']
CONFIRMATION_KEYWORDS = ['확정', '공고', '선관위', '중앙선거관리위원회', '결정']

# 과거 연도 패턴
PAST_YEAR_PATTERN = re.compile(r'20(?:1[0-9]|2[0-5])년')


def extract_info(article):
    """기사에서 재보궐 정보 추출"""
    text = f"{article['title']} {article['description']}"

    # Skip if mentions past year in by-election context
    past_years = PAST_YEAR_PATTERN.findall(text)
    current_year_str = f'{CURRENT_YEAR}년'
    if past_years and current_year_str not in text:
        # Only past years mentioned, likely historical article
        return None

    # Extract region
    region = None
    region_key = None
    for name, key in REGION_NAME_MAP.items():
        if name in text:
            region = name
            region_key = key
            break

    if not region_key:
        return None

    # Extract district
    district = None
    district_suffix = None
    matches = DISTRICT_PATTERN.findall(text)
    for match_name, match_suffix in matches:
        # Skip generic matches like "선거구"
        if match_name in ['선거', '보궐', '재보']:
            continue
        district = match_name
        district_suffix = match_suffix
        break

    if not district:
        return None

    full_district = f'{district}{district_suffix}' if district_suffix else district

    # Extract election type
    election_type = None
    for pattern, etype in ELECTION_TYPE_PATTERNS:
        if pattern.search(text):
            election_type = etype
            break

    if not election_type:
        # Default to 국회의원 if "보궐" mentioned without type
        if '보궐' in text or '재선거' in text:
            election_type = '국회의원'
        else:
            return None

    # Extract sub type
    sub_type = '보궐선거'  # default
    for pattern, stype in SUB_TYPE_PATTERNS:
        if pattern.search(text):
            sub_type = stype
            break

    # Extract reason
    reason = None
    for pattern, reason_text in REASON_PATTERNS:
        if pattern.search(text):
            reason = reason_text
            break

    if not reason:
        reason = '공석 (사유 확인 필요)'

    # Extract previous member
    prev_member = None
    member_match = MEMBER_PATTERN.search(text)
    if member_match:
        name = member_match.group(1)
        # Try to find party
        party = 'independent'
        party_match = PARTY_PATTERN.search(text)
        if party_match:
            party_name = party_match.group(1)
            for pname, pkey in PARTY_MAP.items():
                if pname in party_name:
                    party = pkey
                    break
        prev_member = {'name': name, 'party': party}

    # Generate key
    key = f'{region_key}-{district}'.lower().replace(' ', '-')
    # Normalize key: remove Korean chars, use romanized district
    key = f'{region_key}-{full_district}'

    # Calculate confidence score
    confidence = 0
    for kw in CONFIRMATION_KEYWORDS:
        if kw in text:
            confidence += 25
    if district_suffix:  # 갑/을 등 specific district
        confidence += 20
    if reason and reason != '공석 (사유 확인 필요)':
        confidence += 15
    if prev_member:
        confidence += 10
    for kw in SPECULATION_KEYWORDS:
        if kw in text:
            confidence -= 15

    # Ensure minimum 0
    confidence = max(0, min(100, confidence))

    return {
        'key': key,
        'region': region_key,
        'district': full_district,
        'electionType': election_type,
        'subType': sub_type,
        'reason': reason,
        'previousMember': prev_member,
        'confidence': confidence,
        'sources': [{
            'title': article['title'],
            'link': article['link'],
            'date': article['date'],
        }],
    }


def deduplicate_detections(detections, existing_keys):
    """중복 제거 및 기존 데이터와 비교"""
    merged = {}

    for d in detections:
        key = d['key']

        # Skip if already in byelection.json
        if key in existing_keys:
            continue

        if key in merged:
            # Merge: keep higher confidence, combine sources
            existing = merged[key]
            if d['confidence'] > existing['confidence']:
                d['sources'] = existing['sources'] + d['sources']
                merged[key] = d
            else:
                existing['sources'].extend(d['sources'])
                existing['confidence'] = max(existing['confidence'], d['confidence'])
        else:
            merged[key] = d

    # Deduplicate sources
    for d in merged.values():
        seen = set()
        unique_sources = []
        for s in d['sources']:
            if s['link'] not in seen:
                seen.add(s['link'])
                unique_sources.append(s)
        d['sources'] = unique_sources[:5]  # Keep max 5 sources

    return merged


# ============================================
# Stage 3: NEC Cross-Validation
# ============================================
def validate_with_nec(detections):
    """NEC 선관위 API로 교차 검증"""
    api_key = os.environ.get('NEC_API_KEY', '')
    if not api_key:
        print('[NEC] NEC_API_KEY 미설정, 교차검증 건너뜀')
        for d in detections.values():
            d['necValidated'] = False
        return detections

    import xml.etree.ElementTree as ET

    # 현재 확정된 재보궐 선거구 조회
    try:
        params = urllib.parse.urlencode({
            'sgId': '20260603', 'sgTypecode': '2',
            'numOfRows': '50', 'pageNo': '1', 'resultType': 'xml',
        })
        url = f'http://apis.data.go.kr/9760000/CommonCodeService/getCommonSggCodeList?serviceKey={urllib.parse.quote(api_key, safe="")}&{params}'
        with urllib.request.urlopen(url, timeout=15) as resp:
            data = resp.read().decode('utf-8')
            root = ET.fromstring(data)
            nec_districts = set()
            for it in root.iter('item'):
                sgg = it.findtext('sggName', '').strip()
                if sgg:
                    nec_districts.add(sgg)
        print(f'[NEC] 선관위 확정 {len(nec_districts)}개 선거구')
    except Exception as e:
        print(f'[NEC] API 오류: {e}')
        for d in detections.values():
            d['necValidated'] = False
        return detections

    for key, d in detections.items():
        district = d.get('district', '')
        # NEC 목록에 포함되면 검증 통과
        matched = any(district in nec or nec in district for nec in nec_districts)
        d['necValidated'] = matched
        if matched:
            d['confidence'] = min(100, d.get('confidence', 0) + 30)
            print(f'  [NEC ✓] {key}: 선관위 확인됨 → confidence +30')
        else:
            print(f'  [NEC ✗] {key}: 선관위 미확인')

    return detections


# ============================================
# Stage 4: Pending File Management
# ============================================
def load_pending():
    """기존 pending 파일 로드"""
    if PENDING_FILE.exists():
        with open(PENDING_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {'_meta': {}, 'detections': []}


def merge_into_pending(new_detections, pending):
    """새 감지 결과를 pending에 병합"""
    existing_keys = {d['key'] for d in pending['detections']}
    added = 0

    for key, detection in new_detections.items():
        if detection['confidence'] < CONFIDENCE_THRESHOLD:
            print(f'  [SKIP] {key}: confidence {detection["confidence"]} < {CONFIDENCE_THRESHOLD}')
            continue

        if key in existing_keys:
            # Update existing: merge sources, update confidence
            for d in pending['detections']:
                if d['key'] == key and d['status'] == 'pending':
                    new_links = {s['link'] for s in d['sources']}
                    for s in detection['sources']:
                        if s['link'] not in new_links:
                            d['sources'].append(s)
                    d['confidence'] = max(d['confidence'], detection['confidence'])
            continue

        detection['status'] = 'pending'
        detection['detectedAt'] = datetime.now().isoformat()
        pending['detections'].append(detection)
        added += 1
        print(f'  [ADD] {key} ({detection["district"]}, {detection["electionType"]}) confidence={detection["confidence"]}')

    pending['_meta'] = {
        'lastRun': datetime.now().isoformat(),
        'totalDetections': len(pending['detections']),
        'pendingCount': sum(1 for d in pending['detections'] if d['status'] == 'pending'),
        'approvedCount': sum(1 for d in pending['detections'] if d['status'] == 'approved'),
        'rejectedCount': sum(1 for d in pending['detections'] if d['status'] == 'rejected'),
    }

    print(f'[PENDING] Added {added} new detections')
    return pending


def process_approved(pending):
    """approved 항목을 status_updates로 이동"""
    approved = [d for d in pending['detections'] if d['status'] == 'approved']
    if not approved:
        return 0

    # Load status updates
    if STATUS_UPDATES_FILE.exists():
        with open(STATUS_UPDATES_FILE, 'r', encoding='utf-8') as f:
            updates = json.load(f)
    else:
        updates = {'newElections': [], 'candidateUpdates': [], 'electionUpdates': []}

    existing_keys = {e.get('key') for e in updates.get('newElections', [])}
    added = 0

    for d in approved:
        if d['key'] in existing_keys:
            continue

        new_election = {
            'key': d['key'],
            'region': d['region'],
            'district': d['district'],
            'electionType': d['electionType'],
            'subType': d['subType'],
            'reason': d['reason'],
            'status': '확정' if d.get('necValidated') else '확정예정',
            'voters': d.get('voters', 0),
            'keyIssues': d.get('keyIssues', []),
        }
        if d.get('previousMember'):
            new_election['previousMember'] = d['previousMember']
        if d.get('prevElection'):
            new_election['prevElection'] = d['prevElection']

        updates['newElections'].append(new_election)
        added += 1
        print(f'  [APPROVE] {d["key"]} → byelection_status_updates.json')

    if added > 0:
        with open(STATUS_UPDATES_FILE, 'w', encoding='utf-8') as f:
            json.dump(updates, f, ensure_ascii=False, indent=2)

    # Mark as processed
    for d in pending['detections']:
        if d['status'] == 'approved':
            d['status'] = 'processed'

    print(f'[APPROVE] Moved {added} approved detections to status_updates')
    return added


def save_pending(pending):
    """Pending 파일 저장"""
    with open(PENDING_FILE, 'w', encoding='utf-8') as f:
        json.dump(pending, f, ensure_ascii=False, indent=2)


# ============================================
# Main
# ============================================
def load_env():
    env_file = PROJECT_ROOT / '.env'
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, _, v = line.partition('=')
                os.environ.setdefault(k.strip(), v.strip().strip("'\""))


def main():
    load_env()
    print('=' * 60)
    print('재보궐선거 뉴스 자동감지 파이프라인')
    print(f'실행 시각: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}')
    print('=' * 60)

    # Load existing byelection keys for dedup
    existing_keys = set()
    if EXISTING_FILE.exists():
        with open(EXISTING_FILE, 'r', encoding='utf-8') as f:
            existing = json.load(f)
        existing_keys = set(existing.get('districts', {}).keys())
    print(f'\n[LOAD] Existing by-elections: {len(existing_keys)}')

    # Stage 1: Collect news
    print(f'\n--- Stage 1: 뉴스 수집 ---')
    articles = collect_news()

    # Stage 2: Extract info
    print(f'\n--- Stage 2: 정보 추출 ---')
    detections = []
    for article in articles:
        info = extract_info(article)
        if info:
            detections.append(info)
    print(f'[EXTRACT] {len(detections)} detections from {len(articles)} articles')

    # Deduplicate
    deduped = deduplicate_detections(detections, existing_keys)
    print(f'[DEDUP] {len(deduped)} unique new detections')

    # Stage 3: NEC validation
    print(f'\n--- Stage 3: NEC 교차검증 ---')
    validated = validate_with_nec(deduped)

    # Stage 4: Update pending file
    print(f'\n--- Stage 4: Pending 파일 관리 ---')
    pending = load_pending()

    # First, process any previously approved items
    process_approved(pending)

    # Then, add new detections
    pending = merge_into_pending(validated, pending)
    save_pending(pending)

    # Summary
    meta = pending['_meta']
    print(f'\n[SUMMARY]')
    print(f'  Pending: {meta.get("pendingCount", 0)}')
    print(f'  Approved → processed: {meta.get("approvedCount", 0)}')
    print(f'  Rejected: {meta.get("rejectedCount", 0)}')
    print(f'\n[SAVE] Written to {PENDING_FILE}')
    print('=' * 60)


if __name__ == '__main__':
    main()
