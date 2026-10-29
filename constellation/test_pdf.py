from __future__ import annotations

import json
import threading
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen

import pytest

from constellation.serve import make_home_server

HTML = "<!doctype html><html><head><style>@page { margin: 20mm }</style></head><body><h1>报告</h1><p>内容</p></body></html>"


@pytest.fixture
def server(tmp_path: Path):
    runs = tmp_path / "runs"
    httpd = make_home_server(runs, "127.0.0.1", 0)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{httpd.server_address[1]}"
    httpd.shutdown()
    httpd.server_close()


def _post_html(url: str, html: str):
    request = Request(url, data=html.encode("utf-8"), headers={"Content-Type": "text/html; charset=utf-8"})
    try:
        with urlopen(request) as response:
            return response.status, dict(response.headers), response.read()
    except HTTPError as error:
        return error.code, dict(error.headers), error.read()


def test_report_pdf_renders_or_501s(server):
    try:
        import weasyprint  # noqa: F401

        available = True
    except ImportError:
        available = False
    status, headers, body = _post_html(server + "/api/report.pdf?filename=" + quote("测试报告"), HTML)
    if not available:
        assert status == 501
        assert json.loads(body)["error"]
        return
    assert status == 200
    assert headers["Content-Type"] == "application/pdf"
    assert "attachment" in headers["Content-Disposition"]
    assert "%PDF" in body[:16].decode("latin-1")


def test_report_pdf_rejects_empty(server):
    request = Request(server + "/api/report.pdf", data=b"", method="POST")
    with pytest.raises(HTTPError) as info:
        urlopen(request)
    assert info.value.code == 400
