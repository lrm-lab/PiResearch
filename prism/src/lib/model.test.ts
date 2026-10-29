import { describe, expect, it } from "vitest";
import { DEFAULT_MODEL, isModelId, modelOption, MODELS } from "./model";

describe("model options", () => {
  it("match the backend ids and default to DeepSeek", () => {
    expect(MODELS.map((model) => model.id)).toEqual(["deepseek", "gpt-6.1-sol"]);
    expect(DEFAULT_MODEL).toBe("deepseek");
  });

  it("only know the offered models", () => {
    expect(isModelId("gpt-6.1-sol")).toBe(true);
    expect(isModelId("gpt-4o")).toBe(false);
    expect(modelOption("")).toBeNull();
    expect(modelOption("deepseek")?.name).toBe("DeepSeek");
  });
});
