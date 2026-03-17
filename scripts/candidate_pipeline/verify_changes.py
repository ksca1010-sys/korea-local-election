"""
후보자 변경사항 교차 검증 공통 모듈
- factcheck_candidates.py, factcheck_superintendent.py, factcheck_mayor.py에서 공유
- Gemini가 제안한 변경을 뉴스와 교차 검증하여 할루시네이션 필터링
"""


def verify_changes_against_news(changes, news, region_names=None):
    """
    Gemini가 제안한 변경사항을 뉴스와 교차 검증.
    뉴스에서 근거를 찾을 수 없는 변경은 필터링.

    Args:
        changes: Gemini가 제안한 변경 리스트
        news: 뉴스 제목 리스트 (str)
        region_names: {key: name} 매핑 (역매핑용, optional)
    Returns:
        검증 통과한 변경 리스트
    """
    if not news:
        return changes

    news_text = " ".join(news)
    verified = []

    for change in changes:
        name = change.get("name", "")
        change_type = change.get("changeType", "")
        new_status = change.get("newStatus", "")

        # 1. 이름이 뉴스에 있는지 확인
        if name and name not in news_text:
            print(f"  [필터] {name}: 뉴스에 이름 없음 → 제외")
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

        verified.append(change)

    return verified
