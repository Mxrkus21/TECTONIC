import { NextResponse } from "next/server";
import { convertToModelMessages, type UIMessage } from "ai";
import { streamClarify } from "@/lib/llm";
import { chatRequestSchema } from "@/lib/schemas";

export async function POST(req: Request) {
  const parsed = chatRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  // Only user/assistant text parts are forwarded to the model.
  const messages = parsed.data.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ ...m, parts: m.parts.filter((p) => p.type === "text") })) as UIMessage[];
  const result = streamClarify(convertToModelMessages(messages));
  return result.toUIMessageStreamResponse();
}
