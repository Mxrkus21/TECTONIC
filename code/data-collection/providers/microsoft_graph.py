"""Microsoft Graph implementation of the generic document provider."""

from __future__ import annotations

import asyncio
import json
import os
import time
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Mapping, Optional, Protocol
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

from contracts import AskRequest, RetrievalProvider
from providers.base import DocumentProvider, ProviderSearchHit


class GraphApiError(RuntimeError):
    def __init__(self, message: str, status_code: Optional[int] = None) -> None:
        super().__init__(message)
        self.status_code = status_code


class AccessTokenProvider(Protocol):
    async def get_token(self) -> str:
        """Return a valid Microsoft Graph bearer token without the prefix."""


@dataclass(frozen=True)
class StaticAccessTokenProvider:
    """Useful when authentication is handled by an outer API/session layer."""

    access_token: str

    async def get_token(self) -> str:
        token = self.access_token.strip()
        if not token:
            raise GraphApiError("Microsoft Graph access token is empty")
        return token


class ClientCredentialsAccessTokenProvider:
    """Acquire and cache an app-only token from Microsoft Entra ID."""

    def __init__(
        self,
        tenant_id: str,
        client_id: str,
        client_secret: str,
        scope: str = "https://graph.microsoft.com/.default",
        timeout_seconds: float = 15.0,
    ) -> None:
        self.tenant_id = tenant_id.strip()
        self.client_id = client_id.strip()
        self.client_secret = client_secret.strip()
        self.scope = scope.strip()
        self.timeout_seconds = timeout_seconds
        self._cached_token: Optional[str] = None
        self._expires_at = 0.0
        self._lock = asyncio.Lock()

        if not self.tenant_id:
            raise ValueError("Microsoft tenant ID cannot be empty")
        if not self.client_id:
            raise ValueError("Microsoft client ID cannot be empty")
        if not self.client_secret:
            raise ValueError("Microsoft client secret cannot be empty")
        if not self.scope:
            raise ValueError("Microsoft token scope cannot be empty")

    async def get_token(self) -> str:
        if self._token_is_valid():
            return self._cached_token or ""

        async with self._lock:
            if self._token_is_valid():
                return self._cached_token or ""

            token, expires_in = await asyncio.to_thread(self._request_token_sync)
            self._cached_token = token
            # Refresh at least one minute before Entra reports token expiry.
            self._expires_at = time.monotonic() + max(expires_in - 60, 1)
            return token

    def _token_is_valid(self) -> bool:
        return bool(self._cached_token) and time.monotonic() < self._expires_at

    def _request_token_sync(self) -> tuple[str, int]:
        tenant_id = quote(self.tenant_id, safe="")
        url = (
            f"https://login.microsoftonline.com/{tenant_id}"
            "/oauth2/v2.0/token"
        )
        body = urlencode(
            {
                "client_id": self.client_id,
                "client_secret": self.client_secret,
                "scope": self.scope,
                "grant_type": "client_credentials",
            }
        ).encode("utf-8")
        request = Request(
            url,
            data=body,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            method="POST",
        )

        try:
            with urlopen(request, timeout=self.timeout_seconds) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            detail = _safe_oauth_error(exc.read())
            raise GraphApiError(
                f"Microsoft Entra token request failed ({exc.code}): {detail}",
                status_code=exc.code,
            ) from exc
        except URLError as exc:
            raise GraphApiError(
                f"Microsoft Entra connection failed: {exc.reason}"
            ) from exc
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise GraphApiError("Microsoft Entra returned an invalid token response") from exc

        token = payload.get("access_token")
        if not isinstance(token, str) or not token.strip():
            raise GraphApiError("Microsoft Entra response contains no access token")
        try:
            expires_in = int(payload.get("expires_in", 3600))
        except (TypeError, ValueError):
            expires_in = 3600
        return token.strip(), max(expires_in, 1)


def token_provider_from_environment(
    environment: Optional[Mapping[str, str]] = None,
) -> AccessTokenProvider:
    """Build delegated-token or client-credentials auth from environment values.

    GRAPH_ACCESS_TOKEN takes precedence. This supports a delegated token supplied
    by an outer login/session layer without storing it in this module.
    """

    values = environment if environment is not None else os.environ
    access_token = values.get("GRAPH_ACCESS_TOKEN", "").strip()
    if access_token:
        return StaticAccessTokenProvider(access_token)

    tenant_id = values.get("GRAPH_TENANT_ID", "").strip()
    client_id = values.get("GRAPH_CLIENT_ID", "").strip()
    client_secret = values.get("GRAPH_CLIENT_SECRET", "").strip()
    missing = [
        name
        for name, value in (
            ("GRAPH_TENANT_ID", tenant_id),
            ("GRAPH_CLIENT_ID", client_id),
            ("GRAPH_CLIENT_SECRET", client_secret),
        )
        if not value
    ]
    if missing:
        raise GraphApiError(
            "Microsoft Graph authentication is not configured. Missing: "
            + ", ".join(missing)
        )
    return ClientCredentialsAccessTokenProvider(
        tenant_id=tenant_id,
        client_id=client_id,
        client_secret=client_secret,
    )


@dataclass(frozen=True)
class GraphResponse:
    status_code: int
    headers: Mapping[str, str]
    content: bytes

    def json(self) -> Dict[str, Any]:
        try:
            return json.loads(self.content.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise GraphApiError("Microsoft Graph returned invalid JSON") from exc


class GraphTransport(Protocol):
    async def request(
        self,
        method: str,
        url: str,
        headers: Mapping[str, str],
        json_body: Optional[Dict[str, Any]] = None,
    ) -> GraphResponse:
        """Execute one HTTP request."""


class UrllibGraphTransport:
    """Dependency-free async wrapper around Python's HTTP client."""

    def __init__(self, timeout_seconds: float = 20.0) -> None:
        self.timeout_seconds = timeout_seconds

    async def request(
        self,
        method: str,
        url: str,
        headers: Mapping[str, str],
        json_body: Optional[Dict[str, Any]] = None,
    ) -> GraphResponse:
        return await asyncio.to_thread(
            self._request_sync,
            method,
            url,
            headers,
            json_body,
        )

    def _request_sync(
        self,
        method: str,
        url: str,
        headers: Mapping[str, str],
        json_body: Optional[Dict[str, Any]],
    ) -> GraphResponse:
        request_headers = dict(headers)
        data = None
        if json_body is not None:
            data = json.dumps(json_body).encode("utf-8")
            request_headers["Content-Type"] = "application/json"

        request = Request(url, data=data, headers=request_headers, method=method)
        try:
            with urlopen(request, timeout=self.timeout_seconds) as response:
                return GraphResponse(
                    status_code=response.status,
                    headers=dict(response.headers.items()),
                    content=response.read(),
                )
        except HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise GraphApiError(
                f"Microsoft Graph request failed ({exc.code}): {detail[:500]}",
                status_code=exc.code,
            ) from exc
        except URLError as exc:
            raise GraphApiError(f"Microsoft Graph connection failed: {exc.reason}") from exc


class MicrosoftGraphProvider(DocumentProvider):
    provider = RetrievalProvider.MICROSOFT_GRAPH.value

    def __init__(
        self,
        token_provider: AccessTokenProvider,
        transport: Optional[GraphTransport] = None,
        base_url: str = "https://graph.microsoft.com/v1.0",
        region: Optional[str] = None,
    ) -> None:
        self.token_provider = token_provider
        self.transport = transport or UrllibGraphTransport()
        self.base_url = base_url.rstrip("/")
        self.region = region

    async def search(self, request: AskRequest) -> List[ProviderSearchHit]:
        token = await self.token_provider.get_token()
        search_request: Dict[str, Any] = {
            "entityTypes": ["driveItem"],
            "query": {"queryString": self._build_query(request)},
            "from": 0,
            "size": request.search.max_candidates,
        }
        if self.region:
            search_request["region"] = self.region

        response = await self.transport.request(
            method="POST",
            url=f"{self.base_url}/search/query",
            headers={"Authorization": f"Bearer {token}"},
            json_body={"requests": [search_request]},
        )
        self._ensure_success(response)

        hits = []
        ordinal = 0
        for response_group in response.json().get("value", []):
            for container in response_group.get("hitsContainers", []):
                for raw_hit in container.get("hits", []):
                    resource = raw_hit.get("resource") or {}
                    if not resource.get("id") or not resource.get("name"):
                        continue
                    if not resource.get("file"):
                        continue
                    ordinal += 1
                    hit = self._to_search_hit(raw_hit, resource, ordinal)
                    if request.search.site_ids and hit.site_id not in request.search.site_ids:
                        continue
                    hits.append(hit)

        hits.sort(key=lambda item: item.rank or 10_000)
        return hits[: request.search.max_candidates]

    async def download(self, hit: ProviderSearchHit) -> bytes:
        if not hit.drive_id:
            raise GraphApiError(f"Search result has no drive ID: {hit.item_id}")

        token = await self.token_provider.get_token()
        drive_id = quote(hit.drive_id, safe="")
        item_id = quote(hit.item_id, safe="")
        response = await self.transport.request(
            method="GET",
            url=f"{self.base_url}/drives/{drive_id}/items/{item_id}/content",
            headers={"Authorization": f"Bearer {token}"},
        )
        self._ensure_success(response)
        return response.content

    @staticmethod
    def _ensure_success(response: GraphResponse) -> None:
        if not 200 <= response.status_code < 300:
            detail = response.content.decode("utf-8", errors="replace")
            raise GraphApiError(
                f"Microsoft Graph request failed ({response.status_code}): {detail[:500]}",
                status_code=response.status_code,
            )

    @staticmethod
    def _build_query(request: AskRequest) -> str:
        search_text = " ".join(
            [request.question, *request.search_context.topic_tags]
        )
        question = " ".join(search_text.replace('"', " ").split())
        clauses = [question, "isDocument=true"]

        file_types = [
            extension.lower().lstrip(".")
            for extension in request.search.file_types
            if extension.strip()
        ]
        if file_types:
            type_query = " OR ".join(f"filetype:{extension}" for extension in file_types)
            clauses.append(f"({type_query})")

        if request.search.modified_after:
            date_value = request.search.modified_after.date().isoformat()
            clauses.append(f"LastModifiedTime>{date_value}")

        return " AND ".join(clauses)

    def _to_search_hit(
        self,
        raw_hit: Dict[str, Any],
        resource: Dict[str, Any],
        ordinal: int,
    ) -> ProviderSearchHit:
        parent = resource.get("parentReference") or {}
        file_data = resource.get("file") or {}
        fields = (resource.get("listItem") or {}).get("fields") or {}
        created_by = (resource.get("createdBy") or {}).get("user") or {}
        modified_by = (resource.get("lastModifiedBy") or {}).get("user") or {}

        raw_metadata = {
            "source_type": _field(fields, "source_type", "DocumentType", "ContentType")
            or "unknown",
            "effective_from": _field(
                fields, "effective_from", "EffectiveFrom", "Effective_x0020_From"
            ),
            "effective_until": _field(
                fields, "effective_until", "EffectiveUntil", "Effective_x0020_Until"
            ),
            "review_due_at": _field(
                fields, "review_due_at", "ReviewDue", "Review_x0020_Due"
            ),
            "version": _field(fields, "version", "Version", "_UIVersionString"),
            "author": _field(fields, "author", "Author")
            or modified_by.get("displayName")
            or created_by.get("displayName"),
            "country": _field(fields, "country", "Country"),
            "language": _field(fields, "language", "Language"),
            "status": _field(fields, "status", "Status") or "unknown",
            "sharepoint_fields": fields,
            "size_bytes": resource.get("size"),
        }

        return ProviderSearchHit(
            provider=self.provider,
            item_id=str(resource["id"]),
            name=str(resource["name"]),
            mime_type=file_data.get("mimeType"),
            web_url=resource.get("webUrl"),
            site_id=parent.get("siteId"),
            drive_id=parent.get("driveId"),
            path=parent.get("path"),
            created_at=_parse_datetime(resource.get("createdDateTime")),
            modified_at=_parse_datetime(resource.get("lastModifiedDateTime")),
            etag=resource.get("eTag"),
            rank=_integer(raw_hit.get("rank")) or ordinal,
            provider_score=None,
            raw_metadata=raw_metadata,
        )


def _field(fields: Mapping[str, Any], *names: str) -> Any:
    lowered = {str(key).lower(): value for key, value in fields.items()}
    for name in names:
        if name in fields:
            return fields[name]
        if name.lower() in lowered:
            return lowered[name.lower()]
    return None


def _parse_datetime(value: Any) -> Optional[datetime]:
    if not value or not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _integer(value: Any) -> Optional[int]:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _safe_oauth_error(content: bytes) -> str:
    """Return useful Entra error fields without reflecting request credentials."""

    try:
        payload = json.loads(content.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return "authentication request was rejected"

    code = str(payload.get("error", "authentication_error"))
    description = str(payload.get("error_description", "request was rejected"))
    return f"{code}: {description[:300]}"
