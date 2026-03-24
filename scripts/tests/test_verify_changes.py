#!/usr/bin/env python3
"""verify_changes.py + candidate_guard.py 유닛 테스트"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'candidate_pipeline'))

from verify_changes import verify_changes_against_news


def test_news_zero_downgrades_new_candidate():
    """뉴스 0건 → 신규 후보는 RUMORED로 다운그레이드"""
    changes = [
        {'name': '홍길동', 'changeType': 'new_candidate', 'newStatus': 'DECLARED'},
    ]
    result = verify_changes_against_news(changes, news=[])
    assert len(result) == 1
    assert result[0]['newStatus'] == 'RUMORED', f"Expected RUMORED, got {result[0]['newStatus']}"


def test_news_zero_blocks_status_change():
    """뉴스 0건 → 상태 변경은 제외"""
    changes = [
        {'name': '홍길동', 'changeType': 'status_change', 'newStatus': 'WITHDRAWN'},
    ]
    result = verify_changes_against_news(changes, news=[])
    assert len(result) == 0, f"Expected 0, got {len(result)}"


def test_name_not_in_news():
    """이름이 뉴스에 없으면 제외"""
    changes = [
        {'name': '홍길동', 'changeType': 'new_candidate', 'newStatus': 'DECLARED'},
    ]
    news = ['김철수 시장 출마 선언', '박영희 도지사 후보']
    result = verify_changes_against_news(changes, news)
    assert len(result) == 0


def test_name_in_news_without_election_context():
    """이름은 있지만 선거 맥락 없으면 → RUMORED 다운그레이드"""
    changes = [
        {'name': '홍길동', 'changeType': 'new_candidate', 'newStatus': 'DECLARED'},
    ]
    news = ['홍길동 회장 기업 실적 발표']  # 선거 맥락 없음
    result = verify_changes_against_news(changes, news)
    # 전체 합산에 이름이 있지만 개별 뉴스에서 선거 맥락 없음
    assert len(result) == 0 or result[0]['newStatus'] in ('RUMORED', 'EXPECTED')


def test_party_change_without_keyword():
    """정당 변경 — 탈당/입당 키워드 없으면 제외"""
    changes = [
        {'name': '홍길동', 'changeType': 'party_change', 'party': '국민의힘'},
    ]
    news = ['홍길동 시장 후보 출마 선언']  # 탈당/입당 없음
    result = verify_changes_against_news(changes, news)
    assert len(result) == 0


def test_party_change_with_keyword():
    """정당 변경 — 탈당 키워드 있으면 통과"""
    changes = [
        {'name': '홍길동', 'changeType': 'party_change', 'party': '국민의힘'},
    ]
    news = ['홍길동 의원 탈당 후 국민의힘 입당 선거 출마']
    result = verify_changes_against_news(changes, news)
    assert len(result) == 1


def test_withdrawn_needs_keyword():
    """WITHDRAWN — 사퇴 키워드 필수"""
    changes = [
        {'name': '홍길동', 'changeType': 'status_change', 'newStatus': 'WITHDRAWN'},
    ]
    news = ['홍길동 시장 후보 출마 선거']
    result = verify_changes_against_news(changes, news)
    assert len(result) == 0

    news2 = ['홍길동 후보 선거 사퇴 선언']
    result2 = verify_changes_against_news(changes, news2)
    assert len(result2) == 1


def test_declared_with_speculation():
    """출마 선언 근거 부족 + 전망 키워드 → RUMORED"""
    changes = [
        {'name': '홍길동', 'changeType': 'new_candidate', 'newStatus': 'DECLARED'},
    ]
    news = ['홍길동 시장 출마 가능성 유력 선거']
    result = verify_changes_against_news(changes, news)
    assert len(result) == 1
    assert result[0]['newStatus'] == 'RUMORED'


def test_stance_without_evidence():
    """교육감 stance — 뉴스 근거 없으면 중도로"""
    changes = [
        {'name': '김교육', 'changeType': 'new_candidate', 'newStatus': 'DECLARED', 'stance': '진보'},
    ]
    news = ['김교육 교육감 후보 출마 선언 선거']
    result = verify_changes_against_news(changes, news)
    assert len(result) == 1
    assert result[0].get('stance') == '중도', f"Expected 중도, got {result[0].get('stance')}"


if __name__ == '__main__':
    tests = [
        test_news_zero_downgrades_new_candidate,
        test_news_zero_blocks_status_change,
        test_name_not_in_news,
        test_name_in_news_without_election_context,
        test_party_change_without_keyword,
        test_party_change_with_keyword,
        test_withdrawn_needs_keyword,
        test_declared_with_speculation,
        test_stance_without_evidence,
    ]

    passed = 0
    failed = 0
    for test in tests:
        try:
            test()
            print(f'  ✓ {test.__name__}')
            passed += 1
        except AssertionError as e:
            print(f'  ✗ {test.__name__}: {e}')
            failed += 1
        except Exception as e:
            print(f'  ✗ {test.__name__}: {type(e).__name__}: {e}')
            failed += 1

    print(f'\n결과: {passed} passed, {failed} failed')
    sys.exit(1 if failed else 0)
