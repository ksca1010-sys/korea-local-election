#!/usr/bin/env python3
"""
한국갤럽 정당지지율 자동 업데이트 스크립트
- 갤럽 보고서 목록에서 최신 '데일리 오피니언' 호를 찾고
- js/data.js (사이드바 차트) 업데이트
- data/polls/state.json (NESDC 여론조사 히스토리) 동기화
"""

import json
import re
import sys
import os
import ssl
import urllib.request
import urllib.parse
from datetime import datetime

# macOS Python SSL 인증서 문제 우회
SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

# 프로젝트 루트 경로
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_JS_PATH = os.path.join(PROJECT_ROOT, 'js', 'data.js')

GALLUP_LIST_URL = 'https://www.gallup.co.kr/gallupdb/report.asp'
GALLUP_CONTENT_URL = 'https://www.gallup.co.kr/gallupdb/reportContent.asp?seqNo={}'

# 정당명 → data.js 키 매핑
PARTY_KEY_MAP = {
    '더불어민주당': 'democratic',
    '국민의힘': 'ppp',
    '조국혁신당': 'reform',
    '개혁신당': 'newReform',
    '진보당': 'progressive',
    '기본소득당': 'basicIncome',
    '새로운미래': 'newFuture',
}


def fetch_page(url, method='GET', data=None):
    """EUC-KR 인코딩 페이지를 가져와 UTF-8 문자열로 반환"""
    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
                       'AppleWebKit/537.36 (KHTML, like Gecko) '
                       'Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ko-KR,ko;q=0.9',
    }
    if method == 'POST' and data:
        encoded = urllib.parse.urlencode(data).encode('euc-kr')
        req = urllib.request.Request(url, data=encoded, headers=headers)
        req.add_header('Content-Type', 'application/x-www-form-urlencoded')
    else:
        req = urllib.request.Request(url, headers=headers)

    with urllib.request.urlopen(req, timeout=15, context=SSL_CTX) as resp:
        raw = resp.read()

    # EUC-KR → UTF-8
    try:
        return raw.decode('euc-kr', errors='replace')
    except Exception:
        return raw.decode('utf-8', errors='replace')


def find_latest_daily_opinion():
    """보고서 목록에서 최신 '데일리 오피니언' 항목의 seqNo, 제목, 날짜를 반환"""
    html = fetch_page(GALLUP_LIST_URL)

    # div.row 안의 항목들을 파싱
    # 패턴: <span class="t01">번호</span> ... <span class="t02"><a ...>제목</a></span> ... <span class="t03">날짜</span>
    row_pattern = re.compile(
        r'<div\s+class="row">\s*'
        r'<span\s+class="t01">\s*(\d+)\s*</span>\s*'
        r'<span\s+class="t02">\s*<a[^>]*>\s*(.*?)\s*</a>\s*</span>\s*'
        r'<span\s+class="t03">\s*([\d/]+)\s*</span>',
        re.DOTALL
    )

    for m in row_pattern.finditer(html):
        seq_no = m.group(1)
        title = re.sub(r'<[^>]+>', '', m.group(2)).strip()
        date_str = m.group(3).strip()

        if '데일리 오피니언' in title or '데일리오피니언' in title:
            return seq_no, title, date_str

    return None, None, None


def extract_party_support(seq_no):
    """보고서 상세 페이지에서 정당지지율 데이터를 추출"""
    url = GALLUP_CONTENT_URL.format(seq_no)
    html = fetch_page(url)

    result = {
        'seq_no': seq_no,
        'url': url,
        'data': {},
        'survey_date': '',
        'publish_date': '',
        'report_no': '',
        'sample_size': 1001,
        'method': '',
        'margin': 3.1,
        'response_rate': '',
    }

    # 제목에서 호수 추출: "데일리 오피니언 제654호"
    title_match = re.search(r'데일리\s*오피니언\s*제(\d+)호', html)
    if title_match:
        result['report_no'] = f'데일리 오피니언 제{title_match.group(1)}호'

    # 조사일 추출
    date_match = re.search(r'조사일\s*:\s*([\d/]+)', html)
    if date_match:
        result['publish_date'] = date_match.group(1).replace('/', '-')

    # 제목에서 조사 기간 추출: "(2026년 3월 1주)"
    period_match = re.search(r'제\d+호\s*\((\d{4}년\s*\d{1,2}월\s*\d주)\)', html)
    if period_match:
        result['survey_date'] = period_match.group(1)

    # 표본수 추출
    sample_match = re.search(r'(\d[,\d]+)명', html[html.find('만 18세') if '만 18세' in html else 0:])
    if sample_match and '만 18세' in html:
        size_text = sample_match.group(1).replace(',', '')
        try:
            result['sample_size'] = int(size_text)
        except ValueError:
            pass

    # 조사방법 추출
    method_match = re.search(r'(전국\s*만\s*18세\s*이상[^<\n]*(?:전화면접|CATI|RDD)[^<\n]*)', html)
    if method_match:
        result['method'] = re.sub(r'\s+', ' ', method_match.group(1)).strip()

    # 오차범위 추출
    margin_match = re.search(r'[±]\s*([\d.]+)\s*%', html)
    if margin_match:
        result['margin'] = float(margin_match.group(1))

    # 응답률 추출
    resp_match = re.search(r'응답률\s*([\d.]+)\s*%', html)
    if resp_match:
        result['response_rate'] = f'{resp_match.group(1)}%'

    # ── 정당 지지율 파싱 ──
    # 섹션 B (정당 지지도) 이후 텍스트에서 추출
    section_b = html.find('<a name="B">')
    if section_b == -1:
        section_b = html.find('name="B"')
    if section_b == -1:
        # 요약 섹션에서 찾기
        section_b = 0

    text_block = html[section_b:section_b + 3000]
    # HTML 태그 제거
    clean_text = re.sub(r'<[^>]+>', ' ', text_block)
    clean_text = re.sub(r'\s+', ' ', clean_text)

    # 정당별 지지율 추출: "더불어민주당 46%" 패턴
    for party_name, key in PARTY_KEY_MAP.items():
        pct_match = re.search(rf'{re.escape(party_name)}\s*(\d+)\s*%', clean_text)
        if pct_match:
            result['data'][key] = int(pct_match.group(1))

    # 무당층 추출: "무당(無黨)층 26%" 또는 "무당층 26%"
    indep_match = re.search(r'무당[^층]*층\s*(\d+)\s*%', clean_text)
    if indep_match:
        result['data']['independent'] = int(indep_match.group(1))

    return result


def update_data_js(poll_data):
    """js/data.js 의 gallupNationalPoll 객체를 업데이트"""
    with open(DATA_JS_PATH, 'r', encoding='utf-8') as f:
        content = f.read()

    # 조사일시 텍스트 생성
    survey_date_text = poll_data.get('survey_date', '')
    publish_date = poll_data.get('publish_date', '')

    # data 항목 생성 (independent는 항상 마지막)
    data_entries = []
    for key in ['democratic', 'ppp', 'reform', 'newReform', 'progressive', 'basicIncome', 'newFuture']:
        if key in poll_data['data']:
            data_entries.append(f'            {key}: {poll_data["data"][key]}')
    if 'independent' in poll_data['data']:
        data_entries.append(f'            independent: {poll_data["data"]["independent"]}')
    data_block = ',\n'.join(data_entries)

    # 새 gallupNationalPoll 블록 생성
    new_block = f"""    const gallupNationalPoll = {{
        source: '한국갤럽',
        surveyDate: '{survey_date_text}',
        publishDate: '{publish_date}',
        sampleSize: {poll_data['sample_size']},
        method: '{poll_data.get("method", "")}',
        confidence: '95%',
        margin: {poll_data['margin']},
        responseRate: '{poll_data.get("response_rate", "")}',
        reportNo: '{poll_data["report_no"]}',
        url: '{poll_data["url"]}',
        data: {{
{data_block}
        }}
    }};"""

    # 기존 블록 교체
    pattern = re.compile(
        r'(    // 한국갤럽 전국 정당 지지율 데이터.*?\n'
        r'    // 데일리 오피니언.*?\n)?'
        r'    const gallupNationalPoll\s*=\s*\{.*?\};',
        re.DOTALL
    )

    # 주석 포함한 새 블록
    report_no = poll_data['report_no']
    week_info = survey_date_text if survey_date_text else ''
    comment = f"    // 한국갤럽 전국 정당 지지율 데이터 (#4)\n    // {report_no} ({week_info})\n"

    new_content = pattern.sub(comment + new_block, content)

    if new_content == content:
        print('[오류] data.js에서 gallupNationalPoll 블록을 찾지 못했습니다.')
        return False

    with open(DATA_JS_PATH, 'w', encoding='utf-8') as f:
        f.write(new_content)

    return True


PARTY_NAME_MAP = {
    'democratic': '더불어민주당',
    'ppp': '국민의힘',
    'reform': '조국혁신당',
    'newReform': '개혁신당',
    'progressive': '진보당',
    'basicIncome': '기본소득당',
    'independent': '무당층',
}


def sync_state_json(poll_data):
    """data/polls/state.json 의 Gallup party_support 항목을 동기화"""
    state_path = os.path.join(PROJECT_ROOT, 'data', 'polls', 'state.json')
    polls_path = os.path.join(PROJECT_ROOT, 'data', 'polls', 'polls.json')

    if not os.path.exists(state_path):
        print('  [건너뜀] data/polls/state.json 없음')
        return False

    with open(state_path, 'r', encoding='utf-8') as f:
        state = json.load(f)

    polls = state.get('polls', [])
    publish_date = poll_data.get('publish_date', '')
    report_no = poll_data.get('report_no', '')

    # 같은 주차의 기존 Gallup 항목 찾기 (publishDate 또는 reportNo로 매칭)
    target = None
    for p in polls:
        if p.get('electionType') != 'party_support':
            continue
        if p.get('pollOrg', '') != '한국갤럽':
            continue
        if publish_date and p.get('publishDate', '') == publish_date:
            target = p
            break
        if report_no and report_no in (p.get('title', '') + p.get('reportNo', '')):
            target = p
            break

    # 없으면 최신 Gallup 항목을 업데이트 대상으로 사용
    if target is None:
        gallup_polls = [p for p in polls if p.get('electionType') == 'party_support'
                        and p.get('pollOrg', '') == '한국갤럽']
        if gallup_polls:
            gallup_polls.sort(key=lambda p: p.get('publishDate', ''), reverse=True)
            target = gallup_polls[0]

    if target is None:
        print('  [건너뜀] state.json에서 갤럽 항목을 찾지 못했습니다')
        return False

    # results 갱신
    new_results = []
    for key, val in poll_data['data'].items():
        if key == 'independent':
            continue
        party_name = PARTY_NAME_MAP.get(key, key)
        new_results.append({
            'candidateName': party_name,
            'party': key,
            'support': float(val),
            'type': 'party_support',
        })
    new_results.sort(key=lambda r: r['support'], reverse=True)

    target['results'] = new_results
    if publish_date:
        target['publishDate'] = publish_date
    if report_no:
        target['reportNo'] = report_no

    state['meta'] = state.get('meta', {})
    state['meta']['lastUpdated'] = datetime.now().strftime('%Y-%m-%d')

    with open(state_path, 'w', encoding='utf-8') as f:
        json.dump(state, f, ensure_ascii=False, indent=2)
        f.write('\n')

    # polls.json 재생성 (간단히 state 기반 재구성)
    try:
        by_region = {}
        national = []
        for p in polls:
            region = p.get('regionKey')
            if not region:
                national.append(p)
            else:
                by_region.setdefault(region, []).append(p)

        output = {
            'meta': state.get('meta', {}),
            'national': national,
            'byRegion': by_region,
        }
        with open(polls_path, 'w', encoding='utf-8') as f:
            json.dump(output, f, ensure_ascii=False, indent=2)
            f.write('\n')
        print(f'  → polls.json 재생성 완료')
    except Exception as e:
        print(f'  [경고] polls.json 재생성 실패: {e}')

    return True


def main():
    print('=' * 50)
    print('한국갤럽 정당지지율 자동 업데이트')
    print(f'실행 시각: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}')
    print('=' * 50)

    # 1단계: 최신 데일리 오피니언 찾기
    print('\n[1/3] 최신 데일리 오피니언 보고서 검색 중...')
    seq_no, title, date_str = find_latest_daily_opinion()

    if not seq_no:
        print('[오류] 데일리 오피니언 보고서를 찾을 수 없습니다.')
        sys.exit(1)

    print(f'  → 발견: {title}')
    print(f'  → seqNo: {seq_no}, 게시일: {date_str}')

    # 2단계: 정당지지율 데이터 추출
    print('\n[2/3] 정당지지율 데이터 추출 중...')
    poll_data = extract_party_support(seq_no)

    if not poll_data['data']:
        print('[오류] 정당지지율 데이터를 추출할 수 없습니다.')
        sys.exit(1)

    print('  → 추출된 정당지지율:')
    for key, value in poll_data['data'].items():
        print(f'     {key}: {value}%')

    # 3단계: data.js 업데이트 (사이드바 차트)
    print('\n[3/3] js/data.js 업데이트 중...')
    success = update_data_js(poll_data)

    if success:
        print('  → 업데이트 완료!')
        print(f'\n  보고서: {poll_data["report_no"]}')
        print(f'  URL: {poll_data["url"]}')
    else:
        print('  → 업데이트 실패')
        sys.exit(1)

    # 4단계: data/polls/state.json 동기화
    print('\n[4/4] data/polls/state.json 동기화 중...')
    sync_state_json(poll_data)

    print('\n' + '=' * 50)
    print('완료! 브라우저를 새로고침하여 확인하세요.')
    print('=' * 50)


if __name__ == '__main__':
    main()
