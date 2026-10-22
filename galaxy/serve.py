"""Standalone server for PiResearch Galaxy.

Serves the built bundle under ``/galaxy/`` (SPA fallback to ``index.html``)
and forwards every other path (``/api/*``, the 2D pages ``/`` and
``/study/*``) to the existing ``constellation.serve``. Responses pass through
byte for byte, except the 2D HTML pages, which get a small "切换到 3D" button
injected (see ``inject_switch``).

    python3 galaxy/serve.py --upstream http://127.0.0.1:8765 \
        --host 127.0.0.1 --port 8766 [--dist galaxy/dist]

Standard library only; runs on Python 3.9+.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import mimetypes
import posixpath
import socketserver
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Optional, Tuple
from urllib.error import HTTPError, URLError
from urllib.parse import unquote, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

PREFIX = "/galaxy/"
UNAVAILABLE = json.dumps({"ok": False, "message": "星图服务暂时不可用。"}, ensure_ascii=False).encode("utf-8")
FORWARD_REQUEST_HEADERS = ("If-None-Match", "Accept-Encoding", "Content-Type", "Content-Length", "Accept")
FORWARD_RESPONSE_HEADERS = ("ETag", "Content-Encoding", "Content-Type", "Cache-Control", "Vary", "Location")
UPSTREAM_TIMEOUT = 30
MAX_BODY = 1_000_000

# -- the "切换到 3D" switch on the 2D pages ------------------------------------
# Self-contained (inline style and script, no external requests). It is a fixed
# pill in the 2D pages' dark style; on the 2D study page it sits in the top bar
# next to 报告 instead. It hides itself inside the 2D home's study-preview iframe.
# Same-origin anchors to exactly "/" are pointed at "/index.html": production
# redirects "/" to the 3D home, and 2D navigation should stay in 2D.
SWITCH_TEMPLATE = """<style id="pr-galaxy-switch-style">
.pr-galaxy-switch{position:fixed;top:16px;right:20px;z-index:30;display:inline-flex;align-items:center;gap:7px;height:34px;padding:0 14px 0 11px;border:1px solid #ffffff1f;border-radius:999px;background:linear-gradient(180deg,#1c1c1ce8,#101010ed);color:#f4f4f5;font:560 13px/1 Inter,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;letter-spacing:.04em;text-decoration:none;white-space:nowrap;backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);box-shadow:0 10px 28px #0007,inset 0 1px 0 #ffffff0d;transition:border-color .18s ease,box-shadow .18s ease,background .18s ease}
.pr-galaxy-switch:hover{border-color:#7ee0ef66;background:linear-gradient(180deg,#232323f0,#141414f2);box-shadow:0 10px 28px #0007,0 0 0 4px #7ee0ef14,0 0 22px #6d9cff33}
.pr-galaxy-switch:focus-visible{outline:2px solid #fff;outline-offset:3px}
.pr-galaxy-switch svg{width:16px;height:16px;flex:none;color:#7ee0ef}
.pr-galaxy-switch.in-bar{position:static;flex:none;margin-left:auto;margin-right:10px}
.pr-galaxy-switch.in-bar+#open-report{margin-left:0}
@media(max-width:480px){.pr-galaxy-switch{top:12px;right:12px;padding:0 11px 0 9px}.pr-galaxy-switch .pr-long{display:none}.pr-galaxy-switch.in-bar{margin-right:8px}}
@media(prefers-reduced-motion:reduce){.pr-galaxy-switch{transition:none}}
</style>
<a class="pr-galaxy-switch" id="pr-galaxy-switch" href="__HREF__" title="切换到 3D 星系视图"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="2.4" fill="currentColor"/><ellipse cx="12" cy="12" rx="9.5" ry="3.8" stroke="currentColor" stroke-width="1.3" transform="rotate(-28 12 12)"/><ellipse cx="12" cy="12" rx="9.5" ry="3.8" stroke="currentColor" stroke-width=".9" opacity=".5" transform="rotate(38 12 12)"/></svg><span><span class="pr-long">切换到 </span>3D</span></a>
<script>(function(){var s=document.getElementById("pr-galaxy-switch");if(!s)return;
try{if(window.self!==window.top){s.remove();return}}catch(e){s.remove();return}
var r=document.getElementById("open-report");if(r&&r.parentNode){s.classList.add("in-bar");r.parentNode.insertBefore(s,r)}
function fix(a){if(a&&a.getAttribute&&a.getAttribute("href")==="/")a.setAttribute("href","/index.html")}
document.querySelectorAll('a[href="/"]').forEach(fix);
function on(e){var t=e.target;fix(t&&t.closest?t.closest("a[href]"):null)}
document.addEventListener("click",on,true);document.addEventListener("auxclick",on,true);document.addEventListener("contextmenu",on,true);
})();</script>
"""
# Clients revalidate injected pages with this suffix on the upstream ETag; it
# changes whenever the snippet does, so a cached copy never outlives it.
SWITCH_ETAG_SUFFIX = "-g3d" + hashlib.sha256(SWITCH_TEMPLATE.encode("utf-8")).hexdigest()[:8]


def switch_target(path: str) -> Optional[str]:
    """The 3D page for a 2D HTML page path, or None when the path is not one."""
    if path in ("/", "/index.html"):
        return PREFIX
    if path.startswith("/study/") and path.strip("/") != "study":
        return PREFIX + "study/" + path[len("/study/"):].strip("/")
    return None


def inject_switch(body: bytes, target: str) -> bytes:
    """Add the 3D switch before the last </body> (or at the end) and keep 2D links in 2D."""
    snippet = SWITCH_TEMPLATE.replace("__HREF__", html.escape(target, quote=True)).encode("utf-8")
    body = body.replace(b' href="/"', b' href="/index.html"')
    index = body.lower().rfind(b"</body>")
    if index < 0:
        return body + snippet
    return body[:index] + snippet + body[index:]


def tag_etag(etag: Optional[str]) -> Optional[str]:
    """W/"abc" -> W/"abc-g3d…" (None when the value is not a quoted entity tag)."""
    if not etag or not etag.endswith('"'):
        return None
    return etag[:-1] + SWITCH_ETAG_SUFFIX + '"'


def untag_if_none_match(value: Optional[str]) -> Optional[str]:
    """Forward only our own tags (suffix stripped); a tag for an uninjected copy must not 304."""
    if not value:
        return None
    marker = SWITCH_ETAG_SUFFIX + '"'
    tags = [token.strip() for token in value.split(",")]
    kept = [tag[: -len(marker)] + '"' for tag in tags if tag.endswith(marker)]
    return ", ".join(kept) or None

TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".map": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".wasm": "application/wasm",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".avif": "image/avif",
    ".gif": "image/gif",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".glb": "model/gltf-binary",
    ".gltf": "model/gltf+json",
    ".ktx2": "image/ktx2",
    ".hdr": "application/octet-stream",
    ".txt": "text/plain; charset=utf-8",
}


def content_type(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix in TYPES:
        return TYPES[suffix]
    guessed, _ = mimetypes.guess_type(path.name)
    return guessed or "application/octet-stream"


class _NoRedirect(HTTPRedirectHandler):
    """Hand 3xx responses back to the browser instead of following them."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: D401
        return None


_opener = build_opener(_NoRedirect)


class GalaxyHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "PiResearchGalaxy/1"
    upstream = "http://127.0.0.1:8765"
    # Resolved once here (and in make_server), not per request.
    dist = (Path(__file__).resolve().parent / "dist").resolve()
    quiet = False

    # -- routing ---------------------------------------------------------
    # HEAD gets the same status and headers as GET, never a body (see _send).

    def do_GET(self) -> None:
        self._route()

    def do_HEAD(self) -> None:
        self._route()

    def do_POST(self) -> None:
        self._proxy()

    def do_DELETE(self) -> None:
        self._proxy()

    def _route(self) -> None:
        path = urlsplit(self.path).path
        if path == "/galaxy":
            query = urlsplit(self.path).query
            self._send(301, b"", {"Location": PREFIX + ("?" + query if query else ""), "Cache-Control": "no-cache"})
            return
        if path.startswith(PREFIX):
            self._static(path)
            return
        self._proxy()

    # -- static bundle ---------------------------------------------------

    def _resolve(self, path: str) -> Optional[Path]:
        relative = posixpath.normpath(unquote(path[len(PREFIX):]))
        if relative in ("", "."):
            return None
        if relative.startswith("..") or relative.startswith("/"):
            return None
        root = self.dist
        try:
            candidate = (root / relative).resolve()
            candidate.relative_to(root)
            return candidate if candidate.is_file() else None
        except (ValueError, OSError):  # outside dist, or unusable (e.g. %00: embedded null byte)
            return None

    def _static(self, path: str) -> None:
        target = self._resolve(path)
        # Hashed bundle files are immutable; index.html (the SPA fallback included) always revalidates.
        immutable = target is not None and path.startswith(PREFIX + "assets/") and target.name != "index.html"
        if target is None:
            if path.startswith(PREFIX + "assets/"):
                self._send(404, b"not found", {"Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store"})
                return
            target = self.dist / "index.html"
            if not target.is_file():
                message = "galaxy bundle not built: run `pnpm build` in galaxy/".encode("utf-8")
                self._send(503, message, {"Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store"})
                return
        body = target.read_bytes()
        headers = {
            "Content-Type": content_type(target),
            "Cache-Control": "public, max-age=31536000, immutable" if immutable else "no-cache",
        }
        self._send(200, body, headers)

    # -- proxy -----------------------------------------------------------

    def _read_body(self) -> Tuple[Optional[bytes], int]:
        """The request body (None when absent) and an error status (0 when fine)."""
        length = self.headers.get("Content-Length")
        if not length:
            return None, 0
        try:
            size = int(length)
        except ValueError:
            return None, 400
        if size < 0:
            return None, 400
        if size > MAX_BODY:
            # Do not buffer huge bodies; the caller closes the connection over the unread rest.
            return None, 413
        return self.rfile.read(size), 0

    def _proxy(self) -> None:
        body, problem = self._read_body() if self.command in ("POST", "DELETE") else (None, 0)
        if problem:
            self.close_connection = True
            text = b"request too large" if problem == 413 else b"bad request"
            self._send(problem, text, {"Content-Type": "text/plain; charset=utf-8", "Connection": "close"})
            return
        # 2D HTML pages are fetched uncompressed (so the switch can be added),
        # revalidated with our own ETags, and HEAD is answered from a GET so
        # its Content-Length matches the injected body.
        target = switch_target(urlsplit(self.path).path) if self.command in ("GET", "HEAD") else None
        headers = {}
        for name in FORWARD_REQUEST_HEADERS:
            value = self.headers.get(name)
            if value is not None:
                headers[name] = value
        if target is not None:
            headers.pop("Accept-Encoding", None)
            tags = untag_if_none_match(headers.pop("If-None-Match", None))
            if tags:
                headers["If-None-Match"] = tags
        if body is not None:
            headers["Content-Length"] = str(len(body))
        method = "GET" if target is not None else self.command
        request = Request(self.upstream.rstrip("/") + self.path, data=body, headers=headers, method=method)
        try:
            response = _opener.open(request, timeout=UPSTREAM_TIMEOUT)
        except HTTPError as error:  # 304, 3xx (not followed), 4xx, 5xx
            try:
                payload = error.read()
            except Exception:  # noqa: BLE001 - a broken error body is still a response
                payload = b""
            self._relay(error.code, error.headers, payload, target)
            return
        except (URLError, OSError, ValueError):
            self._send_unavailable()
            return
        try:
            payload = response.read()
            status = response.status
            upstream_headers = response.headers
        except OSError:
            self._send_unavailable()
            return
        finally:
            response.close()
        self._relay(status, upstream_headers, payload, target)

    def _send_unavailable(self) -> None:
        """502 with the JSON body the front end shows (星图服务暂时不可用。)."""
        self._send(502, UNAVAILABLE, {"Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store"})

    def _relay(self, status: int, upstream_headers, payload: bytes, target: Optional[str] = None) -> None:
        headers = {}
        if upstream_headers is not None:
            for name in FORWARD_RESPONSE_HEADERS:
                value = upstream_headers.get(name)
                if value is not None:
                    headers[name] = value
        if target is not None and self._injectable(status, headers):
            payload = inject_switch(payload, target)
            self._retag(headers)
            self._send(status, payload, headers)  # _send drops the body for HEAD
            return
        if target is not None and status == 304:
            self._retag(headers)
        if self.command == "HEAD":
            # HEAD has no body; keep upstream's length so the client sees the real size.
            length = upstream_headers.get("Content-Length") if upstream_headers is not None else None
            self._send(status, b"", headers, length)
            return
        self._send(status, payload, headers)

    @staticmethod
    def _injectable(status: int, headers: dict) -> bool:
        kind = headers.get("Content-Type", "").split(";")[0].strip().lower()
        encoding = headers.get("Content-Encoding", "identity").strip().lower()
        return status == 200 and kind == "text/html" and encoding in ("", "identity")

    @staticmethod
    def _retag(headers: dict) -> None:
        tagged = tag_etag(headers.pop("ETag", None))
        if tagged:
            headers["ETag"] = tagged

    # -- output ----------------------------------------------------------

    def _send(self, status: int, body: bytes, headers: dict, length: Optional[str] = None) -> None:
        bodiless = status == 304 or status == 204 or 100 <= status < 200
        self.send_response(status)
        for name, value in headers.items():
            self.send_header(name, value)
        if not bodiless:
            self.send_header("Content-Length", length if length is not None else str(len(body)))
        self.end_headers()
        if not bodiless and self.command != "HEAD" and body:
            self.wfile.write(body)

    def log_message(self, format: str, *args) -> None:  # noqa: A002 - stdlib signature
        if not self.quiet:
            super().log_message(format, *args)


class GalaxyServer(ThreadingHTTPServer):
    daemon_threads = True

    def server_bind(self) -> None:
        # HTTPServer.server_bind resolves socket.getfqdn(host), which can stall
        # for tens of seconds on hosts with slow reverse DNS. The name is unused.
        socketserver.TCPServer.server_bind(self)
        host, port = self.server_address[:2]
        self.server_name = str(host)
        self.server_port = port

    def handle_error(self, request, client_address) -> None:
        # Browsers drop keep-alive connections all the time; that is not an error.
        if isinstance(sys.exc_info()[1], (ConnectionResetError, BrokenPipeError, ConnectionAbortedError)):
            return
        super().handle_error(request, client_address)


def make_server(upstream: str, host: str, port: int, dist: Path, quiet: bool = False) -> GalaxyServer:
    handler = type(
        "BoundGalaxyHandler",
        (GalaxyHandler,),
        {"upstream": upstream.rstrip("/"), "dist": Path(dist).resolve(), "quiet": quiet},
    )
    return GalaxyServer((host, port), handler)


def main(argv: Optional[list] = None) -> int:
    parser = argparse.ArgumentParser(description="Serve PiResearch Galaxy and proxy the constellation server.")
    parser.add_argument("--upstream", default="http://127.0.0.1:8765", help="constellation.serve base URL")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8766)
    parser.add_argument("--dist", type=Path, default=Path(__file__).resolve().parent / "dist")
    parser.add_argument("--quiet", action="store_true", help="no request log")
    args = parser.parse_args(argv)
    if not (args.dist / "index.html").is_file():
        print(f"warning: {args.dist}/index.html not found; run `pnpm build` in galaxy/", file=sys.stderr)
    server = make_server(args.upstream, args.host, args.port, args.dist, args.quiet)
    print(f"PiResearch Galaxy on http://{args.host}:{server.server_address[1]}/galaxy/ -> {args.upstream}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
