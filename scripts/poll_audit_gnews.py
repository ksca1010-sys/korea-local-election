#!/usr/bin/env python3
"""
여론조사 데이터 검증: polls.json vs Google News 기사 비교

목적: PDF 파싱 오류로 인한 수치 불일치 감지
원칙:
  - 자동 교정 절대 안 함 — 불일치 목록만 출력
  - 사람이 확인 후 수동 교정
  - 출처 URL 포함하여 검증 가능하게

사용법:
  python scripts/poll_audit_gnews.py                    # 전체 검증
  python scripts/poll_audit_gnews.py --region jeonnam   # 특정 지역만
  python scripts/poll_audit_gnews.py --recent 30        # 최근 30일만
"""

import json
import re
import sys
import ssl
import time
import urllib.request
import urllib.parse
from datetime import datetime, timedelta
from pathlib import Path
from collections import defaultdict

BASE = Path(__file__).resolve().parent.parent
POLLS_PATH = BASE / "data" / "polls" / "polls.json"
GNEWS_PROXY = "https://election-news-proxy.ksca1010.workers.dev/api/gnews"

REGION_NAMES = {
    "seoul": "서울", "busan": "부산", "daegu": "대구", "incheon": "인천",
    "gwangju": "광주", "daejeon": "대전", "ulsan": "울산", "sejong": "세종",
    "gyeonggi": "경기", "gangwon": "강원", "chungbuk": "충북", "chungnam": "충남",
    "jeonbuk": "전북", "jeonnam": "전남", "gyeongbuk": "경북", "gyeongnam": "경남",
    "jeju": "제주",
}

# 후보이름 + 수치 추출: "우승희 47.2%" 또는 "우승희(더불어민주당) 47.2%"
RESULT_PATTERN = re.compile(
    r'([가-힣]{2,4})\s*(?:\([가-힣]+\))?\s*(\d{1,2}(?:\.\d{1,2})?)\s*%'
)

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE


def search_gnews(query):
    url = f"{GNEWS_PROXY}?query={urllib.parse.quote(query)}"
    try:
        req = urllib.request.Request(url, headers={
            "Accept": "application/json",
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
        })
        with urllib.request.urlopen(req, timeout=15, context=ssl_ctx) as resp:
            data = json.loads(resp.read())
            return data.get("items", [])
    except Exception as e:
        return []


def extract_numbers_from_articles(articles, candidate_names):
    """기사에서 polls.json에 있는 후보명과 매칭되는 수치 추출"""
    news_numbers = defaultdict(list)  # candidateName → [(support, source_url)]

    for article in articles:
        text = f"{article.get('title', '')} {article.get('description', '')}"
        source = article.get("link", "")

        matches = RESULT_PATTERN.findall(text)
        for name, support_str in matches:
            if name in candidate_names:
                support = float(support_str)
                if 1 <= support <= 90:
                    news_numbers[name].append((support, source))

    return news_numbers


def build_query(poll, region_key):
    """검증용 쿼리: 조사기관 + 지역 + 후보이름"""
    org = (poll.get("pollOrg") or "").replace("(주)", "").strip()
    municipality = poll.get("municipality") or ""
    region_name = REGION_NAMES.get(region_key, "")
    location = municipality or region_name

    # 후보 이름 상위 2명
    top_names = [r["candidateName"] for r in (poll.get("results") or [])
                 if r.get("candidateName") and r.get("support", 0) > 0][:2]

    parts = [location]
    if top_names:
        parts.extend(top_names[:2])
    parts.append("여론조사")

    return " ".join(parts)


def compare_poll_with_news(poll, news_numbers):
    """polls.json 수치 vs 뉴스 수치 비교 → 불일치 목록"""
    mismatches = []

    for r in poll.get("results", []):
        name = r.get("candidateName")
        poll_support = r.get("support", 0)
        if not name or poll_support <= 0:
            continue

        if name not in news_numbers:
            continue

        # 뉴스에서 가장 많이 나온 수치
        news_values = [v for v, _ in news_numbers[name]]
        if not news_values:
            continue

        # 가장 빈도 높은 수치
        from collections import Counter
        most_common_value, count = Counter(news_values).most_common(1)[0]

        # 0.5%p 이상 차이 → 불일치
        diff = abs(poll_support - most_common_value)
        if diff >= 0.5:
            sources = [src for val, src in news_numbers[name] if val == most_common_value]
            mismatches.append({
                "candidate": name,
                "polls_json": poll_support,
                "news": most_common_value,
                "diff": diff,
                "news_count": count,
                "source": sources[0] if sources else ""
            })

    return mismatches


def main():
    import argparse
    parser = argparse.ArgumentParser(description="여론조사 데이터 검증")
    parser.add_argument("--region", help="특정 지역만 검증 (예: jeonnam)")
    parser.add_argument("--recent", type=int, default=0, help="최근 N일 여론조사만")
    parser.add_argument("--limit", type=int, default=0, help="최대 검증 건수")
    args = parser.parse_args()

    polls_data = json.loads(POLLS_PATH.read_text(encoding="utf-8"))

    cutoff_date = None
    if args.recent > 0:
        cutoff_date = (datetime.now() - timedelta(days=args.recent)).strftime("%Y-%m-%d")

    all_mismatches = []
    checked = 0
    skipped = 0

    regions = {args.region: polls_data["regions"][args.region]} if args.region else polls_data.get("regions", {})

    for region_key, poll_list in regions.items():
        for poll in poll_list:
            results = poll.get("results", [])
            if len(results) < 2:
                continue

            # 날짜 필터
            if cutoff_date:
                survey_end = (poll.get("surveyDate") or {}).get("end", "")
                if survey_end and survey_end < cutoff_date:
                    continue

            if args.limit and checked >= args.limit:
                break

            ntt_id = poll.get("nttId", "?")
            org = poll.get("pollOrg", "?")
            candidate_names = {r["candidateName"] for r in results if r.get("candidateName")}

            query = build_query(poll, region_key)
            articles = search_gnews(query)

            if not articles:
                skipped += 1
                continue

            news_numbers = extract_numbers_from_articles(articles, candidate_names)

            if not news_numbers:
                skipped += 1
                continue

            mismatches = compare_poll_with_news(poll, news_numbers)
            checked += 1

            if mismatches:
                municipality = poll.get("municipality") or REGION_NAMES.get(region_key, region_key)
                print(f"\n⚠️  [{ntt_id}] {org} — {municipality}")
                for m in mismatches:
                    print(f"   {m['candidate']}: polls.json={m['polls_json']}% → 뉴스={m['news']}% (차이 {m['diff']:.1f}%p, 뉴스 {m['news_count']}건)")
                    print(f"   출처: {m['source']}")
                all_mismatches.append({
                    "nttId": ntt_id,
                    "pollOrg": org,
                    "region": region_key,
                    "municipality": municipality,
                    "mismatches": mismatches
                })

            # rate limit
            time.sleep(0.5)

        if args.limit and checked >= args.limit:
            break

    print(f"\n{'='*60}")
    print(f"검증 완료: {checked}건 확인, {skipped}건 건너뜀")
    print(f"불일치 발견: {len(all_mismatches)}건")

    if all_mismatches:
        # JSON 리포트 저장
        report_path = BASE / "data" / "polls" / "audit_report.json"
        report = {
            "generated": datetime.now().isoformat(),
            "checked": checked,
            "mismatches": all_mismatches
        }
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"리포트 저장: {report_path}")


if __name__ == "__main__":
    main()
