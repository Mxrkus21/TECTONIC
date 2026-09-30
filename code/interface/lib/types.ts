export type SourceType = "policy" | "manual" | "checklist" | "email" | "teams_chat" | "workflow";

export type Claim = { key: string; value: string; unit?: string };

export type DocumentRecord = {
  id: string;
  source_type: SourceType;
  title: string;
  url: string;
  summary: string;
  claims: Claim[];
  topic_tags: string[];
  scope: { country?: string; client?: string | null; employee_category?: string | null };
  effective_from?: string;
  effective_until?: string | null;
  last_modified: string;
  last_reviewed?: string;
  owner: { name: string; role: string; active: boolean };
  authority_level: number; // 0..1
  supersedes?: string[];
  endorsements?: number;
  excerpt: string;
  /** Result of the offline link check (scripts/check-links.ts) for URLs found in the text. */
  links?: LinkCheck[];
};

export type LinkCheck = { url: string; ok: boolean; status: number; checked_at: string };

export type SearchBrief = {
  question: string;
  topic_tags: string[];
  scope: { country?: string; client?: string; employee_category?: string };
  reference_date: string; // ISO date
  source_types?: SourceType[];
};

export type FactorScores = { relevance: number; recency: number; scope: number; authority: number }; // 0..1

export type ResultFlag = "superseded" | "conflict_loser" | "out_of_scope" | "owner_inactive" | "outdated" | "not_yet_effective";

export type ScoredResult = {
  doc: DocumentRecord;
  fit: number; // raw weighted score, NOT clamped (can be < 0 or > 100)
  relative: number; // 0..1, fit normalised against the best result of this search
  shown: boolean; // relative >= SCORING.display.threshold (best result is always shown)
  factors: FactorScores;
  reasons: string[];
  flags: ResultFlag[];
};

export type Conflict = {
  claim_key: string;
  winner_id: string;
  loser_ids: string[];
  explanation: string;
};

export type Expert = { name: string; role: string; reason: string };

export type SearchResponse = {
  brief: SearchBrief;
  results: ScoredResult[];
  conflicts: Conflict[];
  answer: { text: string; citations: string[]; rely_on: string };
  expert?: Expert;
};

export type Candidate = DocumentRecord;
