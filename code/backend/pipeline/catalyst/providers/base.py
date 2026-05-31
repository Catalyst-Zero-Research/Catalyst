from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol


@dataclass(frozen=True)
class ProviderCapabilities:
    provider: str
    configured: bool
    model: str | None
    supports_tools: bool
    supports_streaming: bool
    supports_json_schema: bool
    supports_images: bool
    base_url: str | None = None


class ChatProvider(Protocol):
    def capabilities(self) -> ProviderCapabilities:
        ...

    def chat(self, messages: list[dict[str, Any]], tools: list[dict[str, Any]] | None = None) -> dict[str, Any]:
        ...


class ProviderNotConfigured(RuntimeError):
    pass

