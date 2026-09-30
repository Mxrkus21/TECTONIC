const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/**
 * Explicit time scope in the question: "December 2025" → 2025-12-15, "in 2027" → 2027-07-01.
 * A bare month ("December") is NOT a time scope — it is usually part of the topic.
 */
export function detectTimeScope(question: string): string | undefined {
  const q = question.toLowerCase();
  const monthYear = q.match(new RegExp(String.raw`\b(${MONTHS.join("|")})\s+(20\d{2})\b`));
  if (monthYear) {
    const mm = String(MONTHS.indexOf(monthYear[1]) + 1).padStart(2, "0");
    return `${monthYear[2]}-${mm}-15`;
  }
  const year = q.match(/\b(20\d{2})\b/);
  return year ? `${year[1]}-07-01` : undefined;
}
