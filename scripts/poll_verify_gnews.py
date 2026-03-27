#!/usr/bin/env python3
"""
Google News RSS로 여론조사 데이터 검증/보완

원칙:
  1순위: NESDC 공식 데이터 (원본)
  2순위: Google News 기사로 교차검증 (보완)
  - 기사 2건 이상에서 동일 수치 확인 시만 채택
  - AI 추정/생성 절대 금지
  - 모든 보완에 출처 URL 기록

대상: polls.json에서 results:[]인 항목

사용법:
  python scripts/poll_verify_gnews.py
  python scripts/poll_verify_gnews.py --dry-run
"""

import json
import re
import sys
import time
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path
from collections import Counter

BASE = Path(__file__).resolve().parent.parent
POLLS_PATH = BASE / "data" / "polls" / "polls.json"
GNEWS_PROXY = "https://election-news-proxy.ksca1010.workers.dev/api/gnews"

# 지지율 추출 정규식: "홍길동 45.2%" 또는 "홍길동(더불어민주당) 45.2%"
SUPPORT_PATTERN = re.compile(
    r'([가-힣]{2,4})\s*(?:\(([가-힣]+)\))?\s*(\d{1,2}(?:\.\d)?)\s*%'
)

# 비후보 단어 (정규식 추출에서 제외)
NON_CANDIDATE_WORDS = {
    '긍정평가', '부정평가', '적합도', '지지율', '오차범위', '표본오차',
    '응답률', '모름', '무응답', '기타', '해당없음', '모르겠다',
    '찬성', '반대', '매우', '다소', '그저그렇다', '잘모름',
    '속장영수', '당최훈식',  # 파싱 잡음
}

# 정당 매핑
PARTY_MAP = {
    "더불어민주당": "democratic", "민주당": "democratic",
    "국민의힘": "ppp", "조국혁신당": "reform",
    "개혁신당": "newReform", "진보당": "progressive",
    "정의당": "justice", "새로운미래": "newFuture",
    "무소속": "independent",
}

def normalize_party(name):
    if not name:
        return None
    for k, v in PARTY_MAP.items():
        if k in name:
            return v
    return None


def search_gnews(query, max_retries=2):
    """Google News RSS 검색 → 기사 목록 반환"""
    import ssl
    url = f"{GNEWS_PROXY}?query={urllib.parse.quote(query)}"
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    for attempt in range(max_retries + 1):
        try:
            req = urllib.request.Request(url, headers={
                "Accept": "application/json",
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
            })
            with urllib.request.urlopen(req, timeout=15, context=ctx) as resp:
                data = json.loads(resp.read())
                return data.get("items", [])
        except Exception as e:
            if attempt < max_retries:
                time.sleep(1)
            else:
                print(f"    [오류] Google News 검색 실패: {e}")
                return []


def extract_poll_results(articles):
    """기사 목록에서 후보별 지지율 추출.

    Returns:
        dict: candidateName → [(support, party, source_url), ...]
        각 후보에 대해 여러 기사에서 추출된 수치 목록
    """
    candidate_data = {}

    for article in articles:
        text = f"{article.get('title', '')} {article.get('description', '')}"
        source = article.get("link", "")

        matches = SUPPORT_PATTERN.findall(text)
        for name, party_raw, support_str in matches:
            if name in NON_CANDIDATE_WORDS:
                continue
            support = float(support_str)
            if support < 3 or support > 80:  # 비정상 수치 제거 (3% 미만, 80% 초과)
                continue
            party = normalize_party(party_raw)

            if name not in candidate_data:
                candidate_data[name] = []
            candidate_data[name].append({
                "support": support,
                "party": party,
                "source": source
            })

    return candidate_data


def verify_and_build_results(candidate_data, min_sources=2):
    """교차검증: 2건 이상 기사에서 동일 수치가 나온 경우만 확정.

    Returns:
        list: [{"candidateName", "support", "party"}, ...] or None
        str: 검증 소스 설명
    """
    verified_results = []
    sources = set()

    for name, entries in candidate_data.items():
        if len(entries) < min_sources:
            continue

        # 동일 수치가 2건 이상인지 확인
        support_counts = Counter(e["support"] for e in entries)
        most_common_support, count = support_counts.most_common(1)[0]

        if count < min_sources:
            # 수치가 모두 다르면 → 신뢰할 수 없음
            continue

        # 정당 정보: 가장 많이 나온 것 채택 (null 제외)
        party_counts = Counter(e["party"] for e in entries if e["party"])
        party = party_counts.most_common(1)[0][0] if party_counts else None

        # 소스 URL 수집
        for e in entries:
            if e["support"] == most_common_support:
                sources.add(e["source"])

        verified_results.append({
            "candidateName": name,
            "support": most_common_support,
            "party": party,
        })

    if not verified_results:
        return None, ""

    # 지지율 높은 순 정렬
    verified_results.sort(key=lambda x: x["support"], reverse=True)
    source_str = " + ".join(list(sources)[:3])
    return verified_results, source_str


REGION_NAMES = {
    "seoul": "서울", "busan": "부산", "daegu": "대구", "incheon": "인천",
    "gwangju": "광주", "daejeon": "대전", "ulsan": "울산", "sejong": "세종",
    "gyeonggi": "경기", "gangwon": "강원", "chungbuk": "충북", "chungnam": "충남",
    "jeonbuk": "전북", "jeonnam": "전남", "gyeongbuk": "경북", "gyeongnam": "경남",
    "jeju": "제주",
}

def build_queries(poll):
    """여론조사 메타데이터로 Google News 검색 쿼리 생성 (최대 2개)"""
    org = poll.get("pollOrg", "").replace("(주)", "").strip()
    region = poll.get("regionKey", "")
    region_name = REGION_NAMES.get(region, "")
    municipality = poll.get("municipality", "")
    location = municipality or region_name

    queries = []
    # 1차: "조사기관 지역 여론조사" (정밀)
    if org and location:
        queries.append(f'"{org}" "{location}" 여론조사')
    # 2차: "지역 선거 여론조사 지지율" (광범위)
    if location:
        et = poll.get("electionType", "")
        if et == "district_mayor" and municipality:
            suffix = "시장" if municipality.endswith("시") else "군수" if municipality.endswith("군") else "구청장"
            queries.append(f'{municipality}{suffix} 여론조사 지지율')
        elif "광역" in (poll.get("title") or "") or et == "mayor":
            queries.append(f'{region_name} 지사 여론조사 지지율')

    return queries[:2]


def main():
    dry_run = "--dry-run" in sys.argv

    polls = json.loads(POLLS_PATH.read_text(encoding="utf-8"))

    # results가 비어있는 여론조사 찾기
    empty_polls = []
    for region, poll_list in polls.get("regions", {}).items():
        for poll in poll_list:
            if not poll.get("results") or len(poll["results"]) == 0:
                empty_polls.append((region, poll))

    print(f"results 비어있는 여론조사: {len(empty_polls)}건")

    if not empty_polls:
        print("보완할 항목 없음")
        return

    verified_count = 0
    skipped_count = 0

    for region, poll in empty_polls:
        ntt_id = poll.get("nttId", "?")
        org = poll.get("pollOrg", "?")
        title = poll.get("title", "?")

        queries = build_queries(poll)
        print(f"\n[{ntt_id}] {org} — {title}")

        # Google News 검색 (최대 2개 쿼리)
        articles = []
        for q in queries:
            print(f"  쿼리: {q}")
            result = search_gnews(q)
            articles.extend(result)
            time.sleep(0.3)

        if not articles:
            print("  → 기사 없음")
            skipped_count += 1
            continue

        print(f"  → {len(articles)}건 기사 발견")

        # 지지율 추출
        candidate_data = extract_poll_results(articles)
        if not candidate_data:
            print("  → 지지율 추출 실패")
            skipped_count += 1
            continue

        print(f"  → {len(candidate_data)}명 후보 감지")

        # 교차검증 (2건 이상 동일 수치)
        results, source_str = verify_and_build_results(candidate_data)
        if not results:
            print("  → 교차검증 실패 (2건 이상 동일 수치 없음)")
            skipped_count += 1
            continue

        print(f"  ✅ 검증 완료: {len(results)}명")
        for r in results:
            party_str = r['party'] or '?'
            print(f"     {r['candidateName']} ({party_str}) {r['support']}%")

        if not dry_run:
            poll["results"] = results
            poll["_corrected"] = True
            poll["_correctionSource"] = f"Google News 교차검증 ({source_str})"
            poll["_correctionDate"] = datetime.now().strftime("%Y-%m-%d")

        verified_count += 1

        # rate limit 방지
        time.sleep(0.5)

    print(f"\n===== 결과 =====")
    print(f"검증 성공: {verified_count}건")
    print(f"검증 실패/건너뜀: {skipped_count}건")

    if not dry_run and verified_count > 0:
        POLLS_PATH.write_text(
            json.dumps(polls, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(f"polls.json 저장 완료")
    elif dry_run:
        print("(dry-run: 파일 저장 안 함)")


if __name__ == "__main__":
    main()
