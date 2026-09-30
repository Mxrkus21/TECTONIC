/**
 * SharePoint policies & manuals via Microsoft Graph: GET /sites/{site-id}/drive/root/delta (delta query), then /items/{id}/content for text. Owner from createdBy/lastModifiedBy; authority from the library (e.g. Knowledge Centre = 1.0).
 * NOT IMPLEMENTED in the prototype — the demo uses fixtures/corpus.json instead.
 */
import type { SourceConnector } from "./types";

export const sharepointConnector: SourceConnector = {
  name: "graph-sharepoint",
  async fetchChanges() {
    throw new Error("graph-sharepoint connector not implemented");
  },
  async toRecord() {
    throw new Error("graph-sharepoint connector not implemented");
  },
};
