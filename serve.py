#!/usr/bin/env python3
"""
Simple HTTP server for serving PMTiles files with proper headers.
This fixes the content-length header issue when serving .pmtiles files.

Usage:
    python3 serve.py [port]

Default port is 8000
"""

import http.server
import socketserver
import sys
import os
from functools import partial

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000

class PMTilesHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    """HTTP request handler with proper headers for PMTiles files"""
    
    def end_headers(self):
        # Add CORS headers to allow cross-origin requests
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Range, Content-Type')
        self.send_header('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges')
        
        # Enable byte-range requests for PMTiles (CRITICAL!)
        self.send_header('Accept-Ranges', 'bytes')
        
        # Cache control for PMTiles
        if self.path.endswith('.pmtiles'):
            self.send_header('Cache-Control', 'public, max-age=31536000')
        
        super().end_headers()
    
    def do_OPTIONS(self):
        """Handle OPTIONS requests for CORS preflight"""
        self.send_response(200)
        self.end_headers()
    
    def guess_type(self, path):
        """Override to add PMTiles MIME type"""
        if path.endswith('.pmtiles'):
            return 'application/vnd.pmtiles'
        return super().guess_type(path)
    
    def do_GET(self):
        """Handle GET requests with proper range support"""
        # Log the request
        print(f"GET {self.path}")
        if 'Range' in self.headers:
            print(f"  Range: {self.headers['Range']}")
        
        # Use parent's implementation which handles ranges
        return super().do_GET()
    
    def do_HEAD(self):
        """Handle HEAD requests"""
        print(f"HEAD {self.path}")
        return super().do_HEAD()

# Change to the directory where this script is located
script_dir = os.path.dirname(os.path.abspath(__file__))
os.chdir(script_dir)

print("=" * 60)
print(f"PMTiles Development Server")
print("=" * 60)
print(f"Server: http://localhost:{PORT}")
print(f"Directory: {os.getcwd()}")
print(f"\nFeatures:")
print(f"  ✓ CORS enabled")
print(f"  ✓ Range requests supported")
print(f"  ✓ PMTiles MIME type set")
print(f"\nOpen http://localhost:{PORT} in your browser")
print(f"Press Ctrl+C to stop")
print("=" * 60)
print()

# Check if parcels.pmtiles exists
if os.path.exists('parcels.pmtiles'):
    size = os.path.getsize('parcels.pmtiles')
    print(f"✓ Found parcels.pmtiles ({size:,} bytes)")
else:
    print(f"⚠ Warning: parcels.pmtiles not found in {os.getcwd()}")
    print(f"  Make sure your PMTiles file is in this directory")

print()

try:
    # Use ThreadingTCPServer for better performance
    with socketserver.ThreadingTCPServer(("", PORT), PMTilesHTTPRequestHandler) as httpd:
        httpd.allow_reuse_address = True
        httpd.serve_forever()
except KeyboardInterrupt:
    print("\n\nServer stopped.")
    sys.exit(0)
except OSError as e:
    if e.errno == 48:  # Address already in use
        print(f"\n✗ Error: Port {PORT} is already in use")
        print(f"  Try a different port: python3 serve.py 8001")
    else:
        print(f"\n✗ Error: {e}")
    sys.exit(1)
