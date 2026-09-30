import { NextResponse } from "next/server";
import { runSearch } from "@/lib/pipeline/run-search";
import { searchBriefSchema } from "@/lib/schemas";

export async function POST(req: Request) {
  const parsed = searchBriefSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid search brief" }, { status: 400 });
  return NextResponse.json(runSearch(parsed.data));
}
