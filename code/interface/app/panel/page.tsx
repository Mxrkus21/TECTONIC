"use client";
import { ExternalLink, RotateCcw } from "lucide-react";
import { Header } from "@/components/pinpoint/header";
import { ChatInput, ChatThread } from "@/components/pinpoint/chat";
import { ResultsView } from "@/components/pinpoint/results-view";
import { Button } from "@/components/ui/button";
import { usePinpoint } from "@/lib/client/use-pinpoint";

/** Compact single-column view (~360–420px) — what appears as a Teams / Outlook side panel. */
export default function PanelPage() {
  const s = usePinpoint();
  const fullViewHref = s.brief ? `/?brief=${encodeURIComponent(JSON.stringify(s.brief))}` : "/";

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[420px] flex-col border-x border-border bg-surface">
      <Header
        compact
        right={
          s.phase !== "ask" && (
            <Button variant="ghost" size="sm" onClick={s.reset} aria-label="New search">
              <RotateCcw className="h-3.5 w-3.5" /> New
            </Button>
          )
        }
      />
      <main className="flex-1 space-y-3 p-3">
        <ChatInput s={s} compact />
        {s.phase !== "ask" && <ChatThread s={s} compact />}
        {(s.response || s.searchLoading) && <ResultsView s={s} compact limit={3} />}
        {s.response && (
          <a
            href={fullViewHref}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 rounded-md border border-primary/30 bg-card py-2 text-sm font-medium text-primary hover:bg-primary-soft"
          >
            Open full view <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        )}
      </main>
    </div>
  );
}
