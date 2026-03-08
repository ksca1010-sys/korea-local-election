#!/usr/bin/env python3
from __future__ import annotations

import json
import ssl
import urllib.request
from pathlib import Path

try:
    import certifi
except ImportError:
    certifi = None

SOURCE_URL = (
    "https://raw.githubusercontent.com/southkorea/southkorea-maps/master/"
    "kostat/2018/json/skorea-municipalities-2018-topo.json"
)
OUTPUT_PATH = Path("data") / "skorea-municipalities-2018-topo-changwon.json"
CHANGWON_CODES = {"38111", "38112", "38113", "38114", "38115"}


def fetch_topo() -> dict:
    ctx = ssl.create_default_context(cafile=certifi.where()) if certifi else ssl.create_default_context()
    with urllib.request.urlopen(SOURCE_URL, context=ctx, timeout=30) as resp:
        return json.load(resp)


def extract_changwon_geoms(geoms: list[dict]) -> tuple[list[dict], list[dict]]:
    others = []
    changwon = []
    for geom in geoms:
        props = geom.get("properties") or {}
        if str(props.get("code")) in CHANGWON_CODES or props.get("name", "").startswith("창원시"):
            changwon.append(geom)
        else:
            others.append(geom)
    return others, changwon


def collect_multi_arcs(changwon: list[dict]) -> list:
    merged = []
    for geom in changwon:
        arcs = geom.get("arcs")
        if not arcs:
            continue
        if geom.get("type") == "Polygon":
            merged.append(arcs)
        elif geom.get("type") == "MultiPolygon":
            merged.extend(arcs)
    return merged


def build_merged_feature(arcs: list) -> dict:
    return {
        "type": "MultiPolygon",
        "arcs": arcs,
        "properties": {
            "name": "창원특례시",
            "base_year": "2018",
            "name_eng": "Changwon Special City",
            "code": "38110",
        },
    }


def main() -> None:
    topo = fetch_topo()
    object_key = next(iter(topo["objects"]))
    geoms = topo["objects"][object_key]["geometries"]

    others, changwon = extract_changwon_geoms(geoms)
    if not changwon:
        raise SystemExit("Changwon geometries not found")

    merged_arcs = collect_multi_arcs(changwon)
    if not merged_arcs:
        raise SystemExit("No arcs collected for Changwon merge")

    merged_feature = build_merged_feature(merged_arcs)
    topo["objects"][object_key]["geometries"] = others + [merged_feature]

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_PATH.open("w", encoding="utf-8") as f:
        json.dump(topo, f, ensure_ascii=False)

    print(f"Written merged topojson to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
