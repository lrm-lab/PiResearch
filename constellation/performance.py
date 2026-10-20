"""Bounded snapshot caching and conditional, compressed HTTP responses."""
from __future__ import annotations

import gzip
import hashlib
import threading
from collections import OrderedDict
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from typing import Any, Callable


class SnapshotCache:
    """Coalesce concurrent reads of one signature; never cache failed builds."""

    def __init__(self, capacity: int = 48) -> None:
        self.capacity = capacity
        self._values: OrderedDict[Any, tuple[Any, Any]] = OrderedDict()
        self._building: set[Any] = set()
        self._condition = threading.Condition()

    def get(self, key: Any, signature: Any, build: Callable[[], Any]) -> Any:
        with self._condition:
            while key in self._building:
                self._condition.wait()
            current = self._values.get(key)
            if current is not None and current[0] == signature:
                self._values.move_to_end(key)
                return current[1]
            self._building.add(key)
        try:
            value = build()
        except BaseException:
            with self._condition:
                self._building.remove(key)
                self._condition.notify_all()
            raise
        with self._condition:
            self._values[key] = (signature, value)
            self._values.move_to_end(key)
            while len(self._values) > self.capacity:
                self._values.popitem(last=False)
            self._building.remove(key)
            self._condition.notify_all()
        return value


def file_stamp(path: Path) -> tuple[Any, ...]:
    try:
        stat = path.stat()
        return (str(path), stat.st_ino, stat.st_size, stat.st_mtime_ns, stat.st_ctime_ns)
    except FileNotFoundError:
        return (str(path), None)


_files = SnapshotCache(8)
_encoded = SnapshotCache(96)


def static_bytes(path: Path) -> bytes:
    return _files.get(str(path), file_stamp(path), path.read_bytes)


class ResponseHandler(BaseHTTPRequestHandler):
    """Explicit revalidation for HTML/API; mutations and errors never cache."""

    protocol_version = 'HTTP/1.1'

    def do_HEAD(self) -> None:  # noqa: N802
        self.do_GET()

    def _send(self, status: int, body: bytes, content_type: str) -> None:
        cacheable = status == 200 and self.command in {'GET', 'HEAD'}
        tag = 'W/"' + hashlib.sha256(body).hexdigest() + '"'
        cache_control = 'private, no-cache' if cacheable else 'no-store'
        if cacheable and any(token.strip() in {tag, tag[2:], '*'} for token in self.headers.get('If-None-Match', '').split(',')):
            self.send_response(304)
            self.send_header('ETag', tag)
            self.send_header('Cache-Control', cache_control)
            self.send_header('Vary', 'Accept-Encoding')
            self.end_headers()
            return
        encoding = ''
        accepted: dict[str, float] = {}
        for item in self.headers.get('Accept-Encoding', '').lower().split(','):
            parts = [part.strip() for part in item.split(';')]
            quality = 1.0
            for part in parts[1:]:
                if part.startswith('q='):
                    try:
                        quality = float(part[2:])
                    except ValueError:
                        quality = 0.0
            accepted[parts[0]] = quality
        if len(body) >= 1024 and accepted.get('gzip', accepted.get('*', 0)) > 0:
            body = _encoded.get(tag, tag, lambda: gzip.compress(body, compresslevel=5, mtime=0))
            encoding = 'gzip'
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', cache_control)
        self.send_header('Vary', 'Accept-Encoding')
        if cacheable:
            self.send_header('ETag', tag)
        if encoding:
            self.send_header('Content-Encoding', encoding)
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(body)
