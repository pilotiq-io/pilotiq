# CLAUDE.md

This file provides guidance to Claude Code when working in this repository.

---

## Project Overview

**Pilotiq** is an open-source admin panel builder for RudderJS — Filament/Nova/PayloadCMS for the Node.js ecosystem.

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
- `src/orm/modelDefaults.ts` — `modelSave / modelLoadRecord / modelTableRecords` helpers that take a `ModelLike` (from `@rudderjs/contracts`) and produce Form/Table handlers. `defaultPages(R)` installs them as sentinels when `R.model` is set and the user hasn't supplied a handler. `Resource.deleteRecord` falls through to `R.model.delete(id)` when no override is set. The `ModelLike` / `ModelQuery` interfaces themselves live in `@rudderjs/contracts`; `@rudderjs/orm` ships a compile-time `satisfies ModelLike` check so its `Model` base class can't drift from the contract. Pilotiq does not import `@rudderjs/orm` at runtime.
- `src/Global.ts` — abstract class for singleton resources (site settings, brand config). Same shape as `Resource` minus list/create/delete; ships `{ edit }` by default, `view` opt-in via `pages()`.
- `src/Page.ts` — page class with `static slug/label/icon`, `static schema(ctx)`, plus `static getResource()` (back-reference to owning Resource, undefined for standalone pages) and `static getMode()` returning `'list'|'create'|'edit'|'view'|'custom'`.
- `src/defaultPages.ts` — `defaultPages(R)` returns `{ index, create, edit, view }` Page subclasses auto-generated from `R.form()` / `R.table()` / `R.detail()`. View page builds default Edit (link) + Delete (form-post) actions. Sentinel `save`/`loadRecord` only fire when the user hasn't configured them on the Resource form.
- `src/defaultGlobalPages.ts` — same factory pattern for `Global`; default returns `{ edit }` (Heading + Form). View opt-in.
- `src/Column.ts` — `Column.make(name).label().sortable().searchable()`. Joins the schema tree as a child of `Table`.
- `src/PilotiqRegistry.ts` — globalThis-backed singleton registry, `findByPath()` for route matching
- `src/PilotiqServiceProvider.ts` — Provider + `pilotiq()` factory
- `src/routes.ts` — `registerPilotiqRoutes()` using `view()`. Routes:
  - `GET ${base}` → dashboard schema
  - `GET ${base}/${slug}` → resource list (runs `loadTableRecords` → ships `schemaData`)
  - `GET/POST ${base}/${slug}/create` → create form (POST runs `dispatchFormSubmit`)
  - `GET ${base}/${slug}/:id` → resource view (runs `R.detail(record)`)
  - `GET/POST ${base}/${slug}/:id/edit` → edit form (POST runs lifecycle, 303 redirect on success / 422 + re-render on validation error)
  - `POST ${base}/${slug}/:id/delete` → calls `R.deleteRecord(id)`, 303 to list
  - `GET/POST ${base}/${slug}` (Global) → singleton edit, no `:id`
  - `GET ${base}/${pageSlug}` → custom page schema; can also `POST` if the page schema has a Form
- `src/vite.ts` — `pilotiq()` Vite plugin, generates `(pilotiq)/` pages + `+Layout.tsx` + `+Head.tsx`
- `src/schema/` — Unified `Element` model (Phase 1 foundation):
  - `Element.ts` — abstract base class. Every primitive (Field, Action, display elements) extends this. Contract: `getType()`, `toMeta()`, optional `_children: Element[]`.
  - **Display elements:** `Text`, `Heading`, `Alert`, `Divider`. Containers: `Card`, `Section`, `Tabs`/`Tab`, `Grid` — all hold `children: Element[]`.
  - `resolveSchema()` — async recursive walker; emits `meta.children` for containers; plugin-extensible via `registerResolver(type, fn)`. Filters hidden Fields server-side using `RenderContext { mode?, record?, basePath?, recordId? }`.
- `src/elements/` — first-class container Elements that own their lifecycle:
  - `Form.ts` — `Form.make().schema([...])`, lifecycle setters `validate / mutateData / beforeSave / save / afterSave / redirectAfterSave / loadRecord / fillFromRecord`, render-time setters `withValues / withErrors`. `toMeta()` emits `formId / method / action / values / errors`. Auto-generated `formId` per instance; multi-form pages discriminate via hidden `_formId` input.
  - `Table.ts` — `Table.make().columns([...]).records(fn).defaultSort(col,dir).paginate(n)`. `records(ctx) → { rows, total }` (or bare row array). Render-time setters `withRows / withSort / withSearch / withPage`. `toMeta()` emits `rows / total / currentSort / search / currentPage / perPage / searchable`.
  - `dispatchForm.ts` — `dispatchFormSubmit(form, body, ctx)` runs the lifecycle: `validateSchema` → form-level validators → `mutateData` → `beforeSave` → `save` → `afterSave` → `redirectAfterSave`. Form-level validator errors land under `_form` key. `findForms(elements)` + `selectForm(forms, formId)` for multi-form pages.
  - `dispatchTable.ts` — `parseTableQuery({ search, sort, page, perPage })` normalizes URL params; `loadTableRecords(elements, query)` walks the tree, calls every `Table.records(ctx)` in parallel, mirrors state back via `withRows/withSort/...`.
- `src/fields/` — `Field` (extends `Element`, `getType()` returns `'field'`, `fieldType` discriminates subtypes), 8 subclasses (`TextField`, `EmailField`, `NumberField`, `SelectField`, `TextareaField`, `ToggleField`, `DateField`, `SlugField`), visibility flags (`hideFromTable/Create/Edit/View`) + condition callbacks (`showWhen`, `hideWhen`, `disabledWhen`), validators via `.validate(v|v[])` (see `src/validation/`).
- `src/actions/` — `Action` primitive (single class, `placement: 'inline'|'bulk'|'row'|'header'`, `destructive`, `confirm`, `handler`). Plus link/form modes: `Action.href(url)` for link-style (Edit), `Action.method('post'|'put'|'patch'|'delete').action(url)` for form-style (Delete). The two are mutually exclusive.
- `src/validation/` — Field-level validation. `Validator` is `(value, ctx?) => string|null` plus an optional `serialized: SerializedRule` descriptor mirrored to the client via `FieldMeta.rules`. Built-in helpers: `required()`, `email()`, `minLength(n)`, `maxLength(n)`, `min(n)`, `max(n)`, `pattern(regex)`. `validateSchema(elements, values, record?)` walks any Element tree and returns `{ name → string[] }`. `Field.required()` flag auto-contributes a required check + serialized rule unless an explicit `required()` validator is present.
- `src/theme/` — Theme engine: types, presets (default/nova/maia/lyra), base-colors, accent-colors, chart-palettes, radius, icon-map, `resolveTheme()`, `generateThemeCSS()`
- `src/react/AppShell.tsx` — Picks layout mode, renders sidebar or topbar
- `src/react/ThemeProvider.tsx` — Light/dark/system context, localStorage, CSS var injection
- `src/react/ThemeToggle.tsx` — Sun/moon toggle button (in both layout headers)
- `src/react/layouts/SidebarLayout.tsx` — shadcn Sidebar (collapsible, mobile-responsive)
- `src/react/layouts/TopbarLayout.tsx` — horizontal nav variant
- `src/react/ThemeSettingsPage.tsx` — Full theme editor: controls sidebar + live iframe preview
- `src/react/SchemaRenderer.tsx` — Renders resolved schema elements
- `src/react/ui/` — shadcn primitives (sidebar, button, sheet, separator, tooltip, skeleton, input)
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
