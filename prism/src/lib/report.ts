// Port of the 2D report pipeline (constellation/index.html:1647-1732):
// keep the <report> blocks that are not incomplete, clean each into a Chinese
// chapter and prefix the question heading. Rendering is left to react-markdown.

/** Top-bar question while the first snapshot loads (or retries). */
export const TITLE_LOADING = "正在读取";
/** Top-bar question when the study has no graph. */
export const TITLE_NO_GRAPH = "这份运行没有任务图";

/** A real question title: not empty and not one of the top-bar placeholders. Expects a trimmed string. */
export function isUsableTitle(title: string): boolean {
  return Boolean(title) && title !== TITLE_LOADING && title !== TITLE_NO_GRAPH;
}

/** Chapter title derived from a report block. */
export function chapterTitle(body: string): string {
  if (/Completeness Check|Correctness Check|Deliverable Check/.test(body)) return "证据核对";
  const scope = /^Scope:\s*([^\n]+)/m.exec(body);
  if (scope) {
    let title = scope[1]!.split(/[。.]/)[0]!;
    title = title
      .replace(/^研究\s*/, "")
      .replace(/，采用[\s\S]*$/, "")
      .replace(/，方法[\s\S]*$/, "")
      .replace(/。$/, "")
      .trim();
    const lead = title.split(/[：:]/)[0]!.trim();
    if (lead.length >= 6 && lead.length <= 28) return lead;
    if (title.length >= 6 && title.length <= 28) return title;
  }
  const head = /^\*\*\d+\.\s+([^*\n]+)\*\*\s*$/m.exec(body) || /^【\d+\.\s+([^】\n]+)】\s*$/m.exec(body);
  if (head) return head[1]!.replace(/（RETRIEVED[^）]*）/g, "").trim();
  const plain = /^\d+\.\s+([^：:—\n]{2,22})/m.exec(body);
  if (plain) return plain[1]!.trim();
  return "研究发现";
}

/** One-sentence lede from the `Scope:` line, or "". */
export function scopeLede(body: string): string {
  const found = /^Scope:\s*([^\n]+)/m.exec(body);
  if (!found) return "";
  let text = found[1]!.split(/。/)[0]!;
  text = text
    .replace(/采用[\s\S]*$/, "")
    .replace(/方法[:：][\s\S]*$/, "")
    .replace(/产出[\s\S]*$/, "")
    .trim()
    .replace(/[，,、；;：:\s]+$/, "");
  if (!text || text.length > 90) return "";
  return text.endsWith("。") ? text : text + "。";
}

/** Drops local paths; turns "- https://… — desc" evidence lines into links. `null` drops the line. */
export function cleanEvidenceLine(line: string): string | null {
  const trimmed = line.trim();
  if (/\/Users\/|sandbox\/worktree|产出文件/.test(trimmed)) return null;
  const evidence = /^-\s+(https?:\/\/\S+(?:\s*(?:与|and)\s*https?:\/\/\S+)*)\s*[—–-]\s*(.+)$/.exec(trimmed);
  if (!evidence) return line;
  const desc =
    evidence[2]!
      .replace(/\s*quality:\s*\S+(?:\s*[（(][^）)]*[）)])?/i, "")
      .replace(/[\[\]]/g, "")
      .trim() || "来源";
  const urls = (evidence[1]!.match(/https?:\/\/\S+/g) || []).map((href) => href.replace(/[，,;；。]+$/, ""));
  return urls.map((href) => "- [" + desc + "](" + href + ")").join("\n");
}

/** One report block as a "## title" chapter with Chinese section names, or "". */
export function cleanChapter(body: unknown): string {
  let text = String(body || "").replace(/\r\n/g, "\n").trim();
  if (!text || (/^\[NOTE:/.test(text) && text.length < 900)) return "";
  text = text.replace(/\[NOTE:[^\]]*\]\s*/g, "");
  text = text.replace(/\s*quality:\s*[A-Za-z/]+(?:\s*[（(][^）)\n]*[）)])?/gi, "");
  const title = chapterTitle(text);
  const lede = scopeLede(text);
  text = text.replace(/^Scope:\s*[^\n]*\n*/m, "");
  text = text.replace(/^Findings:\s*\n*/m, "");
  text = text.replace(/（RETRIEVED[^）]*）/g, "");
  text = text.replace(/^\*\*(\d+\.\s*[^*]+)\*\*\s*$/gm, "### $1");
  text = text.replace(/^【(\d+\.\s*[^】]+)】\s*$/gm, "### $1");
  text = text.replace(/^Evidence:\s*$/m, "### 来源");
  text = text.replace(/^Confidence:\s*/m, "> **判断** ");
  text = text.replace(/^Unresolved:\s*$/m, "### 尚未确认");
  text = text.replace(/^Disconfirming:\s*/m, "> **相反证据** ");
  text = text.replace(/^Conflicts:\s*/m, "> **分歧** ");
  text = text.replace(/^##\s+Completeness Check\s*$/m, "### 完整性");
  text = text.replace(/^##\s+Correctness Check\s*$/m, "### 正确性");
  text = text.replace(/^##\s+Precision Issues\s*$/m, "### 精度");
  text = text.replace(/^##\s+Discipline Issues[^\n]*$/m, "### 写法");
  text = text.replace(/^##\s+Deliverable Check\s*$/m, "### 交付");
  if (title && title !== "研究发现") {
    const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    text = text.replace(new RegExp("^###\\s+(?:\\d+\\.\\s+)?" + escaped + "\\s*$", "m"), "");
  }
  const lines = text
    .split("\n")
    .map(cleanEvidenceLine)
    .filter((line): line is string => line !== null);
  text = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) return "";
  return "## " + title + "\n\n" + (lede ? lede + "\n\n" : "") + text;
}

/** The Markdown shown to the reader. `title` is the question heading (selectionHeading of the goal). */
export function prepareUserReport(source: unknown, title?: string | null): string {
  const raw = String(source || "").replace(/\r\n/g, "\n");
  const chapters: string[] = [];
  const reports = /<report\b([^>]*)>([\s\S]*?)<\/report>/gi;
  let match: RegExpExecArray | null;
  while ((match = reports.exec(raw))) {
    const status = (/\bstatus="([^"]*)"/.exec(match[1] || "") || [])[1] || "";
    if (status === "incomplete") continue;
    const chapter = cleanChapter(match[2]);
    if (chapter) chapters.push(chapter);
  }
  let body = chapters.length
    ? chapters.join("\n\n")
    : raw.replace(/^##\s+Best-effort collected results[\s\S]*?(?=\n#|\n<report|$)/, "").trim();
  if (chapters.length) body = body.replace(/^#\s+/gm, "## ");
  const heading = String(title || "").trim();
  if (chapters.length && isUsableTitle(heading)) body = "# " + heading + "\n\n" + body;
  return body;
}
