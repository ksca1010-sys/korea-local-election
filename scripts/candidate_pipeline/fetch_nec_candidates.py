#!/usr/bin/env python3
"""
선거관리위원회 예비후보/후보자 데이터 수집 파이프라인

현재(2026.03): 선관위 공식 후보자 API는 본후보 등록 이후(2026.05.14~)에 제공 예정.
이 스크립트는 예비후보 공고 페이지를 크롤링하여 데이터를 수집합니다.

향후 선관위 API가 공개되면 이 스크립트를 API 호출 방식으로 전환해야 합니다.
- 선관위 공공데이터: https://www.data.go.kr (선거 관련 API 검색)
- 선관위 선거통계시스템: http://info.nec.go.kr
- 정보공개포털: https://open.nec.go.kr

[중요] API 전환 시기:
1. 예비후보 등록기간 (현재): 예비후보 공고 크롤링
2. 공천 확정기간 (~2026.04): 뉴스 기반 공천 결과 수집
3. 본후보 등록기간 (2026.05.14~15): 선관위 후보자 API 활용
4. 선거일 이후 (2026.06.03~): 개표 결과 API 활용
"""

import json
import os
import sys
from datetime import datetime
from pathlib import Path

# 프로젝트 루트
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
CANDIDATES_DIR = PROJECT_ROOT / 'data' / 'candidates'
OUTPUT_FILE = CANDIDATES_DIR / 'governor.json'

# 17개 시도 코드 매핑 (선관위 코드 → 프로젝트 키)
REGION_MAP = {
    '1100': 'seoul',    '2600': 'busan',    '2700': 'daegu',
    '2800': 'incheon',  '2900': 'gwangju',  '3000': 'daejeon',
    '3100': 'ulsan',    '3611': 'sejong',   '4100': 'gyeonggi',
    '4200': 'gangwon',  '4300': 'chungbuk', '4400': 'chungnam',
    '4500': 'jeonbuk',  '4600': 'jeonnam',  '4700': 'gyeongbuk',
    '4800': 'gyeongnam','4900': 'jeju'
}

# 정당명 → 프로젝트 partyKey 매핑
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

def normalize_party(party_name):
    """정당명을 프로젝트 partyKey로 변환"""
    if not party_name:
        return 'independent'
    for key, val in PARTY_MAP.items():
        if key in party_name:
            return val
    return 'independent'


def load_existing():
    """기존 governor.json 로드"""
    if OUTPUT_FILE.exists():
        with open(OUTPUT_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {'_meta': {}, 'candidates': {}}


def fetch_nec_preliminary():
    """
    선관위 예비후보 데이터 수집

    TODO: 선관위 API가 공개되면 이 함수를 교체
    현재는 placeholder - 수동 업데이트 또는 뉴스 크롤링으로 대체
    """
    print("[INFO] 선관위 예비후보 API는 아직 미공개 상태입니다.")
    print("[INFO] 현재는 기존 데이터(data.js 추출분)를 기반으로 동작합니다.")
    print("[INFO] 수동 업데이트: data/candidates/governor.json 직접 편집")
    print()
    print("[TODO] 선관위 API 공개 시 이 함수에 구현:")
    print("  - 공공데이터포털 선거후보자 API")
    print("  - info.nec.go.kr 예비후보 조회")
    print("  - open.nec.go.kr 정보공개 데이터")
    return None


def merge_candidates(existing, new_data):
    """
    기존 데이터 + 새 데이터 병합

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
                # 둘 다 있음 → 병합 (새 데이터 우선, 기존 보조 정보 유지)
                nc = new_candidates[name]
                candidate['status'] = nc.get('status', candidate.get('status', 'PRE'))
                candidate['dataSource'] = nc.get('dataSource', candidate.get('dataSource', 'nec'))
                if nc.get('party'):
                    candidate['party'] = nc['party']
                result.append(candidate)
            else:
                # 기존에만 있음 → 불출마 확인 필요
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
        total += len(candidates)

        # 중복 이름 체크
        names = [c['name'] for c in candidates]
        dupes = [n for n in names if names.count(n) > 1]
        if dupes:
            issues.append(f"  {region}: duplicate names {set(dupes)}")

        # 필수 필드 체크
        for c in candidates:
            if not c.get('name'):
                issues.append(f"  {region}: candidate without name")
            if not c.get('party'):
                issues.append(f"  {region}: {c.get('name', '?')} missing party")

    print(f"\n[VALIDATE] Total: {total} candidates across {len(data['candidates'])} regions")
    if issues:
        print(f"[VALIDATE] {len(issues)} issues found:")
        for i in issues:
            print(i)
    else:
        print("[VALIDATE] No issues found ✓")

    return len(issues) == 0


def main():
    print("=" * 60)
    print("후보자 데이터 파이프라인")
    print(f"실행 시각: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)

    # 1. 기존 데이터 로드
    existing = load_existing()
    print(f"\n[LOAD] Existing: {sum(len(v) for v in existing['candidates'].values())} candidates")

    # 2. 선관위 데이터 수집 시도
    new_data = fetch_nec_preliminary()

    # 3. 병합 (새 데이터가 있을 때만)
    if new_data:
        merged = merge_candidates(existing, new_data)
    else:
        merged = existing

    # 4. 수동 상태 업데이트 적용
    status_updates = update_status_from_file('status_updates.json')
    if status_updates:
        merged = apply_status_updates(merged, status_updates)

    # 5. 메타데이터 업데이트
    merged['_meta']['lastPipelineRun'] = datetime.now().isoformat()
    merged['_meta']['version'] = merged['_meta'].get('version', '1.0.0')

    # 6. 검증
    validate(merged)

    # 7. 저장
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(merged, f, ensure_ascii=False, indent=2)

    print(f"\n[SAVE] Written to {OUTPUT_FILE}")
    print("=" * 60)


if __name__ == '__main__':
    main()
