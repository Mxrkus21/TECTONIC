"use client";
/**
 * Client-side session state shared by the full view ("/") and the compact panel ("/panel").
 * The UI only talks to the three API routes; it knows nothing about search internals.
 */
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEMO_TODAY } from "@/lib/config";
import { documentRecordSchema } from "@/lib/schemas";
import type { DocumentRecord, SearchBrief, SearchResponse } from "@/lib/types";
import { useStoredState } from "./storage";

export type Clarify = { country?: string; client?: string };

export type HistoryEntry = {
  id: string;
  title: string;
  createdAt: string;
  messages: UIMessage[];
  clarify: Clarify;
  clarifyDone: boolean;
  brief: SearchBrief | null;
  response: SearchResponse | null;
};

export type Feedback = Record<string, "up" | "down">;

const MAX_HISTORY = 20;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Drop history entries that do not have the shape the UI relies on. */
function sanitizeHistory(raw: unknown): HistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (e): e is HistoryEntry =>
        isObj(e) &&
        typeof e.id === "string" &&
        typeof e.title === "string" &&
        typeof e.createdAt === "string" &&
        Array.isArray(e.messages) &&
        e.messages.every((m) => isObj(m) && typeof m.id === "string" && Array.isArray(m.parts)) &&
        isObj(e.clarify) &&
        (e.brief === null || (isObj(e.brief) && typeof e.brief.question === "string" && Array.isArray(e.brief.topic_tags) && isObj(e.brief.scope))) &&
        (e.response === null || (isObj(e.response) && Array.isArray(e.response.results) && Array.isArray(e.response.conflicts) && isObj(e.response.answer))),
    )
    .slice(0, MAX_HISTORY);
}

function sanitizePins(raw: unknown): DocumentRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((d): d is DocumentRecord => documentRecordSchema.safeParse(d).success);
}

function sanitizeFeedback(raw: unknown): Feedback {
  if (!isObj(raw)) return {};
  return Object.fromEntries(Object.entries(raw).filter(([k, v]) => k.length <= 100 && (v === "up" || v === "down"))) as Feedback;
}

export function messageText(m: UIMessage): string {
  return m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
}

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now());
}

export function usePinpoint() {
  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/chat" }), []);
  const chat = useChat({ transport });
  const { messages, setMessages, sendMessage, stop } = chat;

  const [sessionId, setSessionId] = useState(newId);
  const [clarify, setClarify] = useState<Clarify>({});
  const [clarifyDone, setClarifyDone] = useState(false);
  const [brief, setBrief] = useState<SearchBrief | null>(null);
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [history, setHistory] = useStoredState<HistoryEntry[]>("pp-history", [], sanitizeHistory);
  const [pins, setPins] = useStoredState<DocumentRecord[]>("pp-pins", [], sanitizePins);
  const [feedback, setFeedback] = useStoredState<Feedback>("pp-feedback", {}, sanitizeFeedback);

  const searchSeq = useRef(0);

  const runSearch = useCallback(async (b: SearchBrief) => {
    const seq = ++searchSeq.current;
    setSearchLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Search failed");
      const data = (await res.json()) as SearchResponse;
      if (seq === searchSeq.current) setResponse(data);
    } catch (e) {
      if (seq === searchSeq.current) setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      if (seq === searchSeq.current) setSearchLoading(false);
    }
  }, []);

  const ask = useCallback(
    (text: string) => {
      const t = text.trim();
      if (!t) return;
      void sendMessage({ text: t });
    },
    [sendMessage],
  );

  const buildBrief = useCallback(
    async (c: Clarify) => {
      setClarifyDone(true);
      setBriefLoading(true);
      setError(null);
      try {
        const transcript = messages
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({ role: m.role as "user" | "assistant", text: messageText(m).slice(0, 4000) }))
          .filter((m) => m.text);
        const res = await fetch("/api/brief", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: transcript, clarify: c, reference_date: DEMO_TODAY }),
        });
        if (!res.ok) throw new Error("Could not build the search brief");
        const b = (await res.json()) as SearchBrief;
        setBrief(b);
        await runSearch(b);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not build the search brief");
      } finally {
        setBriefLoading(false);
      }
    },
    [messages, runSearch],
  );

  /** Edit the brief; re-ranks live. */
  const updateBrief = useCallback(
    (next: SearchBrief) => {
      setBrief(next);
      void runSearch(next);
    },
    [runSearch],
  );

  /** Start directly from a brief (e.g. "Open full view" from the panel). */
  const loadBrief = useCallback(
    (b: SearchBrief) => {
      setMessages([{ id: newId(), role: "user", parts: [{ type: "text", text: b.question }] }]);
      setClarify({ country: b.scope.country, client: b.scope.client });
      setClarifyDone(true);
      setBrief(b);
      void runSearch(b);
    },
    [setMessages, runSearch],
  );

  const reset = useCallback(() => {
    searchSeq.current++;
    void stop();
    setMessages([]);
    setSessionId(newId());
    setClarify({});
    setClarifyDone(false);
    setBrief(null);
    setResponse(null);
    setError(null);
    setSearchLoading(false);
    setBriefLoading(false);
  }, [stop, setMessages]);

  const restore = useCallback(
    (entry: HistoryEntry) => {
      searchSeq.current++;
      void stop();
      setMessages(entry.messages);
      setSessionId(entry.id);
      setClarify(entry.clarify);
      setClarifyDone(entry.clarifyDone);
      setBrief(entry.brief);
      setResponse(entry.response);
      setError(null);
      setSearchLoading(false);
    },
    [stop, setMessages],
  );

  // Persist the current session into history whenever it produces results.
  useEffect(() => {
    if (!response || !messages.length) return;
    const first = messages.find((m) => m.role === "user");
    const entry: HistoryEntry = {
      id: sessionId,
      title: (first ? messageText(first) : response.brief.question).slice(0, 80),
      createdAt: new Date().toISOString(),
      messages,
      clarify,
      clarifyDone,
      brief,
      response,
    };
    setHistory((h) => [entry, ...h.filter((e) => e.id !== sessionId)].slice(0, MAX_HISTORY));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response]);

  const togglePin = useCallback(
    (doc: DocumentRecord) => setPins((p) => (p.some((d) => d.id === doc.id) ? p.filter((d) => d.id !== doc.id) : [doc, ...p])),
    [setPins],
  );

  const rate = useCallback(
    (docId: string, v: "up" | "down") =>
      setFeedback((f) => {
        const next = { ...f };
        if (next[docId] === v) delete next[docId];
        else next[docId] = v;
        return next;
      }),
    [setFeedback],
  );

  const removeHistory = useCallback((id: string) => setHistory((h) => h.filter((e) => e.id !== id)), [setHistory]);

  const phase: "ask" | "clarify" | "brief" = !messages.length ? "ask" : !clarifyDone ? "clarify" : "brief";

  return {
    sessionId,
    messages,
    chatStatus: chat.status,
    chatError: chat.error,
    phase,
    hasAssistantReply: messages.some((m) => m.role === "assistant"),
    clarify,
    setClarify,
    clarifyDone,
    brief,
    response,
    briefLoading,
    searchLoading,
    error,
    ask,
    buildBrief,
    updateBrief,
    loadBrief,
    runSearch,
    reset,
    restore,
    history,
    removeHistory,
    pins,
    togglePin,
    feedback,
    rate,
  };
}

export type PinpointSession = ReturnType<typeof usePinpoint>;
