"use client";
import { useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  Check,
  ChevronDown,
  ClipboardList,
  Copy,
  FileText,
  GitBranch,
  Mail,
  MessagesSquare,
  Pin,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
  UserRound,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/client/cn";
import type { Feedback } from "@/lib/client/use-pinpoint";
import { formatClaim } from "@/lib/evaluate";
import type { Conflict, DocumentRecord, Expert, ResultFlag, ScoredResult, SearchResponse, SourceType } from "@/lib/types";

const SOURCE_META: Record<SourceType, { icon: typeof FileText; label: string }> = {
  policy: { icon: ShieldCheck, label: "Policy" },
  manual: { icon: BookOpen, label: "Manual" },
  checklist: { icon: ClipboardList, label: "Checklist" },
  email: { icon: Mail, label: "Email" },
  teams_chat: { icon: MessagesSquare, label: "Teams chat" },
  workflow: { icon: GitBranch, label: "Workflow" },
};

export function SourceIcon({ type, className }: { type: SourceType; className?: string }) {
  const { icon: Icon, label } = SOURCE_META[type];
  return (
    <span className={cn("inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary", className)} title={label}>
      <Icon className="h-4 w-4" aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}

const FLAG_META: Record<ResultFlag, { label: string; tone: "conflict" | "warning" | "neutral"; tip: string }> = {
  superseded: { label: "Superseded", tone: "warning", tip: "A newer version of this document exists." },
  conflict_loser: { label: "Conflicts", tone: "conflict", tip: "Contradicts a more trusted source." },
  out_of_scope: { label: "Out of scope", tone: "neutral", tip: "Applies to a different country or client." },
  owner_inactive: { label: "Owner inactive", tone: "warning", tip: "Nobody currently maintains this." },
  outdated: { label: "Outdated", tone: "warning", tip: "Old or expired content." },
};

function flagLabel(flag: ResultFlag, r: ScoredResult): string {
  if (flag === "out_of_scope") {
    if (r.reasons.some((x) => x.startsWith("Wrong country"))) return `Wrong country (${r.doc.scope.country})`;
    if (r.doc.scope.client) return `Only for ${r.doc.scope.client}`;
  }
  return FLAG_META[flag].label;
}

export function FlagBadges({ r }: { r: ScoredResult }) {
  if (!r.flags.length) {
    return (
      <Badge tone="trusted">
        <Check className="h-3 w-3" aria-hidden /> Trusted
      </Badge>
    );
  }
  return (
    <>
      {r.flags.map((f) => (
        <Tooltip key={f} content={FLAG_META[f].tip}>
          <span>
            <Badge tone={FLAG_META[f].tone}>{flagLabel(f, r)}</Badge>
          </span>
        </Tooltip>
      ))}
    </>
  );
}

function fitTone(fit: number) {
  if (fit >= 75) return "text-trusted";
  if (fit >= 50) return "text-warning";
  return "text-conflict";
}

const FACTORS: { key: keyof ScoredResult["factors"]; label: string; tip: string }[] = [
  { key: "relevance", label: "Relevance", tip: "How well the document matches your question (40%)" },
  { key: "recency", label: "Recency", tip: "How recently it was updated or took effect (20%)" },
  { key: "scope", label: "Scope", tip: "Does it apply to your country and client? (20%)" },
  { key: "authority", label: "Authority", tip: "Official policy > manual > email > chat (15%)" },
];

export function FactorBars({ r, compact }: { r: ScoredResult; compact?: boolean }) {
  return (
    <div className={cn("grid gap-x-4 gap-y-1.5", compact ? "grid-cols-2" : "grid-cols-2 lg:grid-cols-4")}>
      {FACTORS.map((f) => {
        const v = Math.round(r.factors[f.key] * 100);
        return (
          <Tooltip key={f.key} content={f.tip}>
            <div className="min-w-0">
              <div className="flex justify-between text-[11px] text-muted">
                <span>{f.label}</span>
                <span className="tabular-nums">{v}</span>
              </div>
              <Progress value={v} barClassName={v >= 70 ? "bg-trusted" : v >= 40 ? "bg-accent-yellow" : "bg-conflict"} />
            </div>
          </Tooltip>
        );
      })}
    </div>
  );
}

export function ResultCard({
  r,
  rank,
  compact,
  pinned,
  onPin,
  feedback,
  onRate,
  highlight,
}: {
  r: ScoredResult;
  rank: number;
  compact?: boolean;
  pinned?: boolean;
  onPin?: (doc: DocumentRecord) => void;
  feedback?: Feedback;
  onRate?: (id: string, v: "up" | "down") => void;
  highlight?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [showFactors, setShowFactors] = useState(!compact);
  const dimmed = r.flags.includes("superseded") || r.flags.includes("out_of_scope");
  const vote = feedback?.[r.doc.id];

  return (
    <Card id={`doc-${r.doc.id}`} className={cn("p-3.5 transition-shadow", dimmed && "opacity-75", highlight && "ring-2 ring-primary/40")}>
      <div className="flex items-start gap-3">
        <SourceIcon type={r.doc.source_type} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted">
                #{rank} · {SOURCE_META[r.doc.source_type].label} · {r.doc.owner.name}
              </div>
              <h3 className="text-sm font-semibold leading-snug text-ink">{r.doc.title}</h3>
            </div>
            <Tooltip content="Fit score: weighted relevance, recency, scope and authority, minus penalties">
              <div className="shrink-0 text-right">
                <div className={cn("text-2xl font-bold leading-none tabular-nums", fitTone(r.fit))}>{r.fit}%</div>
                <div className="text-[10px] uppercase tracking-wide text-muted">fit</div>
              </div>
            </Tooltip>
          </div>

          <div className="mt-1.5 flex flex-wrap gap-1">
            <FlagBadges r={r} />
          </div>

          {!compact && <p className="mt-2 border-l-2 border-border pl-2.5 text-[13px] italic text-muted">{r.doc.excerpt}</p>}

          <div className="mt-2.5">
            {compact && (
              <button className="mb-1 text-[11px] font-medium text-primary hover:underline" onClick={() => setShowFactors((v) => !v)}>
                {showFactors ? "Hide factors" : "Show factors"}
              </button>
            )}
            {showFactors && <FactorBars r={r} compact={compact} />}
          </div>

          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
            <button
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
            >
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} aria-hidden />
              Why this rank
            </button>
            {onPin && (
              <div className="flex items-center gap-1">
                {onRate && (
                  <>
                    <Button variant="ghost" size="sm" aria-label="Helpful" className={cn(vote === "up" && "text-trusted")} onClick={() => onRate(r.doc.id, "up")}>
                      <ThumbsUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" aria-label="Not helpful" className={cn(vote === "down" && "text-conflict")} onClick={() => onRate(r.doc.id, "down")}>
                      <ThumbsDown className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
                <Button variant={pinned ? "chipActive" : "secondary"} size="sm" onClick={() => onPin(r.doc)}>
                  <Pin className="h-3.5 w-3.5" aria-hidden /> {pinned ? "Pinned" : "Pin"}
                </Button>
              </div>
            )}
          </div>
          {open && (
            <ul className="mt-2 space-y-1 rounded-md bg-surface p-2.5 text-xs text-ink">
              {r.reasons.map((reason, i) => (
                <li key={i} className="flex gap-1.5">
                  <span className="text-muted">•</span>
                  <span>{reason}</span>
                </li>
              ))}
              <li className="pt-1 text-muted">
                Source: <span className="font-mono">{r.doc.url}</span>
              </li>
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}

export function ConflictBanner({ conflicts, results }: { conflicts: Conflict[]; results: ScoredResult[] }) {
  const [open, setOpen] = useState(false);
  if (!conflicts.length) return null;
  const byId = new Map(results.map((r) => [r.doc.id, r]));
  const c = conflicts[0];
  const winner = byId.get(c.winner_id);
  const losers = c.loser_ids.map((id) => byId.get(id)).filter(Boolean) as ScoredResult[];
  const claimOf = (r: ScoredResult) => {
    const cl = r.doc.claims.find((x) => x.key === c.claim_key);
    return cl ? formatClaim(c.claim_key, cl.value, cl.unit) : "?";
  };

  return (
    <div className="rounded-lg border border-conflict/30 bg-conflict-soft">
      <button className="flex w-full items-start gap-2.5 p-3 text-left" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-conflict" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-conflict">
            {losers.length + 1} sources disagree — {losers.length} outdated source{losers.length > 1 ? "s" : ""} say{losers.length > 1 ? "" : "s"} the {claimOf(losers[0])}
          </div>
          <div className="text-xs text-ink/80">{open ? "Hide comparison" : "Click to compare side by side and see why one wins"}</div>
        </div>
        <ChevronDown className={cn("h-4 w-4 text-conflict transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && winner && (
        <div className="border-t border-conflict/20 p-3">
          <div className="grid gap-2 sm:grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
            {[winner, ...losers].map((r, i) => (
              <div key={r.doc.id} className={cn("rounded-md border bg-card p-2.5", i === 0 ? "border-trusted/50" : "border-conflict/30")}>
                <div className="flex items-center justify-between">
                  <Badge tone={i === 0 ? "trusted" : "conflict"}>{i === 0 ? "Wins" : "Outranked"}</Badge>
                  <span className="text-xs tabular-nums text-muted">fit {r.fit}%</span>
                </div>
                <div className="mt-1.5 text-lg font-bold text-ink">{claimOf(r)}</div>
                <div className="text-xs font-semibold leading-snug">{r.doc.title}</div>
                <div className="mt-1 text-[11px] text-muted">
                  {SOURCE_META[r.doc.source_type].label} · {r.doc.last_modified} · {r.doc.owner.name}
                  {!r.doc.owner.active && " (inactive)"}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2.5 text-xs leading-relaxed text-ink">{c.explanation}</p>
        </div>
      )}
    </div>
  );
}

export function AnswerCard({ response, compact }: { response: SearchResponse; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const titles = new Map(response.results.map((r) => [r.doc.id, r.doc]));
  const cited = response.answer.citations.map((id) => titles.get(id)).filter(Boolean) as DocumentRecord[];

  const copy = async () => {
    const text = `${response.answer.text}\n\nSources:\n${cited.map((d, i) => `[${i + 1}] ${d.title} — ${d.url}`).join("\n")}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <Card className="border-primary/25 p-4">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-primary">Answer</div>
        <Button variant="secondary" size="sm" onClick={copy}>
          {copied ? <Check className="h-3.5 w-3.5 text-trusted" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : compact ? "Copy" : "Copy answer with sources"}
        </Button>
      </div>
      <p className={cn("font-medium leading-snug text-ink", compact ? "text-sm" : "text-[15px]")}>{response.answer.text}</p>
      {response.answer.rely_on && (
        <div className="mt-2.5 flex gap-2 rounded-md bg-trusted-soft p-2 text-xs text-trusted">
          <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            <strong>Why you can rely on this:</strong> {response.answer.rely_on}
          </span>
        </div>
      )}
      {cited.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {cited.map((d, i) => (
            <a
              key={d.id}
              href={`#doc-${d.id}`}
              className="inline-flex max-w-full items-center gap-1 truncate rounded border border-border bg-surface px-1.5 py-0.5 text-[11px] text-ink hover:border-primary/40"
            >
              <span className="font-semibold text-primary">[{i + 1}]</span>
              <span className="truncate">{d.title}</span>
            </a>
          ))}
        </div>
      )}
    </Card>
  );
}

export function ExpertCard({ expert }: { expert: Expert }) {
  return (
    <Card className="flex items-center gap-3 p-3.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-white">
        <UserRound className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1 text-sm">
        <div className="font-semibold text-ink">
          Still unsure? Ask {expert.name} — {expert.reason}
        </div>
        <div className="text-xs text-muted">{expert.role}</div>
      </div>
      <Tooltip content="Would open a Teams chat with the document owner">
        <span>
          <Button variant="secondary" size="sm" disabled>
            <MessagesSquare className="h-3.5 w-3.5" /> Ask
          </Button>
        </span>
      </Tooltip>
    </Card>
  );
}

export function ResultsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3" aria-busy>
      <Card className="space-y-2 p-4">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-5 w-11/12" />
        <Skeleton className="h-4 w-2/3" />
      </Card>
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="flex gap-3 p-3.5">
          <Skeleton className="h-8 w-8" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-2 w-full" />
          </div>
        </Card>
      ))}
    </div>
  );
}

export function SavedList({ pins, onRemove }: { pins: DocumentRecord[]; onRemove: (doc: DocumentRecord) => void }) {
  if (!pins.length) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted">
        <Pin className="mx-auto mb-2 h-5 w-5" aria-hidden />
        No saved documents yet. Pin a result to keep it here.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {pins.map((d) => (
        <Card key={d.id} className="flex items-start gap-3 p-3">
          <SourceIcon type={d.source_type} />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">{d.title}</div>
            <div className="text-xs text-muted">{d.summary}</div>
            <div className="mt-1 truncate font-mono text-[11px] text-muted">{d.url}</div>
          </div>
          <Button variant="ghost" size="sm" aria-label={`Remove ${d.title}`} onClick={() => onRemove(d)}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </Card>
      ))}
    </div>
  );
}
