import "server-only";
import { NextResponse } from "next/server";

/**
 * Small in-memory, fixed-window rate limiter for the LLM-backed routes (they cost money per call).
 * Per server instance only — good enough for a prototype; swap for a shared store (e.g. Redis) when scaling out.
 */
type Window = { start: number; count: number };

const WINDOW_MS = 60_000;
const MAX_KEYS = 10_000;
const buckets = new Map<string, Map<string, Window>>();

function clientKey(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (forwarded || req.headers.get("x-real-ip") || "unknown").slice(0, 100);
}

/** Returns a 429 response when the caller exceeded `limit` requests per minute on `bucket`, otherwise null. */
export function rateLimit(req: Request, bucket: string, limit: number): NextResponse | null {
  const now = Date.now();
  let windows = buckets.get(bucket);
  if (!windows) buckets.set(bucket, (windows = new Map()));

  if (windows.size > MAX_KEYS) {
    for (const [k, w] of windows) if (now - w.start > WINDOW_MS) windows.delete(k);
    if (windows.size > MAX_KEYS) windows.clear();
  }

  const key = clientKey(req);
  const w = windows.get(key);
  if (!w || now - w.start > WINDOW_MS) {
    windows.set(key, { start: now, count: 1 });
    return null;
  }
  if (++w.count <= limit) return null;

  const retryAfter = Math.max(1, Math.ceil((w.start + WINDOW_MS - now) / 1000));
  return NextResponse.json(
    { error: "Too many requests. Please wait a moment." },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}
