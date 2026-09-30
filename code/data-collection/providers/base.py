"""Provider boundary for document discovery and download.

Both the mock provider and Microsoft Graph provider implement this interface.
Providers only return source data; parsing and relevance scoring happen in
later data-collection stages.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional

from contracts import AskRequest


@dataclass(frozen=True)
class ProviderSearchHit:
    """Provider-neutral representation of one search result."""

    provider: str
    item_id: str
    name: str
    mime_type: Optional[str] = None
    web_url: Optional[str] = None
    site_id: Optional[str] = None
    drive_id: Optional[str] = None
    path: Optional[str] = None
    created_at: Optional[datetime] = None
    modified_at: Optional[datetime] = None
    etag: Optional[str] = None
    rank: Optional[int] = None
    provider_score: Optional[float] = None
    raw_metadata: Dict[str, Any] = field(default_factory=dict)

    @property
    def source_id(self) -> str:
        """Stable identifier shared with the downstream EvidenceDocument."""

        location = self.drive_id or self.site_id or "unknown"
        return f"{self.provider}:{location}:{self.item_id}"


class DocumentProvider(ABC):
    """Minimal interface required by the collection service."""

    provider: str

    @abstractmethod
    async def search(self, request: AskRequest) -> List[ProviderSearchHit]:
        """Return candidate documents ordered from most to least relevant."""

        raise NotImplementedError

    @abstractmethod
    async def download(self, hit: ProviderSearchHit) -> bytes:
        """Download the complete binary content for a search result."""

        raise NotImplementedError


ProviderFactory = Callable[..., DocumentProvider]


class ProviderRegistry:
    """Small opt-in registry for Graph and future external APIs."""

    def __init__(self) -> None:
        self._factories: Dict[str, ProviderFactory] = {}

    def register(
        self,
        name: str,
        factory: ProviderFactory,
        replace_existing: bool = False,
    ) -> None:
        normalized = name.strip().lower()
        if not normalized:
            raise ValueError("Provider name cannot be empty")
        if normalized in self._factories and not replace_existing:
            raise ValueError(f"Provider is already registered: {normalized}")
        self._factories[normalized] = factory

    def create(self, name: str, **options: Any) -> DocumentProvider:
        normalized = name.strip().lower()
        try:
            factory = self._factories[normalized]
        except KeyError as exc:
            available = ", ".join(sorted(self._factories)) or "none"
            raise ValueError(
                f"Unknown provider '{name}'. Available providers: {available}"
            ) from exc
        return factory(**options)

    @property
    def names(self) -> List[str]:
        return sorted(self._factories)
