#!/usr/bin/env python3
"""
알선거 데이터 헬스체크

전체 데이터 무결성을 자동 검증하고 문제를 리포트합니다.
crontab 또는 GitHub Actions에서 매일 실행.

사용법:
  python scripts/health_check.py           # 전체 검사
  python scripts/health_check.py --fix     # 자동 교정 가능한 것만 수정
  python scripts/health_check.py --json    # JSON 리포트 출력
"""

import json
import re
import sys
import ssl
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path
from collections import Counter

BASE = Path(__file__).resolve().parent.parent
NAME_RE = re.compile(r'^[가-힣]{2,4}$')

class HealthCheck:
    def __init__(self):
        self.errors = []    # 치명 (데이터 오류)
        self.warnings = []  # 경고 (개선 필요)
        self.info = []      # 정보

    def error(self, category, msg):
        self.errors.append({"category": category, "message": msg})

    def warn(self, category, msg):
        self.warnings.append({"category": category, "message": msg})

    def log(self, category, msg):
        self.info.append({"category": category, "message": msg})

    # ── 1. 재보궐 검사 ──
    def check_byelection(self):
        path = BASE / "data" / "candidates" / "byelection.json"
        if not path.exists():
            self.error("재보궐", "byelection.json 파일 없음")
            return

        data = json.loads(path.read_text())
        districts = data.get("districts", {})

        # 중복 선거구 감지 (지역명 기준)
        district_names = [d.get("district", "") for d in districts.values()]
        normalized = {}
        for key, d in districts.items():
            name = re.sub(r'[·ㆍ\s]', '', d.get("district", ""))
            if name in normalized:
                self.error("재보궐", f"중복 선거구: '{key}' = '{normalized[name]}' (동일: {name})")
            else:
                normalized[name] = key

        # 후보 0명 선거구
        for key, d in districts.items():
            cands = [c for c in d.get("candidates", []) if c.get("status") != "WITHDRAWN"]
            if len(cands) == 0:
                self.warn("재보궐", f"{key}: 후보 0명")

        self.log("재보궐", f"{len(districts)}개 선거구 검사 완료")

    # ── 2. 여론조사 검사 ──
    def check_polls(self):
        path = BASE / "data" / "polls" / "polls.json"
        if not path.exists():
            self.error("여론조사", "polls.json 파일 없음")
            return

        data = json.loads(path.read_text())
        total = 0
        empty_results = 0
        bad_names = 0
        bad_totals = 0
        no_party = 0

        for region, polls in data.get("regions", {}).items():
            for p in polls:
                total += 1
                results = p.get("results", [])

                if not results:
                    empty_results += 1
                    continue

                # 비이름 패턴 체크
                for r in results:
                    name = r.get("candidateName", "")
                    if name and not NAME_RE.match(name):
                        bad_names += 1
                        self.error("여론조사", f"[{p.get('nttId')}] 비이름 후보: '{name}' {r.get('support')}%")

                    if not r.get("party"):
                        no_party += 1

                # 합계 체크 (결과 2명 이상일 때만)
                if len(results) >= 2:
                    support_total = sum(r.get("support", 0) for r in results)
                    if support_total > 120:
                        bad_totals += 1
                        self.warn("여론조사", f"[{p.get('nttId')}] 합계 {support_total:.1f}% (120% 초과)")

        if bad_names > 0:
            self.error("여론조사", f"비이름 패턴 후보 {bad_names}건 발견")
        if empty_results > 0:
            self.log("여론조사", f"빈 results: {empty_results}건")
        if no_party > 0:
            self.log("여론조사", f"party 누락: {no_party}건")

        self.log("여론조사", f"총 {total}건, 합계 이상 {bad_totals}건")

    # ── 3. 후보자 검사 ──
    def check_candidates(self):
        # 광역단체장
        gov_path = BASE / "data" / "candidates" / "governor.json"
        if gov_path.exists():
            gov = json.loads(gov_path.read_text())
            cands = gov.get("candidates", {})
            total = sum(len(v) if isinstance(v, list) else 0 for v in cands.values())
            no_party = sum(1 for v in cands.values() if isinstance(v, list) for c in v if not c.get("party"))
            if no_party > 0:
                self.warn("후보자", f"광역단체장 party 누락 {no_party}건")
            self.log("후보자", f"광역단체장 {total}명")

        # 기초단체장
        mayor_path = BASE / "data" / "candidates" / "mayor_candidates.json"
        if mayor_path.exists():
            mayor = json.loads(mayor_path.read_text())
            cands = mayor.get("candidates", {})
            total = 0
            no_party = 0
            dupes = 0
            for rk, districts in cands.items():
                if not isinstance(districts, dict):
                    continue
                for dn, clist in districts.items():
                    if not isinstance(clist, list):
                        continue
                    names = [c.get("name") for c in clist]
                    name_counts = Counter(names)
                    for name, cnt in name_counts.items():
                        if cnt > 1:
                            dupes += 1
                            self.warn("후보자", f"기초단체장 중복: {rk}/{dn} '{name}' {cnt}건")
                    total += len(clist)
                    no_party += sum(1 for c in clist if not c.get("party"))

            if no_party > 0:
                self.log("후보자", f"기초단체장 party 누락 {no_party}건")
            self.log("후보자", f"기초단체장 {total}명, 중복 {dupes}건")

    # ── 4. Worker 응답 체크 ──
    def check_worker(self):
        ssl_ctx = ssl.create_default_context()
        ssl_ctx.check_hostname = False
        ssl_ctx.verify_mode = ssl.CERT_NONE

        endpoints = [
            ("네이버 뉴스", "https://election-news-proxy.ksca1010.workers.dev/api/news?query=test&display=1"),
            ("Google News", "https://election-news-proxy.ksca1010.workers.dev/api/gnews?query=test"),
        ]

        for name, url in endpoints:
            try:
                req = urllib.request.Request(url, headers={
                    "Accept": "application/json",
                    "User-Agent": "Mozilla/5.0 HealthCheck/1.0"
                })
                with urllib.request.urlopen(req, timeout=10, context=ssl_ctx) as resp:
                    if resp.status == 200:
                        self.log("Worker", f"{name}: OK ({resp.status})")
                    else:
                        self.warn("Worker", f"{name}: {resp.status}")
            except Exception as e:
                self.error("Worker", f"{name}: 실패 ({e})")

    # ── 5. 데이터 정합성 ──
    def check_data_integrity(self):
        # regions.json 존재
        regions_path = BASE / "data" / "static" / "regions.json"
        if not regions_path.exists():
            self.error("정합성", "regions.json 없음")
            return

        regions = json.loads(regions_path.read_text())
        region_keys = set(regions.keys())

        # sub_regions.json 키 일치
        sub_path = BASE / "data" / "static" / "sub_regions.json"
        if sub_path.exists():
            sub = json.loads(sub_path.read_text())
            sub_keys = set(sub.keys())
            missing = region_keys - sub_keys
            extra = sub_keys - region_keys
            if missing:
                self.warn("정합성", f"sub_regions에 없는 region: {missing}")
            if extra:
                self.warn("정합성", f"sub_regions에 있지만 regions에 없는: {extra}")

        # dong_search_index.json 존재
        dong_path = BASE / "data" / "static" / "dong_search_index.json"
        if dong_path.exists():
            dong = json.loads(dong_path.read_text())
            self.log("정합성", f"읍면동 인덱스: {len(dong)}개")
        else:
            self.warn("정합성", "dong_search_index.json 없음")

        # polls.json 날짜 체크
        polls_path = BASE / "data" / "polls" / "polls.json"
        if polls_path.exists():
            polls = json.loads(polls_path.read_text())
            generated = polls.get("generated", "")
            if generated:
                gen_date = datetime.fromisoformat(generated.replace("Z", ""))
                age = (datetime.now() - gen_date).days
                if age > 3:
                    self.warn("정합성", f"polls.json이 {age}일 전 데이터 (generated: {generated})")
                else:
                    self.log("정합성", f"polls.json: {age}일 전 갱신")

    # ── 6. JSON 파싱 에러 ──
    def check_json_files(self):
        json_dirs = [
            BASE / "data" / "static",
            BASE / "data" / "candidates",
            BASE / "data" / "polls",
        ]
        errors = 0
        checked = 0
        for d in json_dirs:
            if not d.exists():
                continue
            for f in d.glob("*.json"):
                checked += 1
                try:
                    json.loads(f.read_text())
                except json.JSONDecodeError as e:
                    errors += 1
                    self.error("JSON", f"{f.name}: 파싱 에러 ({e})")

        self.log("JSON", f"{checked}개 파일 검사, 에러 {errors}건")

    # ── 실행 ──
    def run(self):
        print("=" * 55)
        print("알선거 데이터 헬스체크")
        print(f"실행: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("=" * 55)

        self.check_byelection()
        self.check_polls()
        self.check_candidates()
        self.check_worker()
        self.check_data_integrity()
        self.check_json_files()

        # 결과 출력
        if self.errors:
            print(f"\n🔴 에러 {len(self.errors)}건:")
            for e in self.errors:
                print(f"  [{e['category']}] {e['message']}")

        if self.warnings:
            print(f"\n🟡 경고 {len(self.warnings)}건:")
            for w in self.warnings:
                print(f"  [{w['category']}] {w['message']}")

        print(f"\n🟢 정보:")
        for i in self.info:
            print(f"  [{i['category']}] {i['message']}")

        print(f"\n{'='*55}")
        print(f"결과: 에러 {len(self.errors)}건, 경고 {len(self.warnings)}건")

        return len(self.errors) == 0

    def to_json(self):
        return {
            "timestamp": datetime.now().isoformat(),
            "errors": self.errors,
            "warnings": self.warnings,
            "info": self.info,
            "ok": len(self.errors) == 0
        }


if __name__ == "__main__":
    hc = HealthCheck()
    ok = hc.run()

    if "--json" in sys.argv:
        report_path = BASE / "data" / "health_report.json"
        report_path.write_text(json.dumps(hc.to_json(), ensure_ascii=False, indent=2))
        print(f"\nJSON 리포트: {report_path}")

    sys.exit(0 if ok else 1)
