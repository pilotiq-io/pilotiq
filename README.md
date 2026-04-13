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
import { Pilotiq, Resource, TextField, Column, Heading, Alert, Card } from '@pilotiq/pilotiq'
import { themeEditor } from '@pilotiq/pilotiq/plugins'

class ArticleResource extends Resource {
  static label         = 'Articles'
  static labelSingular = 'Article'
  static icon          = 'file-text'

  table() {
    return {
      columns: [
        Column.make('title').label('Title').sortable().searchable(),
        Column.make('slug').label('Slug'),
        Column.make('createdAt').label('Created'),
      ],
    }
  }

  form() {
    return {
      fields: [
        TextField.make('title').label('Title').required(),
        TextField.make('slug').label('Slug').required(),
      ],
    }
  }
}

export const admin = Pilotiq.make('Admin')
  .path('/admin')
  .branding({ title: 'My App' })
  .theme({ preset: 'nova', accentColor: 'blue', radius: 'medium' })
  .use(themeEditor())
  .resources([new ArticleResource()])
  .schema(async () => [
    Heading.make('Dashboard').description('Welcome back.'),
    Card.make('Getting Started').schema([
      Alert.make('Create your first article to get started.').info(),
    ]),
  ])
```

**What you get from this:**

- Auto-generated Vike pages with sidebar/topbar layouts
- CRUD routes for resources (list, create, edit)
- Dashboard with schema elements (headings, cards, alerts, dividers)
- Dark/light/system theme with OKLCH presets, accent colors, and FOUC prevention
- No vendoring — the `pilotiq()` Vite plugin generates pages automatically

---

## Features

**Core (free, MIT)**

- **Two layout modes** — collapsible sidebar (shadcn) or horizontal topbar
- **Resources** — table + form views with columns, fields, sorting, search
- **Schema system** — Heading, Text, Alert, Divider, Card (nested) — async or static
- **Custom pages** — `Page` class with `static schema()`, slug, label, icon
- **Theme engine** — 4 style presets (default, nova, maia, lyra), 6 base colors, 16 accent colors, 5 chart palettes, 5 border radii, Google Fonts, icon library selection
- **Dark mode** — light/dark/system toggle, localStorage persistence, FOUC prevention via inline script
- **Theme editor** — `.use(themeEditor())` plugin with live preview, save/reset/shuffle, DB persistence
- **Auto page generation** — `pilotiq()` Vite plugin writes Vike page stubs at build time
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
| [`@pilotiq/lexical`](./packages/lexical) | Lexical rich-text editor adapter — local-only by default |
| [`@pilotiq/media`](./packages/media) | Media library + `MediaPickerField` |
| [`playground/`](./playground) | Free pilotiq dev fixture — panels + pilotiq + lexical + media on port 3001 |

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
