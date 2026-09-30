/**
 * Outlook mail via Microsoft Graph: GET /users/{id}/mailFolders/{folder}/messages/delta, limited to shared knowledge mailboxes. Client scope from subject / sender domain.
 * NOT IMPLEMENTED in the prototype — the demo uses fixtures/corpus.json instead.
 */
import type { SourceConnector } from "./types";

export const outlookConnector: SourceConnector = {
  name: "graph-outlook",
  async fetchChanges() {
    throw new Error("graph-outlook connector not implemented");
  },
  async toRecord() {
    throw new Error("graph-outlook connector not implemented");
  },
};
