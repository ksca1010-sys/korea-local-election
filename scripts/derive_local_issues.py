#!/usr/bin/env python3
from __future__ import annotations

import json
import os
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen

KST = timezone(timedelta(hours=9))

REGIONS = {
    "seoul": "서울특별시",
    "busan": "부산광역시",
    "daegu": "대구광역시",
    "incheon": "인천광역시",
    "gwangju": "광주광역시",
    "daejeon": "대전광역시",
    "ulsan": "울산광역시",
    "sejong": "세종특별자치시",
    "gyeonggi": "경기도",
    "gangwon": "강원특별자치도",
    "chungbuk": "충청북도",
    "chungnam": "충청남도",
    "jeonbuk": "전북특별자치도",
    "jeonnam": "전라남도",
    "gyeongbuk": "경상북도",
    "gyeongnam": "경상남도",
    "jeju": "제주특별자치도",
}

CATEGORY_KEYWORDS = {
    "교통 인프라": ["gtx", "지하철", "철도", "트램", "버스", "도로", "교통", "환승", "공항", "신공항", "항만"],
    "주거·도시재생": ["주거", "주택", "전세", "월세", "재개발", "재건축", "도시재생", "신도시", "공공임대"],
    "경제·일자리": ["일자리", "고용", "기업", "산업", "창업", "소상공인", "반도체", "산단", "투자", "수출"],
    "복지·의료": ["복지", "돌봄", "보육", "의료", "병원", "건강", "요양", "청년지원", "기초연금"],
    "교육": ["교육", "학교", "학군", "교실", "돌봄교실", "대학", "입시", "교육감"],
    "환경·안전": ["환경", "미세먼지", "탄소", "기후", "재난", "안전", "홍수", "산불", "원전", "오염"],
    "관광·문화": ["관광", "축제", "문화", "유산", "컨벤션", "공연", "박물관", "스포츠", "문화도시"],
}

DETAILED_TOPICS = [
    {"label": "GTX·광역철도 확충", "category": "교통 인프라", "keywords": ["gtx", "광역철도", "수도권광역급행", "신분당선", "경강선", "경전철"]},
    {"label": "버스 노선·환승 체계 개선", "category": "교통 인프라", "keywords": ["버스", "환승", "버스노선", "광역버스", "준공영제", "배차"]},
    {"label": "도로 정체·혼잡구간 해소", "category": "교통 인프라", "keywords": ["정체", "혼잡", "우회도로", "도로 확장", "ic", "jc", "교차로"]},
    {"label": "공항·항만 연계 교통망", "category": "교통 인프라", "keywords": ["공항", "신공항", "항만", "물류", "배후 교통"]},
    {"label": "전세 안정·임대주택 공급", "category": "주거·도시재생", "keywords": ["전세", "월세", "임대주택", "공공임대", "주거비", "청년주택"]},
    {"label": "재개발·재건축 속도 조정", "category": "주거·도시재생", "keywords": ["재개발", "재건축", "정비사업", "용적률", "안전진단"]},
    {"label": "원도심 재생·상권 회복", "category": "주거·도시재생", "keywords": ["원도심", "도시재생", "상권", "공실", "골목상권"]},
    {"label": "반도체·첨단산업 클러스터", "category": "경제·일자리", "keywords": ["반도체", "테크노밸리", "첨단산업", "국가산단", "클러스터"]},
    {"label": "중소기업·소상공인 지원", "category": "경제·일자리", "keywords": ["소상공인", "중소기업", "자영업", "상생", "폐업", "경영안정"]},
    {"label": "청년 일자리·창업 생태계", "category": "경제·일자리", "keywords": ["청년 일자리", "청년고용", "스타트업", "창업", "취업"]},
    {"label": "공공의료 인프라 확충", "category": "복지·의료", "keywords": ["공공의료", "공공병원", "의료원", "응급의료", "필수의료"]},
    {"label": "돌봄·보육 서비스 확대", "category": "복지·의료", "keywords": ["돌봄", "보육", "어린이집", "아이돌봄", "방과후"]},
    {"label": "교육격차·입시 부담 완화", "category": "교육", "keywords": ["교육격차", "입시", "사교육", "학군", "학력"]},
    {"label": "학교 안전·시설 개선", "category": "교육", "keywords": ["학교 안전", "노후학교", "학교시설", "급식", "통학"]},
    {"label": "미세먼지·대기질 대응", "category": "환경·안전", "keywords": ["미세먼지", "대기질", "배출", "대기오염"]},
    {"label": "기후재난·재해 예방", "category": "환경·안전", "keywords": ["홍수", "침수", "산불", "폭우", "재난", "안전대책"]},
    {"label": "관광 콘텐츠·축제 활성화", "category": "관광·문화", "keywords": ["축제", "관광", "야간관광", "체류형 관광", "랜드마크"]},
    {"label": "생활문화·체육 인프라", "category": "관광·문화", "keywords": ["문화시설", "체육관", "공연장", "도서관", "박물관"]},
]

REGION_TOPIC_HINTS = {
    "gyeonggi": [
        {"topic": "GTX·광역철도 확충", "keywords": ["gtx-a", "gtx-b", "gtx-c", "gtx d", "gtx", "광역철도"]},
        {"topic": "전세 안정·임대주택 공급", "keywords": ["전세", "임대주택", "신도시", "1기 신도시", "주거비"]},
        {"topic": "반도체·첨단산업 클러스터", "keywords": ["용인", "평택", "반도체", "테크노밸리", "국가산단"]},
        {"topic": "도로 정체·혼잡구간 해소", "keywords": ["정체", "출퇴근", "상습정체", "교통혼잡"]},
    ],
}

MAJOR_HOSTS = {
    "yna.co.kr", "newsis.com", "news1.kr", "kbs.co.kr", "mbc.co.kr", "sbs.co.kr",
    "jtbc.co.kr", "chosun.com", "joongang.co.kr", "donga.com", "hani.co.kr",
    "khan.co.kr", "seoul.co.kr", "mk.co.kr", "hankyung.com", "edaily.co.kr",
    "fnnews.com", "mt.co.kr", "nocutnews.co.kr",
}


def parse_pub_date(raw: str) -> datetime:
    if not raw:
        return datetime.now(KST) - timedelta(days=90)
    try:
        dt = parsedate_to_datetime(raw)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(KST)
    except Exception:
        return datetime.now(KST) - timedelta(days=90)


def recency_weight(pub_dt: datetime) -> float:
    age = (datetime.now(KST) - pub_dt).days
    if age <= 3:
        return 1.4
    if age <= 7:
        return 1.25
    if age <= 30:
        return 1.0
    return 0.7


def source_weight(link: str) -> float:
    host = ""
    try:
        host = link.split("/")[2].lower().replace("www.", "")
    except Exception:
        host = ""
    return 1.25 if any(host == h or host.endswith("." + h) for h in MAJOR_HOSTS) else 1.0


def fetch_news(proxy_base: str, query: str, display: int = 100) -> list[dict]:
    params = urlencode({"query": query, "display": display, "sort": "date"})
    url = f"{proxy_base.rstrip('/')}/api/news?{params}"
    with urlopen(url, timeout=20) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    return payload.get("items", [])


def trend_label(count7: int, count30: int) -> str:
    if count30 == 0 and count7 > 0:
        return "신규"
    if count7 >= 3 and count7 / max(count30, 1) >= 0.5:
        return "급상승"
    if count7 >= 1 and count7 / max(count30, 1) >= 0.25:
        return "상승"
    if count30 >= 4 and count7 == 0:
        return "둔화"
    return "유지"


def derive_region_issues(region_key: str, region_name: str, items: list[dict], top_k: int = 6) -> tuple[list[str], dict]:
    topic_score = defaultdict(float)
    topic_count = defaultdict(int)
    topic_count_7 = defaultdict(int)
    topic_count_30 = defaultdict(int)
    topic_sources = defaultdict(lambda: defaultdict(int))
    category_score = defaultdict(float)
    category_count = defaultdict(int)
    seen_titles = set()

    for item in items:
        title = item.get("title", "")
        desc = item.get("description", "")
        text = f"{title} {desc}".lower()
        title_key = title.strip().lower()
        if not title_key or title_key in seen_titles:
            continue
        seen_titles.add(title_key)

        pub_dt = parse_pub_date(item.get("pubDate", ""))
        age_days = (datetime.now(KST) - pub_dt).days
        weight = recency_weight(pub_dt) * source_weight(item.get("originallink") or item.get("link") or "")
        host = ""
        try:
            host = (item.get("originallink") or item.get("link") or "").split("/")[2].lower().replace("www.", "")
        except Exception:
            host = ""
        if region_name.replace("특별자치", "").replace("특별", "") in text:
            weight *= 1.05

        matched_any = False
        for topic in DETAILED_TOPICS:
            if any(k in text for k in topic["keywords"]):
                label = topic["label"]
                cat = topic["category"]
                topic_score[label] += weight
                topic_count[label] += 1
                if age_days <= 7:
                    topic_count_7[label] += 1
                if age_days <= 30:
                    topic_count_30[label] += 1
                if host:
                    topic_sources[label][host] += 1
                category_score[cat] += weight
                category_count[cat] += 1
                matched_any = True

        for hint in REGION_TOPIC_HINTS.get(region_key, []):
            if any(k in text for k in hint["keywords"]):
                label = hint["topic"]
                topic_score[label] += weight * 0.8

        if not matched_any:
            for category, keywords in CATEGORY_KEYWORDS.items():
                if any(k in text for k in keywords):
                    category_score[category] += weight * 0.6
                    category_count[category] += 1

    ranked_topics = sorted(
        DETAILED_TOPICS,
        key=lambda t: (topic_score[t["label"]], topic_count[t["label"]], category_score[t["category"]]),
        reverse=True
    )
    # Do not force-fill to top_k with category/default placeholders.
    # Keep only source-backed detailed topics (count > 0), up to top_k.
    selected = [t["label"] for t in ranked_topics if topic_count[t["label"]] > 0][:top_k]

    signals = {}
    for name in selected:
        topic = next((t for t in DETAILED_TOPICS if t["label"] == name), None)
        if topic:
            top_sources = sorted(
                topic_sources[name].items(),
                key=lambda x: x[1],
                reverse=True
            )[:2]
            signals[name] = {
                "category": topic["category"],
                "score": round(topic_score[name], 2),
                "count": topic_count[name],
                "count7": topic_count_7[name],
                "count30": topic_count_30[name],
                "trend": trend_label(topic_count_7[name], topic_count_30[name]),
                "topSources": [host for host, _ in top_sources],
            }
        else:
            signals[name] = {
                "category": name,
                "score": round(category_score[name], 2),
                "count": category_count[name],
                "count7": 0,
                "count30": 0,
                "trend": "유지",
                "topSources": [],
            }
    return selected, signals


def main() -> None:
    proxy_base = os.environ.get("NEWS_PROXY_BASE", "http://localhost:8787")
    output_path = Path("js/derived_issues.js")

    result = {
        "updatedAt": datetime.now(KST).isoformat(timespec="seconds"),
        "methodology": "news-detailed-topic-weighted-v3",
        "regions": {},
    }

    for key, name in REGIONS.items():
        query = f"{name} 지방선거"
        items = fetch_news(proxy_base, query, display=100)
        issues, signals = derive_region_issues(key, name, items, top_k=6)
        result["regions"][key] = {
            "issues": issues,
            "signals": signals,
            "sourceQuery": query,
        }

    js = "window.DerivedIssuesData = " + json.dumps(result, ensure_ascii=False, indent=2) + ";\n"
    output_path.write_text(js, encoding="utf-8")
    print(f"[ok] wrote {output_path} ({len(result['regions'])} regions)")


if __name__ == "__main__":
    main()
