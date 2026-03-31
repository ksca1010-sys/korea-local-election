#!/bin/bash
# Deploy to Cloudflare Pages - excludes large pipeline geojson files that exceed 25MB limit

DIST_DIR=".deploy_dist"

echo "Running pre-deploy quality checks..."
python3 scripts/audit_numeric_fields.py || { echo "audit_numeric_fields 검증 실패 — 배포 중단"; exit 1; }

echo "Preparing deployment directory..."
rm -rf "$DIST_DIR"
rsync -a --exclude=".deploy_dist" \
  --exclude="data/대한민국_광역자치단체_경계_2017.geojson" \
  --exclude="data/대한민국_기초자치단체_경계_2017.geojson" \
  --exclude="data/서울시_집계구_2016.geojson" \
  --exclude="data/서울시_기초구역_2018.geojson" \
  --exclude="data/전국_광역지자체_2018.geojson" \
  --exclude="data/council/hangjeongdong_2026.geojson" \
  --exclude="scripts/" \
  --exclude="*_byulpyo/" \
  --exclude="prd/" \
  --exclude="__pycache__/" \
  --exclude="*.pyc" \
  --exclude=".env" \
  --exclude="node_modules/" \
  --exclude=".wrangler/" \
  --exclude=".git/" \
  --exclude=".claude/" \
  --exclude=".omc/" \
  --exclude=".vscode/" \
  --exclude=".planning/" \
  --exclude="deploy.sh" \
  . "$DIST_DIR/"

echo "Minifying JS..."
DEPLOY_DIST="$DIST_DIR" node build.js || { echo "esbuild minify 실패 — 배포 중단"; exit 1; }

echo "Deploying from $DIST_DIR..."
npx wrangler pages deploy "$DIST_DIR" --project-name korea-local-eletion --branch main --commit-dirty=true

echo "Cleaning up..."
rm -rf "$DIST_DIR"
