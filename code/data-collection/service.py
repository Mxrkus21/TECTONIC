"""Orchestrate provider search, extraction, ranking, and JSON handoff."""

from __future__ import annotations

from datetime import datetime, timezone
from hashlib import sha256
from typing import Dict, Iterable, List, Optional, Set

from contracts import (
    AskRequest,
    DocumentMetadata,
    EvidenceBundle,
    EvidenceDocument,
    IssueCode,
    RetrievalIssue,
    RetrievalScores,
    RetrievalSummary,
    SourceStatus,
)
from extractors import (
    ExtractionError,
    MissingExtractorDependencyError,
    OcrRequiredError,
    UnsupportedFileTypeError,
    extract_content,
)
from document_ai_ocr import OcrError, OcrExtractor
from providers.base import DocumentProvider, ProviderSearchHit
from relevance import RankedDocument, rank_documents


_NORMALIZED_METADATA_FIELDS = {
    "source_type",
    "effective_from",
    "effective_until",
    "review_due_at",
    "version",
    "author",
    "country",
    "language",
    "status",
}


class DataCollectionService:
    def __init__(
        self,
        provider: DocumentProvider,
        max_characters_per_document: int = 250_000,
        ocr_extractor: Optional[OcrExtractor] = None,
    ) -> None:
        if max_characters_per_document < 1:
            raise ValueError("max_characters_per_document must be greater than zero")
        self.provider = provider
        self.max_characters_per_document = max_characters_per_document
        self.ocr_extractor = ocr_extractor

    async def collect(self, request: AskRequest) -> EvidenceBundle:
        warnings: List[RetrievalIssue] = []
        errors: List[RetrievalIssue] = []

        try:
            search_hits = await self.provider.search(request)
        except Exception as exc:
            errors.append(
                RetrievalIssue(
                    code=IssueCode.PROVIDER_ERROR,
                    message=f"Document search failed: {exc}",
                    retryable=True,
                )
            )
            return self._bundle(
                request=request,
                candidates_found=0,
                documents=[],
                warnings=warnings,
                errors=errors,
                partial=True,
            )

        unique_hits = list(_unique_hits(search_hits))
        extracted = []
        content_hashes: Dict[str, str] = {}

        for hit in unique_hits:
            try:
                binary_content = await self.provider.download(hit)
                content_hashes[hit.source_id] = sha256(binary_content).hexdigest()
                try:
                    content = extract_content(
                        filename=hit.name,
                        content=binary_content,
                        mime_type=hit.mime_type,
                        max_characters=self.max_characters_per_document,
                    )
                except (OcrRequiredError, UnsupportedFileTypeError):
                    if self.ocr_extractor is None:
                        raise
                    content = await self.ocr_extractor.extract(
                        filename=hit.name,
                        content=binary_content,
                        mime_type=hit.mime_type,
                        max_characters=self.max_characters_per_document,
                    )
                extracted.append((hit, content))
                if content.truncated:
                    warnings.append(
                        RetrievalIssue(
                            code=IssueCode.TRUNCATED,
                            source_id=hit.source_id,
                            message=(
                                f"{hit.name} exceeded the extraction limit; "
                                "only the leading extracted text is included."
                            ),
                        )
                    )
            except PermissionError as exc:
                warnings.append(
                    _issue(hit, IssueCode.ACCESS_DENIED, str(exc), retryable=False)
                )
            except OcrRequiredError as exc:
                warnings.append(_issue(hit, IssueCode.OCR_REQUIRED, str(exc)))
            except UnsupportedFileTypeError as exc:
                warnings.append(_issue(hit, IssueCode.UNSUPPORTED_FILE, str(exc)))
            except OcrError as exc:
                warnings.append(
                    _issue(
                        hit,
                        IssueCode.EXTRACTION_FAILED,
                        str(exc),
                        retryable=True,
                    )
                )
            except MissingExtractorDependencyError as exc:
                warnings.append(_issue(hit, IssueCode.EXTRACTION_FAILED, str(exc)))
            except ExtractionError as exc:
                warnings.append(_issue(hit, IssueCode.EXTRACTION_FAILED, str(exc)))
            except Exception as exc:
                warnings.append(
                    _issue(
                        hit,
                        IssueCode.PROVIDER_ERROR,
                        f"Document download failed: {exc}",
                        retryable=True,
                    )
                )

        relevance_query = " ".join(
            [request.question, *request.search_context.topic_tags]
        )
        ranked = rank_documents(
            question=relevance_query,
            documents=extracted,
            max_documents=request.search.max_documents,
        )
        documents = [
            self._evidence_document(item, request, content_hashes[item.hit.source_id])
            for item in ranked
        ]

        for document in documents:
            if document.metadata.status in {
                SourceStatus.OUTDATED,
                SourceStatus.EXPIRED,
            }:
                warnings.append(
                    RetrievalIssue(
                        code=IssueCode.POSSIBLE_OLD_VERSION,
                        source_id=document.source_id,
                        message=(
                            f"{document.name} is marked "
                            f"{document.metadata.status.value}."
                        ),
                    )
                )

        return self._bundle(
            request=request,
            candidates_found=len(search_hits),
            documents=documents,
            warnings=warnings,
            errors=errors,
            partial=bool(errors)
            or any(
                warning.code != IssueCode.POSSIBLE_OLD_VERSION
                for warning in warnings
            ),
        )

    def _evidence_document(
        self,
        ranked: RankedDocument,
        request: AskRequest,
        content_hash: str,
    ) -> EvidenceDocument:
        hit = ranked.hit
        raw = hit.raw_metadata
        status_value = raw.get("status", SourceStatus.UNKNOWN.value)
        try:
            status = SourceStatus(status_value)
        except ValueError:
            status = SourceStatus.UNKNOWN

        metadata = DocumentMetadata(
            site_id=hit.site_id,
            drive_id=hit.drive_id,
            item_id=hit.item_id,
            path=hit.path,
            created_at=hit.created_at,
            modified_at=hit.modified_at,
            effective_from=raw.get("effective_from"),
            effective_until=raw.get("effective_until"),
            review_due_at=raw.get("review_due_at"),
            version=raw.get("version"),
            author=raw.get("author"),
            country=raw.get("country"),
            language=raw.get("language"),
            status=status,
            etag=hit.etag,
            content_hash=content_hash,
            custom_fields={
                key: value
                for key, value in raw.items()
                if key not in _NORMALIZED_METADATA_FIELDS
            },
        )
        content = ranked.content
        if not request.search.include_full_text:
            content = content.model_copy(update={"full_text": None})

        return EvidenceDocument(
            source_id=hit.source_id,
            name=hit.name,
            source_type=str(raw.get("source_type", "unknown")),
            mime_type=hit.mime_type,
            web_url=hit.web_url,
            content=content,
            metadata=metadata,
            retrieval_scores=RetrievalScores(
                provider_rank=hit.rank,
                provider_score=hit.provider_score,
                local_relevance=ranked.local_relevance,
            ),
        )

    def _bundle(
        self,
        request: AskRequest,
        candidates_found: int,
        documents: List[EvidenceDocument],
        warnings: List[RetrievalIssue],
        errors: List[RetrievalIssue],
        partial: bool,
    ) -> EvidenceBundle:
        return EvidenceBundle(
            request_id=request.request_id,
            question=request.question,
            user_context=request.user_context,
            search_context=request.search_context,
            retrieval=RetrievalSummary(
                provider=self.provider.provider,
                retrieved_at=datetime.now(timezone.utc),
                candidates_found=candidates_found,
                documents_included=len(documents),
                query_used=request.question,
                partial=partial,
            ),
            documents=documents,
            warnings=warnings,
            errors=errors,
        )


async def collect_evidence(
    request: AskRequest,
    provider: DocumentProvider,
    ocr_extractor: Optional[OcrExtractor] = None,
) -> EvidenceBundle:
    """Convenience entry point for API or integration code."""

    return await DataCollectionService(
        provider,
        ocr_extractor=ocr_extractor,
    ).collect(request)


def _unique_hits(hits: Iterable[ProviderSearchHit]) -> Iterable[ProviderSearchHit]:
    seen: Set[str] = set()
    for hit in hits:
        if hit.source_id in seen:
            continue
        seen.add(hit.source_id)
        yield hit


def _issue(
    hit: ProviderSearchHit,
    code: IssueCode,
    message: str,
    retryable: bool = False,
) -> RetrievalIssue:
    return RetrievalIssue(
        code=code,
        source_id=hit.source_id,
        message=message,
        retryable=retryable,
    )
