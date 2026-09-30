import "server-only";
import { NextResponse } from "next/server";

/** Largest request body any API route accepts. A full chat transcript stays well below this. */
export const MAX_BODY_BYTES = 64 * 1024;

export type BodyResult = { ok: true; data: unknown } | { ok: false; response: NextResponse };

const fail = (error: string, status: number): BodyResult => ({ ok: false, response: NextResponse.json({ error }, { status }) });

/**
 * Reads a JSON body defensively: JSON content type only (which also forces a CORS preflight for cross-site
 * requests), bounded size, and no exception on malformed input.
 */
export async function readJsonBody(req: Request, maxBytes = MAX_BODY_BYTES): Promise<BodyResult> {
  const type = req.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/json")) return fail("Expected application/json", 415);

  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > maxBytes) return fail("Request too large", 413);

  let text: string;
  try {
    text = await req.text();
  } catch {
    return fail("Could not read request", 400);
  }
  if (new TextEncoder().encode(text).length > maxBytes) return fail("Request too large", 413);

  try {
    return { ok: true, data: JSON.parse(text) };
  } catch {
    return fail("Malformed JSON", 400);
  }
}

/** Generic 500 — never leak internals to the client. */
export function serverError(where: string, err: unknown): NextResponse {
  console.error(`${where} failed`, err);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}
