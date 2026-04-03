#!/usr/bin/env python3
"""
validate_pipeline.py — 파이프라인 드라이런 검증

실제 API 호출 없이 모든 파이프라인 스크립트가
현재 데이터를 정상적으로 읽는지 확인한다.

커밋 전 또는 데이터 포맷 변경 후 실행:
  python scripts/candidate_pipeline/validate_pipeline.py

종료코드: 0 = 정상, 1 = 오류 발견
"""

import json
import sys
from pathlib import Path
from datetime import date

BASE = Path(__file__).resolve().parent.parent.parent
DATA = BASE / "data" / "candidates"

ERRORS = []
WARNINGS = []


def err(msg: str):
    ERRORS.append(msg)
    print(f"  ❌ {msg}")


def warn(msg: str):
    WARNINGS.append(msg)
    print(f"  ⚠️  {msg}")


def ok(msg: str):
    print(f"  ✅ {msg}")


# ── 공통 헬퍼 ──────────────────────────────────────────────

def load(path: Path) -> dict | list | None:
    if not path.exists():
        err(f"파일 없음: {path.relative_to(BASE)}")
        return None
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        err(f"JSON 파싱 오류 [{path.name}]: {e}")
        return None


def check_candidate_list(region_key: str, clist: list, context: str):
    """후보자 배열의 각 항목이 name 필드를 가지는지 확인."""
    for i, c in enumerate(clist):
        if not isinstance(c, dict):
            err(f"{context} [{region_key}][{i}]: dict가 아님 — {type(c)}")
            continue
        if "_merged" in c:
            err(f"{context} [{region_key}][{i}]: _merged 플레이스홀더 발견 — "
                "merge_gwangju_jeonnam.py가 빈 배열 대신 플레이스홀더를 삽입했을 수 있음")
            continue
        if "name" not in c or not c["name"]:
            err(f"{context} [{region_key}][{i}]: name 필드 없음 — {list(c.keys())}")


# ── 검증 항목 ──────────────────────────────────────────────

def check_governor():
    print("\n[1] governor.json")
    data = load(DATA / "governor.json")
    if data is None:
        return
    candidates = data.get("candidates", {})
    if not candidates:
        err("candidates 키 없음")
        return
    total = 0
    for rk, clist in candidates.items():
        if not isinstance(clist, list):
            err(f"[{rk}]: 리스트가 아님")
            continue
        check_candidate_list(rk, clist, "governor")
        total += len(clist)
    ok(f"{len(candidates)}개 지역, 후보 {total}명")


def check_superintendent():
    print("\n[2] superintendent.json")
    data = load(DATA / "superintendent.json")
    if data is None:
        return
    candidates = data.get("candidates", {})
    total = 0
    for rk, clist in candidates.items():
        if not isinstance(clist, list):
            err(f"[{rk}]: 리스트가 아님")
            continue
        check_candidate_list(rk, clist, "superintendent")
        total += len(clist)
    ok(f"{len(candidates)}개 지역, 후보 {total}명")


def check_mayor_candidates():
    print("\n[3] mayor_candidates.json")
    data = load(DATA / "mayor_candidates.json")
    if data is None:
        return
    candidates = data.get("candidates", {})
    total = 0
    for rk, districts in candidates.items():
        if not isinstance(districts, dict):
            continue
        for dist, clist in districts.items():
            if not isinstance(clist, list):
                continue
            for i, c in enumerate(clist):
                if isinstance(c, dict) and "_merged" in c:
                    err(f"mayor [{rk}/{dist}][{i}]: _merged 플레이스홀더 발견")
                elif isinstance(c, dict) and "name" not in c:
                    err(f"mayor [{rk}/{dist}][{i}]: name 없음 — {list(c.keys())}")
            total += len(clist)
    ok(f"후보 {total}명")


def check_byelection():
    print("\n[4] byelection.json")
    data = load(DATA / "byelection.json")
    if data is None:
        return
    districts = data.get("districts", {})
    if isinstance(districts, list):
        districts = {d.get("key", i): d for i, d in enumerate(districts)}
    total = 0
    for key, dist in districts.items():
        if not isinstance(dist, dict):
            continue
        clist = dist.get("candidates", [])
        for i, c in enumerate(clist):
            if isinstance(c, dict) and "_merged" in c:
                err(f"byelection [{key}][{i}]: _merged 플레이스홀더 발견")
            elif isinstance(c, dict) and "name" not in c:
                err(f"byelection [{key}][{i}]: name 없음")
        total += len(clist)
    ok(f"{len(districts)}개 선거구, 후보 {total}명")


def check_merge_script():
    """merge_gwangju_jeonnam.py가 빈 배열을 사용하는지 확인."""
    print("\n[5] merge_gwangju_jeonnam.py 설정")
    path = BASE / "scripts" / "candidate_pipeline" / "merge_gwangju_jeonnam.py"
    if not path.exists():
        warn("merge_gwangju_jeonnam.py 없음")
        return
    src = path.read_text(encoding="utf-8")
    if '{"_merged"' in src and "JEONNAM_REDIRECT" in src:
        # 플레이스홀더가 빈 배열로 바뀌었는지 확인
        import re
        matches = re.findall(r'JEONNAM_REDIRECT_\w+\s*=\s*(.+)', src)
        for m in matches:
            if "_merged" in m:
                err(f"JEONNAM_REDIRECT가 아직 _merged 플레이스홀더를 사용 중: {m.strip()}")
                return
    ok("JEONNAM_REDIRECT = [] (빈 배열) 확인")


def check_data_freshness():
    """주요 데이터 파일의 최신성 확인."""
    print("\n[6] 데이터 최신성")
    today = date.today()
    files = {
        "governor_status.json": 7,
        "superintendent_status.json": 7,
        "mayor_status.json": 7,
    }
    for fname, max_days in files.items():
        path = DATA / fname
        if not path.exists():
            warn(f"{fname}: 파일 없음")
            continue
        data = load(path)
        if data is None:
            continue
        updated = data.get("_meta", {}).get("updatedAt", "") or data.get("updatedAt", "")
        if updated:
            try:
                d = date.fromisoformat(updated[:10])
                days = (today - d).days
                if days > max_days:
                    warn(f"{fname}: {days}일 미갱신 (마지막: {updated[:10]})")
                else:
                    ok(f"{fname}: {days}일 전 갱신")
            except Exception:
                warn(f"{fname}: updatedAt 파싱 실패 ({updated})")
        else:
            warn(f"{fname}: updatedAt 없음")


# ── 메인 ──────────────────────────────────────────────────

def main():
    print("=" * 55)
    print("  파이프라인 드라이런 검증")
    print(f"  실행일: {date.today()}")
    print("=" * 55)

    check_governor()
    check_superintendent()
    check_mayor_candidates()
    check_byelection()
    check_merge_script()
    check_data_freshness()

    print("\n" + "=" * 55)
    if ERRORS:
        print(f"❌ 오류 {len(ERRORS)}건 발견:")
        for e in ERRORS:
            print(f"   • {e}")
        print("\n→ 위 오류를 수정한 후 커밋하세요.")
        sys.exit(1)
    elif WARNINGS:
        print(f"✅ 오류 없음 (경고 {len(WARNINGS)}건)")
        sys.exit(0)
    else:
        print("✅ 모든 검증 통과 — 파이프라인 정상")
        sys.exit(0)


if __name__ == "__main__":
    main()
