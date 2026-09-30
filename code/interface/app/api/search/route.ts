import { NextResponse } from "next/server";
import { DEMO_TODAY } from "@/lib/config";
import { runSearch } from "@/lib/pipeline/run-search";
import { searchBriefSchema } from "@/lib/schemas";

export async function POST(req: Request) {
  const parsed = searchBriefSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid search brief" }, { status: 400 });
  // No time point given → search around today.
  return NextResponse.json(runSearch({ ...parsed.data, reference_date: parsed.data.reference_date ?? DEMO_TODAY }));
}
