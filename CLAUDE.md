# CLAUDE.md

This file provides guidance to Claude Code when working in this repository.

---

## Project Overview

**Pilotiq** is an open-source admin panel builder for RudderJS — a polished, schema-driven admin runtime for the Node.js ecosystem.

- **Monorepo**: pnpm workspaces + Turborepo
- **Language**: TypeScript (strict, ESM, NodeNext)
- **npm scope**: `@pilotiq/*`
- **Packages**: panels, pilotiq, lexical, media
- **Status**: Early development
- **Pro extensions**: `@pilotiq-pro/{ai,collab,workspaces}` in the pilotiq-pro repo

---

## Commands

All commands run from the **repo root**:

```bash
pnpm build        # Build all packages via Turbo
pnpm dev          # Watch mode for all packages
pnpm typecheck    # Type-check all packages
pnpm clean        # Remove all dist/ directories
```

Running the playgrounds:
```bash
cd playground              # panels demo
pnpm dev                   # vike dev on :3001 (HMR :24679)

cd playground-pilotiq      # pilotiq demo
pnpm dev                   # vike dev on :3003 (HMR :24680 — conflicts with pilotiq-pro if both are up)
```

> Always run `pnpm build` from the **rudderjs** root before running a playground — framework packages must be compiled first.

Prisma (run from whichever playground you're in):
```bash
pnpm exec prisma generate --schema prisma/schema
pnpm exec prisma db push  --schema prisma/schema
```

Both playgrounds ship the **same Prisma schema files** so the hoisted `@prisma/client` (shared via pnpm) stays consistent between them. Each has its own `dev.db` (via `DATABASE_URL=file:./dev.db`). If schemas drift, whichever playground runs `prisma generate` last wins and clobbers the other's client — see pitfalls.

---

## Architecture

### Packages

| Package | Description |
|---|---|
| `@pilotiq/pilotiq` | **New** — View-based admin panel using `@rudderjs/view` controller routes. Auto-generates Vike pages via Vite plugin. Will replace `@pilotiq/panels`. |
| `@pilotiq/panels` | **Legacy** — Resource builder with vendored Vike pages + metadata pipeline. Being migrated to `@pilotiq/pilotiq`. |
| `@pilotiq/lexical` | Lexical rich-text editor adapter — RichContentField, block editor, local-only by default |
| `@pilotiq/media` | Media library — file browser, uploads, preview, image conversions, MediaPickerField |

### @pilotiq/pilotiq Architecture

```
Pilotiq.make() builder → pilotiq([panels]) provider → registerPilotiqRoutes() → @rudderjs/view
                         pilotiq() Vite plugin → auto-generates pages/(pilotiq)/ stubs
```

**Setup (two lines):**
1. `vite.config.ts` — `import { pilotiq } from '@pilotiq/pilotiq/vite'` → `plugins: [pilotiq(), ...]`
2. `bootstrap/providers.ts` — `import { pilotiq } from '@pilotiq/pilotiq'` → `pilotiq([adminPanel])`

**Key files:**
- `src/Pilotiq.ts` — Builder: `.path()`, `.branding()`, `.theme()`, `.layout('sidebar'|'topbar')`, `.resources()`, `.globals()`, `.pages()`, `.schema()`, `.guard()`, `.use(plugin)`
- `src/Resource.ts` — abstract class with **static** methods: `label`, `labelSingular`, `slug`, `icon`, `model`, `form(form)`, `table(table)`, `detail(record)`, `deleteRecord(id)`, `pages()`, `resolvePages()`, `relations()`, `getSlug()`. Resources register as classes, not instances. `resolvePages()` overlays user `pages()` over `defaultPages(this)`. `model?: ModelLike` opts the resource into auto-wired CRUD — see ORM section below.
- `src/orm/modelDefaults.ts` — owns the `ModelLike` / `ModelQuery` structural interfaces plus `modelSave / modelLoadRecord / modelTableRecords` helpers. `defaultPages(R)` installs the helpers as Form/Table sentinels when `R.model` is set and the user hasn't supplied a handler. `Resource.deleteRecord` falls through to `R.model.delete(id)` when no override is set. `@rudderjs/orm` `Model` subclasses satisfy `ModelLike` structurally; pilotiq does NOT import `@rudderjs/orm` (or `@rudderjs/contracts`'s ORM types) at runtime — keeps the ORM contract a pilotiq-internal concern.
- `src/Global.ts` — abstract class for singleton resources (site settings, brand config). Same shape as `Resource` minus list/create/delete; ships `{ edit }` by default, `view` opt-in via `pages()`.
- `src/Page.ts` — page class with `static slug/label/icon`, `static schema(ctx)`, plus `static getResource()` (back-reference to owning Resource, undefined for standalone pages) and `static getMode()` returning `'list'|'create'|'edit'|'view'|'custom'`.
- `src/defaultPages.ts` — Owns four exported base classes `ListPage` / `CreatePage` / `EditPage` / `ViewPage`. Each derives slug/label/icon from `getResource()`, calls the resource's `form()`/`table()`/`detail()`, applies model-backed defaults via `applyFormDefaults` / `applyTableDefaults`, and exposes override hooks (`getHeader`, `getActions` on ViewPage). Per-resource subclass usage: `class ListArticles extends ListPage { static override getResource() { return ArticleResource } }`. Factories `defaultListPage(R)` / `defaultPages(R)` etc. return anonymous subclasses bound to R for the no-customization path. View page's default `getActions` returns Edit (link) + Delete (form-post) actions. Sentinel `save`/`loadRecord` only fire when the user hasn't configured them on the Resource form (and `R.model` isn't set). `CreatePage`/`EditPage` also expose the form lifecycle as optional static fields (`beforeCreate`, `afterUpdate`, `handleCreate`/`Update`, `mutateFormDataBeforeFill`/`AfterFill`, `mutateData`/`Before*`, `getRedirectUrl`, `getCreatedNotificationTitle`/`getSavedNotificationTitle`); `installLifecycleHooks` wires them onto the form during `schema()` so page-class overrides layer on top of `Resource.form()` config. Default success toast is `"${R.labelSingular} created/saved"` unless overridden; returning `null` from the title hook suppresses it.
- `src/defaultGlobalPages.ts` — same factory pattern for `Global`; default returns `{ edit }` (Heading + Form). View opt-in.
- `src/Column.ts` — `Column.make(name).label().sortable().searchable()`. Joins the schema tree as a child of `Table`. Layout/cosmetic builders: `.alignment('start'|'center'|'end')`, `.width()`, `.default(s)` / `.placeholder(s)`, `.tooltip()`, `.wrap()`, `.lineClamp(n)`, `.weight()`, `.color()`. Built-in formatters: `.dateTime()`, `.since()`, `.money(currency)`, `.numeric({decimals})`, `.limit(chars)`. Server-side custom formatter: `.formatStateUsing((value, record) => string)` — runs in `loadTableRecords` and stashes per-row results on `row._formatted[name]`.
- `src/columns/` — visual variants extending `Column`: `BadgeColumn` (`.colors(map)` value→pill color), `IconColumn` (`.options(map)` value→{icon, color}), `BooleanColumn` (sugar over IconColumn with check/circle defaults), `ImageColumn` (`.size(px)`, `.circular()` / `.square()`). Each subclass sets `columnType` via the protected `setColumnType()`; the renderer branches on it.
- `src/PilotiqRegistry.ts` — globalThis-backed singleton registry, `findByPath()` for route matching
- `src/PilotiqServiceProvider.ts` — Provider + `pilotiq()` factory
- `src/pageData.ts` — Per-page-role data builders (`dashboardData`, `resourceIndexData`, `resourceCreateData`, `resourceEditData`, `resourceViewData`, `globalEditData`, `globalViewData`, `customPageData`) plus `dispatchPageData(pageContext)` switchboard. **Both** the rudder route GET handlers AND the Vike `+data` hook (auto-generated by the Vite plugin) call these so SSR and SPA-nav serve identical data. Without the dual path, SPA nav lands on a blank page because the rudder handler doesn't run for `*.pageContext.json` fetches. Page renderers read from `(ctx.data ?? ctx.viewProps)`; the data hook short-circuits to viewProps on SSR to avoid double schema-builds.
- `src/routes.ts` — `registerPilotiqRoutes()` using `view()`. Each GET handler delegates to a `pageData.ts` builder; POST handlers stay here (form submit, action dispatch). Routes:
  - `GET ${base}` → dashboard schema
  - `GET ${base}/${slug}` → resource list (runs `loadTableRecords` → ships `schemaData`)
  - `GET/POST ${base}/${slug}/create` → create form (POST runs `dispatchFormSubmit`)
  - `GET ${base}/${slug}/:id` → resource view (runs `R.detail(record)`)
  - `GET/POST ${base}/${slug}/:id/edit` → edit form (POST runs lifecycle, 303 redirect on success / 422 + re-render on validation error)
  - `POST ${base}/${slug}/:id/delete` → calls `R.deleteRecord(id)`, 303 to list
  - `POST ${base}/${slug}/_action/:actionName` → resource action handler dispatch (header/bulk/row). Body `{ ids?, ...values }`; resolves records through `R.model.find` when set, falls back to `{id}` stubs. 303 redirect on success (or `result.redirect`), 404 if action not found, 500 on handler throw.
  - `POST ${base}/${pageSlug}/_action/:actionName` → custom-page action dispatch.
  - `GET/POST ${base}/${slug}` (Global) → singleton edit, no `:id`
  - `GET ${base}/${pageSlug}` → custom page schema; can also `POST` if the page schema has a Form
- `src/vite.ts` — `pilotiq()` Vite plugin, generates `(pilotiq)/` pages + `+Layout.tsx` + `+Head.tsx`
- `src/schema/` — Unified `Element` model (Phase 1 foundation):
  - `Element.ts` — abstract base class. Every primitive (Field, Action, display elements) extends this. Contract: `getType()`, `toMeta()`, optional `_children: Element[]`.
  - **Display elements:** `Text`, `Heading`, `Alert`, `Divider`. Containers: `Card`, `Section`, `Tabs`/`Tab`, `Grid` — all hold `children: Element[]`.
  - `resolveSchema()` — async recursive walker; emits `meta.children` for containers; plugin-extensible via `registerResolver(type, fn)`. Filters hidden Fields server-side using `RenderContext { mode?, record?, basePath?, recordId? }`.
- `src/elements/` — first-class container Elements that own their lifecycle:
  - `Form.ts` — `Form.make().schema([...])`, lifecycle setters `validate / mutateData / mutateDataBeforeCreate / mutateDataBeforeUpdate / beforeSave / beforeCreate / beforeUpdate / save / handleCreate / handleUpdate / afterSave / afterCreate / afterUpdate / redirectAfterSave / loadRecord / fillFromRecord / mutateFormDataBeforeFill / mutateFormDataAfterFill / savedNotification / createdNotification / disableSavedNotification`, render-time setters `withValues / withErrors`. `toMeta()` emits `formId / method / action / values / errors`. Auto-generated `formId` per instance; multi-form pages discriminate via hidden `_formId` input. Mode-specific hooks fire only on their mode (`ctx.record === undefined` → create, set → update); generic hooks fire on both. `handleCreate` / `handleUpdate` replace `save()` for that mode when set.
  - `Table.ts` — `Table.make().columns([...]).records(fn).defaultSort(col,dir).paginate(n)`. `records(ctx) → { rows, total }` (or bare row array). Render-time setters `withRows / withSort / withSearch / withPage`. `toMeta()` emits `rows / total / currentSort / search / currentPage / perPage / searchable`.
  - `dispatchForm.ts` — `dispatchFormSubmit(form, body, ctx)` runs the lifecycle: `validateSchema` → form-level validators → `mutateData` → `mutateDataBeforeCreate|Update` → `beforeSave` → `beforeCreate|Update` → `handleCreate|handleUpdate||save` → `afterCreate|Update` → `afterSave` → `redirectAfterSave`. Form-level validator errors land under `_form` key. `DispatchSuccess.notifications` carries the resolved success-toast meta (resolved via `notifications/resolveSavedNotification.ts` from form's `savedNotification` / `createdNotification` / disable flag). `findForms(elements)` + `selectForm(forms, formId)` for multi-form pages.
  - `dispatchTable.ts` — `parseTableQuery({ search, sort, page, perPage })` normalizes URL params; `loadTableRecords(elements, query)` walks the tree, calls every `Table.records(ctx)` in parallel, mirrors state back via `withRows/withSort/...`.
  - `dispatchAction.ts` — `findActions(elements)` walker, `parseActionBody({ ids, ...values })` parses POST body, `dispatchAction(action, input, resolveRecord?)` runs `Action.handler(ctx)` with `ctx.record` (1 id), `ctx.records` (>1), `ctx.values`, `ctx.request`. Returns `{ ok, redirect? }` or `{ ok: false, error }`. Routes auto-stamp `Action.dispatchUrl()` on handler-style actions so the client knows where to POST.
- `src/fields/` — `Field` (extends `Element`, `getType()` returns `'field'`, `fieldType` discriminates subtypes), 8 subclasses (`TextField`, `EmailField`, `NumberField`, `SelectField`, `TextareaField`, `ToggleField`, `DateField`, `SlugField`), visibility flags (`hideFromTable/Create/Edit/View`) + condition callbacks (`showWhen`, `hideWhen`, `disabledWhen`), validators via `.validate(v|v[])` (see `src/validation/`).
- `src/filters/` — `Filter` abstract base + `SelectFilter` (dropdown w/ options) + `BooleanFilter` (yes/no/any). Lives as children of `Table` via `.filters([...])`. Active values come from URL query keys matching the filter name (reserved keys: search/sort/page/perPage). `parseFilterValues()` extracts them; `loadTableRecords` mirrors them back via `Filter.withValue` and passes through `TableContext.filters`. `modelTableRecords` applies them as `where` clauses (boolean coercion for BooleanFilter); `Filter.query(fn)` overrides with a custom `(query, value) => query` hook.
- `src/actions/` — `Action` primitive (single class, `placement: 'inline'|'bulk'|'row'|'header'`, `destructive`, `confirm`, `handler`). Four dispatch modes (mutually exclusive): `Action.href(url)` for link-style (Edit), `Action.method('post'|'put'|'patch'|'delete').action(url)` for form-style (Delete), `Action.handler((ctx) => ...)` for server-dispatched buttons, `Action.submit()` for `<button type="submit">` (default Create/Edit save buttons). Submit actions can target a form they live outside of via `Action.submit().form(formId)` — the rendered button uses HTML's `form=` attribute, which is how `CreatePage`/`EditPage` put Save buttons in the page header without nesting them inside the form. Handler-style actions get a `dispatchUrl` stamped at render time by the route registrar; client POSTs `{ ids?, ...values }` and the handler runs with `ctx.record` / `ctx.records` / `ctx.values` / `ctx.request`. Handler returns `void`, `{ redirect }`, `{ notify }` (single Notification or array — see `src/notifications/`), or any combo; throws → 500.

  **Form-modal actions** (`Action.schema([Field, ...]).handler(...)`) — when an action carries a `.schema([])` and/or any `.modal*()` chrome (`modalHeading / modalDescription / modalSubmitLabel / modalCancelLabel / modalIcon / modalWidth / slideOver`), the trigger renders a Dialog containing the schema as a form. Submit fetches the dispatchUrl with `Accept: application/json`, the server validates via `validateSchema` + coerces via `coerceFormValues`, and returns `{ ok, redirect, notifications? }` (200), `{ ok: false, errors }` (422 — inline field errors), or `{ ok: false, error }` (500 — banner). Confirm-only modals (no schema) use the same dialog flow; `.requiresConfirmation()` is sugar for `.confirm(...)`. **Form-method actions stay on the older 303-redirect form-post path for back-compat** (Delete-row pattern). The two coexist: client picks via `Accept` header.

  **Variants & cosmetics**: `.color('primary'|'destructive'|'success'|'warning'|'info'|'ghost')`, `.size('sm'|'md'|'lg')`, `.tooltip(s)`, `.outlined()`, `.iconButton()` (icon-only, label → aria-label), `.badge(value).badgeColor(class)`. `.destructive()` is sugar that also sets `color:'destructive'` unless explicit.

  **Conditional visibility**: `.visible(rule)` / `.hidden(rule)` / `.disabled(rule)` / `.authorize(rule)` — rule is `boolean | (ctx) => boolean` with `ActionVisibilityContext { record?, records?, user? }`. Non-row placements evaluate at schema-resolve time (`resolveSchema` drops hidden actions, stamps `disabled: true`). **Row-placement actions defer to per-row eval in `loadTableRecords`**, which stamps `_visibleActions: string[]` and `_disabledActions: string[]` on each row. Actions with rules emit `conditional: true` on meta so the row renderer knows to consult the lookup. `authorize()` is a semantic alias for `visible()`.

- `src/actions/ActionGroup.ts` — `ActionGroup.make(name).label().icon().tooltip().actions([Action, ...])`. Renders as a trigger button + DropdownMenu of child Actions. Same trigger styling as Action (color/size/outlined/iconButton/tooltip). Same visibility rules. Nested `ActionGroup`s passed to `.actions([])` flatten — the nested group's children get pulled up into the parent dropdown. Bulk placement isn't supported (degenerate UX). When children carry confirm/modal/method dispatch, the dropdown closes via `pending` state then the dialog opens (shadcn single-popup pattern).
- `src/schema/Heading.ts` — `Heading.actions([Action…])` attaches right-aligned action buttons to a heading; renderer lays out title left + actions right in a flex row. Used by `CreatePage`/`EditPage` to put Save in the page header.
- `src/validation/` — Field-level validation. `Validator` is `(value, ctx?) => string|null` plus an optional `serialized: SerializedRule` descriptor mirrored to the client via `FieldMeta.rules`. Built-in helpers: `required()`, `email()`, `minLength(n)`, `maxLength(n)`, `min(n)`, `max(n)`, `pattern(regex)`. `validateSchema(elements, values, record?)` walks any Element tree and returns `{ name → string[] }`. `Field.required()` flag auto-contributes a required check + serialized rule unless an explicit `required()` validator is present.
- `src/notifications/` — Toast / flash builder. `Notification.make(title).body(s).success() / .error() / .warning() / .info().icon(s).duration(ms)` returns serializable `NotificationMeta { id, type, title, body?, icon?, duration? }`. Action handlers return `{ notify }` (single instance, single meta, or array of either); `dispatchAction` normalizes to `NotificationMeta[]` and routes pass them through the JSON response (`{ ok, redirect, notifications }`). Browser-style form-post 303 path uses session flash (`flash.ts` → `flashNotifications(req, …)` writes via `@rudderjs/session`'s `req.session.flash('pilotiq:notifications', meta)`; `consumeFlashedNotifications(req)` reads on the next GET and merges into `viewProps.notifications`). Pilotiq doesn't peer-depend on `@rudderjs/session`; the helpers duck-type `req.session` and silently no-op when absent.
- `src/theme/` — Theme engine: types, presets (default/nova/maia/lyra), base-colors, accent-colors, chart-palettes, radius, icon-map, `resolveTheme()`, `generateThemeCSS()`
- `src/react/AppShell.tsx` — Picks layout mode, renders sidebar or topbar. Wraps the layout in `ToasterProvider` so `useToast()` is available everywhere; reads `notifications` from viewProps and forwards as `initialNotifications`.
- `src/react/Toaster.tsx` — `<ToasterProvider initialNotifications={...}>` + `useToast()` hook. Hand-built (no Sonner/etc dep). Stack fixed bottom-right, auto-dismiss after 5s (`duration: 0` → persistent), per-type colors via tailwind utility maps. Used by `ActionModalDialog` (consumes `data.notifications` from JSON response and dispatches before navigating, so toasts persist across the SPA re-render).
- `src/react/ThemeProvider.tsx` — Light/dark/system context, localStorage, CSS var injection
- `src/react/ThemeToggle.tsx` — Sun/moon toggle button (in both layout headers)
- `src/react/layouts/SidebarLayout.tsx` — shadcn Sidebar (collapsible, mobile-responsive)
- `src/react/layouts/TopbarLayout.tsx` — horizontal nav variant
- `src/react/ThemeSettingsPage.tsx` — Full theme editor: controls sidebar + live iframe preview
- `src/react/SchemaRenderer.tsx` — Renders resolved schema elements. `TableRenderer` segregates table actions by placement: `header`/`inline` in the top bar, `bulk` in a toolbar that only shows when rows are selected, `row` in a per-row DropdownMenu (`RowActionsMenu`). Bulk placement triggers a checkbox column (selection state keyed by `row.id` in React state). Heading / description / striped / emptyState chrome ride on `Table.heading() / .description() / .striped() / .emptyState({heading, description, icon})`. Empty-state UI auto-distinguishes "filtered but empty" from "no records yet". `formatCell(value, col, row)` switches on `col.columnType` (text/badge/icon/boolean/image), applies built-in `format` spec via `applyColumnFormat`, and reads server-evaluated overrides from `row._formatted[colName]`. Handler-style actions WITHOUT confirm/modal still submit a hidden `<form method="POST">` (303 native). Handler-style actions WITH confirm OR modal → `ActionModalDialog` fetches with `Accept: application/json`, handles 422 errors inline, dispatches notifications via `useToast()` before SPA-navigating to the redirect.

  **`ActionModalDialog`** (controlled or uncontrolled). Renders a header (`heading`/`description`/`icon`/`width`), the schema as form fields via `renderFormChild` (so per-field errors render under each input), and a footer with cancel/submit buttons. Controlled mode (`open` + `onOpenChange`) is used by `RowActionsMenu` and `ActionGroupTrigger` so the dropdown can close before the dialog opens. Confirm-only actions (no schema) reuse the same dialog with no fields rendered.

  **Row-data convention** — server-side eval results land on each row under reserved underscore-prefixed keys: `_visibleActions: string[]` (action names visible for this row), `_disabledActions: string[]` (action names disabled for this row), `_formatted: Record<colName, string>` (custom-formatter output). `RowActionsMenu` filters `conditional: true` actions through `_visibleActions` and applies the disabled flag from `_disabledActions`. `formatCell` reads `_formatted[name]` first, falling back to the raw value + format spec.
- `src/react/ui/` — shadcn primitives (sidebar, button, sheet, separator, tooltip, skeleton, input, checkbox, calendar, dialog, dropdown-menu, popover, select, switch, table, tabs, textarea)
- `src/plugins/themeEditor.ts` — `themeEditor()` plugin

**Pilotiq page generation:**
- `pages/(pilotiq)/+Head.tsx` — FOUC prevention script (reads localStorage, sets `.dark` before hydration) + Google Fonts preload
- `pages/(pilotiq)/+Layout.tsx` — wraps pages in ThemeProvider + AppShell, injects theme CSS inline for SSR
- `pages/(pilotiq)/+config.ts` — `passToClient: ['viewProps']`
- `pages/(pilotiq)/dashboard/` — Dashboard (1-segment URL)
- `pages/(pilotiq)/slug/` — **Single route** for 2-segment URLs (resource index, Global edit, custom page). Server sets `pageType: 'resource' | 'global' | 'page'` in viewProps; the renderer just renders `schemaData` uniformly via `<SchemaRenderer />`.
- `pages/(pilotiq)/resource-create/` — 3-segment with `parts[2] === 'create'`
- `pages/(pilotiq)/resource-view/` — 3-segment with `parts[2] !== 'create'` and `parts[1] !== 'theme'` (catches `${slug}/:id` for resource view AND `${global-slug}/view`)
- `pages/(pilotiq)/resource-edit/` — 4-segment with `parts[3] === 'edit'`
- `pages/(pilotiq)/theme/` — Theme editor page (only when `.use(themeEditor())`); slug route excludes `parts[1] === 'theme'`
- Every `+Page.tsx` stub is just `<SchemaRenderer elements={vp.schemaData ?? []} />` — server resolves, client renders.
- Route functions check `PilotiqRegistry` on server, tentatively match on client for SPA nav

**Plugin system:**
- `PilotiqPlugin` interface: `{ name: string, register(panel): void }`
- `.use(plugin)` on builder — calls `plugin.register(panel)`
- `@pilotiq/pilotiq/plugins` export path for built-in plugins

**Theme system:**
- `Pilotiq.theme({ preset, baseColor, accentColor, chartPalette, radius, fonts, iconLibrary, cssVariables })` configures theme
- `resolveTheme()` layers: preset → base color → accent color → chart palette → raw CSS vars
- `generateThemeCSS()` outputs `:root { ... } .dark { ... }` with `!important` for Tailwind override
- ThemeProvider manages light/dark/system state, persists to `localStorage['pilotiq-theme']`
- ThemeToggle renders in both SidebarLayout and TopbarLayout headers
- FOUC prevention: inline `<script>` in +Head.tsx + inline `<style>` in +Layout.tsx
- **Default preset: Pilotiq brand** — paper (white) page bg, cream (`oklch(0.979 0.008 78)`) sidebar, terracotta (`#d97757`) primary, ink (`#1a1a1a`) text, Satoshi font via Fontshare CDN. Matches the pilotiq.io marketing site tokens.
- 4 presets (default, nova, maia, lyra), 7 base colors (`default` sentinel + 6 scales including `cream`), 17 accent colors (incl. `terracotta`), 6 chart palettes (incl. `terracotta`, `default` is a no-op sentinel), 5 radii
- `resolveTheme()` fallbacks: body/heading font → `'Satoshi'`, radius → `'medium'` (10px)
- All colors in OKLCH format for perceptual uniformity
- `themeEditor` works without `.theme()` — the editor seeds an empty config so the built-in default preset + DB overrides still resolve; API routes mount on `hasThemeEditor()`, not on `getTheme()`

**Fontshare for Satoshi:** the `+Head.tsx` font loader (and the theme editor preview iframe) detects `Satoshi` by name and loads it from `https://api.fontshare.com/v2/css?f[]=satoshi@300,500,700&display=swap`. Everything else falls back to Google Fonts. The loader reads from `resolved.fonts` (post-defaults) so Satoshi's stylesheet is always requested when it's the resolved heading or body font, even if the user only overrode the other side.

**themeEditor() plugin:**
- `import { themeEditor } from '@pilotiq/pilotiq/plugins'` → `.use(themeEditor())`
- Adds "Theme" nav link in sidebar footer / topbar
- ThemeSettingsPage: controls sidebar + live iframe preview (srcDoc, client-only via mounted guard)
- API routes: GET/PUT/DELETE `{base}/api/_theme` persisted to `panelGlobal` table
- `applyToParent()` updates `<style id="pilotiq-theme">` for instant visual feedback on save
- Service provider loads saved overrides from DB on boot via `panel.setThemeOverrides()`
- `getMergedTheme()` merges code defaults + DB overrides at runtime
- Generated page passes `vike/client/router` `navigate` via `onNavigate` prop for server data re-fetch
- `@pilotiq/pilotiq` must be in `optimizeDeps.exclude` in app's `vite.config.ts`

### @pilotiq/panels Architecture (Legacy)

```
@rudderjs/* (framework — linked via pnpm.overrides)
  └── @pilotiq/panels
       ├── @pilotiq/lexical   (Panel.use(panelsLexical()))
       └── @pilotiq/media     (Panel.use(media(config)))
```

**Requires**: `@rudderjs/{core,router,orm,auth}` + optional packages (cache, localization, storage).

Panels ships React pages that apps vendor via:
```bash
pnpm rudder vendor:publish --tag=pilotiq-pages --force
```

Source: `packages/panels/pages/` → Target: `playground/pages/(panels)/`

**After EVERY edit to `packages/panels/pages/`, re-run vendor:publish.**

---

## Cross-Repo Wiring

All `@rudderjs/*` packages resolve to `link:../rudder/packages/<name>` via `pnpm.overrides` in the root `package.json`. No git submodules — sibling clones on disk.

```
~/Projects/
├── rudder/         # Framework
├── pilotiq/        # This repo (free panels)
└── pilotiq-pro/    # Pro extensions (AI, collab)
```

---

## Playgrounds

| Playground | Port | HMR | Purpose |
|---|---|---|---|
| `rudderjs/playground` | 3000 | 24678 | Framework demo — zero pilotiq deps |
| `pilotiq/playground` | 3001 | 24679 | **Panels** demo — panels + lexical + media (auth, articles, categories, users, media) |
| `pilotiq/playground-pilotiq` | 3003 | 24680 | **Pilotiq** demo — view-based panel (pilotiqAdmin + pilotiqSimple, themeEditor) |
| `pilotiq-pro/playground` | 3002 | 24680 | Full stack — framework + panels + AI + collab |

The two pilotiq playgrounds were split in April 2026 because the `@panel/@page` parametric route in panels kept tentatively matching pilotiq URLs on the client, breaking SPA nav. Each package now gets its own isolated dev environment.

### Playground providers

- `playground/` (panels): log, database, session, hash, cache, auth, storage, localization, panels
- `playground-pilotiq/` (pilotiq): log, orm-prisma, session, cache, pilotiq

No AI, no live, no queue, no mail, no monitoring — those are framework demos in rudderjs/playground.

---

## TypeScript Conventions

- All packages extend `../../tsconfig.base.json`
- `experimentalDecorators: true` + `emitDecoratorMetadata: true`
- `module: "NodeNext"` — use `.js` extensions in all imports
- `strict: true`, `exactOptionalPropertyTypes: true`, `noUncheckedIndexedAccess: true`

---

## Common Pitfalls

- **Vike ignores gitignored pages**: NEVER add `pages/` subdirectories to `.gitignore`. Vike respects `.gitignore` when scanning — gitignored page directories are invisible to routing, causing silent 404s.
- **Pilotiq route functions + SPA nav**: Route functions in `pages/(pilotiq)/` must tentatively match on the client (`import.meta.env.SSR` check only gates the registry lookup, not the entire match). Returning `false` on client breaks SPA navigation and causes full page reloads.
- **Pilotiq page stubs**: `pages/(pilotiq)/` is auto-generated by the `pilotiq()` Vite plugin. Don't edit manually — changes are overwritten. To customize rendering, create `app/Views/` files with matching `export const route` (static routes beat route functions).
- **Pilotiq layout persistence**: AppShell lives in `+Layout.tsx`, NOT in individual `+Page.tsx`. Vike keeps layouts mounted across navigations — putting the shell in pages causes sidebar to remount/reset on every nav.
- **Stale vendored pages** (panels only): Re-run `pnpm rudder vendor:publish --tag=pilotiq-pages --force` after every edit to `packages/panels/pages/`
- **Stale `dist/`**: Run `pnpm build` from rudderjs root, then pilotiq root. Edits to `packages/pilotiq/src/**` require a rebuild to show up in the playground — run `pnpm -F @pilotiq/pilotiq build`, or `cd packages/pilotiq && pnpm dev` for watch mode.
- **Prisma hoisted client is shared**: pnpm hoists `@prisma/client` into the root `node_modules/.pnpm/`. Both playgrounds share a single generated client. If their `prisma/schema/*.prisma` files diverge, `prisma generate` in one clobbers the other's client. Keep schemas identical (each has its own `dev.db`, so data is still isolated).
- **Prisma client wrong repo**: `config/database.ts` passes `PrismaClient: PrismaClient as any` to fix cross-repo resolution
- **Port in use**: `lsof -ti :24679 -ti :3001 | xargs kill -9` (panels) or `lsof -ti :24680 -ti :3003 | xargs kill -9` (pilotiq)
- **Panels server handlers**: `pnpm dev` hot-reloads frontend only; server handlers need `pnpm build` + restart
- **playground-pilotiq needs Tailwind**: `@pilotiq/pilotiq` ships components with Tailwind class names in `className`. The playground's `src/index.css` must `@import "tailwindcss"` with `@source "../../packages/pilotiq/src"` so Tailwind scans pilotiq's components. Without this, the UI renders unstyled.
