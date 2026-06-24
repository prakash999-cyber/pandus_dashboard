import http.server
import socketserver
import json
import os
import sys

PORT = 8080

class LoggerHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path == '/api/log':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            try:
                log_entry = json.loads(post_data.decode('utf-8'))
                log_type = log_entry.get('type', 'log').upper()
                message = log_entry.get('message', '')
                
                # Write to browser_console.log
                with open('browser_console.log', 'a', encoding='utf-8') as f:
                    f.write(f"[{log_type}] {message}\n")
                
                # Print to stdout
                print(f"[BROWSER][{log_type}] {message}", flush=True)
                
                self.send_response(200)
                self.send_header('Content-Type', 'text/plain')
                self.end_headers()
                self.wfile.write(b'OK')
            except Exception as e:
                print(f"Error handling /api/log: {e}", file=sys.stderr, flush=True)
                self.send_response(500)
                self.end_headers()
                self.wfile.write(str(e).encode())
        else:
            self.send_response(404)
            self.end_headers()

# Change directory to the dashboard root
os.chdir(os.path.dirname(os.path.abspath(__file__)))

socketserver.TCPServer.allow_reuse_address = True

with socketserver.TCPServer(("", PORT), LoggerHTTPRequestHandler) as httpd:
    print(f"Serving at http://localhost:{PORT}", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server.", flush=True)
        sys.exit(0)
