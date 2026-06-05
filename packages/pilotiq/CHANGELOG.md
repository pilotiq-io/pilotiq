# @pilotiq/pilotiq

## 0.30.2

### Patch Changes

- 2477708: Follow-up to the SPA 403 fix: read `x-rudder-original-url` from `req.headers` (the real `AppRequest` shape — a plain lowercased Record; the previous `header()` accessor probe never matched at runtime) and stamp `Content-Type: text/html` on the styled 403 page (it served as text/plain).

## 0.30.1

### Patch Changes

- a79b4cf: Three SPA-navigation/auth-UX fixes flushed out by role-gated panels:

  - **403/401 over Vike SPA nav no longer crashes the client router.** server-hono rewrites `/x/index.pageContext.json` onto the panel route; when a policy gate (or `Pilotiq.guard()`) short-circuited, the plaintext response failed Vike's Content-Type assert ("Something went wrong"). Pilotiq now detects pageContext fetches (the `x-rudder-original-url` header) and answers with Vike's abort envelope (`abortStatusCode` + `_abortCall`), so the client renders the app's error page with the right status.
  - **Direct-load 403s render a minimal styled page** instead of a bare `Forbidden` string.
  - **Fixed a guaranteed hydration mismatch on parameterized table URLs** (`?tab=…`, filters, sort): `SearchFormHiddenInputs` reads `window.location`, so SSR rendered no hidden inputs while hydration rendered them. It now renders nothing until after mount.

## 0.30.0

### Minor Changes

- b587450: Ship `@pilotiq/pilotiq/styles/theme.css` — the Tailwind v4 theme bridge every consumer needs: maps the panel's injected CSS variables (`--background`, `--sidebar`, …) into Tailwind theme tokens so component utility classes (`bg-background`, `border-border`, `bg-sidebar-accent`, …) resolve, seeds the Pilotiq-brand default values for first paint, and registers the `dark` custom variant the ThemeProvider toggles. Previously this ~115-line block lived only in the playground's CSS — fresh installs following the docs got structure with no colors (caught by the pilotiq-demo install-test). Import it after `tailwindcss` in your main CSS: `@import "@pilotiq/pilotiq/styles/theme.css";`

## 0.29.0

### Minor Changes

- 1ea2a7b: Register panel routes inside the `'web'` route group so the framework's group middleware (Session / Auth) runs in front of every panel request. Without this, apps using `@rudderjs/auth` never saw `req.user` on panel routes — `.user()` resolved null and `.guard()` 401'd logged-in browsers — and `persistFiltersInSession` silently no-oped (no `req.session`). Falls back to ungrouped registration on `@rudderjs/router` versions without `runWithGroup`.

## 0.28.0

### Minor Changes

- e39370a: Add `databaseThemeStorage` — ORM-agnostic theme persistence over any rudder ORM adapter's `query(table)` builder (native engine, Drizzle). Exported from `@pilotiq/pilotiq/plugins` alongside `prismaThemeStorage`; accepts the adapter directly or a lazy `() => app().make('db')` thunk. `load()`/`clear()` tolerate a missing `panelGlobal` table so `rudder migrate` can boot the app before the table exists. The themeEditor's implicit storage fallback now tries the `'db'` container binding when no `'prisma'` binding is present.

  Also hide two server-only dynamic imports from Vite's client import-analysis (variable specifier + `@vite-ignore`): `PilotiqServiceProvider`'s `@rudderjs/router` boot import and `schema/sanitize.ts`'s `sanitize-html` — both were being lazily discovered through the generated `_components.ts` client graph, causing a mid-session "new dependencies optimized" reload on first page load.

## 0.27.2

### Patch Changes

- 9407623: feat(pilotiq): browser tab titles for every admin page

  The auto-generated pages now emit a `+title.ts` (vike-react `title`, cascading
  to every `(pilotiq)/` route, evaluated on both SSR and SPA navigation). The
  document `<title>` reads a per-role title stamped server-side by the page-data
  builders, formatted as `Page · Brand`:

  - List → the resource label (`Articles`)
  - Create → `Create <singular>` (`Create Article`)
  - Edit → `Edit <record>` (`Edit Hello World`)
  - View → the record title (`Hello World`)
  - Global → the global label; custom / record sub-pages → the page label
  - Relation + nested-relation roles mirror these off the manager label / child title
  - Dashboard → the dashboard page label, or `Dashboard`

  Pages that don't stamp a title fall back to the breadcrumb chain, then a level-1
  heading, then the panel brand alone. No configuration required.

## 0.27.1

### Patch Changes

- 54a4290: docs(boost): add the `pilotiq-widgets`, `pilotiq-theme`, and `pilotiq-vite-plugin` AI skills

  Completes the Phase-B boost skill set under `boost/skills/` (consumed by
  `rudder boost:install`). Three new on-demand skills, each `SKILL.md` +
  deep-dive rule files, gated by `appliesTo: ['@pilotiq/pilotiq']`:

  - **pilotiq-widgets** — `StatsOverview` / `Stat` KPI cards, `TableWidget`,
    custom `View` components, and the server-data lifecycle (`serverData` /
    `lazy` / `.poll()`) + panel / page / resource placement.
  - **pilotiq-theme** — `.theme()` presets / base / accent / chart palette /
    radius / fonts, raw `cssVariables`, OKLCH brand defaults, and the
    `themeEditor()` plugin (DB-persisted overrides).
  - **pilotiq-vite-plugin** — `pilotiq()` plugin wiring, `optimizeDeps.exclude`,
    Tailwind `@source`, generated Vike pages + `_components.ts`, and the
    client-safe-panel / SPA-routing pitfalls.

  Guidance only — no runtime/API changes.

## 0.27.0

### Minor Changes

- ab9fd3e: feat(pilotiq): responsive tables — table on desktop, card-per-row on mobile

  List tables can now collapse to one card per row on small screens instead
  of forcing a horizontal scroll, with the card content built automatically
  from the columns.

  - **`Table.stackOnMobile(breakpoint = 'md')`** — opt-in. Renders the classic
    table at/above the breakpoint and one card per row below it. Distinct from
    `cards()` (cards at every breakpoint). Desktop is unchanged.
  - **Auto-card** — `cards()` / `stackOnMobile()` no longer require a
    `cardSchema`. Without one, each card is built from the columns + the
    resource's record-identity attributes: optional image, the title as a
    heading, optional description, then the remaining columns as muted
    `Label · value` lines (reusing each row's formatted cell values).
  - **New `Resource.recordImageAttribute` / `recordDescriptionAttribute`**
    statics (mirror `recordTitleAttribute`); the image falls back to the first
    `ImageColumn` when unset.
  - **`cardSchema` widened to `(record, auto, ctx)`** — return `[...auto, extra]`
    to extend the auto-card, or ignore `auto` to fully replace it. Single-arg
    handlers still replace (back-compatible). Cards mode without a schema no
    longer throws.
  - **`Column.visibleFrom(bp)` / `Column.hiddenFrom(bp)`** — per-column
    responsive visibility (`sm | md | lg | xl | 2xl`, mutually exclusive).
    Applies to the desktop table cell and the mobile card (a column visible
    only at/above the stack breakpoint is dropped from the card). Works on a
    plain table too.

  Guide: `docs/guide/card-listing.md`.

## 0.26.0

### Minor Changes

- 8d7cf09: feat(pilotiq): `Pilotiq.locale()` for deterministic date/number formatting + fix row actions & date cells under dev module-duplication

  **Fix — row actions and date cells silently broke after a dev HMR re-boot.**
  `dispatchTable`'s per-row stamping pass was gated behind `instanceof Column` / `instanceof Action` / `instanceof SelectColumn` (and `Table.getColumns()` / `getFilters()` used `instanceof` too). Under Vite SSR module duplication — which happens after editing a panel/schema file in dev — the page's element classes resolve to a different module identity than the ones these files import, so `instanceof` returned false and the whole pass was skipped. Symptoms: rule-gated row actions (`.visible()` / `.disabled()`) never appeared (no `_visibleActions` stamp), and built-in `dateTime` / `since` cell formats weren't stamped into `_formatted`, so the client re-formatted dates in the browser locale → React hydration mismatch. All of these now match structurally on `getType()` (mirroring the earlier `findTables` fix). Production SSR was unaffected (single bundle, no duplication); this restores correct dev behavior.

  **Feature — `Pilotiq.locale(localeTag)`.** Sets the BCP-47 app locale used to format built-in `dateTime` / `money` / `numeric` column and infolist-entry formats. Formatting runs once server-side and is stamped into `_formatted`, so it must be deterministic — without an explicit locale, `Intl` / `toLocaleString` fell back to the Node host machine's locale, which differs between a dev box and a prod server (and from the user's browser). Pass the same locale your app's localization config uses, e.g. `Pilotiq.make('Admin').locale('en')`. A per-column `Column.money({ locale })` still wins over the panel default; unset leaves the previous host-default behavior.

  Also (table design):

  - **Smooth row reordering via `@dnd-kit`.** Reorderable tables (`Table.reorderable(col)`) now drag through `@dnd-kit` (`DndContext`/`SortableContext`/`useSortable`) instead of native HTML5 DnD — animated, keyboard-accessible (focus grip → Space → ↑/↓ → Space), grip-handle-only so cell links/inputs stay clickable. Optimistic reorder + POST-or-rollback persistence unchanged. `@dnd-kit/{core,sortable,modifiers,utilities}` added as dependencies; non-reorderable tables render exactly as before (no `DndContext`, zero overhead).
  - Column-header sort indicator replaced with a two-arrow `arrow-up-down` icon whose halves are independently colored: the half matching the active sort direction is highlighted, the rest stays muted (both muted when unsorted, lifting on header hover).
  - Column headers restyled to the quiet shadcn convention — `text-muted-foreground font-medium`, normal case (was `text-xs uppercase tracking-wider`).

  Also (page-header design):

  - `Heading` titles render at `font-semibold` (was `font-bold`); single-line header actions are vertically centered against the title.
  - View/record pages (`ViewPage`) now attach their `getActions()` (Edit / Delete / …) to the page heading — right-aligned next to the title, matching create/edit pages — instead of rendering them as full-width stacked buttons below it. `Heading.actions()` widened to accept any action-like element (Action / ActionGroup / SlotComponent), and `buildHeader` is form-agnostic (works without a form) and uses `getType()` rather than `instanceof`.

### Patch Changes

- dc5150f: feat(pilotiq): smooth row drag for Repeater & Builder via `@dnd-kit`

  `RepeaterField` and `BuilderField` rows now reorder through `@dnd-kit` (`DndContext`/`SortableContext`/`useSortable`) instead of the legacy native HTML5 drag-and-drop — animated row shifts, keyboard-accessible (focus grip → Space → ↑/↓ → Space), grip-handle-only so inner inputs / Tiptap fields stay usable. This matches the smooth-drag behavior already shipped for reorderable tables. Covers every layout: stacked, `grid(n)` (free-axis sortable), `table([cols])`, and `accordion()`; Builder keeps `reorderableWithButtons()` (button-only reorder, no grip drag) and the `addBetween` insert zones. The Up/Down keyboard buttons, per-row capability gates (`itemCanReorder`), optimistic local reorder, and `rowBinding.reorder` collab broadcast are all unchanged. The shared `SortableRows` / `SortableRowSlot` primitives back both fields; the old `useRowReorderDnd` hook + per-row drop-indicator are removed.

## 0.25.2

### Patch Changes

- 253c3bf: fix(pilotiq): stamp built-in column/entry formats server-side to fix date hydration mismatch

  Table cells (`formatCell`) and infolist entries (`renderEntry`) applied built-in `format` specs (`dateTime / since / money / numeric / limit / words`) at render time on **both** the server and the client. The locale-, timezone-, and clock-dependent kinds (`dateTime`, `since`, and `money`/`numeric` without an explicit locale) produced different output on the Node server (its default locale/tz) than in the browser (the user's), so React reported a hydration mismatch on date cells — e.g. server `Apr 30, 2026, 3:00 AM` vs client `30 באפר׳ 2026, 3:00`.

  The built-in format is now computed once, server-side, and stamped into `_formatted` — the same snapshot channel `formatStateUsing` already uses. The renderer prefers `_formatted` and paints it verbatim (no client re-format), so server and client always agree. `dispatchTable` stamps it during the per-row pass (gated to text-type cells; `formatStateUsing` still wins) and `Entry.toMeta` stamps it for text entries. The pure `applyColumnFormat` moved to `src/columnFormat.ts` so the server resolve paths don't import across the `react/` boundary; the old renderer import path is preserved via a re-export. Dates now render deterministically in the server's locale.

- 0014ef6: fix(pilotiq): resource tables no longer wedge empty after a dev HMR re-boot (`findTables` structural check)

  Editing a panel/schema file in dev (e.g. `app/Pilotiq/AdminPanel.ts`) triggers a framework re-boot that re-imports the schema modules. `findTables()` — the walker `loadTableRecords` uses to decide whether to run a resource's `records()` query — matched with `instanceof Table`. After a re-boot the page's `Table` element is an instance of a _different_ `Table` class identity than the one `dispatchTable` closed over, so `instanceof` returned false, `findTables` returned `[]`, and `loadTableRecords` early-returned **without issuing `paginate`** — the resource list rendered its empty-state and stayed wedged (no rows, no error, no self-recovery) until a full dev-server restart. The nav-badge `count` runs on a separate path, so the symptom was "issues `count`, never `paginate`"; when `paginate` did run it always returned full rows, confirming the ORM/adapter was fine.

  `findTables` now matches structurally on `getType() === 'table'` (mirroring `findForms` / `findActions`, which were converted for this exact Vite SSR module-duplication reason). Verified against the pilotiq playground: the pinned repro (single edit to `AdminPanel.ts` → poll the list) and a double-write + concurrent-flood both now render full rows on every request, warm and post-re-boot, including across re-imported model class identities. This closes the REOPEN #2 residual that the framework-side fixes (`@rudderjs/core` quiesce barrier, `@rudderjs/orm` model re-register) could not — the gate was pilotiq-side schema-walk behavior, not the framework re-boot lifecycle.

## 0.25.1

### Patch Changes

- 0950718: refactor(pilotiq): table "Columns" toggle trigger uses the shadcn `<Button>` styling

  Routes the toolbar Columns dropdown trigger through `cn(buttonVariants({ variant: 'outline' }))` so it matches the Filters trigger and the rest of the `h-8` / `rounded-lg` control row. (The active-filters "Clear all" stays a subtle text link by design.)

- 608d09b: fix(pilotiq): panel-module edits hot-reload in dev without a server restart

  The Vite plugin now re-imports the panel module through the dev server's SSR loader whenever a file changes and swaps the fresh instance into `PilotiqRegistry` by name. Because route handlers already re-resolve the panel from that registry via `livePanel()` at request time, edits to `app/Pilotiq/AdminPanel.ts` (and the resource/page schemas it imports — Vite invalidates the panel as their importer) now reflect on the next request.

  Previously the rudder provider booted once and never re-ran on dev edits, so the registry held the stale boot-time panel until a manual server restart — `livePanel()` (PRs #70/#71) fixed the render path but had nothing fresh to resolve. This closes that gap on the pilotiq side; the deeper "provider `boot()` should re-run on HMR" fix remains an upstream `@rudderjs/core` follow-up. The change is dev-only (`configureServer`) — no production-build impact.

- de73228: fix(pilotiq): preserve theme + speed up panel hot-reload

  Two refinements to the dev panel-HMR support added in the prior patch:

  - **Theme no longer resets on a panel edit.** Boot-time runtime state — the theme storage adapter and the DB-loaded overrides injected by the provider's `boot()` — is now carried onto the freshly hot-reloaded panel instance (new internal `Pilotiq.getThemeOverrides()`), so editing `AdminPanel.ts` keeps the active theme/colors.
  - **Faster saves.** The dev watcher rebuilds both the client component manifest and the live registry from a single **incremental** `ssrLoadModule` import instead of the no-cache jiti re-import it used before — so each save only re-executes the modules that actually changed.

- 7d4343a: fix(pilotiq): wrap multi-column search in a `whereGroup` so it can't leak past surrounding scopes

  List search, relation-manager search, and global (Cmd+K) search built their LIKE chain as a bare `where(col0).orWhere(col1)…` and appended scopes/filters as separate `.where()` clauses. With an adapter that honours Laravel-parity `where`/`orWhere` precedence — `@rudderjs/orm-prisma` ≥2.0 — that compiles to `(scope AND col0 LIKE x) OR col1 LIKE x`, so a row matching the second-or-later searchable column would bypass the surrounding scope: trashed records (soft-delete `deletedAt IS NULL`), filtered-out rows, or — in a relation manager — another parent's rows would leak into search hits.

  The three search sites now route through a shared `applyColumnSearch(q, columns, needle)` helper that wraps the OR-chain in `q.whereGroup(…)` → `scope AND (col0 LIKE x OR col1 LIKE x OR …)`. This is correct and adapter-version-independent. `whereGroup` is optional on `ModelQuery`; when a builder doesn't implement it (bare drivers / test stubs) the helper falls back to the flat chain unchanged.

## 0.25.0

### Minor Changes

- a7c0ffd: feat(pilotiq): align form controls to the shadcn input/button spec + tighter default spacing

  Brings every text/control surface onto the shadcn component look for a more consistent, denser admin UI:

  - **Inputs / Select / Textarea / field inputs** (`Input`, `SelectTrigger`, `Textarea`, plus the `DateField` trigger, `ColorPicker` swatch, `TagsInput`, and the Tiptap text chrome) → `h-8`, `rounded-lg`, `px-2.5`, `ring-3` focus, no drop shadow — matching the shadcn.com control set. The standalone `<Input>` was previously `h-9`.
  - **Filters & Actions buttons** now use the shared shadcn button styling: the table toolbar's Filters triggers render via `buttonVariants({ variant: 'outline' })` (wrapped in `cn()` so `tailwind-merge` keeps the outline border), and `actionButtonClass` emits the `<Button>` chrome (`rounded-lg`, focus ring, `active:translate-y-px`, `h-8`/`h-7`/`h-9` sizes) while keeping the richer Action color palette (primary/destructive/success/warning/info + outlined).
  - **Toolbar consistency**: the group-by / sort pickers drop `size="sm"` so they render at the default `h-8`, matching the search input.
  - **Default spacing** density tightened — the default `vega` preset now resolves `--spacing` to `0.25rem` (Tailwind's stock unit) instead of `0.3rem`, so every `p-*`/`gap-*`/`m-*` tightens uniformly. Matches the theme-editor preview, which already used `0.25rem`.

  No public API changes.

- e9e7dbb: feat(pilotiq): sidebar layout options + palette-driven stat sparklines

  - `Pilotiq.layout('sidebar', opts?)` is now overloaded so the sidebar chrome options bind to the `'sidebar'` mode: `variant: 'sidebar' | 'floating' | 'inset'`, `collapsible: 'offcanvas' | 'icon' | 'none'`, `side: 'left' | 'right'` (defaults `inset` / `icon` / `left`). `.layout('topbar', {...})` is a compile error so sidebar-only config can't silently no-op under topbar. The sticky page header gains `border-b bg-background/95 backdrop-blur`; the `md:rounded-t-xl` float applies only to `variant: 'inset'`.
  - `StatsOverview` sparklines render as soft area-fills and default to the theme chart palette.

- 8e4dc9f: feat(pilotiq): simplify the panel topbar — search right, breadcrumb in the header, theme + notifications in the user menu

  The sticky header chrome is consolidated:

  - **Search** moves to the right cluster (sidebar layout); the left now holds just the sidebar toggle.
  - **Breadcrumb** is hoisted into the header next to the toggle (sidebar layout) and removed from the page body. Wired SSR-correctly — the auto-gen `+Layout` extracts the `breadcrumbs` element from `schemaData` and passes it to the header, so it paints on first load and updates on SPA nav. The topbar layout (and any custom header slot) keeps the breadcrumb in the body.
  - **Theme toggle** moves into the user dropdown as a row (stays open on click).
  - **Database notifications** fold into the user dropdown as a "Notifications" submenu carrying the full inbox list; an unread dot shows on the avatar. The standalone `<NotificationBell>` is retained for the `databaseNotificationsPosition('sidebar')` placement.

  New: `DropdownMenuSub` / `DropdownMenuSubTrigger` / `DropdownMenuSubContent` primitives, a shared `useNotifications()` hook + `NotificationList` component (extracted from `NotificationBell`), an exported `BreadcrumbsView`, and a `breadcrumb` prop on `AppShell` / `UserMenu`'s new optional `notifications` prop. No breaking public API.

### Patch Changes

- 184951e: refactor(pilotiq): route dialog / action-group / inline-create buttons through the shadcn `<Button>`

  The remaining hand-rolled `h-9` buttons that bypassed the shared component now use `<Button>`, so they pick up the shadcn chrome (`h-8`, `rounded-lg`, focus ring, active-press) and stay consistent with the rest of the panel: the confirm/cancel buttons in `ActionModalDialog` and `ConfirmActionDialog`, the confirm dialog inside `ActionGroup`, and the `SelectField` inline-create trigger/cancel/submit. Modal confirm CTAs keep their intentional **solid-red** styling (a className override on the default variant) rather than the soft inline `destructive` variant.

- ac7a567: fix(pilotiq): resolve the live panel in the reactive form POST endpoints too — dev edits reflect without a restart

  Follow-up to the SSR/render-data `livePanel()` fix. The four interactive form builders (`formStateData`, `formWizardData`, `formCreateOptionData`, `mentionResolveData`) still passed their registration-time `Pilotiq` closure straight through, so editing a `live()` field's `options(fn)`, an `afterStateUpdated` hook, a wizard step's validators, an inline-create form, or a mention resolver reflected on the initial SSR render but not on the subsequent partial-resolve / step-validate / create-option / mention roundtrip until a server restart. Each now re-resolves via `livePanel()` at request time, matching the chrome and render-data builders.

## 0.24.3

### Patch Changes

- 02d5793: fix(pilotiq): panel routes resolve the live panel at request time — dev edits reflect without a server restart

  Panel route handlers closed over the `Pilotiq` instance captured when their routes were registered. In dev, editing the panel module (or a resource/page schema it imports) re-registers a fresh panel in `PilotiqRegistry`, but those already-registered handler closures kept pointing at the stale instance — so SSR-rendered chrome and schema lagged a reload behind (the panel only updated after editing some _other_ watched file, or a restart).

  The render-data layer now re-resolves the panel from `PilotiqRegistry` by name at request time, via a new `livePanel()` helper, applied at the top of `panelInfo` (chrome) and every render-data builder (`resourcePages`, `misc`, `relationPages`). This mirrors what `dispatchPageData()` already did for the client-nav path; the SSR route path was the only outlier. `livePanel()` falls back to the passed instance when the registry has no entry (tests, teardown), so non-dev behavior is unchanged.

- 539c87a: feat(pilotiq): ship `pilotiq-actions` boost skill — Phase B residual #1

  First of the four still-open Phase B skill candidates. `SKILL.md` declares `appliesTo: ['@pilotiq/pilotiq']` so `@rudderjs/boost`'s `boost:install` writes it under `.ai/skills/` only when the consumer has `@pilotiq/pilotiq` installed. Trigger scopes to specific action-authoring contexts — adding header/row/bulk buttons, wiring a modal-form action, customizing per-row visibility, reaching for a built-in factory.

  Three rule files under `boost/skills/pilotiq-actions/rules/`:

  - **`dispatch-modes.md`** — 4 mutually-exclusive modes (`href` / `method` / `handler` / `submit`), modal-form as a flavor of handler, return shape, `ctx` shape, 12 modal chrome setters, `.confirm()` + `.formField()` interactions.
  - **`visibility-and-authorization.md`** — 4 conditional setters (`visible / hidden / disabled / authorize`), `ActionVisibilityContext`, fail-closed semantics (opposite of layout-visible), per-row gating cost model, composing with Resource policies.
  - **`factories.md`** — 25 pre-built factories (`create / edit / view / delete / replicate / restore / forceDelete / markAsRead`, bulk variants, `import / export`, relation\* variants including M2M `attach / detach`), `ReplicateOptions` with `getCreatedNotificationTitle / getRedirectUrl` callbacks, when to skip factories for compound flows.

  Mirrors the shape established by `pilotiq-resource` / `pilotiq-fields` / `pilotiq-relations` / `pilotiq-tiptap-blocks`.

  Remaining Phase B residuals (lower priority — `guidelines.md` already covers most of what they'd add): `pilotiq-widgets`, `pilotiq-theme`, `pilotiq-vite-plugin`.

## 0.24.2

### Patch Changes

- 28fbd5f: feat(pilotiq): ship `boost/guidelines.md` for `@rudderjs/boost` discovery

  Consumer Rudder apps with `@rudderjs/boost` installed now pick up `@pilotiq/pilotiq` AI coding guidelines automatically. Running `rudder boost:install` in the consumer writes the contents to `.ai/guidelines/pilotiq.md`, and the per-agent config files (`CLAUDE.md` / `.cursorrules` / `AGENTS.md` / etc.) include them in the concatenated guideline body.

  The guidelines cover Resource definition (with `static model` auto-fill), folder-per-resource layout, the form-field catalog + common setters, layout primitives (Section / Tabs / Group / Wizard / Split / Fieldset), tables (columns + filters + groups + actions + reorder), Action with the four dispatch modes and modal-form variant, Page base classes (`ListPage` / `CreatePage` / `EditPage` / `ViewPage`) with override hooks, authorization via `Pilotiq.user()` + `can*` statics, Globals, Relations (`RelationManager` + `Repeater.relationship()`), reactive fields, theming, common pitfalls, and the key import surface.

  Phase A of the boost-producer rollout — skills (`boost/skills/<name>/SKILL.md`) follow in subsequent releases. Adapter packages (`@pilotiq/tiptap` / `@pilotiq/codemirror` / `@pilotiq/recharts`) ship their own guidelines + `appliesTo`-gated skills separately.

- e36d65c: feat(pilotiq): ship boost skills — pilotiq-resource, pilotiq-fields, pilotiq-relations

  Phase B of the boost-producer rollout. Adds three task-specific skill modules under `packages/pilotiq/boost/skills/`:

  - **pilotiq-resource** — `SKILL.md` + 3 rules: defining-resources, page-overrides, authorization
  - **pilotiq-fields** — `SKILL.md` + 3 rules: field-catalog (24 field types), validation (built-ins + `unique` + `distinct`), reactive-fields (`live` + `afterStateUpdated` + `$get`/`$set`)
  - **pilotiq-relations** — `SKILL.md` + 2 rules: relation-managers (hasMany / morph / M2M), repeater-relationship (`Repeater.relationship` + `Builder.relationship`)

  Each SKILL.md declares `appliesTo: ['@pilotiq/pilotiq']` so `@rudderjs/boost`'s `boost:install` only writes them to `.ai/skills/` when the consumer has `@pilotiq/pilotiq` installed. Triggers are scoped to specific work contexts — defining a Resource, adding a form field, wiring a relation — so AI agents load the deeper rule files on-demand rather than always-on.

  Phase C (adapter packages — `@pilotiq/tiptap` / `@pilotiq/codemirror` / `@pilotiq/recharts`) and the remaining four skill candidates (pilotiq-actions, pilotiq-widgets, pilotiq-theme, pilotiq-vite-plugin) follow in subsequent releases.

- 6d2ac13: chore: slim published tarballs to `dist` + `boost` + `CHANGELOG.md`

  All four packages now declare `"files": ["dist", "boost", "CHANGELOG.md"]` so npm pack only ships the compiled output, the `@rudderjs/boost` guidelines + skills tree, and the changelog. Previously `@pilotiq/pilotiq` shipped its full `src/`, `CLAUDE.md`, `.turbo/`, and test files; the three adapters shipped `src/` deliberately but no longer need to.

  - **`@pilotiq/pilotiq`** — 2.1 MB → 1.3 MB (~38% smaller). Drops `src/**`, `CLAUDE.md`, `.turbo/` from the tarball.
  - **`@pilotiq/tiptap` / `@pilotiq/codemirror` / `@pilotiq/recharts`** — drop `src/**` from the tarball.

  No API impact. Consumer Tailwind `@source` rules that previously scanned `node_modules/@pilotiq/*/src` should re-point at `node_modules/@pilotiq/*/dist` (Tailwind scans `.js` just fine). Source maps in `dist/` still reference `../src/*.ts` paths that are no longer in the tarball — sourcemap navigation inside `node_modules` won't resolve to TS, but stack traces still line up.

## 0.24.1

### Patch Changes

- 0002c59: feat(pilotiq): warn once per Resource that declares `relations()` without a static model

  `registerRelationRoutes` falls back to `'hasMany'` as the safe default when `R.model` is missing during late binding — which is correct for the framework but masks misconfiguration. M2M (`belongsToMany` / `morphToMany` / `morphedByMany`) and polymorphic (`morphMany` / `morphTo`) relations silently misbehave with the fallback.

  The warning fires once per offending Resource (deduped via a module-level `Set<string>`) on first route registration:

  ```
  [@pilotiq/pilotiq] PostsResource: declares relations() without a static model — every relation
  will default to 'hasMany'. M2M (belongsToMany / morphToMany / morphedByMany) and polymorphic
  (morphMany / morphTo) relations will misbehave. Set 'static model = …' on the Resource to fix.
  ```

  Pure diagnostic — no behavior change for correctly-configured panels. Apps that were silently relying on the `hasMany` fallback get a clear pointer to the fix.

## 0.24.0

### Minor Changes

- 26dabc1: refactor(react): retire the local `useCollabSeed` shim — consume from `@rudderjs/sync/react` directly

  The local hook at `@pilotiq/pilotiq/react#useCollabSeed` was kept as a deprecation surface after the four in-tree adapters (`TiptapEditor`, `MarkdownEditor`, `CollabTextRenderer`, `CollabCodeMirrorEditor`) all migrated to the framework's typed `useCollabSeed` / `useCollabSeedText` from `@rudderjs/sync/react` (commits `223eb38` + `ef76978`). The shim's behavior was a strict subset of the framework hook; keeping it longer would just split the surface.

  External consumers that were importing `useCollabSeed` from `@pilotiq/pilotiq/react` should switch to `@rudderjs/sync/react`:

  ```ts
  // Before:
  import { useCollabSeed } from "@pilotiq/pilotiq/react";
  useCollabSeed(room, fragmentKey, (doc) => {
    const fragment = (doc as YDocShape).getXmlFragment(fragmentKey);
    if (fragment.length === 0 && defaultValue) {
      // …seed via your editor binding…
    }
  });

  // After:
  import {
    useCollabSeed,
    type CollabRoom as FrameworkCollabRoom,
  } from "@rudderjs/sync/react";
  useCollabSeed(
    room as unknown as FrameworkCollabRoom | null,
    fragmentKey,
    (_doc, fragment) => {
      if (fragment.length === 0 && defaultValue) {
        // …seed via your editor binding…
      }
    }
  );
  ```

  For `Y.Text`-shaped editors (CodeMirror / Monaco / plain `Y.Text` bindings), use `useCollabSeedText` (new in `@rudderjs/sync@1.3.0`) — same shape but the seed callback receives `(_doc, yText)` pre-resolved as `Y.Text`. See `@pilotiq/codemirror`'s `CollabCodeMirrorEditor` as a reference.

  The `CollabRoom.synced?: Promise<void>` field on `@pilotiq/pilotiq/react#CollabRoom` is unchanged and is still the bridge that lets `@pilotiq-pro/collab`'s `<RecordCollabRoom>` (or any other room provider) thread a first-sync gate into adapters.

## 0.23.1

### Patch Changes

- 8068822: fix(collab): `useCollabSeed` runs the seedFn for legacy rooms without `.synced`

  The Phase 6d migration (`useCollabSeed` consumes the modern `room.synced` Promise stamped by `@pilotiq-pro/collab@>=0.2`'s `<RecordCollabRoom>`) intentionally short-circuited rooms without `.synced` by setting `seeded=true` with no callback fired — the assumption was that legacy providers had already gated first-sync via `onProviderSynced` themselves. But that posture broke adapters that fully migrated TO `useCollabSeed` and stopped calling `onProviderSynced` directly: when the room owner ships a custom provider that doesn't stamp `.synced`, the editor's empty `Y.XmlFragment` never picked up the SSR-rendered `defaultValue`, and the editor's mount-time `onChange('')` then clobbered the hidden FormData input that holds the server-loaded value.

  Fix: in the no-`.synced` branch, run the seedFn immediately (wrapped in `ydoc.transact(..., 'pilotiq-collab-seed')` when possible, same as the synced path) before flipping `seeded=true` — treat "no Promise" as "already synced." Idempotent + best-effort: any throw from the seed callback is swallowed (the seed is allowed to fail when the share-type is unavailable, mirroring the synced path's `try/catch`).

  Doesn't fix the parallel pilotiq-pro `FormCollabBinding` regression where the binding seeds the form's Y.Map with empty strings (that's the failing `relationship-pk-switch.spec.ts` case — `RecordCollabRoom` stamps `.synced`, so this branch never runs there); fix lives at the binding layer.

## 0.23.0

### Minor Changes

- b87b2a5: fix(ai): scope inline-diff + chip suggestion appliers by surrounding form id

  Multi-form pages would route AI suggestions to whichever editor mounted last because both `useAiInlineDiff` and `useAiSuggestionBridge` hard-coded `formId: undefined` when registering their applier — so two editors sharing a field name across forms (e.g. a "summary" `RichTextField` in the main edit form + the same field in a Replicate modal) would race on `registerPendingSuggestionApplier(undefined, fieldName, …)` and the last `useEffect` would win.

  **`@pilotiq/pilotiq` (minor — new public API, additive)**

  - New `useFormId(): string | undefined` hook re-exported from `@pilotiq/pilotiq/react`. Reads the surrounding `FormRenderer`'s id from `FormIdContext` and normalizes the sentinel empty string to `undefined`. Adapter packages (Tiptap + future editor adapters) consume this to scope per-field registries by form.
  - `getPendingSuggestionApplier(undefined, fieldName)` now falls back to ANY matching scoped entry when no wildcard entry is registered. Closes the regression that would have followed from adapter scoping: editors now register under their form's id, so the wildcard slot is almost always empty — without the fallback, global producers (suggestions pushed without a `formId`) would silently fail to resolve. Scoped lookups + explicit wildcard registrations preserve their original precedence.

  **`@pilotiq/tiptap` (patch — internal hook wiring)**

  `useAiInlineDiff` and `useAiSuggestionBridge` now thread `useFormId()` into `registerPendingSuggestionApplier(formId, fieldName, applier)` and the effect's dep array. No public-surface change; the multi-form routing simply works now.

  Coverage: 9 new unit tests on `PendingSuggestionApplierRegistry` cover scoped lookup, scoped multi-form disambiguation, the global-producer fallback, precedence (wildcard wins over scoped for undefined lookups when both exist; scoped wins for explicit lookups), unregister cleanup, and re-register identity guard.

## 0.22.0

### Minor Changes

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

- bf429a1: refactor(theme): decouple theme override persistence behind a `ThemeStorageAdapter`

  `PilotiqServiceProvider` and the theme editor's PUT/DELETE routes used to hard-code Prisma — `app.make('prisma') as any` + `prisma.panelGlobal.{findUnique,upsert,delete}` — which broke the ORM-agnostic story (`@rudderjs/orm` works fine on Drizzle) and put the only non-test `as any` in the codebase in a hot path. The bare `catch {}` around the boot-time load also swallowed real misconfiguration (misnamed `panelGlobal` schema, Prisma client not connecting) as silently as it swallowed "no overrides persisted yet".

  This release introduces a `ThemeStorageAdapter` interface — `{ load(), save(overrides), clear() }` — and a `prismaThemeStorage(prisma, { slug })` factory. Pass an explicit adapter via the new `themeEditor({ storage })` option:

  ```ts
  import { themeEditor, prismaThemeStorage } from "@pilotiq/pilotiq/plugins";

  Pilotiq.make("Admin").use(
    themeEditor({
      storage: prismaThemeStorage(prisma, { slug: "admin__theme" }),
    })
  );
  ```

  Apps on Drizzle, a KV store, or filesystem JSON can implement the three methods themselves; the panel only cares about the adapter shape.

  **Back-compat / deprecation.** Calling `themeEditor()` without `storage` still works for one minor cycle: the service provider falls back to the implicit Prisma adapter at boot, logs a one-time deprecation warning naming the panel, and proceeds as before. The fallback branch will be removed in a future minor — pass `storage` explicitly to silence the warning. Explicit adapters propagate errors normally; the implicit fallback continues to swallow connection / schema errors for back-compat.

  Tests: new `theme/storage.test.ts` covers the Prisma adapter round-trip (load / save / clear + P2025 "row not found" tolerance + non-P2025 error propagation) and `plugins/themeEditor.test.ts` confirms the option wires the adapter onto the panel.

### Patch Changes

- 67aadbd: fix(security): enforce `Pilotiq.guard()` on every panel route via `router.group()`

  `Pilotiq.guard()` is documented as the 401 layer, but until now the guard callback was only consulted on the `_uploads` route. Every other panel route — list / view / create / edit / delete / `_action` / `_widget` / `_form` / `_table` / `_search`, relation managers, custom pages, theme editor — relied on `cfg.user` returning null + each Resource's `canX(user, …)` defaulting to true.

  An app that wired `Pilotiq.guard(req => Auth.check())` but shipped any Resource without `canAccess` overrides could expose an unauthenticated, fully-readable admin panel. The intent was documented; the wiring was not there.

  Fix: wrap every core panel route registration in one `router.group({ middleware: [guardMiddleware] }, …)` call. The guard now runs in front of every handler. Removed the redundant inline guard inside `handleUploadRequest` — the group middleware fires first and the inline check would just double-fire. Plugin routes registered via `plugin.registerRoutes?.(router, pilotiq)` mount OUTSIDE the group; plugins own their own auth posture (public webhooks etc) and should consult `cfg.guard` themselves at handler entry if they want the panel guard.

  Regression coverage: new `src/routes/guard.test.ts` iterates `router.list()` across a panel touching every register branch (resources + relation managers + globals + custom pages + clusters + theme editor + database notifications) and asserts each route 401s on `guard(() => false)` and reaches its handler on `guard(() => true)`.

- f75aa7d: perf: bundle of hot-path wins (Phase 5 of the code-quality sweep)

  Four independent perf changes that share a release because they're each small and orthogonal. None of these were bottlenecks today; the cost rises around ~50 resources or ~10K imported rows.

  - **5a — Chunked `Action.import`.** `runImport` used to walk rows serially: 5–10ms per round-trip × 10K rows × 2 round-trips for upsert mode adds up to ~100s of pinned request time. Each row now processes through a chunked `Promise.all` (default `concurrency: 10`). Per-row order within a chunk is non-deterministic; row indices in `summary.errors` still match the original CSV/JSON position. Tunable via `Action.import({ concurrency })`.

  - **5b — Per-user navigation-badge TTL cache.** Every page render used to re-resolve every `R.navigationBadge()` / `G.navigationBadge()` / `C.navigationBadge()`. A panel with 20 resources each calling `Model.count()` for the badge was 20+ extra queries on every nav. Cache lives on the `Pilotiq` instance, keyed by `(ownerName, userIdentity)`, default TTL 30s. Configurable via `Pilotiq.navigationBadgeTtl(ms)` — pass `0` to disable, `null` to restore the default. User identity sniffs `user.id` (the 99% case for app-supplied users), falls back to JSON.stringify; anonymous requests share one slot.

  - **5c — Map-indexed slug lookup.** `cfg.resources.find(r => r.getSlug() === slug)` and its siblings were called 16+ times per request across the page-data builders. New `pilotiq.findResource(slug)` / `findGlobal(slug)` / `findPage(slug)` accessors build a lazy `Map<slug, Class>` on first call and invalidate when the matching builder method (`.resources([…])` / `.globals([…])` / `.pages([…])` / `.dashboard(P)` / `.profile(P)`) mutates the array. O(n) → O(1) per lookup; measurable around 100+ resources.

  - **5d — Parallel policy gates.** ~32 route handlers paired `await policyAccess(R, user)` with `await checkPolicy(() => R.canViewAny(user))` (or `canCreate` / `canEdit(user, undefined)` / `canView(user, undefined)`) serially. New `policyGate(owner, user, predicate)` helper composes both via `Promise.all`. Record-dependent predicates (e.g. `canEdit(user, record)` where `record` is loaded mid-handler) stay sequential — those calls weren't touched. The helper fail-closes on either branch throwing, matching the prior semantics.

  Coverage: new `Pilotiq.perf.test.ts` covers the 5a/5b/5c surfaces (chunking + index preservation, TTL hit/miss + invalidation paths, Map invalidation across all setter sites). 5d is exercised by the existing authorization / routes tests — the contract is unchanged.

  No public-surface changes beyond the three new opt-in accessors. Existing routes / callers keep working with their prior shape; the chunking + caching default-on behavior swaps in transparently.

- 15661ec: perf(orm): use `.first()` over `paginate(1, 1)` for single-row lookups

  Three internal callsites — `loadSingularRecord`, `findRecord`, and the relation `childBelongsToParent` IDOR check — were hand-rolling "first matching row" as `paginate(1, 1)` then reading `result.data[0]`. The rudder ORM (and most Laravel-style query builders) ship `.first()` for this case; `paginate(1, 1)` builds + executes a COUNT query plus the data query, where `.first()` is a single `LIMIT 1` SELECT.

  Added an optional `first?(): Promise<unknown | null>` to the structural `ModelQuery` shape (same pattern as `withTrashed?` / `whereGroup?` / `whereNull?`). Callsites use it when present, fall back to the existing `paginate(1, 1)` shape when absent — so test stubs and user-supplied `ModelLike` implementations don't have to update. The rudder `QueryBuilder` ships it; production paths get a ~half-RTT win on every record edit / view / Global page render / relation-edit IDOR check, with zero behaviour change.

  No public API change. Existing tests cover both branches.

## 0.21.0

### Minor Changes

- 349c1f3: fix(collab-text): split `name` (FormData/AI routing) from `fragmentKey` (collab Y fragment) on the plain-text collab renderer

  Audit catch from the same family as the `MarkdownEditor` fix in `@pilotiq/pilotiq@0.20.0` / `@pilotiq/tiptap@3.9.0`. The `CollabTextRenderer` (Tiptap-backed plain-text editor used by collab-enabled `TextField` / `TextareaField` / `MarkdownField`'s collab fallback) had the same single-prop / two-concerns shape:

  - `TextLikeInput.tsx → CollabTextField` and `MarkdownInput.tsx → MarkdownCollabInput` both overrode the renderer's `name` with the composite row-id fragment key — needed for `Y.XmlFragment` stability under reorders — but that override ALSO re-keyed AI suggestion routing (`useAiSuggestionBridge`), so the chip-widget surface on a plain `TextField` nested in a Repeater row would never receive AI suggestions addressed by the positional FormData name (`metadata.0.title`).

  Fix: `CollabTextRendererProps` now carries an optional `fragmentKey`. `CollabTextRenderer` uses `fragmentKey ?? name` for the collab factory `fieldName` + first-load `ydoc.getXmlFragment(...)` seed only; AI suggestion bridge + form integration stay on `name`. Both host wrappers pass `name={hiddenInputName}` (positional FormData path) and `fragmentKey={composite}` (row-id-anchored) when the two differ; top-level fields omit `fragmentKey` and keep today's behavior.

  Latent bug, fixed preemptively: AI tool calls on plain `TextField` nested in a Repeater / Builder row would silently fail to render their inline-diff chip — same root cause as the `MarkdownField` bug in `@pilotiq/tiptap@3.8.0` and below, just for the chip-widget surface instead of the inline-diff overlay.

  All 16 collab e2e tests + 4 AI surgical e2e tests pass against the change.

## 0.20.0

### Minor Changes

- cead688: fix(markdown): split `name` (FormData/AI routing) from `fragmentKey` (collab Y fragment) on the markdown editor

  `MarkdownEditorProps` previously had a single `name` prop that drove both the FormData hidden input + AI suggestion routing AND the `Y.XmlFragment` key. Inside a Repeater / Builder row, `MarkdownInput` overrode `name` with a row-id-anchored composite (`metadata.<rowId>.body`) so the Y fragment survived row reorders — but this also re-keyed the AI applier registry and `<AiSuggestionBanner>`, so tool calls that referenced the field by its dotted FormData name (`metadata.0.body`) never reached the row editor.

  Result: AI surgical / whole-field suggestions on a `MarkdownField` nested inside a Repeater row silently failed — the tool reported "queued for review" but no diff overlay appeared in the row.

  Fix: `MarkdownEditorProps` now carries a separate optional `fragmentKey` prop. The editor uses it for the collab Y fragment key (`ydoc.getXmlFragment(...)` + the collab factory's `fieldName`) but keeps `name` for everything else — AI suggestion routing, applier registry, hidden FormData input, inline-diff banner. Top-level fields omit `fragmentKey`; row leaves pass the composite as `fragmentKey` while leaving `name` as the dotted FormData path.

  `@pilotiq/tiptap`'s `MarkdownEditor` accepts the new prop and routes it correctly. `@pilotiq/pilotiq`'s `MarkdownInput` passes both props to the registered editor.

  Caveat: `RichTextField`'s `TiptapEditor` has the analogous single-`name` shape and would surface the same gap if nested in a Repeater. Not in scope for this change — no consumer currently nests `RichTextField` in a row. File a follow-up when it becomes a real path.

## 0.19.0

### Minor Changes

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

## 0.18.0

### Minor Changes

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

## 0.17.0

### Minor Changes

- 1559a62: CodeEditorField now binds to `y-codemirror.next` when a `<RecordCollabRoom>` is mounted up-tree (parallel to `@pilotiq/tiptap`'s collab plain-text path). Each `CodeEditorField` opens a doc-root `Y.Text` keyed by either the bare field name (top-level) or `${arrayName}.${rowId}.${fieldName}` (Repeater / Builder row leaves). Opt out per-field with `.collab(false)`.

  Adds optional peer deps `y-codemirror.next ^0.3` + `yjs ^13` on `@pilotiq/codemirror` (under `peerDependenciesMeta.optional` — panels without `@pilotiq-pro/collab` installed continue to work as before).

  Also re-exports `useRowCoords`, `RowCoordsContext`, `parseRowFieldPath`, and `ParsedRowFieldPath` from `@pilotiq/pilotiq/react` so adapter packages (codemirror today, others later) can compose row-field collab keys consistently.

  **Relationship-row code editors:** `y-codemirror.next` binds against `Y.Text`, not `Y.XmlFragment`. `@pilotiq-pro/collab`'s `rowArrayBinding.renameRow` rekeys both share types alongside one another (`applyDelta(toDelta())` for `Y.Text`, `child.clone()` for `Y.XmlFragment`), so on PK-switch (UUID → DB PK after first save) a row-leaf `CodeEditorField`'s text content carries over to the new composite key on peer B without falling back to the DB column. Trade-off is rename-by-recreate (fresh CRDT identity → discards concurrent-edit history on the renamed row's code-editor leaves), same posture as the `Y.XmlFragment` branch. Requires `@pilotiq-pro/collab` ≥ the patch that ships this rekey (`pilotiq-pro@5fae624`, 2026-05-17).

## 0.16.0

### Minor Changes

- 9965448: feat(react): apply relationship-row UUID → PK renames against the active form's collab binding on submit success

  Closes the client-side half of the PK-switch Phase B wire (`pilotiq-pro/docs/plans/repeater-relationship-pk-switch.md`). The previous changeset shipped server-side `relationshipRenames` emission; this one dispatches them against the form's collab binding so non-submitting peers converge on the DB-assigned PK without reloading.

  New optional `FormCollabBinding.renameRow?(arrayName, oldId, newId): void` contract on the binding interface — bindings that omit it silently skip the apply step (the documented pre-Phase-B posture; Phase A's submitter-side reconciler still cleans orphans on next mount). `@pilotiq-pro/collab@0.0.x` ships a matching forward to `Y.Map`-based rename-by-clone.

  Internally the wire is a per-`formId` module-level registry (`react/fields/relationshipRenameDispatch.ts`) — `FormStateProvider` registers a handler when the binding mounts; `FormRenderer`'s submit-success path calls `applyRelationshipRenames(formId, renames)` _before_ `markSubmitForReconcile + navigate` so the Yjs transact lands on the local doc while the binding is still mounted. StrictMode-safe cleanup (clears the slot only when the current handler matches).

  The submitter-only Phase A `repeaterReconcile.ts` reconciler stays in place — it composes with Phase B (no-ops on a freshly-renamed CRDT) and remains the fallback for bindings without `renameRow` plus the close-tab-mid-flush edge case.

- d492951: feat(repeater, builder): emit per-row UUID → PK renames from relationship-backed creates

  `Repeater.relationship` / `Builder.relationship` row creates now emit `{ field, old, new }` renames whenever the renderer-minted `__id` (typically a UUID) differs from the DB-assigned primary key. Renames are aggregated through `DispatchSuccess.relationshipRenames` (new field, defaulting to `[]`) and serialized into the form-submit JSON response under `relationshipRenames` when non-empty. The 303-redirect form-post path is unaffected (renames are a collab-only concern).

  Phase B groundwork for `pilotiq-pro/docs/plans/repeater-relationship-pk-switch.md` — a future `@pilotiq-pro/collab` adapter can subscribe to the JSON response and rename the row in the shared CRDT so non-submitting peers converge on the new PK without reloading. With no adapter registered, renames silently no-op (non-collab forms unaffected).

  New public type `RelationshipRename` re-exported from `@pilotiq/pilotiq`.

### Patch Changes

- 5880551: fix(repeater, builder): scope `draggable=true` to the grip, not the row container

  Row reorder previously broke when row contents hosted a contenteditable (e.g. a Tiptap-backed `MarkdownField` / `RichTextField` inside a Repeater or Builder row): a mousedown starting inside the editor was absorbed for text-selection and the row's drag never fired. The grip `<span>` now carries `draggable=true` + `onDragStart`; the row container keeps only the drop-target handlers (`onDragOver` / `onDrop` / `onDragEnd`). `setDragImage(rowEl, 0, 0)` preserves the full-row drag preview.

## 0.15.1

### Patch Changes

- 38e2fa6: `MarkdownField` instances inside `Repeater` / `Builder` rows now mount the registered WYSIWYG editor (e.g. `@pilotiq/tiptap`'s `MarkdownEditor`) instead of falling back to the legacy collab plain-text editor. Threads the row-id-anchored composite key (`${arrayName}.${rowId}.${fieldName}`) to the editor's collab factory via a new `collabKey` prop on the host, while keeping the original dotted `name` for hidden-input form submission. Brings WYSIWYG editing parity to row-leaf markdown fields with no change to the on-the-wire shape.

## 0.15.0

### Minor Changes

- 850638f: `MarkdownField` swaps its textarea + manual-toolbar UI for a real WYSIWYG editor when `@pilotiq/tiptap` is installed. The editor parses markdown into a Tiptap document, exposes a rich-text toolbar (bold / italic / strike / link / heading / lists / blockquote / code / attach files), and serializes back to markdown on every change via `tiptap-markdown`. Editor / Source / Preview tabs let users switch between WYSIWYG, raw markdown, and a rendered preview.

  Collab is automatic — when a `<RecordCollabRoom>` is up-tree the editor binds to the shared `Y.XmlFragment` the same way `RichTextField` does. All peers see live edits; only the local serialize-to-markdown runs per peer.

  Wire format unchanged — a plain markdown string under the field name. Panels that don't install `@pilotiq/tiptap` keep the textarea fallback.

  New public API in pilotiq core:

  - `registerMarkdownEditor(C) / getMarkdownEditor()` + `MarkdownEditor / MarkdownEditorProps` types — re-exported from `@pilotiq/pilotiq/react`.

  New in `@pilotiq/tiptap`:

  - `MarkdownEditor` component, auto-registered by `registerTiptap()` / `tiptap()` plugin.
  - `tiptap-markdown@^0.9` peer dep.

## 0.14.0

### Minor Changes

- aad34d2: Custom-page collab opt-in. `Page.collab = { room, presence? }` mounts the plugin-registered custom-page wrapper around the page tree on the matching URL. Pair with `@pilotiq-pro/collab`'s plugin to share one Y.Doc + WebSocket across every collab-aware field inside a custom page. Resource-bound default pages (List/Create/Edit/View) keep routing through `Resource.collab` — no change there.

  New public API:

  - `Page.collab: { room: string; presence?: boolean } | null` (default `null`).
  - `Page.getResolvedCollabConfig(): PageCollabConfig | null`.
  - `panelInfo().pageCollab: Record<slug, PageCollabConfig>` — keyed by URL slug (cluster-prefixed for clustered pages). Absent when no page opted in.
  - `react/`: `CustomPageWrapperGate`, `registerCustomPageWrapper`, `getCustomPageWrapper`, `CustomPageWrapperProps`, `PageCollabMap`. Mounted by `AppShell` alongside `RecordWrapperGate`.

## 0.13.1

### Patch Changes

- 35f1a59: `Repeater.relationship` / `Builder.relationship` PK-switch reconciliation (Phase A). After a parent form submit creates new relationship-backed rows, the submitting tab now drops the orphan UUID rows the row CRDT carried forward — they were causing duplicate-row visual bugs on reload. New optional method `FormCollabBinding.getRowOrder?(arrayName)` + `RowBindingApi.current()`; the renderer uses a one-shot reconciler on next mount after submit success. Other peers still need to reload to converge — Phase B (server-side rename) addresses that. Plan: `pilotiq-pro/docs/plans/repeater-relationship-pk-switch.md`.

## 0.13.0

### Minor Changes

- Row-text Tiptap-backed collab — extends Phase D's Y.XmlFragment text-CRDT path to Repeater / Builder row leaves.

  - **New:** `RowCoordsContext` + `useRowCoords()` (`@pilotiq/pilotiq/react`). `RepeaterInput` and `BuilderInput` wrap each row in the provider so dotted-path text leaves can compose a stable fragment key `${arrayName}.${rowId}.${fieldName}` that survives reorders. `TextLikeInput` + `MarkdownInput` collab branches both consume the coords.
  - **Breaking — `FormCollabBinding` contract:** removed `getTextBinding?(name)` and `getRowTextBinding?(arrayName, rowId, fieldName)`. Text CRDT (top-level and row leaves) now lives exclusively in `@pilotiq/tiptap`'s `CollabTextRenderer` (`Y.XmlFragment`-backed via y-prosemirror). Bindings that implemented these methods can simply drop them; the renderer no longer asks.
  - **Breaking — public exports:** removed `TextBinding` and `TextDelta` from `@pilotiq/pilotiq/react`. Internal-only types `BoundTextInput`, `textDelta.ts` deleted alongside.
  - **Breaking — `FormStateApi`:** removed `textBindings`, `rowTextLeaves`, `getRowTextBinding`. `useFieldState(...).textBinding` is gone too; row-text consumers don't need to branch on it anymore (the Tiptap path is the only path).

  Migration: pair this release with `@pilotiq-pro/collab` ≥ the matching cut. Pre-fix installs of `@pilotiq-pro/collab` will hit a TS error against the new contract; the matching collab release removes the dead methods.

## 0.12.0

### Minor Changes

- Add `CurrentUserContext` exported from `@pilotiq/pilotiq/react` so plugins can read the active user (driven by `Pilotiq.user(req => …)`) without prop-drilling through `panel`. `AppShell` mounts the provider around the layout-provider chain seeded from `panel.userMenu?.user`; plugins call `useCurrentUser()` from inside any layout provider or descendant component.

  Also fixes collab text field chrome: the single-line `TextLikeInput.tsx` chrome now uses `overflow-x-clip` instead of `overflow-x-auto` so `CollaborationCaret` user-name labels can escape the input upward (CSS spec: `auto` on either axis forces the other axis to non-visible too; `clip` is the one non-visible value that allows the orthogonal axis to remain `visible`). Trade-off: long text gets clipped on the right rather than horizontally scrollable inside a collab field — acceptable for plain-text fields where the presence label is the higher-value affordance.

## 0.11.0

### Minor Changes

- d36902d: feat(pilotiq): F.5a — Repeater/Builder row-identity contract for collab

  Widens `FormCollabBinding` with five optional row-array methods plus a
  `RowsEvent` type so the upcoming `Y.Array<Y.Map>` impl in
  `@pilotiq-pro/collab` (F.5b) has a stable surface to hook into. Renderer
  side wiring is live in this release — `RepeaterInput` + `BuilderInput`
  already dispatch `add` / `remove` / `reorder` / `subscribe` through the
  binding when one is registered and reconcile remote row events into
  their local state by `__id`. No behaviour change for non-collab forms
  or bindings that pre-date F.5; pre-F.5 bindings keep typechecking
  because every new method is optional.

  ### New public surface

  - **`useRowBinding(arrayName)`** — returns a `RowBindingApi` pre-bound
    to a Repeater/Builder field name, or `null` when no F.5 binding is
    active (outside a collab room, pre-F.5 plugin, opted out via
    `.collab(false)`, or non-array field).
  - **`RowBindingApi`** — `{ add, remove, reorder, subscribe }`. Each
    method's `arrayName` arg is pre-bound; `subscribe(fn)` returns an
    unsubscribe function for `useEffect` cleanup.
  - **`RowsEvent`** — `add | remove | move` discriminated union with
    `rowId` + indices for the renderer to reconcile against its current
    `rows` state.
  - **`FormCollabBinding.addRow / removeRow / reorderRows / setRow /
getRowTextBinding / subscribeRows`** — all optional. Bindings opt
    into F.5 by implementing the trio `addRow + removeRow + reorderRows`;
    `subscribeRows` and `setRow` layer on for remote-event + dotted-path
    routing; `getRowTextBinding` is reserved for F.5c (per-row `Y.Text`).

  ### `FormStateProvider` routing

  - `setValue` and the live-resolve overlay both route through
    `routeBindingWrite` — top-level names go to `binding.set`, row leaves
    (matching `parseRowFieldPath`) go to `binding.setRow` when available.
    Pre-F.5 row leaves continue to stay local-only.
  - The provider walks `formMeta` for top-level Repeater/Builder field
    names at binding mount and builds a per-array `RowBindingApi` map
    exposed via `useRowBinding`.

  ### Known v1 limitations (kept from the F.5 plan)

  - Nested Repeaters (e.g. `articles.0.comments.0.body`) stay local-only
    — `parseRowFieldPath` returns `null` and the binding never sees them.
  - Server-derived row values now propagate through `setRow` when
    available; without an F.5 binding they continue to be dropped.
  - F.5c (`getRowTextBinding`) — character-level `Y.Text` per row text
    field — lands in a follow-up; row leaves stay on row-level LWW until
    then.

- b70cb49: feat(pilotiq): F.5c — per-row Y.Text composition with F.6

  Wires `useFieldState(dottedName).textBinding` to resolve through
  `FormCollabBinding.getRowTextBinding(arrayName, rowId, fieldName)` so
  Repeater/Builder row text fields ride character-level CRDT when the
  plugin implements F.5c. Previously dotted-name `textBinding` always
  returned `null`; now it returns a stable handle when:

  - the row's `__id` is already stamped in the values map,
  - the inner field's `fieldType` is in the F.6 allowlist
    (`text / textarea / email / slug / markdown`),
  - the field isn't opted out via `.collab(false)`,
  - the active binding implements `getRowTextBinding`.

  ### Walker

  A new `collectRowTextLeavesByArray(formMeta)` helper walks each
  Repeater's inner schema + each Builder block's template once at
  binding mount and stashes the per-array text-leaf names on
  `FormStateApi.rowTextLeaves`. Nested Repeater/Builder boundaries stop
  the walk — 5-segment dotted paths remain out of scope.

  ### Renderer surface unchanged

  `BoundTextInput` already branches on `textBinding != null` from F.6,
  so rows pick up the character-level path automatically once an F.5c-
  capable binding is registered. No new renderer wiring beyond the
  walker + `useFieldState` resolver.

### Patch Changes

- 08ab5bb: fix(pilotiq): F.5c row-text integration — stamp row `__id` and walk `template` not `children`

  Two integration gaps in the just-shipped F.5c per-row Y.Text path made
  character-level CRDT silently fall back to LWW for every Repeater /
  Builder row text leaf. Both green-CI / broken-at-render bugs.

  ### `collectRowTextLeavesByArray` walked the wrong meta key

  The walker read `meta.children` for the Repeater's inner row schema,
  but `RepeaterField.toMeta()` emits the row schema under `meta.template`
  (`meta.children` is the per-resolved-row child list, not the field-
  level template). Walker always returned empty → `FormStateApi.rowTextLeaves`
  stayed `null` → `useFieldState(dottedName).textBinding` short-circuited
  on every dotted row-leaf name. The unit-test fixture mirrored the same
  wrong shape, so CI passed while the renderer was inert.

  ### `RepeaterInput` / `BuilderInput` never stamped row `__id` in `ctx.values`

  `resolveRowTextBinding` looks up `rowIdAtIndex(ctx.values, name, i)` which
  reads `values['${name}.${i}.__id']`. The renderer maintained row identity
  in local component state but never mirrored it into `ctx.values`, so the
  lookup returned `null` and the binding chain never fired — even for
  locally-added rows.

  Both renderers now mirror `rows` into `ctx.values` via a single
  `useEffect` keyed on the rows array. Pre-existing server-seeded rows
  were unaffected because the seed wasn't a renderer concern; only
  locally-added or remote-reconciled rows hit the gap.

  ### Tests

  `formStateHelpers.test.ts`'s hand-built `repeater()` helper now emits
  `template:` instead of `children:` to match `RepeaterField.toMeta()`.
  Catches future drift between meta producers and walkers.

## 0.10.0

### Minor Changes

- e6605b6: feat(pilotiq): `Pilotiq.editPageHydrator(fn)` — server-side hook for resource edit pages

  Open-core scaffolding for the SSR-from-Y.Doc consumer in
  `@pilotiq-pro/collab` (kills the DB → Y.Doc value flicker on collab'd
  edit pages). Pilotiq core stays Yjs-free — the hook's return type is
  `Record<string, unknown>` so consumer-side Yjs imports stay confined
  to the plugin.

  ### New surface

  - **`panel.editPageHydrator(fn)`** — fluent builder method. Registers a
    server-side hook called on every resource edit page after the standard
    fill pipeline (`loadRecord` → `mutateFormDataBeforeFill` →
    `fillFromRecord` → `mutateFormDataAfterFill` →
    `applyRelationshipRepeaterFill` → `applyRelationshipBuilderFill`).
    Multiple registrations welcome — walked sequentially in registration
    order; each non-null return merges onto the form's default values
    (later returns override earlier ones on key conflicts).
  - **`EditPageHydrator`** — function type:
    `(ctx) => Record<string, unknown> | null | Promise<…>`.
  - **`EditPageHydratorContext`** — `{ resource: ResourceClass, recordId:
string, currentValues: Record<string, unknown> }`. `currentValues` is
    the fill-pipeline result so hydrators can read DB-row values before
    deciding what to overlay.

  ### Failure mode is permissive

  A hydrator that throws or returns `null` contributes nothing; the page
  still renders against the fill-pipeline values it received. Errors emit
  a `console.warn` so silent reliance on missing data is visible.

  ### Where it runs

  Only on the fresh-load branch in `resourceEditData()` (not on the
  validation-error round-trip — overlaying server-derived values there
  would clobber the user's just-submitted input that the page is
  re-displaying for them to fix).

  ### Tested

  - 2981/2981 pilotiq tests pass (was 2971; +10 new: hydrator merge order,
    throw-swallow, null + non-object returns, ctx passthrough, builder
    method registration order).

## 0.9.0

### Minor Changes

- 41157ef: feat(pilotiq): per-Resource collab opt-in — `Resource.collab` declarative config

  Flips collab activation from "register the `@pilotiq-pro/collab` plugin
  and every edit page collaborates" to "register the plugin and nothing
  activates until a resource opts in." Today's `@pilotiq-pro/collab` keeps
  working unchanged — only the gate that decides whether to mount the
  record wrapper now consults per-resource opt-in.

  ### BREAKING — migration

  Resources that currently get collab via the plugin's panel-wide
  activation must add an explicit opt-in:

  ```diff
   class Post extends Resource {
  +  static override collab = true
     // ...
   }
  ```

  Two-line per resource. Without the flag, the record wrapper is not
  mounted — collab fields render as plain inputs and presence chips do not
  appear.

  ### New `static collab` field on `Resource`

  ```ts
  class Post extends Resource {
    static override collab = true; // shorthand
    // or:
    static override collab = { pages: ["edit", "view"], presence: false }; // explicit
    // or:
    static override collab = false; // explicit opt-out
  }
  ```

  - `true` → defaults `{ pages: ['edit'], presence: true }` (the 90% case).
  - Object form merges with defaults; only override what you need.
  - Omitted / `false` → collab is off for the resource regardless of
    whether the plugin is registered.

  `Resource.getResolvedCollabConfig()` normalizes the raw setting to
  `ResourceCollabConfig | null` and is the function consumed by
  `panelInfo()`. Override only if you need to compute the config
  dynamically (rare).

  ### Field-level `.collab(false)` still wins

  A resource opting in then opting individual fields out is the supported
  shape — the field-level setting always overrides the resource-level
  default.

  ### Wire-shape addition

  `panelInfo()` now emits an optional `recordCollab: Record<URLSlug,
ResourceCollabConfig>` map (sparse — absent when no resource opted in).
  Built from `cfg.resources` filtered by `R.getResolvedCollabConfig()`.
  Keys are the same slug `parseRecordPageUrl` produces:
  `${cluster.slug}/${R.slug}` for clustered resources, `${R.slug}` for
  non-clustered.

  ### URL parser widened

  - New `parseRecordPageUrl(path, base)` returns `{ resourceSlug,
recordId, role: 'edit' | 'view' }`. Recognizes both `/edit` and
    `/view` terminal segments.
  - `parseRecordEditUrl` kept as a thin back-compat wrapper that filters
    `role !== 'edit'` — existing consumers calling the legacy function see
    the same edit-only behavior.
  - New `RecordPageRole` type exported alongside the existing
    `RecordEditIdentity`.

  ### `RecordWrapperGate` resource-aware

  The gate now accepts an optional `recordCollab` map prop. Mount logic:

  1. Resolve URL via `parseRecordPageUrl`.
  2. Look up the slug in `recordCollab`.
  3. If found AND the URL role is in `cfg.pages`, mount the
     plugin-registered wrapper.
  4. Otherwise render `children` directly.

  `AppShell` threads `panel.recordCollab` (from `panelInfo()`) through to
  the gate. Existing plugins that registered via `registerRecordWrapper`
  need no changes — the wrapper component contract is unchanged.

  ### v1 limitations (documented, not blocked)

  - **Nested-relation edit URLs** (`/articles/:parentId/comments/:childId/edit`)
    carry a dynamic-id segment in the URL slug, so they don't match the
    resource-keyed `recordCollab` map. Collab on nested-relation edits is
    a follow-up.
  - **Custom panel pages** (Dashboard / Settings / etc. registered via
    `Pilotiq.pages(...)`) have no per-page collab opt-in yet. Filed as a
    follow-up — needs a separate wrapper shape (literal `room` instead of
    `(slug, recordId)`) and URL-pattern disambiguation.

  ### Tested

  - 2971/2971 pilotiq tests pass (was 2957; +14 new: `Resource.collab`
    normalization, `parseRecordPageUrl` view-URL coverage, `panelInfo`
    `recordCollab` emit).

- db2c540: feat(pilotiq): character-level CRDT contract for plain-text inputs (Phase F.6 a + b)

  Open-core scaffolding for `@pilotiq-pro/collab@0.1.x`'s `Y.Text`-per-field
  binding. Pilotiq core stays Yjs-free — the contract hands opaque
  `TextBinding` handles through. F.6 fully ships when a collab plugin
  implements the new optional `getTextBinding` method (today's
  `@pilotiq-pro/collab@0.1.0` does); F1-era plugins continue to work
  unchanged because the method is optional.

  ### New exports from `@pilotiq/pilotiq/react`

  - **`TextBinding`** — per-field text-CRDT handle: `read() / applyDelta /
observe(fn) / destroy`. Issued by `FormCollabBinding.getTextBinding(name)`.
  - **`TextDelta`** — `insert | delete | replace` op union emitted by
    text renderers.
  - **`useFieldState().textBinding: TextBinding | null`** — non-null inside
    a `<RecordCollabRoom>` when the binding has allocated a Y.Text for
    the field; renderers branch on this to take the character-level path.

  ### `FormCollabBinding` contract

  - **`getTextBinding?(name): TextBinding | null`** — new optional method.
    Returns a Y.Text-backed handle for text-shaped fields (the binding
    impl owns the allowlist), or `null` for non-text fields and text
    fields opted out via `.collab(false)`.
  - **`FormCollabBindingFactoryArgs.formMeta`** — initial form meta passed
    to the factory so the binding can partition text vs non-text fields
    at construction time. F1-era plugins that destructure `{ room, formId,
initial }` continue to type-check; the new field is just available
    for plugins that need it.

  ### `TextLikeInput` / `MarkdownInput` rendering

  - When `fs.textBinding` is non-null AND no `TextField.mask(...)` is
    set, the renderer takes a character-level path: initial value from
    `binding.read()`, observer for remote updates with best-effort
    cursor preservation, local edits → `computeDelta(before, after)` →
    `binding.applyDelta`. IME composition is gated until
    `compositionend` so non-Latin input methods don't emit ops for
    intermediate composing characters.
  - Masked inputs fall through to today's LWW path — mask + character
    CRDT is incompatible (peers would see raw keystrokes diverged from
    the local mask render).
  - `MarkdownInput` gets the same wiring inline — toolbar splices (bold,
    italic, list, …) and paste-uploads ride the same `setValue` pipe
    which routes through the binding when active.

  ### Helpers (internal)

  - `react/fields/textDelta.ts` — pure `computeDelta(before, after)` +
    `preserveCursor(before, after, cursor)`. 19 unit tests.

  ### Tested

  - 2957/2957 pilotiq tests pass (was 2938; +19 textDelta tests).
  - `@pilotiq-pro/collab@0.1.x` is the consumer that ships F.6c (the
    Y.Text impl) on top of this contract.

## 0.8.2

### Patch Changes

- 0304569: feat(pilotiq): per-field presence slot + focus reporter (Phase F4)

  Two new module-singleton registry slots + `FieldShell` wiring — the
  open-core scaffolding pro collab plugins (e.g. `@pilotiq-pro/collab`)
  plug into to render "who's editing this field" indicators.

  ### Registries (exported from `@pilotiq/pilotiq/react`)

  - **`registerFieldPresenceComponent(C)`** / **`getFieldPresenceComponent()`** —
    module slot for a React component that renders next to each field's
    label. Receives `{ fieldName, formId }`. Components own the awareness
    lookup (typically via `useCollabRoom()` from `@pilotiq-pro/collab`'s
    `useFieldPresence` hook); pilotiq core stays Yjs-free.
  - **`registerFieldFocusReporter(reporter)`** / **`getFieldFocusReporter()`** —
    module slot for `{ onFocus, onBlur }` callbacks. `FieldShell` invokes
    them on capture-phase focus / blur events for every controlled input;
    the collab plugin mirrors the local user's focus into a `focusField`
    awareness key so peers can render their chip rails.

  ### `FieldShell` integration

  - Mounts the registered chip component inside the `<label>` via
    `{PresenceChip && <PresenceChip fieldName={name} formId={formId} />}`.
  - Wires `onFocusCapture` / `onBlurCapture` on the outer wrapper `<div>`
    so any inner input (including custom NodeViews — Select / Date /
    Slider) emits focus events through one shared dispatch.
  - Both slots gated on `meta.collab !== false` AND non-dotted-path
    name (Q3 from the F-plan: `.collab(false)` opts the field out of
    the collab layer entirely — no presence chip AND no awareness leak
    about which field the local user is editing).

  ### Tested

  - All 2938 pilotiq tests pass.
  - Two-window smoke test (playground): focusing `title` in window A
    paints a colored dot next to `title`'s label in window B; clicking
    through `title` → `status` → `excerpt` moves the dot in lockstep;
    blurring clears it. Pairs cleanly with the Phase F3 value sync —
    one ydoc, one provider, two registry surfaces consumed.

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
