"""Research models a user may pick for a new study.

Every model is served through the same OpenAI-compatible endpoint (OPENAI_BASE_URL / the
zhizengzeng key). ``None`` means "the deployment's OPENAI_MODEL", which stays the default.
"""

from __future__ import annotations

import os

DEFAULT_MODEL = "deepseek"

# key -> (label, model name sent to the endpoint; None keeps OPENAI_MODEL)
MODELS: dict[str, tuple[str, str | None]] = {
    "deepseek": ("DeepSeek", None),
    "gpt-6.1-sol": ("GPT-6.1 Sol", "gpt-6.1-sol"),
}


def resolve_model(key: object) -> str:
    """The model key for a submission: empty means the default; unknown keys are refused."""
    text = str(key or "").strip()
    if not text:
        return DEFAULT_MODEL
    if text not in MODELS:
        raise ValueError("不支持这个模型。")
    return text


def apply_model(key: object) -> None:
    """Point the research job at the study's model (called after the job's .env is loaded)."""
    name = MODELS.get(str(key or ""), (None, None))[1]
    if name:
        os.environ["OPENAI_MODEL"] = name

