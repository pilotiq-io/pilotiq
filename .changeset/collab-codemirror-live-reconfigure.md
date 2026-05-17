---
'@pilotiq/codemirror': patch
---

`CollabCodeMirrorEditor` — three internal simplifications, no API change:

- **Live Compartment reconfigure** for `theme` / `height` / `lineNumbers` / `lineWrapping` / `indentWithTabs` / `indentSize`. Only `fragmentKey` and `language` still force an EditorView remount; toggling dark mode or wrapping inside a dense Repeater now preserves cursor, scroll, and undo history.
- **Module-level singleton** for the auto-dark theme listener via `useSyncExternalStore` — one `MutationObserver` + one `matchMedia` listener per page, regardless of editor count (was one pair per editor instance).
- **No-op short-circuit** on `updateListener`: `update.docChanged` can fire with an identical `doc.toString()` (IME composition, cursor-only edits); track `lastTextRef` and skip the FormData mirror when unchanged.
