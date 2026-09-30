/* Asserts the demo scenario outcomes. Run: npm run check:scorer */
import { runSearch } from "@/lib/pipeline/run-search";
import type { SearchBrief, SearchResponse } from "@/lib/types";

const QUESTION = "What is the deadline for submitting December payroll changes?";
const BRIEFS: { name: string; topic_tags: string[] }[] = [
  { name: "curated tags", topic_tags: ["payroll", "deadline", "december", "changes", "cutoff", "year-end"] },
  // What the UI sends in mock mode (heuristicBrief in lib/llm) — hardcoded because lib/llm is server-only.
  { name: "UI mock tags", topic_tags: ["deadline", "submitting", "december", "payroll", "change", "year-end", "cutoff"] },
];

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failed++;
}

function run(tags: string[], client: string | undefined, reference_date: string): SearchResponse {
  const brief: SearchBrief = { question: QUESTION, topic_tags: tags, scope: { country: "BE", client }, reference_date };
  const res = runSearch(brief);
  console.log(`\n=== ${reference_date} · client=${client ?? "none"} ===`);
  for (const r of res.results)
    console.log(`  ${String(r.fit).padStart(4)}  ${r.relative.toFixed(2)} ${r.shown ? "shown " : "hidden"}  ${r.doc.id.padEnd(20)} ${r.flags.join(",")}`);
  console.log("  answer:", res.answer.text);
  for (const c of res.conflicts) console.log("  conflict:", c.winner_id, "beats", c.loser_ids.join(","));
  return res;
}

const flagsOf = (res: SearchResponse, id: string) => res.results.find((r) => r.doc.id === id)?.flags ?? [];

for (const b of BRIEFS) {
  console.log(`\n##### ${b.name} #####`);

  // --- Today (2026-09-30): the original demo must be unchanged. ---
  for (const client of ["Acme", "Beta NV", undefined]) {
    const res = run(b.topic_tags, client, "2026-09-30");
    const c = res.conflicts[0];
    check("one conflict", res.conflicts.length === 1);
    check("winner is BE policy 2026", c?.winner_id === "pol-be-2026", c?.winner_id);
    check("losers are manual + teams chat", !!c && [...c.loser_ids].sort().join() === "chat-payroll-be,man-ops-v7", c?.loser_ids.join());
    check("top result is BE policy 2026 or Acme email", ["pol-be-2026", "mail-acme-exception"].includes(res.results[0].doc.id));
    check("expert is Pieter V.", res.expert?.name === "Pieter V.");
    check("answer says 15th", res.answer.text.includes("15th"));
    if (client === "Acme") check("Acme answer has 18th exception", res.answer.text.includes("18th") && res.answer.citations.includes("mail-acme-exception"));
    else check("non-Acme answer does not use 18th", !res.answer.citations.includes("mail-acme-exception"));
    check("NL policy out of scope", flagsOf(res, "pol-nl-2026").includes("out_of_scope"));
    check("2025 policy superseded", flagsOf(res, "pol-be-2025").includes("superseded"));
    check("2027 policy not yet in effect", flagsOf(res, "pol-be-2027").includes("not_yet_effective"));
    check("2027 policy does not supersede 2026 yet", !flagsOf(res, "pol-be-2026").includes("superseded"));
    check("2027 policy hidden", !res.results.find((r) => r.doc.id === "pol-be-2027")?.shown);
    check("answer ignores 12th", !res.answer.text.includes("12th"));

    check("best result is the normalisation reference", res.results[0].relative === 1);
    check("flagged sources are below the threshold", res.results.filter((r) => r.flags.length).every((r) => !r.shown));
    const hiddenCited = res.answer.citations.filter((id) => !res.results.find((r) => r.doc.id === id)?.shown);
    if (hiddenCited.length) console.log(`  NOTE  cited but below threshold: ${hiddenCited.join(", ")}`);
    const policy = res.results.find((r) => r.doc.id === "pol-be-2026");
    check("working link earns a bonus", !!policy?.reasons.some((x) => x.includes("verified working")));
    check("no NaN scores", res.results.every((r) => Number.isFinite(r.fit) && Number.isFinite(r.relative)));
  }

  // --- Future (2027-01-15): the 2027 policy is in effect and wins. ---
  {
    const res = run(b.topic_tags, "Beta NV", "2027-01-15");
    check("2027: winner is BE policy 2027", res.conflicts[0]?.winner_id === "pol-be-2027", res.conflicts[0]?.winner_id);
    check("2027: 2026 policy superseded", flagsOf(res, "pol-be-2026").includes("superseded"));
    check("2027: answer says 12th", res.answer.text.includes("12th"));
    check("2027: ServiceNow rule outranked", !!res.conflicts[0]?.loser_ids.includes("wf-snow-block"));
  }

  // --- Past (2025-06-01): the 2025 policy is in effect; 2026+ documents are not yet valid. ---
  {
    const res = run(b.topic_tags, "Beta NV", "2025-06-01");
    check("2025: 2025 policy not superseded", !flagsOf(res, "pol-be-2025").includes("superseded"));
    check("2025: 2026 policy not yet in effect", flagsOf(res, "pol-be-2026").includes("not_yet_effective"));
    check("2025: answer says 20th", res.answer.text.includes("20th"));
    check("2025: top result is 2025 policy", res.results[0].doc.id === "pol-be-2025", res.results[0].doc.id);
  }
}

console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
