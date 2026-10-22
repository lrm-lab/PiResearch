"""Tests for prism/serve.py (stdlib unittest; run: python3 prism/test_serve.py)."""

from __future__ import annotations

import gzip
import http.client
import json
import socket
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import serve  # noqa: E402

ETAG = 'W/"abc123"'
SNAPSHOT = json.dumps({"ok": True, "revision": "r1", "nodes": ["x" * 2000]}).encode("utf-8")
GZIPPED = gzip.compress(SNAPSHOT)


class FakeUpstream(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    seen: list = []

    def log_message(self, format, *args):  # noqa: A002
        pass

    def _reply(self, status, body=b"", headers=None):
        self.send_response(status)
        for name, value in (headers or {}).items():
            self.send_header(name, value)
        if status != 304:
            self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if status != 304 and self.command != "HEAD":
            self.wfile.write(body)

    def _record(self, body=b""):
        FakeUpstream.seen.append({"method": self.command, "path": self.path, "headers": dict(self.headers), "body": body})

    def do_GET(self):
        self._record()
        if self.path.startswith("/api/studies/s/1/snapshot"):
            if self.headers.get("If-None-Match") == ETAG:
                self._reply(304, headers={"ETag": ETAG, "Cache-Control": "private, no-cache", "Vary": "Accept-Encoding"})
                return
            if "gzip" in (self.headers.get("Accept-Encoding") or ""):
                self._reply(200, GZIPPED, {
                    "Content-Type": "application/json; charset=utf-8",
                    "Content-Encoding": "gzip",
                    "ETag": ETAG,
                    "Vary": "Accept-Encoding",
                    "Cache-Control": "private, no-cache",
                })
                return
            self._reply(200, SNAPSHOT, {"Content-Type": "application/json; charset=utf-8", "ETag": ETAG})
            return
        if self.path == "/":
            self._reply(200, "<html>开始研究</html>".encode("utf-8"), {"Content-Type": "text/html; charset=utf-8"})
            return
        if self.path.startswith("/study/"):
            self._reply(200, "<html>主页</html>".encode("utf-8"), {"Content-Type": "text/html; charset=utf-8"})
            return
        if self.path == "/moved":
            self._reply(302, b"", {"Location": "/elsewhere"})
            return
        if self.path == "/boom":
            self._reply(500, b'{"error":"boom"}', {"Content-Type": "application/json"})
            return
        self._reply(404, b"not found", {"Content-Type": "text/plain; charset=utf-8"})

    def do_HEAD(self):
        self.do_GET()

    def do_POST(self):
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length)
        self._record(body)
        payload = json.loads(body.decode("utf-8"))
        reply = json.dumps({"echo": payload, "type": self.headers.get("Content-Type")}, ensure_ascii=False).encode("utf-8")
        self._reply(200, reply, {"Content-Type": "application/json; charset=utf-8"})

    def do_DELETE(self):
        self._record()
        if self.path == "/api/studies/s/1":
            self._reply(200, b'{"ok":true}', {"Content-Type": "application/json"})
        else:
            self._reply(404, '{"error":"没有这项研究。"}'.encode("utf-8"), {"Content-Type": "application/json"})


def start(server):
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server


def dead_port() -> int:
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    return port


class PrismServeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        dist = Path(cls.tmp.name) / "dist"
        (dist / "assets").mkdir(parents=True)
        (dist / "index.html").write_text("<!doctype html><div id=root></div>", encoding="utf-8")
        (dist / "assets" / "index-abc123.js").write_text("console.log(1)", encoding="utf-8")
        (dist / "assets" / "index-abc123.css").write_text("body{}", encoding="utf-8")
        (dist / "assets" / "logo.svg").write_text("<svg/>", encoding="utf-8")
        (dist / "assets" / "draco.wasm").write_bytes(b"\0asm")
        (dist / "robots.txt").write_text("ok", encoding="utf-8")
        cls.dist = dist
        cls.upstream = start(serve.PrismServer(("127.0.0.1", 0), FakeUpstream))
        upstream_url = f"http://127.0.0.1:{cls.upstream.server_address[1]}"
        cls.proxy = start(serve.make_server(upstream_url, "127.0.0.1", 0, dist, quiet=True))
        cls.port = cls.proxy.server_address[1]

    @classmethod
    def tearDownClass(cls):
        cls.proxy.shutdown()
        cls.proxy.server_close()
        cls.upstream.shutdown()
        cls.upstream.server_close()
        cls.tmp.cleanup()

    def setUp(self):
        FakeUpstream.seen = []

    def request(self, method, path, body=None, headers=None, port=None):
        conn = http.client.HTTPConnection("127.0.0.1", port or self.port, timeout=10)
        try:
            conn.request(method, path, body=body, headers=headers or {})
            response = conn.getresponse()
            return response.status, dict(response.getheaders()), response.read()
        finally:
            conn.close()

    # -- proxy -----------------------------------------------------------

    def test_304_passes_through_with_etag(self):
        status, headers, body = self.request("GET", "/api/studies/s/1/snapshot", headers={"If-None-Match": ETAG})
        self.assertEqual(status, 304)
        self.assertEqual(headers.get("ETag"), ETAG)
        self.assertEqual(headers.get("Cache-Control"), "private, no-cache")
        self.assertEqual(body, b"")
        self.assertEqual(FakeUpstream.seen[-1]["headers"].get("If-None-Match"), ETAG)

    def test_gzip_body_is_passed_through_untouched(self):
        status, headers, body = self.request("GET", "/api/studies/s/1/snapshot", headers={"Accept-Encoding": "gzip"})
        self.assertEqual(status, 200)
        self.assertEqual(headers.get("Content-Encoding"), "gzip")
        self.assertEqual(headers.get("Vary"), "Accept-Encoding")
        self.assertEqual(headers.get("ETag"), ETAG)
        self.assertEqual(body, GZIPPED)
        self.assertEqual(headers.get("Content-Length"), str(len(GZIPPED)))
        self.assertEqual(gzip.decompress(body), SNAPSHOT)

    def test_plain_body_and_query_string(self):
        status, headers, body = self.request("GET", "/api/studies/s/1/snapshot?x=1")
        self.assertEqual(status, 200)
        self.assertEqual(body, SNAPSHOT)
        self.assertEqual(FakeUpstream.seen[-1]["path"], "/api/studies/s/1/snapshot?x=1")

    def test_post_body_and_content_type_are_forwarded(self):
        payload = json.dumps({"question": "土地财政怎么转型？"}, ensure_ascii=False).encode("utf-8")
        status, _, body = self.request("POST", "/api/questions", body=payload, headers={"Content-Type": "application/json"})
        self.assertEqual(status, 200)
        reply = json.loads(body.decode("utf-8"))
        self.assertEqual(reply["echo"], {"question": "土地财政怎么转型？"})
        self.assertEqual(reply["type"], "application/json")
        self.assertEqual(FakeUpstream.seen[-1]["body"], payload)

    def test_delete_is_forwarded_with_status(self):
        status, _, body = self.request("DELETE", "/api/studies/s/1")
        self.assertEqual((status, body), (200, b'{"ok":true}'))
        self.assertEqual(FakeUpstream.seen[-1]["method"], "DELETE")
        status, _, body = self.request("DELETE", "/api/studies/s/2")
        self.assertEqual(status, 404)
        self.assertEqual(json.loads(body.decode("utf-8")), {"error": "没有这项研究。"})

    def test_2d_pages_and_errors_are_proxied(self):
        status, headers, body = self.request("GET", "/")
        self.assertEqual(status, 200)
        self.assertIn("开始研究", body.decode("utf-8"))
        self.assertTrue(headers["Content-Type"].startswith("text/html"))
        status, _, body = self.request("GET", "/study/sessions/20261020-101500/1")
        self.assertIn("主页", body.decode("utf-8"))
        status, _, body = self.request("GET", "/boom")
        self.assertEqual((status, body), (500, b'{"error":"boom"}'))
        status, headers, _ = self.request("GET", "/moved")
        self.assertEqual(status, 302)
        self.assertEqual(headers.get("Location"), "/elsewhere")

    def test_head_is_proxied_without_body(self):
        status, headers, body = self.request("HEAD", "/")
        self.assertEqual(status, 200)
        self.assertEqual(body, b"")
        self.assertEqual(FakeUpstream.seen[-1]["method"], "HEAD")

    def test_keep_alive_serves_several_requests(self):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        try:
            for path in ("/prism/", "/api/studies/s/1/snapshot", "/prism/assets/index-abc123.js"):
                conn.request("GET", path)
                response = conn.getresponse()
                self.assertEqual(response.status, 200)
                response.read()
            conn.request("GET", "/api/studies/s/1/snapshot", headers={"If-None-Match": ETAG})
            response = conn.getresponse()
            self.assertEqual(response.status, 304)
            response.read()
            conn.request("GET", "/prism/")
            response = conn.getresponse()
            self.assertEqual(response.status, 200)
            response.read()
        finally:
            conn.close()

    def test_502_when_upstream_is_down(self):
        server = start(serve.make_server(f"http://127.0.0.1:{dead_port()}", "127.0.0.1", 0, self.dist, quiet=True))
        try:
            status, headers, body = self.request("GET", "/api/history?compact=1", port=server.server_address[1])
            self.assertEqual(status, 502)
            self.assertTrue(headers["Content-Type"].startswith("application/json"))
            self.assertEqual(json.loads(body.decode("utf-8")), {"ok": False, "message": "研究服务暂时不可用。"})
            # The bundle is still served.
            status, _, _ = self.request("GET", "/prism/", port=server.server_address[1])
            self.assertEqual(status, 200)
        finally:
            server.shutdown()
            server.server_close()

    # -- static ----------------------------------------------------------

    def test_spa_fallback(self):
        for path in ("/prism/", "/prism/study/sessions/20261020-101500/1", "/prism/study/land/1/", "/prism/anything?q=1"):
            status, headers, body = self.request("GET", path)
            self.assertEqual(status, 200, path)
            self.assertEqual(body, b"<!doctype html><div id=root></div>", path)
            self.assertEqual(headers["Content-Type"], "text/html; charset=utf-8")
            self.assertEqual(headers["Cache-Control"], "no-cache")
        self.assertEqual(FakeUpstream.seen, [])

    def test_bare_prism_redirects(self):
        status, headers, _ = self.request("GET", "/prism")
        self.assertEqual(status, 301)
        self.assertEqual(headers["Location"], "/prism/")

    def test_asset_cache_headers_and_types(self):
        status, headers, body = self.request("GET", "/prism/assets/index-abc123.js")
        self.assertEqual((status, body), (200, b"console.log(1)"))
        self.assertEqual(headers["Cache-Control"], "public, max-age=31536000, immutable")
        self.assertEqual(headers["Content-Type"], "text/javascript; charset=utf-8")
        self.assertEqual(headers["Content-Length"], str(len(body)))
        expected = {
            "/prism/assets/index-abc123.css": "text/css; charset=utf-8",
            "/prism/assets/logo.svg": "image/svg+xml",
            "/prism/assets/draco.wasm": "application/wasm",
        }
        for path, kind in expected.items():
            status, headers, _ = self.request("GET", path)
            self.assertEqual(status, 200, path)
            self.assertEqual(headers["Content-Type"], kind, path)
        # Files outside assets/ are not immutable.
        status, headers, _ = self.request("GET", "/prism/robots.txt")
        self.assertEqual(headers["Cache-Control"], "no-cache")

    def test_missing_asset_is_404_not_index(self):
        status, _, body = self.request("GET", "/prism/assets/missing-000.js")
        self.assertEqual(status, 404)
        self.assertNotIn(b"root", body)

    def test_head_static(self):
        status, headers, body = self.request("HEAD", "/prism/assets/index-abc123.js")
        self.assertEqual(status, 200)
        self.assertEqual(body, b"")
        self.assertEqual(headers["Content-Length"], str(len(b"console.log(1)")))

    def test_path_escape_is_rejected(self):
        secret = Path(self.tmp.name) / "secret.txt"
        secret.write_text("secret", encoding="utf-8")
        for path in ("/prism/../secret.txt", "/prism/%2e%2e/secret.txt", "/prism/assets/../../secret.txt"):
            status, _, body = self.request("GET", path)
            self.assertNotIn(b"secret", body, path)

    def test_null_byte_is_not_a_file(self):
        status, _, _ = self.request("GET", "/prism/assets/%00.js")
        self.assertEqual(status, 404)
        status, headers, body = self.request("GET", "/prism/study/%00")
        self.assertEqual((status, body), (200, b"<!doctype html><div id=root></div>"))
        self.assertEqual(headers["Content-Type"], "text/html; charset=utf-8")
        self.assertEqual(FakeUpstream.seen, [])


if __name__ == "__main__":
    unittest.main()
