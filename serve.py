#!/usr/bin/env python3
"""
PMTiles-compatible development server with proper byte-range support.
Usage: python serve.py [port]
"""

import http.server
import socketserver
import sys
import os
import re

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000

class RangeHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Range, Content-Type')
        self.send_header('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges')
        self.send_header('Accept-Ranges', 'bytes')
        if self.path.endswith('.pmtiles'):
            self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_HEAD(self):
        print(f"HEAD {self.path}")
        return super().do_HEAD()

    def do_GET(self):
        # Only handle range requests for local files (not directories)
        range_header = self.headers.get('Range')

        if range_header:
            # Resolve file path
            path = self.translate_path(self.path)
            if os.path.isfile(path):
                self.send_range_response(path, range_header)
                return

        # Fall back to normal handling
        return super().do_GET()

    def send_range_response(self, path, range_header):
        file_size = os.path.getsize(path)

        # Parse Range: bytes=START-END
        match = re.match(r'bytes=(\d*)-(\d*)', range_header)
        if not match:
            self.send_error(400, 'Invalid Range header')
            return

        start_str, end_str = match.group(1), match.group(2)

        if start_str == '':
            # Suffix range: bytes=-N  (last N bytes)
            start = file_size - int(end_str)
            end   = file_size - 1
        else:
            start = int(start_str)
            end   = int(end_str) if end_str else file_size - 1

        # Clamp
        end = min(end, file_size - 1)

        if start > end or start >= file_size:
            self.send_response(416)  # Range Not Satisfiable
            self.send_header('Content-Range', f'bytes */{file_size}')
            self.end_headers()
            return

        length = end - start + 1

        print(f"GET {self.path}  Range: bytes={start}-{end}/{file_size}  ({length:,} bytes)")

        ctype = self.guess_type(path)

        self.send_response(206)  # Partial Content
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(length))
        self.send_header('Content-Range', f'bytes {start}-{end}/{file_size}')
        self.end_headers()

        try:
            with open(path, 'rb') as f:
                f.seek(start)
                remaining = length
                while remaining > 0:
                    chunk = f.read(min(65536, remaining))
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    remaining -= len(chunk)
        except (ConnectionAbortedError, BrokenPipeError):
            pass  # Client disconnected — normal for tile loading

    def guess_type(self, path):
        if str(path).endswith('.pmtiles'):
            return 'application/vnd.pmtiles'
        return super().guess_type(path)

    def log_message(self, format, *args):
        # Suppress the default double-logging; our do_GET prints already
        pass


# ── Boot ──────────────────────────────────────────────────────────────────────
script_dir = os.path.dirname(os.path.abspath(__file__))
os.chdir(script_dir)

print("=" * 60)
print("PMTiles Development Server (range-request enabled)")
print("=" * 60)
print(f"URL:       http://localhost:{PORT}")
print(f"Directory: {os.getcwd()}")

if os.path.exists('parcels.pmtiles'):
    size = os.path.getsize('parcels.pmtiles')
    print(f"PMTiles:   ✓ parcels.pmtiles ({size:,} bytes)")
else:
    print("PMTiles:   ⚠ parcels.pmtiles NOT FOUND")

print("=" * 60)
print()

try:
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(("", PORT), RangeHTTPRequestHandler) as httpd:
        httpd.serve_forever()
except KeyboardInterrupt:
    print("\nServer stopped.")
    sys.exit(0)
except OSError as e:
    if e.errno in (48, 98):
        print(f"Port {PORT} already in use. Try: python serve.py 8001")
    else:
        print(f"Error: {e}")
    sys.exit(1)