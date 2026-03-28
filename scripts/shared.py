"""
공유 유틸리티 모듈 — 스크립트 공통 패턴 통합

사용법:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from shared import load_json, save_json, REGION_NAMES, load_env, BASE_DIR
"""
from __future__ import annotations

import json
import os
from pathlib import Path

# ── 경로 상수 ──
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
SCRIPTS_DIR = BASE_DIR / "scripts"
ENV_FILE = BASE_DIR / ".env"

CANDIDATES_DIR = DATA_DIR / "candidates"
POLLS_DIR = DATA_DIR / "polls"
STATIC_DIR = DATA_DIR / "static"
COUNCIL_DIR = DATA_DIR / "council"

# ── 지역 매핑 (18개 광역) ──
REGION_NAMES = {
    "seoul": "서울특별시", "busan": "부산광역시", "daegu": "대구광역시",
    "incheon": "인천광역시", "gwangju": "광주광역시", "daejeon": "대전광역시",
    "ulsan": "울산광역시", "sejong": "세종특별자치시", "gyeonggi": "경기도",
    "gangwon": "강원특별자치도", "chungbuk": "충청북도", "chungnam": "충청남도",
    "jeonbuk": "전북특별자치도", "jeonnam": "전라남도", "gyeongbuk": "경상북도",
    "gyeongnam": "경상남도", "jeju": "제주특별자치도",
}

# 역방향: 한글 → 코드 (역사적 지역명 포함)
REGION_MAP = {v: k for k, v in REGION_NAMES.items()}
REGION_MAP.update({
    "강원도": "gangwon",
    "전라북도": "jeonbuk",
    "제주도": "jeju",
})


# ── JSON 유틸 ──
def load_json(path: Path) -> dict | list | None:
    """UTF-8 JSON 파일 로드. 실패 시 None 반환."""
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError) as e:
        print(f"[shared] {path.name} 로드 실패: {e}")
        return None


def save_json(path: Path, data, *, indent: int = 2) -> None:
    """UTF-8 JSON 파일 저장 (ensure_ascii=False, trailing newline)."""
    content = json.dumps(data, ensure_ascii=False, indent=indent)
    path.write_text(content + "\n", encoding="utf-8")


# ── 환경 변수 ──
def load_env(env_file: Path | None = None) -> None:
    """Load .env file into os.environ (setdefault — 기존 값 유지)."""
    target = env_file or ENV_FILE
    if not target.exists():
        return
    for line in target.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, val = line.partition("=")
            os.environ.setdefault(key.strip(), val.strip().strip("'\""))
