/**
 * Ready-to-copy Next.js server route for Henry's interface.
 *
 * Copy this file to:
 *   code/interface/app/api/evidence/route.ts
 *
 * Add these server-only values to code/interface/.env.local:
 *   DATA_COLLECTION_API_URL=https://your-cloud-run-service.run.app
 *   DATA_COLLECTION_API_TOKEN=your-server-to-server-token
 *
 * The browser calls POST /api/evidence with the existing SearchBrief. This
 * route keeps the bearer token on the server and returns the EvidenceBundle.
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";

const REQUEST_TIMEOUT_MS = 60_000;

function configuration(): { baseUrl: string; token: string } | null {
  const baseUrl = process.env.DATA_COLLECTION_API_URL?.trim().replace(/\/$/, "");
  const token = process.env.DATA_COLLECTION_API_TOKEN?.trim();

  if (!baseUrl || !token) return null;
  return { baseUrl, token };
}

export async function GET() {
  const config = configuration();
  if (!config) {
    return NextResponse.json(
      { status: "not_configured" },
      { status: 503 },
    );
  }

  try {
    const response = await fetch(`${config.baseUrl}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const health = await response.json().catch(() => null);

    return NextResponse.json(
      {
        status: response.ok ? "ok" : "upstream_error",
        collector: health,
      },
      { status: response.ok ? 200 : 502 },
    );
  } catch {
    return NextResponse.json(
      { status: "collector_unreachable" },
      { status: 502 },
    );
  }
}

export async function POST(request: Request) {
  const config = configuration();
  if (!config) {
    return NextResponse.json(
      { error: "Data Collection API is not configured" },
      { status: 503 },
    );
  }

  const searchBrief = await request.json().catch(() => null);
  if (!searchBrief || typeof searchBrief !== "object") {
    return NextResponse.json(
      { error: "Request body must be a SearchBrief JSON object" },
      { status: 400 },
    );
  }

  try {
    const response = await fetch(
      `${config.baseUrl}/api/v1/evidence/collect`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.token}`,
        },
        body: JSON.stringify(searchBrief),
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );

    const body = await response.json().catch(() => null);
    if (!response.ok) {
      return NextResponse.json(
        {
          error: "Evidence collection failed",
          upstream_status: response.status,
          detail: body?.detail ?? null,
        },
        { status: 502 },
      );
    }

    return NextResponse.json(body);
  } catch (error) {
    const timedOut =
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError");

    return NextResponse.json(
      {
        error: timedOut
          ? "Evidence collection timed out"
          : "Data Collection API is unreachable",
      },
      { status: timedOut ? 504 : 502 },
    );
  }
}
