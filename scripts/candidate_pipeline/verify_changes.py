"""
후보자 변경사항 교차 검증 공통 모듈
- factcheck_candidates.py, factcheck_superintendent.py, factcheck_mayor.py에서 공유
- LLM이 제안한 변경을 뉴스와 교차 검증하여 할루시네이션 필터링
"""


def _name_in_news_item(name, news_item):
    """개별 뉴스 제목에서 이름이 선거 맥락 안에 있는지 확인 (동명이인 방지)"""
    if name not in news_item:
        return False
    # 선거 맥락 키워드가 같은 제목에 있어야 함
    election_context = ["출마", "후보", "선거", "공천", "경선", "출판기념회",
                        "도전", "예비", "지지율", "여론조사", "공약", "사퇴",
                        "불출마", "시장", "도지사", "구청장", "군수", "교육감",
                        "보궐", "재보궐"]
    return any(kw in news_item for kw in election_context)


def _name_in_any_news(name, news):
    """뉴스 목록 중 하나라도 이름+선거 맥락이 있으면 True"""
    return any(_name_in_news_item(name, n) for n in news)


def verify_changes_against_news(changes, news, region_names=None):
    """
    LLM이 제안한 변경사항을 뉴스와 교차 검증.
    뉴스에서 근거를 찾을 수 없는 변경은 필터링.

    Args:
        changes: LLM이 제안한 변경 리스트
        news: 뉴스 제목 리스트 (str)
        region_names: {key: name} 매핑 (역매핑용, optional)
    Returns:
        검증 통과한 변경 리스트
    """
    # A1: 뉴스 0건이면 무조건 통과 대신 → 신규 후보는 RUMORED 다운그레이드
    if not news:
        print("  [경고] 뉴스 0건 — 신규 후보는 RUMORED로 다운그레이드, 상태변경은 보류")
        safe = []
        for change in changes:
            ct = change.get("changeType", "")
            if ct == "new_candidate":
                change["newStatus"] = "RUMORED"
                safe.append(change)
                print(f"    {change.get('name', '?')}: RUMORED로 다운그레이드")
            elif ct in ("status_change", "withdrawn", "nominated", "party_change"):
                print(f"    {change.get('name', '?')}: 뉴스 없이 {ct} 보류 → 제외")
                # 상태 변경은 뉴스 근거 없이 적용하면 위험 → 제외
            else:
                safe.append(change)
        return safe

    news_text = " ".join(news)
    verified = []

    for change in changes:
        name = change.get("name", "")
        change_type = change.get("changeType", "")
        new_status = change.get("newStatus", "")

        # A2: 이름 매칭 — 개별 뉴스 제목 단위로 선거 맥락과 함께 확인
        if name and not _name_in_any_news(name, news):
            # 폴백: 전체 합산에도 없으면 확실히 제외
            if name not in news_text:
                print(f"  [필터] {name}: 뉴스에 이름 없음 → 제외")
                continue
            # 전체 합산에는 있지만 개별 뉴스에서 선거 맥락이 없음
            # → 동명이인 가능성. 신규는 RUMORED로, 상태변경은 제외
            if change_type == "new_candidate":
                print(f"  [필터] {name}: 선거 맥락 없는 동명이인 가능성 → RUMORED")
                change["newStatus"] = "RUMORED"
            elif change_type in ("status_change", "withdrawn", "nominated"):
                print(f"  [필터] {name}: 선거 맥락 없음 → 상태변경 제외")
                continue

        # 2. WITHDRAWN: 본인 사퇴 키워드 필요
        if new_status == "WITHDRAWN":
            withdraw_keywords = ["사퇴", "불출마", "출마 포기", "출마를 접", "출마 안 하"]
            has_withdraw = any(kw in news_text for kw in withdraw_keywords if name in news_text)
            # "컷오프"는 당 결정이지 본인 사퇴가 아님
            is_cutoff_only = "컷오프" in news_text and not has_withdraw
            if is_cutoff_only:
                print(f"  [필터] {name}: 컷오프는 당 결정. 본인 사퇴 확인 안 됨 → 제외")
                continue
            if not has_withdraw:
                print(f"  [필터] {name}: 사퇴/불출마 키워드 없음 → 제외")
                continue

        # 3. NOMINATED: 이름+공천이 같은 뉴스에 있어야
        if new_status == "NOMINATED":
            nominate_keywords = ["공천", "단수", "확정", "후보 선출"]
            found_in_same_news = False
            for n in news:
                if name in n and any(kw in n for kw in nominate_keywords):
                    found_in_same_news = True
                    break
            if not found_in_same_news:
                print(f"  [필터] {name}: 공천 뉴스에서 이름+공천 동시 확인 안 됨 → 제외")
                continue

        # 4. 신규 후보 DECLARED: 본인 선언 키워드 필요
        if change_type == "new_candidate":
            declare_keywords = ["출마 선언", "출마를 선언", "예비후보 등록", "출사표", "출마 공식", "출마를 공식"]
            # 출판기념회 = 사실상 출마 준비 행위 (한국 정치 관행)
            expected_keywords = ["출판기념회 성료", "출판기념회 개최", "출판기념회를 열"]
            rumored_keywords = ["출판기념회 예정", "출판기념회 준비"]
            speculation_keywords = ["확실", "유력", "거론", "관측", "가능성", "전망"]

            has_declare = any(kw in news_text for kw in declare_keywords if name in news_text)
            has_book_event = any(kw in news_text for kw in expected_keywords if name in news_text)
            has_book_rumor = any(kw in news_text for kw in rumored_keywords if name in news_text)
            is_speculation = any(kw in news_text for kw in speculation_keywords if name in news_text)

            if has_declare:
                pass  # DECLARED 유지
            elif has_book_event:
                # 출판기념회 개최/성료 = EXPECTED (출마 의지 표명이지만 공식 선언은 아님)
                print(f"  [필터] {name}: 출판기념회 개최 → EXPECTED")
                change["newStatus"] = "EXPECTED"
            elif has_book_rumor:
                print(f"  [필터] {name}: 출판기념회 예정 → RUMORED")
                change["newStatus"] = "RUMORED"
            elif is_speculation and not has_declare:
                print(f"  [필터] {name}: 전망/관측 수준 → RUMORED")
                change["newStatus"] = "RUMORED"
            elif not has_declare:
                name_news = [n for n in news if name in n]
                has_election_context = any(
                    kw in n for n in name_news
                    for kw in ["출마", "후보", "선거", "공천", "경선", "도전", "출판기념회"]
                )
                if not has_election_context:
                    print(f"  [필터] {name}: 선거 관련 맥락 없음 → 제외")
                    continue
                print(f"  [필터] {name}: 출마 선언 근거 부족 → EXPECTED")
                change["newStatus"] = "EXPECTED"

        # A3: 정당 변경 검증 — 탈당/입당 키워드 필요
        if change_type == "party_change":
            party_keywords = ["탈당", "입당", "당적", "복당", "이적", "당 이동", "이당"]
            has_party_change = False
            for n in news:
                if name in n and any(kw in n for kw in party_keywords):
                    has_party_change = True
                    break
            if not has_party_change:
                print(f"  [필터] {name}: 정당 변경 뉴스 근거 없음 → 제외")
                continue

        # A9: 교육감 stance 변경 검증
        if change.get("stance") and change_type in ("new_candidate", "info_update"):
            stance = change.get("stance", "")
            if stance in ("진보", "보수"):
                stance_keywords = [stance, "성향", "진영"]
                has_stance = any(
                    name in n and any(kw in n for kw in stance_keywords)
                    for n in news
                )
                if not has_stance:
                    print(f"  [필터] {name}: {stance} 성향 뉴스 근거 없음 → 중도로 변경")
                    change["stance"] = "중도"

        verified.append(change)

    return verified
