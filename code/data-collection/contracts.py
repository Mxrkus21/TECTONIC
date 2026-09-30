"""JSON contracts owned by the data-collection module.

The output contains retrieval evidence only. Trust scoring, conflict
resolution, calculations, and final answer generation are intentionally left
to the data-filter module.
"""

from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import Any, Dict, List, Optional
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ContractModel(BaseModel):
    """Reject unknown fields so contract changes cannot go unnoticed."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class RetrievalProvider(str, Enum):
    MOCK = "mock"
    MICROSOFT_GRAPH = "microsoft_graph"


class SourceStatus(str, Enum):
    ACTIVE = "active"
    OUTDATED = "outdated"
    EXPIRED = "expired"
    UNKNOWN = "unknown"


class IssueCode(str, Enum):
    ACCESS_DENIED = "access_denied"
    EXTRACTION_FAILED = "extraction_failed"
    METADATA_MISSING = "metadata_missing"
    OCR_REQUIRED = "ocr_required"
    POSSIBLE_OLD_VERSION = "possible_old_version"
    PROVIDER_ERROR = "provider_error"
    TRUNCATED = "truncated"
    UNSUPPORTED_FILE = "unsupported_file"


class UserContext(ContractModel):
    employee_id: Optional[str] = None
    country: Optional[str] = Field(default=None, min_length=2, max_length=2)
    language: str = Field(default="en", min_length=2, max_length=10)
    department: Optional[str] = None


class SearchContext(ContractModel):
    """Search intent produced by Henry's UI and preserved for downstream use."""

    topic_tags: List[str] = Field(default_factory=list)
    client: Optional[str] = None
    employee_category: Optional[str] = None
    reference_date: Optional[date] = None
    source_types: List[str] = Field(default_factory=list)


class SearchOptions(ContractModel):
    site_ids: List[str] = Field(default_factory=list)
    file_types: List[str] = Field(
        default_factory=lambda: [
            "pdf",
            "docx",
            "xlsx",
            "csv",
            "json",
            "txt",
            "md",
            "png",
            "jpg",
            "jpeg",
            "tif",
            "tiff",
            "bmp",
            "gif",
        ]
    )
    modified_after: Optional[datetime] = None
    max_candidates: int = Field(default=25, ge=1, le=100)
    max_documents: int = Field(default=8, ge=1, le=25)
    include_full_text: bool = True

    @model_validator(mode="after")
    def validate_limits(self) -> "SearchOptions":
        if self.max_documents > self.max_candidates:
            raise ValueError("max_documents cannot exceed max_candidates")
        return self


class AskRequest(ContractModel):
    request_id: str = Field(
        default_factory=lambda: f"req-{uuid4().hex[:12]}", min_length=1
    )
    question: str = Field(min_length=3, max_length=2_000)
    user_context: UserContext = Field(default_factory=UserContext)
    search_context: SearchContext = Field(default_factory=SearchContext)
    search: SearchOptions = Field(default_factory=SearchOptions)


class RelevantPassage(ContractModel):
    text: str = Field(min_length=1)
    relevance_score: float = Field(ge=0.0, le=1.0)
    section: Optional[str] = None
    page: Optional[int] = Field(default=None, ge=1)
    start_char: Optional[int] = Field(default=None, ge=0)
    end_char: Optional[int] = Field(default=None, ge=0)

    @model_validator(mode="after")
    def validate_character_range(self) -> "RelevantPassage":
        if (
            self.start_char is not None
            and self.end_char is not None
            and self.end_char < self.start_char
        ):
            raise ValueError("end_char cannot be smaller than start_char")
        return self


class ExtractedContent(ContractModel):
    full_text: Optional[str] = None
    relevant_passages: List[RelevantPassage] = Field(default_factory=list)
    character_count: int = Field(ge=0)
    truncated: bool = False
    extraction_method: str = Field(default="local", min_length=1)
    page_count: Optional[int] = Field(default=None, ge=1)


class DocumentMetadata(ContractModel):
    """Normalized Graph metadata. Missing values must stay null, not guessed."""

    site_id: Optional[str] = None
    drive_id: Optional[str] = None
    item_id: str = Field(min_length=1)
    path: Optional[str] = None
    created_at: Optional[datetime] = None
    modified_at: Optional[datetime] = None
    effective_from: Optional[date] = None
    effective_until: Optional[date] = None
    review_due_at: Optional[date] = None
    version: Optional[str] = None
    author: Optional[str] = None
    country: Optional[str] = Field(default=None, min_length=2, max_length=2)
    language: Optional[str] = Field(default=None, min_length=2, max_length=10)
    status: SourceStatus = SourceStatus.UNKNOWN
    etag: Optional[str] = None
    content_hash: Optional[str] = None
    custom_fields: Dict[str, Any] = Field(default_factory=dict)


class RetrievalScores(ContractModel):
    """Relevance signals only. This is not a source trust score."""

    provider_rank: Optional[int] = Field(default=None, ge=1)
    provider_score: Optional[float] = Field(default=None, ge=0.0)
    local_relevance: float = Field(ge=0.0, le=1.0)


class EvidenceDocument(ContractModel):
    source_id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    source_type: str = Field(default="unknown", min_length=1)
    mime_type: Optional[str] = None
    web_url: Optional[str] = None
    content: ExtractedContent
    metadata: DocumentMetadata
    retrieval_scores: RetrievalScores


class RetrievalIssue(ContractModel):
    code: IssueCode
    message: str = Field(min_length=1)
    source_id: Optional[str] = None
    retryable: bool = False


class RetrievalSummary(ContractModel):
    provider: str = Field(min_length=1)
    retrieved_at: datetime
    candidates_found: int = Field(ge=0)
    documents_included: int = Field(ge=0)
    query_used: str = Field(min_length=1)
    partial: bool = False


class EvidenceBundle(ContractModel):
    """Stable handoff object from data collection to data filter."""

    schema_version: str = "1.0"
    request_id: str = Field(min_length=1)
    question: str = Field(min_length=3, max_length=2_000)
    user_context: UserContext
    search_context: SearchContext = Field(default_factory=SearchContext)
    retrieval: RetrievalSummary
    documents: List[EvidenceDocument] = Field(default_factory=list)
    warnings: List[RetrievalIssue] = Field(default_factory=list)
    errors: List[RetrievalIssue] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_document_count(self) -> "EvidenceBundle":
        if self.retrieval.documents_included != len(self.documents):
            raise ValueError(
                "retrieval.documents_included must match the number of documents"
            )
        return self
