"""Standalone server for PiResearch Galaxy.

Serves the built bundle under ``/galaxy/`` (SPA fallback to ``index.html``)
and forwards every other path (``/api/*``, the 2D pages ``/`` and
``/study/*``) unchanged to the existing ``constellation.serve``.

    python3 galaxy/serve.py --upstream http://127.0.0.1:8765 \
        --host 127.0.0.1 --port 8766 [--dist galaxy/dist]

Standard library only; runs on Python 3.9+.
"""

from __future__ import annotations

import argparse
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
    dist = Path(__file__).resolve().parent / "dist"
    quiet = False

    # -- routing ---------------------------------------------------------

    def do_GET(self) -> None:
        self._route(send_body=True)

    def do_HEAD(self) -> None:
        self._route(send_body=False)

    def do_POST(self) -> None:
        self._proxy(send_body=True)

    def do_DELETE(self) -> None:
        self._proxy(send_body=True)

    def _route(self, send_body: bool) -> None:
        path = urlsplit(self.path).path
        if path == "/galaxy":
            query = urlsplit(self.path).query
            self._send(301, b"", {"Location": PREFIX + ("?" + query if query else ""), "Cache-Control": "no-cache"}, send_body)
            return
        if path.startswith(PREFIX):
            self._static(path, send_body)
            return
        self._proxy(send_body=send_body)

    # -- static bundle ---------------------------------------------------

    def _resolve(self, path: str) -> Optional[Path]:
        relative = posixpath.normpath(unquote(path[len(PREFIX):]))
        if relative in ("", "."):
            return None
        if relative.startswith("..") or relative.startswith("/"):
            return None
        root = self.dist.resolve()
        candidate = (root / relative).resolve()
        try:
            candidate.relative_to(root)
        except ValueError:
            return None
        return candidate if candidate.is_file() else None

    def _static(self, path: str, send_body: bool) -> None:
        target = self._resolve(path)
        immutable = target is not None and path.startswith(PREFIX + "assets/")
        if target is None:
            if path.startswith(PREFIX + "assets/"):
                self._send(404, b"not found", {"Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store"}, send_body)
                return
            target = self.dist / "index.html"
            if not target.is_file():
                message = "galaxy bundle not built: run `pnpm build` in galaxy/".encode("utf-8")
                self._send(503, message, {"Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store"}, send_body)
                return
        body = target.read_bytes()
        headers = {
            "Content-Type": content_type(target),
            "Cache-Control": "public, max-age=31536000, immutable" if immutable else "no-cache",
        }
        if target.name == "index.html":
            headers["Cache-Control"] = "no-cache"
        self._send(200, body, headers, send_body)

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
            # Do not buffer huge bodies; the unread rest forces a close.
            self.close_connection = True
            return None, 413
        return self.rfile.read(size), 0

    def _proxy(self, send_body: bool) -> None:
        body, problem = self._read_body() if self.command in ("POST", "DELETE") else (None, 0)
        if problem:
            self.close_connection = True
            text = b"request too large" if problem == 413 else b"bad request"
            self._send(problem, text, {"Content-Type": "text/plain; charset=utf-8", "Connection": "close"}, True)
            return
        headers = {}
        for name in FORWARD_REQUEST_HEADERS:
            value = self.headers.get(name)
            if value is not None:
                headers[name] = value
        if body is not None:
            headers["Content-Length"] = str(len(body))
        request = Request(self.upstream.rstrip("/") + self.path, data=body, headers=headers, method=self.command)
        try:
            response = _opener.open(request, timeout=UPSTREAM_TIMEOUT)
        except HTTPError as error:  # 304, 3xx (not followed), 4xx, 5xx
            try:
                payload = error.read()
            except Exception:  # noqa: BLE001 - a broken error body is still a response
                payload = b""
            self._relay(error.code, error.headers, payload, send_body)
            return
        except (URLError, OSError, ValueError):
            self._send(502, UNAVAILABLE, {"Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store"}, send_body)
            return
        try:
            payload = response.read()
            status = response.status
            upstream_headers = response.headers
        except OSError:
            self._send(502, UNAVAILABLE, {"Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store"}, send_body)
            return
        finally:
            response.close()
        self._relay(status, upstream_headers, payload, send_body)

    def _relay(self, status: int, upstream_headers, payload: bytes, send_body: bool) -> None:
        headers = {}
        if upstream_headers is not None:
            for name in FORWARD_RESPONSE_HEADERS:
                value = upstream_headers.get(name)
                if value is not None:
                    headers[name] = value
        if self.command == "HEAD":
            # HEAD has no body; keep upstream's length so the client sees the real size.
            length = upstream_headers.get("Content-Length") if upstream_headers is not None else None
            self._send(status, b"", headers, False, length)
            return
        self._send(status, payload, headers, send_body)

    # -- output ----------------------------------------------------------

    def _send(self, status: int, body: bytes, headers: dict, send_body: bool, length: Optional[str] = None) -> None:
        bodiless = status == 304 or status == 204 or 100 <= status < 200
        self.send_response(status)
        for name, value in headers.items():
            self.send_header(name, value)
        if not bodiless:
            self.send_header("Content-Length", length if length is not None else str(len(body)))
        self.end_headers()
        if send_body and not bodiless and self.command != "HEAD" and body:
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
