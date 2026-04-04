#!/usr/bin/env python3
"""
갭 선거구 전수 스캔 스크립트
dong_count > matched_count 인 선거구를 모두 찾아 출력
"""
import json
import os
import sys

BASE = "/Users/isawufo/Desktop/AI-cording-project/korea-local-election/data/basic_council"
REGIONS = ["busan","chungbuk","chungnam","daegu","daejeon","gangwon",
           "gwangju","gyeongbuk","gyeonggi","gyeongnam","incheon",
           "jeonbuk","jeonnam","seoul","ulsan"]

gaps = []

for region in REGIONS:
    region_dir = os.path.join(BASE, region)
    if not os.path.isdir(region_dir):
        continue
    for fname in os.listdir(region_dir):
        if not fname.endswith(".geojson"):
            continue
        fpath = os.path.join(region_dir, fname)
        with open(fpath, encoding="utf-8") as f:
            try:
                gj = json.load(f)
            except Exception as e:
                print(f"ERROR reading {fpath}: {e}")
                continue
        for feat in gj.get("features", []):
            props = feat.get("properties", {})
            dc = props.get("dong_count", 0)
            mc = props.get("matched_count", 0)
            if dc > mc:
                gaps.append({
                    "region": region,
                    "file": fname,
                    "city": props.get("sggnm", props.get("city", "")),
                    "district": props.get("district_name", props.get("district", "")),
                    "dong_count": dc,
                    "matched_count": mc,
                    "gap": dc - mc,
                })

gaps.sort(key=lambda x: (x["region"], x["file"], x["district"]))
print(f"총 갭 선거구: {len(gaps)}건\n")
for g in gaps:
    print(f"  [{g['region']}] {g['file']} | {g['district']} | matched={g['matched_count']}/{g['dong_count']} (갭={g['gap']})")
