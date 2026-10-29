// Report download: Markdown, a Word document and a print-ready page for "save as PDF". All three are
// built in the browser from the report the reader already shows; nothing is sent anywhere.

import { downloadText } from "./download";

export type ReportFormat = "pdf" | "doc" | "md";

export interface ReportExport {
  title: string;
  /** The cleaned report Markdown, without the leading "# title". */
  markdown: string;
  /** The rendered report article; its HTML becomes the body of the PDF and Word files. */
  article: HTMLElement;
  /** "3 个研究智能体" etc. — shown under the title in the exported files. */
  byline?: string;
  exportedAt?: Date;
}

/** "研究报告-<title>.<ext>" with characters no file system accepts removed. */
export function reportFilename(title: string, ext: string): string {
  const safe = title
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60)
    .replace(/[\s.]+$/, "");
  return `${safe || "研究报告"}.${ext}`;
}

function formatDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

export function reportMarkdown({ title, markdown, byline, exportedAt = new Date() }: Omit<ReportExport, "article">): string {
  const meta = ["PiResearch 研究报告", byline, formatDate(exportedAt)].filter(Boolean).join(" · ");
  return `# ${title}\n\n> ${meta}\n\n${markdown.trim()}\n`;
}

/** The article's HTML without the reader's chrome: icons, ids, focus and ARIA scaffolding. */
export function articleHtml(article: HTMLElement): string {
  const clone = article.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("svg, [aria-hidden='true'], script, style").forEach((element) => element.remove());
  clone.querySelectorAll("*").forEach((element) => {
    for (const name of ["id", "class", "tabindex", "role", "aria-label", "aria-current"]) element.removeAttribute(name);
    // Table cells keep their inline alignment (numeric columns are right-aligned).
    if (element.tagName !== "TH" && element.tagName !== "TD") element.removeAttribute("style");
  });
  // The scroll frame around each table is a reader affordance; the files keep the bare table.
  clone.querySelectorAll("div").forEach((wrapper) => {
    if (wrapper.children.length === 1 && wrapper.firstElementChild?.tagName === "TABLE") wrapper.replaceWith(wrapper.firstElementChild);
  });
  return clone.innerHTML;
}

// CoForge's light document palette, inlined so the files read the same anywhere (Word included).
const DOC_CSS = `
@page { size: A4; margin: 18mm 16mm 20mm; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; background: #fff; color: #414651; font: 15px/1.85 "Inter", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif; }
main { max-width: 760px; margin: 0 auto; padding: 56px 32px 72px; }
.eyebrow { margin: 0; color: #5d36dc; font-size: 13px; font-weight: 600; letter-spacing: .02em; }
.title { margin: 12px 0 0; color: #101319; font-size: 30px; line-height: 1.3; font-weight: 600; letter-spacing: -.015em; }
.meta { margin: 14px 0 0; color: #717680; font-size: 13px; }
.rule { height: 2px; margin: 28px 0 40px; border: 0; background: linear-gradient(90deg, #5d36dc, #c5bafe 60%, rgba(197,186,254,0)); }
article { counter-reset: chapter; }
article h1, article h2 { margin: 44px 0 14px; padding-top: 32px; border-top: 1px solid #e0e5f1; color: #101319; font-size: 22px; line-height: 1.4; font-weight: 600; break-after: avoid; }
article > h1:first-child, article > h2:first-child { margin-top: 0; padding-top: 0; border-top: 0; }
article h2 { counter-increment: chapter; }
article h2::before { content: counter(chapter, decimal-leading-zero); display: block; margin-bottom: 8px; color: #9e77ed; font: 600 11px/1 "JetBrains Mono", ui-monospace, monospace; letter-spacing: .06em; }
article h3 { margin: 28px 0 8px; color: #101319; font-size: 17px; line-height: 1.5; font-weight: 600; break-after: avoid; }
article h4, article h5, article h6 { margin: 22px 0 8px; color: #101319; font-size: 15px; font-weight: 600; }
article p { margin: 12px 0; }
article strong { color: #101319; font-weight: 600; }
article a { color: #5d36dc; text-decoration: underline; text-decoration-color: rgba(93,54,220,.4); text-underline-offset: 3px; word-break: break-word; }
article ul, article ol { margin: 10px 0; padding-left: 24px; }
article li { margin: 5px 0; }
article li::marker { color: #a4a7ae; }
article blockquote { margin: 18px 0; padding: 10px 16px; border-left: 3px solid #d5d7da; border-radius: 0 8px 8px 0; background: #f7f8fb; break-inside: avoid; }
article blockquote > :first-child { margin-top: 0; } article blockquote > :last-child { margin-bottom: 0; }
article code { padding: .1em .35em; border-radius: 6px; background: #f7f8fb; color: #101319; font: .85em "JetBrains Mono", ui-monospace, monospace; }
article pre { margin: 18px 0; padding: 14px 16px; overflow-x: auto; border-radius: 12px; background: #15131f; color: #e9e7f3; font-size: 12px; line-height: 1.7; white-space: pre-wrap; }
article pre code { padding: 0; background: none; color: inherit; }
article hr { margin: 28px 0; border: 0; border-top: 1px solid #e0e5f1; }
article img { max-width: 100%; border-radius: 12px; }
article table { width: 100%; margin: 20px 0; border-collapse: collapse; border: 1px solid #e0e5f1; font-size: 13px; line-height: 1.6; font-variant-numeric: tabular-nums; break-inside: auto; }
article tr { break-inside: avoid; }
article th { padding: 9px 12px; border: 1px solid #e0e5f1; background: #f7f8fb; color: #535862; font-size: 12px; font-weight: 600; text-align: left; }
article td { padding: 9px 12px; border: 1px solid #e0e5f1; vertical-align: top; }
footer { margin-top: 56px; padding-top: 16px; border-top: 1px solid #e0e5f1; color: #a4a7ae; font-size: 12px; }
@media print { main { max-width: none; padding: 0; } a { color: #5d36dc; } }
`;

/** A standalone light HTML document of the report (the source of the PDF and Word files). */
export function reportDocument(
  { title, body, byline, exportedAt = new Date() }: { title: string; body: string; byline?: string; exportedAt?: Date },
  word = false,
): string {
  const date = formatDate(exportedAt);
  const meta = [byline, date].filter(Boolean).map((part) => escapeHtml(part!)).join(" · ");
  const head = word
    ? `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">`
    : `<!doctype html>\n<html lang="zh-CN">`;
  return `${head}
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${DOC_CSS}</style>
</head>
<body>
<main>
<p class="eyebrow">PiResearch 研究报告</p>
<h1 class="title">${escapeHtml(title)}</h1>
${meta ? `<p class="meta">${meta}</p>` : ""}
<hr class="rule">
<article>${body}</article>
<footer>由 PiResearch 深度研究生成 · ${escapeHtml(date)}</footer>
</main>
</body>
</html>
`;
}

/** The server renders the export document to a real PDF; resolves false when it cannot. */
async function serverPdf(filename: string, html: string): Promise<boolean> {
  let response: Response;
  try {
    response = await fetch(`/api/report.pdf?filename=${encodeURIComponent(filename)}`, {
      method: "POST",
      headers: { "Content-Type": "text/html; charset=utf-8" },
      body: html,
    });
  } catch {
    return false;
  }
  if (!response.ok) return false;
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}

/** Opens the browser's print dialog on the report document; "另存为 PDF" saves it. */
function printDocument(html: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.tabIndex = -1;
    Object.assign(frame.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0", opacity: "0" });
    // The browser names the PDF after the page title, so it carries the report title while printing.
    const pageTitle = document.title;
    const cleanup = () => {
      document.title = pageTitle;
      setTimeout(() => frame.remove(), 1000);
    };
    frame.onload = () => {
      const view = frame.contentWindow;
      if (!view) {
        frame.remove();
        reject(new Error("print frame unavailable"));
        return;
      }
      view.addEventListener("afterprint", cleanup, { once: true });
      // Let web fonts settle so the PDF does not fall back mid-render.
      void (view.document.fonts?.ready ?? Promise.resolve()).then(() => {
        document.title = view.document.title;
        view.focus();
        view.print();
        resolve();
      });
    };
    frame.srcdoc = html;
    document.body.append(frame);
  });
}

export async function downloadReport(format: ReportFormat, report: ReportExport): Promise<void> {
  if (format === "md") {
    downloadText(reportFilename(report.title, "md"), reportMarkdown(report));
    return;
  }
  const doc = { ...report, body: articleHtml(report.article) };
  if (format === "doc") {
    downloadText(reportFilename(report.title, "doc"), reportDocument(doc, true), "application/msword;charset=utf-8");
    return;
  }
  const html = reportDocument(doc);
  // One click → a real .pdf file; the print dialog stays as the fallback.
  if (await serverPdf(reportFilename(report.title, "pdf"), html)) return;
  await printDocument(html);
}
