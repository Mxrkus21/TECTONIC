"use client";
import { SearchX } from "lucide-react";
import type { PinpointSession } from "@/lib/client/use-pinpoint";
import { AnswerCard, ConflictBanner, ExpertCard, ResultCard, ResultsSkeleton } from "./results";

export function ResultsView({ s, compact, limit }: { s: PinpointSession; compact?: boolean; limit?: number }) {
  const r = s.response;
  if (!r) {
    if (s.searchLoading || s.briefLoading) return <ResultsSkeleton count={compact ? 2 : 4} />;
    return (
      <div className="flex h-full min-h-48 flex-col items-center justify-center rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted">
        <SearchX className="mb-2 h-6 w-6" aria-hidden />
        <div className="font-medium text-ink">No results yet</div>
        <div className="max-w-xs">Ask a question and answer the clarifying questions. Ranked, explained sources appear here.</div>
      </div>
    );
  }
  const results = limit ? r.results.slice(0, limit) : r.results;
  const pinned = new Set(s.pins.map((d) => d.id));
  const conflictIds = new Set(r.conflicts.flatMap((c) => [c.winner_id, ...c.loser_ids]));

  const banner = <ConflictBanner conflicts={r.conflicts} results={r.results} />;
  return (
    <div className={s.searchLoading ? "space-y-3 opacity-60 transition-opacity" : "space-y-3 transition-opacity"}>
      {!compact && banner}
      <AnswerCard response={r} compact={compact} />
      <div className="flex items-baseline justify-between pt-1">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
          {compact ? `Top ${results.length} of ${r.results.length} sources` : `${r.results.length} sources ranked by fit`}
        </h2>
      </div>
      {results.map((res, i) => (
        <ResultCard
          key={res.doc.id}
          r={res}
          rank={i + 1}
          compact={compact}
          pinned={pinned.has(res.doc.id)}
          onPin={s.togglePin}
          feedback={s.feedback}
          onRate={compact ? undefined : s.rate}
          highlight={!compact && conflictIds.has(res.doc.id) && i === 0}
        />
      ))}
      {compact && banner}
      {r.expert && <ExpertCard expert={r.expert} />}
    </div>
  );
}
