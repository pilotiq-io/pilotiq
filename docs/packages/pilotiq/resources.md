# Resources

A `Resource` describes a CRUD-managed entity in your panel — articles, users, categories, products. The class registers with `Pilotiq` and the framework auto-generates four pages from its declarative configuration: a list, a create form, an edit form, and a read-only view.

The `Resource.form()` and `Resource.table()` hooks return [`Form`](./schema.md#form--submit-lifecycle-as-an-element) and [`Table`](./schema.md#table--query-lifecycle-as-an-element) Elements. Those Elements own their own lifecycle (validate → save → redirect for forms; query → sort/search/paginate for tables), so resource pages stay declarative — there's no page-specific lifecycle hook surface to learn.

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

## Folder-per-resource layout (recommended for non-trivial resources)

For larger resources, split the configuration across files in a per-resource folder:

```
app/Pilotiq/Articles/
├── ArticleResource.ts       # binds form / table / detail / pages
├── Pages/
│   ├── ListArticles.ts      # extends ListPage
│   ├── CreateArticle.ts     # extends CreatePage
│   ├── EditArticle.ts       # extends EditPage
│   └── ViewArticle.ts       # extends ViewPage
├── Schemas/
│   └── ArticleForm.ts       # Form configuration helper
└── Tables/
    └── ArticlesTable.ts     # Table columns + actions
```

Each page file is a one-liner subclass binding the Resource:

```ts
// Pages/ListArticles.ts
import { ListPage } from '@pilotiq/pilotiq'
import { ArticleResource } from '../ArticleResource.js'

export class ListArticles extends ListPage {
  static override getResource() { return ArticleResource }
}
```

The base classes (`ListPage`, `CreatePage`, `EditPage`, `ViewPage`) handle all the wiring — slug derivation, form/table construction, model-backed save/loadRecord defaults, default headers and actions. Subclasses only override hooks they want to customize:

```ts
export class EditArticle extends EditPage {
  static override getResource() { return ArticleResource }

  // Custom header above the form
  static override getHeader(R: typeof ArticleResource) {
    return [Heading.make(`Editing ${R.labelSingular.toLowerCase()}`).level(1)]
  }
}

export class ViewArticle extends ViewPage {
  static override getResource() { return ArticleResource }

  // Add Edit + Delete + a custom Publish action above the detail content.
  // ViewPage.getActions returns [] by default — Filament-style explicit.
  static override getActions(R, recordId, basePath) {
    if (!recordId) return []
    return [
      Action.make('publish').label('Publish').handler(async () => {/* … */}),
      Action.edit(R, basePath, recordId),
      Action.delete(R, basePath, recordId),
    ]
  }
}
```

Wire them via `Resource.pages()`:

```ts
// ArticleResource.ts
import { Resource } from '@pilotiq/pilotiq'
import { ArticleForm }   from './Schemas/ArticleForm.js'
import { ArticlesTable } from './Tables/ArticlesTable.js'
import { ListArticles, CreateArticle, EditArticle, ViewArticle } from './Pages/index.js'

export class ArticleResource extends Resource {
  static override label = 'Articles'
  static override model = Article

  static override form(form)  { return ArticleForm.configure(form) }
  static override table(table) { return ArticlesTable.configure(table) }

  static override pages() {
    return { index: ListArticles, create: CreateArticle, edit: EditArticle, view: ViewArticle }
  }
}
```

You can omit `pages()` entirely — the framework auto-generates equivalent anonymous subclasses via `defaultPages(this)`. The folder-per-resource layout is for when you want to customize page hooks; the inline minimal example above still works for simple cases.

---

## The four pages

Each Resource auto-generates four `Page` subclasses via `defaultPages(R)`. The URL conventions are fixed by role:

| Role     | URL                        | Default behavior                                                                |
| -------- | -------------------------- | ------------------------------------------------------------------------------- |
| `index`  | `${base}/${slug}`          | Heading + `Table` from `R.table()`. Sort/search/page query string round-trips.  |
| `create` | `${base}/${slug}/create`   | Heading + `Form` from `R.form()`. POST runs the dispatch lifecycle.             |
| `edit`   | `${base}/${slug}/:id/edit` | `loadRecord(id)` → fill values → render. POST upserts via `save()`.             |
| `view`   | `${base}/${slug}/:id`      | Heading + `R.detail(record)` elements. Edit/Delete are opt-in via `ViewPage.getActions()`. |

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
  query():     ModelQuery   // .where / .orWhere / .orderBy / .paginate / .with / .withCount
}
```

Any class extending `@rudderjs/orm`'s `Model` satisfies this structurally via its static methods. Pilotiq doesn't import `@rudderjs/orm` at runtime — the contract is pilotiq-internal — so users with a different stack can plug in a hand-rolled object.

`ModelQuery` includes the eager-load pair `with(...relations)` / `withCount(arg)` as **required** members (the rudder `QueryBuilder` always ships them), so chaining them on pilotiq-typed builders — `Resource.query()` overrides, `TableWidget.query(q => …)`, `ListTab.modifyQuery(q => …)` — typechecks directly. A hand-rolled builder without eager-load support can stub them as `with() { return this }` / `withCount() { return this }`. The sub-builder inside `whereGroup` / `orWhereGroup` callbacks is the narrower `ModelQueryGroup` (where-family only — matching what rudder actually passes there).

---

## Scoping queries — `Resource.query(ctx)`

Override `static query(ctx)` to install always-on scopes against your resource's table — tenant filters, default ordering, eager-load defaults, status guards, anything you'd otherwise have to remember to chain on every list page and every record load.

```ts
import { Resource, type ModelQuery, type QueryContext } from '@pilotiq/pilotiq'

export class ArticleResource extends Resource {
  static override model = Article

  static override query(ctx?: QueryContext): ModelQuery {
    return super.query(ctx).with('author').withCount('comments').orderBy('createdAt', 'DESC')
  }
}
```

`super.query(ctx)` returns `this.model.query()` — the default. Returning your own chain on top is the common case; replacing it entirely (e.g. for a non-rudder ORM with a different builder) is also fine.

`ctx.user` is whatever your `Pilotiq.user(req => …)` resolver returned — opaque to the framework, your shape:

```ts
static override query(ctx?: QueryContext): ModelQuery {
  const tenantId = (ctx?.user as { tenantId?: string } | undefined)?.tenantId
  return super.query(ctx).where('tenantId', tenantId ?? null)
}
```

**Where the override applies** — every code path that reads from the resource's table:

| Surface                        | Before               | After                                    |
| ------------------------------ | -------------------- | ---------------------------------------- |
| List page (`Table.records()`)  | `model.query()`      | `R.query(ctx).where(filters).paginate(…)` |
| Record load (view / edit page) | `model.find(id)`     | `R.query(ctx).where(pk, id).paginate(1, 1)` |
| Policy lookup before `canX`    | `model.find(id)`     | same — find-by-PK now scoped             |
| Action dispatch record load    | `model.find(id)`     | same                                     |
| Global search (Cmd+K results)  | `model.query().where(…LIKE…)` | `R.query(ctx).where(…LIKE…)`    |
| Reorder (`Table.reorderable()`) | `model.reorder(ids)` | ids first validated via `R.query(ctx).where(pk, 'IN', ids)` — any out-of-scope id 404s the whole batch |
| `Resource.deleteRecord(id)`    | `model.delete(id)`   | unchanged — operates by PK directly (the delete *route* 404s first when `R.query()` can't resolve the id) |

The `findRecord(R, id, ctx?)` helper exported from `@pilotiq/pilotiq` is what pilotiq's routes call for find-by-PK loads. You can use it from your own code (handlers, custom pages) to keep scope semantics consistent:

```ts
import { findRecord } from '@pilotiq/pilotiq'

const record = await findRecord(ArticleResource, id, { user })
if (!record) return res.status(404).send('Not found')
```

**Soft-delete restore / force-delete deliberately bypass `query()`.** They build their own `model.query().withTrashed().where(pk, id)` chain so a scope that hides trashed rows doesn't hide records the operator is trying to recover. If your override needs to apply to those routes too, layer it inside `Resource.canRestore / canForceDelete` instead.

**`getGlobalSearchQuery(needle)`** still wins over `query()` — when set, the override is treated as the entire query (you control the chain, including any tenancy you want to splice in). When unset, the default search query starts from `R.query(ctx)` so scopes apply.

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

### Filters

Tables can declare filters that surface as form controls in the header bar. Each filter contributes a `where` clause to the underlying ORM query when a value is selected. Two built-in kinds:

```ts
import { SelectFilter, BooleanFilter } from '@pilotiq/pilotiq'

table
  .columns([Column.make('title').sortable()])
  .filters([
    SelectFilter.make('status').options([
      { value: 'draft',     label: 'Draft' },
      { value: 'published', label: 'Published' },
    ]),
    BooleanFilter.make('featured').label('Featured'),
  ])
```

Filter values ride in the URL query directly under their filter name (`?status=published&featured=1`). Reserved keys (`search`, `sort`, `page`, `perPage`) can't be used as filter names. Active values mirror back onto the meta so the rendered `<select>` keeps the selection on reload.

Filter dropdowns auto-submit the form on `change`, so changing a filter immediately reloads the table — no explicit Apply button. The search input still submits on Enter.

When `Resource.model` is set, the default `Table.records()` applies filters automatically:

- `SelectFilter` → `query.where(name, value)`
- `BooleanFilter` → `query.where(name, true|false)` (string values `'1'`, `'true'`, `'yes'`, `'on'` map to `true`)

For non-default behavior (range queries, ORM-specific lookups, custom logic), pass a query hook:

```ts
SelectFilter.make('age')
  .options([{ value: '18', label: '18+' }, { value: '21', label: '21+' }])
  .query((query, value) => query.where('age', '>=', Number(value)))
```

The hook receives the running `ModelQuery` plus the active string value and must return the modified query.

### Reorderable rows

Drag-to-reorder is opt-in per table. Pass the model column the new order is written back to:

```ts
table
  .reorderable('sort')
  .columns([
    Column.make('title').sortable(),
    Column.make('status'),
  ])
```

Default column name is `'sort'` (Filament parity). When set, the table renders sorted `(sort, asc)` so the visible order matches the persisted column — `defaultSort()` still wins if you set both. Each row gets a leftmost grip handle; native HTML5 drag-and-drop posts `{ ids }` to `POST {base}/{slug}/_reorder` on drop. The renderer reorders optimistically and rolls back if the POST fails.

The bound model must implement `async reorder(ids)` — pilotiq throws a clear boot error otherwise. The handler re-stamps the configured column 1..n in array order:

```ts
class Post extends Model {
  static override async reorder(ids: Array<string | number>): Promise<void> {
    await Promise.all(ids.map((id, i) =>
      Post.update(id, { sort: i + 1 } as Partial<Post>),
    ))
  }
}
```

Production code should run this in a transaction.

**Drag is locked off when the visible rows aren't the canonical sort.** The grip column greys out when any of these is true: `?search=…` is set, any filter has a value, sort isn't `(reorderColumn, asc)`, or pagination is past page 1. Clear filters / search and sort by the reorder column to re-enable drag.

The `_reorder` route gates on `Resource.canAccess(user)` + `Resource.canEdit(user, undefined)` (record-less, list-level) — your `canEdit` override can branch on `record === undefined` for table-wide reorder vs row-specific edit checks.

### Built-in CRUD actions

The base page classes don't auto-inject any actions. Filament-style: explicit. Pre-built factories ship the standard CRUD shapes:

```ts
import { Action } from '@pilotiq/pilotiq'

Action.create(R, basePath)              // → "New ${R.labelSingular}", links to ${slug}/create
Action.edit(R, basePath, recordId?)     // → links to ${slug}/${id}/edit
Action.view(R, basePath, recordId?)     // → links to ${slug}/${id}
Action.delete(R, basePath, recordId?)   // → POSTs to ${slug}/${id}/delete with confirm prompt
```

`recordId` is optional. Pass it for view-page contexts to bake the URL at config time. Omit it for row contexts — the URL keeps the `:id` template and the renderer substitutes per row.

### Import / Export factories

```ts
Action.export    (R, basePath, opts?)   // header — downloads CSV/JSON
Action.bulkExport(R, basePath, opts?)   // bulk   — exports ctx.records
Action.import    (R, basePath, opts?)   // header — upload + create/upsert
```

`export` walks the table query in pages so the CSV reflects the active filter / search / sort. `import` opens a modal with a `FileUpload`, parses the file, and runs each row through `R.model.create` (or `R.model.update` when `upsertBy` is set). See [Import / Export](./import-export.md) for the full options bag and CSV format details.

**Wire them in two places:**

```ts
// 1. Inline on the table (simplest — no page subclass needed)
static override table(table: Table): Table {
  return table
    .columns([…])
    .headerActions([Action.create(this, this.getBasePath())])  // basePath via plugin / context
    .recordActions([Action.edit(this, basePath), Action.delete(this, basePath)])
}

// 2. On the ListPage subclass (preferred when you need basePath from the schema context)
class ListArticles extends ListPage {
  static override getResource() { return ArticleResource }
  static override getHeaderActions(R, basePath) {
    return [Action.create(R, basePath)]
  }
  static override getRowActions(R, basePath) {
    return [Action.edit(R, basePath), Action.delete(R, basePath)]
  }
  static override getBulkActions(R, basePath) {
    return [Action.bulkDelete(R, basePath)]
  }
}
```

The page-subclass path is usually the right choice because `Resource.table()` doesn't have a `basePath` argument — it doesn't know which panel it's mounted on.

All three hooks default to `[]` (explicit opt-in) and share the same dedup rule: actions you already added inside `Resource.table()` win over same-named hook results.

**`CreatePage` / `EditPage` form submit:**

The submit button renders **in the page header** (right of the title), not at the bottom of the form. The button uses HTML's `form="<id>"` attribute to drive the form below it.

| Default          | Page          | Header button label                                            |
| ---------------- | ------------- | -------------------------------------------------------------- |
| `submit`         | `CreatePage`  | "Create ${labelSingular}"                                      |
| `createAnother`  | `CreatePage`  | "Create & create another" (outlined, secondary)                |
| `submit`         | `EditPage`    | "Save changes"                                                 |
| `submit`         | global edit   | "Save changes"                                                 |

`CreatePage` ships **two** submit buttons by default — a primary "Create" and a secondary outlined "Create & create another". The secondary button posts a sentinel (`_continueCreate=1`) that the create POST handler reads to redirect back to `/create` with a fresh form. The behavior wins over `Form.redirectAfterSave` since the user explicitly asked to keep going. Drop the second button by overriding `getFormActions(R)` to return only the primary submit, or build your own pair via `Action.formField(name, value)`.

Override `CreatePage.getFormActions(R)` / `EditPage.getFormActions(R)` to customize the header buttons. Return `[]` to suppress entirely (e.g. if you compose your own action row inside `R.form()`).

```ts
class ListArticles extends ListPage {
  static override getResource() { return ArticleResource }
  static override getHeaderActions() { return [] }   // hide Create button
}

class EditArticle extends EditPage {
  static override getResource() { return ArticleResource }
  static override getFormActions(R) {
    return [
      Action.make('cancel').label('Cancel').href(`/admin/${R.getSlug()}`),
      Action.make('submit').label('Update').submit(),
    ]
  }
}
```

### How it renders

The default `SchemaRenderer` segregates table actions by placement:

- `header` (and `inline`) — top-right of the list page header bar.
- `bulk` — appears in a toolbar above the table only when ≥1 row is checked. Clicking dispatches with the selected ids.
- `row` — rendered as buttons in a final "Actions" column on each row. Clicking dispatches with that one row's id.

When any bulk action is registered the renderer prepends a checkbox column (with a master checkbox in the header). Selection state lives in React component state, keyed by `row.id`, and survives within-page interaction; navigating to another page resets it.

For confirmation, `Action.confirm('Are you sure?')` triggers `window.confirm()` before the POST. Custom modal UI is a future polish — the dispatch path is the same either way.

---

## Submit lifecycle

`POST ${base}/${slug}/create` and `POST ${base}/${slug}/:id/edit` run the same pipeline through `dispatchFormSubmit(form, body, ctx)`. Mode is inferred from `ctx.record` (undefined → create, set → update); generic hooks fire on both modes, mode-specific ones only on their mode:

```
validateSchema(form.children, body)            ← field-level validators
  → form-level validators                      ← cross-field rules; errors under `_form`
  → mutateData(data, ctx)                      ← both modes
  → mutateDataBeforeCreate / BeforeUpdate      ← mode-specific
  → beforeSave(data, ctx)                      ← both modes
  → beforeCreate / beforeUpdate(data, ctx)     ← mode-specific
  → handleCreate || handleUpdate || save(...)  ← persistence; required (mode override wins over save())
  → afterCreate / afterUpdate(record, ctx)     ← mode-specific
  → afterSave(record, ctx)                     ← both modes
  → redirectAfterSave(record, ctx) → url
```

The edit-mode load path also has hooks:

```
loadRecord(id, ctx)
  → mutateFormDataBeforeFill(values, ctx)
  → fillFromRecord(record)                     ← defaults to { ...record }
  → mutateFormDataAfterFill(values, ctx)
  → form.withValues(...)
```

Configure the hooks at either layer:
- **`Resource.form(form)`** — call `.beforeCreate(...)`, `.savedNotification(...)`, etc. on the `Form` directly.
- **Page subclass static methods** — `class EditArticle extends EditPage { static override beforeUpdate = async data => {...} }`. The page wires its statics onto the form during `schema()`.

See `docs/guide/migrating-from-panels.md#form-lifecycle-hooks` for the full setter inventory.

On validation failure: re-renders the page with `form.withValues(body).withErrors(errors)` and returns 422.

On success: 303-redirects to the URL returned by `redirectAfterSave()`. Defaults are sensible:

- create → `/${base}/${slug}/${record.id}/edit`
- edit   → stays on the edit URL

A success notification is auto-emitted (default `"${R.labelSingular} created"` on create, `"… saved"` on edit). Override via `Form.savedNotification(...)` / `createdNotification(...)` or page static `getCreatedNotificationTitle()` / `getSavedNotificationTitle()`. Returning `null` suppresses the toast. Notifications persist across the 303 redirect via `@rudderjs/session`'s flash primitive — install the session provider in the host app to enable delivery; without it, the 303 path silently drops toasts.

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

## Folder-per-resource layout (recommended for non-trivial resources)

When a resource grows past ~100 lines, split it across a `Resource/` directory with separate `Pages/`, `Schemas/`, and `Tables/` files:

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
