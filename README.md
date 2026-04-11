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
import { Panel, Resource, TextField, EmailField, SelectField, DateField } from '@pilotiq/panels'

class UserResource extends Resource {
  static model = User
  static label = 'Users'

  fields() {
    return [
      TextField.make('name').required().searchable().sortable(),
      EmailField.make('email').required().searchable(),
      SelectField.make('role').options(['user', 'admin']),
      DateField.make('createdAt').readonly().hideFromCreate(),
    ]
  }
}

export const admin = Panel.make('admin')
  .path('/admin')
  .branding({ title: 'My App' })
  .resources([UserResource])
```

**What you get from this:**

- CRUD API at `/admin/api/users` (list, create, read, update, delete)
- Searchable, sortable table with column rendering
- Create/edit forms with validation
- Global search, pagination, filters — all auto-wired

---

## Features

**Core (free, MIT)**

- 20+ field types — text, email, number, date, select, toggle, tags, color, JSON, file, rich-text, relations, repeater, builder
- Schema elements — Stats, Chart, Table, List, Form, Dialog, Dashboard, Wizard
- Inline table editing (inline, popover, modal modes)
- Reactive derived fields — `.from('title').derive(({ title }) => slugify(title))`
- Draft/publish workflow, soft deletes, version history
- Autosave + draft recovery (localStorage backup)
- Global settings pages, custom pages with route params
- i18n with automatic RTL (Arabic, Hebrew, Persian, Urdu)
- Dark mode, theme presets, theme editor with live preview
- Plugin system via `Panel.use()`

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
| [`@pilotiq/panels`](./packages/panels) | Resource builder, forms, fields, schema, registries, theming, i18n, server-side handlers |
| [`@pilotiq/lexical`](./packages/lexical) | Lexical rich-text editor adapter — local-only by default |
| [`@pilotiq/media`](./packages/media) | Media library + `MediaPickerField` |
| [`playground/`](./playground) | Free pilotiq dev fixture — panels + lexical + media on port 3001. No pro deps. |

---

## Quick start

### 1. Install

```bash
pnpm add @pilotiq/panels
```

### 2. Define a resource

```ts
// app/Panels/Admin/resources/ArticleResource.ts
import { Resource, TextField, TextareaField, SelectField, DateField, Section } from '@pilotiq/panels'

export class ArticleResource extends Resource {
  static model         = Article
  static label         = 'Articles'
  static titleField    = 'title'
  static defaultSort   = 'createdAt'
  static defaultSortDir = 'DESC' as const
  static softDeletes   = true
  static versioned     = true

  fields() {
    return [
      Section.make('Content').schema(
        TextField.make('title').required().searchable().sortable(),
        TextareaField.make('excerpt').rows(3),
      ),
      Section.make('Publishing').columns(2).schema(
        SelectField.make('status').options(['draft', 'published']).required(),
        DateField.make('publishedAt').withTime(),
      ),
    ]
  }
}
```

### 3. Create a panel and register it

```ts
// app/Panels/Admin/AdminPanel.ts
import { Panel } from '@pilotiq/panels'
import { ArticleResource } from './resources/ArticleResource.js'

export const adminPanel = Panel.make('admin')
  .path('/admin')
  .branding({ title: 'My CMS' })
  .guard(async (ctx) => ctx.user?.role === 'admin')
  .resources([ArticleResource])
```

```ts
// bootstrap/providers.ts
import { panels } from '@pilotiq/panels'
import { adminPanel } from '../app/Panels/Admin/AdminPanel.js'

export default [
  panels([adminPanel]),
]
```

### 4. Publish the UI and run

```bash
pnpm rudder vendor:publish --tag=pilotiq-pages
pnpm dev
```

Visit `/admin` — your admin panel is ready.

---

## Relationship to RudderJS

Pilotiq is built on top of [RudderJS](https://github.com/rudderjs/rudder), the Laravel-inspired Node.js framework. You'll need:

- Node.js 20+
- `@rudderjs/core` — DI container, application bootstrap
- `@rudderjs/router` — HTTP routing
- `@rudderjs/orm` — ORM (Prisma or Drizzle)
- `@rudderjs/auth` — auth
- Optional: `@rudderjs/cache`, `@rudderjs/storage`, `@rudderjs/live`, `@rudderjs/broadcast`, `@rudderjs/localization`

Pilotiq's packages declare these as peer dependencies. Install both, register the panel provider in your RudderJS app's `bootstrap/providers.ts`, and you're done.

---

## Documentation

| Topic | Link |
|---|---|
| Architecture | [`Architecture.md`](./Architecture.md) |
| Comparison vs Filament/Nova/Payload | [`docs/comparison.md`](./docs/comparison.md) |
| Getting started | [`docs/guide/panels.md`](./docs/guide/panels.md) |
| Fields reference | [`docs/packages/panels/fields.md`](./docs/packages/panels/fields.md) |
| Schema elements | [`docs/packages/panels/schema.md`](./docs/packages/panels/schema.md) |
| Rich-text editor | [`docs/packages/lexical.md`](./docs/packages/lexical.md) |
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
