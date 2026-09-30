/**
 * Salesforce client agreements via the REST API: SOQL on Contract / custom objects filtered by LastModifiedDate > cursor. Provides client-specific exceptions (scope.client).
 * NOT IMPLEMENTED in the prototype — the demo uses fixtures/corpus.json instead.
 */
import type { SourceConnector } from "./types";

export const salesforceConnector: SourceConnector = {
  name: "salesforce",
  async fetchChanges() {
    throw new Error("salesforce connector not implemented");
  },
  async toRecord() {
    throw new Error("salesforce connector not implemented");
  },
};
