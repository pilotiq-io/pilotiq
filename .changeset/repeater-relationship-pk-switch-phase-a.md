---
'@pilotiq/pilotiq': patch
---

`Repeater.relationship` / `Builder.relationship` PK-switch reconciliation (Phase A). After a parent form submit creates new relationship-backed rows, the submitting tab now drops the orphan UUID rows the row CRDT carried forward — they were causing duplicate-row visual bugs on reload. New optional method `FormCollabBinding.getRowOrder?(arrayName)` + `RowBindingApi.current()`; the renderer uses a one-shot reconciler on next mount after submit success. Other peers still need to reload to converge — Phase B (server-side rename) addresses that. Plan: `pilotiq-pro/docs/plans/repeater-relationship-pk-switch.md`.
