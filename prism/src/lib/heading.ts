// Port of selectionHeading (constellation/index.html:1403-1410) and the pane
// rules of renderSelectionHeading (:1412-1432) as data.

/** The goal shows its first sentence (≤100 code points + "…"); tasks show their full text. */
export function selectionHeading(text: unknown, goal: boolean): string {
  const full = String(text || "").trim();
  if (!goal) return full;
  const clean = full.replace(/^#\s*Task\s*/i, "").replace(/^#+\s*/, "").trim();
  const sentence = clean.split(/[。！？\n]|[.!?](?=\s|$)/)[0]!.trim() || clean;
  const chars = Array.from(sentence);
  return chars.length > 100 ? chars.slice(0, 100).join("") + "…" : sentence;
}

export interface HeadingPane {
  /** Heading text for the detail panel. */
  heading: string;
  /** Verbatim full text for the collapsible pane. */
  full: string;
  /** Whether the 完整问题 / 完整内容 pane is shown. */
  showPane: boolean;
  /** "完整问题" for the goal, "完整内容" otherwise. */
  paneLabel: string;
  /** e.g. "1,234 字符" (code points). */
  lengthLabel: string;
  /** Pane identity: reset the open state and scroll position when this changes. */
  owner: string;
}

/** What the detail panel shows for a node, or for one of its steps. */
export function headingPane(
  node: { id: string; goal?: boolean; title?: string },
  step?: { label?: string; tool?: string } | null,
  stepIndex: number | null = null,
): HeadingPane {
  const full = String(step ? step.label || step.tool : node.title || "");
  const goal = Boolean(node.goal && !step);
  return {
    heading: selectionHeading(full, goal),
    full,
    showPane: goal || full.length > 90 || /\n/.test(full),
    paneLabel: goal ? "完整问题" : "完整内容",
    lengthLabel: `${Array.from(full).length.toLocaleString()} 字符`,
    owner: JSON.stringify([node.id, stepIndex]),
  };
}
