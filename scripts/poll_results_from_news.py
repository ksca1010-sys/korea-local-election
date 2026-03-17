#!/usr/bin/env python3
"""
여론조사 후보별 지지율 — 뉴스 기사 기반 자동 추출

여심위 메타데이터(polls.json)의 각 조사에 대해:
1. 네이버 뉴스 검색으로 해당 조사 관련 기사를 찾음
2. 기사 본문에서 "후보명(정당) N.N%" 패턴을 추출
3. polls.json의 results 필드를 업데이트

사용법:
  python3 scripts/poll_results_from_news.py
  python3 scripts/poll_results_from_news.py --region seoul
  python3 scripts/poll_results_from_news.py --dry-run   # 검색만 하고 저장 안 함
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
from collections import OrderedDict
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import quote, urlencode

import httpx
from bs4 import BeautifulSoup

BASE_DIR = Path(__file__).resolve().parent.parent
POLLS_JSON = BASE_DIR / "data" / "polls" / "polls.json"

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6_0) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/121.0.0.0 Safari/537.36"
)

DELAY = 0.5  # seconds between API requests (API allows faster)
ARTICLE_DELAY = 1.0  # seconds between article fetches

# ── 네이버 API 인증 ──
ENV_FILE = BASE_DIR / ".env"

def _load_env():
    """Load .env file into os.environ."""
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())

_load_env()

NAVER_CLIENT_ID = os.environ.get("NAVER_CLIENT_ID", "")
NAVER_CLIENT_SECRET = os.environ.get("NAVER_CLIENT_SECRET", "")

# ── 정당 정규화 ──
PARTY_NORMALIZE = {
    "더불어민주당": "democratic", "민주당": "democratic", "민주": "democratic",
    "국민의힘": "ppp", "국힘": "ppp",
    "조국혁신당": "reform", "혁신당": "reform",
    "개혁신당": "newReform",
    "새로운미래": "newReform",
    "진보당": "progressive",
    "무소속": "independent",
    "녹색정의당": "justice",
}

# ── 지역명 한글 ──
REGION_NAMES = {
    "seoul": "서울", "busan": "부산", "daegu": "대구", "incheon": "인천",
    "gwangju": "광주", "daejeon": "대전", "ulsan": "울산", "sejong": "세종",
    "gyeonggi": "경기", "gangwon": "강원", "chungbuk": "충북", "chungnam": "충남",
    "jeonbuk": "전북", "jeonnam": "전남", "gyeongbuk": "경북", "gyeongnam": "경남",
    "jeju": "제주",
}

ELECTION_TYPE_NAMES = {
    "mayor": "시도지사",
    "district_mayor": "시장",
    "superintendent": "교육감",
}


def fetch_html(client: httpx.Client, url: str) -> str:
    time.sleep(ARTICLE_DELAY)
    resp = client.get(url, timeout=20, follow_redirects=True)
    resp.raise_for_status()
    return resp.text


# ── 네이버 뉴스 검색 (공식 API) ──

def search_naver_news(client: httpx.Client, query: str, count: int = 5) -> List[Dict[str, str]]:
    """Search Naver News via official Search API.

    Requires NAVER_CLIENT_ID and NAVER_CLIENT_SECRET env vars.
    API docs: https://developers.naver.com/docs/serviceapi/search/news/news.md
    """
    if not NAVER_CLIENT_ID or not NAVER_CLIENT_SECRET:
        print("    ⚠ NAVER_CLIENT_ID / NAVER_CLIENT_SECRET not set")
        return []

    time.sleep(DELAY)
    url = "https://openapi.naver.com/v1/search/news.json"
    headers = {
        "X-Naver-Client-Id": NAVER_CLIENT_ID,
        "X-Naver-Client-Secret": NAVER_CLIENT_SECRET,
    }
    params = {
        "query": query,
        "display": count,
        "sort": "date",  # 최신순
    }

    for attempt in range(3):
        try:
            resp = client.get(url, headers=headers, params=params, timeout=15)
            resp.raise_for_status()
            data = resp.json()
            break
        except Exception as e:
            if attempt < 2:
                time.sleep(5 * (attempt + 1))
                continue
            print(f"    ⚠ Search failed: {e}")
            return []

    articles = []
    for item in data.get("items", []):
        # API returns HTML-tagged title/description — strip tags
        title = re.sub(r"<[^>]+>", "", item.get("title", ""))
        desc = re.sub(r"<[^>]+>", "", item.get("description", ""))
        link = item.get("originallink") or item.get("link", "")

        articles.append({"title": title, "link": link, "desc": desc})

    return articles


def fetch_article_body(client: httpx.Client, url: str) -> str:
    """Fetch article body text. Handles Naver news redirects."""
    try:
        html = fetch_html(client, url)
        soup = BeautifulSoup(html, "html.parser")

        # Naver news article body + other Korean news sites
        selectors = [
            "#newsct_article", "#articeBody", "#articleBodyContents",
            "div.article_body", "div._article_body", "div.news_end",
            "#article-view-content-div", "div.article-body",
            "div.story-news article", "article#article-body",
            "div#contents", "div.view_con", "div.view_txt",
            "div.article_txt", "div.news_body_area", "div.article-view-body",
            "div.article_view", "div#articleBody", "div.viewConts",
            "div#news_body_area", "div.news_view", "div.detail_body",
        ]
        for sel in selectors:
            body = soup.select_one(sel)
            if body:
                return body.get_text(" ", strip=True)

        # Generic: largest text block
        paragraphs = soup.find_all("p")
        text = " ".join(p.get_text(" ", strip=True) for p in paragraphs)
        if len(text) > 200:
            return text[:5000]

        # Last resort: entire body text
        body_tag = soup.find("body")
        if body_tag:
            return body_tag.get_text(" ", strip=True)[:5000]
        return ""
    except Exception:
        return ""


# ── 지지율 파싱 패턴 ──

_KOREAN_PARTICLES = set("은는이가에의도로서와을를며고요")
_COMMON_NON_NAMES = {
    "찬성", "반대", "긍정", "부정", "기타", "없음", "모름", "지지", "응답",
    "격차", "오른", "넘는", "밖에", "대가", "인식", "역량", "정당", "전체",
    "조사", "신뢰", "표본", "경우", "대비", "오차", "중도", "호남", "영남",
    "수도", "매우", "보다", "능력", "각각", "때문", "이번", "결과", "사이",
    "지역", "정책", "경제", "복지", "안보", "외교", "환경", "역에서",
    "이상", "이하", "미만", "동남", "서북", "동북", "서남",  # 방위/수치
    "대표", "위원", "의장", "원장", "장관", "차관", "총리",  # 직함
    "후보", "총장", "교수", "부장", "과장", "사장", "회장",  # 직함2
    "부회장", "교육청", "교육부",  # 기관
    "민의힘", "민주당", "혁신당", "진보당",  # 정당 약칭
    "없다", "인물", "무선", "유선", "우리",  # 일반 단어
    # 여론조사 용어
    "포인트", "양당", "반면", "나타난", "경남", "경북", "전남", "전북",
    "충남", "충북", "강원", "서울", "부산", "대구", "인천", "광주",
    "대전", "울산", "세종", "제주",  # 지역명
    "중도층", "보수층", "진보층", "남성", "여성",  # 인구통계
    "법원장", "차범위", "법원", "범위",  # 통계 용어
    "영동군", "영동", "응답자", "지지자",  # 기타
    "다만", "한편", "특히", "또한", "그러나", "하지만", "그리고",  # 접속사
    "최근", "현재", "향후", "당시", "올해", "지난",  # 시간
    "상승", "하락", "증가", "감소", "변동", "유지",  # 변화
    "운영", "추진", "개헌", "단임제", "단계적",  # 정치 용어
    "도의회", "시의회", "군의회", "구의회",  # 의회
    "국정", "시정", "도정", "군정", "구정",  # 행정
    "연임", "출마", "입후보", "불출마",  # 선거 용어
    # 장소/기관
    "청와대", "국회", "응답률", "표본수", "표본",
    # 직함 (Pattern 8에서 이름으로 오인 방지)
    "구청장", "도지사", "행정관", "이사장", "연구원", "변호사",
    "위원장", "비서관", "도의원", "시의원", "군의원", "구의원",
    "국장", "실장", "처장", "의원", "군수", "시장",
    "다른", "민주", "국힘",  # 정당 약칭/일반어
    # 지역명/통계용어 (뉴스 기사에서 지지율과 함께 등장)
    "경인권", "충청권", "호남권", "영남권", "수도권",
    "하락한", "무당층", "중도층", "보수층", "진보층",
    "천시장", "천시",  # "N천시장" 오파싱 방지
}


def _is_likely_name(text: str) -> bool:
    """Check if a Korean string looks like a person's name (2-3 syllables)."""
    if not text or len(text) < 2 or len(text) > 3:
        return False
    if text[-1] in _KOREAN_PARTICLES:
        return False
    if text in _COMMON_NON_NAMES:
        return False
    if any(text.endswith(s) for s in ("에서", "에선", "으로", "부터", "까지",
                                       "라고", "지층", "지율", "지도", "남권",
                                       "북권", "동권", "서권", "지역", "았으",
                                       "었으", "했으", "도층", "보층", "인트",
                                       "남성", "여성", "원장", "범위")):
        return False
    # Block names ending in common suffixes for regions/statistics
    if re.match(r".*[시도군구]$", text) and text not in ("김시", "박구"):
        return False
    return True


def extract_poll_results(text: str) -> List[Dict[str, Any]]:
    """Extract candidate support data from news article text.

    Common patterns in Korean news:
      "홍길동(더불어민주당) 48.2%"
      "홍길동 더불어민주당 후보 48.2%"
      "홍길동 48.2%, 김철수 39.1%"
      "정원오 55.8% vs 오세훈 32.4%"
      "더불어민주당 45.2% 국민의힘 38.1%"
      "국민의힘 홍길동 후보 48.2%"
    """
    results = []
    seen = set()

    def _add(name, party, pct_str):
        pct = float(pct_str)
        key = f"{name}-{pct}"
        if key not in seen:
            seen.add(key)
            results.append({
                "candidateName": name,
                "party": _norm_party(party) if party else None,
                "partyRaw": party or "",
                "support": pct,
            })

    # Pattern 1: 이름(정당) N.N%
    p1 = re.compile(
        r"([가-힣]{2,4})\s*[\(（]\s*([가-힣]+(?:당|힘|소속)?)\s*[\)）]\s*"
        r"(?:후보\s*)?(\d{1,2}\.?\d?)\s*%"
    )
    for m in p1.finditer(text):
        _add(m.group(1), m.group(2), m.group(3))

    # Pattern 2: 이름 정당 후보 N.N%
    p2 = re.compile(
        r"([가-힣]{2,4})\s+([가-힣]+(?:당|힘))\s*(?:후보|예비후보)?\s*"
        r"(?:가\s*)?\s*(\d{1,2}\.?\d?)\s*%"
    )
    for m in p2.finditer(text):
        name = m.group(1)
        # Allow 2-4 char names but filter out particles and common words
        if name[-1] in _KOREAN_PARTICLES or name in _COMMON_NON_NAMES:
            continue
        if any(name.endswith(s) for s in ("에서", "에선", "으로", "부터", "까지", "라고")):
            continue
        _add(name, m.group(2), m.group(3))

    # Pattern 3: 정당 이름 (후보/시장/구청장 등) N.N%  — "국민의힘 오세훈 현서울시장 23.7%"
    p3 = re.compile(
        r"(더불어민주당|민주당|국민의힘|조국혁신당|개혁신당|진보당|녹색정의당|무소속|새로운미래)"
        r"\s+([가-힣]{2,3})\s+[가-힣]*(?:후보|시장|지사|구청장|군수|의원|교육감)\s*"
        r"(\d{1,2}\.?\d?)\s*%"
    )
    for m in p3.finditer(text):
        _add(m.group(2), m.group(1), m.group(3))

    # Pattern 4: 이름 [현/전] [소속/직함] N.N%
    # "박강수 구청장은 26.3%", "추미애 의원 15.0%"
    # "박종원 현 전남도의원은 23.3%", "이규현 현 전남도의원 12.4%"
    # "이재종 전 청와대 행정관 9.9%", "정철원 군수는 37.1%"
    _TITLE_WORDS = (
        "구청장", "시장", "도지사", "군수", "교육감", "의원", "후보", "지사",
        "장관", "대표", "행정관", "이사장", "소장", "원장", "위원장", "처장",
        "비서관", "도의원", "시의원", "군의원", "구의원", "국장", "실장",
        "연구원", "변호사", "교수",
    )
    title_re = "|".join(_TITLE_WORDS)
    # 4a: "이름 직함 N.N%" — direct title (no gap)
    p4a = re.compile(
        r"([가-힣]{2,3})\s+(?:" + title_re + r")"
        r"[은는이가에]?\s*(\d{1,2}\.\d)\s*%"
    )
    for m in p4a.finditer(text):
        if _is_likely_name(m.group(1)):
            _add(m.group(1), None, m.group(2))

    # 4b: "이름 [현/전] [소속] 직함 N.N%" — with prefix + org
    # "박종원 현 전남도의원은 23.3%", "이재종 전 청와대 행정관 9.9%"
    p4b = re.compile(
        r"([가-힣]{2,3})\s+(?:현|전)\s+[가-힣]+\s*(?:" + title_re + r")"
        r"[은는이가에]?\s*(\d{1,2}\.\d)\s*%"
    )
    for m in p4b.finditer(text):
        if _is_likely_name(m.group(1)):
            _add(m.group(1), None, m.group(2))

    # 4c: "이름 [현/전] [합성어직함] N.N%" — compound title
    # "박종원 현 전남도의원 12.4%"
    p4c = re.compile(
        r"([가-힣]{2,3})\s+(?:현|전)\s+[가-힣]{2,4}(?:" + title_re + r")"
        r"[은는이가에]?\s*(\d{1,2}\.\d)\s*%"
    )
    for m in p4c.finditer(text):
        if _is_likely_name(m.group(1)):
            _add(m.group(1), None, m.group(2))

    # Pattern 7 removed — merged into expanded Pattern 4

    # Pattern 8: "이름 ... N.N%" with comma-separated list
    # Catches: "홍길동 23.3%, 김철수 12.4%, 이영희 9.9%"
    if len(results) < 2:
        p8 = re.compile(
            r"([가-힣]{2,3})\s+(\d{1,2}\.\d)\s*%"
        )
        matches = list(p8.finditer(text))
        # Only trust this pattern if we find 2+ consecutive name-pct pairs
        if len(matches) >= 2:
            # Check if matches appear close together (within 100 chars)
            for j in range(len(matches) - 1):
                gap = matches[j+1].start() - matches[j].end()
                if gap < 100 and _is_likely_name(matches[j].group(1)) and _is_likely_name(matches[j+1].group(1)):
                    _add(matches[j].group(1), None, matches[j].group(2))
                    _add(matches[j+1].group(1), None, matches[j+1].group(2))
                    # Also grab any more consecutive matches
                    for k in range(j+2, len(matches)):
                        g = matches[k].start() - matches[k-1].end()
                        if g < 100 and _is_likely_name(matches[k].group(1)):
                            _add(matches[k].group(1), None, matches[k].group(2))
                        else:
                            break
                    break

    # Pattern 5: "이름 N.N% vs 이름 N.N%" or "이름 N.N%, 이름 N.N%"
    # Only match in explicit comparison patterns
    p5_vs = re.compile(
        r"([가-힣]{2,3})\s+(\d{1,2}\.\d)\s*%\s*(?:vs|VS|[,·]|\s)\s*"
        r"([가-힣]{2,3})\s+(\d{1,2}\.\d)\s*%"
    )
    for m in p5_vs.finditer(text):
        n1, p1, n2, p2 = m.group(1), m.group(2), m.group(3), m.group(4)
        if _is_likely_name(n1):
            _add(n1, None, p1)
        if _is_likely_name(n2):
            _add(n2, None, p2)

    # Pattern 6: 정당명 N.N% (정당지지도, no candidate name)
    if not results:
        p5 = re.compile(
            r"(더불어민주당|민주당|국민의힘|조국혁신당|개혁신당|진보당|녹색정의당|무소속|새로운미래)"
            r"\s*[이가은는의]?\s*(?:[가-힣]{0,5}?\s*)?(\d{1,2}\.?\d?)\s*%"
        )
        for m in p5.finditer(text):
            party, pct = m.groups()
            key = f"{party}-{pct}"
            if key not in seen:
                seen.add(key)
                results.append({
                    "candidateName": None,
                    "party": _norm_party(party),
                    "partyRaw": party,
                    "support": float(pct),
                })

    # Filter: only keep reasonable percentages (1~80%)
    results = [r for r in results if 1.0 <= r["support"] <= 80.0]

    # Deduplicate by candidate name — keep first occurrence (highest from sorted input)
    deduped = []
    seen_names = set()
    for r in results:
        name = r.get("candidateName")
        if name and name in seen_names:
            continue
        if name:
            seen_names.add(name)
        deduped.append(r)
    results = deduped

    # Sort by support descending
    results.sort(key=lambda x: x["support"], reverse=True)

    return results


def _norm_party(text: str) -> str:
    text = text.strip()
    for name, key in PARTY_NORMALIZE.items():
        if name in text:
            return key
    return text


# ── 메인 로직 ──

def build_search_query(poll: Dict[str, Any]) -> str:
    """Build a targeted news search query for a specific poll."""
    title = poll.get("title", "")
    election_type = poll.get("electionType")
    region_key = poll.get("regionKey")
    municipality = poll.get("municipality")

    # Special case: 전국 정당지지도 (선거종류가 없는 순수 정당지지도만)
    if "정당지지도" in title and not election_type:
        org = poll.get("pollOrg", "")
        org_clean = re.sub(r"[\(（]주[\)）]|주식회사", "", org).strip()
        return f'{org_clean} 정당지지도 더불어민주당 국민의힘'

    parts = []

    # Poll organization
    org = poll.get("pollOrg", "")
    if org:
        org_clean = re.sub(r"[\(（]주[\)）]|주식회사", "", org).strip()
        if org_clean:
            parts.append(f'"{org_clean}"')

    # Region/municipality
    if municipality:
        parts.append(f'"{municipality}"')
    elif region_key and region_key in REGION_NAMES:
        region_name = REGION_NAMES[region_key]
        parts.append(f'"{region_name}"')

    # Election type keyword
    if election_type == "mayor":
        if municipality:
            parts.append("시장" if "시" in municipality else "군수" if "군" in municipality else "도지사")
        else:
            parts.append("도지사" if region_key not in ("seoul", "busan", "daegu", "incheon", "gwangju", "daejeon", "ulsan") else "시장")
    elif election_type == "district_mayor":
        if municipality:
            parts.append("시장" if "시" in municipality else "군수" if "군" in municipality else "구청장")
        else:
            parts.append("여론조사")
    elif election_type == "superintendent":
        parts.append("교육감")

    # Add "여론조사" if not already present
    if not any("여론" in p for p in parts):
        parts.append("여론조사")

    return " ".join(parts)


def build_fallback_queries(poll: Dict[str, Any]) -> List[str]:
    """Build broader fallback queries (multiple attempts)."""
    region_key = poll.get("regionKey")
    municipality = poll.get("municipality")
    election_type = poll.get("electionType")
    title = poll.get("title", "")
    queries = []

    base = municipality or (REGION_NAMES.get(region_key, "") if region_key else "")
    if not base:
        # For national 정당지지도, try different org name variations
        if "정당지지도" in title:
            org = poll.get("pollOrg", "")
            org_clean = re.sub(r"[\(（]주[\)）]|주식회사", "", org).strip()
            queries.append(f'{org_clean} 정당 지지도 여론조사')
            queries.append(f'정당지지도 여론조사 더불어민주당 국민의힘 {org_clean}')
        if "교육감" in title:
            org = poll.get("pollOrg", "")
            org_clean = re.sub(r"[\(（]주[\)）]|주식회사", "", org).strip()
            queries.append(f'{org_clean} 교육감 여론조사 2026 지지율')
            queries.append(f'전국 교육감 선거 여론조사 후보')
        return queries

    # Determine position keyword
    pos = "여론조사"
    if election_type == "mayor":
        if municipality:
            pos = "시장" if "시" in municipality else "군수" if "군" in municipality else "도지사"
        elif region_key not in ("seoul", "busan", "daegu", "incheon", "gwangju", "daejeon", "ulsan"):
            pos = "도지사"
        else:
            pos = "시장"
    elif election_type == "district_mayor":
        if municipality:
            pos = "시장" if "시" in municipality else "군수" if "군" in municipality else "구청장"
        else:
            pos = "구청장"
    elif election_type == "superintendent":
        pos = "교육감"

    # Fallback 1: region + position + org (no quotes)
    org = poll.get("pollOrg", "")
    org_clean = re.sub(r"[\(（]주[\)）]|주식회사", "", org).strip()
    if org_clean:
        queries.append(f'"{base}" {pos} {org_clean} 여론조사 지지율')

    # Fallback 2: region + position + 지지율 (no org)
    queries.append(f'"{base}" {pos} 여론조사 지지율')

    # Fallback 3: region + position merged (e.g. "가평군수", "서산시장")
    if municipality:
        merged = municipality + ("장" if municipality.endswith("시") else "수" if municipality.endswith("군") else "장")
        queries.append(f'{merged} 여론조사 후보 지지율 2026')
        queries.append(f'{merged} 후보 경선 여론조사')
    elif base:
        queries.append(f'{base} {pos} 후보 지지율')

    # Fallback 4: election type specific
    if election_type == "superintendent":
        queries.append(f'{base} 교육감 선거 후보 적합도')

    return queries


def _search_and_extract(client: httpx.Client, query: str, min_results: int = 2) -> List[Dict[str, Any]]:
    """Search news and try to extract poll results from articles.

    Tries all articles and keeps the best result (most candidates).
    """
    articles = search_naver_news(client, query, count=5)
    if not articles:
        return []

    best_results = []
    best_source = ""

    for i, article in enumerate(articles):
        # First check snippet/description
        combined = article["title"] + " " + article.get("desc", "")
        results = extract_poll_results(combined)

        if len(results) > len(best_results):
            best_results = results
            best_source = f"snippet (article {i+1})"

        # Fetch full article body if snippet wasn't enough
        if article.get("link") and len(best_results) < 4:
            body = fetch_article_body(client, article["link"])
            if body:
                results = extract_poll_results(body)
                if len(results) > len(best_results):
                    best_results = results
                    best_source = f"article {i+1}"

        # Good enough — stop early
        if len(best_results) >= 3:
            break

    if len(best_results) >= min_results:
        print(f"    ✅ Found {len(best_results)} candidates from {best_source}")
        return best_results

    return []


def process_poll(client: httpx.Client, poll: Dict[str, Any], dry_run: bool = False) -> Optional[List[Dict]]:
    """Search news and extract results for a single poll."""
    query = build_search_query(poll)
    title = poll.get("title", "")[:50]
    ntt_id = poll.get("nttId", "?")

    print(f"  [{ntt_id}] {title}")
    print(f"    Query: {query}")

    best_results = _search_and_extract(client, query)

    # Fallback: broader queries
    if not best_results:
        for fallback in build_fallback_queries(poll):
            if fallback != query:
                print(f"    → Fallback: {fallback}")
                best_results = _search_and_extract(client, fallback)
                if best_results:
                    break

    if not best_results:
        print(f"    ❌ No candidate data extracted")
        return None

    # Show what we found
    for r in best_results[:5]:
        name = r.get("candidateName") or r.get("partyRaw", "?")
        print(f"      {name} ({r['partyRaw']}): {r['support']}%")

    return best_results


def main():
    import argparse
    parser = argparse.ArgumentParser(description="뉴스 기사에서 여론조사 지지율 추출")
    parser.add_argument("--region", help="특정 지역만 처리 (e.g. seoul, busan)")
    parser.add_argument("--dry-run", action="store_true", help="검색만 하고 저장 안 함")
    parser.add_argument("--limit", type=int, default=0, help="최대 처리 건수 (0=전체)")
    parser.add_argument("--skip-existing", action="store_true", help="이미 results가 있는 건 스킵")
    args = parser.parse_args()

    if not NAVER_CLIENT_ID or not NAVER_CLIENT_SECRET:
        print("❌ NAVER_CLIENT_ID / NAVER_CLIENT_SECRET not set.")
        print("   Set in .env file or environment variables.")
        sys.exit(1)

    if not POLLS_JSON.exists():
        print(f"❌ {POLLS_JSON} not found. Run nesdc_poll_pipeline.py first.")
        sys.exit(1)

    data = json.loads(POLLS_JSON.read_text("utf-8"))
    client = httpx.Client(headers={"User-Agent": USER_AGENT})

    updated_count = 0
    error_count = 0
    skip_count = 0
    total_processed = 0

    # Collect all polls to process
    all_polls = []

    # National polls
    if not args.region:
        for poll in data.get("national", []):
            all_polls.append(("national", poll))

    # Regional polls
    for region_key, polls in data.get("regions", {}).items():
        if args.region and region_key != args.region:
            continue
        for poll in polls:
            all_polls.append((region_key, poll))

    print(f"📊 Processing {len(all_polls)} polls...")
    print()

    try:
        for category, poll in all_polls:
            # Skip if already has results
            if args.skip_existing and poll.get("results"):
                skip_count += 1
                continue

            # Limit
            if args.limit and total_processed >= args.limit:
                break

            total_processed += 1
            region_label = REGION_NAMES.get(category, category)
            print(f"\n[{region_label}] ({total_processed}/{len(all_polls)})")

            try:
                results = process_poll(client, poll, dry_run=args.dry_run)
                if results and not args.dry_run:
                    poll["results"] = results
                    updated_count += 1
                    # 중간 저장 (50건마다)
                    if updated_count % 50 == 0:
                        data["generated"] = time.strftime("%Y-%m-%dT%H:%M:%S")
                        POLLS_JSON.write_text(json.dumps(data, ensure_ascii=False, indent=2), "utf-8")
                        print(f"\n💾 중간 저장 ({updated_count}건)")
            except Exception as e:
                print(f"    ⚠ Error: {e}")
                error_count += 1

    except KeyboardInterrupt:
        print("\n\n⚠ Interrupted by user")
    finally:
        client.close()

    # Save updated data
    if not args.dry_run and updated_count > 0:
        data["generated"] = time.strftime("%Y-%m-%dT%H:%M:%S")
        POLLS_JSON.write_text(json.dumps(data, ensure_ascii=False, indent=2), "utf-8")
        print(f"\n💾 Saved to {POLLS_JSON}")

    print(f"\n✅ Done: {updated_count} updated, {error_count} errors, {skip_count} skipped")
    print(f"   Total processed: {total_processed}/{len(all_polls)}")


if __name__ == "__main__":
    main()
