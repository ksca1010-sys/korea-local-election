#!/usr/bin/env python3
"""
시군구 토속 언론 심층 탐색 스크립트

매체 1개 이하인 시군구를 대상으로:
1. 네이버 뉴스 검색 (시군구명 + 신문/뉴스/인터넷신문/미디어)
2. 네이버 뉴스에서 해당 시군구명 검색 시 매체명 수집
3. 문체부 정기간행물 등록관리시스템 검색
4. 최소 3개 미달 시 → 광역 매체 지역판으로 대체

사용법:
  python scripts/deep_search_local_media.py
  python scripts/deep_search_local_media.py --region=gyeonggi
  python scripts/deep_search_local_media.py --min-media=3
"""

import argparse
import json
import os
import re
import sys
import time
from collections import Counter
from pathlib import Path
from urllib.parse import urlparse

import httpx

BASE_DIR = Path(__file__).resolve().parent.parent
POOL_PATH = BASE_DIR / "data" / "local_media_pool.json"
CANDIDATES_PATH = BASE_DIR / "data" / "candidates" / "mayor_candidates.json"
ENV_FILE = BASE_DIR / ".env"

MCST_URL = "https://pds.mcst.go.kr/main/pdssearch/selectPdsSearchList.do"

REGION_NAMES = {
    "seoul": "서울특별시", "busan": "부산광역시", "daegu": "대구광역시",
    "incheon": "인천광역시", "gwangju": "광주광역시", "daejeon": "대전광역시",
    "ulsan": "울산광역시", "sejong": "세종특별자치시", "gyeonggi": "경기도",
    "gangwon": "강원특별자치도", "chungbuk": "충청북도", "chungnam": "충청남도",
    "jeonbuk": "전북특별자치도", "jeonnam": "전라남도", "gyeongbuk": "경상북도",
    "gyeongnam": "경상남도", "jeju": "제주특별자치도",
}
SHORT_REGION = {
    "seoul": "서울", "busan": "부산", "daegu": "대구", "incheon": "인천",
    "gwangju": "광주", "daejeon": "대전", "ulsan": "울산", "sejong": "세종",
    "gyeonggi": "경기", "gangwon": "강원", "chungbuk": "충북", "chungnam": "충남",
    "jeonbuk": "전북", "jeonnam": "전남", "gyeongbuk": "경북",
    "gyeongnam": "경남", "jeju": "제주",
}

# 전국지/포털 블랙리스트 (토속 언론에서 제외)
BLACKLIST = {
    "naver.com", "daum.net", "kakao.com", "google.com",
    "yna.co.kr", "newsis.com", "news1.kr", "yonhapnewstv.co.kr",
    "kbs.co.kr", "mbc.co.kr", "sbs.co.kr", "jtbc.co.kr",
    "chosun.com", "joongang.co.kr", "donga.com", "hani.co.kr", "khan.co.kr",
    "seoul.co.kr", "mk.co.kr", "hankyung.com", "edaily.co.kr",
    "fnnews.com", "mt.co.kr", "ohmynews.com", "nocutnews.co.kr",
    "pressian.com", "mediatoday.co.kr", "newstapa.org",
    "sisajournal.com", "sisain.co.kr", "munhwa.com",
    "youtube.com", "facebook.com", "twitter.com", "instagram.com",
    "tistory.com", "blog.naver.com", "brunch.co.kr",
    "wikipedia.org", "namu.wiki",
    # 자동 발견된 전국지
    "ekn.kr", "weeklytoday.com", "gukjenews.com", "apnews.kr",
    "breaknews.com", "kukinews.com", "polinews.co.kr",
    "news.lghellovision.net", "news.skbroadband.com", "news.bbsi.co.kr",
    "radio.ytn.co.kr", "ytn.co.kr",
    # 비언론
    "kookbang.dema.mil.kr", "cpbc.co.kr", "safetimes.co.kr",
    "sports.hankooki.com", "dailysportshankook.co.kr",
    "etnews.com", "zdnet.co.kr", "ibabynews.com", "ablenews.co.kr",
    "newspim.com", "newstomato.com", "econovill.com", "ajunews.com",
    "dailypharm.com", "yakup.com",
}
PORTAL_PATTERNS = ["naver.com", "daum.net", "kakao.com", "tistory.com", "blog.", "cafe.", "m.search"]


def load_env():
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, val = line.partition("=")
                os.environ.setdefault(key.strip(), val.strip().strip("'\""))


def extract_host(url):
    try:
        h = urlparse(url).hostname or ""
        return h.replace("www.", "").lower()
    except Exception:
        return ""


def is_valid_local(host):
    if not host or len(host) < 5:
        return False
    for b in BLACKLIST:
        if host == b or host.endswith(f".{b}"):
            return False
    for p in PORTAL_PATTERNS:
        if p in host:
            return False
    return True


def search_naver_news(query, display=10):
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


def search_naver_web(query, display=10):
    """네이버 웹 검색 (뉴스가 아닌 일반 웹)"""
    cid = os.environ.get("NAVER_CLIENT_ID", "")
    csec = os.environ.get("NAVER_CLIENT_SECRET", "")
    if not cid or not csec:
        return []
    try:
        resp = httpx.get(
            "https://openapi.naver.com/v1/search/webkr.json",
            headers={"X-Naver-Client-Id": cid, "X-Naver-Client-Secret": csec},
            params={"query": query, "display": display},
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json().get("items", [])
    except Exception:
        return []


def search_mcst(district, sido_code=""):
    """문체부 정기간행물 등록관리시스템 검색"""
    try:
        resp = httpx.post(
            MCST_URL,
            data={"pageIndex": "1", "searchCnd": "1", "searchWrd": district, "sido1": sido_code, "sido2": ""},
            headers={"User-Agent": "Mozilla/5.0"},
            timeout=15,
        )
        # 제호 추출
        names = []
        for match in re.finditer(r'<div class="mtit">\s*<span>인터넷신문\s*</span>\s*<span>([^<]+)</span>', resp.text):
            name = match.group(1).strip()
            if name and len(name) >= 2:
                names.append(name)
        return names
    except Exception:
        return []


# 시도 코드 (MCST)
SIDO_CODES = {
    "seoul": "01", "busan": "02", "daegu": "03", "incheon": "04",
    "gwangju": "05", "daejeon": "06", "ulsan": "07", "gyeonggi": "08",
    "gangwon": "09", "chungbuk": "10", "chungnam": "11", "jeonbuk": "12",
    "jeonnam": "13", "gyeongbuk": "14", "gyeongnam": "15", "jeju": "16",
    "sejong": "17",
}


def deep_search_district(region_key, district):
    """한 시군구에 대해 심층 탐색"""
    short = SHORT_REGION.get(region_key, "")
    host_counter = Counter()

    # 1단계: 네이버 뉴스 — 다양한 키워드로 검색
    keywords = [
        f'"{district}" 신문',
        f'"{district}" 뉴스',
        f'"{district}" 인터넷신문',
        f'"{district}" 미디어',
        f'"{short}" "{district}" 선거',
        f'"{district}" 시정 소식',
    ]
    for kw in keywords:
        for item in search_naver_news(kw, display=10):
            for field in ["originallink", "link"]:
                host = extract_host(item.get(field, ""))
                if is_valid_local(host):
                    host_counter[host] += 1
        time.sleep(0.15)

    # 2단계: 네이버 웹 검색 — "시군구 인터넷신문" 직접 검색
    web_queries = [
        f'{district} 인터넷신문',
        f'{district} 지역신문 뉴스',
    ]
    for kw in web_queries:
        for item in search_naver_web(kw, display=5):
            host = extract_host(item.get("link", ""))
            if is_valid_local(host):
                host_counter[host] += 2  # 웹 검색에서 직접 나오면 가중치
        time.sleep(0.15)

    # 3단계: 문체부 정기간행물 검색
    sido_code = SIDO_CODES.get(region_key, "")
    mcst_names = search_mcst(district, sido_code)
    time.sleep(0.3)

    return host_counter, mcst_names


def main():
    parser = argparse.ArgumentParser(description="시군구 토속 언론 심층 탐색")
    parser.add_argument("--region", type=str)
    parser.add_argument("--min-media", type=int, default=3, help="최소 목표 매체 수")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    load_env()

    pool = json.loads(POOL_PATH.read_text(encoding="utf-8"))
    candidates = json.loads(CANDIDATES_PATH.read_text(encoding="utf-8"))
    muni = pool.setdefault("municipal", {})

    # 시군구→시도 매핑
    dist_to_region = {}
    for rk, districts in candidates.get("candidates", {}).items():
        for d in districts:
            dist_to_region[d] = rk

    # 대상: 매체 1개 이하
    targets = []
    for rk, districts in sorted(candidates.get("candidates", {}).items()):
        if args.region and rk != args.region:
            continue
        for d in sorted(districts.keys()):
            v = muni.get(d, {})
            count = len(v.get("hosts", [])) if isinstance(v, dict) else 0
            if count <= 1:
                targets.append((rk, d, count))

    print("=" * 60)
    print(f"시군구 토속 언론 심층 탐색 (대상: {len(targets)}개 시군구)")
    print(f"목표: 시군구당 최소 {args.min_media}개 매체")
    print("=" * 60)

    total_added = 0
    fallback_count = 0

    for i, (rk, district, current_count) in enumerate(targets):
        sido = REGION_NAMES.get(rk, rk)[:6]
        print(f"\n[{i+1}/{len(targets)}] {sido} {district} (현재 {current_count}개)...", end="", flush=True)

        host_counter, mcst_names = deep_search_district(rk, district)

        if args.dry_run:
            found = len([h for h, c in host_counter.items() if c >= 1])
            print(f" 발견 {found}개 + MCST {len(mcst_names)}개")
            continue

        # 시군구 데이터 초기화
        if district not in muni:
            muni[district] = {"hosts": [], "names": [], "media": []}
        elif isinstance(muni[district], list):
            old = muni[district]
            muni[district] = {"hosts": [], "names": [m.get("name", "") for m in old], "media": old}

        entry = muni[district]
        existing_hosts = set(entry.get("hosts", []))
        added = 0

        # 네이버 검색 결과 반영 (1회 이상 등장)
        for host, count in host_counter.most_common(15):
            if host not in existing_hosts:
                entry.setdefault("hosts", []).append(host)
                existing_hosts.add(host)
                if not any(m.get("name") == host for m in entry.get("media", [])):
                    entry.setdefault("media", []).append({
                        "name": host, "src": "deep_search", "hitCount": count,
                    })
                added += 1

        # MCST 결과 반영
        existing_names = {m.get("name") for m in entry.get("media", [])}
        for name in mcst_names:
            if name not in existing_names:
                entry.setdefault("media", []).append({"name": name, "src": "mcst"})
                entry.setdefault("names", []).append(name)
                existing_names.add(name)
                added += 1

        total_added += added
        final_count = len(entry.get("hosts", []))

        # 최소 목표 미달 → 광역 매체 지역판으로 대체
        if final_count < args.min_media:
            metro = pool.get("metro", {}).get(REGION_NAMES.get(rk, ""), {})
            metro_hosts = metro.get("hosts", [])
            metro_media = metro.get("media", [])

            for h in metro_hosts:
                if h not in existing_hosts and final_count < args.min_media:
                    entry["hosts"].append(h)
                    existing_hosts.add(h)
                    entry.setdefault("media", []).append({
                        "name": h, "src": "metro_fallback",
                    })
                    final_count += 1
                    added += 1
                    fallback_count += 1

        status = "✓" if final_count >= args.min_media else f"△{final_count}"
        print(f" +{added}개 → {final_count}개 {status}")

    # 저장
    if not args.dry_run and total_added > 0:
        POOL_PATH.write_text(
            json.dumps(pool, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8"
        )

    print("\n" + "=" * 60)
    print(f"완료: {len(targets)}개 시군구 탐색")
    print(f"  추가: {total_added}개 매체")
    print(f"  광역 fallback: {fallback_count}개")
    if not args.dry_run:
        print(f"[저장] {POOL_PATH}")
    print("=" * 60)


if __name__ == "__main__":
    main()
