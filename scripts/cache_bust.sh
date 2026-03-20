#!/bin/bash
# 캐시 버스트: index.html의 ?v=t 또는 ?v=숫자를 현재 타임스탬프로 교체
TS=$(date +%s)
sed -i '' "s/?v=[a-zA-Z0-9]*/?v=${TS}/g" index.html
echo "캐시 버스트: v=${TS}"
