# @pilotiq/codemirror

## 3.2.7

### Patch Changes

- 1c6a067: feat(adapters): ship `boost/guidelines.md` for `@rudderjs/boost` discovery

  Phase C of the boost-producer rollout. Each adapter now ships its own `boost/guidelines.md` so consumer Rudder apps with `@rudderjs/boost` installed pick them up automatically via `rudder boost:install`. Per-agent config files (`CLAUDE.md` / `.cursorrules` / `AGENTS.md` / etc.) include all installed adapter guidelines in the concatenated body.

  - **`@pilotiq/tiptap`** — RichTextField + Block (custom-block side panel), toolbar customization, mentions (static + async) + merge tags, file attachments, JSON vs HTML storage, server-side rendering via `renderRichTextToHtml`.
  - **`@pilotiq/codemirror`** — CodeEditorField + Code alias, language registry (`registerCodeLanguage` / `codeEditor({ languages })`), theming (auto / light / dark), reactive integration, validation, common language packs.
  - **`@pilotiq/recharts`** — Chart class + fluent form, chart types (line / bar / pie / doughnut), Chart.js-shaped data normalized to Recharts internally, per-chart filter dropdown, polling, resource header/footer placement, escape hatch via `static options`.

  Each guideline closes with a "Common Pitfalls" section distilled from project memory + a "Key Imports" reference. No skills shipped in this phase — adapter usage is single-surface enough that the always-loaded `guidelines.md` covers it; skill modules can follow if a consumer asks.

- 6d2ac13: chore: slim published tarballs to `dist` + `boost` + `CHANGELOG.md`

  All four packages now declare `"files": ["dist", "boost", "CHANGELOG.md"]` so npm pack only ships the compiled output, the `@rudderjs/boost` guidelines + skills tree, and the changelog. Previously `@pilotiq/pilotiq` shipped its full `src/`, `CLAUDE.md`, `.turbo/`, and test files; the three adapters shipped `src/` deliberately but no longer need to.

  - **`@pilotiq/pilotiq`** — 2.1 MB → 1.3 MB (~38% smaller). Drops `src/**`, `CLAUDE.md`, `.turbo/` from the tarball.
  - **`@pilotiq/tiptap` / `@pilotiq/codemirror` / `@pilotiq/recharts`** — drop `src/**` from the tarball.

  No API impact. Consumer Tailwind `@source` rules that previously scanned `node_modules/@pilotiq/*/src` should re-point at `node_modules/@pilotiq/*/dist` (Tailwind scans `.js` just fine). Source maps in `dist/` still reference `../src/*.ts` paths that are no longer in the tarball — sourcemap navigation inside `node_modules` won't resolve to TS, but stack traces still line up.

## 3.2.6

### Patch Changes

- ef76978: refactor(codemirror): consume `useCollabSeedText` from `@rudderjs/sync/react`

  `CollabCodeMirrorEditor` previously seeded its bound `Y.Text` via pilotiq core's `useCollabSeed` shim, which is `Y.XmlFragment`-only — the callback then resolved the share back to a `Y.Text` via a `(doc as Y.Doc).getText(fragmentKey)` cast. `@rudderjs/sync@1.3.0` ships `useCollabSeedText`, the symmetric sibling that binds (and seeds) a `Y.Text` directly.

  The migration drops the cast and the manual `getText` call — the seed callback now receives `(_doc, yText)` already resolved to `Y.Text`. Same synced-await + `'rudder-sync-seed'` transact-origin semantics as before; this is mechanically a no-op at runtime.

  Adds `@rudderjs/sync@^1.3.0` to peer deps (mirrors what `@pilotiq/tiptap` already does for its `useCollabSeed` consumption, but bumped to `^1.3.0` for the new hook).

## 3.2.5

### Patch Changes

- 143e4a3: fix(adapters): adapter polish — TiptapEditor.setEditable sync, MarkdownEditor upload errors, CodeMirror useMemo + yCollab cast cleanup

  Bundle of three small adapter-side correctness / hygiene fixes from the 2026-05-21 code-quality sweep (Phase 6 a/b/c). Phase 6d (consume `@rudderjs/sync/react` collab hooks) is deferred to its own focused session since it needs playground + dual-browser smoke; Phase 6e (React-mount test coverage) is its own pass — neither ships here.

  - **6a — `TiptapEditor.setEditable` runtime sync.** `useEditor({ editable: !disabled, … })` only fires at construction. A parent flipping `disabled` after mount (validation failure mid-edit, form submitting state) would silently no-op. Sibling adapters `MarkdownEditor.tsx:256-259` and `CollabTextRenderer.tsx:127-130` already wire the matching effect; this aligns `TiptapEditor.tsx` with them.
  - **6b — `MarkdownEditor.uploadAndInsert` surfaces server errors.** `if (!res.ok || !data.ok || !data.url) return` silently stopped the spinner with no toast and no console — users see the upload button revert with no signal that anything went wrong. Now wired through `useToast()` from `@pilotiq/pilotiq/react` (same surface `<Toolbar>`'s media-dialog already uses): network-fail and server-fail both emit an `error`-type toast with the server's `data.error` (or `"Upload failed (status N)."` fallback). Falls back to a no-op when no `ToasterProvider` is mounted — `useToast` returns a default context.
  - **6c — CodeMirror `useMemo` + `as never` cleanup.** Two adjacent fixes in the codemirror adapter:
    - `CodeMirrorEditor.tsx:131` — the `const initial = useMemo(() => stringValue(defaultValue), [])` indirection was dressing — `useState<string>(initial)`'s initializer only runs once on mount regardless. Inlined as `useState<string>(() => stringValue(defaultValue))` with a comment naming the uncontrolled-fallback semantic + how `key`-based remount is the documented pattern for resetting a starting value across record swaps (the controlled path via `Form.stateUrl` doesn't need it).
    - `CollabCodeMirrorEditor.tsx:125` — `yCollab(yText, awareness, { undoManager: false } as never)` dropped the `as never` cast. Verified against `y-codemirror.next@^0.5`'s `index.d.ts`: the option key is `undoManager` (typed `Y.UndoManager | false`), not the suspected `yUndoManager` — the cast was bypassing typecheck for nothing.

  Tests: 183 / 183 green in `@pilotiq/tiptap`; 22 / 22 green in `@pilotiq/codemirror`; monorepo `pnpm typecheck` clean (9 / 9 packages).

- 89a9101: feat(collab): consume `@rudderjs/sync/react`'s collab-room lifecycle via `useCollabSeed` (Phase 6d of the code-quality sweep)

  The same `provider.once('synced', …)` + empty-fragment seed dance was duplicated across four pilotiq adapters (`TiptapEditor`, `MarkdownEditor`, `CollabTextRenderer`, `CollabCodeMirrorEditor`) and `@pilotiq-pro/collab`'s `useRecordCollabRoom`. `@rudderjs/sync@1.2.0` shipped `@rudderjs/sync/react` with `CollabRoomManager` (cancellation-safe, idempotent stop, optional `y-indexeddb`); this PR threads its synced Promise through pilotiq's open-core `CollabRoom` so adapters can consume the consolidated seed-gate via `useCollabSeed`.

  **`@pilotiq/pilotiq` (minor — new public API + widened `CollabRoom` shape, both additive)**

  - `CollabRoom` interface widened with two optional fields:
    - `synced?: Promise<void>` — resolves on the provider's first sync. Stamped by `@pilotiq-pro/collab@>=0.2`'s `<RecordCollabRoom>`; absent for legacy / hand-rolled providers.
    - `persistence?: unknown` — `y-indexeddb` handle, opaque to pilotiq core. Present when the room owner wired offline persistence; absent otherwise.
  - New `useCollabSeed(room, fragmentKey, seedFn)` hook (re-exported from `@pilotiq/pilotiq/react`). Mirrors `@rudderjs/sync/react`'s shape — reimplemented locally so pilotiq core stays free of any hard runtime dep on Yjs. Waits for `room.synced` to resolve, wraps `seedFn` in `ydoc.transact(..., 'pilotiq-collab-seed')`. Consumers manage their own share-type lookup (`doc.getXmlFragment(key)` for Tiptap; `doc.getText(key)` for CodeMirror) and emptiness check, since the share type varies per adapter and pilotiq's `CollabRoom.ydoc` stays `unknown`.
  - `onProviderSynced` is unchanged and still exported for back-compat — legacy rooms without `.synced` short-circuit through `useCollabSeed` immediately (seeded=true with no callback fired), so any adapter still calling `onProviderSynced` keeps working unchanged.

  **`@pilotiq/tiptap` (patch — internal migration, no public-surface change)**

  `TiptapEditor`, `MarkdownEditor`, and `CollabTextRenderer` each dropped their inline `useEffect(() => onProviderSynced(provider, trySeed), [editor, collabActive, room])` block in favour of one `useCollabSeed(editor && collabActive ? room : null, collabName, seedFn)`. The shape of the seed (Y.XmlFragment empty-check + `editor.commands.setContent(initialContent)` via the y-prosemirror binding) is unchanged. Roughly −40 LOC per file; the `hasSeeded` `useState` slots are gone (the hook owns dedup).

  **`@pilotiq/codemirror` (patch — internal migration, additive prop)**

  - New optional `synced?: Promise<void> | null` prop on `CollabCodeMirrorEditor`. Threaded from the wrapper in `CodeMirrorEditor.tsx`'s `<CollabBranch>` so the renderer can gate the brand-new-record Y.Text seed on the same Promise.
  - Seed logic moved out of the EditorView mount effect to a top-level `useCollabSeed` call. The mount-time pre-seed (`EditorState.create({ doc: yText.toString(), ... })`) is unchanged — that path handles re-mount onto a yText that already has content (e.g. `renameRow` clones); the post-sync seed handles brand-new records where the share is empty after first sync.
  - `onProviderSynced` + `SyncedProviderLike` no longer imported. The `synced` prop is optional with `null` default — passing nothing falls back to seeding immediately, matching the legacy `onProviderSynced(null, …)` no-op posture.

  No wire-protocol changes. The race window (two peers mounting against a brand-new record may both see "empty" + seed) is unchanged from the prior `onProviderSynced` path; the fix is server-side seed handoff, deferred.

  Coverage: existing tests pass unchanged (tiptap 183/183, codemirror 22/22, pilotiq monorepo typecheck 9/9). Dual-browser smoke via the existing `pilotiq-pro/e2e/collab` Playwright suite gates the actual sync behaviour.

## 3.2.4

### Patch Changes

- 99bca27: `CollabCodeMirrorEditor` — three internal simplifications, no API change:

  - **Live Compartment reconfigure** for `theme` / `height` / `lineNumbers` / `lineWrapping` / `indentWithTabs` / `indentSize`. Only `fragmentKey` and `language` still force an EditorView remount; toggling dark mode or wrapping inside a dense Repeater now preserves cursor, scroll, and undo history.
  - **Module-level singleton** for the auto-dark theme listener via `useSyncExternalStore` — one `MutationObserver` + one `matchMedia` listener per page, regardless of editor count (was one pair per editor instance).
  - **No-op short-circuit** on `updateListener`: `update.docChanged` can fire with an identical `doc.toString()` (IME composition, cursor-only edits); track `lastTextRef` and skip the FormData mirror when unchanged.

## 3.2.3

### Patch Changes

- 1b8c1bc: feat(pilotiq): extract `onProviderSynced(provider, fn)` helper for the seed-on-synced collab lifecycle pattern

  Adapter packages that bind to a collab room (Tiptap-backed editors, the CodeMirror collab adapter) all need the same choreography on mount: if the provider's already streamed in the initial room state, run the seed callback now; otherwise register `provider.once('synced', fn)` and clean up via `provider.off?.('synced', fn)`. That gate was implemented separately in 4 renderers (`CollabTextRenderer`, `MarkdownEditor`, `TiptapEditor` in `@pilotiq/tiptap`; `CollabCodeMirrorEditor` in `@pilotiq/codemirror`).

  This change extracts the pattern into a single helper in `@pilotiq/pilotiq/react` so future bug fixes in the gate logic (StrictMode double-fire, missing-off-method providers, etc.) fix in one place and so adapters from outside this monorepo can adopt the same pattern with one import.

  **New public surface on `@pilotiq/pilotiq/react`:**

  - `onProviderSynced(provider, fn): () => void` — runs `fn` synchronously if `provider.synced`, otherwise registers `provider.once('synced', fn)`. Returns a cleanup that safely unregisters via `try { provider.off?.('synced', fn) } catch {}`. Null/undefined provider returns a no-op cleanup.
  - `SyncedProviderLike` — structural type with `synced?: boolean`, `once?(event: 'synced', fn): void`, `off?(event: 'synced', fn): void`. No yjs / y-websocket peer dep — callers cast their concrete provider via `provider as SyncedProviderLike`.

  **Adapter package changes (patch-grade):**

  - `@pilotiq/tiptap`: `CollabTextRenderer`, `MarkdownEditor`, and `TiptapEditor` each replace their ~10-line gate block with `return onProviderSynced(provider, trySeed)` (still inside the existing `useEffect`).
  - `@pilotiq/codemirror`: `CollabCodeMirrorEditor` stores the cleanup and invokes it alongside `view.destroy()` inside the mount effect's combined cleanup.

  Behavior is unchanged — no double-fire risk, no missed-cleanup risk, no API changes for callers of any of the affected renderers.

  Test coverage: 6 new unit tests in `packages/pilotiq/src/react/onProviderSynced.test.ts` cover synced-now, defer-until-synced, cleanup-before-synced, null provider, off-throws, and provider-missing-once/off.

## 3.2.2

### Patch Changes

- 02d297a: chore(codemirror): simplify-pass on `CollabCodeMirrorEditor` — dedupe seed read, drop stale caveat, expose stable selector hook for e2e

  Follow-up housekeeping after the seed-from-`yText.toString()` fix shipped in `3.2.1`. No runtime behavior change for end users; the only DOM surface change is additive.

  - Capture the seed once at mount: `const seed = yText.toString()` feeds both `EditorState.create({ doc: seed })` and the initial hidden-input mirror via `setText(seed)`. The pre-fix code called `yText.toString()` twice back-to-back inside the mount effect — harmless but redundant.
  - Delete the "PK-switch row-rename caveat" paragraph from the component JSDoc. The caveat was closed end-to-end by `pilotiq-pro@5fae624`'s `rowArrayBinding.renameRow` `Y.Text` rekey branch + `@pilotiq/codemirror@3.2.1`'s seed fix. The seed-on-mount comment block at the call site already covers the operational invariant.
  - Stamp `data-pilotiq-collab-code="<hiddenInputName>"` on the editor host div. Consumer-package e2e suites (e.g. `@pilotiq-pro/collab`'s collab specs) can anchor locators on this attribute instead of walking up through the FieldShell DOM via `..`, which was tightly coupled to the current JSX nesting.
  - Remove the stale `eslint-disable @typescript-eslint/no-unused-vars` directive on the `import type * as Y from 'yjs'` line — `Y.Text` is used as a type cast in the mount effect.

## 3.2.1

### Patch Changes

- fbc75f3: fix(codemirror): seed editor doc from `yText.toString()` at mount so collab remounts onto a populated `Y.Text` paint immediately

  When `CollabCodeMirrorEditor` remounts (e.g. after a Repeater/Builder row's PK switch re-keys the row's CRDT identity from UUID to DB PK), the new `EditorView` was constructed with `doc: ''` on the assumption that `y-codemirror.next`'s `ySyncPlugin` would pull pre-existing `Y.Text` content into the editor at attach time. It doesn't — the plugin assumes editor doc + `Y.Text` are already in sync at init and only observes subsequent deltas. So a fresh editor against a `Y.Text` that already had content would paint blank until someone typed and triggered an observed delta.

  Seeding `doc` from `yText.toString()` at construction time is enough: the plugin's first observation runs against editor doc + `Y.Text` both holding the same content (no diff to dispatch), and subsequent edits propagate as before. No double-insert risk — the plugin doesn't try to re-insert content already present in the editor doc.

  Fixes the row-leaf `CodeEditorField` survives-PK-switch case in `@pilotiq-pro/collab`'s `rowArrayBinding.renameRow` `Y.Text` rekey path (pilotiq-pro@5fae624). The renameRow side was already broadcasting the cloned content correctly; the consumer-side editor just wasn't reading it on remount.

## 3.2.0

### Minor Changes

- 1559a62: CodeEditorField now binds to `y-codemirror.next` when a `<RecordCollabRoom>` is mounted up-tree (parallel to `@pilotiq/tiptap`'s collab plain-text path). Each `CodeEditorField` opens a doc-root `Y.Text` keyed by either the bare field name (top-level) or `${arrayName}.${rowId}.${fieldName}` (Repeater / Builder row leaves). Opt out per-field with `.collab(false)`.

  Adds optional peer deps `y-codemirror.next ^0.3` + `yjs ^13` on `@pilotiq/codemirror` (under `peerDependenciesMeta.optional` — panels without `@pilotiq-pro/collab` installed continue to work as before).

  Also re-exports `useRowCoords`, `RowCoordsContext`, `parseRowFieldPath`, and `ParsedRowFieldPath` from `@pilotiq/pilotiq/react` so adapter packages (codemirror today, others later) can compose row-field collab keys consistently.

  **Relationship-row code editors:** `y-codemirror.next` binds against `Y.Text`, not `Y.XmlFragment`. `@pilotiq-pro/collab`'s `rowArrayBinding.renameRow` rekeys both share types alongside one another (`applyDelta(toDelta())` for `Y.Text`, `child.clone()` for `Y.XmlFragment`), so on PK-switch (UUID → DB PK after first save) a row-leaf `CodeEditorField`'s text content carries over to the new composite key on peer B without falling back to the DB column. Trade-off is rename-by-recreate (fresh CRDT identity → discards concurrent-edit history on the renamed row's code-editor leaves), same posture as the `Y.XmlFragment` branch. Requires `@pilotiq-pro/collab` ≥ the patch that ships this rekey (`pilotiq-pro@5fae624`, 2026-05-17).

## 3.0.1

### Patch Changes

- b14119e: Widen the `@pilotiq/pilotiq` peer dependency from `workspace:^` (publishes as `^<version>`) to the literal range `>=0.6.0 <1.0.0`.

  Under pre-1.0 caret semver, `^0.6.0` does not satisfy `0.7.0`, so every pilotiq minor bump was breaking the adapters' published peer range — which in turn made changesets propose a MAJOR bump on the adapters on every release, even when nothing in them changed. The literal range covers the whole `0.x` track, so the trap no longer fires.

## 3.0.0

### Patch Changes

- Updated dependencies [3b9d69c]
- Updated dependencies [e7f46a3]
- Updated dependencies [546b7bb]
- Updated dependencies [badb132]
- Updated dependencies [4440ec4]
  - @pilotiq/pilotiq@0.6.0

## 2.0.1

### Patch Changes

- 863505c: Use caret peer dep for `@pilotiq/pilotiq` so adapter packages stay compatible across minor bumps.

## 2.0.0

### Patch Changes

- Updated dependencies [a1c3e40]
  - @pilotiq/pilotiq@0.4.0

## 1.0.0

### Patch Changes

- Updated dependencies [58232be]
- Updated dependencies [58232be]
- Updated dependencies [43428d6]
  - @pilotiq/pilotiq@0.3.0

## 0.2.0

### Patch Changes

- Updated dependencies [2dedc56]
  - @pilotiq/pilotiq@0.2.0

## 0.1.0

### Patch Changes

- Updated dependencies [8cea72c]
- Updated dependencies [786da6b]
- Updated dependencies [2f4c948]
- Updated dependencies [4bdae5d]
- Updated dependencies [e5cd3f1]
  - @pilotiq/pilotiq@0.1.0
