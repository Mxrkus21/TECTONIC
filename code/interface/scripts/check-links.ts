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

/** Only public http(s) hosts are checked — never localhost, private ranges or cloud metadata endpoints. */
function isPublicHttpUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  if (u.username || u.password) return false;
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return false;
  if (/^(0|10|127)\./.test(h) || /^169\.254\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false;
  if (h === "::1" || h === "0.0.0.0" || /^(fc|fd|fe80)/.test(h)) return false;
  return true;
}

async function check(url: string): Promise<LinkCheck> {
  const checked_at = new Date().toISOString().slice(0, 10);
  if (!isPublicHttpUrl(url)) return { url, ok: false, status: 0, checked_at };
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
