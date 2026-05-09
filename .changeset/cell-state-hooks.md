---
"@pilotiq/pilotiq": minor
---

Add `Column.beforeStateUpdated()` / `afterStateUpdated()` — async lifecycle hooks for editable cell columns (`TextInputColumn / ToggleColumn / SelectColumn`). `beforeStateUpdated((value, { record, user }) => …)` runs after validators pass and before the DB write — use for cross-cell invariants, audit-log writes that must precede the update, or async availability checks. `afterStateUpdated` mirrors the shape but fires only on a confirmed save — use for notifications, broadcasts, or follow-up writes. Throwing from either halts the PATCH with 422 and the message stamped under the reserved `_cell` error key in the response. Live on `Column` base (gated by `isEditable()`) so all editable subclasses inherit; serialization unchanged.
