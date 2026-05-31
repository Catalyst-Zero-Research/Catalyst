from __future__ import annotations

import os
from typing import Any

from catalyst.providers.base import ProviderCapabilities
from catalyst.settings import CatalystSettings, PROVIDER_ENV_KEYS


DEFAULT_MODELS = {
    "gemini": "gemini-2.5-flash",
    "groq": "llama-3.3-70b-versatile",
    "mistral": "mistral-large-latest",
    "nvidia": "meta/llama-3.1-405b-instruct",
    "ollama": "llama3.1",
    "ollama_cloud": "gpt-oss:120b",
}


OPENAI_COMPATIBLE_BASE_URLS = {
    "groq": "https://api.groq.com/openai/v1",
    "nvidia": "https://integrate.api.nvidia.com/v1",
}


def provider_capabilities(settings: CatalystSettings) -> list[ProviderCapabilities]:
    capabilities = []
    for provider in settings.providers.provider_order:
        env_key = PROVIDER_ENV_KEYS.get(provider, "")
        configured = provider == "ollama" or bool(env_key and os.getenv(env_key))
        model = settings.providers.models.get(provider) or DEFAULT_MODELS.get(provider)
        capabilities.append(
            ProviderCapabilities(
                provider=provider,
                configured=configured,
                model=model,
                supports_tools=provider in {"gemini", "groq", "mistral", "nvidia", "ollama_cloud"},
                supports_streaming=True,
                supports_json_schema=provider in {"gemini", "groq", "mistral", "nvidia", "ollama_cloud"},
                supports_images=provider in {"gemini"},
                base_url=_base_url(provider),
            )
        )
    return capabilities


def provider_status(settings: CatalystSettings) -> dict[str, Any]:
    caps = provider_capabilities(settings)
    active = settings.providers.active_provider
    if not active:
        active = next((cap.provider for cap in caps if cap.configured), None)
    active_capability = next((cap for cap in caps if cap.provider == active), None)
    return {
        "active_provider": active,
        "llm_configured": bool(active_capability and active_capability.configured),
        "providers": {cap.provider: cap.__dict__ for cap in caps},
    }


def _base_url(provider: str) -> str | None:
    if provider == "ollama":
        return os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    if provider == "ollama_cloud":
        return "https://ollama.com"
    return OPENAI_COMPATIBLE_BASE_URLS.get(provider)
