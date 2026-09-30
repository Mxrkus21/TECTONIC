"use client";
import { useState } from "react";
import { ChevronDown, SearchX } from "lucide-react";
import { SCORING } from "@/lib/evaluate";
import { cn } from "@/lib/client/cn";
import type { PinpointSession } from "@/lib/client/use-pinpoint";
import { AnswerCard, ConflictBanner, ExpertCard, ResultCard, ResultsSkeleton } from "./results";

export function ResultsView({ s, compact, limit }: { s: PinpointSession; compact?: boolean; limit?: number }) {
  const [showHidden, setShowHidden] = useState(false);
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
  // Results saved in history before normalisation existed have no `shown` field: treat them as shown.
  const visible = r.results.filter((x) => x.shown !== false);
  const hidden = r.results.filter((x) => x.shown === false);
  const results = limit ? visible.slice(0, limit) : visible;
  const pct = Math.round(SCORING.display.threshold * 100);
  const pinned = new Set(s.pins.map((d) => d.id));
  const conflictIds = new Set(r.conflicts.flatMap((c) => [c.winner_id, ...c.loser_ids]));

  const banner = <ConflictBanner conflicts={r.conflicts} results={r.results} />;
  return (
    <div className={s.searchLoading ? "space-y-3 opacity-60 transition-opacity" : "space-y-3 transition-opacity"}>
      {!compact && banner}
      <AnswerCard response={r} compact={compact} />
      <div className="flex items-baseline justify-between pt-1">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
          {compact ? `Top ${results.length} of ${r.results.length} sources` : `${visible.length} of ${r.results.length} sources within ${pct}% of the best`}
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
      {!compact && hidden.length > 0 && (
        <>
          <button
            className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border py-2 text-xs font-medium text-muted hover:border-primary/40 hover:text-primary"
            onClick={() => setShowHidden((v) => !v)}
            aria-expanded={showHidden}
          >
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showHidden && "rotate-180")} aria-hidden />
            {showHidden ? "Hide" : "Show"} {hidden.length} more below {pct}% of the best
          </button>
          {showHidden &&
            hidden.map((res) => (
              <ResultCard
                key={res.doc.id}
                r={res}
                rank={r.results.indexOf(res) + 1}
                pinned={pinned.has(res.doc.id)}
                onPin={s.togglePin}
                feedback={s.feedback}
                onRate={s.rate}
              />
            ))}
        </>
      )}
      {compact && banner}
      {r.expert && <ExpertCard expert={r.expert} />}
    </div>
  );
}
