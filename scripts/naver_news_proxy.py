#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import ssl
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs, urlencode
from urllib.request import Request, urlopen

API_URL = "https://openapi.naver.com/v1/search/news.json"
PORT = int(os.environ.get("NEWS_PROXY_PORT", "8787"))

try:
    import certifi
except Exception:
    certifi = None


def fetch_news(query: str, display: int, sort: str) -> dict:
    client_id = os.environ.get("NAVER_CLIENT_ID")
    client_secret = os.environ.get("NAVER_CLIENT_SECRET")
    if not client_id or not client_secret:
        raise RuntimeError("Missing NAVER_CLIENT_ID/NAVER_CLIENT_SECRET")

    params = urlencode({"query": query, "display": display, "sort": sort})
    req = Request(f"{API_URL}?{params}")
    req.add_header("X-Naver-Client-Id", client_id)
    req.add_header("X-Naver-Client-Secret", client_secret)
    req.add_header("Accept", "application/json")

    ssl_ctx = ssl.create_default_context(cafile=certifi.where()) if certifi else ssl._create_unverified_context()

    with urlopen(req, timeout=20, context=ssl_ctx) as resp:
        body = resp.read().decode("utf-8")
        return json.loads(body)


class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path != "/api/news":
            self.send_response(404)
            self._cors()
            self.end_headers()
            self.wfile.write(b"Not Found")
            return

        qs = parse_qs(parsed.query)
        query = (qs.get("query") or [""])[0].strip()
        display = int((qs.get("display") or ["6"])[0])
        sort = (qs.get("sort") or ["date"])[0]

        if not query:
            self.send_response(400)
            self._cors()
            self.end_headers()
            self.wfile.write(b"Missing query")
            return

        display = max(1, min(display, 100))
        if sort not in ("date", "sim"):
            sort = "date"

        try:
            data = fetch_news(query, display, sort)
            payload = json.dumps(data, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self._cors()
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(payload)
        except Exception as exc:
            self.send_response(500)
            self._cors()
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(exc)}, ensure_ascii=False).encode("utf-8"))


def main() -> None:
    server = HTTPServer(("0.0.0.0", PORT), Handler)
    print(f"Naver news proxy running on http://localhost:{PORT}")
    server.serve_forever()


if __name__ == "__main__":
    main()
