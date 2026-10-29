// The research model for new studies (constellation/models.py holds the same ids). The visitor's
// choice lives in localStorage `prism-model`; a study records the model it ran on.

import { useSyncExternalStore } from "react";

export type ModelId = "deepseek" | "gpt-6.1-sol";

export interface ModelOption {
  id: ModelId;
  name: string;
  /** Short name for chips. */
  short: string;
}

export const MODELS: readonly ModelOption[] = [
  { id: "deepseek", name: "DeepSeek", short: "DeepSeek" },
  { id: "gpt-6.1-sol", name: "GPT-6.1 Sol", short: "GPT-6.1" },
];

export const DEFAULT_MODEL: ModelId = "deepseek";
export const MODEL_KEY = "prism-model";

export function isModelId(value: unknown): value is ModelId {
  return MODELS.some((model) => model.id === value);
}

/** The option for a recorded model id, or null for studies that predate the field. */
export function modelOption(id: unknown): ModelOption | null {
  return MODELS.find((model) => model.id === id) ?? null;
}

const listeners = new Set<() => void>();
let choice: ModelId = stored();

function stored(): ModelId {
  try {
    const value = localStorage.getItem(MODEL_KEY);
    return isModelId(value) ? value : DEFAULT_MODEL;
  } catch {
    return DEFAULT_MODEL;
  }
}

export function getModelChoice(): ModelId {
  return choice;
}

export function setModelChoice(next: ModelId): void {
  if (next === choice) return;
  choice = next;
  try {
    localStorage.setItem(MODEL_KEY, next);
  } catch {
    // Private mode: the choice lasts for this page.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== MODEL_KEY) return;
    choice = stored();
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useModelChoice(): ModelId {
  return useSyncExternalStore(subscribe, getModelChoice, () => DEFAULT_MODEL);
}
