#!/usr/bin/env python3
"""
여심위(NESDC) 여론조사 크롤러
- 크롤링 결과를 data/polls/polls.json 형식으로 직접 저장
- 지역명, 선거종류 자동 추출
- 기존 polls.json에 병합 (중복 제거)

출력:
  - latest_polls.csv (기존 호환)
  - data/polls/polls.json (직접 병합)
"""
from __future__ import annotations

import json
import os
import re
import time
from datetime import date
from pathlib import Path
from typing import Dict, List, Optional
from urllib.parse import urljoin, urlparse, parse_qs, urlencode, urlunparse

import httpx
import pandas as pd
from bs4 import BeautifulSoup


BASE_LIST_URL = "https://www.nesdc.go.kr/portal/bbs/B0000005/list.do?menuNo=200467"
STATE_PATH = Path("data/nesdc_state.json")
OUTPUT_CSV = Path("latest_polls.csv")
POLLS_JSON = Path("data/polls/polls.json")
DEBUG_LIST_HTML = Path("data/nesdc_list_sample.html")
SOURCE_TEXT = "출처: 중앙선거여론조사심의위원회"
MAX_PAGES = 30

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6_0) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/121.0.0.0 Safari/537.36"
)

# ── 지역명 → regionKey 매핑 ──
REGION_MAP = {
    "서울특별시": "seoul", "서울": "seoul",
    "부산광역시": "busan", "부산": "busan",
    "대구광역시": "daegu", "대구": "daegu",
    "인천광역시": "incheon", "인천": "incheon",
    "광주광역시": "gwangju", "광주": "gwangju",
    "대전광역시": "daejeon", "대전": "daejeon",
    "울산광역시": "ulsan", "울산": "ulsan",
    "세종특별자치시": "sejong", "세종": "sejong",
    "경기도": "gyeonggi", "경기": "gyeonggi",
    "강원특별자치도": "gangwon", "강원도": "gangwon", "강원": "gangwon",
    "충청북도": "chungbuk", "충북": "chungbuk",
    "충청남도": "chungnam", "충남": "chungnam",
    "전북특별자치도": "jeonbuk", "전라북도": "jeonbuk", "전북": "jeonbuk",
    "전라남도": "jeonnam", "전남": "jeonnam",
    "경상북도": "gyeongbuk", "경북": "gyeongbuk",
    "경상남도": "gyeongnam", "경남": "gyeongnam",
    "제주특별자치도": "jeju", "제주": "jeju",
}

# ── 선거종류 추출 패턴 ──
ELECTION_TYPE_PATTERNS = [
    (r"광역단체장선거|시장선거|도지사선거|시도지사", "governor"),
    (r"기초단체장선거|구청장선거|군수선거|시장선거", "mayor"),
    (r"교육감선거", "superintendent"),
    (r"국회의원선거|재보궐", "byelection"),
    (r"정당지지도", "party_support"),
]


def extract_region_and_type(title: str):
    """제목에서 지역명과 선거종류 추출"""
    region_key = None
    municipality = None
    election_type = None

    # 지역 추출: "서울특별시 강남구" or "경기도 수원시" 패턴
    for region_name, rk in sorted(REGION_MAP.items(), key=lambda x: -len(x[0])):
        if region_name in title:
            region_key = rk
            # 시군구 추출
            after = title[title.find(region_name) + len(region_name):].strip()
            m = re.match(r'([가-힣]{2,5}(?:시|군|구))', after)
            if m:
                municipality = m.group(1)
            break

    # 선거종류 추출
    for pattern, etype in ELECTION_TYPE_PATTERNS:
        if re.search(pattern, title):
            # "기초단체장선거"와 "시장선거"가 겹칠 수 있으므로 구체적 패턴 우선
            if etype == "mayor" and election_type == "governor":
                election_type = "mayor"
            elif not election_type:
                election_type = etype

    # "전체" 지역 + "광역단체장" → governor
    if not election_type:
        election_type = "party_support"

    return region_key, municipality, election_type


def fetch_with_delay(client: httpx.Client, url: str) -> str:
    time.sleep(2)
    resp = client.get(url, timeout=30)
    resp.raise_for_status()
    return resp.text


def load_state() -> Dict[str, int]:
    if STATE_PATH.exists():
        try:
            data = json.loads(STATE_PATH.read_text(encoding="utf-8"))
            return {"last_id": int(data.get("last_id", 0))}
        except Exception:
            return {"last_id": 0}
    return {"last_id": 0}


def save_state(last_id: int) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(json.dumps({"last_id": last_id}, ensure_ascii=False, indent=2), encoding="utf-8")


def build_list_url(page_index: int) -> str:
    parsed = urlparse(BASE_LIST_URL)
    query = parse_qs(parsed.query)
    query["pageIndex"] = [str(page_index)]
    new_query = urlencode(query, doseq=True)
    return urlunparse(parsed._replace(query=new_query))


def parse_board_div(soup: BeautifulSoup) -> List[Dict[str, str]]:
    board = soup.find("div", class_="board")
    if not board:
        return []

    header_row = board.find("p", class_=re.compile(r"\bth\b"))
    headers = []
    if header_row:
        headers = [span.get_text(strip=True) for span in header_row.find_all("span", class_="col")]
    header_index = {h: i for i, h in enumerate(headers)}

    def find_header_index(keyword: str) -> Optional[int]:
        for h, i in header_index.items():
            if keyword in h:
                return i
        return None

    id_idx = find_header_index("등록번호")
    title_idx = find_header_index("여론조사")

    items = []
    for link in board.find_all("a", class_=re.compile(r"\btr\b")):
        cols = [span.get_text(" ", strip=True) for span in link.find_all("span", class_="col")]
        if not cols:
            continue
        title_text = cols[title_idx] if title_idx is not None and title_idx < len(cols) else ""
        id_text = cols[id_idx] if id_idx is not None and id_idx < len(cols) else ""
        if not id_text:
            id_text = re.sub(r"[^\d]", "", title_text)
        href = link.get("href", "")
        detail_url = urljoin(BASE_LIST_URL, href)
        items.append({"id": id_text, "title": title_text, "url": detail_url})
    return items


def find_target_table(soup: BeautifulSoup):
    tables = soup.find_all("table")
    for table in tables:
        headers = [th.get_text(strip=True) for th in table.find_all("th")]
        if any("등록번호" in h for h in headers) and any("여론조사" in h for h in headers):
            return table, headers
    if tables:
        return tables[0], [th.get_text(strip=True) for th in tables[0].find_all("th")]
    return None, []


def parse_list(html: str) -> List[Dict[str, str]]:
    soup = BeautifulSoup(html, "html.parser")
    board_items = parse_board_div(soup)
    if board_items:
        return board_items

    table, headers = find_target_table(soup)
    if not table:
        return []

    header_index = {h: i for i, h in enumerate(headers)}
    def find_header_index(keyword):
        for h, i in header_index.items():
            if keyword in h:
                return i
        return None

    id_idx = find_header_index("등록번호")
    title_idx = find_header_index("여론조사")
    rows = table.find_all("tr")
    items = []
    for row in rows:
        link = row.find("a", href=re.compile(r"view\.do"))
        if not link:
            continue
        tds = row.find_all(["td", "th"])
        if not tds:
            continue
        title_text = link.get_text(strip=True)
        if title_idx is not None and title_idx < len(tds):
            title_text = tds[title_idx].get_text(strip=True) or title_text
        id_text = None
        if id_idx is not None and id_idx < len(tds):
            id_text = tds[id_idx].get_text(strip=True)
        if not id_text:
            id_text = re.sub(r"[^\d]", "", title_text)
        href = link.get("href", "")
        detail_url = urljoin(BASE_LIST_URL, href)
        items.append({"id": id_text, "title": title_text, "url": detail_url})
    return items


def extract_label_map(soup: BeautifulSoup) -> Dict[str, str]:
    label_map = {}
    for table in soup.find_all("table"):
        for row in table.find_all("tr"):
            cells = row.find_all(["th", "td"])
            if len(cells) >= 2:
                label = cells[0].get_text(strip=True)
                value = cells[1].get_text(" ", strip=True)
                if label and value:
                    label_map[label] = value
    for dl in soup.find_all("dl"):
        dts = dl.find_all("dt")
        dds = dl.find_all("dd")
        for dt, dd in zip(dts, dds):
            label = dt.get_text(strip=True)
            value = dd.get_text(" ", strip=True)
            if label and value:
                label_map[label] = value
    return label_map


def clean_text(value):
    if value is None:
        return None
    cleaned = value.replace("\xa0", " ")
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned or None


def normalize_date_range(value):
    if not value:
        return None
    text = value.replace("\xa0", " ")
    dates = re.findall(r"\d{4}-\d{2}-\d{2}", text)
    times = re.findall(r"(\d{1,2})\s*시\s*(\d{1,2})\s*분", text)
    time_strs = [f"{int(h):02d}:{int(m):02d}" for h, m in times]
    if dates:
        start_date = dates[0]
        end_date = dates[1] if len(dates) >= 2 else None
        start_time = time_strs[0] if time_strs else None
        end_time = time_strs[1] if len(time_strs) >= 2 else None
        start = f"{start_date} {start_time}".strip() if start_time else start_date
        if end_date:
            end = f"{end_date} {end_time}".strip() if end_time else end_date
            return f"{start} ~ {end}"
        return start
    return clean_text(value)


def pick_value(label_map, candidates):
    for key in label_map.keys():
        for cand in candidates:
            if cand in key:
                return label_map[key]
    return None


def parse_detail(html: str) -> Dict[str, Optional[str]]:
    soup = BeautifulSoup(html, "html.parser")
    labels = extract_label_map(soup)
    return {
        "poll_org": clean_text(pick_value(labels, ["조사기관명", "조사기관"])),
        "client_org": clean_text(pick_value(labels, ["조사의뢰자", "의뢰기관"])),
        "date_range": normalize_date_range(pick_value(labels, ["조사일시", "조사 기간", "조사기간"])),
        "sample_size": clean_text(pick_value(labels, ["표본", "표본수", "접촉 후 응답완료 사례수"])),
    }


def parse_date_range_to_survey_date(date_range):
    """date_range 문자열을 surveyDate 객체로 변환"""
    if not date_range:
        return {}
    dates = re.findall(r"\d{4}-\d{2}-\d{2}", date_range)
    if len(dates) >= 2:
        return {"start": dates[0], "end": dates[1]}
    elif dates:
        return {"start": dates[0], "end": dates[0]}
    return {}


def parse_sample_size(value):
    """표본수 문자열에서 숫자 추출"""
    if not value:
        return 0
    numbers = re.findall(r"\d{3,6}", value.replace(",", ""))
    return int(numbers[0]) if numbers else 0


def merge_to_polls_json(new_polls):
    """신규 여론조사를 polls.json에 병합"""
    if not POLLS_JSON.exists():
        return 0

    polls = json.loads(POLLS_JSON.read_text(encoding="utf-8"))
    regions = polls.get("regions", {})

    # 기존 nttId 수집
    existing_ntt = set()
    for rps in regions.values():
        for p in rps:
            if p.get("nttId"):
                existing_ntt.add(p["nttId"])
    for p in polls.get("national", []):
        if p.get("nttId"):
            existing_ntt.add(p["nttId"])

    added = 0
    for np in new_polls:
        ntt_id = np.get("nttId")
        if not ntt_id or ntt_id in existing_ntt:
            continue

        rk = np.get("regionKey")
        if not rk:
            continue

        if rk not in regions:
            regions[rk] = []

        regions[rk].append(np)
        existing_ntt.add(ntt_id)
        added += 1

    if added > 0:
        polls["regions"] = regions
        polls["totalCount"] = sum(len(v) for v in regions.values())
        POLLS_JSON.write_text(
            json.dumps(polls, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8"
        )

    return added


def main() -> None:
    full_refresh = os.environ.get("FULL_REFRESH") == "1"
    state = load_state()
    last_id = 0 if full_refresh else state.get("last_id", 0)

    client = httpx.Client(headers={"User-Agent": USER_AGENT})

    new_items = []
    max_id = last_id

    page = 1
    while True:
        print(f"Fetching list page {page}...")
        list_url = build_list_url(page)
        html = fetch_with_delay(client, list_url)
        if page == 1:
            DEBUG_LIST_HTML.parent.mkdir(parents=True, exist_ok=True)
            DEBUG_LIST_HTML.write_text(html, encoding="utf-8")
        items = parse_list(html)
        if not items:
            break

        stop = False
        for item in items:
            try:
                item_id = int(re.sub(r"[^\d]", "", item["id"]) or "0")
            except ValueError:
                item_id = 0

            if item_id <= last_id:
                stop = True
                break

            detail_html = fetch_with_delay(client, item["url"])
            detail = parse_detail(detail_html)

            # 지역/선거종류 추출
            region_key, municipality, election_type = extract_region_and_type(item["title"])

            # nttId 추출 (URL에서)
            ntt_id = None
            m = re.search(r"nttId=(\d+)", item["url"])
            if m:
                ntt_id = int(m.group(1))

            record = {
                "id": item_id,
                "title": item["title"],
                "poll_org": detail["poll_org"],
                "client_org": detail["client_org"],
                "date_range": detail["date_range"],
                "sample_size": detail["sample_size"],
                "url": item["url"],
                "source": SOURCE_TEXT,
                "regionKey": region_key,
                "municipality": municipality,
                "electionType": election_type,
                "nttId": ntt_id,
            }
            new_items.append(record)
            if item_id > max_id:
                max_id = item_id

        if stop:
            break
        page += 1
        if page > MAX_PAGES:
            break

    client.close()

    if not new_items:
        print("No new items found.")
        return

    # CSV 저장 (기존 호환)
    df = pd.DataFrame(new_items).sort_values("id", ascending=False)
    df.to_csv(OUTPUT_CSV, index=False, encoding="utf-8-sig")
    print(f"Saved {len(df)} rows to {OUTPUT_CSV}")

    # polls.json 병합
    polls_records = []
    for rec in new_items:
        survey_date = parse_date_range_to_survey_date(rec["date_range"])
        sample_size = parse_sample_size(rec["sample_size"])

        polls_records.append({
            "nttId": rec["nttId"],
            "registrationId": str(rec["id"]),
            "pollName": rec["title"],
            "pollOrg": rec["poll_org"] or "",
            "clientOrg": rec["client_org"] or "",
            "method": {
                "type": "",
                "sampleSize": sample_size,
                "marginOfError": None,
            },
            "surveyDate": survey_date,
            "publishDate": survey_date.get("end", ""),
            "results": [],
            "regionKey": rec["regionKey"] or "",
            "electionType": rec["electionType"] or "",
            "municipality": rec["municipality"],
            "sourceUrl": rec["url"],
        })

    added = merge_to_polls_json(polls_records)
    print(f"Merged {added} new polls to {POLLS_JSON}")

    save_state(max_id)
    print(f"Total: {len(new_items)} scraped, {added} merged")


if __name__ == "__main__":
    main()
