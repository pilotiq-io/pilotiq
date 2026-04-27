# Resources

A `Resource` describes a CRUD-managed entity in your panel — articles, users, categories, products. The class registers with `Pilotiq` and the framework auto-generates four pages from its declarative configuration: a list, a create form, an edit form, and a read-only view.

The Filament/Nova-style `Resource.form()` and `Resource.table()` hooks return [`Form`](./schema.md#form--submit-lifecycle-as-an-element) and [`Table`](./schema.md#table--query-lifecycle-as-an-element) Elements. Those Elements own their own lifecycle (validate → save → redirect for forms; query → sort/search/paginate for tables), so resource pages stay declarative — there's no page-specific lifecycle hook surface to learn.

> **Note** — every method is **static**. Resources register as classes, not instances; the framework calls `Articles.form(...)` directly.

---

## Minimal example

The shortest path is to point the Resource at a `@rudderjs/orm` `Model`. Set `static model` and the framework auto-fills `Form.save`, `Form.loadRecord`, `Resource.deleteRecord`, and `Table.records` from the column metadata — no manual ORM plumbing needed.

```ts
import { Resource, Form, Table, Column, TextField } from '@pilotiq/pilotiq'
import { Article } from '../Models/Article.js'

export class ArticleResource extends Resource {
  static override label         = 'Articles'
  static override labelSingular = 'Article'
  static override icon          = 'file-text'
  static override model         = Article

  static override form(form: Form): Form {
    return form.schema([
      TextField.make('title').required().placeholder('Article title…'),
      TextField.make('slug').required(),
    ])
  }

  static override table(table: Table): Table {
    return table
      .columns([
        Column.make('title').sortable().searchable(),
        Column.make('slug').searchable(),
        Column.make('createdAt').sortable().label('Created'),
      ])
      .defaultSort('createdAt', 'desc')
      .paginate(10)
  }
}
```

`Article` is a regular `@rudderjs/orm` Model:

```ts
// app/Models/Article.ts
import { Model } from '@rudderjs/orm'

export class Article extends Model {
  static override table = 'article'      // matches the Prisma client delegate

  id!:        string
  title!:     string
  slug!:      string | null
  createdAt!: Date
  updatedAt!: Date
}
```

You get for free:

- **List** — `Table.records()` paginates `Article.query()`. Every `Column.searchable()` joins via `LIKE`/`orWhere`; `Column.sortable()` + `defaultSort()` map to `orderBy`.
- **Create** — `Form.save()` calls `Article.create(data)`.
- **Edit** — `Form.loadRecord(id)` calls `Article.find(id)`; `Form.save()` discriminates create vs update by `ctx.record[primaryKey]`.
- **Delete** — `Resource.deleteRecord(id)` calls `Article.delete(id)`. Soft-deletes (`Model.softDeletes = true`) work out of the box.
- **Observers / mass-assignment / casts** — anything you set on the Model carries through, since pilotiq goes through `Article.create / .update / .delete` rather than poking the table directly.

Anything you set explicitly still wins: call `form.save(...)`, `form.loadRecord(...)`, `table.records(...)`, or override `Resource.deleteRecord` and that handler runs instead of the model default.

If you don't have a Model handy you can pass any object satisfying `ModelLike` (see [`@pilotiq/pilotiq` orm exports](#modellike-shape-for-non-rudder-orms)) — useful for testing or wiring a different ORM.

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
| `model?`                          | `ModelLike` (`@rudderjs/orm` `Model` or duck-typed object)     | When set, auto-fills save / loadRecord / records / deleteRecord.     |
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

The default path is `static model = …` (see [Minimal example](#minimal-example)) — the framework wires save / loadRecord / records / delete from a `@rudderjs/orm` Model class.

When you need custom logic (a non-rudder ORM, a hand-rolled query, a service-layer call), set the handlers explicitly on the `Form` and they win over the model default. The same `Form` instance is reused by both create and edit pages, so put `loadRecord` + `save` once and both work:

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

### `ModelLike` shape (for non-rudder ORMs)

`Resource.model` accepts any object matching `ModelLike`:

```ts
import type { ModelLike } from '@pilotiq/pilotiq'

export interface ModelLike {
  primaryKey?: string                                              // defaults to 'id'
  find(id):    Promise<unknown>
  create(data): Promise<unknown>
  update(id, data): Promise<unknown>
  delete(id):  Promise<void>
  query():     ModelQuery   // .where / .orWhere / .orderBy / .paginate
}
```

Any class extending `@rudderjs/orm`'s `Model` satisfies this structurally via its static methods. Pilotiq doesn't import `@rudderjs/orm` at runtime — the contract is pilotiq-internal — so users with a different stack can plug in a hand-rolled object.

---

## Action handler dispatch

Actions can render as links (`Action.href(url)`), form-style submits (`Action.method('post').action(url)`), or **handler-style** — a `.handler(ctx)` callback that runs server-side when the button is clicked:

```ts
static override table(table: Table): Table {
  return table
    .columns([Column.make('title')])
    .actions([
      Action.make('markFeatured')
        .label('Mark featured')
        .bulk()
        .confirm('Mark these articles as featured?')
        .handler(async (ctx) => {
          const ids = (ctx.records as { id: string }[]).map(r => r.id)
          await prisma.article.updateMany({
            where: { id: { in: ids } },
            data:  { featured: true },
          })
        }),
    ])
}
```

The route registrar auto-generates a POST endpoint per resource and stamps every handler-style action with its `dispatchUrl` so the client knows where to submit:

| URL                                        | Source page          |
| ------------------------------------------ | -------------------- |
| `POST {base}/{slug}/_action/{actionName}`  | resource index page  |
| `POST {base}/{pageSlug}/_action/{actionName}` | custom page       |

Body shape (form-encoded or JSON):

```jsonc
{
  "ids":     ["1", "2", "3"],   // optional — record ids the action operates on
  "subject": "..."              // any other fields are passed through as ctx.values
}
```

The handler receives an `ActionContext`:

| `ids.length` | Resolved as          |
| ------------ | -------------------- |
| 0            | `ctx.record` / `ctx.records` left empty (header action) |
| 1            | `ctx.record` — single record |
| > 1          | `ctx.records` — array |

When `Resource.model` is set, ids hydrate through `R.model.find(id)` so handlers receive full records. Without a model the framework passes bare `{ id }` stubs.

**Return value:**

- `void` (or async returning `undefined`) — the dispatcher 303-redirects back to the page that triggered the action.
- `{ redirect: '/elsewhere' }` — explicit redirect.
- Throwing an Error returns 500 with the message.

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
