#!/usr/bin/env python3
"""
재보궐 선거구 자동 감지 스크립트
- 선관위 API에서 현재 확정된 재보궐 선거구 목록 조회
- byelection.json과 비교하여 신규/삭제 감지
- 신규 선거구 자동 등록

사용법:
  python scripts/candidate_pipeline/detect_byelections.py           # 감지만
  python scripts/candidate_pipeline/detect_byelections.py --apply   # 실적용
"""

import argparse
import json
import os
import re
import sys
import time
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import date
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent
BYELECTION_PATH = BASE_DIR / "data" / "candidates" / "byelection.json"
ENV_FILE = BASE_DIR / ".env"

NEC_API_BASE = "http://apis.data.go.kr/9760000"
SG_ID = "20260603"  # 2026.06.03 선거
SG_TYPECODE = "2"   # 국회의원

REGION_MAP = {
    "서울특별시": "seoul", "부산광역시": "busan", "대구광역시": "daegu",
    "인천광역시": "incheon", "광주광역시": "gwangju", "대전광역시": "daejeon",
    "울산광역시": "ulsan", "세종특별자치시": "sejong", "경기도": "gyeonggi",
    "강원특별자치도": "gangwon", "강원도": "gangwon",
    "충청북도": "chungbuk", "충청남도": "chungnam",
    "전북특별자치도": "jeonbuk", "전라북도": "jeonbuk",
    "전라남도": "jeonnam", "경상북도": "gyeongbuk",
    "경상남도": "gyeongnam", "제주특별자치도": "jeju",
}


def load_env():
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                os.environ.setdefault(k.strip(), v.strip().strip("'\""))


def fetch_nec_byelection_districts(api_key):
    """선관위 API에서 재보궐 국회의원 선거구 목록 조회"""
    params = {
        "sgId": SG_ID,
        "sgTypecode": SG_TYPECODE,
        "numOfRows": "50",
        "pageNo": "1",
        "resultType": "xml",
    }
    qs = urllib.parse.urlencode(params)
    url = f"{NEC_API_BASE}/CommonCodeService/getCommonSggCodeList?serviceKey={urllib.parse.quote(api_key, safe='')}&{qs}"

    try:
        resp = urllib.request.urlopen(url, timeout=15)
        data = resp.read().decode("utf-8")
        root = ET.fromstring(data)
        items = list(root.iter("item"))

        districts = []
        for it in items:
            sd = it.findtext("sdName", "").strip()
            sgg = it.findtext("sggName", "").strip()
            region_key = REGION_MAP.get(sd, "")
            if not region_key or not sgg:
                continue

            # key 생성: region-district (예: incheon-gyeyang)
            # 선거구명에서 구/시/군 추출
            short = re.sub(r'[갑을병정]$', '', sgg)
            slug = short.replace("시", "").replace("구", "").replace("군", "")[:4]
            key = f"{region_key}-{slug.lower()}" if slug else f"{region_key}-{sgg[:3]}"

            # 좀 더 읽기 좋은 district 이름
            district_name = f"{sd.replace('특별시','').replace('광역시','').replace('특별자치도','').replace('도','')} {sgg}"

            districts.append({
                "key": key,
                "district": district_name,
                "sggName": sgg,
                "sdName": sd,
                "regionKey": region_key,
            })

        return districts
    except Exception as e:
        print(f"[오류] API 호출 실패: {e}")
        return []


def generate_key(region_key, sgg_name):
    """선거구명으로 고유 key 생성"""
    # "계양구을" → "gyeyang"
    clean = re.sub(r'[갑을병정]$', '', sgg_name)
    # 시군구 이름만 추출
    m = re.match(r'([가-힣]+[시군구])', clean)
    if m:
        name = m.group(1)
        return f"{region_key}-{name.replace('시','').replace('구','').replace('군','')}"
    return f"{region_key}-{clean[:3]}"


ELECTIONS = {
    17: '20040415', 18: '20080409', 19: '20120411',
    20: '20160413', 21: '20200415', 22: '20240410',
}

PARTY_NORM = {
    "더불어민주당": "democratic", "민주당": "democratic", "국민의힘": "ppp",
    "한나라당": "ppp", "새누리당": "ppp", "자유한국당": "ppp", "미래통합당": "ppp",
    "열린우리당": "democratic", "통합민주당": "democratic", "민주통합당": "democratic",
    "새정치민주연합": "democratic", "무소속": "independent", "자유선진당": "other",
}


def fetch_history_for_district(sd_name, sgg_hint, api_key):
    """선관위 API에서 17~22대 역대 당선인 조회"""
    history = []
    core = re.sub(r'[갑을병정]$', '', sgg_hint)
    core_short = core.replace("시", "").replace("구", "").replace("군", "")[:3]

    for gen, sg_id in sorted(ELECTIONS.items()):
        params = {
            "sgId": sg_id, "sgTypecode": "2", "sdName": sd_name,
            "numOfRows": "100", "pageNo": "1", "resultType": "xml",
        }
        qs = urllib.parse.urlencode(params)
        url = f"{NEC_API_BASE}/WinnerInfoInqireService2/getWinnerInfoInqire?serviceKey={urllib.parse.quote(api_key, safe='')}&{qs}"

        try:
            resp = urllib.request.urlopen(url, timeout=15)
            data = resp.read().decode("utf-8")
            root = ET.fromstring(data)
            items = list(root.iter("item"))
            matched = [it for it in items if core_short in it.findtext("sggName", "")]
            if not matched:
                matched = [it for it in items if core[:2] in it.findtext("sggName", "")]

            if matched:
                it = matched[0]
                party = it.findtext("jdName", "").strip()
                history.append({
                    "election": gen, "year": int(sg_id[:4]),
                    "winner": PARTY_NORM.get(party, "other"),
                    "winnerName": it.findtext("name", "").strip(),
                    "winnerParty": party,
                    "rate": float(it.findtext("dugyul", "0") or "0"),
                    "sggName": it.findtext("sggName", "").strip(),
                })
        except Exception:
            pass
        time.sleep(0.3)

    return history


def fetch_runners_with_gemini(district_name, history):
    """Gemini로 역대 차점자 수집"""
    llm_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not llm_key or not history:
        return

    try:
        import anthropic
    except ImportError:
        return

    entries = "\n".join(
        f"- {h['election']}대({h['year']}): {h.get('sggName','?')} 당선={h['winnerName']}({h['winnerParty']}) {h['rate']}%"
        for h in history
    )
    prompt = f"""한국 {district_name} 국회의원 선거 역대 2위(차점자)를 알려주세요.

{entries}

확실한 것만. 모르면 제외.
[{{"election":17,"runnerName":"이름","runnerParty":"정당명","runnerRate":42.1}}]"""

    client = genai.Client(api_key=llm_key)
    for attempt in range(3):
        try:
            response = client.models.generate_content(
                contents=[prompt],
                config=types.GenerateContentConfig(temperature=0, response_mime_type="application/json"),
            )
            raw = getattr(response, "text", "") or ""
            if raw.startswith("```"): raw = raw.split("\n", 1)[-1]
            if raw.endswith("```"): raw = raw[:-3]
            results = json.loads(raw.strip()) if raw.strip() else []

            runner_map = {r["election"]: r for r in results if r and r.get("runnerName")}
            for h in history:
                if h["election"] in runner_map and not h.get("runnerName"):
                    r = runner_map[h["election"]]
                    h["runnerName"] = r["runnerName"]
                    h["runnerParty"] = r.get("runnerParty", "")
                    h["runner"] = PARTY_NORM.get(r.get("runnerParty", ""), "other")
                    h["runnerRate"] = r.get("runnerRate", 0)
            return
        except Exception as e:
            if "429" in str(e) or "503" in str(e):
                time.sleep(60 * (attempt + 1))
            else:
                return


def main():
    parser = argparse.ArgumentParser(description="재보궐 선거구 자동 감지")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    load_env()
    api_key = os.environ.get("NEC_API_KEY", "")
    if not api_key:
        print("[오류] NEC_API_KEY 미설정")
        sys.exit(1)

    print("=" * 55)
    print("재보궐 선거구 자동 감지")
    print("=" * 55)

    # 선관위 API에서 현재 선거구 조회
    api_districts = fetch_nec_byelection_districts(api_key)
    print(f"\n선관위 API: {len(api_districts)}개 선거구")
    for d in api_districts:
        print(f"  {d['district']} ({d['sggName']})")

    # 현재 byelection.json
    bye = json.loads(BYELECTION_PATH.read_text(encoding="utf-8")) if BYELECTION_PATH.exists() else {"_meta": {}, "districts": {}}
    current_districts = bye.get("districts", {})
    print(f"\n현재 등록: {len(current_districts)}개")
    for k in current_districts:
        print(f"  {k}: {current_districts[k]['district']}")

    # 비교: API에 있는데 byelection.json에 없는 것 = 신규
    current_sgg = set()
    for d in current_districts.values():
        # sggName 매칭을 위해 district에서 추출
        current_sgg.add(d.get("district", ""))

    new_districts = []
    for d in api_districts:
        # 기존 등록 여부 확인 (선거구명으로 매칭)
        found = False
        for existing in current_districts.values():
            if d["sggName"] in existing.get("district", "") or d["district"] in existing.get("district", ""):
                found = True
                break
        if not found:
            new_districts.append(d)

    if not new_districts:
        print("\n신규 재보궐 선거구 없음")
    else:
        print(f"\n신규 발견: {len(new_districts)}개")
        for d in new_districts:
            key = generate_key(d["regionKey"], d["sggName"])
            print(f"  + {key}: {d['district']}")

            if args.apply:
                print(f"    역대 당선인 수집 중...")
                history = fetch_history_for_district(d["sdName"], d["sggName"], api_key)
                print(f"    → {len(history)}건 당선인")

                # Gemini로 차점자 수집
                if history:
                    print(f"    차점자 수집 중...")
                    fetch_runners_with_gemini(d["district"], history)
                    filled = sum(1 for h in history if h.get("runnerName"))
                    print(f"    → {filled}건 차점자")

                # prevElection: 가장 최근 선거
                latest = history[-1] if history else {}
                prev_election = {
                    "winner": latest.get("winner", "independent"),
                    "winnerName": latest.get("winnerName", "(확인 필요)"),
                    "rate": latest.get("rate", 0),
                    "runner": latest.get("runner", "independent"),
                    "runnerName": latest.get("runnerName", "(확인 필요)"),
                    "runnerRate": latest.get("runnerRate", 0),
                    "turnout": 0,
                }

                current_districts[key] = {
                    "district": d["district"],
                    "region": d["regionKey"],
                    "type": "국회의원 보궐",
                    "subType": "보궐선거",
                    "reason": "(사유 확인 필요)",
                    "previousMember": {
                        "name": latest.get("winnerName", "(확인 필요)"),
                        "party": latest.get("winner", "independent"),
                    },
                    "prevElection": prev_election,
                    "candidates": [],
                    "keyIssues": [],
                    "status": "확정",
                    "history": history,
                }

    # API에 없는데 byelection.json에 있는 것 = 삭제 후보
    api_sgg_names = {d["sggName"] for d in api_districts}
    removed = []
    for k, d in current_districts.items():
        found = False
        for api_d in api_districts:
            if api_d["sggName"] in d.get("district", "") or api_d["district"] in d.get("district", ""):
                found = True
                break
        if not found:
            removed.append((k, d["district"]))

    if removed:
        print(f"\nAPI에 없는 기존 등록 (확인 필요): {len(removed)}건")
        for k, name in removed:
            print(f"  ? {k}: {name}")

    # 기존 지역 중 history가 없는 곳 보강
    if args.apply:
        for k, d in current_districts.items():
            if d.get("history"):
                continue
            sd_short = d["district"].split(" ")[0]
            SD_MAP = {
                "인천": "인천광역시", "경기": "경기도", "충남": "충청남도",
                "전북": "전북특별자치도", "서울": "서울특별시", "부산": "부산광역시",
                "대구": "대구광역시", "광주": "광주광역시", "대전": "대전광역시",
                "울산": "울산광역시", "강원": "강원특별자치도",
                "충북": "충청북도", "전남": "전라남도",
                "경북": "경상북도", "경남": "경상남도", "제주": "제주특별자치도",
            }
            sd_full = SD_MAP.get(sd_short, sd_short)
            sgg_hint = d["district"].split(" ", 1)[-1] if " " in d["district"] else d["district"]

            print(f"\n[보강] {k}: 역대 데이터 수집...")
            history = fetch_history_for_district(sd_full, sgg_hint, api_key)
            if history:
                fetch_runners_with_gemini(d["district"], history)
                d["history"] = history
                print(f"    → {len(history)}건 (차점자 {sum(1 for h in history if h.get('runnerName'))}건)")

    if args.apply:
        bye["districts"] = current_districts
        bye["_meta"]["lastDetection"] = date.today().isoformat()
        bye["_meta"]["lastUpdated"] = date.today().isoformat()
        BYELECTION_PATH.write_text(
            json.dumps(bye, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8"
        )
        print(f"\n[저장] {BYELECTION_PATH}")

    print("\n완료")


if __name__ == "__main__":
    main()
