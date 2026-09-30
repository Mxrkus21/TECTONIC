/* Asserts the demo scenario outcomes. Run: npm run check:scorer */
import { runSearch } from "@/lib/pipeline/run-search";
import type { SearchBrief } from "@/lib/types";

const base: SearchBrief = {
  question: "What is the deadline for submitting December payroll changes?",
  topic_tags: ["payroll", "deadline", "december", "changes", "cutoff", "year-end"],
  scope: { country: "BE" },
  reference_date: "2026-09-30",
};

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failed++;
}

for (const client of ["Acme", "Beta NV", undefined]) {
  const res = runSearch({ ...base, scope: { country: "BE", client } });
  console.log(`\n=== client=${client ?? "none"} ===`);
  for (const r of res.results) console.log(`  ${String(r.fit).padStart(3)}  ${r.doc.id.padEnd(22)} ${r.flags.join(",")}`);
  console.log("  answer:", res.answer.text);
  console.log("  rely:", res.answer.rely_on);
  for (const c of res.conflicts) console.log("  conflict:", c.winner_id, "beats", c.loser_ids.join(","));

  const c = res.conflicts[0];
  check("one conflict", res.conflicts.length === 1);
  check("winner is BE policy 2026", c?.winner_id === "pol-be-2026", c?.winner_id);
  check("losers are manual + teams chat", !!c && [...c.loser_ids].sort().join() === "chat-payroll-be,man-ops-v7", c?.loser_ids.join());
  check("top result is BE policy 2026 or Acme email", ["pol-be-2026", "mail-acme-exception"].includes(res.results[0].doc.id));
  check("expert is Pieter V.", res.expert?.name === "Pieter V.");
  check("answer mentions 15th", res.answer.text.includes("15th"));
  if (client === "Acme") {
    check("Acme answer mentions 18th exception", res.answer.text.includes("18th") && res.answer.citations.includes("mail-acme-exception"));
  } else {
    check("non-Acme answer does not use 18th as deadline", !res.answer.citations.includes("mail-acme-exception"));
  }
  const nl = res.results.find((r) => r.doc.id === "pol-nl-2026");
  check("NL policy flagged out of scope", !!nl?.flags.includes("out_of_scope"));
  const old = res.results.find((r) => r.doc.id === "pol-be-2025");
  check("2025 policy superseded", !!old?.flags.includes("superseded"));
}

console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
