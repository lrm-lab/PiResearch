// Markdown pre-pass for the report reader: right-align numeric GFM table
// columns by rewriting the delimiter row (`---` → `---:`), the way the 2D
// renderer picks `num` columns (constellation/index.html columnKind,
// cellNumeric and the 60% rule, :1753-1866). Explicit alignment wins.

/** A short cell with digits and no long CJK or Latin words. */
export function cellNumeric(cell: string): boolean {
  const text = String(cell || "").replace(/\*\*/g, "").trim();
  if (!text || text.length > 28) return false;
  const digits = (text.match(/\d/g) || []).length;
  return digits > 0 && !/[㐀-鿿]{3,}/.test(text) && !/[A-Za-z]{5,}/.test(text);
}

function plain(cell: string): string {
  return cell.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[*`]/g, "").trim();
}

/** Source and date columns never right-align. */
function excluded(header: string, samples: string[]): boolean {
  const name = header.replace(/\*/g, "").replace(/\s+/g, "");
  if (/来源|出处|链接|参考/.test(name)) return true;
  if (/^(日期|时间)$/.test(name)) return true;
  const longest = Math.max(name.length, ...samples.map((cell) => plain(cell).length));
  const dated = samples.filter((cell) => /^\d{4}-\d{2}-\d{2}$/.test(cell.trim())).length;
  return name.length <= 4 && longest <= 28 && dated >= Math.max(1, samples.length * 0.6);
}

/** Whether a column is numeric: at least 60% of its non-empty cells. */
export function numericColumn(header: string, cells: readonly string[]): boolean {
  const samples = cells.map((cell) => cell.trim()).filter(Boolean);
  if (!samples.length || excluded(header, samples)) return false;
  return samples.filter(cellNumeric).length / samples.length >= 0.6;
}

/** Split a table row on unescaped pipes, dropping the outer ones. */
export function splitRow(line: string): string[] {
  let text = line.trim();
  if (text.startsWith("|")) text = text.slice(1);
  if (text.endsWith("|") && !text.endsWith("\\|")) text = text.slice(0, -1);
  const cells: string[] = [];
  let current = "";
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (char === "\\" && text[index + 1] === "|") {
      current += "\\|";
      index += 1;
    } else if (char === "|") {
      cells.push(current.trim());
      current = "";
    } else current += char;
  }
  cells.push(current.trim());
  return cells;
}

const DELIMITER = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
const FENCE = /^\s*(```|~~~)/;

/** Rewrites delimiter rows so numeric columns are right-aligned. */
export function alignNumericColumns(markdown: string): string {
  const lines = markdown.split("\n");
  let fenced = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (FENCE.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced || !line.includes("|")) continue;
    const delimiter = lines[index + 1];
    if (delimiter === undefined || !DELIMITER.test(delimiter) || !delimiter.includes("-")) continue;
    const head = splitRow(line);
    const marks = splitRow(delimiter);
    if (marks.length !== head.length) continue;
    const rows: string[][] = [];
    let end = index + 2;
    while (end < lines.length && lines[end]!.trim() && lines[end]!.includes("|")) {
      rows.push(splitRow(lines[end]!));
      end += 1;
    }
    const next = marks.map((mark, column) => {
      if (mark.includes(":")) return mark;
      const cells = rows.map((row) => row[column] ?? "");
      return numericColumn(head[column] ?? "", cells) ? "---:" : mark;
    });
    lines[index + 1] = "| " + next.join(" | ") + " |";
    index = end - 1;
  }
  return lines.join("\n");
}

/** Drops a leading "# title" line when the reader already shows the title. */
export function stripLeadingTitle(markdown: string, title: string): string {
  const heading = title.trim();
  if (!heading) return markdown;
  const lines = markdown.split("\n");
  if (lines[0]?.replace(/^#\s+/, "").trim() === heading && /^#\s/.test(lines[0])) {
    return lines.slice(1).join("\n").replace(/^\n+/, "");
  }
  return markdown;
}
