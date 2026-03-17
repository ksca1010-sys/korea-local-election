#!/usr/bin/env python3
"""
여심위(NESDC) 여론조사 수집 파이프라인 v2

수집 대상: 제9회 전국동시지방선거 관련 등록 여론조사
수집 내용:
  1. 조사 메타데이터 (기관, 방법, 표본, 오차범위 등) — HTML 상세 페이지
  2. 후보별 지지율 — 첨부 PDF 결과표 파싱

출력: data/polls/polls.json (프론트엔드 직접 사용)
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import urljoin, urlparse, parse_qs, urlencode, urlunparse

import httpx
from bs4 import BeautifulSoup

# ── 경로 설정 ──
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data" / "polls"
STATE_PATH = DATA_DIR / "state.json"
OUTPUT_JSON = DATA_DIR / "polls.json"
PDF_DIR = DATA_DIR / "pdfs"

BASE_LIST_URL = "https://www.nesdc.go.kr/portal/bbs/B0000005/list.do?menuNo=200467"
BASE_DETAIL_URL = "https://www.nesdc.go.kr/portal/bbs/B0000005/view.do"

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6_0) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/121.0.0.0 Safari/537.36"
)

MAX_PAGES = 50
DELAY = 1  # seconds between requests

# ── 지역 매핑 ──
REGION_MAP = {
    "서울특별시": "seoul", "부산광역시": "busan", "대구광역시": "daegu",
    "인천광역시": "incheon", "광주광역시": "gwangju", "대전광역시": "daejeon",
    "울산광역시": "ulsan", "세종특별자치시": "sejong", "경기도": "gyeonggi",
    "강원특별자치도": "gangwon", "충청북도": "chungbuk", "충청남도": "chungnam",
    "전북특별자치도": "jeonbuk", "전라남도": "jeonnam", "경상북도": "gyeongbuk",
    "경상남도": "gyeongnam", "제주특별자치도": "jeju",
    # 약어
    "서울": "seoul", "부산": "busan", "대구": "daegu", "인천": "incheon",
    "광주": "gwangju", "대전": "daejeon", "울산": "ulsan", "세종": "sejong",
    "경기": "gyeonggi", "강원": "gangwon", "충북": "chungbuk", "충남": "chungnam",
    "전북": "jeonbuk", "전남": "jeonnam", "경북": "gyeongbuk", "경남": "gyeongnam",
    "제주": "jeju",
}

# 정당 매핑
PARTY_MAP = {
    "더불어민주당": "democratic", "민주당": "democratic",
    "국민의힘": "ppp",
    "조국혁신당": "reform",
    "개혁신당": "newReform",
    "새로운미래": "newReform",
    "진보당": "progressive",
    "무소속": "independent",
}

# 선거 유형 매핑
ELECTION_TYPE_MAP = {
    "광역단체장": "mayor",  # 시도지사
    "기초단체장": "district_mayor",  # 시군구장
    "교육감": "superintendent",
}


def fetch(client: httpx.Client, url: str, delay: float = DELAY) -> str:
    """HTTP GET with delay and retry."""
    time.sleep(delay)
    for attempt in range(3):
        try:
            resp = client.get(url, timeout=30, follow_redirects=True)
            resp.raise_for_status()
            return resp.text
        except (httpx.HTTPError, httpx.TimeoutException) as e:
            if attempt < 2:
                print(f"  Retry {attempt+1} for {url}: {e}")
                time.sleep(5)
            else:
                raise


def fetch_bytes(client: httpx.Client, url: str, delay: float = DELAY) -> bytes:
    """HTTP GET returning bytes (for PDF)."""
    time.sleep(delay)
    for attempt in range(3):
        try:
            resp = client.get(url, timeout=60, follow_redirects=True)
            resp.raise_for_status()
            return resp.content
        except (httpx.HTTPError, httpx.TimeoutException) as e:
            if attempt < 2:
                time.sleep(5)
            else:
                raise


# ── State management ──

def load_state() -> Dict[str, Any]:
    if STATE_PATH.exists():
        try:
            return json.loads(STATE_PATH.read_text("utf-8"))
        except Exception:
            pass
    return {"last_id": 0, "polls": []}


def save_state(state: Dict[str, Any]) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=2), "utf-8")


# ── List page parsing ──

def build_list_url(page_index: int) -> str:
    parsed = urlparse(BASE_LIST_URL)
    query = parse_qs(parsed.query)
    query["pageIndex"] = [str(page_index)]
    new_query = urlencode(query, doseq=True)
    return urlunparse(parsed._replace(query=new_query))


def parse_list_page(html: str) -> List[Dict[str, str]]:
    """Parse list page, extract poll items with nttId.

    Column order (from HTML header):
      0: 등록번호, 1: 조사기관명, 2: 조사의뢰자, 3: 조사방법,
      4: 표본추출틀, 5: 여론조사 명칭(지역), 6: 등록일, 7: 시·도
    """
    soup = BeautifulSoup(html, "html.parser")
    items = []

    # div.board with a.tr (or a.row.tr) links
    board = soup.find("div", class_="board")
    if board:
        # Parse header to find column indices
        header_row = board.find("p", class_=re.compile(r"\bth\b"))
        col_names = []
        if header_row:
            col_names = [span.get_text(strip=True) for span in header_row.find_all("span", class_="col")]

        # Find title column index (여론조사 명칭)
        title_idx = None
        reg_idx = None
        reg_date_idx = None
        region_idx = None
        org_idx = None
        method_idx = None
        for i, name in enumerate(col_names):
            if "명칭" in name or "여론조사" in name:
                title_idx = i
            elif "등록번호" in name:
                reg_idx = i
            elif "등록일" in name:
                reg_date_idx = i
            elif "시·도" in name or "시도" in name:
                region_idx = i
            elif "조사기관" in name:
                org_idx = i
            elif "조사방법" in name:
                method_idx = i

        for link in board.find_all("a", class_=re.compile(r"\btr\b|\brow\b")):
            cols = [span.get_text(" ", strip=True) for span in link.find_all("span", class_="col")]
            href = link.get("href", "")
            ntt_match = re.search(r"nttId=(\d+)", href)
            if not ntt_match:
                continue
            ntt_id = int(ntt_match.group(1))

            reg_id = cols[reg_idx].strip() if reg_idx is not None and reg_idx < len(cols) else ""
            reg_date = cols[reg_date_idx].strip() if reg_date_idx is not None and reg_date_idx < len(cols) else ""
            title = cols[title_idx].strip() if title_idx is not None and title_idx < len(cols) else ""
            region = cols[region_idx].strip() if region_idx is not None and region_idx < len(cols) else ""
            org = cols[org_idx].strip() if org_idx is not None and org_idx < len(cols) else ""
            method = cols[method_idx].strip() if method_idx is not None and method_idx < len(cols) else ""

            # If title column is empty, construct from available columns
            if not title:
                title = " ".join(c for c in cols if len(c) > 5)

            detail_url = urljoin(BASE_LIST_URL, href)
            items.append({
                "ntt_id": ntt_id,
                "reg_id": reg_id,
                "reg_date": reg_date,
                "title": title,
                "region": region,
                "org": org,
                "method": method,
                "url": detail_url,
            })
        return items

    # Fallback: table-based
    for table in soup.find_all("table"):
        for row in table.find_all("tr"):
            link = row.find("a", href=re.compile(r"view\.do"))
            if not link:
                continue
            href = link.get("href", "")
            ntt_match = re.search(r"nttId=(\d+)", href)
            if not ntt_match:
                continue
            items.append({
                "ntt_id": int(ntt_match.group(1)),
                "reg_id": "",
                "reg_date": "",
                "title": link.get_text(strip=True),
                "region": "",
                "org": "",
                "method": "",
                "url": urljoin(BASE_LIST_URL, href),
            })

    return items


def collect_list_items(client: Optional[httpx.Client], max_pages: int = MAX_PAGES,
                       list_html_dir: Optional[Path] = None) -> List[Dict[str, str]]:
    """Collect parsed list items from NESDC list pages or cached HTML files."""
    items: List[Dict[str, str]] = []

    for page in range(1, max_pages + 1):
        if list_html_dir:
            html_path = list_html_dir / f"page-{page}.html"
            if not html_path.exists():
                if page == 1:
                    print(f"  No cached list page found: {html_path}")
                break
            html = html_path.read_text("utf-8")
        else:
            if client is None:
                raise ValueError("client is required when list_html_dir is not set")
            print(f"\n📄 List page {page}...")
            html = fetch(client, build_list_url(page))

        page_items = parse_list_page(html)
        if not page_items:
            break
        items.extend(page_items)

    return items


def merge_registration_metadata(polls: List[Dict[str, Any]],
                                list_items: List[Dict[str, str]]) -> Dict[str, int]:
    """Merge registration ID/date from list page items into existing polls."""
    polls_by_ntt = {int(p.get("nttId", 0)): p for p in polls if p.get("nttId")}
    matched = 0
    updated_polls = 0
    registration_id_updated = 0
    registration_date_updated = 0
    touched: set[int] = set()

    for item in list_items:
        ntt_id = int(item.get("ntt_id", 0) or 0)
        if not ntt_id or ntt_id not in polls_by_ntt:
            continue
        matched += 1
        poll = polls_by_ntt[ntt_id]
        poll_changed = False

        reg_id = (item.get("reg_id") or "").strip()
        reg_date = (item.get("reg_date") or "").strip()

        if reg_id and reg_id != (poll.get("registrationId") or "").strip():
            poll["registrationId"] = reg_id
            poll_changed = True
            registration_id_updated += 1

        if reg_date and reg_date != (poll.get("registrationDate") or "").strip():
            poll["registrationDate"] = reg_date
            poll_changed = True
            registration_date_updated += 1

        if poll_changed and ntt_id not in touched:
            updated_polls += 1
            touched.add(ntt_id)

    return {
        "matched": matched,
        "updatedPolls": updated_polls,
        "registrationIdUpdated": registration_id_updated,
        "registrationDateUpdated": registration_date_updated,
    }


# ── Detail page parsing ──

def extract_labels(soup: BeautifulSoup) -> Dict[str, str]:
    """Extract all label-value pairs from detail page tables and dl/dt/dd."""
    labels = {}

    for table in soup.find_all("table"):
        for row in table.find_all("tr"):
            cells = row.find_all(["th", "td"])
            if len(cells) >= 2:
                label = cells[0].get_text(strip=True)
                value = cells[1].get_text(" ", strip=True)
                if label and value:
                    labels[label] = value
            # Handle 4-cell rows (label, value, label, value)
            if len(cells) >= 4:
                label2 = cells[2].get_text(strip=True)
                value2 = cells[3].get_text(" ", strip=True)
                if label2 and value2:
                    labels[label2] = value2

    for dl in soup.find_all("dl"):
        for dt, dd in zip(dl.find_all("dt"), dl.find_all("dd")):
            label = dt.get_text(strip=True)
            value = dd.get_text(" ", strip=True)
            if label and value:
                labels[label] = value

    return labels


def find_label(labels: Dict[str, str], keywords: List[str]) -> Optional[str]:
    """Find value by matching keywords in label keys."""
    for key, val in labels.items():
        for kw in keywords:
            if kw in key:
                return val.replace("\xa0", " ").strip()
    return None


def parse_region_from_title(title: str) -> Dict[str, Optional[str]]:
    """Extract region and municipality from poll title."""
    title = title.strip()

    # Pattern: "서울특별시 마포구 기초단체장선거..."
    # Pattern: "경기도 전체 광역단체장선거..."
    # Pattern: "전국 정기(정례)조사..."

    region_key = None
    municipality = None
    election_type = None

    # Check for region names
    for region_name, key in sorted(REGION_MAP.items(), key=lambda x: -len(x[0])):
        if region_name in title:
            region_key = key
            # Extract municipality (시군구) after region name
            after = title.split(region_name, 1)[1].strip()
            # Remove "전체" marker
            if after.startswith("전체"):
                after = after[2:].strip()
            # Extract municipality name (before election type keyword)
            muni_match = re.match(r"^([가-힣]{2,8}(?:시|군|구))\s", after)
            if muni_match:
                municipality = muni_match.group(1)
            break

    # Check election type
    for type_name, type_key in ELECTION_TYPE_MAP.items():
        if type_name in title:
            election_type = type_key
            break

    return {
        "regionKey": region_key,
        "municipality": municipality,
        "electionType": election_type,
    }


def parse_date_range(value: Optional[str]) -> Dict[str, Optional[str]]:
    """Parse date range string into start/end dates."""
    if not value:
        return {"start": None, "end": None}

    dates = re.findall(r"\d{4}-\d{2}-\d{2}", value)
    if len(dates) >= 2:
        return {"start": dates[0], "end": dates[1]}
    elif len(dates) == 1:
        return {"start": dates[0], "end": dates[0]}
    return {"start": None, "end": None}


def parse_sample_size(value: Optional[str]) -> Optional[int]:
    """Extract numeric sample size."""
    if not value:
        return None
    # Find numbers like 1003, 500 etc. (comma-separated numbers too)
    nums = re.findall(r"[\d,]+", value.replace(",", ""))
    for n in nums:
        try:
            val = int(n.replace(",", ""))
            if 100 <= val <= 100000:
                return val
        except ValueError:
            pass
    return None


def parse_margin_of_error(value: Optional[str]) -> Optional[float]:
    """Extract margin of error (±N.N%p).

    Must distinguish from confidence level (95%) which appears in the same cell.
    Pattern: "95% 신뢰수준에 ±3.7%P"
    """
    if not value:
        return None
    # Look for ± pattern specifically
    match = re.search(r"[±]\s*(\d+\.?\d*)\s*%", value)
    if match:
        return float(match.group(1))
    # "오차범위 N.N%p" pattern
    match = re.search(r"오차.*?(\d+\.?\d*)\s*%", value)
    if match:
        val = float(match.group(1))
        if val < 20:  # Margin of error is always small, not 95%
            return val
    return None


def parse_response_rate(value: Optional[str]) -> Optional[float]:
    """Extract response rate (%)."""
    if not value:
        return None
    match = re.search(r"(\d+\.?\d*)\s*%", value)
    if match:
        return float(match.group(1))
    return None


def classify_method(value: Optional[str]) -> str:
    """Classify survey method: ARS / 전화면접 / 혼합."""
    if not value:
        return "unknown"
    v = value.lower()
    has_ars = "ars" in v or "자동응답" in v
    has_interview = "면접" in v or "인터뷰" in v
    if has_ars and has_interview:
        return "혼합"
    if has_ars:
        return "ARS"
    if has_interview:
        return "전화면접"
    return "unknown"


def find_pdf_links(soup: BeautifulSoup) -> List[Dict[str, str]]:
    """Find attached PDF/file download links on detail page.

    NESDC uses encrypted JS view() calls:
      onclick="javascript:view('atchFileId', 'fileSn', 'bbsId', 'bbsKey')"
    Download URL: /portal/cmm/fms/FileDown.do?atchFileId=...&fileSn=...&bbsId=...&bbsKey=...
    """
    pdf_links = []

    for link in soup.find_all("a"):
        onclick = link.get("onclick", "")
        text = link.get_text(strip=True)

        # JS view() pattern
        view_match = re.search(
            r"view\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*\)",
            onclick
        )
        if view_match:
            atch_file_id, file_sn, bbs_id, bbs_key = view_match.groups()
            download_url = (
                f"https://www.nesdc.go.kr/portal/cmm/fms/FileDown.do"
                f"?atchFileId={atch_file_id}&fileSn={file_sn}"
                f"&bbsId={bbs_id}&bbsKey={bbs_key}"
            )
            pdf_links.append({"url": download_url, "text": text, "type": "download"})
            continue

        # Regular href-based links
        href = link.get("href", "")
        if any(kw in href.lower() for kw in ["filedown", "download", ".pdf"]):
            pdf_links.append({"url": urljoin(BASE_DETAIL_URL, href), "text": text, "type": "href"})

    return pdf_links


def extract_sample_size_from_span(soup: BeautifulSoup) -> Optional[int]:
    """Extract total sample size from span#sampleSexSizeSum."""
    span = soup.find("span", id="sampleSexSizeSum")
    if span:
        text = span.get_text(strip=True).replace(",", "")
        try:
            return int(text)
        except ValueError:
            pass
    return None


def extract_margin_from_html(soup: BeautifulSoup) -> Optional[float]:
    """Extract margin of error from HTML table cells.

    Pattern: <th>표본오차</th><td>95% 신뢰수준에 ±3.7%P</td>
    """
    for th in soup.find_all("th"):
        if "표본오차" in th.get_text(strip=True):
            td = th.find_next_sibling("td")
            if not td:
                # Try next row's td
                tr = th.find_parent("tr")
                if tr:
                    next_tr = tr.find_next_sibling("tr")
                    if next_tr:
                        td = next_tr.find("td")
            if td:
                text = td.get_text(strip=True)
                match = re.search(r"[±]\s*(\d+\.?\d*)\s*%", text)
                if match:
                    return float(match.group(1))
    return None


def extract_survey_dates_from_html(soup: BeautifulSoup) -> Dict[str, Optional[str]]:
    """Extract survey date range from HTML table."""
    for th in soup.find_all("th"):
        th_text = th.get_text(strip=True)
        if "조사기간" in th_text or "조사일시" in th_text:
            td = th.find_next_sibling("td")
            if td:
                return parse_date_range(td.get_text(" ", strip=True))
    return {"start": None, "end": None}


def parse_detail_page(html: str, ntt_id: int) -> Dict[str, Any]:
    """Parse poll detail page for all available metadata."""
    soup = BeautifulSoup(html, "html.parser")
    labels = extract_labels(soup)

    # 기본 정보
    poll_org = find_label(labels, ["조사기관명", "조사기관"])
    client_org = find_label(labels, ["조사의뢰자", "의뢰기관", "의뢰자"])
    poll_name = find_label(labels, ["여론조사명", "조사명", "명칭"])

    # 조사 방법
    method_text = find_label(labels, ["조사방법", "조사 방법"])
    sampling_frame = find_label(labels, ["표본추출틀", "추출틀", "전화번호유형"])
    weighting = find_label(labels, ["가중값", "가중치", "림가중"])

    # 조사 기간: labels 기반 + HTML 직접 탐색
    date_text = find_label(labels, ["조사일시", "조사 기간", "조사기간"])
    dates = parse_date_range(date_text)
    if not dates["start"]:
        dates = extract_survey_dates_from_html(soup)

    # 공표일
    publish_text = find_label(labels, ["최초 공표", "공표일시", "공표일"])

    # 표본크기: span#sampleSexSizeSum 우선, fallback to labels
    sample_size = extract_sample_size_from_span(soup)
    if not sample_size:
        sample_text = find_label(labels, ["표본", "표본수", "응답완료"])
        sample_size = parse_sample_size(sample_text)

    # 오차: HTML table 직접 탐색 우선
    margin = extract_margin_from_html(soup)
    if margin is None:
        error_text = find_label(labels, ["표본오차", "오차범위"])
        margin = parse_margin_of_error(error_text)

    # 응답률/접촉률
    contact_rate = find_label(labels, ["전체 접촉률", "접촉률"])
    response_rate = find_label(labels, ["전체 응답률", "응답률", "협조율"])

    # 등록번호
    reg_id = find_label(labels, ["등록번호"])

    # 첨부파일 링크
    pdf_links = find_pdf_links(soup)

    result = {
        "nttId": ntt_id,
        "registrationId": reg_id,
        "pollName": poll_name,
        "pollOrg": poll_org,
        "clientOrg": client_org,
        "method": {
            "type": classify_method(method_text),
            "raw": method_text,
            "samplingFrame": sampling_frame,
            "sampleSize": sample_size,
            "marginOfError": margin,
            "responseRate": parse_response_rate(response_rate),
            "contactRate": parse_response_rate(contact_rate),
            "weightingMethod": weighting,
        },
        "surveyDate": dates,
        "publishDate": publish_text,
        "attachments": pdf_links,
        # 후보별 지지율: PDF 파싱 후 채움
        "results": [],
    }

    return result


# ── PDF 다운로드 & 파싱 ──

def download_pdf(client: httpx.Client, url: str, save_path: Path) -> bool:
    """Download PDF file."""
    try:
        content = fetch_bytes(client, url, delay=1)
        if len(content) < 500:
            return False
        save_path.parent.mkdir(parents=True, exist_ok=True)
        save_path.write_bytes(content)
        return True
    except Exception as e:
        print(f"  PDF download failed: {e}")
        return False


def parse_pdf_results(pdf_path: Path) -> List[Dict[str, Any]]:
    """Parse candidate support data from PDF.

    여심위 PDF 형식:
    - 설문지-only (1-2페이지): 결과 없음 → 빈 배열
    - 결과 보고서 (5+페이지): 교차분석표에 후보명 헤더 + 합계 행
      예) "N. XX시장 적합도" 섹션
          헤더:  구분 | 완료 | 김OO | 이OO | 박OO | 기타 | 모름
          합계:  합계 | 501  | 30.9%| 18.2%| 8.4% | 2.2% | 3.6%

    Returns list of {candidateName, party, support} dicts.
    """
    try:
        import pdfplumber
    except ImportError:
        print("  ⚠ pdfplumber not installed. Run: pip install pdfplumber")
        return []

    try:
        with pdfplumber.open(pdf_path) as pdf:
            # 설문지-only 스킵 (2페이지 이하)
            if len(pdf.pages) <= 2:
                return []

            results = _extract_table_results(pdf)
            if results:
                return results

            all_text = ""
            for page in pdf.pages:
                all_text += (page.extract_text() or "") + "\n"

            # Strategy 1: 교차분석표 파싱 (적합도/지지도 섹션)
            results = _extract_crosstab(all_text)
            if results:
                return results

            # Strategy 2: "이름(정당) N%" 패턴
            results = _extract_inline_pattern(all_text)
            if results:
                return results

    except Exception as e:
        print(f"  PDF parse error: {e}")

    return []


# 무효 이름 (교차분석표 행 라벨로 나오는 것들)
_INVALID_NAMES = {
    "합계", "남성", "여성", "남자", "여자", "성별", "연령", "지역", "전체", "전 체",
    "사례수", "구분", "조사", "가중값", "가중치", "완료", "적용",
    "지역1", "지역2", "지역3", "지역4",
    "찬성", "반대", "모름", "기타", "없음", "없다",
    "다른", "인물", "모르겠", "잘", "배율", "보수", "중도", "진보",
    "후보", "기타후보", "잘모르겠다", "적합한", "경북교육감",
}


def _extract_table_results(pdf) -> List[Dict[str, Any]]:
    for page in pdf.pages:
        try:
            tables = page.extract_tables() or []
        except Exception:
            continue
        header_names: List[str] = []
        for table in tables:
            current_header_names = _extract_table_header_names(table)
            if len(current_header_names) >= 2:
                header_names = current_header_names
            results = _parse_pdf_table(table, header_names)
            if results:
                return results
            results = _parse_inline_table(table)
            if results:
                return results
    return []


def _extract_table_header_names(table: List[List[Optional[str]]]) -> List[str]:
    if not table or len(table) < 2:
        return []

    rows = [[re.sub(r"\s+", " ", str(cell or "")).strip() for cell in row] for row in table]
    header_names: List[str] = []
    for row in rows[:4]:
        for cell in row:
            if not cell:
                continue
            if len(cell) > 120 or re.search(r"[\d()%]", cell):
                continue
            token_source = cell
            if len(cell) > 20 and re.search(r"(현|전|대표|위원장|총장|교육장|의장|의원|시장|군수)", cell):
                token_source = cell.split()[0]
            for token in re.findall(r"[가-힣]{2,5}", token_source):
                if token in _INVALID_NAMES:
                    continue
                if re.match(
                    r"^(만\d|이외|이상|적합|모름|없음|없다|가중|조사|완료|적용|사례|단위|기타|구분|인물|선생|께서|누가|보기|호명|순환|로테|다음|출마|예상|선거|생각|차기|내년|실질|발전|미래|이끌|가장|표본|오차|충청|경상|전라|경기|강원|제주|서울|부산|대구|인천|광주|대전|울산|세종|특별|광역|도지사|시장|군수|교육감|잘못|아주|대체|다소|정당|신뢰|수준|단체장|국정|현안|정치|성향|권역|조사완료)$",
                    token,
                ):
                    continue
                if token not in header_names:
                    header_names.append(token)

    return header_names


def _parse_pdf_table(table: List[List[Optional[str]]], fallback_header_names: Optional[List[str]] = None) -> List[Dict[str, Any]]:
    if not table or len(table) < 2:
        return []

    rows = [[re.sub(r"\s+", " ", str(cell or "")).strip() for cell in row] for row in table]
    total_row: Optional[List[str]] = None

    for row in rows:
        label = " ".join(cell for cell in row[:2] if cell).strip()
        if re.search(r"^(합계|전체|전\s*체)$", label):
            total_row = row
            break

    if not total_row:
        return []

    header_names = _extract_table_header_names(table)
    if len(header_names) < 2 and fallback_header_names:
        header_names = list(fallback_header_names)

    if len(header_names) < 2:
        return []

    percentages: List[float] = []
    for cell in total_row:
        if not cell:
            continue
        cleaned = cell.replace("%", "").replace(",", "").strip()
        for match in re.findall(r"\d{1,2}\.\d{1,2}", cleaned):
            percentages.append(float(match))

    if len(percentages) < 2:
        return []

    results = []
    for name, pct in zip(header_names, percentages):
        if 0.5 <= pct <= 85:
            results.append({
                "candidateName": name,
                "party": _normalize_party(""),
                "support": pct,
            })

    return results if len(results) >= 2 else []


def _parse_inline_table(table: List[List[Optional[str]]]) -> List[Dict[str, Any]]:
    if not table:
        return []

    results = []
    for row in table:
        text = " ".join(re.sub(r"\s+", " ", str(cell or "")).strip() for cell in row if cell).strip()
        if not text:
            continue
        if re.search(r"(합계|퍼센트|지지도|적합도|잘\s*모르|무응답)", text):
            continue
        match = re.match(r"^([가-힣]{2,5})\s+(\d{1,2}\.\d{1,2})$", text)
        if not match:
            continue
        name, pct = match.groups()
        if name in _INVALID_NAMES:
            continue
        pct_val = float(pct)
        if 0.5 <= pct_val <= 85:
            results.append({
                "candidateName": name,
                "party": _normalize_party(""),
                "support": pct_val,
            })

    return results if len(results) >= 2 else []


def _extract_crosstab(text: str) -> List[Dict[str, Any]]:
    """여심위 PDF 교차분석표에서 후보별 지지율 추출.

    패턴: "N. XXX 적합도" 또는 "N. XXX 지지도" 섹션에서
    후보 이름 헤더 + "합계" 행의 퍼센트 값을 매칭.
    """
    # 적합도/지지율 질문 섹션 찾기
    sections = re.split(r"\n\d+\.\s*", text)

    # 전체 텍스트를 줄 단위로 처리
    lines = text.split("\n")

    # 1) "N. XXX 적합도" 섹션 기반 파싱
    for section in sections:
        first_line = section.split("\n")[0].strip()
        # 정당지지도 제외, 후보 적합도/지지도만
        if not re.search(r"적합도|후보.*지지도|후보.*선호|선호.*후보", first_line):
            continue
        if re.search(r"정당\s*지지도|정당지지|대통령|국정", first_line):
            continue

        result = _parse_crosstab_section(section.split("\n"))
        if result:
            return result

    # 2) "표 N XXX 적합도" 페이지 기반 파싱 (페이지 제목 형식)
    for i, line in enumerate(lines):
        line_stripped = line.strip()
        if re.match(r"^표\s*\d+\s+.*적합도", line_stripped):
            if re.search(r"정당|대통령|국정", line_stripped):
                continue
            # 이 줄부터 아래 30줄을 섹션으로 파싱
            result = _parse_crosstab_section(lines[i:i+30])
            if result:
                return result

    return []


def _parse_crosstab_section(lines: List[str]) -> List[Dict[str, Any]]:
    """교차분석표 섹션에서 후보 이름(헤더) + 합계 행(지지율)을 추출.

    여심위 PDF 교차분석표 구조:
      구분 완료 김OO 이OO 박OO 이외 없음 모름 적용
      인물
      사례수                                     사례수
      합계 501 30.9% 18.2% 8.4% 14.0% ...
    또는:
      완료 신용한 노영민 김영환 송기섭 ... 적용
      사례수                                사례수
      전 체 (1002) 22.1 16.4 14.9 7.5 ...
    """
    candidates = []
    total_row = None

    # 1) 후보 이름 헤더 행 찾기
    # 조건: "구분", "완료", "사례수" 등 테이블 키워드가 같은 줄에 있어야 함
    header_idx = -1
    for i, line in enumerate(lines):
        stripped = line.strip()
        # 교차분석 테이블 헤더 줄 판별: 구분/완료/사례수 키워드 포함
        if not re.search(r"구분|완료|사례수", stripped):
            continue
        names = re.findall(r"[가-힣]{2,4}", stripped)
        korean_names = [
            n for n in names
            if n not in _INVALID_NAMES
            and not re.match(
                r"^(만\d|이외|이상|적합|모름|없음|가중|조사|완료|적용|사례|단위|기타|구분|인물|선생|께서|누가|보기|호명|순환|로테|다음|출마|예상|선거|생각|차기|내년|실질|발전|미래|이끌|가장|표본|오차|충청|경상|전라|경기|강원|제주|서울|부산|대구|인천|광주|대전|울산|세종|특별|광역|도지사|시장|군수|교육감|잘못|아주|대체|다소|정당|신뢰|수준|단체장|국정|현안)",
                n,
            )
            and len(n) >= 2
        ]
        if len(korean_names) >= 3:
            candidates = korean_names
            header_idx = i
            break

    if not candidates:
        return []

    # 2) 헤더 이후에서 "합계"/"전 체"/"■ 전 체 ■" 행 찾기
    for i in range(header_idx + 1, min(header_idx + 6, len(lines))):
        stripped = lines[i].strip()
        if re.match(r"^(합계|전\s*체|■\s*전\s*체\s*■)", stripped):
            total_row = stripped
            break

    if not total_row:
        return []

    # 3) 합계 행에서 소수점 숫자 추출
    pcts = re.findall(r"(\d{1,2}\.\d)%?", total_row)
    if not pcts:
        return []

    # 4) 후보 이름 + 지지율 매칭
    results = []
    for idx, name in enumerate(candidates):
        if idx >= len(pcts):
            break
        pct = float(pcts[idx])
        if 0.5 <= pct <= 85:
            results.append({
                "candidateName": name,
                "party": _normalize_party(""),
                "support": pct,
            })

    return results if len(results) >= 2 else []


def _extract_inline_pattern(text: str) -> List[Dict[str, Any]]:
    """텍스트에서 "이름(정당) N%" 인라인 패턴 추출."""
    results = []

    # "홍길동(더불어민주당) 45.2%" 또는 "홍길동 (국민의힘) 38.1%"
    pattern = re.compile(
        r"([가-힣]{2,4})\s*\(\s*([가-힣]+(?:당|소속)?)\s*\)\s*[:\s]*(\d{1,2}\.?\d?)\s*%",
    )
    for match in pattern.finditer(text):
        name, party, pct = match.groups()
        pct_val = float(pct)
        if 0.5 <= pct_val <= 85:
            results.append({
                "candidateName": name,
                "party": _normalize_party(party),
                "support": pct_val,
            })

    return results


def _normalize_party(text: str) -> str:
    """Normalize party name to standard key."""
    text = text.strip()
    for name, key in PARTY_MAP.items():
        if name in text:
            return key
    return text  # Return raw if no match


# ── 메인 수집 로직 ──

def is_local_election_poll(title: str) -> bool:
    """Check if this poll is related to local elections (지방선거)."""
    keywords = ["광역단체장", "기초단체장", "교육감", "지방선거", "시도지사",
                 "시장", "군수", "구청장"]
    return any(kw in title for kw in keywords)


def collect_polls(full_refresh: bool = False, max_pages: int = MAX_PAGES,
                  skip_pdf: bool = False) -> List[Dict[str, Any]]:
    """Main collection: scrape list → detail pages → PDF parsing."""
    state = load_state()
    last_ntt_id = 0 if full_refresh else state.get("last_id", 0)
    existing_polls = [] if full_refresh else state.get("polls", [])
    existing_ntt_ids = {p["nttId"] for p in existing_polls}

    client = httpx.Client(headers={"User-Agent": USER_AGENT})
    new_polls = []
    max_ntt_id = last_ntt_id

    try:
        stop = False
        list_items = collect_list_items(client, max_pages=max_pages)
        if not list_items:
            print("  No items found, stopping.")
            return existing_polls

        for item in list_items:
            ntt_id = item["ntt_id"]

            # Skip already collected
            if ntt_id in existing_ntt_ids:
                continue

            # Stop if we've reached previously collected data
            if ntt_id <= last_ntt_id and not full_refresh:
                stop = True
                break

            title = item["title"]
            list_region = item.get("region", "")
            list_org = item.get("org", "")
            list_method = item.get("method", "")
            print(f"  → [{ntt_id}] {title[:60]}  ({list_region})")

            # Filter: only local election polls (and national party support)
            is_local = is_local_election_poll(title)
            is_national_party = "정당지지도" in title and ("전국" in title or "정기" in title)

            if not is_local and not is_national_party:
                print("    ⏭ Skip (not local election)")
                if ntt_id > max_ntt_id:
                    max_ntt_id = ntt_id
                continue

            # Fetch detail page
            detail_html = fetch(client, item["url"])
            poll = parse_detail_page(detail_html, ntt_id)

            # Parse title for region/election info
            region_info = parse_region_from_title(title)
            poll["regionKey"] = region_info["regionKey"]
            poll["municipality"] = region_info["municipality"]
            poll["electionType"] = region_info["electionType"]
            poll["title"] = title
            poll["sourceUrl"] = item["url"]
            poll["registrationDate"] = item.get("reg_date") or poll.get("registrationDate") or None
            # List-level metadata as fallback
            if not poll["pollOrg"] and list_org:
                poll["pollOrg"] = list_org
            if not poll["method"]["type"] or poll["method"]["type"] == "unknown":
                poll["method"]["type"] = classify_method(list_method)

            # Try PDF download & parse for support rates
            if not skip_pdf and poll["attachments"]:
                for att in poll["attachments"]:
                    pdf_path = PDF_DIR / f"{ntt_id}.pdf"
                    if download_pdf(client, att["url"], pdf_path):
                        results = parse_pdf_results(pdf_path)
                        if results:
                            poll["results"] = results
                            print(f"    ✅ {len(results)} candidates from PDF")
                            break
                    else:
                        print(f"    ⚠ PDF download failed: {att['text']}")

            # Clean up attachments (don't store in final JSON)
            del poll["attachments"]

            new_polls.append(poll)
            if ntt_id > max_ntt_id:
                max_ntt_id = ntt_id
    finally:
        client.close()

    # Merge with existing
    all_polls = existing_polls + new_polls
    all_polls.sort(key=lambda p: p.get("nttId", 0), reverse=True)

    # Save state
    save_state({"last_id": max_ntt_id, "polls": all_polls})

    # Export frontend JSON
    export_frontend_json(all_polls)

    print(f"\n✅ Done: {len(new_polls)} new, {len(all_polls)} total")
    return all_polls


def backfill_registration_metadata(max_pages: int = MAX_PAGES,
                                   list_html_dir: Optional[Path] = None) -> Dict[str, int]:
    """Backfill registration ID/date for existing polls from list pages only."""
    state = load_state()
    polls = state.get("polls", [])
    if not polls:
        print("No existing polls in state.json")
        return {
            "matched": 0,
            "updatedPolls": 0,
            "registrationIdUpdated": 0,
            "registrationDateUpdated": 0,
        }

    client = None
    try:
        if list_html_dir is None:
            client = httpx.Client(headers={"User-Agent": USER_AGENT})
        list_items = collect_list_items(client, max_pages=max_pages, list_html_dir=list_html_dir)
    finally:
        if client is not None:
            client.close()

    stats = merge_registration_metadata(polls, list_items)
    if stats["updatedPolls"] > 0:
        save_state({
            "last_id": state.get("last_id", 0),
            "polls": polls,
        })
        export_frontend_json(polls)

    print(
        "✅ Registration metadata backfill:"
        f" matched={stats['matched']}"
        f" updatedPolls={stats['updatedPolls']}"
        f" registrationIdUpdated={stats['registrationIdUpdated']}"
        f" registrationDateUpdated={stats['registrationDateUpdated']}"
    )
    return stats


def export_frontend_json(polls: List[Dict[str, Any]]) -> None:
    """Export polls as JSON for frontend consumption."""
    OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)

    # Group by region for easier frontend access
    by_region: Dict[str, List] = {}
    national = []

    for poll in polls:
        region = poll.get("regionKey")
        if not region:
            national.append(poll)
            continue

        if region not in by_region:
            by_region[region] = []
        by_region[region].append(poll)

    output = {
        "generated": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "totalCount": len(polls),
        "source": "중앙선거여론조사심의위원회 (nesdc.go.kr)",
        "national": national,
        "regions": by_region,
    }

    OUTPUT_JSON.write_text(
        json.dumps(output, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )
    print(f"📊 Exported {OUTPUT_JSON} ({len(polls)} polls)")


# ── CLI ──

def main():
    import argparse
    parser = argparse.ArgumentParser(description="여심위 여론조사 수집 파이프라인")
    parser.add_argument("--full", action="store_true", help="전체 재수집 (기존 데이터 무시)")
    parser.add_argument("--pages", type=int, default=MAX_PAGES, help=f"최대 페이지 수 (기본: {MAX_PAGES})")
    parser.add_argument("--skip-pdf", action="store_true", help="PDF 다운로드/파싱 건너뛰기 (메타데이터만)")
    parser.add_argument("--export-only", action="store_true", help="수집 없이 기존 데이터만 JSON 출력")
    parser.add_argument(
        "--backfill-registration-meta",
        action="store_true",
        help="기존 state.json에 등록번호/등록일만 백필",
    )
    parser.add_argument(
        "--list-html-dir",
        type=Path,
        help="NESDC 목록 HTML 캐시 디렉터리 (page-1.html 형식)",
    )
    args = parser.parse_args()

    if args.export_only:
        state = load_state()
        polls = state.get("polls", [])
        if polls:
            export_frontend_json(polls)
        else:
            print("No existing data to export.")
        return

    if args.backfill_registration_meta:
        backfill_registration_metadata(
            max_pages=args.pages,
            list_html_dir=args.list_html_dir,
        )
        return

    collect_polls(
        full_refresh=args.full,
        max_pages=args.pages,
        skip_pdf=args.skip_pdf,
    )


if __name__ == "__main__":
    main()
