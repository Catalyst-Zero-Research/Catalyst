from __future__ import annotations

import json
import os
import xml.etree.ElementTree as ET
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


DEFAULT_TIMEOUT_SECONDS = 12


def search_research_sources(query: str, sources: list[str], limit: int = 5) -> dict[str, Any]:
    hits: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []
    for source in sources:
        try:
            hits.extend(_search_source(source, query, limit=limit))
        except (HTTPError, URLError, TimeoutError, ValueError, ET.ParseError) as exc:
            errors.append({"source": source, "error": str(exc)})
    return {"hits": hits[: max(limit * max(len(sources), 1), limit)], "errors": errors}


def _search_source(source: str, query: str, limit: int) -> list[dict[str, Any]]:
    if source == "arxiv":
        return _search_arxiv(query, limit)
    if source == "crossref":
        return _search_crossref(query, limit)
    if source == "semantic_scholar":
        return _search_semantic_scholar(query, limit)
    if source == "openalex":
        return _search_openalex(query, limit)
    if source == "pubmed":
        return _search_pubmed(query, limit)
    return []


def _request_json(url: str, headers: dict[str, str] | None = None) -> dict[str, Any]:
    request = Request(url, headers={"User-Agent": "Catalyst/0.1 local research mode", **(headers or {})})
    with urlopen(request, timeout=DEFAULT_TIMEOUT_SECONDS) as response:
        return json.loads(response.read().decode("utf-8"))


def _search_arxiv(query: str, limit: int) -> list[dict[str, Any]]:
    url = "https://export.arxiv.org/api/query?" + urlencode(
        {"search_query": f"all:{query}", "start": 0, "max_results": limit}
    )
    request = Request(url, headers={"User-Agent": "Catalyst/0.1 local research mode"})
    with urlopen(request, timeout=DEFAULT_TIMEOUT_SECONDS) as response:
        root = ET.fromstring(response.read())
    ns = {"atom": "http://www.w3.org/2005/Atom"}
    hits = []
    for entry in root.findall("atom:entry", ns):
        source_url = _text(entry.find("atom:id", ns))
        hits.append(
            {
                "source": "arxiv",
                "external_id": source_url.rsplit("/", 1)[-1] if source_url else None,
                "title": _text(entry.find("atom:title", ns)),
                "abstract": _text(entry.find("atom:summary", ns)),
                "year": (_text(entry.find("atom:published", ns)) or "")[:4] or None,
                "url": source_url,
                "authors": [_text(author.find("atom:name", ns)) for author in entry.findall("atom:author", ns)],
            }
        )
    return hits


def _search_crossref(query: str, limit: int) -> list[dict[str, Any]]:
    params = {"query.bibliographic": query, "rows": limit}
    mailto = os.getenv("CATALYST_CONTACT_EMAIL")
    if mailto:
        params["mailto"] = mailto
    data = _request_json("https://api.crossref.org/works?" + urlencode(params))
    items = data.get("message", {}).get("items", [])
    hits = []
    for item in items:
        hits.append(
            {
                "source": "crossref",
                "external_id": item.get("DOI"),
                "title": _first(item.get("title")),
                "abstract": item.get("abstract"),
                "year": _crossref_year(item),
                "url": item.get("URL"),
                "doi": item.get("DOI"),
                "authors": _crossref_authors(item),
            }
        )
    return hits


def _search_semantic_scholar(query: str, limit: int) -> list[dict[str, Any]]:
    params = {
        "query": query,
        "limit": limit,
        "fields": "title,abstract,year,url,authors,externalIds,citationCount,venue",
    }
    headers = {}
    api_key = os.getenv("SEMANTIC_SCHOLAR_API_KEY")
    if api_key:
        headers["x-api-key"] = api_key
    data = _request_json("https://api.semanticscholar.org/graph/v1/paper/search?" + urlencode(params), headers)
    hits = []
    for item in data.get("data", []):
        external = item.get("externalIds") or {}
        hits.append(
            {
                "source": "semantic_scholar",
                "external_id": item.get("paperId") or external.get("DOI"),
                "title": item.get("title"),
                "abstract": item.get("abstract"),
                "year": item.get("year"),
                "url": item.get("url"),
                "doi": external.get("DOI"),
                "authors": [author.get("name") for author in item.get("authors", []) if author.get("name")],
                "citation_count": item.get("citationCount"),
                "venue": item.get("venue"),
            }
        )
    return hits


def _search_openalex(query: str, limit: int) -> list[dict[str, Any]]:
    params = {"search": query, "per-page": limit}
    api_key = os.getenv("OPENALEX_API_KEY")
    if api_key:
        params["api_key"] = api_key
    mailto = os.getenv("CATALYST_CONTACT_EMAIL")
    if mailto:
        params["mailto"] = mailto
    data = _request_json("https://api.openalex.org/works?" + urlencode(params))
    hits = []
    for item in data.get("results", []):
        hits.append(
            {
                "source": "openalex",
                "external_id": item.get("id"),
                "title": item.get("display_name"),
                "abstract": _openalex_abstract(item.get("abstract_inverted_index")),
                "year": item.get("publication_year"),
                "url": item.get("id"),
                "doi": item.get("doi"),
                "authors": [
                    author.get("author", {}).get("display_name")
                    for author in item.get("authorships", [])
                    if author.get("author", {}).get("display_name")
                ],
            }
        )
    return hits


def _search_pubmed(query: str, limit: int) -> list[dict[str, Any]]:
    params = {
        "db": "pubmed",
        "term": query,
        "retmode": "json",
        "retmax": limit,
    }
    api_key = os.getenv("NCBI_API_KEY")
    if api_key:
        params["api_key"] = api_key
    search = _request_json("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?" + urlencode(params))
    ids = search.get("esearchresult", {}).get("idlist", [])
    if not ids:
        return []
    summary_params = {"db": "pubmed", "id": ",".join(ids), "retmode": "json"}
    if api_key:
        summary_params["api_key"] = api_key
    summary = _request_json(
        "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?" + urlencode(summary_params)
    )
    result = summary.get("result", {})
    hits = []
    for pubmed_id in ids:
        item = result.get(pubmed_id, {})
        hits.append(
            {
                "source": "pubmed",
                "external_id": pubmed_id,
                "title": item.get("title"),
                "abstract": None,
                "year": (item.get("pubdate") or "")[:4] or None,
                "url": f"https://pubmed.ncbi.nlm.nih.gov/{pubmed_id}/",
                "authors": [author.get("name") for author in item.get("authors", []) if author.get("name")],
            }
        )
    return hits


def _text(node: ET.Element | None) -> str | None:
    if node is None or node.text is None:
        return None
    return " ".join(node.text.split())


def _first(value: Any) -> Any:
    if isinstance(value, list) and value:
        return value[0]
    return value


def _crossref_year(item: dict[str, Any]) -> int | None:
    for key in ("published-print", "published-online", "published", "issued"):
        parts = item.get(key, {}).get("date-parts")
        if parts and parts[0]:
            return parts[0][0]
    return None


def _crossref_authors(item: dict[str, Any]) -> list[str]:
    authors = []
    for author in item.get("author", []):
        name = " ".join(part for part in [author.get("given"), author.get("family")] if part)
        if name:
            authors.append(name)
    return authors


def _openalex_abstract(index: dict[str, list[int]] | None) -> str | None:
    if not index:
        return None
    words: list[tuple[int, str]] = []
    for word, positions in index.items():
        for position in positions:
            words.append((position, word))
    return " ".join(word for _, word in sorted(words))
