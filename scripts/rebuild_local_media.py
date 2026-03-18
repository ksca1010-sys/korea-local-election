#!/usr/bin/env python3
"""
시군구 토속언론 DB 재구축 스크립트

기존 방식(기사에 지역명 나온 매체 수집)을 폐기하고,
'{시군구명}+매체유형' 패턴으로 직접 매체를 찾는 방식으로 전면 교체.

수집 로직:
1. 시군구명 + 매체 접미사(신문/뉴스/일보/타임즈/투데이/미디어/열린신문/군민신문/시민신문) 패턴 웹 검색
2. 검색 결과에서 매체 홈페이지 URL 추출
3. 홈페이지 하단에서 발행소 주소 확인 → 해당 시군구면 확정

사용법:
  python scripts/rebuild_local_media.py
  python scripts/rebuild_local_media.py --region=jeonnam
  python scripts/rebuild_local_media.py --district=영암군
  python scripts/rebuild_local_media.py --dry-run
"""

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

import httpx

BASE_DIR = Path(__file__).resolve().parent.parent
POOL_PATH = BASE_DIR / "data" / "local_media_pool.json"
CANDIDATES_PATH = BASE_DIR / "data" / "candidates" / "mayor_candidates.json"
ENV_FILE = BASE_DIR / ".env"

REGION_NAMES = {
    "seoul": "서울특별시", "busan": "부산광역시", "daegu": "대구광역시",
    "incheon": "인천광역시", "gwangju": "광주광역시", "daejeon": "대전광역시",
    "ulsan": "울산광역시", "sejong": "세종특별자치시", "gyeonggi": "경기도",
    "gangwon": "강원특별자치도", "chungbuk": "충청북도", "chungnam": "충청남도",
    "jeonbuk": "전북특별자치도", "jeonnam": "전라남도", "gyeongbuk": "경상북도",
    "gyeongnam": "경상남도", "jeju": "제주특별자치도",
}
SHORT_NAMES = {
    "seoul": "서울", "busan": "부산", "daegu": "대구", "incheon": "인천",
    "gwangju": "광주", "daejeon": "대전", "ulsan": "울산", "sejong": "세종",
    "gyeonggi": "경기", "gangwon": "강원", "chungbuk": "충북", "chungnam": "충남",
    "jeonbuk": "전북", "jeonnam": "전남", "gyeongbuk": "경북",
    "gyeongnam": "경남", "jeju": "제주",
}

# 매체 접미사 패턴
MEDIA_SUFFIXES = [
    "신문", "뉴스", "일보", "타임즈", "투데이",
    "미디어", "열린신문", "군민신문", "시민신문",
    "저널", "매일", "포스트", "프레스", "인터넷신문",
]

# 시군구 이름 변형 (검색용)
def get_district_variants(district):
    """영암군 → ['영암', '영암군']"""
    variants = [district]
    # 시/군/구 접미사 제거
    for suffix in ['특별시', '광역시', '시', '군', '구']:
        if district.endswith(suffix) and len(district) > len(suffix):
            base = district[:-len(suffix)]
            if len(base) >= 2:
                variants.append(base)
                break
    return list(dict.fromkeys(variants))


def load_env():
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, val = line.partition("=")
                os.environ.setdefault(key.strip(), val.strip().strip("'\""))


def search_naver_web(query, display=5):
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


def extract_host(url):
    try:
        h = urlparse(url).hostname or ""
        return h.replace("www.", "").lower()
    except Exception:
        return ""


def fetch_homepage_address(url, district_variants, region_name):
    """홈페이지에서 발행소/편집국 주소를 찾아 해당 시군구인지 확인"""
    try:
        resp = httpx.get(
            url,
            headers={"User-Agent": "Mozilla/5.0 (election-info-bot)"},
            timeout=8,
            follow_redirects=True,
        )
        text = resp.text[:50000]  # 하단 50KB만

        # 주소 패턴: "발행소", "편집국", "주소", "소재지" 근처의 주소
        # 또는 footer 영역에서 시군구명 포함 여부
        address_patterns = [
            r'(?:발행소|편집국|본사|주소|소재지|사무실|사옥)[^가-힣]{0,20}([가-힣\s\d\-·()]{10,60})',
            r'(?:footer|copyright|하단)[^>]{0,500}([가-힣\s\d\-·()]{10,60})',
        ]

        for pat in address_patterns:
            matches = re.findall(pat, text, re.IGNORECASE | re.DOTALL)
            for m in matches:
                for variant in district_variants:
                    if variant in m:
                        return True, m.strip()[:60]
                # 광역 시도명이라도 있으면 부분 매칭
                if region_name and region_name[:2] in m:
                    for variant in district_variants:
                        if variant in m:
                            return True, m.strip()[:60]

        # footer에서 발행소/주소 패턴만 검색 (기사 본문 제외)
        footer_match = re.search(r'<footer[^>]*>(.*?)</footer>', text, re.DOTALL | re.IGNORECASE)
        if footer_match:
            footer_text = re.sub(r'<[^>]+>', ' ', footer_match.group(1))
            # 주소 패턴: "시/군/구" + "로/길/동" 조합 근처에 시군구명
            addr_pattern = re.search(
                r'([가-힣\s\d\-·()]{5,60}(?:로|길|동|읍|면)\s*\d*[가-힣\d\-]*)',
                footer_text
            )
            if addr_pattern:
                addr_text = addr_pattern.group(1)
                for variant in district_variants:
                    if variant in addr_text:
                        return True, addr_text.strip()[:60]

        return False, ""

    except Exception:
        return False, ""


def search_district_media(district, region_key):
    """한 시군구의 토속 언론 탐색"""
    variants = get_district_variants(district)
    base = variants[-1] if len(variants) > 1 else variants[0]  # 접미사 제거된 이름
    region_name = REGION_NAMES.get(region_key, "")
    short_region = SHORT_NAMES.get(region_key, "")

    found = []
    seen_hosts = set()

    for suffix in MEDIA_SUFFIXES:
        query = f"{base}{suffix}"
        results = search_naver_web(query, display=5)

        for item in results:
            host = extract_host(item.get("link", ""))
            if not host or host in seen_hosts:
                continue
            if len(host) < 5:
                continue
            # 포털/대형/관공서 제외
            if any(x in host for x in ["naver.com", "daum.net", "kakao.com", "tistory.com",
                                        "blog.", "cafe.", "wikipedia", "namu.wiki",
                                        "youtube.com", "facebook.com",
                                        ".go.kr", ".or.kr", ".ac.kr"]):
                continue

            seen_hosts.add(host)

            # 매체 이름 추론
            title = re.sub(r'<[^>]+>', '', item.get("title", "")).strip()
            # 제목에서 매체명 추출: "영암군민신문 - 영암 소식" → "영암군민신문"
            media_name = title.split(" - ")[0].split(" | ")[0].split("::")[0].strip()
            if len(media_name) > 20:
                media_name = host

            found.append({
                "host": host,
                "name": media_name,
                "query": query,
                "verified": False,
                "address": "",
            })

        time.sleep(0.15)

    # 중복 제거 후 발행소 주소 검증 (상위 15개만)
    unique = []
    seen = set()
    for f in found:
        if f["host"] not in seen:
            seen.add(f["host"])
            unique.append(f)

    verified = []
    for f in unique[:15]:
        url = f"https://{f['host']}"
        is_local, address = fetch_homepage_address(url, variants, region_name)
        if is_local:
            f["verified"] = True
            f["address"] = address
            verified.append(f)
        time.sleep(0.2)

    # 검증 실패한 것 중 강한 시그널이 있으면 추가
    for f in unique:
        if f["verified"]:
            continue

        # 매체명 = 검색 title의 첫 부분 (기사 제목이 아닌 사이트명만)
        # "영암신문" (사이트명)은 OK, "영암군 행사 개최 - 전남일보" (기사제목)는 NG
        clean_name = f["name"].strip()
        # 매체명이 짧고(15자 이하) 시군구명 + 매체접미사 패턴이면 확정
        is_media_name = len(clean_name) <= 15 and any(
            clean_name.startswith(v) and any(clean_name.endswith(s) for s in MEDIA_SUFFIXES + ["일보", "매일", "포스트", "프레스", "저널"])
            for v in variants
        )
        if is_media_name:
            f["verified"] = True
            f["address"] = "(매체명 패턴 매칭)"
            if f not in verified:
                verified.append(f)
            continue

        # host에 지역명 로마자가 포함 (yeongam, gunsan, gimpo 등)
        romanized = _romanize_district(base)
        if romanized and romanized in f["host"]:
            f["verified"] = True
            f["address"] = "(host에 지역 로마자 포함)"
            if f not in verified:
                verified.append(f)

    return verified


# 간이 한글→로마자 매핑 (주요 시군구)
_ROMANIZE_MAP = {
    "서울": "seoul", "부산": "busan", "대구": "daegu", "인천": "incheon",
    "광주": "gwangju", "대전": "daejeon", "울산": "ulsan", "세종": "sejong",
    "수원": "suwon", "성남": "seongnam", "고양": "goyang", "용인": "yongin",
    "안양": "anyang", "안산": "ansan", "남양주": "namyangju", "화성": "hwaseong",
    "평택": "pyeongtaek", "의정부": "uijeongbu", "시흥": "siheung", "파주": "paju",
    "김포": "gimpo", "광명": "gwangmyeong", "군포": "gunpo", "오산": "osan",
    "하남": "hanam", "이천": "icheon", "양주": "yangju", "구리": "guri",
    "안성": "anseong", "포천": "pocheon", "의왕": "uiwang", "여주": "yeoju",
    "양평": "yangpyeong", "동두천": "dongducheon", "과천": "gwacheon",
    "가평": "gapyeong", "연천": "yeoncheon",
    "춘천": "chuncheon", "원주": "wonju", "강릉": "gangneung", "동해": "donghae",
    "태백": "taebaek", "속초": "sokcho", "삼척": "samcheok",
    "홍천": "hongcheon", "횡성": "hoengseong", "영월": "yeongwol",
    "평창": "pyeongchang", "정선": "jeongseon", "철원": "cheorwon",
    "화천": "hwacheon", "양구": "yanggu", "인제": "inje", "고성": "goseong",
    "양양": "yangyang",
    "청주": "cheongju", "충주": "chungju", "제천": "jecheon",
    "보은": "boeun", "옥천": "okcheon", "영동": "yeongdong", "증평": "jeungpyeong",
    "진천": "jincheon", "괴산": "goesan", "음성": "eumseong", "단양": "danyang",
    "천안": "cheonan", "공주": "gongju", "보령": "boryeong", "아산": "asan",
    "서산": "seosan", "논산": "nonsan", "계룡": "gyeryong", "당진": "dangjin",
    "금산": "geumsan", "부여": "buyeo", "서천": "seocheon", "청양": "cheongyang",
    "홍성": "hongseong", "예산": "yesan", "태안": "taean",
    "전주": "jeonju", "군산": "gunsan", "익산": "iksan", "정읍": "jeongeup",
    "남원": "namwon", "김제": "gimje",
    "무주": "muju", "장수": "jangsu", "임실": "imsil", "순창": "sunchang",
    "고창": "gochang", "부안": "buan", "완주": "wanju", "진안": "jinan",
    "목포": "mokpo", "여수": "yeosu", "순천": "suncheon", "나주": "naju",
    "광양": "gwangyang",
    "담양": "damyang", "곡성": "gokseong", "구례": "gurye", "고흥": "goheung",
    "보성": "boseong", "화순": "hwasun", "장흥": "jangheung", "강진": "gangjin",
    "해남": "haenam", "영암": "yeongam", "무안": "muan", "함평": "hampyeong",
    "영광": "yeonggwang", "장성": "jangseong", "완도": "wando",
    "진도": "jindo", "신안": "sinan",
    "포항": "pohang", "경주": "gyeongju", "김천": "gimcheon", "안동": "andong",
    "구미": "gumi", "영주": "yeongju", "영천": "yeongcheon", "상주": "sangju",
    "문경": "mungyeong", "경산": "gyeongsan",
    "군위": "gunwi", "의성": "uiseong", "청송": "cheongsong", "영양": "yeongyang",
    "영덕": "yeongdeok", "청도": "cheongdo", "고령": "goryeong",
    "성주": "seongju", "칠곡": "chilgok", "예천": "yecheon",
    "봉화": "bonghwa", "울진": "uljin", "울릉": "ulleung",
    "창원": "changwon", "진주": "jinju", "통영": "tongyeong", "사천": "sacheon",
    "김해": "gimhae", "밀양": "miryang", "거제": "geoje", "양산": "yangsan",
    "의령": "uiryeong", "함안": "haman", "창녕": "changnyeong",
    "고성": "goseong", "남해": "namhae", "하동": "hadong",
    "산청": "sancheong", "함양": "hamyang", "거창": "geochang", "합천": "hapcheon",
    "제주": "jeju", "서귀포": "seogwipo",
    # 구 단위
    "종로": "jongno", "중구": "junggu", "용산": "yongsan", "성동": "seongdong",
    "광진": "gwangjin", "동대문": "dongdaemun", "중랑": "jungnang",
    "성북": "seongbuk", "강북": "gangbuk", "도봉": "dobong", "노원": "nowon",
    "은평": "eunpyeong", "서대문": "seodaemun", "마포": "mapo",
    "양천": "yangcheon", "강서": "gangseo", "구로": "guro", "금천": "geumcheon",
    "영등포": "yeongdeungpo", "동작": "dongjak", "관악": "gwanak",
    "서초": "seocho", "강남": "gangnam", "송파": "songpa", "강동": "gangdong",
}

def _romanize_district(base):
    return _ROMANIZE_MAP.get(base, "")


def main():
    parser = argparse.ArgumentParser(description="시군구 토속언론 DB 재구축")
    parser.add_argument("--region", type=str)
    parser.add_argument("--district", type=str)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    load_env()

    pool = json.loads(POOL_PATH.read_text(encoding="utf-8"))
    candidates = json.loads(CANDIDATES_PATH.read_text(encoding="utf-8"))

    # 기존 시군구 토속 데이터 백업 후 초기화
    old_muni = pool.get("municipal", {})
    new_muni = {}

    regions = [args.region] if args.region else sorted(candidates.get("candidates", {}).keys())

    print("=" * 60)
    print("시군구 토속언론 DB 재구축")
    print("=" * 60)

    total_found = 0
    total_districts = 0

    for rk in regions:
        districts = candidates.get("candidates", {}).get(rk, {})
        sido = SHORT_NAMES.get(rk, rk)

        if args.district:
            if args.district not in districts:
                continue
            districts = {args.district: districts[args.district]}

        print(f"\n[{sido}] {len(districts)}개 시군구")

        for district in sorted(districts.keys()):
            total_districts += 1
            print(f"  {district}...", end="", flush=True)

            verified = search_district_media(district, rk)

            if verified:
                hosts = [v["host"] for v in verified]
                names = [v["name"] for v in verified]
                media = [{"name": v["name"], "host": v["host"], "src": "verified", "address": v["address"]} for v in verified]

                new_muni[district] = {
                    "hosts": hosts,
                    "names": names,
                    "media": media,
                }
                total_found += len(verified)
                print(f" {len(verified)}개 확정 ({', '.join(hosts[:3])}{'...' if len(hosts)>3 else ''})")
            else:
                # 기존 데이터 유지 (검증된 것만)
                old = old_muni.get(district, {})
                if isinstance(old, dict) and old.get("media"):
                    # 기존 중 verified/bk/mcst 출처만 유지
                    kept = [m for m in old.get("media", []) if m.get("src") in ("bk", "mcst", "verified", "p")]
                    if kept:
                        new_muni[district] = {
                            "hosts": [m.get("host", m.get("name", "")) for m in kept if "." in m.get("host", m.get("name", ""))],
                            "names": [m.get("name", "") for m in kept],
                            "media": kept,
                        }
                        print(f" 0개 신규, 기존 {len(kept)}개 유지")
                    else:
                        new_muni[district] = {"hosts": [], "names": [], "media": []}
                        print(f" 0개")
                else:
                    new_muni[district] = {"hosts": [], "names": [], "media": []}
                    print(f" 0개")

    if not args.dry_run:
        pool["municipal"] = new_muni
        POOL_PATH.write_text(
            json.dumps(pool, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8"
        )

    # 통계
    has_media = sum(1 for v in new_muni.values() if v.get("hosts"))
    total_hosts = sum(len(v.get("hosts", [])) for v in new_muni.values())

    print("\n" + "=" * 60)
    print(f"완료: {total_districts}개 시군구 탐색")
    print(f"  확정 매체: {total_found}개")
    print(f"  커버리지: {has_media}/{total_districts}")
    print(f"  총 hosts: {total_hosts}개")
    if not args.dry_run:
        print(f"[저장] {POOL_PATH}")
    print("=" * 60)


if __name__ == "__main__":
    main()
