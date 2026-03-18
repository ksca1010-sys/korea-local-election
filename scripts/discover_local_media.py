#!/usr/bin/env python3
"""
시군구별 토속 언론사 자동 탐색 스크립트

네이버 검색 API로 "{시군구} 지역신문" 등을 검색하여
지역 언론사 도메인을 자동 추출, local_media_pool.json에 병합.

사용법:
  python scripts/discover_local_media.py
  python scripts/discover_local_media.py --region=seoul
  python scripts/discover_local_media.py --dry-run
"""

import argparse
import json
import os
import re
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path
from urllib.parse import urlparse

BASE_DIR = Path(__file__).resolve().parent.parent
POOL_PATH = BASE_DIR / "data" / "local_media_pool.json"
CANDIDATES_PATH = BASE_DIR / "data" / "candidates" / "mayor_candidates.json"
ENV_FILE = BASE_DIR / ".env"

# 중앙 언론 도메인 (제외 대상)
MAJOR_HOSTS = {
    "naver.com", "daum.net", "kakao.com", "google.com",
    "yna.co.kr", "newsis.com", "news1.kr", "yonhapnewstv.co.kr",
    "kbs.co.kr", "mbc.co.kr", "sbs.co.kr", "jtbc.co.kr",
    "chosun.com", "joongang.co.kr", "donga.com", "hani.co.kr", "khan.co.kr",
    "seoul.co.kr", "mk.co.kr", "hankyung.com", "edaily.co.kr",
    "fnnews.com", "mt.co.kr", "ohmynews.com", "nocutnews.co.kr",
    "pressian.com", "mediatoday.co.kr", "newstapa.org",
    "sisajournal.com", "sisain.co.kr",
    "bbc.com", "cnn.com", "youtube.com", "facebook.com", "twitter.com",
    "tistory.com", "blog.naver.com", "brunch.co.kr",
    "wikipedia.org", "namu.wiki", "namuwiki.kr",
    "dcinside.com", "fmkorea.com", "ruliweb.com",
    "government.kr", "go.kr",  # 정부 사이트
    # 스포츠/연예/IT 전문지
    "sports.hankooki.com", "dailysportshankook.co.kr",
    "imnews.imbc.com", "etnews.com", "zdnet.co.kr",
    "ibabynews.com", "ablenews.co.kr", "newspim.com",
    "newstomato.com", "econovill.com", "ajunews.com",
    "kookbang.dema.mil.kr",  # 국방일보
    "cpbc.co.kr",  # 평화방송 (전국)
    "munhwa.com",  # 문화일보 (전국)
    "safetimes.co.kr",  # 세이프타임즈 (전국)
}

# 포털/블로그 패턴
PORTAL_PATTERNS = [
    "naver.com", "daum.net", "kakao.com", "tistory.com",
    "blog.", "cafe.", "post.", "m.search",
]

REGION_NAMES = {
    "seoul": "서울", "busan": "부산", "daegu": "대구",
    "incheon": "인천", "gwangju": "광주", "daejeon": "대전",
    "ulsan": "울산", "sejong": "세종", "gyeonggi": "경기",
    "gangwon": "강원", "chungbuk": "충북", "chungnam": "충남",
    "jeonbuk": "전북", "jeonnam": "전남", "gyeongbuk": "경북",
    "gyeongnam": "경남", "jeju": "제주",
}


def load_env():
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, val = line.partition("=")
                os.environ.setdefault(key.strip(), val.strip().strip("'\""))


def search_naver(query, display=10):
    """네이버 뉴스 검색 API"""
    import httpx
    cid = os.environ.get("NAVER_CLIENT_ID", "")
    csec = os.environ.get("NAVER_CLIENT_SECRET", "")
    if not cid or not csec:
        return []
    try:
        resp = httpx.get(
            "https://openapi.naver.com/v1/search/news.json",
            headers={"X-Naver-Client-Id": cid, "X-Naver-Client-Secret": csec},
            params={"query": query, "display": display, "sort": "date"},
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json().get("items", [])
    except Exception:
        return []


def extract_host(url):
    """URL에서 호스트 추출 (www. 제거)"""
    try:
        h = urlparse(url).hostname or ""
        return h.replace("www.", "").lower()
    except Exception:
        return ""


def is_local_media(host):
    """중앙 언론/포털이 아닌 지역 언론인지 판별"""
    if not host:
        return False
    for major in MAJOR_HOSTS:
        if host == major or host.endswith(f".{major}"):
            return False
    for pattern in PORTAL_PATTERNS:
        if pattern in host:
            return False
    # 너무 짧은 도메인 제외
    if len(host) < 5:
        return False
    return True


def discover_for_district(region_key, district):
    """한 시군구의 지역 언론사 탐색"""
    short_region = REGION_NAMES.get(region_key, "")
    queries = [
        f'"{district}" 지역신문 인터넷신문',
        f'"{district}" 시정 소식 뉴스',
        f'"{short_region}" "{district}" 선거 후보',
        f'"{district}" 지방선거 출마',
    ]

    host_counter = Counter()
    host_names = {}  # host → 추론 매체명

    for q in queries:
        items = search_naver(q, display=10)
        for item in items:
            for url_field in ["originallink", "link"]:
                url = item.get(url_field, "")
                host = extract_host(url)
                if is_local_media(host):
                    host_counter[host] += 1
                    # 매체명 추론: host에서 추출
                    if host not in host_names:
                        # news.example.com → example
                        parts = host.split(".")
                        name_part = parts[0] if parts[0] not in ("news", "www", "m") else (parts[1] if len(parts) > 1 else parts[0])
                        host_names[host] = host
        time.sleep(0.2)

    # 2회 이상 등장한 호스트만 (신뢰도)
    results = []
    for host, count in host_counter.most_common(10):
        if count >= 1:  # 1회 이상이면 일단 수집
            results.append({
                "host": host,
                "count": count,
                "name": host_names.get(host, host),
            })

    return results


def main():
    parser = argparse.ArgumentParser(description="시군구 토속 언론 자동 탐색")
    parser.add_argument("--region", type=str, help="특정 시도만")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--empty-only", action="store_true", default=True, help="매체 없는 시군구만")
    args = parser.parse_args()

    load_env()

    pool = json.loads(POOL_PATH.read_text(encoding="utf-8")) if POOL_PATH.exists() else {"metro": {}, "municipal": {}}
    candidates = json.loads(CANDIDATES_PATH.read_text(encoding="utf-8")) if CANDIDATES_PATH.exists() else {"candidates": {}}

    regions = [args.region] if args.region else sorted(candidates.get("candidates", {}).keys())

    print("=" * 60)
    print("시군구 토속 언론 자동 탐색 (네이버 검색 API)")
    print("=" * 60)

    total_discovered = 0
    total_districts = 0

    for rk in regions:
        districts = candidates.get("candidates", {}).get(rk, {})
        short = REGION_NAMES.get(rk, rk)
        print(f"\n[{rk}] {short} ({len(districts)}개 시군구)")

        for district in sorted(districts.keys()):
            # 이미 매체가 있으면 스킵
            if args.empty_only:
                existing = pool.get("municipal", {}).get(district, {})
                if isinstance(existing, dict) and existing.get("media"):
                    continue
                if isinstance(existing, list) and existing:
                    continue

            total_districts += 1
            results = discover_for_district(rk, district)
            discovered = len(results)

            if discovered:
                print(f"  {district}: {discovered}개 발견", end="")
                hosts_str = ", ".join(r["host"] for r in results[:3])
                print(f" ({hosts_str})")
            else:
                print(f"  {district}: 0개")

            if args.dry_run:
                continue

            if results:
                if district not in pool.get("municipal", {}):
                    pool["municipal"][district] = {"hosts": [], "names": [], "media": []}
                elif isinstance(pool["municipal"][district], list):
                    old = pool["municipal"][district]
                    pool["municipal"][district] = {
                        "hosts": [],
                        "names": [m.get("name", "") for m in old],
                        "media": old,
                    }

                muni = pool["municipal"][district]
                existing_hosts = set(muni.get("hosts", []))

                for r in results:
                    if r["host"] not in existing_hosts:
                        muni.setdefault("hosts", []).append(r["host"])
                        existing_hosts.add(r["host"])
                        # media 항목 추가
                        if not any(m.get("name") == r["host"] for m in muni.get("media", [])):
                            muni.setdefault("media", []).append({
                                "name": r["host"],
                                "src": "discover",
                                "hitCount": r["count"],
                            })
                        total_discovered += 1

            time.sleep(0.3)

    if not args.dry_run and total_discovered > 0:
        POOL_PATH.write_text(
            json.dumps(pool, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8"
        )

    print("\n" + "=" * 60)
    print(f"완료: {total_districts}개 시군구 탐색, {total_discovered}개 호스트 발견")
    if not args.dry_run:
        print(f"[저장] {POOL_PATH}")
    print("=" * 60)


if __name__ == "__main__":
    main()
