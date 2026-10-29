"""Tests for galaxy/serve.py (stdlib unittest; run: python3 galaxy/test_serve.py)."""

from __future__ import annotations

import gzip
import hashlib
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
HOME_HTML = (
    '<!doctype html><html><body><header><a class="brand" href="/" title="回到主页">PiResearch</a></header>'
    '<main>开始研究</main><a href="/study/s/1">s</a>' + "x" * 2000 + "</body></html>"
).encode("utf-8")
STUDY_HTML = (
    '<!doctype html><html><body><header class="top"><a class="brand" href="/">PiResearch</a>'
    '<button id="open-report">报告</button></header>主页' + "y" * 2000 + "</body></html>"
).encode("utf-8")
PLAIN_HTML = b"<!doctype html><html><body>other</body></html>" + b" " * 2000


def page_etag(body: bytes) -> str:
    return 'W/"' + hashlib.sha256(body).hexdigest() + '"'


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
        if self.path.startswith("/study/plain/"):
            self._reply(200, b"not a page </body>", {"Content-Type": "text/plain; charset=utf-8"})
            return
        if self.path.split("?")[0] in ("/", "/index.html"):
            self._page(HOME_HTML)
            return
        if self.path.startswith("/study/"):
            self._page(STUDY_HTML)
            return
        if self.path == "/other.html":
            self._page(PLAIN_HTML)
            return
        if self.path == "/api/history":
            self._reply(200, b'{"rows":["</body>"]}', {"Content-Type": "application/json; charset=utf-8", "ETag": ETAG})
            return
        if self.path == "/moved":
            self._reply(302, b"", {"Location": "/elsewhere"})
            return
        if self.path == "/boom":
            self._reply(500, b'{"error":"boom"}', {"Content-Type": "application/json"})
            return
        self._reply(404, b"not found", {"Content-Type": "text/plain; charset=utf-8"})

    def _page(self, body):
        """Like constellation's ResponseHandler: weak sha256 ETag, 304, gzip when accepted."""
        tag = page_etag(body)
        tokens = [token.strip() for token in (self.headers.get("If-None-Match") or "").split(",")]
        common = {"ETag": tag, "Cache-Control": "private, no-cache", "Vary": "Accept-Encoding"}
        if tag in tokens:
            self._reply(304, headers=common)
            return
        headers = {"Content-Type": "text/html; charset=utf-8", **common}
        if "gzip" in (self.headers.get("Accept-Encoding") or ""):
            headers["Content-Encoding"] = "gzip"
            body = gzip.compress(body, mtime=0)
        self._reply(200, body, headers)

    def do_HEAD(self):
        self.do_GET()

    def do_POST(self):
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length)
        self._record(body)
        if self.path.endswith("/chat"):
            # A chat reply: an event stream with no length, flushed event by event.
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Connection", "close")
            self.end_headers()
            self.close_connection = True
            for event in (b"event: delta\ndata: {}\n\n", b": ping\n\n", b"event: done\ndata: {}\n\n"):
                self.wfile.write(event)
                self.wfile.flush()
            return
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


class GalaxyServeTest(unittest.TestCase):
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
        prism = Path(cls.tmp.name) / "prism-dist"
        (prism / "assets").mkdir(parents=True)
        (prism / "index.html").write_text("<!doctype html><div id=prism-root></div>", encoding="utf-8")
        (prism / "assets" / "prism-9f8e7d.js").write_text("console.log('prism')", encoding="utf-8")
        cls.prism_dist = prism
        cls.upstream = start(serve.GalaxyServer(("127.0.0.1", 0), FakeUpstream))
        upstream_url = f"http://127.0.0.1:{cls.upstream.server_address[1]}"
        cls.proxy = start(serve.make_server(upstream_url, "127.0.0.1", 0, dist, quiet=True, prism_dist=prism))
        cls.port = cls.proxy.server_address[1]
        cls.bare = start(serve.make_server(upstream_url, "127.0.0.1", 0, dist, quiet=True))  # no Prism dist
        cls.bare_port = cls.bare.server_address[1]

    @classmethod
    def tearDownClass(cls):
        cls.proxy.shutdown()
        cls.proxy.server_close()
        cls.bare.shutdown()
        cls.bare.server_close()
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

    def test_event_stream_is_relayed_without_buffering_headers(self):
        status, headers, body = self.request("POST", "/api/studies/s/1/chat", body=b'{"message":"hi"}', headers={"Content-Type": "application/json"})
        self.assertEqual(status, 200)
        self.assertTrue(headers.get("Content-Type", "").startswith("text/event-stream"))
        self.assertNotIn("Content-Length", headers)
        self.assertEqual(headers.get("X-Accel-Buffering"), "no")
        self.assertEqual(body, b"event: delta\ndata: {}\n\n: ping\n\nevent: done\ndata: {}\n\n")

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
        status, headers, body = self.request("HEAD", "/api/studies/s/1/snapshot")
        self.assertEqual(status, 200)
        self.assertEqual(body, b"")
        self.assertEqual(headers.get("Content-Length"), str(len(SNAPSHOT)))
        self.assertEqual(FakeUpstream.seen[-1]["method"], "HEAD")

    # -- 3D switch on the 2D pages -----------------------------------------

    def assert_switcher(self, text, galaxy, prism, two_d, label=""):
        self.assertIn(f'<nav class="pr-ui-switch" id="pr-ui-switch" aria-label="切换界面"><a href="{galaxy}" data-ui="galaxy"', text, label)
        self.assertIn(f'<a href="{prism}" data-ui="prism"', text, label)
        self.assertIn(f'<a href="{two_d}" data-ui="2d" title="2D 经典" aria-current="page">', text, label)
        self.assertEqual(text.count('aria-current="page"'), 1, label)  # 2D is the current frontend
        self.assertIn('localStorage.setItem("piresearch-ui"', text, label)

    def test_switch_is_injected_on_the_2d_home(self):
        for path in ("/index.html", "/", "/index.html?x=1"):
            status, headers, body = self.request("GET", path, headers={"Accept-Encoding": "gzip, br"})
            self.assertEqual(status, 200, path)
            self.assertNotIn("Content-Encoding", headers, path)
            self.assertEqual(headers["Content-Length"], str(len(body)), path)
            text = body.decode("utf-8")
            self.assert_switcher(text, "/galaxy/", "/prism/", "/index.html", path)
            self.assertEqual(text.count("pr-ui-switch-style"), 1, path)
            # Injected just before </body>, and the brand link stays in 2D.
            self.assertTrue(text.endswith("</script>\n</body></html>"), path)
            self.assertIn('class="brand" href="/index.html"', text, path)
            self.assertNotIn(' href="/"', text, path)
            self.assertIn('href="/study/s/1"', text, path)
            # Upstream was asked for an uncompressed body.
            self.assertIn(FakeUpstream.seen[-1]["headers"].get("Accept-Encoding", "identity"), ("identity", ""), path)

    def test_switch_is_injected_on_the_2d_study_page(self):
        status, headers, body = self.request("GET", "/study/x/1", headers={"Accept-Encoding": "gzip"})
        self.assertEqual(status, 200)
        text = body.decode("utf-8")
        self.assert_switcher(text, "/galaxy/study/x/1", "/prism/study/x/1", "/study/x/1")
        self.assertIn("主页", text)
        self.assertEqual(headers["Content-Length"], str(len(body)))
        status, _, body = self.request("GET", "/study/sessions/20261020-101500/1/?entry-preview=1")
        self.assert_switcher(body.decode("utf-8"), "/galaxy/study/sessions/20261020-101500/1", "/prism/study/sessions/20261020-101500/1", "/study/sessions/20261020-101500/1")

    def test_switch_target_is_escaped(self):
        status, _, body = self.request("GET", '/study/a"b<c>/1')
        text = body.decode("utf-8")
        for prefix in ("/galaxy/study/", "/prism/study/", "/study/"):
            self.assertIn(f'href="{prefix}a&quot;b&lt;c&gt;/1"', text)
        self.assertNotIn('a"b<c>', text)

    def test_no_switch_for_json_or_non_html(self):
        status, headers, body = self.request("GET", "/api/history", headers={"Accept-Encoding": "gzip"})
        self.assertEqual((status, body), (200, b'{"rows":["</body>"]}'))
        self.assertEqual(headers.get("ETag"), ETAG)
        self.assertEqual(FakeUpstream.seen[-1]["headers"].get("Accept-Encoding"), "gzip")
        status, headers, body = self.request("GET", "/study/plain/1")
        self.assertEqual((status, body), (200, b"not a page </body>"))
        status, headers, body = self.request("GET", "/nope")
        self.assertEqual((status, body), (404, b"not found"))

    def test_gzip_html_is_untouched_off_the_2d_pages(self):
        status, headers, body = self.request("GET", "/other.html", headers={"Accept-Encoding": "gzip"})
        self.assertEqual(status, 200)
        self.assertEqual(headers.get("Content-Encoding"), "gzip")
        self.assertEqual(headers.get("ETag"), page_etag(PLAIN_HTML))
        self.assertEqual(body, gzip.compress(PLAIN_HTML, mtime=0))
        self.assertEqual(gzip.decompress(body), PLAIN_HTML)
        self.assertEqual(FakeUpstream.seen[-1]["headers"].get("Accept-Encoding"), "gzip")

    def test_switch_etag_and_304(self):
        status, headers, body = self.request("GET", "/index.html")
        tag = headers["ETag"]
        upstream_tag = page_etag(HOME_HTML)
        self.assertEqual(tag, upstream_tag[:-1] + serve.SWITCH_ETAG_SUFFIX + '"')
        # Revalidating with our tag: upstream sees its own tag and the 304 carries ours.
        status, headers, body = self.request("GET", "/index.html", headers={"If-None-Match": tag})
        self.assertEqual((status, body), (304, b""))
        self.assertEqual(headers["ETag"], tag)
        self.assertEqual(FakeUpstream.seen[-1]["headers"].get("If-None-Match"), upstream_tag)
        # A tag for an uninjected copy (cached before the switch existed) never 304s.
        status, headers, body = self.request("GET", "/index.html", headers={"If-None-Match": upstream_tag})
        self.assertEqual(status, 200)
        self.assertIn(b"pr-ui-switch", body)
        self.assertEqual(headers["ETag"], tag)
        self.assertNotIn("If-None-Match", FakeUpstream.seen[-1]["headers"])
        # Mixed lists keep only our tags.
        status, _, _ = self.request("GET", "/index.html", headers={"If-None-Match": f'{upstream_tag}, W/"zzz", {tag}'})
        self.assertEqual(status, 304)
        self.assertEqual(FakeUpstream.seen[-1]["headers"].get("If-None-Match"), upstream_tag)
        # The study page uses the same scheme.
        _, headers, _ = self.request("GET", "/study/x/1")
        status, headers2, _ = self.request("GET", "/study/x/1", headers={"If-None-Match": headers["ETag"]})
        self.assertEqual(status, 304)
        self.assertEqual(headers2["ETag"], headers["ETag"])

    def test_head_on_2d_page_matches_injected_get(self):
        _, get_headers, body = self.request("GET", "/study/x/1")
        status, headers, head_body = self.request("HEAD", "/study/x/1")
        self.assertEqual((status, head_body), (200, b""))
        self.assertEqual(headers["Content-Length"], str(len(body)))
        self.assertEqual(headers["ETag"], get_headers["ETag"])
        self.assertEqual(FakeUpstream.seen[-1]["method"], "GET")

    def test_switch_helpers(self):
        home = {"galaxy": "/galaxy/", "prism": "/prism/", "2d": "/index.html"}
        self.assertEqual(serve.switch_targets("/"), home)
        self.assertEqual(serve.switch_targets("/index.html"), home)
        self.assertEqual(
            serve.switch_targets("/study/a/b/1/"),
            {"galaxy": "/galaxy/study/a/b/1", "prism": "/prism/study/a/b/1", "2d": "/study/a/b/1"},
        )
        for path in ("/study", "/study/", "/api/history", "/index.htm", "/galaxy/", "/prism/"):
            self.assertIsNone(serve.switch_targets(path), path)
        self.assertEqual(serve.inject_switch(b"<p>no body tag</p>", home)[:18], b"<p>no body tag</p>")
        self.assertIsNone(serve.tag_etag(None))
        self.assertIsNone(serve.tag_etag("unquoted"))
        self.assertIsNone(serve.untag_if_none_match('W/"abc", *'))

    def test_keep_alive_serves_several_requests(self):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        try:
            for path in ("/galaxy/", "/api/studies/s/1/snapshot", "/galaxy/assets/index-abc123.js"):
                conn.request("GET", path)
                response = conn.getresponse()
                self.assertEqual(response.status, 200)
                response.read()
            conn.request("GET", "/api/studies/s/1/snapshot", headers={"If-None-Match": ETAG})
            response = conn.getresponse()
            self.assertEqual(response.status, 304)
            response.read()
            conn.request("GET", "/galaxy/")
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
            self.assertEqual(json.loads(body.decode("utf-8")), {"ok": False, "message": "星图服务暂时不可用。"})
            # The bundle is still served.
            status, _, _ = self.request("GET", "/galaxy/", port=server.server_address[1])
            self.assertEqual(status, 200)
        finally:
            server.shutdown()
            server.server_close()

    # -- static ----------------------------------------------------------

    def test_spa_fallback(self):
        for path in ("/galaxy/", "/galaxy/study/sessions/20261020-101500/1", "/galaxy/study/land/1/", "/galaxy/anything?q=1"):
            status, headers, body = self.request("GET", path)
            self.assertEqual(status, 200, path)
            self.assertEqual(body, b"<!doctype html><div id=root></div>", path)
            self.assertEqual(headers["Content-Type"], "text/html; charset=utf-8")
            self.assertEqual(headers["Cache-Control"], "no-cache")
        self.assertEqual(FakeUpstream.seen, [])

    # -- Prism bundle ------------------------------------------------------

    def test_prism_spa_fallback_and_cache_rules_match_galaxy(self):
        for path in ("/prism/", "/prism/study/sessions/20261020-101500/1", "/prism/anything?q=1"):
            status, headers, body = self.request("GET", path)
            self.assertEqual(status, 200, path)
            self.assertEqual(body, b"<!doctype html><div id=prism-root></div>", path)
            self.assertEqual(headers["Content-Type"], "text/html; charset=utf-8")
            self.assertEqual(headers["Cache-Control"], "no-cache")
        status, headers, body = self.request("GET", "/prism/assets/prism-9f8e7d.js")
        self.assertEqual((status, body), (200, b"console.log('prism')"))
        self.assertEqual(headers["Cache-Control"], "public, max-age=31536000, immutable")
        self.assertEqual(headers["Content-Type"], "text/javascript; charset=utf-8")
        status, _, body = self.request("GET", "/prism/assets/missing-000.js")
        self.assertEqual(status, 404)
        self.assertNotIn(b"root", body)
        status, headers, body = self.request("HEAD", "/prism/assets/prism-9f8e7d.js")
        self.assertEqual((status, body), (200, b""))
        self.assertEqual(headers["Content-Length"], str(len(b"console.log('prism')")))
        # Galaxy's assets are not visible under /prism/ and the other way round.
        status, _, _ = self.request("GET", "/prism/assets/index-abc123.js")
        self.assertEqual(status, 404)
        status, _, _ = self.request("GET", "/galaxy/assets/prism-9f8e7d.js")
        self.assertEqual(status, 404)
        self.assertEqual(FakeUpstream.seen, [])

    def test_bare_prism_redirects(self):
        status, headers, _ = self.request("GET", "/prism")
        self.assertEqual(status, 301)
        self.assertEqual(headers["Location"], "/prism/")
        status, headers, _ = self.request("GET", "/prism?x=1")
        self.assertEqual(headers["Location"], "/prism/?x=1")
        self.assertEqual(FakeUpstream.seen, [])

    def test_prism_path_escape_is_rejected(self):
        secret = Path(self.tmp.name) / "secret.txt"
        secret.write_text("secret", encoding="utf-8")
        for path in ("/prism/../secret.txt", "/prism/%2e%2e/secret.txt", "/prism/assets/../../secret.txt", "/prism/assets/%00.js"):
            status, _, body = self.request("GET", path)
            self.assertNotIn(b"secret", body, path)

    def test_prism_falls_through_to_upstream_without_a_dist(self):
        for path in ("/prism/", "/prism/study/x/1", "/prism"):
            FakeUpstream.seen = []
            status, _, body = self.request("GET", path, port=self.bare_port)
            self.assertEqual(status, 404, path)
            self.assertEqual(body, b"not found", path)
            self.assertEqual(FakeUpstream.seen[-1]["path"], path)
        # A prism dist without an index.html counts as missing.
        empty = Path(self.tmp.name) / "empty-prism"
        empty.mkdir()
        server = start(serve.make_server(f"http://127.0.0.1:{self.upstream.server_address[1]}", "127.0.0.1", 0, self.dist, quiet=True, prism_dist=empty))
        try:
            status, _, body = self.request("GET", "/prism/", port=server.server_address[1])
            self.assertEqual((status, body), (404, b"not found"))
        finally:
            server.shutdown()
            server.server_close()

    def test_bare_galaxy_redirects(self):
        status, headers, _ = self.request("GET", "/galaxy")
        self.assertEqual(status, 301)
        self.assertEqual(headers["Location"], "/galaxy/")

    def test_asset_cache_headers_and_types(self):
        status, headers, body = self.request("GET", "/galaxy/assets/index-abc123.js")
        self.assertEqual((status, body), (200, b"console.log(1)"))
        self.assertEqual(headers["Cache-Control"], "public, max-age=31536000, immutable")
        self.assertEqual(headers["Content-Type"], "text/javascript; charset=utf-8")
        self.assertEqual(headers["Content-Length"], str(len(body)))
        expected = {
            "/galaxy/assets/index-abc123.css": "text/css; charset=utf-8",
            "/galaxy/assets/logo.svg": "image/svg+xml",
            "/galaxy/assets/draco.wasm": "application/wasm",
        }
        for path, kind in expected.items():
            status, headers, _ = self.request("GET", path)
            self.assertEqual(status, 200, path)
            self.assertEqual(headers["Content-Type"], kind, path)
        # Files outside assets/ are not immutable.
        status, headers, _ = self.request("GET", "/galaxy/robots.txt")
        self.assertEqual(headers["Cache-Control"], "no-cache")

    def test_missing_asset_is_404_not_index(self):
        status, _, body = self.request("GET", "/galaxy/assets/missing-000.js")
        self.assertEqual(status, 404)
        self.assertNotIn(b"root", body)

    def test_head_static(self):
        status, headers, body = self.request("HEAD", "/galaxy/assets/index-abc123.js")
        self.assertEqual(status, 200)
        self.assertEqual(body, b"")
        self.assertEqual(headers["Content-Length"], str(len(b"console.log(1)")))

    def test_path_escape_is_rejected(self):
        secret = Path(self.tmp.name) / "secret.txt"
        secret.write_text("secret", encoding="utf-8")
        for path in ("/galaxy/../secret.txt", "/galaxy/%2e%2e/secret.txt", "/galaxy/assets/../../secret.txt"):
            status, _, body = self.request("GET", path)
            self.assertNotIn(b"secret", body, path)

    def test_null_byte_is_not_a_file(self):
        status, _, _ = self.request("GET", "/galaxy/assets/%00.js")
        self.assertEqual(status, 404)
        status, headers, body = self.request("GET", "/galaxy/study/%00")
        self.assertEqual((status, body), (200, b"<!doctype html><div id=root></div>"))
        self.assertEqual(headers["Content-Type"], "text/html; charset=utf-8")
        self.assertEqual(FakeUpstream.seen, [])


if __name__ == "__main__":
    unittest.main()
