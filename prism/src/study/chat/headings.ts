// Finding and flashing the report heading a citation names (DOM side of lib/citations.ts).

import { matchHeading, normalizeHeading } from "../../lib/citations";

export function reportHeadings(article: HTMLElement | null): HTMLElement[] {
  return article ? Array.from(article.querySelectorAll<HTMLElement>("h1, h2, h3, h4")) : [];
}

export function findHeading(article: HTMLElement | null, title: string): HTMLElement | null {
  const headings = reportHeadings(article);
  const index = matchHeading(
    headings.map((h) => h.textContent ?? ""),
    title,
  );
  return index >= 0 ? headings[index]! : null;
}

export function hasHeading(article: HTMLElement | null, title: string): boolean {
  return Boolean(normalizeHeading(title)) && findHeading(article, title) !== null;
}

/** Scroll the heading into view and sweep a highlight across it (~1.2 s). */
export function flashHeading(heading: HTMLElement, smooth: boolean): void {
  heading.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
  heading.removeAttribute("data-cite-flash");
  void heading.offsetWidth;
  heading.setAttribute("data-cite-flash", "true");
  window.setTimeout(() => heading.removeAttribute("data-cite-flash"), 1300);
}
