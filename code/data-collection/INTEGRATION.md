# Interface integration

This connects the existing Next.js interface to the deployed data-collection
service without exposing the collector token to the browser.

## 1. Copy the API route

From the repository root:

```bash
mkdir -p code/interface/app/api/evidence
cp code/data-collection/nextjs-evidence-route.ts \
  code/interface/app/api/evidence/route.ts
```

## 2. Configure the interface server

Add these values to `code/interface/.env.local`:

```ini
DATA_COLLECTION_API_URL=https://tectonic-data-collection-955103998892.us-east1.run.app
DATA_COLLECTION_API_TOKEN=<shared server-to-server token>
```

Do not prefix either variable with `NEXT_PUBLIC_`. Do not commit `.env.local`.

Restart the Next.js development server after changing environment values:

```bash
cd code/interface
npm run dev
```

## 3. Verify the connection

Health proxy:

```bash
curl http://localhost:3000/api/evidence
```

Expected shape:

```json
{
  "status": "ok",
  "collector": {
    "status": "ok",
    "provider": "google_drive"
  }
}
```

Collect real evidence:

```bash
curl -X POST http://localhost:3000/api/evidence \
  -H "Content-Type: application/json" \
  --data-binary @../data-collection/search_brief.example.json
```

The response is an `EvidenceBundle`. Each returned document includes:

- `name` and `web_url`
- complete extracted text in `content.full_text`
- best matching excerpts in `content.relevant_passages`
- dates and source information in `metadata`
- retrieval-only relevance signals in `retrieval_scores`

This route does not replace the current `/api/search` response yet. It creates
the safe, testable bridge to real documents first; the UI can consume
`/api/evidence` in the next integration step.
