# Getting started

Pilotiq is a schema-driven admin panel for the **RudderJS** ecosystem. It plugs
into an existing RudderJS app (Vike-powered SSR + client routing): a Vite plugin
auto-generates the admin pages, a service provider registers the routes, and you
describe the panel — resources, forms, tables — as plain TypeScript classes.

This guide gets a panel rendering at `/admin`. For the depth on each piece, see
[Resources](./packages/pilotiq/resources.md), [Schema](./packages/pilotiq/schema.md),
and [Layouts](./packages/pilotiq/layouts.md).

## Prerequisites

A working **RudderJS** application (Vike + Vite + React 19). If you don't have
one yet, scaffold it with the RudderJS CLI first — Pilotiq is an addon, not a
standalone framework.

## 1. Install

```bash
pnpm add @pilotiq/pilotiq
```

Pilotiq's `@rudderjs/*` peers (`core`, `router`, `view`, `contracts`) are already
present in a RudderJS app. It also peer-depends on the UI primitives it renders
with — install any your app doesn't already have:

```bash
pnpm add @base-ui/react lucide-react clsx tailwind-merge class-variance-authority react-day-picker
```

## 2. Add the Vite plugin

The plugin reads your panel module (default `app/Pilotiq/AdminPanel.ts`) and
generates the Vike pages under `pages/(pilotiq)/` — including `+Layout.tsx` and a
`_components.ts` manifest. **Never gitignore the generated pages**; they're part
of the build.

```ts
// vite.config.ts
import { pilotiq } from '@pilotiq/pilotiq/vite'

export default {
  plugins: [
    pilotiq(),     // before your framework plugin
    // …rudderjs(), vike(), tailwindcss(), react()
  ],
}
```

Point it elsewhere with `pilotiq({ panels: ['app/Admin/MyPanel.ts'] })`.

## 3. Register the provider

```ts
// bootstrap/providers.ts
import { pilotiq } from '@pilotiq/pilotiq'
import { adminPanel } from '../app/Pilotiq/AdminPanel.js'

export default [
  // …await defaultProviders(),
  pilotiq([adminPanel]),
]
```

This wires the panel's controller routes through `@rudderjs/view`.

## 4. Configure Tailwind

> **Important** — Pilotiq ships Tailwind utility **class names**, not compiled
> CSS, so your Tailwind build must **scan the package** for those classes to be
> generated. Skip this and the panel renders unstyled (or with classes missing
> at random — only those that happen to appear elsewhere in your project work).

**Tailwind v4** — add an `@source` to your main CSS:

```css
@import "tailwindcss";
@source "../node_modules/@pilotiq/pilotiq/dist";
@plugin "@tailwindcss/typography";   /* for rich-text / markdown prose output */
```

Adjust the relative path so it resolves to the installed package's `dist`
(workspace/monorepo setups can point at `src`).

**Tailwind v3** — add it to `content`:

```js
content: ['./node_modules/@pilotiq/pilotiq/dist/**/*.js']
```

Adapter packages ([`@pilotiq/tiptap`](./packages/tiptap.md),
[`@pilotiq/codemirror`](./packages/codemirror.md),
[`@pilotiq/recharts`](./packages/recharts.md)) need their own `@source` entry —
see each adapter's doc.

## 5. Define the panel

```ts
// app/Pilotiq/AdminPanel.ts
import { Pilotiq } from '@pilotiq/pilotiq'
import { ArticleResource } from './Articles/ArticleResource.js'

export const adminPanel = Pilotiq.make('Admin')
  .path('/admin')                 // mount point
  .branding({ title: 'Acme Admin' })
  .locale('en')                   // built-in date/number formatting locale
  .resources([ArticleResource])
```

The panel module is import-safe and runs on both the server and the client (the
generated `_components.ts` re-imports it in the browser to resolve component
icons) — so keep Node-only side effects (upload adapters, DB clients) out of it
and in `bootstrap/providers.ts`.

## 6. Add your first resource

A `Resource` points at a `@rudderjs/orm` Model and the framework auto-generates
the list / create / edit / view pages:

```ts
// app/Pilotiq/Articles/ArticleResource.ts
import { Resource, Form, Table, Column, TextField } from '@pilotiq/pilotiq'
import { Article } from '../../Models/Article.js'

export class ArticleResource extends Resource {
  static override label = 'Articles'
  static override icon  = 'file-text'
  static override model = Article

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
        Column.make('createdAt').sortable().label('Created').since(),
      ])
      .defaultSort('createdAt', 'desc')
  }
}
```

See [Resources](./packages/pilotiq/resources.md) for authorization, relations,
soft deletes, tabs, and more.

## 7. Run

Start your app's dev server and visit **`/admin`** — you'll get the sidebar
shell, an Articles list with search/sort/pagination, and working create/edit/view
pages, all generated from the resource above.

## Next steps

- [Layouts](./packages/pilotiq/layouts.md) — sidebar vs topbar, branding, theme.
- [Schema](./packages/pilotiq/schema.md) — the `Form` / `Table` Element model.
- [Fields](./packages/pilotiq/fields.md) & [Columns](./packages/pilotiq/columns.md).
- [Widgets](./guide/widgets.md) — dashboard stats and charts.
- [Extending Pilotiq](./guide/extending-pilotiq.md) — custom fields, columns, adapters.
