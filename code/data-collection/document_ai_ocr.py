"""Optional Google Cloud Document AI OCR fallback."""

from __future__ import annotations

import asyncio
import os
from pathlib import Path
from typing import Mapping, Optional, Protocol

from contracts import ExtractedContent
from extractors import normalize_text


class OcrError(RuntimeError):
    pass


class OcrExtractor(Protocol):
    async def extract(
        self,
        *,
        filename: str,
        content: bytes,
        mime_type: Optional[str],
        max_characters: int,
    ) -> ExtractedContent:
        """Extract text from a document that the local extractor could not read."""


class DocumentAiOcrExtractor:
    def __init__(
        self,
        *,
        project_id: str,
        location: str,
        processor_id: str,
    ) -> None:
        self.project_id = project_id.strip()
        self.location = location.strip().lower()
        self.processor_id = processor_id.strip()
        if not self.project_id:
            raise ValueError("Google Cloud project ID cannot be empty")
        if not self.location:
            raise ValueError("Document AI location cannot be empty")
        if not self.processor_id:
            raise ValueError("Document AI processor ID cannot be empty")

    async def extract(
        self,
        *,
        filename: str,
        content: bytes,
        mime_type: Optional[str],
        max_characters: int,
    ) -> ExtractedContent:
        return await asyncio.to_thread(
            self._extract_sync,
            filename,
            content,
            mime_type,
            max_characters,
        )

    def _extract_sync(
        self,
        filename: str,
        content: bytes,
        mime_type: Optional[str],
        max_characters: int,
    ) -> ExtractedContent:
        try:
            from google.api_core.client_options import ClientOptions
            from google.cloud import documentai
        except ImportError as exc:
            raise OcrError(
                "Document AI OCR requires the 'google-cloud-documentai' package"
            ) from exc

        resolved_mime = _resolve_mime_type(filename, mime_type)
        if resolved_mime is None:
            raise OcrError(f"Document AI does not support this file type: {filename}")

        try:
            client = documentai.DocumentProcessorServiceClient(
                client_options=ClientOptions(
                    api_endpoint=f"{self.location}-documentai.googleapis.com"
                )
            )
            processor_name = client.processor_path(
                self.project_id,
                self.location,
                self.processor_id,
            )
            result = client.process_document(
                request=documentai.ProcessRequest(
                    name=processor_name,
                    raw_document=documentai.RawDocument(
                        content=content,
                        mime_type=resolved_mime,
                    ),
                )
            )
        except Exception as exc:
            raise OcrError(f"Google Document AI request failed: {exc}") from exc

        normalized = normalize_text(result.document.text or "")
        if not normalized:
            raise OcrError(f"Document AI returned no text for {filename}")

        character_count = len(normalized)
        truncated = character_count > max_characters
        return ExtractedContent(
            full_text=(normalized[:max_characters] if truncated else normalized),
            relevant_passages=[],
            character_count=character_count,
            truncated=truncated,
            extraction_method="google_document_ai_ocr",
            page_count=len(result.document.pages) or None,
        )


def document_ai_ocr_from_environment(
    environment: Optional[Mapping[str, str]] = None,
) -> Optional[DocumentAiOcrExtractor]:
    values = environment if environment is not None else os.environ
    enabled = values.get("DOCUMENT_AI_ENABLED", "false").strip().lower()
    if enabled not in {"1", "true", "yes", "on"}:
        return None

    project_id = values.get("GOOGLE_CLOUD_PROJECT", "").strip()
    location = values.get("DOCUMENT_AI_LOCATION", "us").strip()
    processor_id = values.get("DOCUMENT_AI_PROCESSOR_ID", "").strip()
    missing = [
        name
        for name, value in (
            ("GOOGLE_CLOUD_PROJECT", project_id),
            ("DOCUMENT_AI_LOCATION", location),
            ("DOCUMENT_AI_PROCESSOR_ID", processor_id),
        )
        if not value
    ]
    if missing:
        raise OcrError(
            "Document AI OCR is enabled but configuration is missing: "
            + ", ".join(missing)
        )
    return DocumentAiOcrExtractor(
        project_id=project_id,
        location=location,
        processor_id=processor_id,
    )


def _resolve_mime_type(filename: str, mime_type: Optional[str]) -> Optional[str]:
    supported = {
        "application/pdf",
        "image/bmp",
        "image/gif",
        "image/jpeg",
        "image/png",
        "image/tiff",
    }
    normalized = (mime_type or "").lower().strip()
    if normalized in supported:
        return normalized
    return {
        ".pdf": "application/pdf",
        ".bmp": "image/bmp",
        ".gif": "image/gif",
        ".jpeg": "image/jpeg",
        ".jpg": "image/jpeg",
        ".png": "image/png",
        ".tif": "image/tiff",
        ".tiff": "image/tiff",
    }.get(Path(filename).suffix.lower())
