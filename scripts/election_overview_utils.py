#!/usr/bin/env python3
"""
선거 개요 공통 유틸리티 모듈
- update_election_overview.py, update_mayor_overview.py 에서 공유
"""

import json
import os
import sys
import time
import html as _html
from datetime import datetime, date
from pathlib import Path

# ── 경로 상수 ──
BASE_DIR = Path(__file__).resolve().parent.parent
OVERVIEW_PATH = BASE_DIR / "data" / "election_overview.json"
CANDIDATES_PATH = BASE_DIR / "data" / "candidates" / "governor.json"
SUPERINTENDENT_PATH = BASE_DIR / "data" / "candidates" / "superintendent.json"
MAYOR_CANDIDATES_PATH = BASE_DIR / "data" / "candidates" / "mayor_candidates.json"
POLLS_PATH = BASE_DIR / "data" / "polls" / "polls.json"
MEDIA_REGISTRY_PATH = BASE_DIR / "data" / "local_media_registry.json"
OVERRIDES_PATH = BASE_DIR / "data" / "local_media_registry_overrides.json"
ENV_FILE = BASE_DIR / ".env"

# ── 설정 상수 ──
MODEL = os.environ.get("CLAUDE_MODEL", "claude-haiku-4-5-20251001")
API_KEY_ENV = "ANTHROPIC_API_KEY"

# 선거일은 data/static/election_meta.json 을 단일 출처(SSOT)로 사용.
# 파일이 없거나 파싱 실패 시 안전한 기본값(2026-06-03)으로 폴백.
def _load_election_date() -> date:
    meta_path = BASE_DIR / "data" / "static" / "election_meta.json"
    try:
        with meta_path.open(encoding="utf-8") as f:
            meta = json.load(f)
        return date.fromisoformat(meta["electionDate"])
    except (FileNotFoundError, json.JSONDecodeError, KeyError, ValueError):
        return date(2026, 6, 3)


ELECTION_DATE = _load_election_date()

REGION_NAMES = {
    "seoul": "서울특별시", "busan": "부산광역시", "daegu": "대구광역시",
    "incheon": "인천광역시", "gwangju": "광주광역시", "daejeon": "대전광역시",
    "ulsan": "울산광역시", "sejong": "세종특별자치시", "gyeonggi": "경기도",
    "gangwon": "강원특별자치도", "chungbuk": "충청북도", "chungnam": "충청남도",
    "jeonbuk": "전북특별자치도", "jeonnam": "전라남도", "gyeongbuk": "경상북도",
    "gyeongnam": "경상남도", "jeju": "제주특별자치도"
}


def load_env():
    """Load .env file if present"""
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, val = line.partition("=")
                os.environ.setdefault(key.strip(), val.strip().strip("'\""))


def search_latest_news(query, display=5):
    """네이버 뉴스 API로 최신 기사 검색"""
    import httpx

    client_id = os.environ.get("NAVER_CLIENT_ID", "")
    client_secret = os.environ.get("NAVER_CLIENT_SECRET", "")
    if not client_id or not client_secret:
        return []

    url = "https://openapi.naver.com/v1/search/news.json"
    headers = {
        "X-Naver-Client-Id": client_id,
        "X-Naver-Client-Secret": client_secret,
    }
    params = {"query": query, "display": display, "sort": "date"}

    try:
        resp = httpx.get(url, headers=headers, params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        results = []
        for item in data.get("items", []):
            title = item.get("title", "").replace("<b>", "").replace("</b>", "")
            title = _html.unescape(title)
            pub = item.get("pubDate", "")
            results.append(f"[{pub[:16]}] {title}")
        return results
    except Exception as e:
        print(f"  [뉴스검색 오류] {e}")
        return []


# ── 미디어 레지스트리 ──

_media_registry_cache = None
_overrides_cache = None


def load_media_registry():
    """지역 언론사 레지스트리 로드"""
    if not MEDIA_REGISTRY_PATH.exists():
        return {}
    return json.loads(MEDIA_REGISTRY_PATH.read_text(encoding="utf-8"))


def get_media_registry():
    global _media_registry_cache
    if _media_registry_cache is None:
        _media_registry_cache = load_media_registry()
    return _media_registry_cache


def load_overrides():
    """overrides.json 로더"""
    global _overrides_cache
    if _overrides_cache is None:
        if OVERRIDES_PATH.exists():
            _overrides_cache = json.loads(OVERRIDES_PATH.read_text(encoding="utf-8"))
        else:
            _overrides_cache = {}
    return _overrides_cache


def get_local_media_info(region_key, district=None):
    """지역 언론사 정보 반환 (호스트, 이름 목록) — registry만 사용"""
    reg = get_media_registry()
    region = reg.get("regions", {}).get(region_key, {})
    province = region.get("province", {})
    tier1 = province.get("hosts", {}).get("tier1", [])
    tier2 = province.get("hosts", {}).get("tier2", [])
    prov_names = [o["name"] for o in province.get("outlets", [])[:5]]

    if district:
        muni = region.get("municipalities", {}).get(district, {})
        muni_names = [o["name"] for o in muni.get("outlets", [])[:3]]
        muni_hosts = muni.get("hosts", {}).get("tier1", [])
        return {
            "names": list(dict.fromkeys(muni_names + prov_names))[:6],
            "hosts": list(dict.fromkeys(muni_hosts + tier1 + tier2))[:5],
        }

    return {"names": prov_names, "hosts": tier1 + tier2}


def get_local_media_info_merged(region_key, district=None):
    """registry + overrides 병합, hosts 최대 8개, outlet names 최대 8개 반환"""
    base = get_local_media_info(region_key, district)
    overrides = load_overrides()

    ov_region = overrides.get("regions", {}).get(region_key, {})
    ov_prov = ov_region.get("province", {})

    # overrides에서 province 수준 tier1/tier2 Hosts
    ov_tier1 = ov_prov.get("tier1Hosts", [])
    ov_tier2 = ov_prov.get("tier2Hosts", [])
    ov_promote = ov_prov.get("promoteNames", [])

    # municipality 수준 overrides
    ov_muni = {}
    if district:
        ov_muni = ov_region.get("municipalities", {}).get(district, {})

    muni_tier1 = ov_muni.get("tier1Hosts", [])
    muni_promote = ov_muni.get("promoteNames", [])
    muni_seeds = [o["name"] for o in ov_muni.get("seedOutlets", [])]

    # 병합: hosts — muni overrides > prov overrides > base
    all_hosts = list(dict.fromkeys(
        muni_tier1 + ov_tier1 + ov_tier2 + base.get("hosts", [])
    ))[:8]

    # 병합: names — muni promote/seeds > prov promote > base
    all_names = list(dict.fromkeys(
        muni_promote + muni_seeds + ov_promote + base.get("names", [])
    ))[:8]

    return {"names": all_names, "hosts": all_hosts}


# ── LLM 호출 ──

# ── Claude 호출 공통 인프라 ─────────────────────────────────────────────
# 목적:
#   - 전역 호출 카운터 (LLM_BUDGET_MAX_CALLS 로 상한)
#   - 재시도 범위 확장 (429 + 5xx + 연결 오류)
#   - 쿼터 완전 소진 시 silent-skip 대신 strict 모드에서 예외
#   - 20개 호출자 후방호환: 기본은 기존과 동일하게 ""/"[]" 반환

_llm_counter = {"count": 0, "failures": 0}


def get_llm_call_stats() -> dict:
    """현재 런의 LLM 호출 통계 (테스트/로깅용)."""
    return dict(_llm_counter)


def reset_llm_call_stats() -> None:
    _llm_counter["count"] = 0
    _llm_counter["failures"] = 0


def _llm_strict_mode() -> bool:
    return os.environ.get("LLM_STRICT_MODE", "").lower() in ("1", "true", "yes")


def _check_llm_budget() -> None:
    """LLM_BUDGET_MAX_CALLS 상한을 넘으면 즉시 예외."""
    raw = os.environ.get("LLM_BUDGET_MAX_CALLS")
    if not raw:
        return
    try:
        limit = int(raw)
    except ValueError:
        return
    if _llm_counter["count"] >= limit:
        raise RuntimeError(
            f"LLM budget exceeded: {_llm_counter['count']}/{limit} calls "
            f"(LLM_BUDGET_MAX_CALLS={raw})"
        )


def _is_transient_error(exc: Exception) -> bool:
    """재시도해도 좋은 일시적 오류인지 판정."""
    err = str(exc).lower()
    if "429" in err or "rate" in err:
        return True
    if "overloaded" in err or "timeout" in err or "timed out" in err:
        return True
    if "connection" in err or "reset" in err:
        return True
    # 5xx
    for code in ("500", "502", "503", "504", "529"):
        if code in err:
            return True
    return False


def call_llm(prompt, api_key, max_retries=5, max_tokens=1024, suffix="\n\nJSON만 출력하세요. 다른 텍스트 없이."):
    """Claude API 호출 (429 + 5xx 자동 재시도, 예산 상한 적용)."""
    import anthropic

    _check_llm_budget()
    client = anthropic.Anthropic(api_key=api_key)

    for attempt in range(max_retries):
        try:
            response = client.messages.create(
                model=MODEL,
                max_tokens=max_tokens,
                messages=[{"role": "user", "content": prompt + suffix}],
            )
            _llm_counter["count"] += 1
            return response.content[0].text if response.content else ""
        except anthropic.RateLimitError:
            wait = 30 * (attempt + 1)
            print(f"  [재시도] 쿼터 초과, {wait}초 대기 ({attempt+1}/{max_retries})")
            time.sleep(wait)
        except Exception as e:
            if _is_transient_error(e):
                wait = 30 * (attempt + 1)
                print(f"  [재시도] {type(e).__name__} {wait}초 대기 ({attempt+1}/{max_retries})")
                time.sleep(wait)
            else:
                _llm_counter["failures"] += 1
                raise

    _llm_counter["failures"] += 1
    msg = f"LLM call failed after {max_retries} retries (transient errors exhausted)"
    print(f"  [실패] {msg}")
    if _llm_strict_mode():
        raise RuntimeError(msg)
    return ""


def call_claude_json(prompt, api_key=None, max_retries=5, max_tokens=2048):
    """Claude API 호출 (JSON 응답 전용, 후보 파이프라인용).

    후방호환: 실패 시 기본적으로 "[]" 반환.
    LLM_STRICT_MODE=1 설정 시 최종 실패는 RuntimeError 로 승격.
    LLM_BUDGET_MAX_CALLS 설정 시 호출 상한 초과 즉시 RuntimeError.
    """
    import anthropic

    if api_key is None:
        api_key = os.environ.get(API_KEY_ENV, "")
    if not api_key:
        print(f"[오류] {API_KEY_ENV} 미설정")
        return "[]"

    _check_llm_budget()
    client = anthropic.Anthropic(api_key=api_key)
    json_suffix = "\n\nJSON만 출력하세요. 다른 텍스트 없이."

    for attempt in range(max_retries):
        try:
            response = client.messages.create(
                model=MODEL,
                max_tokens=max_tokens,
                messages=[{"role": "user", "content": prompt + json_suffix}],
            )
            _llm_counter["count"] += 1
            return response.content[0].text if response.content else "[]"
        except anthropic.RateLimitError:
            wait = 30 * (attempt + 1)
            print(f"    [재시도] 쿼터 초과, {wait}초 대기 ({attempt+1}/{max_retries})")
            time.sleep(wait)
        except Exception as e:
            if _is_transient_error(e):
                wait = 30 * (attempt + 1)
                print(f"    [재시도] {type(e).__name__} {wait}초 대기 ({attempt+1}/{max_retries})")
                time.sleep(wait)
            else:
                _llm_counter["failures"] += 1
                raise

    _llm_counter["failures"] += 1
    msg = f"call_claude_json failed after {max_retries} retries"
    print(f"    [실패] {msg}")
    if _llm_strict_mode():
        raise RuntimeError(msg)
    return "[]"


# ── 파싱/검증 ──

def parse_response(text):
    """LLM 응답을 JSON으로 파싱"""
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


def sanitize_overview(obj):
    """
    LLM 출력 텍스트 자동 정리:
    - 한글 사이 영문 깨짐 수정 (이개horrible → 이개호 등)
    - factcheck 필드 제거 (서비스에 불필요)
    """
    import re

    # 한글 사이에 끼어든 의미 없는 영문 패턴 제거
    GARBAGE_PATTERNS = re.compile(
        r'(?<=[가-힣])(horrible|AX|XX|xxx|undefined|null|NaN)(?=[가-힣\s,.])',
        re.IGNORECASE
    )

    for field in ['narrative', 'headline', 'summary', 'riskFactor']:
        text = obj.get(field, '')
        if isinstance(text, str) and text:
            cleaned = GARBAGE_PATTERNS.sub('', text)
            if cleaned != text:
                print(f"  [정리] {field}: 영문 깨짐 제거")
                obj[field] = cleaned

    if isinstance(obj.get('keyIssues'), list):
        obj['keyIssues'] = [
            GARBAGE_PATTERNS.sub('', item) if isinstance(item, str) else item
            for item in obj['keyIssues']
        ]

    # factcheck는 자가검증용이므로 저장 시 제거
    obj.pop('factcheck', None)

    return obj


def validate_overview(obj):
    """필수 필드 검증 — narrative 포함 시 유연하게"""
    obj = sanitize_overview(obj)
    if obj.get("narrative"):
        # narrative 모드: headline + narrative + trend만 필수
        return bool(obj.get("headline") and obj.get("trend"))
    # 레거시 모드
    required = ["regionName", "headline", "summary", "keyIssues", "riskFactor", "trend"]
    return all(obj.get(k) for k in required)


# ── 공통 프롬프트 빌더 (narrative 모드 v2) ──

def build_narrative_prompt(*, region_name, election_type_label, district=None,
                           candidates_text, polls_text, news_text,
                           prev_overview_text="", prev_election_text="",
                           media_text="", extra_context=""):
    """
    시빅 저널리즘 스타일 선거 개요 프롬프트 v2.
    - 할루시네이션 방지를 위한 구조적 개선
    - 사실 소스 규칙 최상단 배치 + factcheck 자가검증
    """
    days_until = (ELECTION_DATE - date.today()).days
    today_str = date.today().isoformat()

    target = f"{region_name} {district}" if district else region_name

    return f"""당신은 지역 정치를 깊이 이해하는 시빅 저널리스트입니다.
{target} {election_type_label} 선거 개요를 작성하세요.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 🚨 사실 소스 규칙 (최우선 — 이것을 어기면 전체 출력이 무효)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

당신이 사용할 수 있는 사실의 출처는 **아래 3가지뿐**입니다:
  ① "후보자 현황" 섹션
  ② "최신 여론조사" 섹션
  ③ "최신 뉴스" 섹션

**이 3개 섹션에 없는 사실은, 당신이 아무리 확신하더라도 "존재하지 않는 정보"입니다.**

금지 행위 (하나라도 위반 시 출력 무효):
- 학습 데이터에서 기억나는 지역 사실을 서술하는 것
- "~가 출범했다" "~가 확정됐다" "~가 통과됐다" 등 완료형을 뉴스 확인 없이 쓰는 것
- 뉴스에 없는 사건, 법안, 행정 조치, 통계 수치를 언급하는 것
- 지역 인구수, 예산, 투표율 등 수치를 데이터 없이 쓰는 것

### 위반 예시 (이런 문장을 쓰면 안 됩니다)
❌ "지난해 전라남도와 광주광역시가 통합특별시로 출범했다"
   → 뉴스 섹션에 이 사실이 없으므로 서술 금지
❌ "인천의 인구는 약 300만 명으로"
   → 데이터에 인구 수치가 없으므로 서술 금지
❌ "지난 선거에서 A후보가 52%를 득표했다"
   → 이전 선거 결과 데이터에 없으므로 서술 금지

### 준수 예시 (이렇게 써야 합니다)
✅ "GTX-B 1단계 착공을 앞두고 시장 후보들의 교통공약 경쟁이 붙었다"
   → 뉴스에서 확인 가능
✅ "유정복 시장은 청라의료복합단지 2027 개원을 약속했다"
   → 뉴스에서 확인 가능

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 기본 정보
- 지역: {target}
- 선거: {election_type_label}
- 오늘: {today_str}, 선거일: {ELECTION_DATE.isoformat()} (D-{days_until})
{f'- {media_text}' if media_text else ''}

## 후보자 현황
{candidates_text}

## 최신 여론조사
{polls_text if polls_text else '(데이터 없음)'}

## 최신 뉴스 (하나하나 읽고 {target} 관련만 활용할 것)
{news_text if news_text else '(데이터 없음)'}

## 이전 선거 결과
{prev_election_text if prev_election_text else '(데이터 없음)'}

## 이전 개요 (참고)
{prev_overview_text if prev_overview_text else '(없음)'}

{f"## 추가 맥락{chr(10)}{extra_context}" if extra_context else ""}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 작성 원칙
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### 절대 하지 말 것
- "이번 선거는 ~와 ~의 대결로 예상됩니다" 같은 스트레이트 기사 투
- "A후보는 ~를 공약으로, B후보는 ~를 공약으로 내세웠습니다" 식의 나열
- 모든 지역에 복붙 가능한 범용 문장
- "치열한 접전이 예상됩니다" "유권자의 선택에 관심이 쏠립니다" 같은 상투어
- "현직 재선 도전 vs 야당 도전" 같은 어디에나 맞는 headline
- 특정 후보에 유리한 뉘앙스
- **narrative 안에 여론조사 지지율 수치(%)를 넣지 말 것** — 여론조사는 별도 탭에서 보여주므로 개요에서는 "앞서고 있다" "경합 중이다" 수준으로만 언급. "홍길동(26.1%)" 같은 표현 금지.

### 반드시 할 것
- **그 지역 사람만 고개를 끄덕일 이야기**로 narrative를 시작할 것
- 이 선거가 **왜 이 지역에서 중요한지**를 생활 언어로 설명
- 후보자 나열이 아니라 **쟁점 중심** ("누가 나왔나"보다 "뭘 두고 싸우는가")
- **구체적 지명, 사업명, 생활 현안** 포함 — 단, 반드시 위 데이터에서 근거를 찾을 수 있어야 함
- 뉴스에서 발견한 구체적 사건/갈등/사업을 적극 활용

### 지역 배경 서술 범위
- 지역 배경/맥락은 **뉴스와 후보 데이터에서 유추 가능한 범위만** 서술
- "이 지역은 ~한 곳이다" 같은 배경 설명을 쓸 때, 위 데이터에서 근거가 있어야 함
  예) 뉴스에 "GTX-B 착공"이 있으면 → "수도권 교통 연결이 핵심 현안인 지역"은 OK
  예) 뉴스에 없는 "행정통합 출범" → 절대 금지
- 데이터에 없는 행정 변화, 법안 통과, 인구 통계, 정책 완료 사실은 **서술 금지**

### narrative 톤
- 차분하고 밀도 있게. 감정 과잉 없이.
- 분석은 하되 판단은 유보.
- 좋은 지역 매거진 기사의 톤.
- 분량 자유: 이슈가 복잡하면 길게(300자+), 단순하면 짧게(150자).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 출력 형식
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

JSON 객체 하나만 출력하세요. 다른 텍스트 없이.

{{
  "regionName": "{target}",
  "headline": "이 지역 선거의 핵심을 한 줄로. 25자 이내. 뻔한 구도 설명 금지.",
  "narrative": "시빅 저널리즘 스타일의 자유 형식 개요. 분량 자유. 위 원칙을 따를 것.",
  "keyIssues": ["뉴스/공약에서 가져온 구체적 쟁점들. 개수 자유(2~5개)."],
  "riskFactor": "판세를 바꿀 핵심 변수. 한 문장.",
  "trend": "여당 우세|야당 우세|여야 경합|다자 경합 중 택1",
  "factcheck": [
    "narrative에서 사실을 주장한 각 문장에 대해, 출처를 명시. 형식: 주장 → 출처(뉴스N/후보현황/여론조사)",
    "출처를 찾을 수 없는 주장이 있다면 narrative에서 삭제하고 여기에 '삭제됨: ...' 으로 기록"
  ]
}}

factcheck 배열은 서비스에 표시되지 않습니다. 순전히 당신의 자가검증용입니다.
narrative의 모든 사실 주장에 대해 빠짐없이 출처를 적으세요.
출처를 댈 수 없는 문장은 narrative에서 반드시 삭제하세요."""


def extract_facts(candidates, polls, election_type="governor"):
    """LLM 없이 구조화된 데이터에서 검증 가능한 팩트만 추출.

    이 함수가 반환하는 데이터는 LLM 해석이 아닌 원본 JSON 데이터의
    직접 추출값이므로 사실 여부를 역추적 가능하다.
    """
    PARTY_MAP = {
        "democratic": "더불어민주당", "ppp": "국민의힘",
        "reform": "조국혁신당", "newReform": "개혁신당", "newFuture": "새로운미래",
        "progressive": "진보당", "independent": "무소속",
        "justice": "정의당",
    }

    active = [c for c in (candidates or []) if c.get("status") != "WITHDRAWN"]
    top_candidates = []
    for c in active[:6]:
        entry = {
            "name": c.get("name", ""),
            "status": c.get("status", ""),
        }
        if election_type == "superintendent":
            entry["stance"] = c.get("stance", "")
        else:
            entry["party"] = PARTY_MAP.get(c.get("party", ""), c.get("party", ""))
        top_candidates.append(entry)

    latest_poll = None
    if polls:
        p = polls[0]
        latest_poll = {
            "date": p.get("publishDate", ""),
            "org": p.get("pollOrg", ""),
            "sampleSize": p.get("sampleSize") or (p.get("method") or {}).get("sampleSize"),
            "results": [
                {
                    "name": r.get("candidateName", r.get("name", "")),
                    "support": r.get("support", r.get("rate", "")),
                }
                for r in (p.get("results") or [])[:5]
                if r.get("candidateName") or r.get("name")
            ],
        }

    return {
        "candidateCount": len(active),
        "topCandidates": top_candidates,
        "pollCount": len(polls) if polls else 0,
        "latestPoll": latest_poll,
        "dataSource": "data/candidates + data/polls/state.json",
    }


def load_current_overview():
    """현재 overview 로드"""
    if not OVERVIEW_PATH.exists():
        return {"meta": {}, "regions": {}}
    return json.loads(OVERVIEW_PATH.read_text(encoding="utf-8"))
