"use client";
import { Fragment, useEffect, useRef, useState } from "react";
import { Loader2, Mic, Plus, Search, Send, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/client/cn";
import { messageText, type Clarify, type PinpointSession } from "@/lib/client/use-pinpoint";
import type { SearchBrief } from "@/lib/types";

export const DEMO_QUESTION = "What is the deadline for submitting December payroll changes?";

const COUNTRY_OPTIONS = [
  { label: "BE", value: "BE" },
  { label: "NL", value: "NL" },
  { label: "Other", value: "OTHER" },
];
const CLIENT_OPTIONS = [
  { label: "Acme", value: "Acme" },
  { label: "Beta NV", value: "Beta NV" },
  { label: "None", value: "" },
];

/** Renders **bold** segments without injecting HTML. */
function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, li) => (
        <Fragment key={li}>
          {li > 0 && <br />}
          {line.split(/(\*\*[^*]+\*\*)/g).map((seg, i) =>
            seg.startsWith("**") && seg.endsWith("**") ? <strong key={i}>{seg.slice(2, -2)}</strong> : <Fragment key={i}>{seg}</Fragment>,
          )}
        </Fragment>
      ))}
    </>
  );
}

function Bubble({ role, children }: { role: "user" | "assistant"; children: React.ReactNode }) {
  return (
    <div className={cn("flex", role === "user" ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[88%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
          role === "user" ? "rounded-br-sm bg-primary text-white" : "rounded-bl-sm border border-border bg-card text-ink",
        )}
      >
        {children}
      </div>
    </div>
  );
}

function ChipGroup({
  label,
  options,
  value,
  onChange,
  disabled,
}: {
  label: string;
  options: { label: string; value: string }[];
  value: string | undefined;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-14 text-xs font-medium text-muted">{label}</span>
      {options.map((o) => (
        <Button
          key={o.label}
          size="sm"
          variant={value === o.value ? "chipActive" : "chip"}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
        >
          {o.label}
        </Button>
      ))}
    </div>
  );
}

export function ClarifyChips({ s }: { s: PinpointSession }) {
  const [draft, setDraft] = useState<{ country?: string; client?: string }>({});
  const ready = draft.country !== undefined && draft.client !== undefined;
  const toClarify = (d: typeof draft): Clarify => ({
    country: d.country && d.country !== "OTHER" ? d.country : undefined,
    client: d.client || undefined,
  });

  return (
    <div className="ml-1 space-y-2 rounded-lg border border-primary/20 bg-primary-soft/50 p-3">
      <ChipGroup label="Country" options={COUNTRY_OPTIONS} value={draft.country} onChange={(v) => setDraft((d) => ({ ...d, country: v }))} />
      <ChipGroup label="Client" options={CLIENT_OPTIONS} value={draft.client} onChange={(v) => setDraft((d) => ({ ...d, client: v }))} />
      <div className="flex justify-end">
        <Button
          size="sm"
          disabled={!ready}
          onClick={() => {
            const c = toClarify(draft);
            s.setClarify(c);
            void s.buildBrief(c);
          }}
        >
          <Sparkles className="h-3.5 w-3.5" /> Build search brief
        </Button>
      </div>
    </div>
  );
}

function EditableChip({ label, value, onCommit, placeholder }: { label: string; value: string; onCommit: (v: string) => void; placeholder?: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    setEditing(false);
    if (draft.trim() !== value) onCommit(draft.trim());
  };
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-border bg-card py-0.5 pl-2.5 pr-1 text-xs">
      <span className="text-muted">{label}</span>
      {editing ? (
        <input
          autoFocus
          className="w-28 rounded bg-primary-soft px-1 py-0.5 font-semibold text-ink outline-none"
          value={draft}
          maxLength={80}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setDraft(value);
              setEditing(false);
            }
          }}
        />
      ) : (
        <button className="rounded px-1 py-0.5 font-semibold text-ink hover:bg-primary-soft" onClick={() => setEditing(true)} title="Click to edit">
          {value || <span className="font-normal italic text-muted">{placeholder ?? "any"}</span>}
        </button>
      )}
    </div>
  );
}

function ChipSelect({ label, value, options, onChange }: { label: string; value: string; options: { label: string; value: string }[]; onChange: (v: string) => void }) {
  return (
    <label className="inline-flex items-center gap-1 rounded-full border border-border bg-card py-0.5 pl-2.5 pr-1.5 text-xs">
      <span className="text-muted">{label}</span>
      <select className="cursor-pointer bg-transparent py-0.5 font-semibold text-ink outline-none" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.label} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function BriefCard({ s, compact }: { s: PinpointSession; compact?: boolean }) {
  const b = s.brief;
  const [newTag, setNewTag] = useState("");
  if (s.briefLoading && !b) {
    return (
      <Card className="space-y-2 p-3.5">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-4 w-full" />
        <div className="flex gap-1.5">
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-6 w-14" />
        </div>
      </Card>
    );
  }
  if (!b) return null;
  const update = (patch: Partial<SearchBrief>) => s.updateBrief({ ...b, ...patch });
  const setScope = (patch: Partial<SearchBrief["scope"]>) => {
    const scope = { ...b.scope, ...patch };
    (Object.keys(scope) as (keyof typeof scope)[]).forEach((k) => !scope[k] && delete scope[k]);
    update({ scope });
  };

  return (
    <Card className="border-primary/30 p-3.5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
          <Search className="h-3.5 w-3.5" aria-hidden /> Search brief
        </div>
        {!compact && <span className="text-[11px] text-muted">Edit any chip — results re-rank live</span>}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <div className="w-full">
          <EditableChip label="Question" value={b.question} onCommit={(v) => v && update({ question: v })} />
        </div>
        <ChipSelect
          label="Country"
          value={b.scope.country ?? ""}
          options={[{ label: "any", value: "" }, ...COUNTRY_OPTIONS.filter((o) => o.value !== "OTHER")]}
          onChange={(v) => setScope({ country: v || undefined })}
        />
        <ChipSelect
          label="Client"
          value={b.scope.client ?? ""}
          options={CLIENT_OPTIONS.map((o) => ({ label: o.value ? o.label : "none", value: o.value }))}
          onChange={(v) => setScope({ client: v || undefined })}
        />
        <label className="inline-flex items-center gap-1 rounded-full border border-border bg-card py-0.5 pl-2.5 pr-1.5 text-xs">
          <span className="text-muted">Date</span>
          <input
            type="date"
            className="bg-transparent py-0.5 font-semibold text-ink outline-none"
            value={b.reference_date}
            onChange={(e) => /^\d{4}-\d{2}-\d{2}$/.test(e.target.value) && update({ reference_date: e.target.value })}
          />
        </label>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {b.topic_tags.map((t) => (
          <span key={t} className="inline-flex items-center gap-0.5 rounded-full bg-primary-soft py-0.5 pl-2 pr-1 text-[11px] font-medium text-primary">
            {t}
            <button aria-label={`Remove tag ${t}`} className="rounded-full p-0.5 hover:bg-primary/10" onClick={() => update({ topic_tags: b.topic_tags.filter((x) => x !== t) })}>
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const t = newTag.trim().toLowerCase();
            if (t && !b.topic_tags.includes(t) && b.topic_tags.length < 20) update({ topic_tags: [...b.topic_tags, t] });
            setNewTag("");
          }}
          className="inline-flex items-center"
        >
          <input
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            maxLength={40}
            placeholder="+ tag"
            className="w-16 rounded-full border border-dashed border-border bg-transparent px-2 py-0.5 text-[11px] outline-none focus:border-primary"
          />
        </form>
      </div>
      <div className="mt-3 flex justify-end">
        <Button size="sm" onClick={() => s.runSearch(b)} disabled={s.searchLoading}>
          {s.searchLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
          Search
        </Button>
      </div>
    </Card>
  );
}

export function ChatInput({ s, compact }: { s: PinpointSession; compact?: boolean }) {
  const [text, setText] = useState("");
  const busy = s.chatStatus === "submitted" || s.chatStatus === "streaming";
  const locked = s.phase !== "ask";
  const submit = () => {
    if (!text.trim() || busy || locked) return;
    s.ask(text);
    setText("");
  };
  return (
    <div className="space-y-2">
      {s.phase === "ask" && (
        <button
          onClick={() => setText(DEMO_QUESTION)}
          className="w-full truncate rounded-md border border-dashed border-border px-2.5 py-1.5 text-left text-xs text-muted hover:border-primary/40 hover:text-primary"
        >
          Try: “{DEMO_QUESTION}”
        </button>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex items-center gap-1.5 rounded-lg border border-border bg-card p-1.5 focus-within:border-primary/50"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
          disabled={locked}
          placeholder={locked ? "Start a new search to ask something else" : compact ? "What are you looking for?" : "Describe what you're looking for…"}
          className="min-w-0 flex-1 bg-transparent px-2 text-sm outline-none placeholder:text-muted disabled:cursor-not-allowed"
          aria-label="Your question"
        />
        <Tooltip content="Voice (coming soon)">
          <span>
            <Button type="button" variant="ghost" size="icon" disabled aria-label="Voice input (coming soon)">
              <Mic className="h-4 w-4" />
            </Button>
          </span>
        </Tooltip>
        {locked ? (
          <Button type="button" size="icon" variant="secondary" onClick={s.reset} aria-label="New search">
            <Plus className="h-4 w-4" />
          </Button>
        ) : (
          <Button type="submit" size="icon" disabled={!text.trim() || busy} aria-label="Send">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        )}
      </form>
    </div>
  );
}

export function ChatThread({ s, compact }: { s: PinpointSession; compact?: boolean }) {
  const bottom = useRef<HTMLDivElement>(null);
  const streaming = s.chatStatus === "submitted" || s.chatStatus === "streaming";
  useEffect(() => {
    if (!compact) bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [s.messages, s.brief, s.clarifyDone, compact]);

  const scope = s.brief?.scope ?? s.clarify;
  const scopeSummary = [scope.country ? `Country: ${scope.country}` : "Country: any", scope.client ? `Client: ${scope.client}` : "Client: none"].join(" · ");

  return (
    <div className="space-y-3">
      {s.messages.map((m) => (
        <Bubble key={m.id} role={m.role === "user" ? "user" : "assistant"}>
          <RichText text={messageText(m)} />
        </Bubble>
      ))}
      {s.chatStatus === "submitted" && (
        <Bubble role="assistant">
          <span className="inline-flex items-center gap-1.5 text-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…
          </span>
        </Bubble>
      )}
      {s.chatError && <div className="rounded-md bg-conflict-soft p-2 text-xs text-conflict">The assistant is unavailable right now. Please try again.</div>}
      {s.phase === "clarify" && s.hasAssistantReply && !streaming && <ClarifyChips s={s} />}
      {s.clarifyDone && s.messages.length > 1 && <Bubble role="user">{scopeSummary}</Bubble>}
      {s.clarifyDone && <BriefCard s={s} compact={compact} />}
      {s.error && <div className="rounded-md bg-conflict-soft p-2 text-xs text-conflict">{s.error}</div>}
      <div ref={bottom} />
    </div>
  );
}
