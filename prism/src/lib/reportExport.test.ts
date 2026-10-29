import { describe, expect, it } from "vitest";
import { reportDocument, reportFilename, reportMarkdown } from "./reportExport";

const at = new Date(2026, 9, 29, 9, 5);

describe("reportFilename", () => {
  it("keeps the title and drops characters file systems reject", () => {
    expect(reportFilename('土地出让/收入: "2021"?', "pdf")).toBe("土地出让 收入 2021.pdf");
  });

  it("falls back when nothing usable is left and caps long titles", () => {
    expect(reportFilename(" /// ", "md")).toBe("研究报告.md");
    expect(reportFilename("长".repeat(80), "doc")).toBe(`${"长".repeat(60)}.doc`);
  });
});

describe("reportMarkdown", () => {
  it("prefixes the title and a provenance line", () => {
    expect(reportMarkdown({ title: "问题", markdown: "## 一\n\n正文\n", byline: "由 3 个研究智能体完成", exportedAt: at })).toBe(
      "# 问题\n\n> PiResearch 研究报告 · 由 3 个研究智能体完成 · 2026-10-29 09:05\n\n## 一\n\n正文\n",
    );
  });
});

describe("reportDocument", () => {
  it("escapes the title and embeds the body", () => {
    const html = reportDocument({ title: "A <b> & B", body: "<h2>一</h2><p>正文</p>", exportedAt: at });
    expect(html).toContain("<title>A &lt;b&gt; &amp; B</title>");
    expect(html).toContain("<article><h2>一</h2><p>正文</p></article>");
    expect(html.startsWith("<!doctype html>")).toBe(true);
  });

  it("uses the Office namespaces for Word", () => {
    expect(reportDocument({ title: "T", body: "", exportedAt: at }, true)).toContain("urn:schemas-microsoft-com:office:word");
  });
});
