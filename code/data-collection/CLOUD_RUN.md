# Cloud Run deployment

The service accepts Henry's existing `SearchBrief` at:

```text
POST /api/v1/evidence/collect
```

The browser must not call this service directly. Henry's server route calls it
with `Authorization: Bearer <token>` and returns the downstream response to the
browser.

## Runtime configuration

Non-secret environment variables:

```text
DATA_COLLECTION_PROVIDER=google_drive
DOCUMENT_AI_ENABLED=true
GOOGLE_CLOUD_PROJECT=<project-id>
DOCUMENT_AI_LOCATION=us
DOCUMENT_AI_PROCESSOR_ID=<processor-id>
GOOGLE_DRIVE_FOLDER_ID=<folder-id>
```

Secrets, supplied through Google Secret Manager:

```text
GOOGLE_DRIVE_API_KEY
DATA_COLLECTION_API_TOKEN
```

Do not deploy `.env`. Both `.gitignore` and `.dockerignore` exclude it.

## Container contract

The image starts `uvicorn api:app` on port `8080`. On Cloud Run, Google client
libraries use the attached service identity automatically; no local ADC file or
service-account JSON key is copied into the image.

The service identity needs `roles/documentai.apiUser` and access to both Secret
Manager secrets. The service can be publicly reachable because the collection
endpoint separately requires `DATA_COLLECTION_API_TOKEN`; keep that token only
in Henry's server-side environment.

## Verification

```bash
curl "$DATA_COLLECTION_API_URL/health"

curl -X POST "$DATA_COLLECTION_API_URL/api/v1/evidence/collect" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $DATA_COLLECTION_API_TOKEN" \
  --data-binary @henry_leave_brief.example.json
```
