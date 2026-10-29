// The main agent cites report sections as 【§章节标题】, the title being a heading of the report.
// Replies render each as a chip; a click finds the heading it names.

const CITE = /【§\s*([^】]*?)\s*】/g;
export const CITE_SCHEME = "cite:";
const MAX_CHIP = 18;

export function normalizeHeading(text: string): string {
  return text.replace(/^#+\s*/, "").replace(/\s+/g, " ").trim();
}

/** Chip label: the title cut to ~18 characters. */
export function shortTitle(title: string, max = MAX_CHIP): string {
  const chars = Array.from(normalizeHeading(title));
  return chars.length > max ? `${chars.slice(0, max).join("")}…` : chars.join("");
}

/** A streaming reply may end inside a citation ("…【§市场规"): hide the unfinished tail. */
export function trimOpenCitation(text: string): string {
  const open = text.lastIndexOf("【");
  return open >= 0 && text.indexOf("】", open) < 0 ? text.slice(0, open) : text;
}

/** Markdown with every citation turned into a `cite:` link the renderer draws as a chip. */
export function citationsToMarkdown(text: string): string {
  return text.replace(CITE, (_all, title: string) => {
    const clean = normalizeHeading(title);
    if (!clean) return "";
    const label = clean.replace(/[[\]\\]/g, "");
    return `[${label}](${CITE_SCHEME}${encodeURIComponent(clean)})`;
  });
}

/** The title inside a `cite:` href, or null for any other link. */
export function citationFromHref(href: string | undefined): string | null {
  if (!href || !href.startsWith(CITE_SCHEME)) return null;
  try {
    return decodeURIComponent(href.slice(CITE_SCHEME.length));
  } catch {
    return href.slice(CITE_SCHEME.length);
  }
}

// The reader renames a few raw report headings (lib/report.ts cleanChapter); the agent cites the raw ones.
const RAW_HEADINGS: ReadonlyArray<readonly [RegExp, string]> = [
  [/^Completeness Check$/i, "完整性"],
  [/^Correctness Check$/i, "正确性"],
  [/^Precision Issues$/i, "精度"],
  [/^Discipline Issues/i, "写法"],
  [/^Deliverable Check$/i, "交付"],
];

/** The title the reader shows for a raw heading the agent may cite, or null. */
export function displayedHeading(title: string): string | null {
  const wanted = normalizeHeading(title);
  for (const [pattern, shown] of RAW_HEADINGS) if (pattern.test(wanted)) return shown;
  return null;
}

/** Index of the heading a citation names: exact match first, then startsWith, then includes. */
export function matchHeading(headings: readonly string[], title: string): number {
  const found = matchLiteral(headings, title);
  if (found >= 0) return found;
  const shown = displayedHeading(title);
  return shown ? matchLiteral(headings, shown) : -1;
}

function matchLiteral(headings: readonly string[], title: string): number {
  const wanted = normalizeHeading(title);
  if (!wanted) return -1;
  const list = headings.map(normalizeHeading);
  const exact = list.indexOf(wanted);
  if (exact >= 0) return exact;
  const starts = list.findIndex((h) => h && (h.startsWith(wanted) || wanted.startsWith(h)));
  if (starts >= 0) return starts;
  return list.findIndex((h) => h && (h.includes(wanted) || wanted.includes(h)));
}

/** The message sent for a question about a selection: "> quote\n\n<question>". */
export function quotedMessage(quote: string | null, question: string): string {
  const q = (quote ?? "").trim();
  if (!q) return question;
  const cut = Array.from(q).slice(0, 600).join("");
  return `${cut.split(/\r?\n/).map((line) => `> ${line}`).join("\n")}\n\n${question}`;
}
