import { NextResponse } from "next/server";
import { extractBrief } from "@/lib/llm";
import { briefRequestSchema } from "@/lib/schemas";
import { readJsonBody, serverError } from "@/lib/security/http";
import { rateLimit } from "@/lib/security/rate-limit";

export async function POST(req: Request) {
  const limited = rateLimit(req, "brief", 30);
  if (limited) return limited;

  const body = await readJsonBody(req);
  if (!body.ok) return body.response;
  const parsed = briefRequestSchema.safeParse(body.data);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  try {
    return NextResponse.json(await extractBrief(parsed.data));
  } catch (err) {
    return serverError("brief", err);
  }
}
