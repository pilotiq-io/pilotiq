# Pilotiq

> The open-source admin and CMS for [RudderJS](https://github.com/rudderjs/rudder), with a built-in agent.

<p>
  <a href="https://github.com/pilotiq-io/pilotiq/actions/workflows/ci.yml"><img src="https://github.com/pilotiq-io/pilotiq/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://www.npmjs.com/package/@pilotiq/panels"><img src="https://img.shields.io/npm/v/@pilotiq/panels" alt="npm version" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="License" /></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-strict-blue" alt="TypeScript" /></a>
</p>

Pilotiq is the Filament-meets-VS-Code admin builder for the Node.js ecosystem. Define resources, fields, and forms with a Laravel-style API, then let the built-in agent help you write and edit content alongside the user.

**Status:** Early development. See [`docs/comparison.md`](./docs/comparison.md) for how Pilotiq compares to Filament, Nova, and Payload.

---

## Why Pilotiq?

Define your admin panel in TypeScript. Pilotiq generates the API and UI automatically — including forms, tables, filters, actions, dashboards, and a rich-text editor.

```ts
import {
  Pilotiq, Resource, Form, Table,
  TextField, Column, SelectFilter, BooleanFilter,
  Heading, Alert, Card,
} from '@pilotiq/pilotiq'
import { themeEditor } from '@pilotiq/pilotiq/plugins'
import { Article } from './app/Models/Article.js'   // @rudderjs/orm Model

class ArticleResource extends Resource {
  static override label         = 'Articles'
  static override labelSingular = 'Article'
  static override icon          = 'file-text'
  static override model         = Article         // ← auto-wires save / loadRecord / records / delete

  static override form(form: Form): Form {
    return form.schema([
      TextField.make('title').required(),
      TextField.make('slug').required(),
    ])
  }

  static override table(table: Table): Table {
    return table
      .columns([
        Column.make('title').sortable().searchable(),
        Column.make('slug').searchable(),
        Column.make('createdAt').sortable(),
      ])
      .filters([
        SelectFilter.make('status').options([
          { value: 'draft',     label: 'Draft' },
          { value: 'published', label: 'Published' },
        ]),
        BooleanFilter.make('featured'),
      ])
      .defaultSort('createdAt', 'desc')
      .paginate(10)
  }
}

export const admin = Pilotiq.make('Admin')
  .path('/admin')
  .branding({ title: 'My App' })
  .theme({ preset: 'nova', accentColor: 'blue', radius: 'medium' })
  .use(themeEditor())
  .resources([ArticleResource])
  .schema(async () => [
    Heading.make('Dashboard').description('Welcome back.'),
    Card.make('Getting Started').schema([
      Alert.make('Create your first article to get started.').info(),
    ]),
  ])
```

**What you get from this:**

- **Working CRUD pages** — list (sort, search, pagination, group banding via `defaultGroup`, footer summaries via `Column.summarize([Sum/Average/Count/Range])`, auto-refresh via `Table.poll(seconds)`, per-row CSS via `Table.recordClasses(fn)`, drag-to-reorder via `Table.reorderable('sort')` + `Model.reorder(ids)`, per-row Edit/Delete), create form, edit form, view page. URLs `${base}/${slug}`, `/create`, `/:id`, `/:id/edit`.
- **Auto-wired persistence** — `Resource.model = Article` (a `@rudderjs/orm` Model) plumbs save / loadRecord / records / delete through the ORM. Override per-method when you need custom logic.
- **Filters** — `SelectFilter` / `MultiSelectFilter` / `BooleanFilter` / `TernaryFilter` (3-state with NULL bucket) / `DateRangeFilter` (`from..to` URL value) render in the table header; values ride in the URL query and feed the ORM `where` clauses. Active selection surfaces as a pill row above the table — `Filter.indicator(string|fn)` overrides the pill text. Auto-submit on change.
- **Filament-style page header** — title left, Save buttons right (`<button form="…">` driving the form below). `CreatePage` ships two submits by default — primary "Create" + outlined "Create & create another" (posts `_continueCreate=1` so the server redirects back to `/create` with a fresh form). Override hooks: `getHeader / getHeaderActions / getRowActions / getFormActions`.
- **Action dispatch** — `Action.handler((ctx) => ...)` POSTs to `${base}/${slug}/_action/{name}` server-side; `ctx.record` (row), `ctx.records` (bulk), `ctx.values` (dialog form fields). Bulk actions get a checkbox column + selection toolbar; row actions get a per-row Actions column.
- **Filament-style file layout** — `app/Pilotiq/Articles/{ArticleResource.ts, Pages/, Schemas/, Tables/}` for non-trivial resources. `ListPage` / `CreatePage` / `EditPage` / `ViewPage` base classes — subclass + `static getResource()` to bind.
- **SSR + SPA dual data path** — every page works both via direct URL (rudder route handler) and via SPA navigation (Vike's `+data` hook). Both call the same per-role data builders in `pageData.ts`.
- **Dark/light/system theme** — OKLCH presets (default, nova, maia, lyra), accent colors, FOUC prevention. `.use(themeEditor())` plugin for live theme editing with DB persistence.
- **No vendoring** — the `pilotiq()` Vite plugin generates Vike page stubs at build time.

---

## Features

**Core (free, MIT)**

- **Two layout modes** — collapsible sidebar (shadcn) or horizontal topbar
- **Resources** — `static form(form: Form)` / `static table(table: Table)` / `static detail(record)`. Auto-wires CRUD when `static model = SomeOrmModel` is set.
- **Relations** — `RelationManager` embeds a related resource's table on a parent record's Edit/View page. Routes auto-register at `${base}/${slug}/:id/${rel}/...` with two-layer authorization (parent `canEdit` + manager `canX`, the latter falling through to the related Resource's policy by default). Scoped to `hasOne` / `hasMany` / `belongsTo` — see [`docs/guide/relations.md`](./docs/guide/relations.md).
- **Schema system** — Heading (with optional right-aligned actions), Text, Alert, Divider, Card, Section (with `.compact()` for tighter outer padding and `.dense()` for tighter inner gap — orthogonal), Tabs, Grid — async or static
- **Fields** — TextField, EmailField, NumberField, SelectField, TextareaField, ToggleField, DateField, SlugField, Hidden, Checkbox, Radio, ToggleButtons (segmented chip control), CheckboxList, Slider, ColorPicker, DateTimePicker, KeyValue, TagsInput (chip-style multi-tag with optional `suggestions([...] | fn)`), FileUpload, Markdown (plain-markdown editor with toolbar + tabbed live preview; `attachFiles` integrates with the panel's UploadAdapter), Repeater, Builder (heterogeneous-row Repeater — `Block.make(name).schema(…)` block types with a picker dropdown, per-block `maxItems` cap, storage `[{ type, data }]`). Both support `.collapsible() / .collapsed() / .accordion()` (one-row-open-at-a-time mode, persisted to localStorage), `.simple(field)` (Repeater only — flat-array storage `[v, v, …]` instead of `[{name: v}]`), `.distinct()` (cross-row uniqueness on inner fields), `.disableOptionsWhenSelectedInSiblingRepeaterItems()` (greys taken Select/Radio/CheckboxList/ToggleButtons options across rows). Plus adapter-package fields: RichText (Tiptap, via `@pilotiq/tiptap`) and CodeEditor (CodeMirror 6, via `@pilotiq/codemirror` — string-id language registry, `'auto' | 'light' | 'dark'` theme, line numbers, indent-aware tab handling). Visibility flags (`hideFromTable/Create/Edit/View`) + condition callbacks (`showWhen`, `hideWhen`, `disabledWhen`). Validators via `.validate(...)` — sync or async (built-in `unique({ model, where?, caseInsensitive? })` probes the DB; ignores the row under edit by default). `live()` + `afterStateUpdated((value, ctx) => …)` + `$get/$set` for reactive forms.
- **Filters** — `SelectFilter` / `MultiSelectFilter` (comma-separated URL value, `where(name,'IN',values)`) / `BooleanFilter` / `TernaryFilter` (yes/no/blank — distinguishes NULL from "any") / `DateRangeFilter` (`from..to`-encoded URL value, with `parseDateRangeValue` helper) / `FormFilter` (arbitrary inner schema; JSON-encoded URL value; `.handle((q, values) => q)` typed callback). More kinds extend the `Filter` base. Custom `query(fn)` hook for non-default ORM behavior. `Filter.indicator(string|fn)` configures the active-filter pill — pills sit above the table with × to clear in place.
- **Actions** — Four modes: `.href(url)` link, `.method(m).action(url)` form-post, `.handler((ctx) => ...)` server-dispatched (`{ ids?, values? }` POST), `.submit()` for `<button type="submit">`. Four placements: `inline`, `header`, `bulk`, `row`. `:id` URL templating for row-level link/form actions.
- **Custom pages** — `Page` class with `static schema()`, slug, label, icon. Or extend the Filament-style `ListPage` / `CreatePage` / `EditPage` / `ViewPage` bases for resource pages.
- **Globals (singletons)** — `Global` class with the same shape minus list/create/delete; renders as `${base}/${slug}` (no `/:id`).
- **Theme engine** — 4 style presets (default, nova, maia, lyra), 6 base colors, 17 accent colors, 6 chart palettes, 5 border radii, Google Fonts + Fontshare (Satoshi), icon library selection
- **Dark mode** — light/dark/system toggle, localStorage persistence, FOUC prevention via inline script
- **Theme editor** — `.use(themeEditor())` plugin with live preview, save/reset/shuffle, DB persistence
- **Auto page generation** — `pilotiq()` Vite plugin writes Vike page stubs + `+data.ts` hooks (for SPA nav) at build time
- **Plugin system** — `.use()` for extending panels

**Legacy panels (`@pilotiq/panels`)**

- 20+ field types, inline editing, draft/publish, version history, i18n with RTL, theme editor
- Being migrated to `@pilotiq/pilotiq`

**Pro features ([pilotiq.io](https://pilotiq.io))**

| Package | Adds |
|---|---|
| `@pilotiq-pro/ai` | PanelAgent runtime, chat sidebar, AI field actions, sub-agent dispatch, conversation persistence |
| `@pilotiq-pro/collab` | Yjs-based real-time collaboration: multi-user cursors, presence, persistence |

Pro packages are commercial. They live in a separate private repo at `pilotiq-io/pilotiq-pro`.

---

## Packages

| Package | Description |
|---|---|
| [`@pilotiq/pilotiq`](./packages/pilotiq) | **New** — View-based admin panel with auto page generation, theme engine, schema system, AppShell layouts |
| [`@pilotiq/panels`](./packages/panels) | **Legacy** — Resource builder with vendored pages, full field system, i18n, theme editor |
| [`@pilotiq/tiptap`](./packages/tiptap) | Tiptap rich-text adapter for `@pilotiq/pilotiq` — slash menu, draggable blocks, custom-block API |
| [`@pilotiq/codemirror`](./packages/codemirror) | CodeMirror 6 code-editor adapter for `@pilotiq/pilotiq` — `CodeEditorField` with syntax highlight, line numbers, language registry |
| [`@pilotiq/lexical`](./packages/lexical) | **Legacy** — Lexical rich-text adapter for `@pilotiq/panels` (sunsets with panels) |
| [`@pilotiq/media`](./packages/media) | Media library + `MediaPickerField` |
| [`playground/`](./playground) | **Panels** demo — panels + lexical + media on port 3001 |
| [`playground-pilotiq/`](./playground-pilotiq) | **Pilotiq** demo — view-based panel on port 3003 |

---

## Quick start

### 1. Install

```bash
pnpm add @pilotiq/pilotiq
```

### 2. Define a panel

```ts
// app/Pilotiq/AdminPanel.ts
import { Pilotiq, Resource, TextField, Column } from '@pilotiq/pilotiq'

class UserResource extends Resource {
  static label = 'Users'
  static labelSingular = 'User'
  static icon = 'users'

  table() {
    return {
      columns: [
        Column.make('name').label('Name').sortable().searchable(),
        Column.make('email').label('Email'),
      ],
    }
  }

  form() {
    return {
      fields: [
        TextField.make('name').label('Name').required(),
        TextField.make('email').label('Email').required(),
      ],
    }
  }
}

export const adminPanel = Pilotiq.make('Admin')
  .path('/admin')
  .branding({ title: 'My App' })
  .theme({ preset: 'nova', accentColor: 'indigo' })
  .resources([new UserResource()])
```

### 3. Register the provider

```ts
// bootstrap/providers.ts
import { pilotiq } from '@pilotiq/pilotiq'
import { adminPanel } from '../app/Pilotiq/AdminPanel.js'

export default [
  pilotiq([adminPanel]),
]
```

### 4. Add the Vite plugin

```ts
// vite.config.ts
import { pilotiq } from '@pilotiq/pilotiq/vite'

export default {
  plugins: [pilotiq(), /* ... */],
}
```

### 5. Run

```bash
pnpm dev
```

Visit `/admin` — your admin panel is ready with dark/light toggle and themed UI.

---

## Relationship to RudderJS

Pilotiq is built on top of [RudderJS](https://github.com/rudderjs/rudder), the Laravel-inspired Node.js framework. You'll need:

- Node.js 20+
- `@rudderjs/core` — DI container, application bootstrap
- `@rudderjs/router` — HTTP routing
- `@rudderjs/view` — View controller routes (used by `@pilotiq/pilotiq`)
- `@rudderjs/orm` — ORM (Prisma or Drizzle)
- `@rudderjs/auth` — auth
- Optional: `@rudderjs/cache`, `@rudderjs/storage`, `@rudderjs/localization`

Pilotiq's packages declare these as peer dependencies. Install both, register the panel provider in your RudderJS app's `bootstrap/providers.ts`, and you're done.

---

## Documentation

| Topic | Link |
|---|---|
| Architecture | [`Architecture.md`](./Architecture.md) |
| Comparison vs Filament/Nova/Payload | [`docs/comparison.md`](./docs/comparison.md) |
| Getting started | [`docs/guide/panels.md`](./docs/guide/panels.md) |
| Relations | [`docs/guide/relations.md`](./docs/guide/relations.md) |
| Migrating from `@pilotiq/panels` | [`docs/guide/migrating-from-panels.md`](./docs/guide/migrating-from-panels.md) |
| Fields reference | [`docs/packages/panels/fields.md`](./docs/packages/panels/fields.md) |
| Schema elements | [`docs/packages/panels/schema.md`](./docs/packages/panels/schema.md) |
| Rich-text editor (Tiptap, new) | [`packages/tiptap`](./packages/tiptap) |
| Code editor (CodeMirror) | [`docs/packages/codemirror.md`](./docs/packages/codemirror.md) |
| Rich-text editor (Lexical, legacy) | [`docs/packages/lexical.md`](./docs/packages/lexical.md) |
| Development setup | [`docs/development.md`](./docs/development.md) |
| Contributing | [`docs/contributing/panels-extension.md`](./docs/contributing/panels-extension.md) |

---

## Development

This is a pnpm + Turborepo monorepo.

```bash
pnpm install
pnpm build       # build all packages
pnpm typecheck   # strict type-checking
pnpm lint        # eslint
pnpm test        # run test suites
pnpm dev         # watch mode
```

For cross-repo development with RudderJS, see [`docs/development.md`](./docs/development.md).

---

## License

[MIT](./LICENSE)
