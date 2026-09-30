"""Public Google Drive folder provider using an API key."""

from __future__ import annotations

import asyncio
import json
import os
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Mapping, Optional, Protocol
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

from contracts import AskRequest
from providers.base import DocumentProvider, ProviderSearchHit


GOOGLE_DOCUMENT = "application/vnd.google-apps.document"
GOOGLE_SHEET = "application/vnd.google-apps.spreadsheet"
GOOGLE_PRESENTATION = "application/vnd.google-apps.presentation"
GOOGLE_FOLDER = "application/vnd.google-apps.folder"


class GoogleDriveApiError(RuntimeError):
    def __init__(self, message: str, status_code: Optional[int] = None) -> None:
        super().__init__(message)
        self.status_code = status_code


@dataclass(frozen=True)
class DriveResponse:
    status_code: int
    headers: Mapping[str, str]
    content: bytes

    def json(self) -> Dict[str, Any]:
        try:
            return json.loads(self.content.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise GoogleDriveApiError("Google Drive returned invalid JSON") from exc


class GoogleDriveTransport(Protocol):
    async def get(
        self,
        url: str,
        headers: Mapping[str, str],
    ) -> DriveResponse:
        """Execute one HTTP GET request."""


class UrllibGoogleDriveTransport:
    def __init__(self, timeout_seconds: float = 20.0) -> None:
        self.timeout_seconds = timeout_seconds

    async def get(
        self,
        url: str,
        headers: Mapping[str, str],
    ) -> DriveResponse:
        return await asyncio.to_thread(self._get_sync, url, headers)

    def _get_sync(
        self,
        url: str,
        headers: Mapping[str, str],
    ) -> DriveResponse:
        request = Request(url, headers=dict(headers), method="GET")
        try:
            with urlopen(request, timeout=self.timeout_seconds) as response:
                return DriveResponse(
                    status_code=response.status,
                    headers=dict(response.headers.items()),
                    content=response.read(),
                )
        except HTTPError as exc:
            detail = _safe_google_error(exc.read())
            raise GoogleDriveApiError(
                f"Google Drive request failed ({exc.code}): {detail}",
                status_code=exc.code,
            ) from exc
        except URLError as exc:
            raise GoogleDriveApiError(
                f"Google Drive connection failed: {exc.reason}"
            ) from exc


class PublicGoogleDriveProvider(DocumentProvider):
    """Read files from a publicly shared Drive folder using an API key."""

    provider = "google_drive"

    def __init__(
        self,
        api_key: str,
        folder_id: str,
        transport: Optional[GoogleDriveTransport] = None,
        base_url: str = "https://www.googleapis.com/drive/v3",
    ) -> None:
        self.api_key = api_key.strip()
        self.folder_id = folder_id.strip()
        self.transport = transport or UrllibGoogleDriveTransport()
        self.base_url = base_url.rstrip("/")
        if not self.api_key:
            raise ValueError("Google Drive API key cannot be empty")
        if not self.folder_id:
            raise ValueError("Google Drive folder ID cannot be empty")

    async def search(self, request: AskRequest) -> List[ProviderSearchHit]:
        query = f"'{self.folder_id}' in parents and trashed = false"
        parameters = urlencode(
            {
                "q": query,
                "pageSize": min(request.search.max_candidates, 100),
                "orderBy": "modifiedTime desc",
                "fields": (
                    "incompleteSearch,nextPageToken,files("
                    "id,name,mimeType,createdTime,modifiedTime,webViewLink,"
                    "version,md5Checksum,size,description,properties,appProperties)"
                ),
            }
        )
        response = await self.transport.get(
            f"{self.base_url}/files?{parameters}",
            headers=self._headers(),
        )
        self._ensure_success(response)

        allowed_types = {
            extension.lower().lstrip(".")
            for extension in request.search.file_types
        }
        hits = []
        for raw_file in response.json().get("files", []):
            original_mime_type = raw_file.get("mimeType")
            if original_mime_type == GOOGLE_FOLDER:
                continue
            extension = _file_extension(raw_file)
            if allowed_types and extension not in allowed_types:
                continue

            modified_at = _parse_datetime(raw_file.get("modifiedTime"))
            if request.search.modified_after and modified_at:
                requested_after = request.search.modified_after
                if requested_after.tzinfo is None:
                    requested_after = requested_after.replace(tzinfo=modified_at.tzinfo)
                if modified_at < requested_after:
                    continue

            rank = len(hits) + 1
            properties = {
                **(raw_file.get("properties") or {}),
                **(raw_file.get("appProperties") or {}),
            }
            hits.append(
                ProviderSearchHit(
                    provider=self.provider,
                    item_id=str(raw_file["id"]),
                    name=str(raw_file.get("name") or raw_file["id"]),
                    mime_type=_export_mime_type(original_mime_type)
                    or original_mime_type,
                    web_url=raw_file.get("webViewLink"),
                    drive_id=self.folder_id,
                    path=f"/google-drive/{self.folder_id}",
                    created_at=_parse_datetime(raw_file.get("createdTime")),
                    modified_at=modified_at,
                    etag=str(raw_file.get("version")) if raw_file.get("version") else None,
                    rank=rank,
                    provider_score=None,
                    raw_metadata={
                        "source_type": properties.get("source_type", "unknown"),
                        "effective_from": properties.get("effective_from"),
                        "effective_until": properties.get("effective_until"),
                        "review_due_at": properties.get("review_due_at"),
                        "version": str(raw_file.get("version"))
                        if raw_file.get("version")
                        else None,
                        "author": properties.get("author"),
                        "country": properties.get("country"),
                        "language": properties.get("language"),
                        "status": properties.get("status", "unknown"),
                        "description": raw_file.get("description"),
                        "size_bytes": raw_file.get("size"),
                        "md5_checksum": raw_file.get("md5Checksum"),
                        "google_drive_properties": properties,
                        "google_mime_type": original_mime_type,
                    },
                )
            )
        return hits

    async def download(self, hit: ProviderSearchHit) -> bytes:
        item_id = quote(hit.item_id, safe="")
        original_mime_type = hit.raw_metadata.get("google_mime_type")
        export_mime = _export_mime_type(
            str(original_mime_type) if original_mime_type else hit.mime_type
        )
        if export_mime:
            parameters = urlencode({"mimeType": export_mime})
            url = f"{self.base_url}/files/{item_id}/export?{parameters}"
        else:
            url = f"{self.base_url}/files/{item_id}?alt=media"

        response = await self.transport.get(url, headers=self._headers())
        self._ensure_success(response)
        return response.content

    def _headers(self) -> Dict[str, str]:
        return {
            "Accept": "application/json",
            "x-goog-api-key": self.api_key,
        }

    @staticmethod
    def _ensure_success(response: DriveResponse) -> None:
        if not 200 <= response.status_code < 300:
            raise GoogleDriveApiError(
                f"Google Drive request failed ({response.status_code})",
                status_code=response.status_code,
            )


def google_drive_provider_from_environment(
    environment: Optional[Mapping[str, str]] = None,
) -> PublicGoogleDriveProvider:
    values = environment if environment is not None else os.environ
    api_key = values.get("GOOGLE_DRIVE_API_KEY", "").strip()
    folder_id = values.get("GOOGLE_DRIVE_FOLDER_ID", "").strip()
    missing = [
        name
        for name, value in (
            ("GOOGLE_DRIVE_API_KEY", api_key),
            ("GOOGLE_DRIVE_FOLDER_ID", folder_id),
        )
        if not value
    ]
    if missing:
        raise GoogleDriveApiError(
            "Google Drive is not configured. Missing: " + ", ".join(missing)
        )
    return PublicGoogleDriveProvider(api_key=api_key, folder_id=folder_id)


def _file_extension(raw_file: Mapping[str, Any]) -> str:
    extension = Path(str(raw_file.get("name", ""))).suffix.lower().lstrip(".")
    if extension:
        return extension
    return {
        GOOGLE_DOCUMENT: "txt",
        GOOGLE_SHEET: "csv",
        GOOGLE_PRESENTATION: "txt",
    }.get(str(raw_file.get("mimeType", "")), "")


def _export_mime_type(mime_type: Optional[str]) -> Optional[str]:
    return {
        GOOGLE_DOCUMENT: "text/plain",
        GOOGLE_SHEET: "text/csv",
        GOOGLE_PRESENTATION: "text/plain",
    }.get(mime_type or "")


def _parse_datetime(value: Any) -> Optional[datetime]:
    if not isinstance(value, str) or not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _safe_google_error(content: bytes) -> str:
    try:
        payload = json.loads(content.decode("utf-8"))
        error = payload.get("error") or {}
        return str(error.get("message") or "request was rejected")[:300]
    except (UnicodeDecodeError, json.JSONDecodeError, AttributeError):
        return "request was rejected"
