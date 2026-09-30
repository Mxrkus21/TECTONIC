/**
 * Teams channel messages via Microsoft Graph: GET /teams/{team-id}/channels/{channel-id}/messages/delta. Reactions count as endorsements; authority is low (informal).
 * NOT IMPLEMENTED in the prototype — the demo uses fixtures/corpus.json instead.
 */
import type { SourceConnector } from "./types";

export const teamsConnector: SourceConnector = {
  name: "graph-teams",
  async fetchChanges() {
    throw new Error("graph-teams connector not implemented");
  },
  async toRecord() {
    throw new Error("graph-teams connector not implemented");
  },
};
