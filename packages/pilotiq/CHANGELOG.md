# @pilotiq/pilotiq

## 0.8.1

### Patch Changes

- cc7a292: fix(pilotiq): wire `FormStateProvider` through `FormCollabBinding` (Phase F2)

  The F1 registry slot from 0.8.0 was inert — nothing in pilotiq core
  consumed `FormCollabBinding`. This patch makes the wiring actually
  fire: when a `<RecordCollabRoom>` is mounted up-tree AND a plugin
  (e.g. `@pilotiq-pro/collab@0.1`) registered a binding factory,
  `FormStateProvider` now:

  1. **Mounts on collab activity, not just `stateUrl`.** `FormRenderer`'s
     `useControlled` gate widens from `!!stateUrl` to
     `!!stateUrl || collabActive`. Forms with zero `.live()` fields but
     a record-edit collab room get the controlled path so every
     `useFieldState(name)` consumer (TextInput / Select / Toggle /
     Date / Slider / …) becomes synchronizable.

  2. **Constructs a binding on mount.** Calls the registered factory
     with `{ room, formId, initial }`. The binding owns the CRDT
     storage (typically a `Y.Map` on the room's shared ydoc) — pilotiq
     stays Yjs-free.

  3. **Lifts already-synced state.** On mount, `binding.get()`'s
     snapshot is shallow-merged on top of the SSR-rendered defaults,
     so subsequent joiners see the room's authoritative state.

  4. **Subscribes to remote changes.** `binding.subscribe(snapshot)`
     fires on every Yjs transaction (local + remote). Per-key
     `Object.is` short-circuit collapses local-write echoes into
     no-op renders; remote changes flow through `setValuesState` into
     the controlled inputs.

  5. **Proxies `setValue` through the binding.** Every controlled
     write fires `binding.set(name, value)` after the local React
     state update — UNLESS the field opted out via `Field.collab(false)`
     OR the name is a dotted path (Repeater / Builder row leaves stay
     local-only in v1; Phase F.5 tackles `Y.Array<Y.Map>` row identity).

  6. **Forwards server-derived values through the binding.** When a
     `.live()` POST response carries `values`, the derived fields
     (e.g. auto-`slug` from `title`) also write through the binding so
     every peer sees the derivation without each peer roundtripping the
     server (Q2 from the F-phase plan).

  ### Plan + decisions

  `pilotiq-pro/docs/plans/collab-form-fields.md` captures the full
  phase breakdown; the three open Q's resolved before this patch:

  - **Q1** — Idempotent client-side seed (`!ymap.has(k)` per key).
  - **Q2** — Server response writes to Y.Map (above).
  - **Q3** — `.collab(false)` suppresses both value sync AND presence
    (presence chips land in F4).

  ### Tested

  - All 2938 pilotiq tests pass.
  - Two-window smoke test (playground): typing in `title` / changing
    `status` in one window propagates to the other ~instantly.
    Tiptap fields (`body` / `content`) continue to sync via their own
    `Y.XmlFragment` selectors — non-Tiptap fields now share the same
    `Y.Doc` via the `form-data` Y.Map managed by `@pilotiq-pro/collab`'s
    `formCollabBinding` factory.

## 0.8.0

### Minor Changes

- 92b99a1: feat(pilotiq): collab open-core wiring + `Field.collab()` opt-out

  Three new module-singleton registries + a URL gate + a `.collab()` setter
  on the `Field` base — the open-core scaffolding pro collab plugins (e.g.
  `@pilotiq-pro/collab`) plug into. Pilotiq core stays Yjs-free; the
  registries hand opaque values back and forth.

  ### Registries (all exported from `@pilotiq/pilotiq/react`)

  - **`CollabRoomContext`** — React context exposing the active record's
    `{ ydoc, provider, user? }` triplet. `useCollabRoom()` returns `null`
    when no `<RecordCollabRoom>` is mounted up-tree.
  - **`registerCollabExtensions(factory)`** / **`getCollabExtensions()`** —
    module slot for a `CollabExtensionFactory` that returns Tiptap-style
    collab extensions for a given `{ ydoc, provider, fieldName, user }`.
    Pilotiq treats the returned values as opaque `unknown[]`; the consumer
    (typically `@pilotiq/tiptap`) spreads them into its editor.
  - **`registerRecordWrapper(C)`** / **`getRecordWrapper()`** — module
    slot for a record-scoped React wrapper. `AppShell` wraps every
    record-edit page's children with the registered wrapper, scoped to
    `{ resourceSlug, recordId }`.
  - **`registerFormCollabBinding(factory)`** / **`getFormCollabBinding()`** —
    module slot for a form-level CRDT binding (form-data `Y.Map` proxy);
    consumed by `FormStateProvider` in Phase F2.

  ### URL gate

  - **`RecordWrapperGate`** — internal component AppShell mounts around
    `props.children`. Parses the current path against `basePath`; when it
    matches a `/.../:id/edit` URL AND a wrapper is registered, wraps with
    `<Wrapper resourceSlug={slug} recordId={id}>{children}</Wrapper>`.
    Pass-through otherwise.
  - **`parseRecordEditUrl(currentPath, basePath)`** — pure helper exported
    alongside. Handles bare resource edit, cluster-prefixed edits, and
    nested-relation edits (slash-joined slug-path picks up the parent +
    relation chain so two URLs that target different records always
    produce different rooms downstream).

  ### `Field.collab(enabled = true)`

  New setter on the base class — every subclass (Text, Toggle, Select,
  Date, Slider, …, RichText) inherits. `.collab(false)` stamps
  `meta.collab === false`; the renderer is expected to skip the collab
  layer entirely (no value sync, no presence chip). Absent = inherit the
  panel default.

  ### Acceptance

  - Pilotiq builds + 2938 tests pass (12 new for `parseRecordEditUrl`).
  - Consumers (e.g. `@pilotiq-pro/collab`) wire collab through these
    registries; pilotiq core carries no Yjs / Tiptap dep.

- fd06c0d: feat(pilotiq): `Pilotiq.components({ nav, header, footer })` chrome slots

  Three new chrome-slot overrides let a panel swap an entire region of
  the default layout for a custom React component, alongside the
  existing render-hook splicing surface. Use slots when render hooks
  can't reach far enough — slots _replace_ a whole region; hooks
  _splice_ at named positions.

  ```ts
  import { Pilotiq } from "@pilotiq/pilotiq";
  import { MyCustomSidebar } from "./MyCustomSidebar.tsx";
  import { MyTopBar } from "./MyTopBar.tsx";
  import { MyFooter } from "./MyFooter.tsx";

  Pilotiq.make("admin").components({
    nav: MyCustomSidebar,
    header: MyTopBar,
    footer: MyFooter,
  });
  ```

  ### Slots

  - **`nav`** — replaces the default nav tree. In `SidebarLayout`
    that's the `<SidebarContent>` body (`<SidebarMenu>` tree); in
    `TopbarLayout` it's the `<nav>` cluster between the brand and
    the right-side controls. Surrounding chrome (branding header,
    render-hook splices, footer, sign-out menu) stays.
  - **`header`** — replaces the whole `<header>` chrome bar. In
    `SidebarLayout` that's the top bar with search / theme / bell /
    user menu; in `TopbarLayout` it's the whole top region including
    the brand cluster AND the nav (setting `header` makes the `nav`
    slot irrelevant there).
  - **`footer`** — mounts a `<footer>` element below the main content
    area in both layouts. Separate from the `panels::footer` render
    hook, which keeps firing INSIDE the content area for per-page
    trailing chrome.

  ### Prop contracts

  `nav` and `header` both receive `{ navigation, basePath, currentPath? }`
  (matching `NavComponentProps` / `HeaderComponentProps`) — same
  pre-grouped, pre-sorted nav tree the default renderers consume, so a
  custom topbar can render its own nav inline without juggling two
  slots. `footer` receives the minimal `{ basePath, currentPath? }`.

  ### Render-hook caveat for `header`

  Hooks rooted _inside_ the default header — `panels::topbar.start`,
  `panels::topbar.end`, `panels::user-menu.before`,
  `panels::user-menu.after` — do NOT fire when the header is replaced
  (the surrounding container is gone). Hooks rooted outside
  (`panels::sidebar.*`, `panels::footer`, `panels::sidebar.nav.*`) keep
  firing. Consumers rebuilding the header can mount
  `<RenderHookSlot name="…" hooks={panel.renderHooks} />` themselves
  from inside the custom component to preserve the splice contract for
  plugins.

  ### Chrome components exported for rebuilding headers

  `SearchTrigger`, `ThemeToggle`, `NotificationBell`,
  `RightSidebarTrigger`, and `UserMenu` are all re-exported from
  `@pilotiq/pilotiq/react` so a `header` slot consumer can drop the
  default controls back in à la carte rather than reimplementing every
  one. `HeaderComponentProps`, `FooterComponentProps`, and
  `isNavItemActive` are also re-exported alongside the existing
  `NavComponentProps` and `ComponentSlotRegistry`.

  ### Authoring `.tsx` inside the panel module

  The Vite plugin loads `app/Pilotiq/AdminPanel.ts` through `jiti` at
  boot to harvest `cfg.components` into the build-time
  `_components.ts` manifest. To make this play nicely with `.tsx`
  component files alongside the panel module, the jiti loader now
  enables JSX support (`jsx: { runtime: 'automatic' }`). Two gotchas to
  know:

  1. JSX support is enabled by default — no per-file `import React from 'react'`
     needed when authoring `.tsx` panel-adjacent files.
  2. jiti's resolver falls through `.js` → `.ts` but NOT `.js` → `.tsx`.
     The import in the panel module must use the literal `.tsx`
     extension: `import { MyCustomSidebar } from './MyCustomSidebar.tsx'`.
     `allowImportingTsExtensions: true` in your tsconfig keeps TS happy.

  See `docs/guide/component-slots.md` for the full guide.

## 0.7.2

### Patch Changes

- f18898f: Tighten auto-generated page-stub emissions so consumers' `tsc --noEmit` passes under `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`:

  - All 10 depth-1 and 4 depth-2 route stubs now emit `basePath: parts[0]!` (was `parts[0]`, typed as `string | undefined`, which Vike's `RouteSync.routeParams: Record<string, string>` rejects).
  - `_clusterOffset.ts` emits `slugs.includes(parts[1]!)` for the same reason.
  - `+Layout.tsx` passes `currentPath={currentPath ?? ''}` to `<AppShell>` so `exactOptionalPropertyTypes` accepts the prop.

  The non-null assertions are safe — each route guards on `parts.length` before reaching the return; `_clusterOffset` checks `parts.length < 2` before reading `parts[1]`. Pure emission tightening — no runtime behavior change.

## 0.7.1

### Patch Changes

- 229f290: Emit `parts[0]!` for the `basePath` field in every auto-generated route stub. Under consumers' `noUncheckedIndexedAccess` tsconfig, the previous `basePath: parts[0]` typed as `string | undefined`, which Vike's `RouteSync.routeParams: Record<string, string>` rejects. The non-null assertion is safe because each route guards on `parts.length` before reaching the return.

## 0.7.0

### Minor Changes

- b6dffde: feat(columns): Column.toggleable() user-visibility chrome

  `Column.toggleable()` lets users show / hide individual columns from a
  new toolbar **Columns** dropdown. Preference persists per-table to
  `localStorage` (key `pilotiq.table.<currentPath>.columns.<col>`), so the
  choice sticks across reloads + SPA navigations. Pass `{ initiallyHidden:
true }` to start the column off-screen — useful for technical / debug
  columns that the typical viewer doesn't need.

  ```ts
  Resource.table = (t) =>
    t.columns([
      TextColumn.make("name"),
      TextColumn.make("email").toggleable(),
      TextColumn.make("internalId").toggleable({ initiallyHidden: true }),
    ]);
  ```

  The dropdown trigger renders next to the existing Filters / Sort
  controls; non-toggleable columns always render and never appear in the
  dropdown. Hidden state is purely presentational — the column's data
  still loads from the server so sorts / filters that reference a hidden
  column keep working, and a re-toggle paints fresh values without a
  roundtrip. Toggling multiple columns in one open: the dropdown stays
  open between clicks (`closeOnClick={false}`).

  `visibleColumns = columns.filter(c => !hidden.has(c.name))` flows
  through the TableHead loop, body cells loop, per-group + footer summary
  rows, and the empty-state colSpan.

  The `toggleable` key is sparse on the wire — only set when a column
  opts in.

- 8845b90: feat(core): `@pilotiq/pilotiq/styles/file-upload.css` subpath

  `FileUploadField`'s image-cropping UI ships its own stylesheet via the
  `react-image-crop` package — a declared dep of `@pilotiq/pilotiq`.
  Consumers no longer need to declare `react-image-crop` themselves;
  import the new subpath from your app's Tailwind / global stylesheet:

  ```css
  @import "@pilotiq/pilotiq/styles/file-upload.css";
  ```

  The CSS file re-imports `react-image-crop/dist/ReactCrop.css`; the
  @import resolves through pilotiq's own `node_modules`, so the consumer
  side doesn't need a direct dep declaration. Mirrors the same pattern
  as other UI peer deps that pilotiq ships through subpaths.

  **Build side:** `pnpm build` now copies `src/styles/*.css` to
  `dist/styles/` via a new `copy-assets` script. Watch-mode (`pnpm dev`)
  runs the copy once at startup; per-CSS-edit re-copies aren't wired
  (unusual in dev — the CSS file is essentially static).

- 2c441b7: feat(core): `Form.inlineLabel()` / `Section.inlineLabel()` cascade

  Set `inlineLabel` once at the top of a form (or any section) and every
  descendant `Field` inherits it instead of repeating `.inlineLabel()`
  on each one. Per-field calls still win.

  ```ts
  Form.make()
    .inlineLabel()
    .schema([
      TextField.make("name"), // → inlineLabel: true
      TextField.make("email"), // → inlineLabel: true
      TextField.make("bio").inlineLabel(false), // explicit → label-above
      Section.make("Address")
        .inlineLabel(false)
        .schema([
          TextField.make("street"), // subtree resets → label-above
          TextField.make("city"), // → label-above
        ]),
    ]);
  ```

  **Resolution chain (most-specific wins):**

  1. Field-level `Field.inlineLabel(true|false)` — explicit setting on the
     field itself.
  2. Nearest ancestor `Section` with `.inlineLabel(true|false)` — overrides
     any outer container for its subtree.
  3. Outer `Form.inlineLabel(true|false)` — applies to the whole form.
  4. Default — label-above.

  **Implementation:**

  - `RenderContext.inlineLabelDefault?: boolean` — pushed by
    `resolveSchema.deriveChildContext` when a `Form` or `Section` calls
    `.inlineLabel(...)`. Children inherit until another container resets
    the flag.
  - `Field._inlineLabel` widened from `boolean` (default `false`) to
    `boolean | undefined`. `Field.buildMeta(ctx)` reads
    `this._inlineLabel ?? ctx.inlineLabelDefault` to decide whether to
    emit the meta key. No public-API change — the setter is unchanged
    (`inlineLabel(v = true)`).
  - New `Form.inlineLabel(v = true)` + `Form.getInlineLabel()` and the
    parallel `Section.inlineLabel(v = true)` + `Section.getInlineLabel()`.

  **No wire-shape change.** The on-the-wire `FieldMeta.inlineLabel` is
  still emitted with `true` only — the cascade is server-side.

  Closes the "Schema-wide `inlineLabel()` cascading default on
  Form/Section. Easy but no consumer ask." item from the field
  micro-additions audit (`docs/plans/admin-gap-audit.md`).

- ae1450e: feat(core): `Pilotiq.layoutProvider(C)` — plugin-mounted layout-root providers

  Adds an open-core registry where plugins can register React provider
  components that wrap the panel's `<AppShell>` children at the layout
  root. Removes the per-app requirement that consumers manually wrap
  their `pages/+Layout.tsx` to make plugin contexts available outside
  specific component slots.

  ```ts
  // In a plugin's register(panel) step:
  panel.layoutProvider(({ children, basePath }) => (
    <AiUiProvider panelPath={basePath}>{children}</AiUiProvider>
  ));

  // or bulk:
  panel.layoutProviders([Provider1, Provider2]);
  ```

  Provider components receive `{ children, basePath? }` props.
  Registration order is preserved — the first-registered provider sits
  OUTERMOST (closest to the layout root); the last sits INNERMOST
  (closest to the page tree). Use this when one provider depends on
  another being in scope: register the producer first.

  **Mirrors the `panel.rightPanel(...)` pattern** — Vite plugin
  harvests the live component refs into `_components.ts` (alongside
  `componentRegistry` + `rightPanelRegistry`) as `layoutProviderRegistry`,
  the auto-gen `+Layout.tsx` template threads it as
  `<AppShell layoutProviderRegistry={...}>`, and `AppShell` folds the
  registry around its rendered tree from last to first so the first
  provider ends up outermost. Empty / unset → no wrapping happens.

  The first consumer is `@pilotiq-pro/ai` (≥ next minor), which uses
  this to auto-mount `<AiUiProvider>` so the cross-package
  `PendingSuggestionsContext` queue and `<AiClientToolBindings>`
  handlers reach the form tree without a per-app `+Layout.tsx` edit.
  Apps on this version of pilotiq core can drop the manual `<AiUiProvider>`
  wrap they were carrying as a load-bearing requirement.

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

- df85886: feat(core): `PendingSuggestion.origin` for cross-surface filtering

  Widen the `PendingSuggestion` type with an optional `origin` block so
  aggregate UIs (pending-pills, overlays, etc.) can filter the shared
  panel-wide queue down to the surface that produced each entry. Backward
  compatible — existing producers that don't stamp `origin` keep working;
  consumers that don't read it see the same flat queue they always did.

  ```ts
  export interface PendingSuggestionOrigin {
    surface: "sidebar" | "popover" | "field-action";
    runId?: string;
    agentSlug?: string;
  }

  export interface PendingSuggestion {
    // …existing fields…
    origin?: PendingSuggestionOrigin;
  }
  ```

  Plugin packages (`@pilotiq-pro/ai`) stamp `origin` when they push from a
  known surface — the popover-chat scopes its `<PendingSuggestionsPill>`
  filter to `o => o?.runId === currentRunId` so it only surfaces its own
  session's output, even when sidebar-originated suggestions are still
  visible in the same panel-wide queue.

  No wire-shape break, no consumer code required.

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

- e791f65: feat(core): per-tab `canX` gating on `RelationTabs`

  The record sub-navigation strip (`[View, Edit, …managers]`) now runs the
  matching authorization predicate for each tab and drops entries the
  user can't reach. The routes always enforced — this is presentation
  polish so the chrome doesn't promise a link that 403s on click.

  **Gates evaluated per tab:**

  - `__view` → `R.canView(user, parentRecord)`
  - `__edit` → `R.canEdit(user, parentRecord)`
  - manager → `safeManagerPolicy(M, 'canViewAny', Related, user,
parentRecord)` (falls through to the related Resource's
    `canViewAny` when the manager hasn't overridden — same shape as
    everywhere else)

  Throwing predicate fails closed (tab hidden). Record-aware predicates
  short-circuit to "visible" when the record-load failed (so the route's
  own gate surfaces the 404/403, not a silent hide).

  **Empty-strip collapse:** if every gated tab drops, `buildRelationTabs`
  returns `undefined` and the strip is omitted entirely (consistent with
  the existing "no managers registered" branch). The depth-2
  `buildNestedRelationTabs` mirrors the shape — sibling nested manager
  tabs gate on `safeManagerPolicy(N, 'canViewAny', Related, user,
child1Record)`; the back-link `__view` stays unconditional since the
  user already passed `M.canViewAny` to reach that page; if all sibling
  tabs drop the depth-2 strip is omitted (back-link alone isn't useful
  sub-nav).

  **No public API change.** Tab gating runs inside the existing
  `buildRelationTabs` / `buildNestedRelationTabs` helpers — both private
  to `pageData.ts`. Their callers (`resourceEditData` / `resourceViewData`
  / relation data builders / nested relation data builders) already had
  `user` and `parentRecord` (or `child1`) in scope so threading is a
  one-line change at each site.

  7 tests added (6 depth-1 + 1 depth-2).

- cce4f52: feat(repeater): afterCreate / afterUpdate / afterDelete hooks for relationship-mode

  `Repeater.relationship(...)` gains three per-row lifecycle hooks that
  fire from `persistRelationshipRows` after each child operation:

  ```ts
  RepeaterField.make("attachments")
    .relationship("attachments")
    .schema([TextField.make("filename")])
    .afterCreate(async (record, ctx) => {
      /* ... */
    })
    .afterUpdate(async (record, ctx) => {
      /* ... */
    })
    .afterDelete(async (removed, ctx) => {
      if (ctx.mode === "hasMany" || ctx.mode === "morphMany") {
        // child record was physically deleted
      }
      // For M2M only the pivot row was detached; the child may still exist.
    });
  ```

  The handler receives the persisted child record and a `RepeaterRowContext`
  carrying:

  - `parent` — post-save parent record.
  - `parentId` — `parent[primaryKey]`.
  - `field` — the Repeater field's `name`.
  - `index` — 0-based row index in the submitted set; `-1` for `afterDelete`.
  - `mode` — the resolved `RepeaterRelationMode` (`'hasMany' | 'morphMany'
| 'belongsToMany' | 'morphToMany' | 'morphedByMany'`).

  Each setter is config-time guarded: calling on a Repeater that hasn't
  declared `relationship(...)` throws with a clear message (mirrors the
  existing `orderColumn() / pivotColumns()` guards). Throwing handlers
  propagate and stop the rest of the persist diff — earlier rows have
  already saved (v1 isn't transactional).

- bd8229e: feat(core): `Resource.pages().record` — custom record sub-pages auto-mounted on the sub-nav strip

  Declare custom pages that live under a single record. Each sub-page
  gets its own URL (`${resourceBase}/:id/${subPageSlug}`), its own tab in
  the record `RelationTabs` strip, receives the loaded record on
  `ctx.record`, and runs its own `canAccess(user, record)` gate.

  ```ts
  class ActivityPage extends Page {
    static override slug = "activity";
    static override label = "Activity";
    static override schema(ctx) {
      return [
        Heading.make(`Activity for ${(ctx.record as { name?: string })?.name}`),
      ];
    }
    // Optional record-aware gate.
    static override async canAccess(user, record) {
      return (
        (record as { ownerId: string })?.ownerId ===
        (user as { id: string })?.id
      );
    }
  }

  class UserResource extends Resource {
    static override slug = "users";
    static override pages() {
      return {
        record: {
          activity: ActivityPage,
        },
      };
    }
  }
  ```

  **Wiring:**

  - `ResourcePages.record?: Record<string, typeof Page>` widening — keeps
    the four standard roles (`index / create / edit / view`) cleanly
    typed; the `record` slot signals "these are per-record sub-pages."
  - `Resource.getRecordPages()` accessor (sugar over
    `resolvePages().record ?? {}`).
  - `PageMode` widened with `'record'`.
  - `Page.canAccess(user, record?)` signature widened — second optional
    arg, back-compat with existing custom-page subclasses that wrote
    `canAccess(user)`.
  - Routes: `GET ${resourceBase}/:id/${subPageSlug}` per registered
    sub-page. The Vike `relation-list` route + `dispatchPageData` share
    the URL slot — relation managers tried first, record sub-pages
    second. Boot validation prevents slug collisions.
  - New `resourceRecordPageData(pilotiq, slug, recordId, subPageSlug,
req)` builder mirrors `resourceViewData`'s shape.
  - `RelationTabs` strip inserts a tab per sub-page between `__edit` and
    the managers, gated on `SubPage.canAccess(user, record)`. Strip now
    also mounts when ONLY sub-pages exist (no relation managers needed).

  **Boot validation:**

  Sub-page slugs must match `[A-Za-z0-9_-]+` and must not collide with:

  - Reserved relation-manager tokens (`edit`, `delete`, `restore`,
    `force-delete`, `_form`, `_action`, `_search`, `_uploads`,
    `_attach`, `_detach`, `_bulk-detach`).
  - Any of the resource's relation-manager `relationship` slugs.

  Boot fails with a clear error message — silent 404 at request time is
  much harder to debug than a config-time throw.

  **v1 limits:** depth-1 only (sub-pages live under `Resource`, not
  under `RelationManager`); no automatic sidebar surface (sub-pages are
  per-record); no tab badges on record sub-pages.

  Plan + guide: `docs/plans/resource-record-sub-pages.md`,
  `docs/guide/record-sub-pages.md`.

- 2f42dcd: feat(columns): SelectColumn.options(record => …) per-row resolver

  `SelectColumn.options()` now accepts a function form alongside the
  existing static `{ key: label }` / `[{ value, label }]` shapes. The
  resolver receives the raw record and may return a Promise; runs once
  per visible row in `loadTableRecords` (gated behind the existing
  `canEdit` hook so hidden cells skip the resolver cost).

  ```ts
  SelectColumn.make("assigneeId").options(async (row) => {
    const team = await Team.find(row.teamId);
    return team.members.map((m) => ({ value: String(m.id), label: m.name }));
  });
  ```

  The resolved per-row option list is stamped on `row._cellSelectOptions[col.name]`;
  the renderer's `<CellSelect>` reads it as `props.rowOptions` and falls
  back to the column's static `selectOptions` when unset. Resolvers run
  in parallel across columns within a row. A throwing resolver leaves
  the slot unset on that row only — others still stamp, and the cell
  falls back to the static fallback list so one bad row doesn't break
  the whole table.

- d7dbc80: feat(core): `TableGroup.scopeQueryByKey()` — click-a-group-heading-to-drill-in

  Click a banded group's heading to drill the table into just that group's
  rows. The banded layout disappears for that render, a "Drilled into
  <Label>: <Value>" chip mounts above the table with an × to clear, and
  the query has already been narrowed server-side via the registered scoper.

  ```ts
  Table.make()
    .groups([
      TableGroup.make("status")
        .label("Status")
        .scopeQueryByKey((q, key) => q.where("status", "=", key)),
    ])
    .defaultGroup("status");
  ```

  **Three new methods on `TableGroup`:**

  - `scopeQueryByKey(fn)` — query scoper applied when the user clicks a
    heading. Receives `(q, key)` and returns the narrowed query. **Default
    (no override):** exact-match `(q, key) => q.where(column, '=', key)`.
    Date groups (`.date()`) install a whole-day range default instead —
    `(q, key) => q.where(col, '>=', '${key} 00:00:00').where(col, '<=', '${key} 23:59:59')`.
    Auto-arms `.scopable(true)`.
  - `getKeyFromRecordUsing(fn)` — override the per-record bucket key
    resolver. Returned string round-trips through `?<prefix>groupKey=` and
    lands as the second arg of `scopeQueryByKey`. Default = raw column
    value cast to string (or the `YYYY-MM-DD` bucket when `.date()` is on).
    Auto-arms `.scopable(true)`.
  - `scopable(v = true)` — explicit opt-in toggle for the clickable
    heading affordance. Use `.scopable(false)` to opt back out after a
    setter has auto-armed it.

  **URL state:** dedicated `?groupKey=<value>` key, prefix-aware via
  `Table.queryStringIdentifier`. Pairs with `?group=<col>`. Clicking a
  heading resets `?page` to 1 server-side so drill-in always lands on the
  first page of the bucket. The × chip clears `?groupKey=` and restores
  the banded view.

  **Renderer:** group heading text wraps in a real `<a href>` when
  `scopable` is true (cmd-click / right-click "open in new tab" works);
  plain left-click SPA-navs via `useNavigate()`. The collapsible chevron
  (when `.collapsible()` is also set) stays separate so users can fold
  the group without drilling in.

  **Persistence:** `<prefix>groupKey` is excluded from
  `persistFiltersInSession`'s persisted slice (parallel to `<prefix>page`)
  — drill-in is page-state, not filter-state. Bare-URL visits return to
  the banded view; the user's last drill-in URL is shareable but not
  auto-restored on revisit.

  **Composition:**

  - Chains on top of filters / `TrashedFilter` / active tab query — runs
    after all of them via `ctx.groupScope` in the model adapter.
  - Suppresses per-group summaries (`groupSummaries`) for the drilled-in
    render; the global `tfoot` summary still computes over the visible
    bucket.
  - Composes with `queryStringIdentifier` — keys parse as
    `<id>_groupKey` alongside `<id>_group`.
  - Works on `RelationManager` tables — `modelRelationTableRecords`
    reads the same `ctx.groupScope`.

  **v1 limits:** one key at a time (multi-select drill-in deferred);
  drill-in URLs survive bookmarking but not session-persistence; date
  range default is whole-day (sub-day buckets need a custom scoper).

  Plan: `docs/plans/table-group-scope-query-by-key.md`.

- 8d92594: feat(wizard): nav-button customizers + URL-state persistence

  `Wizard.submitAction(a => …) / .nextAction(...) / .previousAction(...)`
  let consumers customize the chrome of the built-in nav buttons. The
  customizer receives a framework-built default `Action` (Submit / Next /
  Back) and returns a customized clone (or a fresh `Action` outright);
  chrome (label / icon / color / size / outlined / iconOnly / tooltip /
  disabled rules) carries through to the rendered button while click
  behavior stays hardwired to advance / recede / submit-form.

  `submitAction` is the opt-in case: by default the wizard renders a hint
  pointing at the surrounding form's Save button. Setting `submitAction`
  mounts a real `<button type="submit">` inside the wizard chrome on the
  final step, making the wizard self-contained — pair with
  `CreatePage.getFormActions(R) → []` to suppress the page-level Save when
  you don't want two submits on the same page.

  `Wizard.persistStepInQueryString(key='step' | true | false)` mirrors the
  active step to the URL as `?<key>=N` (1-based for human-friendly URLs)
  via `history.replaceState` — purely client-side state sync with no SSR
  re-fetch. URL wins over localStorage on initial mount so deep-linking
  to a specific step works. Multi-wizard pages should use distinct keys
  to avoid collisions on the same query string.

### Patch Changes

- 425cf50: fix(core): register field-owned AI appliers on every React-driven input

  Same hidden-input bug as `SelectField`, swept across nine more field
  types. Each of these renders a `<input type="hidden" name={name}>`
  mirror for native form submit but drives the visible widget from React
  state — `FieldShell`'s generic applier writes to the hidden input and
  dispatches `change`, but the widget has no listener wired to it, so AI
  Review-mode Approve (and any other `PendingSuggestionApplierRegistry`
  caller) silently no-ops.

  Fixed by registering a field-owned applier inside each component and
  adding the field's `fieldType` to the central
  `SELF_APPLIER_FIELD_TYPES` set in `FieldShell.tsx` (single source of
  truth — `FieldShell` skips its generic registration so the field's
  applier stays last-write-wins):

  - `ToggleFieldInput` — `'toggle'`; coerces to boolean
  - `SliderInput` — `'slider'`; coerces to number (clamps to `min` on NaN)
  - `ColorInput` — `'color'`; falls back to `#000000` for null/empty
  - `KeyValueInput` — `'keyValue'`; rebuilds rows from the suggestion
    object (preserves existing row IDs by index for input-focus stability)
  - `FileUploadInput` — `'fileUpload'`; routes through `toUrls()`;
    honors `multiple` (single-file persists `urls[0] ?? null`)
  - `TagsInput` — `'tagsInput'`; routes through the existing `toArray()`
    parser (tolerates `string[]`, JSON-encoded, single string)
  - `DateTimeInput` — `'dateTime'`; coerces null/empty to `''`
  - `RadioInput` — `'radio'`; coerces null to `''`
  - `CheckboxListInput` — `'checkboxList'`; routes through the local
    `toArray()` (also fixes a pre-existing latent corruption: per-option
    hidden mirrors share the `[name]` attribute, so the generic applier
    would have stamped every one with the same stringified value
    instead of replacing the array)

  All appliers follow the canonical `SelectFieldInput` shape:
  `useRef(fs)` to hold latest field-state across re-registrations,
  dotted-path skip (Repeater rows are inaccessible from outside the
  form's React tree), and a controlled/uncontrolled split that mirrors
  each component's existing `setValue` path.

  After this sweep, AI Review-mode Approve correctly updates the visible
  widget on every Filament-parity field type. Custom field renderers
  that drive their state from React still need to follow the same
  pattern — register inside the component, add `fieldType` to the
  shared set.

## 0.6.2

### Patch Changes

- 27a8472: Lazy-import `sanitize-html` so the client bundle no longer pulls PostCSS and its Node-built-in shims. Eliminates the `browser-external` console warnings (`fs`, `path`, `url`, `source-map-js`) that surfaced on apps using the `Markdown` / `Html` display primes or `TextColumn` rich-display. Sanitization still runs server-side at meta-build time; the wire shape is unchanged.

## 0.6.1

### Patch Changes

- 5c60418: Two SSR-safety fixes that surface in real apps but tests don't catch:

  - `<RightSidebarProvider>` no longer reads `localStorage` synchronously inside `useState(() => …)` initialisers — that produced a hydration mismatch every time a returning user reloaded with the panel previously open (server rendered the panel closed; client rehydrated it open). State now defaults to closed / fallback / default-width on the first render and rehydrates from `localStorage` in a post-mount `useEffect`. Standard SSR pattern; brief closed→open flash on reload is identical to first-visit behaviour.
  - `routes.ts` server-side image-resize uses a variable-string `await import(name)` for the optional `@rudderjs/image` peer dep instead of a literal `'@rudderjs/image' as string`. The literal form bypassed Vite's static import-analysis only for TypeScript compilation; the analyser still failed at transform time on host apps that didn't have the package installed. Mirrors the existing pattern in `notifications/database.ts` for `@rudderjs/orm`.

## 0.6.0

### Minor Changes

- 3b9d69c: Add `Column.beforeStateUpdated()` / `afterStateUpdated()` — async lifecycle hooks for editable cell columns (`TextInputColumn / ToggleColumn / SelectColumn`). `beforeStateUpdated((value, { record, user }) => …)` runs after validators pass and before the DB write — use for cross-cell invariants, audit-log writes that must precede the update, or async availability checks. `afterStateUpdated` mirrors the shape but fires only on a confirmed save — use for notifications, broadcasts, or follow-up writes. Throwing from either halts the PATCH with 422 and the message stamped under the reserved `_cell` error key in the response. Live on `Column` base (gated by `isEditable()`) so all editable subclasses inherit; serialization unchanged.
- e7f46a3: Add 8 header-actions render-hook slots — `panels::resource.pages.{list-records,create-record,edit-record,view-record}.header.actions.{before,after}`. Plugins (AI assistants, collab presence, workspace switchers, custom toolbar widgets) can now contribute action chips alongside the built-in `Create / View / Edit / Delete / Save` buttons on resource pages without forking page renderers. Contributions splice into the first top-level page heading's children; only `Action` / `ActionGroup` elements end up rendered (matches the existing heading-children filter). Drops silently when a custom page header lacks a `Heading` anchor — fall back to `panels::page.start` for toolbar-style mounts in that case.
- 546b7bb: Add `SlotComponent` schema element + `registerSlotComponents()` runtime registry — a generic escape hatch for plugin-contributed React components in any schema slot. Use cases: custom resource-page header chips (bookmark / env badge / region picker / etc.), custom toolbar widgets, sidebar contributions, anywhere `Action` / `ActionGroup` would otherwise live. The element ships only `{ component: string, props: Record<string, unknown> }` on the wire; the renderer looks up the registered component at mount time. Subpath `@pilotiq/pilotiq/slot-components` (parallel to `/widgets` and `/entries`) keeps registration off the Node-only boot path. Heading children, alert footer, empty-state footer, and table bulk-toolbar filters all widen to pass `slotComponent` alongside `action` / `actionGroup` so the same primitive works at every action-row site.
- badb132: Add `Step.beforeValidation()` / `afterValidation()` — async per-step hooks around the wizard validation gate. `beforeValidation((values, { record, user }) => …)` runs before validators (may mutate values in place; throw to halt); `afterValidation` runs after validators pass (cross-field invariants, computed-field stamps, side-effects on confirmed advance). Throwing returns 422 with the message stamped under the reserved `_step` error key. New `findWizardStep` helper exported alongside `findWizardStepFields` for callers that need the live Step instance (back-compat — the existing helper continues to return just the children).
- 4440ec4: Add `TextField.trim(v=true)` — strips leading and trailing whitespace from the submitted value before validation runs. Mirrors Laravel's `TrimStrings` middleware: server-side authority, so a tampered client still gets trimmed values. Composes with `stripCharacters()` (trim runs first, then stripping). Empty strings remain empty; non-string values pass through. Emit-only-when-set on the meta.

## 0.5.0

### Minor Changes

- a1c3e40: Add `FieldLabelSlotRegistry` — a generic plugin seam that lets external packages inject a ReactNode next to any field label. `registerFieldLabelSlot(Component)` stores the slot component; `getFieldLabelSlot()` reads it. Both exported from `@pilotiq/pilotiq/react`. `FieldShell` gains a `labelSlot?: ReactNode` prop; `SchemaRenderer.renderField` populates it when the field has `aiActions` + `_agentRunBase` on its meta. `tagFieldAiUrls(elements, agentBase)` (exported from `@pilotiq/pilotiq`) stamps `_agentRunBase` on every resolved field that opted into AI actions, called in `resourceEditData` after `applyRoleHooks`. Used by `@pilotiq-pro/ai` to render the ✦ quick-action button.

## 0.3.0

### Minor Changes

- 58232be: Add `Action.modalContentFooter([Element…])` — auxiliary Elements rendered between the modal body and the Cancel/Submit footer. Useful for an inline `Alert` summarising the consequence of the action, supplemental `Text` / `Heading`, or a secondary `Action` (e.g. a "Learn more" link) that sits alongside the primary submit. Mirrors `Section.afterHeader([Action…])`'s parallel-slot pattern; resolves through the standard schema walker so inner Action `.visible() / .disabled()` rules evaluate the same way as anywhere else. In sticky-footer mode the slot scrolls with the body; only the action row stays pinned. Closes the carved-off remainder of the Action modal chrome audit gap (every sibling setter in that group already shipped).
- 58232be: Add `Repeater.expandAction()` / `Repeater.expandAllAction()` / `Repeater.collapseAllAction()` (and the same trio on `Builder`) so consumers can override the per-row chevron and the bulk expand/collapse buttons that sit above collapsible rows. `RowButtonKind` widens from 7 → 10 slots (`'expand' | 'expandAll' | 'collapseAll'`); `BulkCollapseHeader` chrome renders above rows when either bulk action is configured, and `CollapseChevron` falls through to a per-row `expand` override when present. Closes audit gap #7 (Filament parity).
- 43428d6: Add 10 rich affordances to `TextField` (audit gap #3): `password()` / `revealable()` (eye-icon toggle for password fields), `copyable(message?)` (suffix click-to-copy + toast), `mask(pattern)` (keystroke formatter — `9` digit / `a` alpha / `*` any / literals passthrough), `stripCharacters(chars)` (strip listed chars before save — runs server-side in `coerceFormValues` AND client-side), `datalist([…])` (HTML5 native suggestions), `inputMode()` and `autocapitalize()` (HTML5 attrs for mobile virtual keyboards), `prefixAction(Action)` / `suffixAction(Action)` (clickable Action buttons inside the input shell — distinct from the passive `prefix() / suffix()` decorations; resolve through the standard schema walker so inner Action `.visible() / .disabled()` rules evaluate the same way as anywhere else). `FieldShell` widened with `before` / `after` ReactNode slots; new `useTextInputControls()` hook owns the reveal/copy/mask state in a `<TextFieldShell>` component to keep `renderField` hook-free. Closes audit gap #3.

## 0.2.0

### Minor Changes

- 2dedc56: Add optional `PilotiqPlugin.registerRoutes?(router, pilotiq)` hook so plugins can mount their own HTTP routes alongside the panel's. `registerPilotiqRoutes(router, pilotiq)` walks `pilotiq.getPlugins()` and invokes each plugin's `registerRoutes` after core routes finish registering, in plugin-registration order. Plugins that own only config mutations (right-sidebar contributions, field renderers, registry seeds) skip the hook; plugins that own routes (chat endpoints, presence, custom REST) implement it. Closes the two-step DX where consumers had to call a separate `aiPlugin.mount(router, panel)` after `registerPilotiqRoutes`.

## 0.1.0

### Minor Changes

- 8cea72c: Add `Resource.deferLoading` opt-in flag. When `true`, the SSR pass on a list page skips `Table.records()` entirely and paints a skeleton on first frame; the renderer fetches the real rows asynchronously from a new `GET {base}/{slug}/_table` JSON endpoint after mount. URL chrome (current sort / search / page / active filters) still mirrors on the SSR Table so the skeleton frame matches user-visible state. Useful when the resource's records query is slow enough that an initial blocking paint feels broken. Composes with `persistFiltersInSession` (bare-visit redirect happens first, then the redirected URL paints + defers). Guide: `docs/guide/defer-loading.md`.
- 786da6b: RelationManager learns morphToMany + morphedByMany — the `belongsToMany` pivot-mutation gate (attach / detach / sync via `relationAttach / Detach / BulkDetach`) now extends to both polymorphic many-to-many sides shipped in @rudderjs/orm v1.6, closing the M2M-polymorphic gate.
- 2f4c948: Add `Resource.persistFiltersInSession` opt-in flag. When `true`, the GET list handler stashes the active URL query slice (filters / `group` / `search` / `sort` / `perPage` — `page` and `tab` are excluded) on `req.session` under `pilotiq:filters:<basePath>:<slug>`, and 302-redirects bare visits (zero query params) back to the last-applied state. Restoring keeps the URL the source of truth so bookmarks / share-links / back-button stay honest. Duck-typed `req.session.get / put` (mirrors `notifications/flash.ts`) so it no-ops silently when `@rudderjs/session` isn't installed. v1 keys per resource only — all tabs of a resource share one filter slot. Guide: `docs/guide/filter-persistence.md`.
- 4bdae5d: Add `Table.queryStringIdentifier(id)` for namespacing a table's URL state. With an identifier set, reserved keys (search / sort / page / perPage / group) and filter names are read and written as `${id}_<key>` (e.g. `?orders_search=pizza&orders_sort=date:desc`) so multiple tables on the same page don't fight over `?search=`. Off by default — resource list pages have one `Table` per page and keep using bare keys. Composes cleanly with `Resource.deferLoading` (the deferred-fetch endpoint re-runs `loadTableRecords` which reads each table's own prefix) and with `Resource.persistFiltersInSession` (the writer drops both `page` and `<prefix>_page` from the persisted slice). Guide: `docs/guide/query-string-identifier.md`.
- e5cd3f1: Add explicit `TextColumn` subclass — symmetric with `BadgeColumn / IconColumn / BooleanColumn / ImageColumn`. `TextColumn.make(name)` is the canonical text-cell builder; `Column.make(name)` stays as an alias so existing list pages keep working unchanged. Both produce identical wire shape (default `columnType: 'text'`).
