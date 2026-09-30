/**
 * Search module — STUB.
 * Loads the demo corpus from fixtures and applies a simple keyword/tag filter.
 * The real implementation would query an index fed by lib/connectors.
 */
import corpusJson from "@/fixtures/corpus.json";
import { corpusSchema } from "@/lib/schemas";
import { keywords, stem } from "@/lib/text/keywords";
import type { Candidate, DocumentRecord, SearchBrief } from "@/lib/types";

const corpus: DocumentRecord[] = corpusSchema.parse(corpusJson);

export function getCorpus(): DocumentRecord[] {
  return corpus;
}

export function searchDocuments(brief: SearchBrief): Candidate[] {
  const terms = new Set([...brief.topic_tags.map((t) => stem(t.toLowerCase())), ...keywords(brief.question)]);
  return corpus.filter((doc) => {
    if (brief.source_types?.length && !brief.source_types.includes(doc.source_type)) return false;
    const docTerms = new Set([...doc.topic_tags.map((t) => stem(t.toLowerCase())), ...keywords(`${doc.title} ${doc.summary}`)]);
    for (const t of terms) if (docTerms.has(t)) return true;
    return false;
  });
}
