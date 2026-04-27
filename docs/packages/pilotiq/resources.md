# Resources

A `Resource` describes a CRUD-managed entity in your panel — articles, users, categories, products. The class registers with `Pilotiq` and the framework auto-generates four pages from its declarative configuration: a list, a create form, an edit form, and a read-only view.

The Filament/Nova-style `Resource.form()` and `Resource.table()` hooks return [`Form`](./schema.md#form--submit-lifecycle-as-an-element) and [`Table`](./schema.md#table--query-lifecycle-as-an-element) Elements. Those Elements own their own lifecycle (validate → save → redirect for forms; query → sort/search/paginate for tables), so resource pages stay declarative — there's no page-specific lifecycle hook surface to learn.

> **Note** — every method is **static**. Resources register as classes, not instances; the framework calls `Articles.form(...)` directly.

---

## Minimal example

```ts
import { Resource, Form, Table, Column, TextField, TextareaField } from '@pilotiq/pilotiq'
import { app } from '@rudderjs/core'

const prisma = () => app().make('prisma') as any

export class ArticleResource extends Resource {
  static override label         = 'Articles'
  static override labelSingular = 'Article'
  static override slug          = 'articles'      // optional — derived from label
  static override icon          = 'file-text'

  static override form(form: Form): Form {
    return form
      .schema([
        TextField.make('title').required().placeholder('Article title…'),
        TextareaField.make('body'),
      ])
      .loadRecord(async (id) => prisma().article.findUnique({ where: { id } }))
      .save(async (data, ctx) => {
        const existing = ctx.record as { id?: string } | undefined
        if (existing?.id) return prisma().article.update({ where: { id: existing.id }, data })
        return prisma().article.create({ data })
      })
  }

  static override table(table: Table): Table {
    return table
      .columns([
        Column.make('title').sortable().searchable(),
        Column.make('createdAt').label('Created'),
      ])
      .defaultSort('createdAt', 'desc')
      .paginate(10)
      .records(async (ctx) => {
        const where = ctx.search ? { title: { contains: ctx.search } } : undefined
        const orderBy = ctx.sort ? { [ctx.sort.column]: ctx.sort.direction } : undefined
        const perPage = ctx.perPage ?? 10
        const page    = ctx.page    ?? 1
        const [rows, total] = await Promise.all([
          prisma().article.findMany({ where, orderBy, take: perPage, skip: (page - 1) * perPage }),
          prisma().article.count({ where }),
        ])
        return { rows, total }
      })
  }
}
```

Register it on the panel:

```ts
import { Pilotiq } from '@pilotiq/pilotiq'

export const adminPanel = Pilotiq.make('Admin')
  .path('/admin')
  .resources([ArticleResource])
```

That's it. After this you have working list, create, edit, and view pages at `/admin/articles*`.

---

## The four pages

Each Resource auto-generates four `Page` subclasses via `defaultPages(R)`. The URL conventions are fixed by role:

| Role     | URL                        | Default behavior                                                                |
| -------- | -------------------------- | ------------------------------------------------------------------------------- |
| `index`  | `${base}/${slug}`          | Heading + `Table` from `R.table()`. Sort/search/page query string round-trips.  |
| `create` | `${base}/${slug}/create`   | Heading + `Form` from `R.form()`. POST runs the dispatch lifecycle.             |
| `edit`   | `${base}/${slug}/:id/edit` | `loadRecord(id)` → fill values → render. POST upserts via `save()`.             |
| `view`   | `${base}/${slug}/:id`      | Heading + Edit (link) + Delete (form-post) + `R.detail(record)` elements.       |

The 3-segment URL `${slug}/:id` doesn't conflict with `${slug}/create` because Hono's literal-over-param routing matches `/create` first.

### Override per role

`Resource.pages()` is the override hook — return any subset of `{ index, create, edit, view }`:

```ts
class ArticleResource extends Resource {
  // ...form / table as above...

  static override pages() {
    return {
      create: CreateArticle,    // your own Page subclass
      // index, edit, view fall through to defaults
    }
  }
}
```

Missing keys fall through to the auto-generated defaults via `Resource.resolvePages()`.

### What does an override Page look like?

A custom resource page is just a `Page` subclass whose `schema()` returns whatever Element tree you want. For full control, ignore the auto-defaults entirely:

```ts
import { Page, Form, TextField, Heading, Section } from '@pilotiq/pilotiq'

export class CreateArticle extends Page {
  static override slug = 'articles/create'
  static override getMode() { return 'create' as const }
  static override getResource() { return ArticleResource }

  static override schema() {
    return [
      Heading.make('New article').level(1),
      Form.make()
        .schema([
          Section.make('Content').schema([
            TextField.make('title').required(),
            TextareaField.make('body'),
          ]),
        ])
        .save(async data => prisma.article.create({ data }))
        .redirectAfterSave(rec => `/admin/articles/${rec.id}/edit`),
    ]
  }
}
```

Resource pages are no different from custom standalone Pages — same class, just with a non-`'custom'` mode and an optional `getResource()` back-reference.

---

## `Resource` API

| Member                            | Returns / accepts                                              | Purpose                                                              |
| --------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------- |
| `label` / `labelSingular`         | `string`                                                       | Plural ("Articles") + singular ("Article"). Used for nav + headings. |
| `slug`                            | `string`                                                       | URL slug. Optional — derived from `label` when unset.                |
| `icon`                            | `string`                                                       | Sidebar icon name (lucide / tabler / phosphor / remix).              |
| `model?`                          | `string`                                                       | Prisma/ORM model identifier. Phase 3 adapters consume this.          |
| `form(form)`                      | `Form`                                                         | Configure the form used by `create` and `edit` pages by default.     |
| `table(table)`                    | `Table`                                                        | Configure the table used by the `index` page.                        |
| `detail(record)`                  | `Element[]`                                                    | Schema for the read-only `view` page. Receives the loaded record.    |
| `deleteRecord(id)`                | `Promise<void>`                                                | Called by the `POST /:id/delete` route. Default throws.              |
| `pages()`                         | `Partial<{ index, create, edit, view }>`                       | User-overridable page map.                                           |
| `resolvePages()`                  | `{ index, create, edit, view }`                                | Final page map — defaults overlaid with `pages()` overrides.         |
| `getSlug()`                       | `string`                                                       | Returns explicit `slug` if set, else lowercased label.               |
| `relations()`                     | `RelationDef[]`                                                | Reserved for Phase 3+ relations.                                     |

---

## Wiring real persistence

`Resource.form()` is where the persistence story lives. The same `Form` instance is reused by both create and edit pages, so put `loadRecord` + `save` once and both work:

```ts
static override form(form: Form): Form {
  return form
    .schema([
      TextField.make('title').required(),
      TextareaField.make('body'),
    ])
    .loadRecord(async (id) =>
      prisma.article.findUnique({ where: { id } })
    )
    .save(async (data, ctx) => {
      const existing = ctx.record as { id?: string } | undefined
      if (existing?.id) {
        return prisma.article.update({ where: { id: existing.id }, data })
      }
      return prisma.article.create({ data })
    })
}
```

`ctx.record` is set on edit submits (the framework loads the record before dispatching), `undefined` on create. The same handler can branch on it for upsert behavior.

For deletion:

```ts
static override async deleteRecord(id: string): Promise<void> {
  await prisma.article.delete({ where: { id } })
}
```

The `POST ${slug}/:id/delete` route calls this, returns 303 to the list on success, or 500 with the error message on failure.

---

## Submit lifecycle

`POST ${base}/${slug}/create` and `POST ${base}/${slug}/:id/edit` run the same pipeline through `dispatchFormSubmit(form, body, ctx)`:

```
validateSchema(form.children, body)   ← Field-level validators (Phase 1.5)
  → form-level validators            ← cross-field rules; errors under `_form`
  → mutateData(data, ctx)
  → beforeSave(data, ctx)
  → save(data, ctx) → record         ← required; throws if not configured
  → afterSave(record, ctx)
  → redirectAfterSave(record, ctx) → url
```

On validation failure: re-renders the page with `form.withValues(body).withErrors(errors)` and returns 422.

On success: 303-redirects to the URL returned by `redirectAfterSave()`. Defaults are sensible:

- create → `/${base}/${slug}/${record.id}/edit`
- edit   → stays on the edit URL

---

## Field visibility per page

Field flags drop a Field from a specific render mode:

```ts
TextField.make('createdAt').hideFromCreate().hideFromEdit()   // table + view only
TextField.make('apiKey').hideFromTable()                       // hide from list rows
```

Combine with conditional callbacks (evaluated against the loaded record):

```ts
TextField.make('publishedAt').showWhen(r => r.status === 'published')
```

The resolver filters hidden Fields server-side before any plugin resolver runs.

---

## Filament-shaped layout (recommended for non-trivial resources)

When a resource grows past ~100 lines, split it the way Filament does — a `Resource/` directory with separate Pages, Schemas, and Tables files:

```
app/Pilotiq/Resources/Articles/
├── ArticleResource.ts          ← static metadata + Form/Table wiring
├── Pages/
│   ├── ListArticles.ts
│   ├── CreateArticle.ts
│   ├── EditArticle.ts
│   └── ViewArticle.ts
├── Schemas/
│   ├── ArticleForm.ts          ← reusable Form schema (extracted from form())
│   └── ArticleDetail.ts        ← reusable detail() schema
└── Tables/
    └── ArticlesTable.ts        ← reusable Table schema
```

Tiny resources stay one file. The split is a recommendation, not a framework convention — the framework only cares that `pages()` returns Page subclasses; where they live is up to you.

---

## Globals

A singleton resource — site settings, brand config, on-call rotation — uses [`Global`](./globals.md) instead of `Resource`. Same Form-as-Element machinery, no list/create/delete, no `:id` segment in the URL.
