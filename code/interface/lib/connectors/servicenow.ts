/**
 * ServiceNow business rules & knowledge articles via the Table API: GET /api/now/table/sys_script and /api/now/table/kb_knowledge with sys_updated_on > cursor. Enforced rules get authority 1.0.
 * NOT IMPLEMENTED in the prototype — the demo uses fixtures/corpus.json instead.
 */
import type { SourceConnector } from "./types";

export const servicenowConnector: SourceConnector = {
  name: "servicenow",
  async fetchChanges() {
    throw new Error("servicenow connector not implemented");
  },
  async toRecord() {
    throw new Error("servicenow connector not implemented");
  },
};
