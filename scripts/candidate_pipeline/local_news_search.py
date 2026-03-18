#!/usr/bin/env python3
"""
지역신문 우선 뉴스 검색 공통 모듈

모든 팩트체크 파이프라인(교육감, 기초단체장, 의원)에서 공통 사용.
local_media_pool 기반으로 지역신문을 우선 검색한다.
"""

import html as _html
import json
import os
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent

# local_media_pool import (Python 하드코딩 데이터)
sys.path.insert(0, str(BASE_DIR / "scripts"))
from local_media_pool import get_media_pool, get_media_list, get_media_text, METRO_MEDIA

# JSON 데이터 (보강된 hosts/names 포함)
POOL_JSON_PATH = BASE_DIR / "data" / "local_media_pool.json"
REGISTRY_PATH = BASE_DIR / "data" / "local_media_registry.json"
_registry_cache = None
_pool_json_cache = None


def _load_registry():
    global _registry_cache
    if _registry_cache is not None:
        return _registry_cache
    if REGISTRY_PATH.exists():
        _registry_cache = json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
    else:
        _registry_cache = {}
    return _registry_cache


def _load_pool_json():
    """local_media_pool.json 로드 (보강된 시군구 hosts/names)"""
    global _pool_json_cache
    if _pool_json_cache is not None:
        return _pool_json_cache
    if POOL_JSON_PATH.exists():
        _pool_json_cache = json.loads(POOL_JSON_PATH.read_text(encoding="utf-8"))
    else:
        _pool_json_cache = {}
    return _pool_json_cache


def get_local_media_names(region_key, district=None, max_count=8):
    """
    지역 신문사 이름 리스트 반환.
    1순위: local_media_pool.json (JSON, 보강 데이터)
    2순위: local_media_pool.py (Python 하드코딩)
    3순위: registry fallback
    모든 소스를 병합하여 반환.
    """
    result = []
    seen = set()

    def _add(names):
        for n in names:
            if n and n not in seen and n != '인터넷신문':
                seen.add(n)
                result.append(n)

    # 1순위: JSON 풀 (보강된 데이터)
    pool_json = _load_pool_json()
    if district:
        muni_data = pool_json.get("municipal", {}).get(district, {})
        _add(muni_data.get("names", []))

    # JSON metro 레벨
    from election_overview_utils import REGION_NAMES
    region_name = REGION_NAMES.get(region_key, "")
    if region_name:
        metro_data = pool_json.get("metro", {}).get(region_name, {})
        _add(metro_data.get("names", []))

    # 2순위: Python 하드코딩 풀
    if district:
        _add(get_media_list(district))
    if region_name:
        metro = METRO_MEDIA.get(region_name)
        if metro:
            _add([m["name"] for m in metro])

    # 3순위: registry fallback
    registry = _load_registry()
    province = registry.get("regions", {}).get(region_key, {}).get("province", {})
    _add(province.get("priorityNames", []))
    _add([o["name"] for o in province.get("outlets", [])])

    return result[:max_count]


def get_local_media_hosts(region_key, district=None):
    """지역 언론사 host 도메인 반환 (JSON 풀 + registry 병합)"""
    hosts = set()

    # JSON 풀에서 hosts
    pool_json = _load_pool_json()
    if district:
        muni_data = pool_json.get("municipal", {}).get(district, {})
        hosts.update(muni_data.get("hosts", []))

    from election_overview_utils import REGION_NAMES
    region_name = REGION_NAMES.get(region_key, "")
    if region_name:
        metro_data = pool_json.get("metro", {}).get(region_name, {})
        hosts.update(metro_data.get("hosts", []))

    # registry에서 hosts
    registry = _load_registry()
    province = registry.get("regions", {}).get(region_key, {}).get("province", {})
    prov_hosts = province.get("hosts", {})
    hosts.update(prov_hosts.get("tier1", []))
    hosts.update(prov_hosts.get("tier2", []))

    if district:
        munis = registry.get("regions", {}).get(region_key, {}).get("municipalities", {})
        muni_entry = munis.get(district, {})
        muni_hosts = muni_entry.get("hosts", {})
        hosts.update(muni_hosts.get("tier1", []))
        hosts.update(muni_hosts.get("tier2", []))

    return hosts


def search_naver_news(query, display=5):
    """네이버 뉴스 API 검색 (HTML 엔티티 디코딩 포함)"""
    import httpx

    client_id = os.environ.get("NAVER_CLIENT_ID", "")
    client_secret = os.environ.get("NAVER_CLIENT_SECRET", "")
    if not client_id or not client_secret:
        return []

    try:
        resp = httpx.get(
            "https://openapi.naver.com/v1/search/news.json",
            headers={
                "X-Naver-Client-Id": client_id,
                "X-Naver-Client-Secret": client_secret,
            },
            params={"query": query, "display": display, "sort": "date"},
            timeout=10,
        )
        resp.raise_for_status()
        results = []
        for item in resp.json().get("items", []):
            title = _html.unescape(
                item.get("title", "").replace("<b>", "").replace("</b>", "")
            )
            source = item.get("originallink", "") or item.get("link", "")
            results.append({"title": title, "source": source})
        return results
    except Exception:
        return []


def search_with_local_priority(region_key, queries, district=None, max_results=10):
    """
    지역신문 우선 뉴스 검색

    1단계: 일반 검색으로 모든 뉴스 수집
    2단계: 지역신문 이름 기반으로 기사를 상단으로 정렬
    3단계: 지역신문명으로 추가 검색

    Args:
        region_key: 시도 키 (seoul, gyeonggi 등)
        queries: 검색 쿼리 리스트
        district: 시군구명 (기초단체장용, optional)
        max_results: 최대 반환 건수
    """
    # 지역 언론사 이름 풀 (JSON + Python + registry 전체 병합)
    local_names = set(get_local_media_names(region_key, district, 15))

    # 지역 언론사 host 풀 (JSON + registry 전체 병합)
    local_hosts = get_local_media_hosts(region_key, district)

    all_items = []
    seen_titles = set()

    def _add(items):
        for item in items:
            if item["title"] not in seen_titles:
                seen_titles.add(item["title"])
                is_local = False
                source = item["source"].lower()
                if any(h in source for h in local_hosts):
                    is_local = True
                elif any(name in item["title"] for name in local_names):
                    is_local = True
                item["is_local"] = is_local
                all_items.append(item)

    # 1단계: 기본 쿼리
    for q in queries:
        _add(search_naver_news(q, display=10))

    # 2단계: 지역 언론사명으로 추가 검색 (상위 5개)
    target = district or ""
    top_local = list(local_names)[:5]
    for name in top_local:
        if target:
            _add(search_naver_news(f"{name} {target} 선거", display=5))
            _add(search_naver_news(f"{name} {target} 출마", display=5))
        else:
            from election_overview_utils import REGION_NAMES
            rn = REGION_NAMES.get(region_key, "")
            if rn:
                _add(search_naver_news(f"{name} {rn} 선거", display=5))

    # 지역신문 우선 정렬
    local_items = [i for i in all_items if i["is_local"]]
    other_items = [i for i in all_items if not i["is_local"]]

    result = local_items + other_items
    return [item["title"] for item in result[:max_results]]


def fetch_superintendent_news(region_key, region_name):
    """교육감 후보 팩트체크용 뉴스 검색 (지역신문 우선)"""
    queries = [
        f"{region_name} 교육감 선거 후보 출마",
        f"{region_name} 교육감 예비후보",
        f"{region_name} 교육감 공약",
        f"{region_name} 교육감 출판기념회",
    ]
    return search_with_local_priority(region_key, queries, max_results=12)


def fetch_mayor_news(region_key, region_name, district=None):
    """기초단체장 후보 팩트체크용 뉴스 검색 (지역신문 우선, 확장 쿼리)"""
    if district:
        title = "구청장" if district.endswith("구") else ("군수" if district.endswith("군") else "시장")
        queries = [
            f"{district}{title} 출마",
            f"{district}{title} 후보",
            f"{district}{title} 출판기념회",
            f"{district}{title} 예비후보",
            f"{district}{title} 공천",
            f"{district}{title} 선거",
            f"{district} 6.3 지방선거",
            f"{district} 기초단체장",
        ]
        return search_with_local_priority(region_key, queries, district=district, max_results=40)
    else:
        queries = [
            f"{region_name} 지방선거 구청장 군수 시장 출마 공천",
            f"{region_name} 기초단체장 선거 후보",
            f"{region_name} 지방선거 공천 경선",
            f"{region_name} 기초단체장 출판기념회",
            f"{region_name} 6.3 지방선거 예비후보",
        ]
        return search_with_local_priority(region_key, queries, max_results=25)


def fetch_council_news(region_key, region_name, council_type="council"):
    """광역의원/기초의원 후보 팩트체크용 뉴스 검색 (지역신문 우선)"""
    type_label = "광역의원" if council_type == "council" else "기초의원"
    type_short = "시도의원" if council_type == "council" else "기초의원"
    queries = [
        f"{region_name} {type_short} 공천 경선",
        f"{region_name} {type_label} 선거 후보",
    ]
    return search_with_local_priority(region_key, queries, max_results=10)
