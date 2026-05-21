---
'@pilotiq/tiptap': patch
'@pilotiq/codemirror': patch
---

fix(adapters): adapter polish — TiptapEditor.setEditable sync, MarkdownEditor upload errors, CodeMirror useMemo + yCollab cast cleanup

Bundle of three small adapter-side correctness / hygiene fixes from the 2026-05-21 code-quality sweep (Phase 6 a/b/c). Phase 6d (consume `@rudderjs/sync/react` collab hooks) is deferred to its own focused session since it needs playground + dual-browser smoke; Phase 6e (React-mount test coverage) is its own pass — neither ships here.

- **6a — `TiptapEditor.setEditable` runtime sync.** `useEditor({ editable: !disabled, … })` only fires at construction. A parent flipping `disabled` after mount (validation failure mid-edit, form submitting state) would silently no-op. Sibling adapters `MarkdownEditor.tsx:256-259` and `CollabTextRenderer.tsx:127-130` already wire the matching effect; this aligns `TiptapEditor.tsx` with them.
- **6b — `MarkdownEditor.uploadAndInsert` surfaces server errors.** `if (!res.ok || !data.ok || !data.url) return` silently stopped the spinner with no toast and no console — users see the upload button revert with no signal that anything went wrong. Now wired through `useToast()` from `@pilotiq/pilotiq/react` (same surface `<Toolbar>`'s media-dialog already uses): network-fail and server-fail both emit an `error`-type toast with the server's `data.error` (or `"Upload failed (status N)."` fallback). Falls back to a no-op when no `ToasterProvider` is mounted — `useToast` returns a default context.
- **6c — CodeMirror `useMemo` + `as never` cleanup.** Two adjacent fixes in the codemirror adapter:
  - `CodeMirrorEditor.tsx:131` — the `const initial = useMemo(() => stringValue(defaultValue), [])` indirection was dressing — `useState<string>(initial)`'s initializer only runs once on mount regardless. Inlined as `useState<string>(() => stringValue(defaultValue))` with a comment naming the uncontrolled-fallback semantic + how `key`-based remount is the documented pattern for resetting a starting value across record swaps (the controlled path via `Form.stateUrl` doesn't need it).
  - `CollabCodeMirrorEditor.tsx:125` — `yCollab(yText, awareness, { undoManager: false } as never)` dropped the `as never` cast. Verified against `y-codemirror.next@^0.5`'s `index.d.ts`: the option key is `undoManager` (typed `Y.UndoManager | false`), not the suspected `yUndoManager` — the cast was bypassing typecheck for nothing.

Tests: 183 / 183 green in `@pilotiq/tiptap`; 22 / 22 green in `@pilotiq/codemirror`; monorepo `pnpm typecheck` clean (9 / 9 packages).
