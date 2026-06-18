---
"@pilotiq/media": minor
---

Media browser: richer interactions — list view, context menu, multi-select, richer drag-and-drop (#231)

Rounds out the library browser (`@pilotiq/media`):

- **List view** — a grid ⇄ list toggle in the header with a Name / Type / Size / Modified table. The preference persists across sessions (`localStorage`), applied in a mount effect so it doesn't trip an SSR hydration mismatch.
- **Context menu** — right-click any item (grid tile or list row) for **Rename**, **Move…** (folder picker), **Download** (files), and **Delete**, backed by the existing `_media/:id/rename` + `:id/move` routes.
- **Multi-select** — checkbox affordance on tiles + rows, plus cmd/ctrl-click to toggle and shift-click to range-select; a bulk-action toolbar (Move / Delete / Clear) drives **bulk delete** and **bulk move**.
- **Richer drag-and-drop** — drop a **folder** (recurses the `webkitGetAsEntry` tree, recreating subfolders), drop a **URL** (fetched → uploaded), and **drag a tile/row onto a folder** to reparent it.

All client-side — no new routes. Cluster-prefixed mounts resolve the `_media` base from the server-passed `apiBase` (the URL-stripping `deriveApiBase` is a standalone-page fallback only).
