import type { DocumentRecord } from "@/lib/types";

/** A change reported by a source system since the last sync. */
export type SourceChange = { externalId: string; kind: "upsert" | "delete"; raw: unknown };

/**
 * Every source system (SharePoint, Teams, Outlook, ServiceNow, Salesforce, …) is wrapped in a connector
 * that pulls incremental changes and normalises them into the shared DocumentRecord shape.
 */
export interface SourceConnector {
  readonly name: string;
  /** Pull changes since the given cursor (delta token / timestamp). */
  fetchChanges(cursor?: string): Promise<{ changes: SourceChange[]; nextCursor: string }>;
  /** Normalise one raw item into a DocumentRecord (claims, scope and owner extracted). */
  toRecord(change: SourceChange): Promise<DocumentRecord | null>;
}
