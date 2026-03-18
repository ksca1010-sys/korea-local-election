#!/usr/bin/env python3
"""
문화체육관광부 정기간행물 등록관리시스템에서 인터넷신문 목록을 크롤링하여
local_media_pool.json에 병합하는 스크립트.

출처: https://pds.mcst.go.kr
종별: 인터넷신문
"""

import json
import re
import time
from pathlib import Path
import httpx

BASE_DIR = Path(__file__).resolve().parent.parent
POOL_PATH = BASE_DIR / "data" / "local_media_pool.json"
OUTPUT_PATH = BASE_DIR / "data" / "internet_newspapers.json"

URL = "https://pds.mcst.go.kr/main/pdssearch/selectPdsSearchList.do"

# 시도코드 매핑 (MCST → regionKey)
SIDO_CODES = {
    "01": ("서울특별시", "seoul"),
    "02": ("부산광역시", "busan"),
    "03": ("대구광역시", "daegu"),
    "04": ("인천광역시", "incheon"),
    "05": ("광주광역시", "gwangju"),
    "06": ("대전광역시", "daejeon"),
    "07": ("울산광역시", "ulsan"),
    "08": ("경기도", "gyeonggi"),
    "09": ("강원도", "gangwon"),
    "10": ("충청북도", "chungbuk"),
    "11": ("충청남도", "chungnam"),
    "12": ("전라북도", "jeonbuk"),
    "13": ("전라남도", "jeonnam"),
    "14": ("경상북도", "gyeongbuk"),
    "15": ("경상남도", "gyeongnam"),
    "16": ("제주도", "jeju"),
    "17": ("세종특별자치시", "sejong"),
}


def parse_page(html):
    """HTML에서 인터넷신문 제호와 보급지역 추출"""
    results = []

    # 테이블 행 파싱: 각 행에서 제호, 종별, 보급지역 추출
    # 패턴: <div class="mtit"> <span>종별</span><span>제호</span>
    rows = html.split('<div class="mtit">')

    for row in rows[1:]:  # 첫 번째는 헤더
        # 제호 추출
        spans = re.findall(r'<span>([^<]+)</span>', row[:500])
        if len(spans) < 2:
            continue

        jongbyul = spans[0].strip()
        title = spans[1].strip()

        # 인터넷신문만
        if '인터넷신문' not in jongbyul:
            continue

        # 보급지역 추출 (td에서)
        area_match = re.findall(r'<td class="tdw01">\s*([가-힣][가-힣\s,·]+)', row[:2000])
        area = area_match[-1].strip() if area_match else ''

        # URL 추출 (있으면)
        url_match = re.search(r'href=["\']?(https?://[^\s"\'<>]+)', row[:2000])
        url = url_match.group(1) if url_match else ''

        results.append({
            "name": title,
            "area": area,
            "url": url,
        })

    return results


def scrape_sido(client, sido_code, sido_name):
    """한 시도의 모든 인터넷신문 수집"""
    all_results = []
    page = 1

    while True:
        resp = client.post(URL, data={
            "pageIndex": str(page),
            "sido1": sido_code,
            "sido2": "",
            "searchCnd": "1",
            "searchWrd": "",
        }, timeout=30)

        items = parse_page(resp.text)
        if not items:
            break

        all_results.extend(items)
        print(f"    page {page}: {len(items)}건")

        # 다음 페이지 존재 여부
        if f"fn_selectPage({page + 1})" not in resp.text:
            break

        page += 1
        time.sleep(1)

    return all_results


def classify_by_district(items, sido_name):
    """보급지역으로 시군구 분류"""
    metro = []  # 광역 전체
    districts = {}  # 시군구별

    for item in items:
        area = item["area"]
        # 보급지역에서 시군구 추출
        # "서울특별시" → 광역 전체
        # "서울특별시 강남구" → 강남구
        # "전국" → 스킵 (전국지)
        if not area or area == "전국":
            continue

        # 시군구 추출
        parts = area.replace(",", " ").split()
        district = None
        for p in parts:
            p = p.strip()
            if p.endswith(("시", "군", "구")) and p != sido_name and len(p) >= 2:
                # "특별시", "광역시" 등은 제외
                if "특별" not in p and "광역" not in p:
                    district = p
                    break

        entry = {"name": item["name"], "src": "mcst"}
        if item.get("url"):
            entry["url"] = item["url"]

        if district:
            if district not in districts:
                districts[district] = []
            districts[district].append(entry)
        else:
            metro.append(entry)

    return metro, districts


def main():
    client = httpx.Client(headers={"User-Agent": "Mozilla/5.0 (election-info-bot)"})

    all_data = {}
    total = 0

    print("=" * 60)
    print("인터넷신문 등록 현황 크롤링 (문체부 정기간행물 등록관리시스템)")
    print("=" * 60)

    for code, (sido_name, region_key) in sorted(SIDO_CODES.items()):
        print(f"\n[{sido_name}] (code={code})")
        items = scrape_sido(client, code, sido_name)
        print(f"  총 {len(items)}건")
        total += len(items)

        metro, districts = classify_by_district(items, sido_name)
        all_data[region_key] = {
            "sido": sido_name,
            "metro": metro,
            "districts": districts,
            "totalCount": len(items),
        }

        time.sleep(1)

    client.close()

    # 저장
    OUTPUT_PATH.write_text(
        json.dumps(all_data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8"
    )
    print(f"\n총 {total}건 수집 → {OUTPUT_PATH}")

    # media_pool.json에 병합
    if POOL_PATH.exists():
        pool = json.loads(POOL_PATH.read_text(encoding="utf-8"))
    else:
        pool = {"metro": {}, "municipal": {}, "bigkinds": []}

    merged_metro = 0
    merged_muni = 0

    for region_key, rdata in all_data.items():
        sido_name = rdata["sido"]

        # 광역 병합
        if sido_name not in pool.get("metro", {}):
            pool["metro"][sido_name] = {"hosts": [], "names": [], "media": []}
        existing_names = {m["name"] for m in pool["metro"][sido_name].get("media", [])}
        for m in rdata["metro"]:
            if m["name"] not in existing_names:
                pool["metro"][sido_name]["media"].append(m)
                pool["metro"][sido_name]["names"].append(m["name"])
                existing_names.add(m["name"])
                merged_metro += 1
                # host 추출
                if m.get("url"):
                    try:
                        from urllib.parse import urlparse
                        host = urlparse(m["url"]).hostname
                        if host:
                            host = host.replace("www.", "")
                            if host not in pool["metro"][sido_name]["hosts"]:
                                pool["metro"][sido_name]["hosts"].append(host)
                    except Exception:
                        pass

        # 시군구 병합
        for district, medias in rdata.get("districts", {}).items():
            if district not in pool.get("municipal", {}):
                pool["municipal"][district] = {"hosts": [], "names": [], "media": []}
            elif isinstance(pool["municipal"][district], list):
                # 구 형식 변환
                old = pool["municipal"][district]
                pool["municipal"][district] = {"hosts": [], "names": [m.get("name","") for m in old], "media": old}

            existing_muni = {m["name"] for m in pool["municipal"][district].get("media", [])}
            for m in medias:
                if m["name"] not in existing_muni:
                    pool["municipal"][district]["media"].append(m)
                    if m["name"] not in pool["municipal"][district].get("names", []):
                        pool["municipal"][district].setdefault("names", []).append(m["name"])
                    existing_muni.add(m["name"])
                    merged_muni += 1
                    if m.get("url"):
                        try:
                            from urllib.parse import urlparse
                            host = urlparse(m["url"]).hostname
                            if host:
                                host = host.replace("www.", "")
                                if host not in pool["municipal"][district].get("hosts", []):
                                    pool["municipal"][district].setdefault("hosts", []).append(host)
                        except Exception:
                            pass

    POOL_PATH.write_text(
        json.dumps(pool, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8"
    )
    print(f"media_pool.json 병합: 광역 +{merged_metro}, 시군구 +{merged_muni}")
    print("=" * 60)


if __name__ == "__main__":
    main()
