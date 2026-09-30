"""HTTP boundary for the web interface and other server-side clients."""

from __future__ import annotations

import os
from functools import lru_cache
from typing import Optional

from fastapi import Depends, FastAPI, Header, HTTPException, status

from contracts import EvidenceBundle
from document_ai_ocr import document_ai_ocr_from_environment
from adapter import SearchBrief
from mock import MockDocumentProvider
from providers.base import DocumentProvider
from providers.google_drive import google_drive_provider_from_environment
from providers.microsoft_graph import (
    MicrosoftGraphProvider,
    token_provider_from_environment,
)
from service import collect_evidence


app = FastAPI(
    title="TECTONIC Data Collection API",
    version="1.0.0",
    description="SearchBrief to EvidenceBundle boundary.",
)


def _authorize(authorization: Optional[str] = Header(default=None)) -> None:
    expected = os.environ.get("DATA_COLLECTION_API_TOKEN", "").strip()
    if not expected:
        return
    if authorization != f"Bearer {expected}":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing bearer token",
        )


@lru_cache(maxsize=1)
def configured_provider() -> DocumentProvider:
    name = os.environ.get("DATA_COLLECTION_PROVIDER", "mock").strip().lower()
    if name == "mock":
        return MockDocumentProvider()
    if name == "google_drive":
        return google_drive_provider_from_environment()
    if name == "microsoft_graph":
        region = os.environ.get("GRAPH_REGION", "").strip() or None
        return MicrosoftGraphProvider(
            token_provider=token_provider_from_environment(),
            region=region,
        )
    raise RuntimeError(
        "Unknown DATA_COLLECTION_PROVIDER. Use mock, google_drive, or microsoft_graph."
    )


@app.get("/health")
async def health() -> dict[str, str]:
    provider = os.environ.get("DATA_COLLECTION_PROVIDER", "mock").strip().lower()
    return {"status": "ok", "provider": provider}


@app.post(
    "/api/v1/evidence/collect",
    response_model=EvidenceBundle,
    dependencies=[Depends(_authorize)],
)
async def collect(brief: SearchBrief) -> EvidenceBundle:
    """Accept the interface SearchBrief and return retrieval evidence."""

    request = brief.to_ask_request()
    try:
        provider = configured_provider()
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    try:
        ocr_extractor = document_ai_ocr_from_environment()
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    return await collect_evidence(
        request,
        provider,
        ocr_extractor=ocr_extractor,
    )
