import { NextResponse } from "next/server";
import { extractBrief } from "@/lib/llm";
import { briefRequestSchema } from "@/lib/schemas";

export async function POST(req: Request) {
  const parsed = briefRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  return NextResponse.json(await extractBrief(parsed.data));
}
