import { buildAnswer, evaluateFit, pickExpert } from "@/lib/evaluate";
import { searchDocuments } from "@/lib/search";
import type { SearchBrief, SearchResponse } from "@/lib/types";

/** SearchBrief → candidates → scored results + conflicts + answer + expert. */
export function runSearch(brief: SearchBrief): SearchResponse {
  const candidates = searchDocuments(brief);
  const { results, conflicts } = evaluateFit(brief, candidates);
  const answer = buildAnswer(brief, results, conflicts);
  const expert = pickExpert(results);
  return { brief, results, conflicts, answer, expert };
}
