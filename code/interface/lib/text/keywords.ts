const STOPWORDS = new Set(
  "a an and are as at be by can do does for from how i in is it me my of on or our please should the this to we what when where which who why will with you your".split(
    " ",
  ),
);

/** Lowercase keyword extraction with a tiny plural-stripping stemmer. Deterministic on purpose. */
export function keywords(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9à-ÿ\- ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w))
    .map(stem);
  return Array.from(new Set(words));
}

export function stem(word: string): string {
  if (word.length > 4 && word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}
