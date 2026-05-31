from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any

from catalyst.settings import CatalystSettings, RESEARCH_ENV_KEYS


@dataclass(frozen=True)
class ResearchSourceCapability:
    source: str
    configured: bool
    requires_api_key: bool
    status: str
    supports_search: bool = True
    supports_fetch: bool = False


def research_source_capabilities(settings: CatalystSettings) -> list[ResearchSourceCapability]:
    capabilities = []
    for source in settings.research.sources:
        env_key = RESEARCH_ENV_KEYS.get(source)
        requires_key = source in {"openalex", "semantic_scholar", "pubmed", "web"}
        if not settings.research.enabled:
            status = "disabled"
            configured = False
        elif source in {"arxiv", "crossref"}:
            status = "available"
            configured = True
        elif source == "web":
            configured = bool(env_key and os.getenv(env_key) and os.getenv("GOOGLE_CUSTOM_SEARCH_CX"))
            status = "available" if configured else "missing_key"
        elif env_key:
            configured = bool(os.getenv(env_key))
            status = "available" if configured else "missing_key"
        else:
            configured = False
            status = "not_configured"
        capabilities.append(
            ResearchSourceCapability(
                source=source,
                configured=configured,
                requires_api_key=requires_key,
                status=status,
                supports_search=True,
                supports_fetch=source in {"semantic_scholar", "crossref", "pubmed", "arxiv"},
            )
        )
    return capabilities


def research_sources_payload(settings: CatalystSettings) -> dict[str, Any]:
    return {
        "enabled": settings.research.enabled,
        "sources": [cap.__dict__ for cap in research_source_capabilities(settings)],
    }

