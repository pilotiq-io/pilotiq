# @pilotiq/tiptap

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
