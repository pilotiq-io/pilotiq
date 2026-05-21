# @pilotiq/tiptap

## 3.10.1

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

- 63b5dc1: fix(tiptap): inline-diff effect re-runs when editor doc shape changes

  `useAiInlineDiff`'s diff-start effect previously depended only on `[editor, list]`, so a surgical suggestion arriving during the seed window of a collab-enabled markdown / richtext editor (editor mounts with an empty placeholder paragraph, then the Yjs provider seeds the real content asynchronously) would call `planReplaceBlock(editor, blockIndex, …)` against the empty doc, get `null` for any blockIndex >= 1, and silently bail. The suggestion stayed in the queue, the banner appeared, but no decorations rendered. On Accept, the applier's auto-mode fallback re-planned the modifier against the now-seeded doc and dispatched it — so the change landed but the user never saw a preview.

  Fix: subscribe to the editor's `doc.childCount` via `useEditorState` and include it in the diff-start effect's deps. The effect now re-runs when the doc transitions from empty (during seed) → loaded (after sync), picking up any suggestions whose modifier returned null on first attempt.

  No behaviour change outside the seed-race window. Established tests + e2e suite (5 cases, ~15s) green.

## 3.10.0

### Minor Changes

- 349c1f3: fix(collab-text): split `name` (FormData/AI routing) from `fragmentKey` (collab Y fragment) on the plain-text collab renderer

  Audit catch from the same family as the `MarkdownEditor` fix in `@pilotiq/pilotiq@0.20.0` / `@pilotiq/tiptap@3.9.0`. The `CollabTextRenderer` (Tiptap-backed plain-text editor used by collab-enabled `TextField` / `TextareaField` / `MarkdownField`'s collab fallback) had the same single-prop / two-concerns shape:

  - `TextLikeInput.tsx → CollabTextField` and `MarkdownInput.tsx → MarkdownCollabInput` both overrode the renderer's `name` with the composite row-id fragment key — needed for `Y.XmlFragment` stability under reorders — but that override ALSO re-keyed AI suggestion routing (`useAiSuggestionBridge`), so the chip-widget surface on a plain `TextField` nested in a Repeater row would never receive AI suggestions addressed by the positional FormData name (`metadata.0.title`).

  Fix: `CollabTextRendererProps` now carries an optional `fragmentKey`. `CollabTextRenderer` uses `fragmentKey ?? name` for the collab factory `fieldName` + first-load `ydoc.getXmlFragment(...)` seed only; AI suggestion bridge + form integration stay on `name`. Both host wrappers pass `name={hiddenInputName}` (positional FormData path) and `fragmentKey={composite}` (row-id-anchored) when the two differ; top-level fields omit `fragmentKey` and keep today's behavior.

  Latent bug, fixed preemptively: AI tool calls on plain `TextField` nested in a Repeater / Builder row would silently fail to render their inline-diff chip — same root cause as the `MarkdownField` bug in `@pilotiq/tiptap@3.8.0` and below, just for the chip-widget surface instead of the inline-diff overlay.

  All 16 collab e2e tests + 4 AI surgical e2e tests pass against the change.

- 29ccaff: fix(tiptap): RichTextField collab Y fragment now uses a row-id-anchored composite key inside Repeater / Builder rows

  Mirrors the `MarkdownField` fix shipped in `@pilotiq/tiptap@3.9.0`. When `TiptapEditor` mounts inside a Repeater / Builder row (i.e. its `name` is a dotted positional path like `metadata.0.body` AND a `RowCoordsContext` is present), the editor now computes a stable composite key — `metadata.<rowId>.body` — and uses it for:

  - `ydoc.getXmlFragment(...)` first-load seeding
  - The collab extension factory's `fieldName` (Yjs collab scope per field)

  `name` remains the positional FormData path everywhere else — AI suggestion routing (`useAiInlineDiff`, `useAiSuggestionBridge`), the inline-diff banner, mentions, and the hidden form input.

  Different mechanics from the `MarkdownField` fix: `MarkdownField` has a textarea fallback path that needs the same composite, so the logic lived in `@pilotiq/pilotiq`'s `MarkdownInput` host. `RichTextField` has no fallback — pilotiq core dispatches the registered renderer directly — so the composite logic lives here, inside the only editor that needs it. `useRowCoords` + `parseRowFieldPath` are already exported from `@pilotiq/pilotiq/react`.

  Latent bug, fixed preemptively: no consumer currently nests `RichTextField` inside a Repeater / Builder row, but if one did, row reorders would silently rebind the Y.XmlFragment to the wrong row's editor (the fragment key was the positional `metadata.<index>.body`, which shifts on reorder). AI suggestion routing was unaffected — positional names matched on both sides.

## 3.9.0

### Minor Changes

- cead688: fix(markdown): split `name` (FormData/AI routing) from `fragmentKey` (collab Y fragment) on the markdown editor

  `MarkdownEditorProps` previously had a single `name` prop that drove both the FormData hidden input + AI suggestion routing AND the `Y.XmlFragment` key. Inside a Repeater / Builder row, `MarkdownInput` overrode `name` with a row-id-anchored composite (`metadata.<rowId>.body`) so the Y fragment survived row reorders — but this also re-keyed the AI applier registry and `<AiSuggestionBanner>`, so tool calls that referenced the field by its dotted FormData name (`metadata.0.body`) never reached the row editor.

  Result: AI surgical / whole-field suggestions on a `MarkdownField` nested inside a Repeater row silently failed — the tool reported "queued for review" but no diff overlay appeared in the row.

  Fix: `MarkdownEditorProps` now carries a separate optional `fragmentKey` prop. The editor uses it for the collab Y fragment key (`ydoc.getXmlFragment(...)` + the collab factory's `fieldName`) but keeps `name` for everything else — AI suggestion routing, applier registry, hidden FormData input, inline-diff banner. Top-level fields omit `fragmentKey`; row leaves pass the composite as `fragmentKey` while leaving `name` as the dotted FormData path.

  `@pilotiq/tiptap`'s `MarkdownEditor` accepts the new prop and routes it correctly. `@pilotiq/pilotiq`'s `MarkdownInput` passes both props to the registered editor.

  Caveat: `RichTextField`'s `TiptapEditor` has the analogous single-`name` shape and would surface the same gap if nested in a Repeater. Not in scope for this change — no consumer currently nests `RichTextField` in a row. File a follow-up when it becomes a real path.

## 3.8.0

### Minor Changes

- 7cbf610: feat(tiptap): auto-mode applier for surgical AI inline-diff ops

  `useAiInlineDiff`'s registry applier now handles two paths:

  1. **Review accept (existing).** Suggestion was already started via `startAiInlineDiff` / `applySurgicalAiInlineDiff`; approve runs `acceptAiInlineDiff()`.
  2. **Auto-mode direct apply (new).** Suggestion arrives at the applier with `meta.surgical` but was never started (the producer bypassed the queue). The hook plans the same modifier the diff path uses and dispatches it as a plain transaction — no diff overlay, no Accept / Reject step.

  Mirrors the existing `set_value` auto-mode behaviour, where the AI tool binding calls the applier directly with a synthesized suggestion to skip the review queue. Surgical ops in `Pilotiq.aiSuggestionsMode('auto')` now write through immediately instead of always waiting on the user.

  Review-mode behaviour unchanged.

- 374168b: feat(tiptap): cross-tool-call stacking for surgical AI inline-diff ops

  When a surgical AI suggestion arrives while an inline-diff review is already active for the same field, `useAiInlineDiff` now folds the new op into the active diff instead of stalling the suggestion in the queue.

  Previously: the second suggestion sat in the queue until the user approved or rejected the first, then started its own diff afterwards. Worse, if the user clicked Accept while two were pending, the banner's "approve all" path dismissed both queue entries even though only the first had been applied — the second was silently dropped.

  Now: the new modifier dispatches as a plain transaction; the extension's plugin folds the resulting steps into the running changeset, so:

  - The banner shows the combined count (`"N changes suggested"`).
  - Decorations update to cover both ops' ranges.
  - Accept commits the union, Reject reverts to the original baseline captured when the first suggestion started the diff — semantically "reject all pending suggested changes", matching the banner copy.

  Whole-field (non-surgical) suggestions still bail when a diff is active — replacing the entire doc on top of an active review would be too disruptive. That gap (whole-field stacking + silent-drop) remains a known issue, deferred until a consumer hits it.

- cabbcf3: feat(tiptap): surgical AI inline-diff ops now support markdown fields

  `planReplaceBlock` and `planInsertBlockBefore` now auto-detect markdown editors by sniffing for the `tiptap-markdown` extension's `storage.markdown.parser`:

  - **Richtext (`RichTextField` / `TiptapEditor`)** — unchanged. `content` is HTML and parses through `DOMParser.fromSchema(...).parseSlice(...)` directly.
  - **Markdown (`MarkdownField` / `MarkdownEditor`)** — new. `content` is markdown source; the planner runs it through the markdown-it parser bundled with `tiptap-markdown` to produce HTML first, then parses that as a Slice.

  Mirrors the same auto-detect strategy `MarkdownEditor.tsx` already uses for whole-field `parseSuggestion` callbacks, so surgical ops on markdown fields now share the same content-handling path as the existing whole-field replacement path.

  Closes follow-up #4 of the surgical block ops shipped in `@pilotiq/tiptap@3.7.0`.

## 3.7.0

### Minor Changes

- b5462b7: feat(tiptap): surgical block-level inline-diff ops for AI agents

  Adds 4 precise block-edit primitives the AI agent can call instead of always rewriting the whole field via `set_value`. Each lands an inline-diff overlay scoped to just the changed range — far cheaper in tokens, far cleaner UX for the reviewer.

  **New extension command** on `AiInlineDiffExtension`:

  - `applySurgicalAiInlineDiff(id, applyFn)` — snapshots the current doc as the baseline, runs `applyFn(tr)` to mutate the transaction with a precise change, then folds the resulting steps into the changeset. The existing decoration spec walks per-change ranges, so surgical edits get the same green-insert / red-strikethrough overlay as whole-field replacements, but only on the touched blocks.

  **4 planner helpers** in a new `surgicalOps.ts` module (re-exported from the package root):

  - `planReplaceBlock(editor, blockIndex, html)` — swap one top-level block.
  - `planInsertBlockBefore(editor, blockIndex, html)` — insert before a given index (or append at `doc.childCount`).
  - `planDeleteBlock(editor, blockIndex)` — delete one top-level block. Refuses the last remaining block.
  - `planUpdateBlockMark(editor, blockIndex, mark, range, apply, attrs?)` — apply/remove inline marks on a character range _within_ a block. Offsets are 0-based within the block's text.
  - `summarizeBlockStructure(doc, maxChars?)` — render the doc's top-level structure as a numbered list (`[0] heading: Welcome`, …) for sending to the AI alongside the field value.

  Each planner returns a `TransactionModifier | null` — `null` means "abort, this can't be planned" (out-of-range index, unparseable HTML, unknown mark).

  **`useAiInlineDiff` hook** now reads `meta.surgical` on pending suggestions in two shapes:

  ```ts
  // Single op (one surgical change)
  meta: { surgical: { op: 'replace_block', blockIndex: 2, content: '<h2>...</h2>' } }

  // Batched ops (multiple surgical changes from one AI tool call)
  meta: { surgical: { ops: [
    { op: 'replace_block',       blockIndex: 0, content: '<h1>Title</h1>' },
    { op: 'insert_block_before', blockIndex: 2, content: '<p>New para</p>' },
  ] } }
  ```

  Batches are applied as one combined diff: modifiers are computed against the original (pre-transaction) doc, then dispatched in DESC `blockIndex` order so earlier modifiers' edits at higher positions don't shift the absolute positions later modifiers were planned with. The user sees a single inline-diff overlay with one Accept / Reject covering every op in the batch — rather than N pending suggestions that have to be reviewed serially.

  Whole-field suggestions (no surgical meta) continue through the existing `startAiInlineDiff` path.

  Also re-exports `AiInlineDiffExtension` / `aiInlineDiffPluginKey` / `getAiInlineDiffState` from the package root for consumers that want to read diff state directly.

## 3.6.0

### Minor Changes

- 8a32c8e: feat(tiptap): inline-diff visualization + banner UX for whole-field AI suggestions on RichTextField and MarkdownField

  The chip widget path (`AiSuggestionExtension`) keeps its role for _surgical_ range-anchored suggestions (`format_text`, `set_link`, `insert_paragraph`, …) — those have a precise location worth visualizing inline. For whole-field replacements from chat-driven `update_form_state` / `set_value` calls, the chip's `textContent` render surfaced raw markup as literal text inside the green pill — visually unparseable on multi-paragraph rewrites.

  Two new pieces in `@pilotiq/tiptap`:

  1. **`AiInlineDiffExtension` + `useAiInlineDiff` hook** — Tiptap-Pro-class inline-diff visualization driven by [`prosemirror-changeset`](https://github.com/ProseMirror/prosemirror-changeset). The hook watches `<PendingSuggestionsContext>` for whole-field suggestions, runs the renderer-supplied parser (`tiptap-markdown.parser.parse(value)` → HTML → `ProseMirrorDOMParser.parseSlice` for markdown / direct DOMParser for richtext), and calls `editor.commands.startAiInlineDiff(id, slice)`. The extension snapshots the current doc as the baseline, replaces the doc body with the proposed slice, and initializes a changeset tracking the diff. Decorations render:

     - Green-background `<span>` over inserted ranges (current doc).
     - Strikethrough widget at the insert anchor showing the _deleted_ text in red — the deleted content isn't in the current doc, so a widget is the only way to surface it.
     - `acceptAiInlineDiff()` clears the diff state (current doc IS the accepted state). `rejectAiInlineDiff()` reverts the doc to the captured baseline. Both commands are public and the host's banner drives them.

  2. **`<AiSuggestionBanner>` host component** — a top-of-editor strip that mounts above the editor when whole-field suggestions are pending. Replaces the chip path for richtext / markdown surfaces (which always had ugly raw-markup chips). Two modes:
     - Default (no diff): Accept routes through the renderer-supplied `onApplyWholeField(value)`, mirroring the previous chip-Approve semantics for plain text fallback.
     - Diff-active: `onAcceptViaEditor` / `onRejectViaEditor` props route through the extension's commands so the doc commits / reverts cleanly.

  Default CSS for both the banner chrome and the diff decorations auto-injects on first mount (idempotent via sentinels), so consumers see the visualization out of the box. Class names (`pilotiq-ai-banner-*` + `pilotiq-ai-diff-*`) stay the documented surface for theme customization.

  `MarkdownEditor` and `TiptapEditor` mount the new extension + banner; `CollabTextRenderer` keeps the chip path (plain-text replacement renders cleanly in the chip).

  Wire shape unchanged on the host side — `@pilotiq-pro/ai`'s `update_form_state` → `set_value` tool keeps emitting a single `suggestedValue` string. The renderer-supplied parser decides what to do with it.

## 3.5.0

### Minor Changes

- 644939b: fix(pilotiq, tiptap): route AI suggestions through the Tiptap bridge for collab-on / markdown / richtext fields — fixes chat-driven `update_form_state` no-op

  Two cooperating bugs left chat-sidebar Approve doing nothing on Tiptap-backed fields:

  1. **`FieldShell` overlay shadowed the bridge.** The gate `isRichText = fieldType === 'richtext'` ran the legacy overlay UI on `markdown` / `text` / `textarea`, _and_ registered a generic DOM-write applier that overwrote the Tiptap bridge's applier in the registry (parent effect runs after children). Approve set the hidden `<input>`'s `.value`, which the Tiptap editor never observes, so the visible content never changed.

  2. **Bridge skipped whole-field suggestions.** `useAiSuggestionBridge` only pushed entries with `meta.editorRange = { from, to }` into the editor. Chat-agent producers like `@pilotiq-pro/ai`'s `update_form_state` tool target the whole field — no range — so suggestions sat in the queue with no chip widget and no applier path.

  Fix:

  - **`@pilotiq/pilotiq`** — `FieldShell` widens `isRichText` to `isTiptapMounted`: `richtext` always, `markdown` when a `MarkdownEditor` is registered, `text` / `textarea` when both a `CollabTextRenderer` is registered and `useCollabRoom()` resolves a room. Hides the legacy overlay and skips DOM-write applier registration so the bridge's editor-driven applier owns the surface.

  - **`@pilotiq/tiptap`** — `useAiSuggestionBridge` accepts a new `onApplyWholeField(value)` option. When Approve fires for a non-bridge-pushed id, the bridge calls this callback instead of no-op'ing. Each renderer passes its own implementation:
    - `CollabTextRenderer` → `editor.commands.setContent(plainTextToDoc(value, multiline))` — y-prosemirror syncs the resulting transaction to peers when collab is on.
    - `MarkdownEditor` → `editor.commands.setContent(value)` — the Markdown extension parses the raw source.
    - `TiptapEditor` (RichTextField) → `editor.commands.setContent(value)` — HTML / JSON.

  After the fix every chat-driven `update_form_state` set-value lands on the visible editor surface across all three Tiptap mounts. Range-anchored suggestions (existing chip-widget path) keep their original behavior unchanged.

  **Plus inline-diff visualization for whole-field suggestions.** Two follow-on improvements in `@pilotiq/tiptap`:

  - `useAiSuggestionBridge` accepts `synthesizeWholeFieldRange(editor, suggestion) => { from, to } | undefined`. When opted in, whole-field suggestions get a synthesized range and the inline-diff chip widget renders BEFORE the user approves (red strikethrough on the current value + green chip with the suggested text + ✓/✕ buttons). `CollabTextRenderer` opts in with `{ from: 0, to: editor.state.doc.content.size }` — its plain-text schema accepts the extension's text-node replacement on Approve cleanly. `MarkdownEditor` and `TiptapEditor` abstain (they'd lose formatting on the chip-driven approve) and continue to use the silent `onApplyWholeField` fallback.

  - `AiSuggestionExtension` injects minimal default styles into `<head>` on first mount (idempotent via a `data-pilotiq-ai-suggestion-styles` sentinel). Consumers no longer need to wire CSS for the chip — they see the visualization out of the box. User stylesheets still override since they cascade after the injected `<style>` block, and the class names (`pilotiq-ai-suggestion-original` / `-chip` / `-replacement` / `-accept` / `-reject`) stay the documented surface for customization.

### Patch Changes

- adc0ce0: feat(pilotiq, tiptap): auto-upgrade `TextField` / `TextareaField` to the Tiptap-backed editor when AI agents are attached (no collab required)

  Previously, the Tiptap-backed renderer (`CollabTextRenderer` in `@pilotiq/tiptap`) only mounted when a `<RecordCollabRoom>` was active — so AI suggestions on plain (non-collab) `TextField` / `TextareaField` fell back to the legacy DOM-write overlay, with no inline-diff chip widget.

  The rule is now: a text-like field gets the Tiptap surface if **any one of**:

  1. A collab room is active (existing behavior — cursor preservation under concurrent edits).
  2. AI agents are attached via `field.ai([…])` (new — the inline-diff chip needs a ProseMirror surface to render).
  3. The field is a `MarkdownField` (existing — always Tiptap).

  `TextLikeInput` widens its routing gate from `room && collabRenderer …` to `(room || hasAi) && collabRenderer …`. `FieldShell` mirrors the widening so its legacy overlay + DOM-write applier stay out of the way when the Tiptap bridge owns the surface. `CollabTextRenderer` already handles `useCollabRoom() === null` — it just mounts the editor without the Yjs Collaboration extension, so this widening doesn't force a collab room.

  No new public API. Users get the auto-upgrade for free by attaching agents — exactly what they already do to opt into AI features on a field.

  **`@pilotiq/tiptap` follow-on:**

  - `CollabTextRenderer` now sets `immediatelyRender: false` on the editor config. Pre-rule-#2 the host's `TextLikeInput` gated on a live collab room (client-only state), so SSR fell through to the native input and the editor never constructed server-side. With AI-attached fields now SSR-rendering Tiptap, `useEditor` would throw `"Tiptap Error: SSR has been detected, please set immediatelyRender explicitly to false"` on the first direct-navigation request. The flag defers construction to the first React effect — empty shell on SSR, live editor on hydration.
  - Build script no longer ships `dist/markdownExtension.js.map`. The bundled file is 371 KB of inlined `tiptap-markdown` + `markdown-it` chain; the sourcemap from `tsc` only described the original ~20-line wrapper, leaving Vite to log a `Sourcemap … points to missing source files` warning on every consumer dev boot.

  **Inline-diff chip visualization extended to MarkdownEditor + TiptapEditor.** Both now opt into `synthesizeWholeFieldRange` so chat-driven whole-field suggestions (`update_form_state`'s `set_value`) render the chip widget over the whole doc. The bridge tracks synthesized ids in a separate set: on Approve, _producer-supplied_ range hits the editor's `approveAiSuggestion` (text-node replace, surgical), while _synthesized_ whole-doc range delegates to the renderer's `onApplyWholeField` (`setContent(...)`) and clears the chip with a no-op reject. Without this split, approving a synthesized chip on richtext / markdown would do a plain-text replace and clobber all formatting; without the synthesis, the user saw no visualization at all on richtext / markdown.

## 3.4.0

### Minor Changes

- 071ca3a: fix(tiptap): mount `AiSuggestionExtension` + `useAiSuggestionBridge` in `CollabTextRenderer` and `MarkdownEditor`

  The cross-package AI suggestion plumbing (extension + host bridge to `<PendingSuggestionsContext>`) was wired into `TiptapEditor` (RichTextField) but missing from the other two Tiptap-backed editors:

  - `CollabTextRenderer` — the Tiptap-backed plain-text path used by `TextField` and `TextareaField` when collab is on.
  - `MarkdownEditor` — `MarkdownField`'s editor surface.

  `editor.commands.addAiSuggestion(...)` was a no-op on those fields. Now every Tiptap mount across the adapter participates in suggestion mode uniformly — same wire-shape ids, same Approve / Reject chip widgets, same dismissal lifecycle as the rich-text path.

  No host changes required — the bridge reads the field name from the props the renderers already accept.

## 3.3.3

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

## 3.3.2

### Patch Changes

- 5907520: fix(tiptap): bundle the markdown extension chain into dist

  `tiptap-markdown@^0.9`'s transitive `markdown-it-task-lists@2.1.1` is pure CJS (`module.exports = function...`) with no `default` export, which Vite's dev runtime can't synthesize — the `import x from 'markdown-it-task-lists'` inside tiptap-markdown's task-list node threw `does not provide an export named 'default'` at module init and silently killed the entire admin client bundle (no editors mounted, no console-visible error beyond a single `pageerror`). The previous workaround was for downstream consumers to wire `tiptap-markdown` + `markdown-it` + `markdown-it-task-lists` into their `optimizeDeps.include`.

  Now the chain is pre-bundled into `dist/markdownExtension.js` at `@pilotiq/tiptap` build time via esbuild (`scripts.bundle:markdown`). `MarkdownEditor.tsx` imports `{ Markdown }` from `../markdownExtension.js` instead of `'tiptap-markdown'` directly, so the CJS↔ESM interop lives inside our dist and consumers can drop the `optimizeDeps.include` workaround.

  `tiptap-markdown` moves from `peerDependencies` to `devDependencies` (consumers no longer need to install it; only used at build time).

## 3.3.1

### Patch Changes

- 894e82a: Fix Tiptap v3 SSR crash in `MarkdownEditor` under Vike. Sets `immediatelyRender: false` so the editor defers DOM construction until the first React effect; SSR renders an empty shell and hydration mounts the live editor.

## 3.3.0

### Minor Changes

- 850638f: `MarkdownField` swaps its textarea + manual-toolbar UI for a real WYSIWYG editor when `@pilotiq/tiptap` is installed. The editor parses markdown into a Tiptap document, exposes a rich-text toolbar (bold / italic / strike / link / heading / lists / blockquote / code / attach files), and serializes back to markdown on every change via `tiptap-markdown`. Editor / Source / Preview tabs let users switch between WYSIWYG, raw markdown, and a rendered preview.

  Collab is automatic — when a `<RecordCollabRoom>` is up-tree the editor binds to the shared `Y.XmlFragment` the same way `RichTextField` does. All peers see live edits; only the local serialize-to-markdown runs per peer.

  Wire format unchanged — a plain markdown string under the field name. Panels that don't install `@pilotiq/tiptap` keep the textarea fallback.

  New public API in pilotiq core:

  - `registerMarkdownEditor(C) / getMarkdownEditor()` + `MarkdownEditor / MarkdownEditorProps` types — re-exported from `@pilotiq/pilotiq/react`.

  New in `@pilotiq/tiptap`:

  - `MarkdownEditor` component, auto-registered by `registerTiptap()` / `tiptap()` plugin.
  - `tiptap-markdown@^0.9` peer dep.

## 3.2.1

### Patch Changes

- Phase D — drop the `_pt:` field-name prefix from `CollabTextRenderer`. The `Y.XmlFragment` now lives under the natural field name. The prefix was a temporary workaround during the Tiptap-backed text-collab swap to dodge a `Y.Text` / `Y.XmlFragment` constructor collision against the legacy form-binding allocation in `@pilotiq-pro/collab`.

  **Coordination requirement when using `@pilotiq-pro/collab`:** ship the matching `@pilotiq-pro/collab` Phase D update (drops the per-field `Y.Text` allocation) at the same time. Without it, the natural-key `Y.XmlFragment` collides with the legacy `Y.Text(name)` slot and the binding throws on mount. Standalone `@pilotiq/tiptap` consumers (no collab) are unaffected — there's no `Y.Text` allocation in play.

  Migration note: records that were edited under the pre-Phase-D code carry a stale `Y.Text(name)` in their IndexedDB / server-persisted ydoc state. The new code ignores it (no consumer touches that slot anymore); the persisted record value is unaffected, only per-keystroke CRDT history from active sessions during the migration is silently dropped.

## 3.2.0

### Minor Changes

- 353a228: feat(tiptap): collab-aware editor via pilotiq's collab registries

  `TiptapEditor` now plugs into `@pilotiq/pilotiq`'s `CollabRoomContext`
  and `CollabExtensionFactory` registry — when a `<RecordCollabRoom>` is
  mounted up-tree AND a plugin (e.g. `@pilotiq-pro/collab`) has registered
  extensions, the editor attaches to the room and uses the field's name as
  the `Y.XmlFragment` selector. Multiple `RichTextField`s on one record
  share ONE Y.Doc + ONE WebSocket connection — mirrors Tiptap's
  "Collaborative Fields" experiment.

  ### Behavior

  - **Remount on collab toggle.** A `CollabAwareTiptap` shell reads the
    room + factory and keys `ClientEditor` on `collabActive ? 'collab' :
'local'`. Tiptap can't swap `Collaboration` at runtime, so the keyed
    remount handles the room-attaches-after-mount case cleanly.
  - **History disabled when collab is active.** Yjs ships its own undo
    manager via `Collaboration`; StarterKit's `undoRedo` extension is
    disabled in the collab branch to avoid two stacks fighting.
  - **First-load seed.** After `provider.synced` fires, if the field's
    Y.XmlFragment is empty AND `defaultValue` looks like a Tiptap doc
    (`isTiptapShapedContent` guard), seed once via
    `editor.commands.setContent`. Subsequent joiners find the fragment
    populated and skip.
  - **Lexical-shape guard.** Existing rows holding old Lexical-format JSON
    (`{ root: {...} }`) no longer crash the editor — the same guard skips
    the parse so the editor mounts empty instead.
  - **Per-field opt-out.** `RichTextField.make('private').collab(false)`
    stamps `meta.collab === false`; the renderer skips the collab
    extensions even with a room mounted. (`.collab()` itself lives on the
    `Field` base in `@pilotiq/pilotiq`; this PR only wires the renderer.)

  ### Cosmetics

  - Field container `<div>` lost `gap-1` — collab cursors render flush
    against the editor frame now.

  ### Required peers (when collab is in use)

  `@pilotiq/tiptap` itself takes no new peer deps — the collab factory is
  opaque `unknown[]`. The pro consumer (`@pilotiq-pro/collab`) declares
  `@tiptap/extension-collaboration` + `@tiptap/extension-collaboration-caret`
  peers + ships the Yjs runtime.

## 3.1.1

### Patch Changes

- b14119e: Widen the `@pilotiq/pilotiq` peer dependency from `workspace:^` (publishes as `^<version>`) to the literal range `>=0.6.0 <1.0.0`.

  Under pre-1.0 caret semver, `^0.6.0` does not satisfy `0.7.0`, so every pilotiq minor bump was breaking the adapters' published peer range — which in turn made changesets propose a MAJOR bump on the adapters on every release, even when nothing in them changed. The literal range covers the whole `0.x` track, so the trap no longer fires.

## 3.1.0

### Minor Changes

- e1a79f6: feat(core+tiptap): cross-tree applier registry — Approve from anywhere

  Phase 8.5 of the AI UX polish plan. Adds an open-core registry that
  lets aggregate consumers — chat-sidebar pending-pills, bulk-action
  menus, future "AI inbox" surfaces — apply a `PendingSuggestion` to its
  target field without sharing the form's React tree.

  ```ts
  import { registerPendingSuggestionApplier } from "@pilotiq/pilotiq/react";

  // Renderer-side (auto-wired by FieldShell + Tiptap bridge):
  useEffect(
    () =>
      registerPendingSuggestionApplier(formId, fieldName, (suggestion) => {
        /* apply to this field's underlying input or editor */
      }),
    [formId, fieldName]
  );
  ```

  **Core (`@pilotiq/pilotiq`)**:

  - New module `react/PendingSuggestionApplierRegistry.ts` — module-level
    Map keyed by `(formId, fieldName)` (`formId` defaults to `'*'` for
    global form scope; form-scoped registrations always win over the
    wildcard for the same field). Exposes `registerPendingSuggestionApplier`
    (returns unregister fn for `useEffect` cleanup) and
    `getPendingSuggestionApplier`.
  - `PendingSuggestionsApi` extended with `approve(id)` and
    `approveAll(filter?)` — resolves the suggestion's `(formId,
fieldName)` against the registry, runs the applier, then dismisses.
    Falls through to plain `dismiss` when no applier is registered or
    the applier throws (so a busted applier doesn't strand entries).
    Default no-op context implements both as plain dismiss.
  - `<FieldShell>` auto-registers a generic applier on mount for every
    non-richtext, non-dotted-path field. Applier uses
    `useFieldState.setValue` for controlled (live) forms and a DOM
    fallback (React's internal value setter via
    `Object.getOwnPropertyDescriptor(proto, 'value').set`) for
    uncontrolled forms. Cleanup on unmount.

  **Tiptap (`@pilotiq/tiptap`)**:

  - `useAiSuggestionBridge` registers a richtext-aware applier that
    calls `editor.chain().focus().approveAiSuggestion(id).run()` —
    same path the inline chip click takes. The transaction listener
    already mirrors the editor-side dismissal back to context, so a
    pill-driven Approve flows: pill → applier → editor command →
    editor `onTransaction` → context `dismiss`.

  The registry is generic — not AI-specific. Future field-mutation
  extensions (form-recovery, undo stacks, bulk imports) can register
  through the same seam.

  Default no-op context still ships, so trees without a real provider
  mounted (e.g. headless tests, marketing-site previews) see no behavior
  change.

- 56a6f62: feat(core+tiptap): PendingSuggestionsContext seam + RichTextField AI bridge

  Adds a cross-package, plugin-fillable queue of suggested field-value
  changes that any field renderer can subscribe to. Open-core seam — core
  defines the shape + provider, plugins like `@pilotiq-pro/ai` ship the
  real implementation.

  ```ts
  import { usePendingSuggestionsForField } from "@pilotiq/pilotiq/react";

  const { list, dismiss } = usePendingSuggestionsForField("body");
  //      ↑ filtered to suggestions targeting this field+formId
  ```

  **`@pilotiq/pilotiq` exports** (`@pilotiq/pilotiq/react`):

  - `PendingSuggestion` — `{ id, fieldName, formId?, currentValue,
suggestedValue, source?, createdAt, meta? }`. The `meta` bag carries
    field-type-specific extras (e.g. `editorRange: { from, to }` for
    `richtext`).
  - `PendingSuggestionsApi` — `{ list, push, dismiss, dismissAll }`. Core
    ships a no-op default context so trees without a real provider never
    throw.
  - `PendingSuggestionsContext`, `usePendingSuggestions()`,
    `usePendingSuggestionsForField(name, formId?)` — the subscription
    surface.
  - `registerPendingSuggestionOverlay(C)` — mirrors
    `registerFieldLabelSlot()`. A plugin registers a single component
    (`{ suggestion, onApprove, onReject }` props) that `<FieldShell>`
    mounts below the input whenever a matching pending suggestion exists.
    Skipped on `richtext` fields (those render the diff inline via the
    Tiptap extension).

  **`@pilotiq/tiptap` `RichTextField` bridge**:

  The Tiptap renderer now subscribes to the queue and mirrors entries
  into its `AiSuggestionExtension`. Producers push a `PendingSuggestion`
  with `meta.editorRange = { from, to }` and a string `suggestedValue`;
  the bridge calls `editor.commands.addAiSuggestion(...)` so the inline
  diff + Approve / Reject chips appear. When the user clicks a chip,
  the editor command runs (mutating the doc on Approve, leaving it on
  Reject) and the bridge mirrors the removal back to the queue via
  `dismiss(id)` so other surfaces (chat-sidebar pill, FieldShell
  overlay registered by another plugin) clear in lock-step.

  The bridge is no-op when no provider is mounted — pilotiq core ships
  the default no-op context, so consumers without `@pilotiq-pro/ai` see
  no behavior change.

  Pure helpers + types are public; the bridge hook
  `useAiSuggestionBridge` is exported from `@pilotiq/tiptap` for advanced
  producers that want to drive their own editor instances.

- 4f8e03b: feat(tiptap): AiSuggestion extension — inline diff + Approve/Reject chips

  Always-on Tiptap extension that tracks AI-suggested edits as inline
  strikethrough decorations on the original range plus a chip widget at
  the range end carrying a preview of the replacement and per-hunk
  Approve / Reject buttons. Idle until the host calls
  `editor.commands.addAiSuggestion(...)`.

  ```ts
  editor.commands.addAiSuggestion({
    id: "seo-1",
    from: 12,
    to: 18,
    replacement: "better",
    source: { agentLabel: "SEO" },
  });
  // User clicks ✓ on the chip, or:
  editor.commands.approveAiSuggestion("seo-1");
  ```

  Command surface: `addAiSuggestion`, `addAiSuggestions`,
  `approveAiSuggestion(id)`, `rejectAiSuggestion(id)`,
  `approveAllAiSuggestions()`, `rejectAllAiSuggestions()`,
  `clearAiSuggestions()`. `approveAll` runs in highest-`from`-first order
  so earlier-in-doc replacements don't shift the positions of later
  suggestions.

  Suggestion ranges remap through every doc transaction; ranges that
  collapse past each other under user edits drop automatically. Plain-text
  replacement only in v1 (marks/structure are not carried).

  The package stays CSS-free — consumers wire styles against the
  documented class names: `pilotiq-ai-suggestion-original` (strikethrough
  on the original range), `pilotiq-ai-suggestion-chip` (widget root),
  `pilotiq-ai-suggestion-replacement` (suggested-text preview),
  `pilotiq-ai-suggestion-accept` / `pilotiq-ai-suggestion-reject`
  (buttons). Class prefix is configurable via the extension's
  `classPrefix` option.

  `onChange(suggestions)` callback fires whenever the suggestion list
  changes (after any add / approve / reject / clear, plus when a doc edit
  collapses a range). Lets consumers mirror state into a React context
  without polling editor state.

### Patch Changes

- Updated dependencies [b6dffde]
- Updated dependencies [8845b90]
- Updated dependencies [2c441b7]
- Updated dependencies [ae1450e]
- Updated dependencies [e1a79f6]
- Updated dependencies [df85886]
- Updated dependencies [56a6f62]
- Updated dependencies [e791f65]
- Updated dependencies [cce4f52]
- Updated dependencies [bd8229e]
- Updated dependencies [2f42dcd]
- Updated dependencies [425cf50]
- Updated dependencies [d7dbc80]
- Updated dependencies [8d92594]
  - @pilotiq/pilotiq@0.7.0

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
