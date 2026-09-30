import { NextResponse } from "next/server";
import { convertToModelMessages } from "ai";
import { streamClarify } from "@/lib/llm";
import { chatRequestSchema, toTextMessages } from "@/lib/schemas";
import { readJsonBody, serverError } from "@/lib/security/http";
import { rateLimit } from "@/lib/security/rate-limit";

export async function POST(req: Request) {
  const limited = rateLimit(req, "chat", 30);
  if (limited) return limited;

  const body = await readJsonBody(req);
  if (!body.ok) return body.response;
  const parsed = chatRequestSchema.safeParse(body.data);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  // Rebuilt from scratch: user/assistant roles and plain text only.
  const messages = toTextMessages(parsed.data.messages);
  if (!messages.some((m) => m.role === "user")) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  try {
    return streamClarify(convertToModelMessages(messages)).toUIMessageStreamResponse();
  } catch (err) {
    return serverError("chat", err);
  }
}
