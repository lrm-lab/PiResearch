import { describe, expect, it } from "vitest";
import { tokenize, wrapText } from "./text";

/** CJK = 2 units, everything else 1 unit. */
const measure = (text: string) => Array.from(text).reduce((sum, ch) => sum + (/[⺀-鿿＀-￯　-〿]/u.test(ch) ? 2 : 1), 0);

describe("tokenize", () => {
  it("splits CJK per character and keeps Latin words whole", () => {
    expect(tokenize("分省 REITs 融资")).toEqual(["分", "省", " ", "REITs ", "融", "资"]);
  });

  it("keeps closing punctuation with the previous token", () => {
    expect(tokenize("收入，结构")).toEqual(["收", "入，", "结", "构"]);
  });
});

describe("wrapText", () => {
  it("returns one line when it fits", () => {
    expect(wrapText("出让收入", 20, measure, 2)).toEqual(["出让收入"]);
  });

  it("breaks CJK anywhere and adds an ellipsis when it overflows", () => {
    const lines = wrapText("地方政府土地财政如何转型请梳理", 10, measure, 2);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe("地方政府土");
    expect(lines[1]!.endsWith("…")).toBe(true);
    expect(measure(lines[1]!)).toBeLessThanOrEqual(10);
  });

  it("keeps Latin words whole and splits a word longer than the line", () => {
    expect(wrapText("calc tax base", 9, measure, 3)).toEqual(["calc tax", "base"]);
    expect(wrapText("abcdefghijkl", 5, measure, 3)).toEqual(["abcde", "fghij", "kl"]);
  });

  it("handles empty input and zero lines", () => {
    expect(wrapText("   ", 10, measure, 2)).toEqual([]);
    expect(wrapText("abc", 10, measure, 0)).toEqual([]);
  });
});
