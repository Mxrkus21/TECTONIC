"""In-memory document provider used for local development and demos."""

from __future__ import annotations

import re
from dataclasses import dataclass, replace
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, List, Optional, Set

from contracts import AskRequest, RetrievalProvider
from providers.base import DocumentProvider, ProviderSearchHit


@dataclass(frozen=True)
class MockDocument:
    hit: ProviderSearchHit
    content: bytes


def _utc(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


def _tokens(value: str) -> Set[str]:
    ignored = {
        "a",
        "an",
        "and",
        "are",
        "can",
        "do",
        "how",
        "i",
        "is",
        "many",
        "my",
        "of",
        "still",
        "take",
        "the",
        "this",
        "to",
        "what",
    }
    return {
        token
        for token in re.findall(r"[a-z0-9]+", value.lower())
        if len(token) > 1 and token not in ignored
    }


def _default_documents() -> List[MockDocument]:
    provider = RetrievalProvider.MOCK.value
    site_id = "demo-hr-site"
    drive_id = "demo-hr-drive"

    def document(
        item_id: str,
        name: str,
        content: str,
        modified_at: str,
        **metadata: object,
    ) -> MockDocument:
        suffix = Path(name).suffix.lower()
        mime_types = {
            ".csv": "text/csv",
            ".json": "application/json",
            ".md": "text/markdown",
            ".txt": "text/plain",
        }
        raw_metadata = {
            "source_type": "unknown",
            "country": "BE",
            "language": "en",
            "status": "unknown",
            **metadata,
        }
        hit = ProviderSearchHit(
            provider=provider,
            item_id=item_id,
            name=name,
            mime_type=mime_types.get(suffix, "application/octet-stream"),
            web_url=f"https://demo.sharepoint.local/hr/{name}",
            site_id=site_id,
            drive_id=drive_id,
            path=f"/HR/{name}",
            created_at=_utc("2025-01-10T09:00:00Z"),
            modified_at=_utc(modified_at),
            etag=f'"{item_id}-v1"',
            raw_metadata=raw_metadata,
        )
        return MockDocument(hit=hit, content=content.encode("utf-8"))

    return [
        document(
            "leave-policy-2026",
            "current_leave_policy.md",
            (
                "# Belgium Paid Leave Policy 2026\n\n"
                "Full-time employees receive 20 statutory paid leave days per year. "
                "Approved company leave is tracked separately from statutory leave."
            ),
            "2026-08-21T13:40:00Z",
            source_type="company_policy",
            effective_from="2026-01-01",
            effective_until="2026-12-31",
            review_due_at="2026-11-01",
            version="3.2",
            author="HR Legal Belgium",
            status="active",
        ),
        document(
            "leave-faq-2024",
            "old_hr_faq.md",
            (
                "# HR FAQ 2024\n\n"
                "Belgian employees receive 18 paid leave days per year."
            ),
            "2024-02-12T08:30:00Z",
            source_type="hr_faq",
            effective_from="2024-01-01",
            effective_until="2024-12-31",
            version="1.0",
            author="HR Support",
            status="expired",
        ),
        document(
            "contract-emp-1042",
            "employment_contract_EMP-1042.md",
            (
                "# Employment Contract\n\n"
                "Employee EMP-1042 is employed full time in Belgium and receives "
                "2 additional company leave days each calendar year."
            ),
            "2026-01-03T10:15:00Z",
            source_type="employment_contract",
            version="2.0",
            author="People Operations",
            status="active",
            employee_id="EMP-1042",
        ),
        document(
            "balance-emp-1042",
            "leave_balance_EMP-1042.csv",
            "employee_id,year,used_days,booked_days\nEMP-1042,2026,9,3\n",
            "2026-09-29T17:20:00Z",
            source_type="leave_balance",
            author="Time Management System",
            status="active",
            employee_id="EMP-1042",
        ),
        document(
            "profile-emp-1042",
            "employee_profile_EMP-1042.json",
            (
                '{"employee_id":"EMP-1042","country":"BE",'
                '"employment_type":"full_time","language":"en"}'
            ),
            "2026-09-01T12:00:00Z",
            source_type="employee_profile",
            author="HR Master Data",
            status="active",
            employee_id="EMP-1042",
        ),
    ]


class MockDocumentProvider(DocumentProvider):
    provider = RetrievalProvider.MOCK.value

    def __init__(self, documents: Optional[Iterable[MockDocument]] = None) -> None:
        selected = list(documents) if documents is not None else _default_documents()
        self._documents = {document.hit.item_id: document for document in selected}

    async def search(self, request: AskRequest) -> List[ProviderSearchHit]:
        query_tokens = _tokens(request.question)
        allowed_types = {value.lower().lstrip(".") for value in request.search.file_types}
        scored = []

        for document in self._documents.values():
            hit = document.hit
            extension = Path(hit.name).suffix.lower().lstrip(".")
            if allowed_types and extension not in allowed_types:
                continue
            if request.search.site_ids and hit.site_id not in request.search.site_ids:
                continue
            if (
                request.search.modified_after is not None
                and hit.modified_at is not None
                and hit.modified_at < _as_utc(request.search.modified_after)
            ):
                continue

            searchable = f"{hit.name} {document.content.decode('utf-8', errors='ignore')}"
            document_tokens = _tokens(searchable)
            overlap = len(query_tokens & document_tokens)
            context_bonus = self._context_bonus(request, hit)
            score = overlap / max(len(query_tokens), 1) + context_bonus

            if overlap == 0 and context_bonus == 0:
                continue
            scored.append((score, hit))

        scored.sort(
            key=lambda item: (
                item[0],
                item[1].modified_at or datetime.min.replace(tzinfo=timezone.utc),
            ),
            reverse=True,
        )

        results = []
        for rank, (score, hit) in enumerate(
            scored[: request.search.max_candidates], start=1
        ):
            results.append(replace(hit, rank=rank, provider_score=round(score, 4)))
        return results

    async def download(self, hit: ProviderSearchHit) -> bytes:
        document = self._documents.get(hit.item_id)
        if document is None:
            raise FileNotFoundError(f"Mock document not found: {hit.item_id}")
        return document.content

    @staticmethod
    def _context_bonus(request: AskRequest, hit: ProviderSearchHit) -> float:
        metadata = hit.raw_metadata
        bonus = 0.0
        employee_id = request.user_context.employee_id
        if employee_id and metadata.get("employee_id") == employee_id:
            bonus += 0.25
        country = request.user_context.country
        if country and metadata.get("country") == country:
            bonus += 0.1
        language = request.user_context.language
        if language and metadata.get("language") == language:
            bonus += 0.05
        return bonus


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)
