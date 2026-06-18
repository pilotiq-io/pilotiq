---
"@pilotiq/media": minor
---

Media browser: list view + per-item context menu (#231, part 1)

Richer interactions for the library browser (first of a few slices):

- **List view** — a grid ⇄ list toggle in the header, with a Name / Type / Size / Modified table. The preference persists across sessions (`localStorage`), applied in a mount effect so it doesn't trip an SSR hydration mismatch.
- **Context menu** — right-click any item (grid tile or list row) for **Rename**, **Move…**, **Download** (files), and **Delete**. Rename and Move are backed by the existing `_media/:id/rename` + `:id/move` routes; Move opens a folder picker you can navigate to choose the destination.

No new routes or server changes — purely the browser UI. Multi-select + bulk actions and richer drag-and-drop (directory / URL drops, drag-to-folder) follow in later slices of #231.
