---
"@pilotiq/pilotiq": minor
---

Add `Repeater.expandAction()` / `Repeater.expandAllAction()` / `Repeater.collapseAllAction()` (and the same trio on `Builder`) so consumers can override the per-row chevron and the bulk expand/collapse buttons that sit above collapsible rows. `RowButtonKind` widens from 7 → 10 slots (`'expand' | 'expandAll' | 'collapseAll'`); `BulkCollapseHeader` chrome renders above rows when either bulk action is configured, and `CollapseChevron` falls through to a per-row `expand` override when present. Closes audit gap #7 (Filament parity).
