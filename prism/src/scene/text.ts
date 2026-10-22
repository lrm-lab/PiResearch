// Line breaking for the canvas card faces. CJK breaks between any two characters, Latin words stay
// whole (unless a single word is wider than the line), and the last allowed line ends in "…" when
// the text does not fit. Pure: the caller passes a `measure` (ctx.measureText in the scene).

export type Measure = (text: string) => number;

const ELLIPSIS = "…";
/** Closing punctuation that should not start a line. */
const NO_START = new Set("，。、；：？！）》」』】,.;:?!)]}%".split(""));

/** Split into breakable units: one CJK character, or a Latin word with its trailing spaces. */
export function tokenize(text: string): string[] {
  const tokens: string[] = [];
  const re = /[⺀-鿿豈-﫿＀-￯　-〿]|[^\s⺀-鿿豈-﫿＀-￯　-〿]+\s*|\s+/gu;
  for (const match of text.matchAll(re)) {
    const token = match[0];
    if (tokens.length && NO_START.has(token[0]!)) tokens[tokens.length - 1] += token;
    else tokens.push(token);
  }
  return tokens;
}

function fitWithEllipsis(line: string, maxWidth: number, measure: Measure): string {
  let text = line.trimEnd();
  if (measure(text + ELLIPSIS) <= maxWidth) return text + ELLIPSIS;
  const chars = Array.from(text);
  while (chars.length && measure(chars.join("") + ELLIPSIS) > maxWidth) chars.pop();
  text = chars.join("").trimEnd();
  return text + ELLIPSIS;
}

/** Break a long token by characters. */
function splitToken(token: string, maxWidth: number, measure: Measure): string[] {
  const parts: string[] = [];
  let current = "";
  for (const ch of Array.from(token)) {
    if (current && measure(current + ch) > maxWidth) {
      parts.push(current);
      current = ch;
    } else current += ch;
  }
  if (current) parts.push(current);
  return parts;
}

export function wrapText(text: string, maxWidth: number, measure: Measure, maxLines: number): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean || maxLines <= 0) return [];
  const lines: string[] = [];
  let current = "";
  const tokens = tokenize(clean);
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    const candidate = current + token;
    if (measure(candidate.trimEnd()) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (!current) {
      // A single token wider than the line: break it by characters.
      const parts = splitToken(token, maxWidth, measure);
      tokens.splice(i + 1, 0, ...parts.slice(1));
      current = parts[0] ?? "";
      continue;
    }
    lines.push(current.trimEnd());
    current = token.trimStart();
    if (lines.length === maxLines) {
      // Overflow: the last line gets the ellipsis.
      lines[maxLines - 1] = fitWithEllipsis(lines[maxLines - 1]!, maxWidth, measure);
      return lines;
    }
    if (measure(current.trimEnd()) > maxWidth) {
      const parts = splitToken(current, maxWidth, measure);
      tokens.splice(i + 1, 0, ...parts.slice(1));
      current = parts[0] ?? "";
    }
  }
  if (current.trim()) lines.push(current.trimEnd());
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = fitWithEllipsis(kept[maxLines - 1]!, maxWidth, measure);
    return kept;
  }
  return lines;
}
