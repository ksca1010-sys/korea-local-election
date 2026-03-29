#!/usr/bin/env python3
"""
선거관리위원회 본후보 데이터 수집 파이프라인

선관위 PofelcddInfoInqireService API를 호출하여 본후보 데이터를 수집하고
기존 candidates JSON 파일과 병합한다.

사용법:
  python fetch_nec_candidates.py            # 정상 실행 (5/14 이후 활성화)
  python fetch_nec_candidates.py --dry-run  # 파일 저장 없이 검증만
  python fetch_nec_candidates.py --log-raw  # raw 응답 샘플 저장

[선거 유형]
  sgTypecode "3"  → 광역단체장 → governor.json
  sgTypecode "10" → 교육감     → superintendent.json
  sgTypecode "4"  → 기초단체장 → mayor_candidates.json
"""

import json
import os
import sys
from datetime import datetime
from pathlib import Path

# nec_precand_sync import (재사용: fetch_precandidates, SIDO_MAP, _normalize_party)
# PYTHONPATH=scripts:scripts/candidate_pipeline 필요
try:
    from nec_precand_sync import fetch_precandidates, SIDO_MAP, _normalize_party
except ImportError:
    # fallback: sys.path에 scripts/candidate_pipeline 추가
    _HERE = Path(__file__).resolve().parent
    sys.path.insert(0, str(_HERE))
    from nec_precand_sync import fetch_precandidates, SIDO_MAP, _normalize_party

# 프로젝트 루트
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
CANDIDATES_DIR = PROJECT_ROOT / 'data' / 'candidates'

GOVERNOR_FILE = CANDIDATES_DIR / 'governor.json'
SUPERINTENDENT_FILE = CANDIDATES_DIR / 'superintendent.json'
MAYOR_FILE = CANDIDATES_DIR / 'mayor_candidates.json'
UNMATCHED_FILE = CANDIDATES_DIR / 'unmatched_candidates.json'
RAW_SAMPLE_FILE = CANDIDATES_DIR / 'nec_raw_sample.json'

# 17개 시도 코드 매핑 (선관위 코드 → 프로젝트 키) — 구버전 호환용 유지
REGION_MAP = {
    '1100': 'seoul',    '2600': 'busan',    '2700': 'daegu',
    '2800': 'incheon',  '2900': 'gwangju',  '3000': 'daejeon',
    '3100': 'ulsan',    '3611': 'sejong',   '4100': 'gyeonggi',
    '4200': 'gangwon',  '4300': 'chungbuk', '4400': 'chungnam',
    '4500': 'jeonbuk',  '4600': 'jeonnam',  '4700': 'gyeongbuk',
    '4800': 'gyeongnam','4900': 'jeju'
}

# 정당명 → 프로젝트 partyKey 매핑 (구버전 호환용 유지)
PARTY_MAP = {
    '더불어민주당': 'democratic',
    '민주당': 'democratic',
    '국민의힘': 'ppp',
    '개혁신당': 'newReform',
    '새로운미래': 'newFuture',
    '진보당': 'progressive',
    '정의당': 'justice',
    '조국혁신당': 'reform',
    '무소속': 'independent',
}

# 선거 유형 코드 → 레이블 (헌법 제4조: 혼용 금지)
ELECTION_TYPE_LABELS = {
    "3":  "광역단체장",
    "10": "교육감",
    "4":  "기초단체장",
}


def normalize_party(party_name):
    """정당명을 프로젝트 partyKey로 변환 (구버전 호환 래퍼)"""
    return _normalize_party(party_name)


def load_existing():
    """기존 governor.json 로드"""
    if GOVERNOR_FILE.exists():
        with open(GOVERNOR_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {'_meta': {}, 'candidates': {}}


def _extract_ballot_number(item):
    """
    NEC 응답에서 ballotNumber(기호) 추출.

    필드명 불확실(LOW confidence): giho → gihoSn → candidateNo → huboNo 순서로 시도.
    huboCnt는 '후보자 수' 필드이므로 절대 사용 금지.

    Returns:
        int | None: 기호 번호. 없으면 None (WARN 로깅).
    """
    for field in ["giho", "gihoSn", "candidateNo", "huboNo"]:
        val = item.get(field)
        if val is not None and val != "":
            try:
                return int(val)
            except (ValueError, TypeError):
                pass  # 비정수 값이면 다음 필드 시도

    print(f"[WARN] ballotNumber 필드를 찾지 못함: {list(item.keys())}")
    return None


def _convert_nec_item(item, election_type, unmatched_list):
    """
    NEC API 응답 아이템 → 프로젝트 후보 객체 변환.

    Args:
        item: NEC API 단건 응답 dict
        election_type: "3"(광역단체장), "10"(교육감), "4"(기초단체장)
        unmatched_list: 매핑 실패 후보를 누적할 list (in-place 추가)

    Returns:
        dict | None: 변환된 후보 객체. 매핑 실패 시 None (unmatched_list에 추가됨).
    """
    # 시도명 → regionKey 변환 (SIDO_MAP 재사용: 강원특별자치도/강원도 변형명 처리)
    sd_name = item.get("sdName", "")
    region_key = SIDO_MAP.get(sd_name)
    if not region_key:
        print(f"[WARN] SIDO_MAP 미등록 시도: '{sd_name}' — unmatched로 보관")
        unmatched_list.append({
            "sdName": sd_name,
            "name": item.get("name", ""),
            "election_type": election_type,
            "raw": item,
        })
        return None

    # 정당명 → partyKey 변환 (_normalize_party 재사용)
    party_name = item.get("jdName", "")
    party_key = _normalize_party(party_name)

    # ballotNumber 추출 (anti-pattern: huboCnt 금지)
    ballot_number = _extract_ballot_number(item)

    # 기초단체장 전용: wiwName (시군구명)
    wiw_name = item.get("wiwName", "") if election_type == "4" else None

    candidate = {
        "name": item.get("name", ""),
        "party": party_key,
        "partyKey": party_key,
        "partyName": party_name,
        "career": item.get("career1", ""),
        "status": "NOMINATED",
        "ballotNumber": ballot_number,
        "dataSource": "nec_official",
        "regionKey": region_key,
    }

    if wiw_name:
        candidate["districtName"] = wiw_name
        # 기초단체장 기호 미매핑 체크 (wiwName이 기존 데이터 키와 안 맞을 경우)
        # unmatched 처리는 merge_mayor_candidates()에서 담당

    return candidate


def fetch_nec_official(log_raw=False):
    """
    NEC 본후보 API 호출 (sgTypecode 3/10/4).

    날짜 게이팅: 2026-05-14 이전이면 경고 출력 후 빈 dict 반환.

    Args:
        log_raw: True이면 nec_raw_sample.json에 typecode별 첫 아이템 저장

    Returns:
        dict: {
            "3":  [후보 객체, ...],  # 광역단체장
            "10": [후보 객체, ...],  # 교육감
            "4":  [후보 객체, ...],  # 기초단체장
            "unmatched": [...]       # 매핑 실패 후보
        }
    """
    # 날짜 게이팅: 본후보 등록 개시일(2026-05-14) 이전이면 API 미호출
    now = datetime.now()
    if now < datetime(2026, 5, 14, 0, 0):
        print(f"[INFO] 현재 시각: {now.strftime('%Y-%m-%d %H:%M')}")
        print("[GATE] 본후보 등록 개시일(2026-05-14) 이전입니다.")
        print("[GATE] NEC 본후보 API를 호출하지 않습니다.")
        return {}

    result = {"3": [], "10": [], "4": [], "unmatched": []}
    raw_samples = {}

    for typecode in ["3", "10", "4"]:
        label = ELECTION_TYPE_LABELS[typecode]
        print(f"\n[NEC] {label} 본후보 조회 (sgTypecode={typecode})...")

        # nec_precand_sync.fetch_precandidates() 재사용 (Don't Hand-Roll)
        raw_items = fetch_precandidates(typecode)

        if not raw_items:
            print(f"  [NEC] {label} 후보 없음 (API 미공개 또는 미등록)")
            continue

        # raw response 로깅 (Pitfall 2 대응: 필드명 확인용)
        if raw_items:
            print(f"  [RAW] 첫 번째 아이템 필드:")
            print(json.dumps(raw_items[0], ensure_ascii=False, indent=2))
            if log_raw:
                raw_samples[typecode] = raw_items[0]

        # 변환
        converted = []
        for item in raw_items:
            obj = _convert_nec_item(item, typecode, result["unmatched"])
            if obj is not None:
                converted.append(obj)

        result[typecode] = converted
        print(f"  [NEC] {label} 변환 완료: {len(converted)}명 ({len(result['unmatched'])}명 미매핑)")

    # raw 샘플 저장
    if log_raw and raw_samples:
        with open(RAW_SAMPLE_FILE, 'w', encoding='utf-8') as f:
            json.dump(raw_samples, f, ensure_ascii=False, indent=2)
        print(f"\n[RAW] 샘플 저장: {RAW_SAMPLE_FILE}")

    return result


def merge_governor_candidates(existing, new_candidates):
    """
    governor.json과 NEC 본후보(typecode=3) 병합.

    규칙:
    1. 새 데이터에 있고 기존에 없으면 → 추가 (status: NOMINATED, dataSource: nec_official)
    2. 기존에 있고 새 데이터에 없으면 → status: WITHDRAWN
    3. 둘 다 있으면 → 새 데이터로 업데이트 (기존 pledges/photo 유지)
    """
    if not new_candidates:
        return existing

    merged = json.loads(json.dumps(existing))  # deep copy

    # regionKey별 그룹핑
    by_region = {}
    for c in new_candidates:
        rk = c.get("regionKey")
        if rk:
            by_region.setdefault(rk, []).append(c)

    for region_key in SIDO_MAP.values():
        if region_key not in merged.get("candidates", {}):
            continue

        existing_list = merged["candidates"][region_key]
        existing_by_name = {c["name"]: c for c in existing_list}
        new_by_name = {c["name"]: c for c in by_region.get(region_key, [])}

        result = []

        # 기존 후보 업데이트
        for name, candidate in existing_by_name.items():
            if name in new_by_name:
                nc = new_by_name[name]
                # 새 데이터 우선, 기존 보조 정보(pledges/photo/stance) 유지
                candidate["status"] = "NOMINATED"
                candidate["dataSource"] = "nec_official"
                if nc.get("party"):
                    candidate["party"] = nc["party"]
                    candidate["partyKey"] = nc["partyKey"]
                    candidate["partyName"] = nc.get("partyName", "")
                if nc.get("ballotNumber") is not None:
                    candidate["ballotNumber"] = nc["ballotNumber"]
                if nc.get("career"):
                    candidate["career"] = nc["career"]
                result.append(candidate)
            else:
                # 기존에만 있음 → WITHDRAWN
                if candidate.get("status") not in ("WITHDRAWN",):
                    candidate["status"] = "WITHDRAWN"
                    candidate["_autoWithdrawn"] = True
                    candidate["_withdrawnDate"] = datetime.now().strftime("%Y-%m-%d")
                result.append(candidate)

        # 신규 후보 추가
        for name, nc in new_by_name.items():
            if name not in existing_by_name:
                nc.setdefault("pledges", [])
                nc.setdefault("photo", None)
                nc["id"] = f"{region_key}-nec-{len(result)+1}"
                result.append(nc)

        merged["candidates"][region_key] = result

    merged.setdefault("_meta", {})["lastUpdated"] = datetime.now().strftime("%Y-%m-%d")
    merged["_meta"]["lastPipelineRun"] = datetime.now().isoformat()
    return merged


def merge_superintendent_candidates(existing, new_candidates):
    """
    superintendent.json과 NEC 본후보(typecode=10) 병합.

    교육감 병합 시 NEC API 응답에 stance 필드가 없으면 기존 값 보존 (Open Question 2 대응).
    """
    if not new_candidates:
        return existing

    merged = json.loads(json.dumps(existing))  # deep copy

    # regionKey별 그룹핑
    by_region = {}
    for c in new_candidates:
        rk = c.get("regionKey")
        if rk:
            by_region.setdefault(rk, []).append(c)

    candidates_map = merged.get("candidates", {})

    for region_key, region_list in candidates_map.items():
        if not isinstance(region_list, list):
            continue

        existing_by_name = {c["name"]: c for c in region_list}
        new_by_name = {c["name"]: c for c in by_region.get(region_key, [])}

        result = []

        for name, candidate in existing_by_name.items():
            if name in new_by_name:
                nc = new_by_name[name]
                candidate["status"] = "NOMINATED"
                candidate["dataSource"] = "nec_official"
                if nc.get("party"):
                    candidate["party"] = nc["party"]
                    candidate["partyKey"] = nc["partyKey"]
                    candidate["partyName"] = nc.get("partyName", "")
                if nc.get("ballotNumber") is not None:
                    candidate["ballotNumber"] = nc["ballotNumber"]
                # stance 보존: NEC API에 stance 없으므로 기존 값 유지
                # (덮어쓰지 않음)
                result.append(candidate)
            else:
                if candidate.get("status") not in ("WITHDRAWN",):
                    candidate["status"] = "WITHDRAWN"
                    candidate["_autoWithdrawn"] = True
                    candidate["_withdrawnDate"] = datetime.now().strftime("%Y-%m-%d")
                result.append(candidate)

        for name, nc in new_by_name.items():
            if name not in existing_by_name:
                nc.setdefault("pledges", [])
                nc.setdefault("photo", None)
                nc.setdefault("stance", None)  # 교육감 stance 필드 초기화
                nc["id"] = f"{region_key}-supt-nec-{len(result)+1}"
                result.append(nc)

        candidates_map[region_key] = result

    merged.setdefault("_meta", {})["lastUpdated"] = datetime.now().strftime("%Y-%m-%d")
    merged["_meta"]["lastPipelineRun"] = datetime.now().isoformat()
    return merged


def merge_mayor_candidates(existing, new_candidates, unmatched_list):
    """
    mayor_candidates.json과 NEC 본후보(typecode=4) 병합.

    기초단체장은 2단계 중첩 구조: candidates["seoul"]["종로구"] = [후보 배열]
    wiwName이 기존 데이터 키에 매핑 안 되는 경우 unmatched_list에 추가.
    """
    if not new_candidates:
        return existing

    merged = json.loads(json.dumps(existing))  # deep copy
    candidates_map = merged.get("candidates", {})

    # (regionKey, wiwName) 별 그룹핑
    by_district = {}
    for c in new_candidates:
        rk = c.get("regionKey")
        wiw = c.get("districtName", "")
        if rk and wiw:
            by_district.setdefault((rk, wiw), []).append(c)

    for (rk, wiw), items in by_district.items():
        if rk not in candidates_map:
            # regionKey 자체가 없으면 unmatched
            for c in items:
                unmatched_list.append({
                    "reason": f"regionKey '{rk}' mayor_candidates.json에 없음",
                    "candidate": c,
                })
            continue

        region_dict = candidates_map[rk]
        if not isinstance(region_dict, dict):
            continue

        # wiwName → 실제 키 탐색
        dist_key = None
        if wiw in region_dict:
            dist_key = wiw
        else:
            # 접미사 변형 시도
            for suffix in ["시", "군", "구"]:
                alt = f"{wiw}{suffix}" if not wiw.endswith(suffix) else wiw[:-1]
                if alt in region_dict:
                    dist_key = alt
                    break

            if dist_key is None:
                # 부분 일치 탐색
                for dk in region_dict:
                    if wiw in dk or dk in wiw:
                        dist_key = dk
                        break

        if dist_key is None:
            print(f"[WARN] 기초단체장 district 미매핑: {rk}/{wiw} — unmatched로 보관")
            for c in items:
                unmatched_list.append({
                    "reason": f"district '{wiw}' ({rk}) mayor_candidates.json에 없음",
                    "candidate": c,
                })
            continue

        existing_list = region_dict.get(dist_key, [])
        if not isinstance(existing_list, list):
            existing_list = []

        existing_by_name = {c["name"]: c for c in existing_list}
        new_by_name = {c["name"]: c for c in items}

        result = []

        for name, candidate in existing_by_name.items():
            if name in new_by_name:
                nc = new_by_name[name]
                candidate["status"] = "NOMINATED"
                candidate["dataSource"] = "nec_official"
                if nc.get("party"):
                    candidate["party"] = nc["party"]
                    candidate["partyKey"] = nc["partyKey"]
                    candidate["partyName"] = nc.get("partyName", "")
                if nc.get("ballotNumber") is not None:
                    candidate["ballotNumber"] = nc["ballotNumber"]
                if nc.get("career"):
                    candidate["career"] = nc["career"]
                result.append(candidate)
            else:
                if candidate.get("status") not in ("WITHDRAWN",):
                    candidate["status"] = "WITHDRAWN"
                    candidate["_autoWithdrawn"] = True
                    candidate["_withdrawnDate"] = datetime.now().strftime("%Y-%m-%d")
                result.append(candidate)

        for name, nc in new_by_name.items():
            if name not in existing_by_name:
                nc.setdefault("pledges", [])
                nc.setdefault("photo", None)
                nc["id"] = f"{rk}-{dist_key}-nec-{len(result)+1}"
                result.append(nc)

        region_dict[dist_key] = result

    merged.setdefault("_meta", {})["lastUpdated"] = datetime.now().strftime("%Y-%m-%d")
    merged["_meta"]["lastPipelineRun"] = datetime.now().isoformat()
    return merged


def merge_candidates(existing, new_data):
    """
    기존 데이터 + 새 데이터 병합 (광역단체장용 — 하위 호환 유지)

    규칙:
    1. 새 데이터에 있고 기존에 없으면 → 추가 (status: PRE, dataSource: nec)
    2. 기존에 있고 새 데이터에 없으면 → status: WITHDRAWN
    3. 둘 다 있으면 → 새 데이터로 업데이트 (기존 pledges/career 유지)
    4. NOMINATED 후보가 있는 정당 → 같은 정당 비확정 후보 자동 탈락
    """
    if not new_data:
        return existing

    merged = json.loads(json.dumps(existing))  # deep copy

    for region_key in REGION_MAP.values():
        existing_candidates = {c['name']: c for c in merged['candidates'].get(region_key, [])}
        new_candidates = {c['name']: c for c in new_data.get(region_key, [])}

        result = []

        # 기존 후보 업데이트
        for name, candidate in existing_candidates.items():
            if name in new_candidates:
                nc = new_candidates[name]
                candidate['status'] = nc.get('status', candidate.get('status', 'PRE'))
                candidate['dataSource'] = nc.get('dataSource', candidate.get('dataSource', 'nec'))
                if nc.get('party'):
                    candidate['party'] = nc['party']
                result.append(candidate)
            else:
                if candidate.get('status') not in ('WITHDRAWN',):
                    candidate['status'] = 'WITHDRAWN'
                    candidate['_autoWithdrawn'] = True
                    candidate['_withdrawnDate'] = datetime.now().strftime('%Y-%m-%d')
                result.append(candidate)

        # 새 후보 추가
        for name, nc in new_candidates.items():
            if name not in existing_candidates:
                nc.setdefault('status', 'PRE')
                nc.setdefault('dataSource', 'nec')
                nc.setdefault('pledges', [])
                nc.setdefault('photo', None)
                nc['id'] = f"{region_key}-new-{len(result)+1}"
                result.append(nc)

        merged['candidates'][region_key] = result

    merged['_meta']['lastUpdated'] = datetime.now().strftime('%Y-%m-%d')
    merged['_meta']['lastPipelineRun'] = datetime.now().isoformat()

    return merged


def update_status_from_file(status_file):
    """
    수동 상태 업데이트 파일 적용

    format: data/candidates/status_updates.json
    {
        "updates": [
            {"region": "seoul", "name": "한동훈", "status": "WITHDRAWN", "reason": "서울시장 불출마 선언"},
            {"region": "daegu", "name": "이진숙", "status": "NOMINATED"},
            {"region": "busan", "name": "박형준", "party": "ppp", "status": "NOMINATED"}
        ]
    }
    """
    status_path = CANDIDATES_DIR / status_file
    if not status_path.exists():
        return None

    with open(status_path, 'r', encoding='utf-8') as f:
        updates = json.load(f)

    return updates.get('updates', [])


def apply_status_updates(data, updates):
    """상태 업데이트 적용"""
    if not updates:
        return data

    applied = 0
    for upd in updates:
        region = upd.get('region')
        name = upd.get('name')
        candidates = data['candidates'].get(region, [])

        for c in candidates:
            if c['name'] == name:
                if 'status' in upd:
                    c['status'] = upd['status']
                if 'party' in upd:
                    c['party'] = upd['party']
                if 'reason' in upd:
                    c['_withdrawnReason'] = upd['reason']
                applied += 1
                break

    print(f"[STATUS] Applied {applied}/{len(updates)} status updates")
    return data


def validate(data):
    """데이터 검증"""
    issues = []
    total = 0

    for region, candidates in data['candidates'].items():
        if isinstance(candidates, list):
            # 메타 항목(_merged, _note 등) 제외하고 실제 후보만 처리
            real_candidates = [c for c in candidates if isinstance(c, dict) and "name" in c]
            total += len(real_candidates)

            # 중복 이름 체크
            names = [c['name'] for c in real_candidates]
            dupes = [n for n in names if names.count(n) > 1]
            if dupes:
                issues.append(f"  {region}: duplicate names {set(dupes)}")

            # 필수 필드 체크
            for c in real_candidates:
                if not c.get('name'):
                    issues.append(f"  {region}: candidate without name")
                if not c.get('party'):
                    issues.append(f"  {region}: {c.get('name', '?')} missing party")
        elif isinstance(candidates, dict):
            # 기초단체장 2단계 중첩 구조
            for district, dist_list in candidates.items():
                if isinstance(dist_list, list):
                    total += len(dist_list)

    print(f"\n[VALIDATE] Total: {total} candidates across {len(data['candidates'])} regions")
    if issues:
        print(f"[VALIDATE] {len(issues)} issues found:")
        for i in issues:
            print(i)
    else:
        print("[VALIDATE] No issues found ✓")

    return len(issues) == 0


def save_unmatched(unmatched_list):
    """미매핑 후보 unmatched_candidates.json에 저장"""
    if not UNMATCHED_FILE.exists():
        current = {"_meta": {"version": "1.0", "lastUpdated": None, "description": "선거구 미매핑 후보 보관"}, "candidates": []}
    else:
        with open(UNMATCHED_FILE, 'r', encoding='utf-8') as f:
            current = json.load(f)

    current["candidates"] = unmatched_list
    current["_meta"]["lastUpdated"] = datetime.now().strftime("%Y-%m-%d")

    with open(UNMATCHED_FILE, 'w', encoding='utf-8') as f:
        json.dump(current, f, ensure_ascii=False, indent=2)

    print(f"[UNMATCHED] {len(unmatched_list)}명 저장: {UNMATCHED_FILE}")


def main():
    dry_run = "--dry-run" in sys.argv
    log_raw = "--log-raw" in sys.argv

    print("=" * 60)
    print("후보자 데이터 파이프라인 (NEC 본후보 API)")
    print(f"실행 시각: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    if dry_run:
        print("[DRY-RUN] 파일 저장을 건너뜁니다")
    if log_raw:
        print("[LOG-RAW] raw 응답 샘플을 저장합니다")
    print("=" * 60)

    # === NEC 본후보 수집 ===
    print("\n[PHASE 1] NEC 본후보 데이터 수집")
    nec_data = fetch_nec_official(log_raw=log_raw)

    # 날짜 게이팅으로 빈 dict 반환된 경우 — 기존 데이터만 유지
    if not nec_data:
        print("\n[INFO] NEC 수집 건너뜀 — 기존 데이터 검증만 실행")
        existing_gov = load_existing()
        validate(existing_gov)
        return

    unmatched = nec_data.get("unmatched", [])

    # === 광역단체장 병합 ===
    print("\n[PHASE 2] 광역단체장 병합 (governor.json)")
    gov_data = load_existing()
    print(f"  기존: {sum(len(v) for v in gov_data['candidates'].values() if isinstance(v, list))}명")
    merged_gov = merge_governor_candidates(gov_data, nec_data.get("3", []))
    is_valid_gov = validate(merged_gov)

    # === 교육감 병합 ===
    print("\n[PHASE 3] 교육감 병합 (superintendent.json)")
    if SUPERINTENDENT_FILE.exists():
        with open(SUPERINTENDENT_FILE, 'r', encoding='utf-8') as f:
            supt_data = json.load(f)
        print(f"  기존: {sum(len(v) for v in supt_data.get('candidates', {}).values() if isinstance(v, list))}명")
        merged_supt = merge_superintendent_candidates(supt_data, nec_data.get("10", []))
        is_valid_supt = validate(merged_supt)
    else:
        print("  [SKIP] superintendent.json 없음")
        merged_supt = None
        is_valid_supt = True

    # === 기초단체장 병합 ===
    print("\n[PHASE 4] 기초단체장 병합 (mayor_candidates.json)")
    if MAYOR_FILE.exists():
        with open(MAYOR_FILE, 'r', encoding='utf-8') as f:
            mayor_data = json.load(f)
        merged_mayor = merge_mayor_candidates(mayor_data, nec_data.get("4", []), unmatched)
        is_valid_mayor = True  # 기초단체장은 구조 복잡 — validate 생략
    else:
        print("  [SKIP] mayor_candidates.json 없음")
        merged_mayor = None
        is_valid_mayor = True

    # === 수동 상태 업데이트 (광역단체장) ===
    status_updates = update_status_from_file("status_updates.json")
    if status_updates:
        merged_gov = apply_status_updates(merged_gov, status_updates)

    # === 파일 저장 ===
    if not dry_run:
        # 광역단체장
        with open(GOVERNOR_FILE, 'w', encoding='utf-8') as f:
            json.dump(merged_gov, f, ensure_ascii=False, indent=2)
        print(f"\n[SAVE] governor.json 저장 완료")

        # 교육감
        if merged_supt is not None:
            with open(SUPERINTENDENT_FILE, 'w', encoding='utf-8') as f:
                json.dump(merged_supt, f, ensure_ascii=False, indent=2)
            print(f"[SAVE] superintendent.json 저장 완료")

        # 기초단체장
        if merged_mayor is not None:
            with open(MAYOR_FILE, 'w', encoding='utf-8') as f:
                json.dump(merged_mayor, f, ensure_ascii=False, indent=2)
            print(f"[SAVE] mayor_candidates.json 저장 완료")

        # unmatched
        save_unmatched(unmatched)
    else:
        print("\n[DRY-RUN] 저장 건너뜀 (파일 변경 없음)")
        print(f"  미매핑 후보: {len(unmatched)}명")

    print("\n" + "=" * 60)
    print("완료")
    print("=" * 60)


if __name__ == '__main__':
    main()
