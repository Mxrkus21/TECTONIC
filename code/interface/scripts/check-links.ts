/*
 * Offline link check for the corpus. Run: npm run check:links
 * Finds URLs in each document's text, requests them (HEAD, then GET) and stores the result in `links`.
 * The scorer only reads the stored result — it never fetches URLs during a search.
 */
import { readFileSync, writeFileSync } from "fs";
import { extractLinks } from "@/lib/evaluate";
import { corpusSchema } from "@/lib/schemas";
import type { LinkCheck } from "@/lib/types";

const FILE = "fixtures/corpus.json";
const TIMEOUT_MS = 8000;

async function check(url: string): Promise<LinkCheck> {
  const checked_at = new Date().toISOString().slice(0, 10);
  if (!/^https?:\/\//i.test(url)) return { url, ok: false, status: 0, checked_at };
  for (const method of ["HEAD", "GET"]) {
    try {
      const res = await fetch(url, { method, redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (res.ok || method === "GET") return { url, ok: res.ok, status: res.status, checked_at };
    } catch {
      if (method === "GET") return { url, ok: false, status: 0, checked_at };
    }
  }
  return { url, ok: false, status: 0, checked_at };
}

async function main() {
  const corpus = corpusSchema.parse(JSON.parse(readFileSync(FILE, "utf8")));
  for (const doc of corpus) {
    const urls = extractLinks(doc);
    if (!urls.length) {
      delete doc.links;
      continue;
    }
    doc.links = await Promise.all(urls.map(check));
    for (const l of doc.links) console.log(`${l.ok ? "OK  " : "FAIL"} ${String(l.status).padStart(3)}  ${doc.id}  ${l.url}`);
  }
  writeFileSync(FILE, JSON.stringify(corpus, null, 2) + "\n");
}

main();
