#!/usr/bin/env python3
"""
후보자 추가 시 사전 검증 가드

모든 factcheck 파이프라인에서 후보를 추가하기 전에 호출하여:
1. 다른 선거구에 동일 인물이 이미 있는지 (전역 중복)
2. 정당 정보가 기존 데이터와 일치하는지 (정당 교차검증)
를 미리 차단합니다.
"""

import json
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent
CANDIDATES_DIR = BASE_DIR / "data" / "candidates"

# 상태 우선순위
STATUS_PRIORITY = {"REGISTERED": 5, "NOMINATED": 4, "DECLARED": 3, "RUMORED": 1}


def build_known_party_map():
    """모든 후보 데이터에서 인물→정당 매핑 구축"""
    known = {}
    files = [
        ("governor.json", "candidates"),
        ("superintendent.json", "candidates"),
        ("mayor_candidates.json", "candidates"),
    ]
    for fname, key in files:
        path = CANDIDATES_DIR / fname
        if not path.exists():
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        container = data.get(key, {})
        for region, entries in container.items():
            if isinstance(entries, list):
                cands = entries
            elif isinstance(entries, dict):
                # mayor: region -> district -> candidates
                for _dist, dist_cands in entries.items():
                    if isinstance(dist_cands, list):
                        for c in dist_cands:
                            pk = c.get("partyKey", c.get("party", ""))
                            if pk and c.get("status") != "WITHDRAWN":
                                known.setdefault(c["name"], pk)
                continue
            else:
                continue
            for c in cands:
                pk = c.get("partyKey", c.get("party", ""))
                if pk and c.get("status") != "WITHDRAWN":
                    known.setdefault(c["name"], pk)

    # 재보궐
    bye_path = CANDIDATES_DIR / "byelection.json"
    if bye_path.exists():
        bye = json.loads(bye_path.read_text(encoding="utf-8"))
        for _key, dist in bye.get("districts", {}).items():
            for c in dist.get("candidates", []):
                pk = c.get("partyKey", c.get("party", ""))
                if pk and c.get("status") != "WITHDRAWN":
                    known.setdefault(c["name"], pk)

    return known


def build_byelection_name_index(bye_data):
    """재보궐 전체 선거구에 걸친 인물→선거구 인덱스"""
    index = {}
    for key, dist in bye_data.get("districts", {}).items():
        for c in dist.get("candidates", []):
            if c.get("status") == "WITHDRAWN":
                continue
            name = c["name"]
            if name not in index:
                index[name] = []
            index[name].append(key)
    return index


def check_party(name, party_key, known_parties=None):
    """정당 교차검증. 보정된 정당키를 반환."""
    if known_parties is None:
        known_parties = build_known_party_map()
    if name in known_parties and party_key != known_parties[name]:
        correct = known_parties[name]
        print(f"    [정당보정] {name}: {party_key}→{correct} (기존 데이터 기준)")
        return correct
    return party_key


def check_duplicate(name, current_district_key, bye_data=None, name_index=None):
    """전역 중복 체크. 다른 선거구에 이미 있으면 True (차단 필요)."""
    if name_index is None and bye_data is not None:
        name_index = build_byelection_name_index(bye_data)
    if name_index is None:
        return False
    if name in name_index:
        other_keys = [k for k in name_index[name] if k != current_district_key]
        if other_keys:
            print(f"    [차단] {name} — 이미 다른 선거구에 등록: {', '.join(other_keys)}")
            return True
    return False
