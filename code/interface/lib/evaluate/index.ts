/**
 * Evaluation module — deterministic, explainable fit scoring.
 *
 * fit = 100 × (w.relevance·relevance + w.recency·recency + w.scope·scope + w.authority·authority + w.ownerActive·ownerActive)
 *       + link bonus − penalties (superseded, conflict loser, out of scope). NOT clamped.
 *
 * Recency is relative to the newest document found: half-life = age of that document (days), at least 14 days.
 * Display: fits are shifted by an offset and normalised by the best result; results below the threshold are hidden.
 *
 * Every adjustment adds a plain-language entry to `reasons` so the UI can show WHY a document ranks where it does.
 */
import { keywords, stem } from "@/lib/text/keywords";
import type {
  Candidate,
  Conflict,
  DocumentRecord,
  Expert,
  FactorScores,
  ResultFlag,
  ScoredResult,
  SearchBrief,
  SearchResponse,
} from "@/lib/types";

export const SCORING = {
  weights: { relevance: 0.4, recency: 0.2, scope: 0.2, authority: 0.15, ownerActive: 0.05 },
  penalties: { superseded: 30, conflictLoser: 20, outOfScope: 25 },
  recency: { minHalfLifeDays: 14, expiredMultiplier: 0.5 },
  /** Bonus points for verified working links in the text (scaled by the share of working links). */
  linkBonus: { points: 5 },
  display: {
    threshold: 0.7,
    /**
     * "negative-only": shift only if the lowest fit is below 0 (e.g. -7, 8, 1 → 0, 15, 8), then divide by the best.
     * "min-max": always shift the lowest fit to 0. Stretches every batch over 0..1, so close results can be cut.
     */
    offsetMode: "negative-only" as "negative-only" | "min-max",
  },
  scope: { countryMismatch: 0.1, noCountryInBrief: 0.6, generalMatch: 0.8, clientMatch: 1.0, otherClient: 0 },
  relevance: { tagWeight: 0.7, textWeight: 0.3 },
} as const;

/** Human-readable labels/formatters for known claim keys. */
const CLAIM_FORMAT: Record<string, { label: string; format: (v: string) => string }> = {
  december_cutoff_day: { label: "December payroll change deadline", format: (v) => `${ordinal(v)} of December` },
};

export function formatClaim(key: string, value: string, unit?: string): string {
  return CLAIM_FORMAT[key]?.format(value) ?? `${value}${unit ? ` ${unit}` : ""}`;
}

export function claimLabel(key: string): string {
  return CLAIM_FORMAT[key]?.label ?? key.replace(/_/g, " ");
}

function ordinal(v: string): string {
  const n = Number(v);
  if (!Number.isInteger(n)) return v;
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${s}`;
}

const SOURCE_LABEL: Record<DocumentRecord["source_type"], string> = {
  policy: "Official policy",
  manual: "Operations manual",
  checklist: "Checklist",
  email: "Email",
  teams_chat: "Teams chat message",
  workflow: "Enforced workflow rule",
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function daysBetween(fromIso: string, toIso: string): number {
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  return ms / (1000 * 60 * 60 * 24);
}

/** Latest of effective_from / last_modified, never later than the reference date. */
function docDate(doc: DocumentRecord, referenceDate: string): string {
  const dates = [doc.effective_from, doc.last_modified].filter((d): d is string => !!d && d <= referenceDate);
  return dates.sort().at(-1) ?? doc.last_modified;
}

type RecencyContext = { newest: string; halfLifeDays: number };

/** The newest document found is the reference; its age (in days) becomes the half-life, min. 14 days. */
function recencyContext(brief: SearchBrief, candidates: Candidate[]): RecencyContext {
  const newest = candidates.map((d) => docDate(d, brief.reference_date)).sort().at(-1) ?? brief.reference_date;
  const halfLifeDays = Math.max(SCORING.recency.minHalfLifeDays, daysBetween(newest, brief.reference_date));
  return { newest, halfLifeDays };
}

const URL_RE = /https?:\/\/[^\s"'<>)\]]+/g;

export function extractLinks(doc: DocumentRecord): string[] {
  const text = `${doc.summary} ${doc.excerpt}`;
  return Array.from(new Set((text.match(URL_RE) ?? []).map((u) => u.replace(/[.,;:!?]+$/, ""))));
}

/** Uses the stored offline link check; unchecked links count as not working. */
function scoreLinks(doc: DocumentRecord, reasons: string[]): number {
  const links = extractLinks(doc);
  if (!links.length) return 0;
  const checked = new Map((doc.links ?? []).map((l) => [l.url, l]));
  const working = links.filter((u) => checked.get(u)?.ok).length;
  const bonus = SCORING.linkBonus.points * (working / links.length);
  reasons.push(
    working
      ? `${working} of ${links.length} linked source${links.length > 1 ? "s" : ""} verified working (+${Math.round(bonus * 10) / 10})`
      : `Contains ${links.length} broken or unverified link${links.length > 1 ? "s" : ""} (no bonus)`,
  );
  return bonus;
}

/**
 * Hook for LLM-based semantic relevance. Returns null today, so the keyword score is used.
 * Later: ask Gemini to rate how well `doc` answers `brief.question` (0..1) and blend it in.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function llmRelevance(_brief: SearchBrief, _doc: DocumentRecord): Promise<number | null> {
  return null;
}

function scoreRelevance(brief: SearchBrief, doc: DocumentRecord, reasons: string[]): number {
  const briefTags = new Set(brief.topic_tags.map((t) => stem(t.toLowerCase())));
  const docTags = new Set(doc.topic_tags.map((t) => stem(t.toLowerCase())));
  const matchedTags = [...briefTags].filter((t) => docTags.has(t));
  const tagScore = briefTags.size ? matchedTags.length / briefTags.size : 0;

  const qTerms = keywords(brief.question);
  const docText = new Set(keywords(`${doc.title} ${doc.summary} ${doc.excerpt} ${doc.topic_tags.join(" ")}`));
  const textScore = qTerms.length ? qTerms.filter((t) => docText.has(t)).length / qTerms.length : 0;

  const score = SCORING.relevance.tagWeight * tagScore + SCORING.relevance.textWeight * textScore;
  reasons.push(
    matchedTags.length
      ? `Matches ${matchedTags.length} of ${briefTags.size} search topics (${matchedTags.slice(0, 4).join(", ")})`
      : "Few topic matches with your question",
  );
  return clamp(score, 0, 1);
}

function scoreRecency(brief: SearchBrief, doc: DocumentRecord, ctx: RecencyContext, reasons: string[], flags: ResultFlag[]): number {
  const latest = docDate(doc, brief.reference_date);
  const behind = Math.max(0, daysBetween(latest, ctx.newest));
  let score = Math.pow(0.5, behind / ctx.halfLifeDays);
  const hl = Math.round(ctx.halfLifeDays);
  reasons.push(
    behind < 1
      ? `Newest source found (${latest}) — sets the recency half-life to ${hl} days`
      : `Last updated ${latest}, ${Math.round(behind)} days older than the newest source (half-life ${hl} days)`,
  );
  const months = daysBetween(latest, brief.reference_date) / 30.44;

  if (doc.effective_until && doc.effective_until < brief.reference_date) {
    score *= SCORING.recency.expiredMultiplier;
    flags.push("outdated");
    reasons.push(`Expired on ${doc.effective_until}`);
  } else if (months > 18) {
    flags.push("outdated");
    reasons.push("Not updated in over 18 months — may be stale");
  }
  return clamp(score, 0, 1);
}

function scoreScope(brief: SearchBrief, doc: DocumentRecord, reasons: string[], flags: ResultFlag[]): number {
  const s = SCORING.scope;
  const docCountry = doc.scope.country;
  const wantCountry = brief.scope.country;

  if (wantCountry && docCountry && docCountry.toUpperCase() !== wantCountry.toUpperCase()) {
    flags.push("out_of_scope");
    reasons.push(`Wrong country (${docCountry}) — you asked about ${wantCountry}`);
    return s.countryMismatch;
  }

  const docClient = doc.scope.client ?? null;
  const wantClient = brief.scope.client;
  if (docClient) {
    if (wantClient && docClient.toLowerCase() === wantClient.toLowerCase()) {
      reasons.push(`Specific to your client (${docClient})`);
      return s.clientMatch;
    }
    flags.push("out_of_scope");
    reasons.push(`Only applies to client ${docClient}${wantClient ? ` — you asked about ${wantClient}` : ""}`);
    return s.otherClient;
  }

  if (!wantCountry) {
    reasons.push("No country selected — scope could not be verified");
    return s.noCountryInBrief;
  }
  reasons.push(`Applies to all ${docCountry ?? wantCountry} clients`);
  return s.generalMatch;
}

function scoreAuthority(doc: DocumentRecord, reasons: string[]): number {
  const endorse = doc.endorsements ? `, ${doc.endorsements} informal endorsements` : "";
  reasons.push(`${SOURCE_LABEL[doc.source_type]} (authority ${doc.authority_level.toFixed(1)}${endorse})`);
  return clamp(doc.authority_level, 0, 1);
}

function baseFit(f: FactorScores, ownerActive: number): number {
  const w = SCORING.weights;
  return 100 * (w.relevance * f.relevance + w.recency * f.recency + w.scope * f.scope + w.authority * f.authority + w.ownerActive * ownerActive);
}

/** Score candidates, detect conflicts, apply penalties, and re-rank. */
export function evaluateFit(brief: SearchBrief, candidates: Candidate[]): { results: ScoredResult[]; conflicts: Conflict[] } {
  const recency = recencyContext(brief, candidates);
  const supersededBy = new Map<string, DocumentRecord>();
  for (const d of candidates) for (const id of d.supersedes ?? []) supersededBy.set(id, d);

  // Pass 1: factor scores + base fit + superseded penalty.
  const results: ScoredResult[] = candidates.map((doc) => {
    const reasons: string[] = [];
    const flags: ResultFlag[] = [];
    const factors: FactorScores = {
      relevance: round2(scoreRelevance(brief, doc, reasons)),
      recency: round2(scoreRecency(brief, doc, recency, reasons, flags)),
      scope: round2(scoreScope(brief, doc, reasons, flags)),
      authority: round2(scoreAuthority(doc, reasons)),
    };
    const ownerActive = doc.owner.active ? 1 : 0;
    if (!doc.owner.active) {
      flags.push("owner_inactive");
      reasons.push(`Owner ${doc.owner.name} is no longer active`);
    }
    let fit = baseFit(factors, ownerActive) + scoreLinks(doc, reasons);

    const newer = supersededBy.get(doc.id);
    if (newer) {
      fit -= SCORING.penalties.superseded;
      flags.push("superseded");
      reasons.push(`Superseded by "${newer.title}" (−${SCORING.penalties.superseded})`);
    }
    if (flags.includes("out_of_scope")) {
      fit -= SCORING.penalties.outOfScope;
      reasons.push(`Outside your scope (−${SCORING.penalties.outOfScope})`);
    }
    return { doc, fit, relative: 0, shown: false, factors, reasons, flags };
  });

  // Pass 2: conflict detection among in-scope, current, general (non client-specific) documents.
  const conflicts = detectConflicts(results);
  const byId = new Map(results.map((r) => [r.doc.id, r]));
  for (const c of conflicts) {
    const winner = byId.get(c.winner_id)!;
    for (const id of c.loser_ids) {
      const r = byId.get(id)!;
      r.fit -= SCORING.penalties.conflictLoser;
      r.flags.push("conflict_loser");
      const loserClaim = r.doc.claims.find((cl) => cl.key === c.claim_key)!;
      const winClaim = winner.doc.claims.find((cl) => cl.key === c.claim_key)!;
      r.reasons.push(
        `Contradicts "${winner.doc.title}" (says ${formatClaim(c.claim_key, loserClaim.value)} instead of ${formatClaim(c.claim_key, winClaim.value)}) (−${SCORING.penalties.conflictLoser})`,
      );
    }
  }

  results.sort((a, b) => b.fit - a.fit);
  normalise(results);
  for (const r of results) r.fit = Math.round(r.fit);
  return { results, conflicts };
}

/** Offset + normalise against the best result, then mark what passes the display threshold. */
function normalise(results: ScoredResult[]) {
  if (!results.length) return;
  const { threshold, offsetMode } = SCORING.display;
  const min = Math.min(...results.map((r) => r.fit));
  const offset = offsetMode === "min-max" ? -min : Math.max(0, -min);
  const best = Math.max(...results.map((r) => r.fit + offset));
  results.forEach((r, i) => {
    r.relative = best > 0 ? round2((r.fit + offset) / best) : 1;
    r.shown = i === 0 || r.relative >= threshold;
  });
}

function isConflictEligible(r: ScoredResult): boolean {
  return !r.flags.includes("superseded") && !r.flags.includes("out_of_scope") && !r.doc.scope.client;
}

function detectConflicts(results: ScoredResult[]): Conflict[] {
  const eligible = results.filter(isConflictEligible);
  const keys = new Set(eligible.flatMap((r) => r.doc.claims.map((c) => c.key)));
  const conflicts: Conflict[] = [];

  for (const key of keys) {
    const holders = eligible
      .map((r) => ({ r, claim: r.doc.claims.find((c) => c.key === key) }))
      .filter((h): h is { r: ScoredResult; claim: NonNullable<typeof h.claim> } => !!h.claim)
      .sort((a, b) => b.r.fit - a.r.fit);
    const values = new Set(holders.map((h) => h.claim.value));
    if (values.size < 2) continue;

    const winner = holders[0];
    const agreeing = holders.filter((h) => h.claim.value === winner.claim.value);
    const losers = holders.filter((h) => h.claim.value !== winner.claim.value);

    const loserDesc = losers
      .map((l) => `${l.r.doc.title} (${l.r.doc.last_modified}${l.r.doc.owner.active ? "" : ", owner inactive"})`)
      .join("; ");
    const why = [
      `${SOURCE_LABEL[winner.r.doc.source_type].toLowerCase()} with the highest fit (${Math.round(winner.r.fit)})`,
      `last updated ${winner.r.doc.last_modified}`,
      agreeing.length > 1 ? `confirmed by ${agreeing.length - 1} other source${agreeing.length > 2 ? "s" : ""}` : null,
    ]
      .filter(Boolean)
      .join(", ");

    conflicts.push({
      claim_key: key,
      winner_id: winner.r.doc.id,
      loser_ids: losers.map((l) => l.r.doc.id),
      explanation: `${agreeing.length} source${agreeing.length > 1 ? "s say" : " says"} ${formatClaim(key, winner.claim.value)}, ${losers.length} say${losers.length > 1 ? "" : "s"} otherwise. "${winner.r.doc.title}" wins: ${why}. Older or less authoritative sources: ${loserDesc}.`,
    });
  }
  return conflicts;
}

/** Build the final answer from winning claims plus client-specific exceptions. */
export function buildAnswer(brief: SearchBrief, results: ScoredResult[], conflicts: Conflict[]): SearchResponse["answer"] {
  const usable = results.filter((r) => !r.flags.includes("superseded") && !r.flags.includes("out_of_scope") && !r.flags.includes("conflict_loser"));
  const top = usable.find((r) => !r.doc.scope.client) ?? usable[0];
  if (!top || !top.doc.claims.length) {
    return { text: "No trusted answer found for this scope. Try adjusting the country or client.", citations: [], rely_on: "" };
  }

  const key = top.doc.claims[0].key;
  const winning = conflicts.find((c) => c.claim_key === key);
  const standardDoc = winning ? results.find((r) => r.doc.id === winning.winner_id)! : top;
  const standard = standardDoc.doc.claims.find((c) => c.key === key)!;
  const agreeing = usable.filter((r) => !r.doc.scope.client && r.doc.claims.some((c) => c.key === key && c.value === standard.value));

  const exception = usable.find((r) => r.doc.scope.client && r.doc.claims.some((c) => c.key === key && c.value !== standard.value));
  const country = brief.scope.country ? ` (${brief.scope.country})` : "";
  let text: string;
  const citations: string[] = [];

  if (exception) {
    const exClaim = exception.doc.claims.find((c) => c.key === key)!;
    text =
      `For ${exception.doc.scope.client}: the ${claimLabel(key)} is the ${formatClaim(key, exClaim.value)} — a client-specific exception ` +
      `confirmed by ${exception.doc.owner.name} on ${exception.doc.last_modified}. ` +
      `The standard deadline for all other clients${country} is the ${formatClaim(key, standard.value)}.`;
    citations.push(exception.doc.id);
  } else {
    text = `The ${claimLabel(key)}${country} is the ${formatClaim(key, standard.value)}.`;
    const otherExceptions = results.filter((r) => r.doc.scope.client && r.flags.includes("out_of_scope") && !r.flags.includes("superseded") && r.factors.scope === 0 && r.doc.scope.country === brief.scope.country);
    if (otherExceptions.length) {
      text += ` Note: client-specific exceptions exist for ${otherExceptions.map((r) => r.doc.scope.client).join(", ")}.`;
    }
  }
  citations.push(...agreeing.map((r) => r.doc.id));

  const kinds = agreeing.map((r) => SOURCE_LABEL[r.doc.source_type].toLowerCase());
  const losers = winning?.loser_ids.length ?? 0;
  const rely_on =
    `Based on ${kinds.length} agreeing source${kinds.length > 1 ? "s" : ""} (${kinds.join(", ")})` +
    (standardDoc.doc.effective_from ? `, led by a document effective since ${standardDoc.doc.effective_from}` : "") +
    (losers ? `. ${losers} conflicting source${losers > 1 ? "s were" : " was"} outranked as older or less authoritative.` : ".");

  return { text, citations: Array.from(new Set(citations)), rely_on };
}

export function pickExpert(results: ScoredResult[]): Expert | undefined {
  const top = results.find((r) => !r.flags.includes("out_of_scope") && !r.flags.includes("superseded"));
  if (!top || !top.doc.owner.active) return undefined;
  const owns = top.doc.source_type === "policy" ? "owns this policy" : `owns "${top.doc.title}"`;
  return { name: top.doc.owner.name, role: top.doc.owner.role, reason: owns };
}
