#!/bin/bash
# 캐시 비활성화 로컬 서버 (개발용)
python3 -c "
from http.server import HTTPServer, SimpleHTTPRequestHandler
class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()
print('http://localhost:8000 (캐시 비활성화)')
HTTPServer(('', 8000), NoCacheHandler).serve_forever()
" "$@"
