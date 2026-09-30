import { NextResponse } from "next/server";
import { DEMO_TODAY } from "@/lib/config";
import { runSearch } from "@/lib/pipeline/run-search";
import { searchBriefSchema } from "@/lib/schemas";
import { readJsonBody, serverError } from "@/lib/security/http";

export async function POST(req: Request) {
  const body = await readJsonBody(req);
  if (!body.ok) return body.response;
  const parsed = searchBriefSchema.safeParse(body.data);
  if (!parsed.success) return NextResponse.json({ error: "Invalid search brief" }, { status: 400 });

  try {
    // No time point given → search around today.
    return NextResponse.json(runSearch({ ...parsed.data, reference_date: parsed.data.reference_date ?? DEMO_TODAY }));
  } catch (err) {
    return serverError("search", err);
  }
}
