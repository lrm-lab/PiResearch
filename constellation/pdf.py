"""Server-side report PDFs.

The page builds the same standalone HTML document it uses for "save as PDF" printing and POSTs it
here; WeasyPrint renders it to a real file (same stylesheet, so margins and layout match the
preview). WeasyPrint is an optional deploy dependency — when it is missing the endpoint answers
501 and the page falls back to the browser print dialog.
"""

from __future__ import annotations

from typing import Any

# Capped by the request handler as well; keep one bound here so the module is honest on its own.
MAX_HTML_BYTES = 4 * 1024 * 1024


class PdfUnavailable(RuntimeError):
    """WeasyPrint is not installed in this runtime."""


# The export document already names its font stack; these prepend the families that exist inside
# the container (fonts-noto-cjk) so CJK never falls back to a missing glyph.
_EXTRA_CSS = """
body { font-family: "Inter", "Noto Sans CJK SC", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif; }
code, pre { font-family: "JetBrains Mono", "Noto Sans Mono CJK SC", "Noto Sans CJK SC", monospace; }
"""


def _local_only(url: str) -> dict[str, Any]:
    """Allow only inline data: resources; remote fetches resolve to empty content (no SSRF surface)."""
    if url.startswith("data:"):
        from weasyprint.urls import default_url_fetcher

        return default_url_fetcher(url)
    return {"string": b"", "mime_type": "text/plain"}


def render_pdf(html: str) -> bytes:
    try:
        from weasyprint import CSS, HTML
    except ImportError as exc:
        raise PdfUnavailable("PDF 组件还没有装好，请稍后再试。") from exc
    document = HTML(string=html, base_url="about:blank", url_fetcher=_local_only)
    return document.write_pdf(stylesheets=[CSS(string=_EXTRA_CSS)])
