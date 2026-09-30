"use client";
import { useEffect, useRef } from "react";
import { History, MessageSquarePlus, PanelRight, Trash2 } from "lucide-react";
import { Panel, PanelGroup, PanelResizeHandle, type ImperativePanelHandle } from "react-resizable-panels";
import { Header } from "@/components/pinpoint/header";
import { ChatInput, ChatThread } from "@/components/pinpoint/chat";
import { ResultsView } from "@/components/pinpoint/results-view";
import { SavedList } from "@/components/pinpoint/results";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/client/cn";
import { usePinpoint } from "@/lib/client/use-pinpoint";
import { searchBriefSchema } from "@/lib/schemas";

function Handle() {
  return <PanelResizeHandle className="w-px bg-border transition-colors hover:bg-primary/40 data-[resize-handle-state=drag]:bg-primary" />;
}

export default function Home() {
  const s = usePinpoint();
  const rightPanel = useRef<ImperativePanelHandle>(null);
  const hasResults = Boolean(s.response);
  const { loadBrief } = s;

  // "Open full view" from the panel passes the brief in the query string.
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("brief");
    if (!raw) return;
    try {
      const parsed = searchBriefSchema.safeParse(JSON.parse(raw));
      if (parsed.success) loadBrief(parsed.data);
    } catch {
      /* ignore malformed query */
    }
    window.history.replaceState(null, "", "/");
  }, [loadBrief]);

  // The results pane is the hero once there is something to show.
  useEffect(() => {
    const p = rightPanel.current;
    if (p && hasResults && p.getSize() < 60) p.resize(62);
  }, [hasResults]);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Header
        right={
          <a href="/panel" className="inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-primary">
            <PanelRight className="h-3.5 w-3.5" aria-hidden /> Compact panel view
          </a>
        }
      />
      <PanelGroup direction="horizontal" className="min-h-0 flex-1">
        <Panel defaultSize={16} minSize={12} maxSize={25} className="flex flex-col bg-card">
          <div className="p-3">
            <Button className="w-full" onClick={s.reset}>
              <MessageSquarePlus className="h-4 w-4" /> New search
            </Button>
          </div>
          <div className="flex items-center gap-1.5 px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
            <History className="h-3.5 w-3.5" aria-hidden /> History
          </div>
          <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
            {s.history.length === 0 && <div className="px-2 py-3 text-xs text-muted">Your past searches will appear here.</div>}
            {s.history.map((h) => (
              <div
                key={h.id}
                className={cn("group flex items-center rounded-md hover:bg-primary-soft", h.id === s.sessionId && "bg-primary-soft")}
              >
                <button onClick={() => s.restore(h)} className="min-w-0 flex-1 px-2 py-1.5 text-left">
                  <div className="truncate text-xs font-medium text-ink">{h.title}</div>
                  <div className="truncate text-[10px] text-muted">
                    {[h.brief?.scope.country, h.brief?.scope.client].filter(Boolean).join(" · ") || "—"} · {new Date(h.createdAt).toLocaleDateString()}
                  </div>
                </button>
                <button
                  onClick={() => s.removeHistory(h.id)}
                  className="mr-1 hidden rounded p-1 text-muted hover:text-conflict group-hover:block"
                  aria-label="Delete from history"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </nav>
        </Panel>
        <Handle />
        <Panel defaultSize={38} minSize={24} className="flex flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {s.phase === "ask" ? (
              <div className="mx-auto mt-10 max-w-sm text-center">
                <h1 className="text-lg font-semibold text-ink">What are you looking for?</h1>
                <p className="mt-1 text-sm text-muted">
                  Describe your question. I&apos;ll ask one round of clarifying questions, then find, rank and explain the sources you can trust.
                </p>
              </div>
            ) : (
              <ChatThread s={s} />
            )}
          </div>
          <div className="border-t border-border bg-surface p-3">
            <ChatInput s={s} />
          </div>
        </Panel>
        <Handle />
        <Panel ref={rightPanel} defaultSize={46} minSize={30} className="flex flex-col bg-surface">
          <Tabs defaultValue="results" className="flex min-h-0 flex-1 flex-col">
            <TabsList className="bg-card">
              <TabsTrigger value="results">Results{s.response ? ` (${s.response.results.length})` : ""}</TabsTrigger>
              <TabsTrigger value="saved">Saved{s.pins.length ? ` (${s.pins.length})` : ""}</TabsTrigger>
            </TabsList>
            <TabsContent value="results" className="min-h-0 flex-1 overflow-y-auto p-4">
              <ResultsView s={s} />
            </TabsContent>
            <TabsContent value="saved" className="min-h-0 flex-1 overflow-y-auto p-4">
              <SavedList pins={s.pins} onRemove={s.togglePin} />
            </TabsContent>
          </Tabs>
        </Panel>
      </PanelGroup>
    </div>
  );
}
