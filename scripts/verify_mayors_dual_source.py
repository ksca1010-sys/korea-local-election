#!/usr/bin/env python3
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import ssl
import subprocess
from pathlib import Path
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen

try:
    import certifi
except Exception:
    certifi = None


NAMK_URL = "https://www.namk.or.kr/state/member.php"
NAVER_URL = "https://openapi.naver.com/v1/search/news.json"

REGION_MAP = [
    ("서울", "seoul"),
    ("부산", "busan"),
    ("대구", "daegu"),
    ("인천", "incheon"),
    ("광주", "gwangju"),
    ("대전", "daejeon"),
    ("울산", "ulsan"),
    ("세종", "sejong"),
    ("경기도", "gyeonggi"),
    ("강원", "gangwon"),
    ("충청북도", "chungbuk"),
    ("충청남도", "chungnam"),
    ("전북", "jeonbuk"),
    ("전라남도", "jeonnam"),
    ("경상북도", "gyeongbuk"),
    ("경상남도", "gyeongnam"),
    ("제주", "jeju"),
]

PARTY_PATTERNS = {
    "democratic": [r"더불어민주당", r"\b민주당\b"],
    "ppp": [r"국민의힘"],
    "reform": [r"조국혁신당", r"\b혁신당\b"],
    "newReform": [r"개혁신당"],
    "progressive": [r"진보당"],
    "independent": [r"무소속"],
}

PARTY_CONTEXT_PATTERNS = [
    r"입당",
    r"복당",
    r"탈당",
    r"공천",
    r"재선거",
    r"보궐",
    r"지방선거",
    r"후보",
    r"정당",
    r"선거",
]

PARTY_LABEL = {
    "democratic": "더불어민주당",
    "ppp": "국민의힘",
    "reform": "조국혁신당",
    "newReform": "개혁신당",
    "progressive": "진보당",
    "independent": "무소속",
}


def strip_html(s: str) -> str:
    return re.sub(r"<[^>]+>", " ", s or "").replace("&quot;", '"').replace("&apos;", "'").strip()


def norm_region_key(region_text: str) -> str | None:
    for token, key in REGION_MAP:
        if token in region_text:
            return key
    return None


def load_local_mayors(data_js_path: Path) -> dict[tuple[str, str], dict[str, Any]]:
    node_script = f"""
const fs = require('fs');
const vm = require('vm');
const code = fs.readFileSync('{data_js_path.as_posix()}', 'utf8');
const sb = {{ console }};
vm.createContext(sb);
vm.runInContext(code + '\\nthis.__ED = ElectionData;', sb);
const ED = sb.__ED;
const result = {{}};
Object.keys(ED.subRegionData || {{}}).forEach((regionKey) => {{
  const rows = ED.getRegionMayorOfficeholders(regionKey);
  rows.forEach((row) => {{
    const district = row.districtName;
    const holder = row.officeholder || {{}};
    result[`${{regionKey}}|||${{district}}`] = {{
      regionKey,
      district,
      name: holder.name || null,
      party: holder.party || 'independent',
      since: holder.since || null,
      acting: !!holder.acting
    }};
  }});
}});
console.log(JSON.stringify(result));
"""
    proc = subprocess.run(
        ["node", "-e", node_script],
        check=True,
        capture_output=True,
        text=True,
    )
    data = json.loads(proc.stdout.strip())
    return {(v["regionKey"], v["district"]): v for v in data.values()}


def fetch_namk_members() -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    li_re = re.compile(
        r'<li class="list-con">[\s\S]*?<div>([^<]+)<span></span>([^<]+)</div>[\s\S]*?<p>([^<]+)</p>[\s\S]*?</li>'
    )
    ssl_ctx = ssl.create_default_context(cafile=certifi.where()) if certifi else ssl._create_unverified_context()
    for page in range(1, 13):
        html = urlopen(f"{NAMK_URL}?gsp_p={page}", timeout=25, context=ssl_ctx).read().decode("utf-8", errors="ignore")
        for m in li_re.finditer(html):
            region = (m.group(1) + m.group(2)).strip()
            text = m.group(3).strip()
            parts = re.split(r"\s+", text)
            if len(parts) < 2:
                continue
            district = " ".join(parts[:-1]).strip()
            holder = parts[-1].strip()
            region_key = norm_region_key(region)
            if not region_key:
                continue
            out.append(
                {
                    "region": region,
                    "regionKey": region_key,
                    "district": district,
                    "name": holder,
                    "acting": holder == "권한대행",
                }
            )
    return out


def fetch_naver_news(query: str, display: int = 30) -> list[dict[str, Any]]:
    client_id = os.environ.get("NAVER_CLIENT_ID")
    client_secret = os.environ.get("NAVER_CLIENT_SECRET")
    if not client_id or not client_secret:
        return []
    params = urlencode({"query": query, "display": max(10, min(display, 100)), "sort": "date"})
    req = Request(f"{NAVER_URL}?{params}")
    req.add_header("X-Naver-Client-Id", client_id)
    req.add_header("X-Naver-Client-Secret", client_secret)
    req.add_header("Accept", "application/json")
    ssl_ctx = ssl.create_default_context(cafile=certifi.where()) if certifi else ssl._create_unverified_context()
    with urlopen(req, timeout=25, context=ssl_ctx) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    return payload.get("items", []) or []


def parse_pub_date(s: str) -> dt.datetime | None:
    if not s:
        return None
    try:
        # Example: Thu, 05 Mar 2026 10:12:00 +0900
        return dt.datetime.strptime(s, "%a, %d %b %Y %H:%M:%S %z")
    except Exception:
        return None


def infer_party_from_news(region: str, district: str, holder_name: str, days: int) -> dict[str, Any]:
    if holder_name == "권한대행":
        return {"inferredParty": None, "confidence": 0.0, "mentions": 0, "query": None, "sample": []}

    role = "시장" if district.endswith("시") else ("군수" if district.endswith("군") else "구청장")
    query = f"{region} {district} {holder_name} {role}"
    items = fetch_naver_news(query, display=40)
    if not items:
        return {"inferredParty": None, "confidence": 0.0, "mentions": 0, "query": query, "sample": []}

    now = dt.datetime.now(dt.timezone.utc)
    cutoff = now - dt.timedelta(days=days)
    counts = {k: 0 for k in PARTY_PATTERNS.keys()}
    samples: list[str] = []

    for item in items:
        pub = parse_pub_date(item.get("pubDate", ""))
        if pub and pub < cutoff:
            continue
        title = strip_html(item.get("title", ""))
        desc = strip_html(item.get("description", ""))
        text = f"{title} {desc}"
        if holder_name not in title:
            continue
        if not any(re.search(pat, text) for pat in PARTY_CONTEXT_PATTERNS):
            continue
        if len(samples) < 3 and title:
            samples.append(title)
        for party, patterns in PARTY_PATTERNS.items():
            if any(re.search(pat, text) for pat in patterns):
                counts[party] += 1

    total = sum(counts.values())
    if total == 0:
        return {"inferredParty": None, "confidence": 0.0, "mentions": 0, "query": query, "sample": samples}
    best_party = max(counts.items(), key=lambda kv: kv[1])[0]
    confidence = counts[best_party] / total
    return {
        "inferredParty": best_party,
        "confidence": round(confidence, 3),
        "mentions": total,
        "query": query,
        "sample": samples,
        "counts": {k: v for k, v in counts.items() if v > 0},
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="기초단체장 2중 검증 (협의회 + 뉴스)")
    parser.add_argument("--days", type=int, default=365, help="뉴스 검증 기간(일)")
    parser.add_argument("--party-min-confidence", type=float, default=0.6, help="당적 추론 신뢰도 임계치")
    parser.add_argument("--party-min-mentions", type=int, default=2, help="당적 추론 최소 언급 수")
    parser.add_argument(
        "--party-scope",
        choices=["all", "independent", "acting", "unstable"],
        default="unstable",
        help="뉴스 당적 검증 대상 범위 (unstable: 무소속/권한대행만)",
    )
    parser.add_argument("--output-dir", default="reports", help="리포트 출력 폴더")
    parser.add_argument("--no-party", action="store_true", help="뉴스 기반 당적 검증 생략")
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[1]
    data_js = root / "js" / "data.js"
    output_dir = root / args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)

    local = load_local_mayors(data_js)
    namk_rows = fetch_namk_members()

    name_mismatches = []
    acting_mismatches = []
    party_flags = []

    for row in namk_rows:
        key = (row["regionKey"], row["district"])
        local_row = local.get(key)
        if not local_row:
            name_mismatches.append(
                {"regionKey": row["regionKey"], "district": row["district"], "siteName": row["name"], "localName": None}
            )
            continue
        if local_row["name"] != row["name"]:
            name_mismatches.append(
                {
                    "regionKey": row["regionKey"],
                    "district": row["district"],
                    "siteName": row["name"],
                    "localName": local_row["name"],
                }
            )
        if bool(local_row["acting"]) != bool(row["acting"]):
            acting_mismatches.append(
                {
                    "regionKey": row["regionKey"],
                    "district": row["district"],
                    "siteActing": row["acting"],
                    "localActing": bool(local_row["acting"]),
                    "siteName": row["name"],
                    "localName": local_row["name"],
                }
            )

        if args.no_party:
            continue
        local_party = local_row["party"]
        local_acting = bool(local_row["acting"])
        should_check_party = (
            args.party_scope == "all"
            or (args.party_scope == "independent" and local_party == "independent")
            or (args.party_scope == "acting" and local_acting)
            or (args.party_scope == "unstable" and (local_party == "independent" or local_acting))
        )
        if not should_check_party:
            continue

        info = infer_party_from_news(row["region"], row["district"], row["name"], args.days)
        if not info.get("inferredParty"):
            continue
        if info["confidence"] < args.party_min_confidence or info["mentions"] < args.party_min_mentions:
            continue
        if local_party != info["inferredParty"]:
            party_flags.append(
                {
                    "regionKey": row["regionKey"],
                    "district": row["district"],
                    "name": row["name"],
                    "localParty": local_party,
                    "inferredParty": info["inferredParty"],
                    "confidence": info["confidence"],
                    "mentions": info["mentions"],
                    "counts": info.get("counts", {}),
                    "query": info.get("query"),
                    "sample": info.get("sample", []),
                }
            )

    now = dt.datetime.now().strftime("%Y%m%d_%H%M%S")
    report = {
        "generatedAt": dt.datetime.now().isoformat(),
        "source": {
            "primary": "https://www.namk.or.kr/state/member.php",
            "secondary": "https://openapi.naver.com/v1/search/news.json",
        },
        "thresholds": {
            "days": args.days,
            "partyMinConfidence": args.party_min_confidence,
            "partyMinMentions": args.party_min_mentions,
        },
        "summary": {
            "namkRows": len(namk_rows),
            "localRows": len(local),
            "nameMismatches": len(name_mismatches),
            "actingMismatches": len(acting_mismatches),
            "partyFlags": len(party_flags),
        },
        "nameMismatches": name_mismatches,
        "actingMismatches": acting_mismatches,
        "partyFlags": party_flags,
    }

    json_path = output_dir / f"mayor_dual_verify_{now}.json"
    json_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    lines = [
        "# 기초단체장 2중 검증 리포트",
        f"- 생성시각: {report['generatedAt']}",
        f"- 협의회 수집 건수: {report['summary']['namkRows']}",
        f"- 로컬 데이터 건수: {report['summary']['localRows']}",
        f"- 이름 불일치: {report['summary']['nameMismatches']}",
        f"- 권한대행 불일치: {report['summary']['actingMismatches']}",
        f"- 당적 의심 플래그: {report['summary']['partyFlags']}",
        "",
        "## 이름 불일치",
    ]
    if not name_mismatches:
        lines.append("- 없음")
    else:
        for x in name_mismatches:
            lines.append(f"- {x['regionKey']} {x['district']}: site={x['siteName']} / local={x['localName']}")

    lines.extend(["", "## 권한대행 불일치"])
    if not acting_mismatches:
        lines.append("- 없음")
    else:
        for x in acting_mismatches:
            lines.append(
                f"- {x['regionKey']} {x['district']}: siteActing={x['siteActing']} / localActing={x['localActing']} (site={x['siteName']}, local={x['localName']})"
            )

    lines.extend(["", "## 당적 의심 플래그(뉴스 기반)"])
    if not party_flags:
        lines.append("- 없음")
    else:
        for x in party_flags:
            lines.append(
                f"- {x['regionKey']} {x['district']} {x['name']}: local={PARTY_LABEL.get(x['localParty'], x['localParty'])} / inferred={PARTY_LABEL.get(x['inferredParty'], x['inferredParty'])} (신뢰도 {x['confidence']}, 언급 {x['mentions']})"
            )

    md_path = output_dir / f"mayor_dual_verify_{now}.md"
    md_path.write_text("\n".join(lines), encoding="utf-8")

    print(f"[ok] json: {json_path}")
    print(f"[ok] md:   {md_path}")
    print(
        f"[summary] nameMismatch={len(name_mismatches)} actingMismatch={len(acting_mismatches)} partyFlags={len(party_flags)}"
    )


if __name__ == "__main__":
    main()
