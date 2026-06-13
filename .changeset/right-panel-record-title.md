---
"@pilotiq/pilotiq": minor
---

Add `recordTitle` to `RightPanelProps`.

Right-panel panes (e.g. the AI chat sidebar) now receive `recordTitle` — the breadcrumb's resolved leaf label, which is the record title on a record edit/view page. Lets a pane label the active record by its human title instead of its id. Absent when the page has no breadcrumb. `AppShell` derives it from the breadcrumb it already receives and forwards it through `RightSidebar`; no page-data or layout-generation changes.
