#!/bin/bash
# Deploy to Cloudflare Pages - excludes large pipeline geojson files that exceed 25MB limit

DIST_DIR=".deploy_dist"

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
  --exclude="deploy.sh" \
  . "$DIST_DIR/"

echo "Deploying from $DIST_DIR..."
npx wrangler pages deploy "$DIST_DIR" --project-name korea-local-eletion --branch main --commit-dirty=true

echo "Cleaning up..."
rm -rf "$DIST_DIR"
