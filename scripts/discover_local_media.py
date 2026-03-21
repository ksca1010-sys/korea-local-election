#!/usr/bin/env python3
"""
시군구별 토속 언론사 심층 탐색 스크립트 v2

수집 소스 4채널 병렬 운영:
  1. 네이버 뉴스 검색 API  — 기존 방식, 선거/시정 쿼리
  2. 카카오 뉴스 검색 API  — 네이버 미인덱싱 보완
  3. 인터넷신문 등록 DB    — data/internet_newspapers.json (사전 수집본)
  4. 광역 언론사 서브도메인 — 지역 방송 지국 자동 탐지

전략:
  - 쿼리 다양화: 선거/후보/공천/공약/현안/의원 등 7개 쿼리
  - 2회 이상 등장 호스트 우선 채택
  - 기등록 시군구는 --all 플래그 없으면 스킵
  - --fill-only: 0개 시군구만 집중 탐색

사용법:
  python scripts/discover_local_media.py               # 미등록 시군구만
  python scripts/discover_local_media.py --all         # 전체 재탐색
  python scripts/discover_local_media.py --region=gyeonggi
  python scripts/discover_local_media.py --dry-run
  python scripts/discover_local_media.py --report      # 현황 리포트만
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
INET_NEWS_PATH = BASE_DIR / "data" / "internet_newspapers.json"
ENV_FILE = BASE_DIR / ".env"

# ── 중앙 언론 제외 목록 ──────────────────────────────────────────────────────

MAJOR_HOSTS = {
    # 포털·SNS
    "naver.com", "daum.net", "kakao.com", "google.com",
    "youtube.com", "facebook.com", "twitter.com", "instagram.com", "tiktok.com",
    "play.google.com",
    # 블로그·커뮤니티
    "tistory.com", "blog.naver.com", "brunch.co.kr", "velog.io",
    "dcinside.com", "fmkorea.com", "ruliweb.com", "clien.net",
    "wikitree.co.kr",
    # 백과사전
    "wikipedia.org", "namu.wiki", "namuwiki.kr", "grandculture.net",
    # 정부·기관
    "government.kr", "go.kr", "assembly.go.kr",
    # 전국 통신사
    "yna.co.kr", "newsis.com", "news1.kr", "yonhapnewstv.co.kr",
    # 전국 방송
    "kbs.co.kr", "mbc.co.kr", "sbs.co.kr", "jtbc.co.kr", "tvchosun.com",
    "ytn.co.kr", "radio.ytn.co.kr", "kbsm.net",
    # 전국 방송 케이블
    "news.lghellovision.net", "news.skbroadband.com", "news.bbsi.co.kr",
    # 전국 종합지
    "chosun.com", "joongang.co.kr", "donga.com", "hani.co.kr", "khan.co.kr",
    "seoul.co.kr", "munhwa.com", "naeil.com",
    # 전국 경제지
    "mk.co.kr", "hankyung.com", "edaily.co.kr", "fntimes.com",
    "mt.co.kr", "viva100.com", "biz.heraldcorp.com", "view.asiae.co.kr",
    "hansbiz.co.kr", "cnbnews.com",
    # 전국 인터넷 언론
    "ohmynews.com", "nocutnews.co.kr", "pressian.com", "mediatoday.co.kr",
    "newstapa.org", "sisajournal.com", "sisain.co.kr", "newstof.com",
    "newspim.com", "newstomato.com", "econovill.com", "ajunews.com",
    "ekn.kr", "weeklytoday.com", "enewstoday.co.kr", "econonews.co.kr",
    "newsfreezone.co.kr", "kpinews.kr", "shinailbo.co.kr",
    "joygm.com", "hidomin.com", "bzeronews.com", "dtnews24.com",
    "news2day.co.kr", "getnews.co.kr", "newsworks.co.kr",
    "newsprime.co.kr", "nspna.com", "m-i.kr", "onews.tv",
    "newsmaker.or.kr", "newsworker.co.kr", "siminsori.com",
    "ikbc.co.kr", "skyedaily.com", "slownews.kr", "ppss.kr",
    "k-knowledge.kr", "ilyoseoul.co.kr",
    # 전국 전문지 (스포츠·IT·법률·농업 등)
    "sports.hankooki.com", "dailysportshankook.co.kr", "sportsseoul.com",
    "daily.hankooki.com", "ilyosisa.co.kr",
    "imnews.imbc.com", "etnews.com", "zdnet.co.kr", "inews24.com",
    "lawissue.co.kr", "agrinet.co.kr",
    "ibabynews.com", "ablenews.co.kr",
    "catholictimes.org", "minjok.or.kr",
    "pennmike.com", "hg-times.com", "joongboo.com",
    # 기타 전국
    "kookbang.dema.mil.kr", "cpbc.co.kr",
    "safetimes.co.kr", "kukinews.com", "polinews.co.kr",
    "breaknews.com", "gukjenews.com", "apnews.kr",
    "weekly.chosun.com", "monthly.chosun.com",
}

PORTAL_PATTERNS = [
    "naver.com", "daum.net", "kakao.com", "tistory.com",
    "blog.", "cafe.", "post.", "m.search", ".tistory.", ".blog.",
    "grandculture.net",   # 한국학중앙연구원 백과사전
    "play.google.com",
]

# 광역 언론사 — 해당 광역 시군구에서만 유효, 타 광역엔 추가 안 함
REGIONAL_RESTRICT = {
    "kyeongin.com":      {"gyeonggi", "incheon"},
    "incheonilbo.com":   {"incheon"},
    "incheontoday.com":  {"incheon"},
    "incheonnews.com":   {"incheon"},
    "incheonin.com":     {"incheon"},
    "idomin.com":        {"gyeongnam", "busan", "ulsan"},
    "ksilbo.co.kr":      {"gyeongnam", "busan", "ulsan"},
    "knnews.co.kr":      {"gyeongnam", "busan"},
    "news.knn.co.kr":    {"gyeongnam", "busan"},
    "kookje.co.kr":      {"busan"},
    "busan.com":         {"busan"},
    "iusm.co.kr":        {"ulsan"},
    "ujeil.com":         {"ulsan"},
    "idaegu.co.kr":      {"daegu"},
    "idaegu.com":        {"daegu"},
    "imaeil.com":        {"daegu", "gyeongbuk"},
    "yeongnam.com":      {"daegu", "gyeongbuk", "gyeongnam"},
    "ksmnews.co.kr":     {"gyeongnam"},
    "gnnews.co.kr":      {"gyeongnam"},
    "gnmaeil.com":       {"gyeongnam"},
    "gndomin.com":       {"gyeongnam"},
    "kyongbuk.co.kr":    {"gyeongbuk"},
    "kbmaeil.com":       {"gyeongbuk"},
    "dkilbo.com":        {"gyeongbuk"},
    "kyeonggi.com":      {"gyeonggi"},
    "suwonilbo.kr":      {"gyeonggi"},
    "joongboo.com":      {"gyeonggi"},
    "kado.net":          {"gangwon"},
    "kwnews.co.kr":      {"gangwon"},
    "g1tv.co.kr":        {"gangwon"},
    "jbnews.com":        {"jeonbuk"},
    "jbsori.com":        {"jeonbuk"},
    "jeonmae.co.kr":     {"jeonbuk", "jeonnam"},
    "jeollailbo.com":    {"jeonbuk", "jeonnam"},
    "jnilbo.com":        {"jeonnam"},
    "jndn.com":          {"jeonnam"},
    "namdonews.com":     {"jeonnam"},
    "mdilbo.com":        {"gwangju"},
    "kwangju.co.kr":     {"gwangju"},
    "siminilbo.co.kr":   {"gwangju", "jeonnam"},
    "gjdream.com":       {"gwangju"},
    "kjdaily.com":       {"gwangju"},
    "cctoday.co.kr":     {"chungnam", "chungbuk", "daejeon", "sejong"},
    "ccdailynews.com":   {"chungnam", "chungbuk", "daejeon", "sejong"},
    "ccnnews.co.kr":     {"chungnam", "chungbuk", "daejeon", "sejong"},
    "goodmorningcc.com": {"chungnam", "chungbuk", "daejeon", "sejong"},
    "newstnt.com":       {"chungnam", "chungbuk", "daejeon", "sejong"},
    "cctimes.kr":        {"chungnam", "chungbuk"},
    "chungnamilbo.co.kr":{"chungnam"},
    "daejonilbo.com":    {"daejeon"},
    "dnews.co.kr":       {"daejeon"},
    "joongdo.co.kr":     {"daejeon", "chungnam"},
    "jjan.kr":           {"jeonbuk"},
    "m.jjan.kr":         {"jeonbuk"},
    "dynews.co.kr":      {"chungbuk"},
    "inews365.com":      {"chungbuk"},
    "ccdn.co.kr":        {"chungbuk"},
    "metroseoul.co.kr":  {"seoul", "gyeonggi", "incheon"},
    "pn.or.kr":          {"busan", "gyeongnam"},
}

REGION_NAMES = {
    "seoul": "서울", "busan": "부산", "daegu": "대구",
    "incheon": "인천", "gwangju": "광주", "daejeon": "대전",
    "ulsan": "울산", "sejong": "세종", "gyeonggi": "경기",
    "gangwon": "강원", "chungbuk": "충북", "chungnam": "충남",
    "jeonbuk": "전북", "jeonnam": "전남", "gyeongbuk": "경북",
    "gyeongnam": "경남", "jeju": "제주",
}

# 광역 지역방송 → 지국 서브도메인 패턴 (탐지 보조용)
REGIONAL_BROADCAST_ROOTS = [
    "kbs.co.kr", "mbc.co.kr", "jibs.co.kr", "knn.co.kr",
    "tbc.co.kr", "ubs.co.kr", "cjb.co.kr", "ubc.co.kr",
    "g1tv.co.kr", "ojb.co.kr",
]


# ── 유틸 ──────────────────────────────────────────────────────────────────────

def load_env():
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, val = line.partition("=")
                os.environ.setdefault(key.strip(), val.strip().strip("'\""))


def extract_host(url: str) -> str:
    try:
        h = urlparse(url).hostname or ""
        return h.replace("www.", "").lower()
    except Exception:
        return ""


def is_local_candidate(host: str) -> bool:
    """전국지·포털이 아닌 지역 언론 후보인지 1차 판별"""
    if not host or len(host) < 6:
        return False
    for major in MAJOR_HOSTS:
        if host == major or host.endswith(f".{major}"):
            return False
    for pat in PORTAL_PATTERNS:
        if pat in host:
            return False
    # IP 주소 형태 제외
    if re.match(r"^\d+\.\d+\.\d+\.\d+$", host):
        return False
    return True


# ── 소스 1: 네이버 뉴스 검색 ──────────────────────────────────────────────────

def search_naver(query: str, display: int = 20) -> list:
    try:
        import httpx
    except ImportError:
        return []
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


# ── 소스 2: 카카오 뉴스 검색 ──────────────────────────────────────────────────

def search_kakao(query: str, size: int = 10) -> list:
    try:
        import httpx
    except ImportError:
        return []
    key = os.environ.get("KAKAO_REST_API_KEY", "")
    if not key:
        return []
    try:
        resp = httpx.get(
            "https://dapi.kakao.com/v2/search/web",
            headers={"Authorization": f"KakaoAK {key}"},
            params={"query": f"{query} 지역신문", "size": size, "sort": "recency"},
            timeout=10,
        )
        resp.raise_for_status()
        docs = resp.json().get("documents", [])
        # kakao web search → url 필드
        return [{"originallink": d.get("url", ""), "link": d.get("url", ""),
                 "title": d.get("title", "")} for d in docs]
    except Exception:
        return []


# ── 소스 3: 인터넷신문 등록 DB ────────────────────────────────────────────────

def load_inet_news_db() -> dict:
    """
    data/internet_newspapers.json 로드.
    구조: { "시군구명": [{"name": ..., "host": ..., "registered": ...}, ...] }
    파일이 없으면 빈 딕셔너리 반환.
    """
    if not INET_NEWS_PATH.exists():
        return {}
    try:
        return json.loads(INET_NEWS_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}


def get_inet_news_for_district(db: dict, district: str) -> list:
    """인터넷신문 DB에서 시군구 해당 매체 반환"""
    results = []
    direct = db.get(district, [])
    for item in direct:
        host = item.get("host", "").lower().replace("www.", "")
        if host and is_local_candidate(host):
            results.append({"host": host, "name": item.get("name", host), "src": "inet_db"})
    return results


# ── 핵심: 시군구 단위 탐색 ────────────────────────────────────────────────────

def discover_for_district(region_key: str, district: str, inet_db: dict) -> list:
    """
    한 시군구를 위한 지역 언론사 탐색 (4채널 병렬).
    반환: [{"host": ..., "name": ..., "count": ..., "src": ...}, ...]
    """
    short_region = REGION_NAMES.get(region_key, "")

    # 네이버용 쿼리 7종 (기존 4개 + 3개 추가)
    naver_queries = [
        f'"{district}" 지역신문',
        f'"{district}" 인터넷신문',
        f'"{district}" 시정 뉴스 소식',
        f'"{short_region}" "{district}" 지방선거 후보',
        f'"{district}" 기초단체장 출마 선언',
        f'"{district}" 의원 공천 선거',
        f'"{district}" 공약 현안 주민',
    ]

    # 카카오용 쿼리 3종
    kakao_queries = [
        f'"{district}" 지역신문',
        f'"{district}" 기초의원',
        f'"{district}" 선거 후보',
    ]

    host_counter: Counter = Counter()
    host_names: dict = {}
    host_src: dict = {}

    # ① 네이버
    for q in naver_queries:
        items = search_naver(q, display=20)
        for item in items:
            for url_field in ["originallink", "link"]:
                host = extract_host(item.get(url_field, ""))
                if is_local_candidate(host):
                    host_counter[host] += 1
                    host_src.setdefault(host, "naver")
                    if host not in host_names:
                        host_names[host] = host
        time.sleep(0.15)

    # ② 카카오
    for q in kakao_queries:
        items = search_kakao(q, size=10)
        for item in items:
            host = extract_host(item.get("originallink", "") or item.get("link", ""))
            if is_local_candidate(host):
                host_counter[host] += 1
                host_src.setdefault(host, "kakao")
                if host not in host_names:
                    host_names[host] = host
        time.sleep(0.1)

    # ③ 인터넷신문 등록 DB (오프라인, API 비용 없음)
    inet_results = get_inet_news_for_district(inet_db, district)
    for r in inet_results:
        host_counter[r["host"]] += 3   # DB 등록 = 신뢰도 가중치 3
        host_names[r["host"]] = r["name"]
        host_src[r["host"]] = "inet_db"

    # 광역 제한 필터 — 타 광역 언론사 제거
    def is_allowed_for_region(host):
        if host in REGIONAL_RESTRICT:
            return region_key in REGIONAL_RESTRICT[host]
        return True

    # 결과 정리 — 1회 이상 등장 또는 DB 등록된 것 모두 채택
    results = []
    seen = set()
    for host, count in host_counter.most_common(15):
        if host in seen:
            continue
        seen.add(host)
        if not is_allowed_for_region(host):
            continue
        results.append({
            "host": host,
            "count": count,
            "name": host_names.get(host, host),
            "src": host_src.get(host, "naver"),
        })

    return results


# ── pool.json 병합 ────────────────────────────────────────────────────────────

def merge_into_pool(pool: dict, district: str, results: list):
    """발견된 매체를 pool.municipal[district]에 병합 (중복 제외)"""
    if district not in pool.get("municipal", {}):
        pool["municipal"][district] = {"hosts": [], "names": [], "media": []}
    muni = pool["municipal"][district]
    if isinstance(muni, list):
        muni = {"hosts": [], "names": [], "media": muni}
        pool["municipal"][district] = muni

    existing_hosts = set(muni.get("hosts", []))

    added = 0
    for r in results:
        if r["host"] in existing_hosts:
            continue
        muni.setdefault("hosts", []).append(r["host"])
        existing_hosts.add(r["host"])
        if r["name"] not in muni.get("names", []):
            muni.setdefault("names", []).append(r["name"])
        if not any(m.get("host") == r["host"] for m in muni.get("media", [])):
            muni.setdefault("media", []).append({
                "host": r["host"],
                "name": r["name"],
                "src": r.get("src", "discover"),
                "count": r.get("count", 1),
            })
        added += 1
    return added


# ── 리포트 ────────────────────────────────────────────────────────────────────

def print_report(pool: dict, candidates: dict):
    """시군구 등록 현황 요약 리포트"""
    print("\n" + "=" * 60)
    print("지역 언론사 등록 현황 리포트")
    print("=" * 60)

    total_districts = 0
    zero_districts = []
    one_districts = []

    for rk, districts in sorted(candidates.get("candidates", {}).items()):
        region_name = REGION_NAMES.get(rk, rk)
        for district in sorted(districts.keys()):
            total_districts += 1
            muni = pool.get("municipal", {}).get(district, {})
            if isinstance(muni, dict):
                cnt = len(muni.get("hosts", []))
            elif isinstance(muni, list):
                cnt = len(muni)
            else:
                cnt = 0
            if cnt == 0:
                zero_districts.append(f"{region_name}/{district}")
            elif cnt == 1:
                one_districts.append(f"{region_name}/{district}")

    total = len(pool.get("municipal", {}))
    print(f"\n전체 시군구: {total_districts}개")
    print(f"등록된 시군구: {total}개")
    print(f"  ▸ 매체 0개: {len(zero_districts)}개")
    print(f"  ▸ 매체 1개: {len(one_districts)}개")
    print(f"  ▸ 매체 2개 이상: {total - len(zero_districts) - len(one_districts)}개")

    if zero_districts:
        print(f"\n[매체 없는 시군구 {len(zero_districts)}개]")
        for d in zero_districts:
            print(f"  - {d}")

    if one_districts:
        print(f"\n[매체 1개뿐인 시군구 {len(one_districts)}개]")
        for d in one_districts:
            print(f"  - {d}")


# ── main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="시군구 토속 언론 심층 탐색 v2")
    parser.add_argument("--region", type=str, help="특정 시도 key만 (예: gyeonggi)")
    parser.add_argument("--district", type=str, help="특정 시군구만 (예: 수원시)")
    parser.add_argument("--dry-run", action="store_true", help="탐색만, 저장 안 함")
    parser.add_argument("--all", action="store_true", help="기등록 시군구도 재탐색")
    parser.add_argument("--fill-only", action="store_true", help="0개 시군구만 집중")
    parser.add_argument("--report", action="store_true", help="현황 리포트만 출력")
    args = parser.parse_args()

    load_env()

    pool = json.loads(POOL_PATH.read_text(encoding="utf-8")) if POOL_PATH.exists() else {"metro": {}, "municipal": {}}
    candidates = json.loads(CANDIDATES_PATH.read_text(encoding="utf-8")) if CANDIDATES_PATH.exists() else {"candidates": {}}
    inet_db = load_inet_news_db()

    if args.report:
        print_report(pool, candidates)
        return

    if args.district:
        # 단일 시군구 탐색
        for rk, districts in candidates.get("candidates", {}).items():
            if args.district in districts:
                results = discover_for_district(rk, args.district, inet_db)
                print(f"{args.district}: {len(results)}개 발견")
                for r in results:
                    print(f"  {r['host']} (count={r['count']}, src={r['src']})")
                if not args.dry_run and results:
                    added = merge_into_pool(pool, args.district, results)
                    print(f"  → {added}개 신규 추가")
                    POOL_PATH.write_text(json.dumps(pool, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
                return
        print(f"시군구 '{args.district}'를 후보 DB에서 찾을 수 없음")
        return

    print("=" * 60)
    print("시군구 토속 언론 심층 탐색 v2")
    print(f"소스: 네이버 + 카카오 + 인터넷신문DB ({len(inet_db)}개 시군구 사전 등록)")
    print("=" * 60)

    regions = [args.region] if args.region else sorted(candidates.get("candidates", {}).keys())

    total_added = 0
    total_scanned = 0
    zero_before = 0
    zero_filled = 0

    for rk in regions:
        districts = candidates.get("candidates", {}).get(rk, {})
        short = REGION_NAMES.get(rk, rk)
        print(f"\n[{rk}] {short} ({len(districts)}개 시군구)")

        for district in sorted(districts.keys()):
            existing = pool.get("municipal", {}).get(district, {})
            existing_count = len(existing.get("hosts", [])) if isinstance(existing, dict) else len(existing) if isinstance(existing, list) else 0

            if existing_count == 0:
                zero_before += 1

            # 스킵 조건
            if not args.all:
                if args.fill_only and existing_count > 0:
                    continue
                if not args.fill_only and existing_count >= 2:
                    continue

            total_scanned += 1
            results = discover_for_district(rk, district, inet_db)

            status = f"기존 {existing_count}개"
            if results:
                print(f"  {district} ({status}) → {len(results)}개 발견: {', '.join(r['host'] for r in results[:3])}")
            else:
                print(f"  {district} ({status}) → 발견 없음")

            if args.dry_run or not results:
                continue

            added = merge_into_pool(pool, district, results)
            total_added += added
            if existing_count == 0 and added > 0:
                zero_filled += 1

    if not args.dry_run:
        POOL_PATH.write_text(json.dumps(pool, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"\n{'=' * 60}")
        print(f"탐색 완료: {total_scanned}개 시군구 스캔")
        print(f"신규 추가: {total_added}개 도메인")
        print(f"0개→유입: {zero_filled}/{zero_before}개 시군구 채움")
        print(f"저장: {POOL_PATH}")
    else:
        print(f"\n[dry-run] 저장 안 함. {total_scanned}개 스캔됨.")


if __name__ == "__main__":
    main()
