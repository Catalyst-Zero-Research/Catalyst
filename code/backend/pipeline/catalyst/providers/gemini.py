from __future__ import annotations

import json
import os
from typing import Any
from urllib import error, parse, request

from catalyst.settings import CatalystSettings, PROVIDER_ENV_KEYS


DEFAULT_GEMINI_MODEL = "gemini-2.5-flash"
DEFAULT_GEMINI_FALLBACK_MODELS = ["gemini-3.1-flash-lite"]
GEMINI_GENERATE_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


class GeminiProviderError(RuntimeError):
    pass


def generate_gemini_text(
    settings: CatalystSettings,
    *,
    prompt: str,
    system_instruction: str | None = None,
    temperature: float = 0.2,
    max_output_tokens: int = 512,
) -> dict[str, Any]:
    contents = [{"role": "user", "parts": [{"text": prompt}]}]
    turn = generate_gemini_agent_turn(
        settings,
        contents=contents,
        system_instruction=system_instruction,
        temperature=temperature,
        max_output_tokens=max_output_tokens,
    )
    if not turn["text"]:
        raise GeminiProviderError("Gemini returned no text content.")
    return {
        "provider": "gemini",
        "model": turn["model"],
        "text": turn["text"],
        "usage": turn.get("usage") or {},
    }


def generate_gemini_agent_turn(
    settings: CatalystSettings,
    *,
    contents: list[dict[str, Any]],
    system_instruction: str | None = None,
    tools: list[dict[str, Any]] | None = None,
    temperature: float = 0.2,
    max_output_tokens: int = 1024,
) -> dict[str, Any]:
    api_key = os.environ.get(PROVIDER_ENV_KEYS["gemini"])
    if not api_key:
        raise GeminiProviderError("GEMINI_API_KEY is not set.")

    models = _gemini_model_chain(settings)
    errors: list[str] = []
    for model in models:
        try:
            return _generate_gemini_agent_turn_with_model(
                api_key,
                model=model,
                contents=contents,
                system_instruction=system_instruction,
                tools=tools,
                temperature=temperature,
                max_output_tokens=max_output_tokens,
            )
        except GeminiProviderError as exc:
            errors.append(f"{model}: {exc}")
    raise GeminiProviderError("Gemini API failed for all configured models: " + " | ".join(errors))


def _gemini_model_chain(settings: CatalystSettings) -> list[str]:
    primary = settings.providers.models.get("gemini") or DEFAULT_GEMINI_MODEL
    fallback_models = settings.providers.fallback_models.get("gemini") or DEFAULT_GEMINI_FALLBACK_MODELS
    chain: list[str] = []
    for model in [primary, *fallback_models]:
        clean = str(model).removeprefix("models/").strip()
        if clean and clean not in chain:
            chain.append(clean)
    return chain or [DEFAULT_GEMINI_MODEL]


def _generate_gemini_agent_turn_with_model(
    api_key: str,
    *,
    model: str,
    contents: list[dict[str, Any]],
    system_instruction: str | None,
    tools: list[dict[str, Any]] | None,
    temperature: float,
    max_output_tokens: int,
) -> dict[str, Any]:
    model = model.removeprefix("models/")
    use_system_instruction = system_instruction
    request_contents = contents
    if system_instruction and model.startswith("gemma-"):
        use_system_instruction = None
        request_contents = _inline_system_instruction(system_instruction, contents)
    payload: dict[str, Any] = {
        "contents": request_contents,
        "generationConfig": {
            "temperature": temperature,
            "maxOutputTokens": max_output_tokens,
        },
    }
    if use_system_instruction:
        payload["system_instruction"] = {"parts": [{"text": use_system_instruction}]}
    if tools and not model.startswith("gemma-"):
        payload["tools"] = tools

    url = GEMINI_GENERATE_URL.format(model=parse.quote(model, safe="-_.~")) + "?key=" + parse.quote(api_key)
    body = json.dumps(payload).encode("utf-8")
    req = request.Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")

    try:
        with request.urlopen(req, timeout=30) as response:
            raw = response.read().decode("utf-8")
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise GeminiProviderError(f"Gemini API returned HTTP {exc.code}: {detail}") from exc
    except error.URLError as exc:
        raise GeminiProviderError(f"Gemini API request failed: {exc.reason}") from exc

    data = json.loads(raw)
    turn = _extract_agent_turn(data, model)
    if not turn["text"] and not turn["function_calls"]:
        raise GeminiProviderError("Gemini returned no text or tool calls.")
    return turn


def _extract_agent_turn(data: dict[str, Any], model: str) -> dict[str, Any]:
    text_parts: list[str] = []
    function_calls: list[dict[str, Any]] = []
    content: dict[str, Any] | None = None
    for candidate in data.get("candidates") or []:
        content = candidate.get("content") or {}
        for part in content.get("parts") or []:
            if part.get("thought") is True:
                continue
            if isinstance(part.get("functionCall"), dict):
                call = dict(part["functionCall"])
                call.setdefault("args", {})
                function_calls.append(call)
            if isinstance(part.get("text"), str):
                text_parts.append(part["text"])
        if text_parts or function_calls:
            break
    text = "\n".join(part.strip() for part in text_parts if part.strip()).strip()
    if model.startswith("gemma-"):
        text = _clean_gemma_text(text)

    return {
        "provider": "gemini",
        "model": model,
        "text": text,
        "function_calls": function_calls,
        "content": content,
        "usage": data.get("usageMetadata") or {},
        "raw": data,
    }


def _inline_system_instruction(system_instruction: str, contents: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not contents:
        return [{"role": "user", "parts": [{"text": system_instruction}]}]
    cloned = json.loads(json.dumps(contents))
    first = cloned[0]
    first.setdefault("role", "user")
    parts = first.setdefault("parts", [])
    parts.insert(
        0,
        {
            "text": (
                "Developer/system instructions for this Catalyst turn:\n"
                f"{system_instruction}\n\nUser/task content follows."
            )
        },
    )
    return cloned


def _clean_gemma_text(text: str) -> str:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if len(lines) < 3:
        return text
    head_bullets = sum(1 for line in lines[:4] if line.startswith(("*", "-", "•")))
    if head_bullets < 2:
        return text
    for line in reversed(lines):
        if not line.startswith(("*", "-", "•")):
            return line.strip().strip('"')
    return text
