# Phase 2 — Resources end-to-end

Make `Resource` a real, usable surface in `@pilotiq/pilotiq`. Phase 1 locked the schema foundation; Phase 2 builds the next layer: **`Form` and `Table` become first-class container Elements that own their own lifecycle**, and resource pages collapse to subclasses of the existing `Page` class. The win, vs. a four-class page hierarchy: there's only one Page abstraction in the framework, every page is "a schema with whatever Elements you want," and form/table behavior lives on the Elements that produce it — not in special page classes.

**Status:** PROPOSED — awaiting alignment.

**Depends on:** Phase 1 (Element / Field / Action / Validation). Brings back the deferred 1.6 work (`Resource.detail()`, `Global` shell, `Column.toMeta()`) at the end as part of 2.6 / 2.7.

**Revises Phase 1 decision #6:** Phase 1 ruled "Form as a schema element? **No** in Phase 1, revisit if a real use-case appears." The use-case appeared (Phase 2): collapsing the page hierarchy via Form-as-Element is materially simpler than a parallel page-class hierarchy. Flipping that decision now.

**Related memory:** `project_phase_1_schema_foundation.md`, `project_pilotiq_package.md`.

---

## Goal

After this phase, a developer can:

```ts
// app/admin/resources/Articles/ArticleResource.ts
class ArticleResource extends Resource {
  static model         = 'Article'
  static label         = 'Articles'
  static labelSingular = 'Article'
  static slug          = 'articles'
  static icon          = 'file-text'

  static form(form: Form): Form {
    return form.schema([
      TextField.make('title').required(),
      TextareaField.make('body'),
      SelectField.make('status').options(['draft','published']),
    ])
  }

  static table(table: Table): Table {
    return table.columns([
      Column.make('title').sortable().searchable(),
      Column.make('status'),
      Column.make('publishedAt').dateTime(),
    ])
  }

  // pages() not overridden — framework generates defaults from form()/table()
}
```

```ts
// app/admin/resources/Articles/Pages/CreateArticle.ts — only when you want to override
class CreateArticle extends Page {
  static schema() {
    return [
      Form.make()
        .schema([
          Section.make('Article').schema([
            TextField.make('title').required(),
            TextareaField.make('body'),
          ]),
          Action.make('save', 'Save').type('submit'),
          Action.make('cancel', 'Cancel').href('/admin/articles'),
        ])
        .save(async (data, ctx) => prisma.article.create({ data }))
        .redirectAfterSave(record => `/admin/articles/${record.id}/edit`)
    ]
  }
}

class ArticleResource extends Resource {
  // ... form/table as above ...
  static pages() {
    return {
      index:  ListArticles,    // or auto-generated default
      create: CreateArticle,   // override
      edit:   EditArticle,     // or auto-generated default
    }
  }
}
```

Trivial resources stay one file (no pages override). Complex resources can split into a folder-per-resource tree (`Pages/`, `Schemas/`, `Tables/`) — that's a recommended pattern, not framework-enforced.

Concretely, after Phase 2:

1. **One `Page` class** (the existing one, lightly extended) covers both custom standalone pages and resource pages. No `ResourcePage` / `ListPage` / `CreatePage` / `EditPage` / `ViewPage` base classes.
2. **`Form` and `Table` are container Elements** that own form/table lifecycle. Children are heterogeneous Elements (Fields + Actions + Sections + Tabs). Submission and listing logic lives on the Element, not on a special page class.
3. `Resource` is a metadata holder + form/table config; **does not** render anything itself.
4. `Resource.pages()` returns `{ index, create, edit, view? }` — each entry is a `Page` subclass. When omitted, the framework generates defaults from `Resource.form()` / `Resource.table()`.
5. The form-submit pipeline runs validation (Phase 1.5), mutation hooks, the user-supplied save callback, and a redirect — all configured on the `Form` Element.
6. Deferred 1.6 work (`Resource.detail()`, `Column.toMeta()`, `Global` shell) lands here, since Resources is now the proper home.

---

## Non-Goals

- **Real persistence layer.** Phase 2 ships with a `Form.save(handler)` the user implements; default throws. Pluggable Prisma/Drizzle adapters are Phase 3.
- **Scaffolder CLI.** `pnpm exec pilotiq make:resource Article` is Phase 3.
- **AI / Collab hooks on pages or Form/Table.** These are first-class Element types, so pro plugins extend them via `registerResolver('form', …)` / `registerResolver('table', …)` — but designing specific AI/Collab seams is Phase 3+.
- **Real-time list updates / optimistic UI.** Phase 2 is server-rendered Vike + form POSTs.
- **Filters / search UI end-to-end.** `Column.searchable()` / `Column.sortable()` round-trip metadata in 2.1; the actual filter UI + query application ships if it fits in 2.5, otherwise Phase 3.
- **Wizard, Dialog, Bulk-action confirmation forms.** Action *placement* and serialization shipped in 1.4; dispatch + confirm-form rendering is Phase 2 only for the four placements, not for compound flows.

---

## Recommended Architecture

### `Form` as a container Element

`Form` extends `Element`. Children are heterogeneous Elements — Fields are the common case, but Sections, Tabs, Grids, and Actions all compose naturally. The Element's lifecycle methods own validate / mutate / save / redirect:

```ts
class Form extends Element {
  // Container — children are arbitrary Elements
  schema(elements: Element[]): this

  // Lifecycle — chained by the user; framework runs them in order on POST
  validate(...validators: Validator[]): this              // form-level validators (cross-field)
  mutateData(fn: (data, ctx) => data): this              // transform before save
  save(fn: (data, ctx) => Promise<record>): this         // user-implemented persistence
  beforeSave(fn: (data, ctx) => void | Promise<void>): this
  afterSave(fn: (record, ctx) => void | Promise<void>): this
  redirectAfterSave(fn: (record, ctx) => string): this

  // Edit-mode loading hook
  fillFromRecord(fn: (record) => data): this              // record → form values
  loadRecord(fn: (id, ctx) => Promise<record>): this      // id → record (for edit pages)

  getType() { return 'form' }
  toMeta() { /* method, action URL, errors slot, ... */ }
}
```

The submit URL is computed from the page's route. The `Form` element serializes only what the client needs (method, action URL, csrf token if applicable, current values in edit mode); handlers stay server-side.

Actions inside the form are normal `Action` Elements — `Action.type('submit')` triggers the Form's lifecycle, anything else is a regular handler / link:

```ts
Form.make()
  .schema([
    TextField.make('title').required(),
    Action.make('save', 'Save').type('submit'),       // submit
    Action.make('cancel', 'Cancel').href('/articles') // link out
  ])
```

### `Table` as a container Element

Same shape, different domain. Children are typically `Column[]` plus `Action[]` (header actions, bulk actions, row actions):

```ts
class Table extends Element {
  schema(elements: Element[]): this  // columns + actions
  columns(cols: Column[]): this      // shorthand
  query(fn: (q: Query, ctx) => Query): this
  defaultSort(col: string, dir?: 'asc' | 'desc'): this
  paginate(perPage: number): this
  // ...

  getType() { return 'table' }
  toMeta() { /* columns meta, sort/filter state, pagination, action slots */ }
}
```

Phase 2 ships `columns()` / `query()` / basic pagination. Filters/search UI deferred to 2.5 or Phase 3.

### `Resource` as metadata holder

Switch from instance methods to **static methods** (resources register as classes, not instances). Routes look up the class, call statics:

```ts
abstract class Resource {
  static model:         string
  static label:         string
  static labelSingular: string
  static slug:          string
  static icon:          string
  static recordTitleAttribute?: string

  static form(form: Form): Form     { return form }
  static table(table: Table): Table { return table }
  static detail(record): Element[]  { return [] }       // ← deferred 1.6 work, lives here
  static pages(): ResourcePages     { return defaultPages(this) }
  static relations(): RelationDef[] { return [] }       // Phase 3+
  static getSlug(): string          { /* derive from class name if unset */ }
}

panel.resources([ArticleResource, CategoryResource])    // classes, not instances
```

`ResourcePages` is `{ index: typeof Page, create: typeof Page, edit: typeof Page, view?: typeof Page }`. Defaults are auto-generated `Page` subclasses that wrap `Form.make().schema(R.form())` / `Table.make().columns(R.table())` etc.

### One `Page` class, no hierarchy

The existing `src/Page.ts` already does what we need: `static slug`, `static label`, `static icon`, `static schema(ctx)`. Lightly extend it:

- `static getResource?(): typeof Resource` — optional back-reference for resource pages (auto-set on auto-generated defaults; user sets it on subclasses for breadcrumb / title resolution).
- `static getMode?(): 'list' | 'create' | 'edit' | 'view' | 'custom'` — optional discriminator the framework uses for default rendering, breadcrumbs, route generation. `'custom'` (default) is for standalone pages.
- That's it. Everything else (form lifecycle, table query, header actions, redirect) moves onto the `Form` / `Table` / `Action` Elements inside the schema.

The four "page modes" are conventions enforced only by what `schema()` returns:

| Mode     | Returns                                                    |
| -------- | ---------------------------------------------------------- |
| `list`   | `[Table.make().columns(...)]` (or full custom schema)      |
| `create` | `[Form.make().schema([...]).save(handler)]`                |
| `edit`   | `[Form.make().schema([...]).save(handler).loadRecord(fn)]` |
| `view`   | `[/* schema from Resource.detail(record) */]`              |
| `custom` | anything                                                   |

Subclassing a default page = subclassing `Page` and overriding `schema()` to customize whatever Element matters. No hook surface to design at the Page level.

### Defaults — how the framework auto-generates pages

When `Resource.pages()` isn't overridden (or only some keys are), the framework fills in defaults. Pseudocode:

```ts
function defaultPages(R: typeof Resource) {
  return {
    index:  defaultListPage(R),
    create: defaultCreatePage(R),
    edit:   defaultEditPage(R),
  }
}

function defaultCreatePage(R: typeof Resource): typeof Page {
  return class extends Page {
    static getResource() { return R }
    static getMode()     { return 'create' as const }
    static slug          = `${R.getSlug()}/create`

    static schema() {
      const form = R.form(Form.make())
      return [
        Heading.make(`Create ${R.labelSingular}`).level(1),
        form
          .save(async () => { throw new Error(`${R.name}: no save handler`) }) // user must override
          .redirectAfterSave((record) => `/${R.getSlug()}/${(record as any).id}/edit`),
      ]
    }
  }
}
```

Same shape for `defaultListPage` (returns `[Heading, Table.make().columns(...)]`) and `defaultEditPage` (adds `.loadRecord()` + uses route param for id). User overrides land by providing their own `Page` subclass in `pages()`.

### Naming

- **Existing `Page`** stays — covers both custom pages and resource pages. Documented as "a Page is anything with a schema()."
- **No `ResourcePage` / `ListPage` / `CreatePage` / `EditPage` / `ViewPage`** classes in the framework. User subclasses pick their own names (`ListArticles`, `CreateArticle`, etc.) — they're just `Page` subclasses.
- `Form`, `Table`, `Column` are Elements alongside `Section`, `Tabs`, `Grid`.

### Route wiring

`registerPilotiqRoutes` currently hardcodes the list/create/edit handlers. Refactor so each handler:

1. Looks up the resource class.
2. Looks up the page class via `Resource.pages()[role]`.
3. Calls `page.schema(ctx)` → resolved Element tree (already includes Form/Table).
4. Hands off to Vike (`view('pilotiq.slug', { schemaData, ... })`).

Vike stubs collapse — every page route renders `<SchemaRenderer>` with whatever schema it received. No more inline `<form>` / `<table>` HTML in the stub generator.

**Form submit POST routes** — new in Phase 2:
- `POST /{base}/{slug}/create` and `POST /{base}/{slug}/{id}/edit`.
- Handler resolves the page → finds the `Form` Element in the schema (first form, or named `data-form-id` for multi-form pages) → runs the lifecycle:
  1. `validateSchema(form.children, body)` (Phase 1.5).
  2. On error: re-render the page view with `errors` in viewProps; SchemaRenderer reads `errors[fieldName]` and shows inline messages.
  3. On success: `mutateData()` → `beforeSave()` → `save()` → `afterSave()` → redirect via `redirectAfterSave()`.

For pages with multiple forms, each `Form` element gets a generated `formId`; submit posts include the id so the server runs the right lifecycle.

### Bringing back deferred 1.6 work

- **`Resource.detail()`** returning `Element[]` → ships in 2.1 alongside the Resource refactor. Used by the auto-generated `view` page (when present).
- **`Column.toMeta()`** → ships in 2.1 alongside the `Table` builder. Column joins the resolver tree.
- **`Global` class shell** → ships in 2.7 as a slimmed-down `Resource` (single record, no list page, no create page; `pages()` returns `{ edit, view? }`).

---

## Decisions (recommended answers)

These are the calls the human needs to confirm before implementation. (Several settled in conversation; included here as the record.)

| # | Question | Recommendation |
|---|---|---|
| 1 | Static methods on Resource vs instance? | **Static.** Resources register as classes. Migration is mechanical. |
| 2 | Unified `Page` class for both custom and resource pages? | **Yes (settled in conversation).** The existing `Page` covers it. No `ResourcePage` / `ListPage` / etc. |
| 3 | `Form` and `Table` as container Elements with their own lifecycle? | **Yes (settled in conversation).** Revises Phase 1 decision #6. Form owns validate/mutate/save/redirect; Table owns query/columns/filters. |
| 4 | Submit-action: dedicated Action subclass or `Action.type('submit')`? | **`Action.type('submit')`.** Keep one Action class (matches the 1.4 decision); `type` is just another field. |
| 5 | `Resource.pages()` returns a record or an array? | **Record** (`{ index, create, edit, view? }`). Lookup by role. |
| 6 | Where does the user-supplied `save()` live — on `Form` (every form has its own) or on `Resource` (one method, mode-discriminated)? | **On `Form`.** Pages with multiple forms get per-form save naturally; single-form pages cost nothing extra. |
| 7 | Form submit error UX? | **Re-render the page view with `errors` in viewProps**, scroll to first error. SchemaRenderer reads `errors[fieldName]`. Client-side mirror via Phase 1.5's `FieldMeta.rules` for live UX before submit. |
| 8 | Optimistic / live tables? | **Out of scope.** Phase 3+. |
| 9 | Filter / search UI? | **Metadata round-trips in 2.1**, UI ships if it fits in 2.5; otherwise Phase 3. |
| 10 | Where do `Resource.detail()` and `Global` actually land? | **`detail()` and `Column.toMeta()` in 2.1**, **`Global` in 2.7.** |

---

## Implementation Order (sub-phases within Phase 2)

Each sub-phase is mergeable on its own. None of them break existing playground behavior — the playground stays on the current Resource shape until 2.1 lands; subsequent sub-phases preserve the playground's resources working as before via the auto-generated default pages.

### 2.1 — `Resource` migration + `Form` / `Table` / `Column` Elements
- New `Resource` shape: static methods (`form`, `table`, `detail`, `pages`, `relations`).
- New `Form` Element: container, holds `schema()` + lifecycle setters (no dispatch yet).
- New `Table` Element: container, holds `columns()` + `query()` + `paginate()` (no dispatch yet).
- `Column` gains `toMeta()` and joins the resolver tree (deferred 1.6 work).
- Update `playground-pilotiq` resources to the new shape (instance → class, instance methods → static).
- **Tests:** Resource discovery via class name; Form/Table builder serialization; Column toMeta round-trip; resolver walks Form/Table children.

### 2.2 — `Page` extension + auto-generated default pages
- Lightly extend `Page`: `static getResource?()`, `static getMode?()`.
- Implement `defaultPages(R)` factory — auto-generates index/create/edit pages from `R.form()` / `R.table()`.
- `Resource.pages()` returns defaults when not overridden; user-provided pages merge over defaults (per-key).
- **No new routes yet** — pages are resolvable but not wired in.
- **Tests:** default-page generation, override merging, slug derivation, `getResource()` back-reference.

### 2.3 — Wire routes through Page classes
- Refactor `registerPilotiqRoutes` to resolve `Resource.pages()[role]` and call `page.schema(ctx)`.
- Update Vike stubs in `vite.ts` to render whatever schema they receive — drop hardcoded list/form HTML.
- **Tests:** route → page-class → resolved schema → viewProps round-trip.

### 2.4 — Form submit lifecycle (read-only hooks first, then save)
- New `POST` routes for create / edit; resolve the `Form` Element, run the pipeline.
- Pipeline: `validateSchema()` → `mutateData()` → `beforeSave()` → `save()` (user impl) → `afterSave()` → redirect.
- Errors re-render the form view with `errors` in viewProps.
- **Tests:** happy path, validation failure path, mutate-data hook order, redirect destination, multi-form pages (form id discrimination).

### 2.5 — Table query lifecycle + (optional) filter UI
- `Table.query()` runs server-side against the configured ORM/query helper (Prisma stub for the playground).
- Pagination / sort / search wired through `Column.sortable()` / `Column.searchable()` metadata.
- **If it fits**: minimal filter UI from `Column.searchable()` / `Column.sortable()`. Otherwise punt to Phase 3.
- **Tests:** query composition, sort behavior, search filtering, pagination.

### 2.6 — `Resource.detail()` round-trip + `view` page support
- Auto-generated `view` page calls `Resource.detail(record)`.
- Header actions on view pages (Edit / Delete) compose normally as `Action` Elements.
- **Tests:** detail rendering, override flow, action composition on view pages.

### 2.7 — `Global` class shell
- `Global` extends `Resource` minus list/create — single-record edit/view.
- `Global.pages()` returns `{ edit, view? }`.
- **Tests:** Global panel registration, edit-only routing.

### 2.8 — Documentation pass
- Update CLAUDE.md (new Resource API, Form/Table/Column Elements, page composition pattern).
- Update `docs/packages/pilotiq/schema.md` with Form/Table reference.
- Add `docs/packages/pilotiq/resources.md` and `docs/packages/pilotiq/pages.md`.
- Add a folder-per-resource example in playground-pilotiq.

---

## Open Questions for the User

Before kicking off 2.1, these need confirmation:

1. **Submit action shape — `Action.type('submit')` vs a dedicated `SubmitAction` subclass?** Recommendation: `type('submit')` field on the existing Action. Matches the Phase 1.4 decision (one Action class, placement-discriminated).
2. **`save()` and friends on `Form` (every form has its own) vs on `Resource` (one method, mode-discriminated)?** Recommendation: on `Form` — per-form lifecycle is natural for multi-form pages, and single-form pages pay nothing extra.
3. **Should Phase 2 include filter/search UI, or push to Phase 3?** Recommendation: push UI to Phase 3, but ship the metadata (`Column.searchable()` / `sortable()` round-trip) in 2.1 so we don't break it later.
4. **Form submit error UX — re-render server-side with errors, or hand off to client-side validation?** Recommendation: server-side re-render is the fallback; client-side mirror via `FieldMeta.rules` (Phase 1.5) for live UX before submit. Progressive enhancement.
5. **Multi-form page submit discrimination — generated `formId` on `<form>`, or a single Form per page?** Recommendation: generated `formId`, so a settings page with three Forms still works. Cost is one hidden input + one server-side lookup.

---

## Risks & Mitigations

- **Risk: Form-as-Element makes the resolver pipeline more complex** because Form has both children AND lifecycle state to serialize.
  - *Mitigation:* lifecycle stays server-side (handlers don't ship to the client). `Form.toMeta()` only emits action URL, method, csrf, current values, errors. Children resolve normally via the existing recursive walker.

- **Risk: auto-generated default Pages drift from custom user Pages** (different rendering, breadcrumbs, etc.).
  - *Mitigation:* defaults are *just `Page` subclasses written by the framework* — they go through the same resolution path as user code. There's no "default rendering path" parallel to "custom rendering path."

- **Risk: switching Resource from instance methods to static methods breaks the playground.**
  - *Mitigation:* 2.1 ships the migration in one PR alongside the playground update. Net change is mechanical (`new ArticleResource()` → `ArticleResource`, `R.form()` → `R.form(Form.make())`).

- **Risk: form-submit lifecycle hooks (mutateData, before/after) don't compose with the validation runner from 1.5.**
  - *Mitigation:* the order is validation → mutateData → save. `mutateData` runs *after* validation passes, so it doesn't observe invalid data. Hooks are not validators.

- **Risk: pro plugins (AI, Collab) need extension seams beyond what's in the plan.**
  - *Mitigation:* `Form` and `Table` are first-class Element types; pro plugins extend them via `registerResolver('form', …)` — same plugin extension point Phase 1 ships. Specific AI/Collab hooks (e.g. "AI suggests a value for this field") are Phase 3, designed against the 2.x API.
