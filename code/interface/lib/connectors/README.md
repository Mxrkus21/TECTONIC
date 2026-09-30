# Connectors (stubs)

The prototype runs on `fixtures/corpus.json`. In production each source system gets a connector that
implements `SourceConnector` (`types.ts`): pull incremental changes, normalise them into `DocumentRecord`
(title, claims, scope, owner, authority), and feed the search index that `lib/search` queries.

| File | Source | Real API |
| --- | --- | --- |
| `graph-sharepoint.ts` | Policies, manuals, checklists | Microsoft Graph drive delta |
| `graph-teams.ts` | Teams channel messages | Microsoft Graph channel messages delta |
| `graph-outlook.ts` | Shared mailboxes | Microsoft Graph mail delta |
| `servicenow.ts` | Workflow rules, KB articles | ServiceNow Table API |
| `salesforce.ts` | Client contracts / exceptions | Salesforce REST (SOQL) |

The scorer never needs to change when a connector is added: it only sees `DocumentRecord`s.
