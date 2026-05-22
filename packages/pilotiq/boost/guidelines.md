# @pilotiq/pilotiq

## Overview

View-based admin panel for RudderJS. A declarative class hierarchy (`Resource`, `Page`, `Action`, schema `Element`s) describes CRUD-managed entities; the framework auto-generates list / create / edit / view pages, table chrome, form validation + submit, and dropdown actions. The Vite plugin generates Vike page stubs at the panel's mount path; the runtime provider registers the routes. No code generation, no codegen step — declare the resource, register it on a panel, the pages exist.

Pilotiq sits on top of `@rudderjs/orm` (ergonomically — `Resource.model = ModelLike` auto-fills `Form.save` / `Form.loadRecord` / `Resource.deleteRecord` / `Table.records`) but doesn't hard-depend on it. Any `ModelLike` shape works (custom ORMs, testing doubles).

## Setup

Two files, two lines each.

**`vite.config.ts`**

```ts
import { pilotiq } from '@pilotiq/pilotiq/vite'

export default defineConfig({
  plugins: [
    pilotiq(),     // before @rudderjs/vite + vike
    rudderjs(),
    vike(),
    tailwindcss(),
    react(),
  ],
})
```

**`bootstrap/providers.ts`**

```ts
import { pilotiq } from '@pilotiq/pilotiq'
import { adminPanel } from '../app/Pilotiq/AdminPanel.js'

export default [
  ...(await defaultProviders()),
  pilotiq([adminPanel]),
] satisfies (new (app: Application) => ServiceProvider)[]
```

`@pilotiq/pilotiq` MUST be in `optimizeDeps.exclude` (it imports `node:fs` server-side and Vite must not pre-bundle for the browser).

## Key Patterns

### Defining a Resource

The shortest path: point `static model` at a `@rudderjs/orm` `Model` and the framework infers CRUD from the column metadata.

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

What you get for free with `static model`:

- **List**: `Table.records()` paginates `Article.query()`. `Column.searchable()` joins via `LIKE`/`orWhere`; `Column.sortable()` maps to `orderBy`.
- **Create**: `Form.save()` calls `Article.create(data)`.
- **Edit**: `Form.loadRecord(id)` calls `Article.find(id)`; `Form.save()` discriminates create vs update by the record's PK.
- **Delete**: `Resource.deleteRecord(id)` calls `Article.delete(id)`. Soft-deletes work out of the box if the Model declares `static softDeletes = true` AND the Resource declares `static softDeletes = true`.
- **Observers / mass-assignment / casts**: anything you set on the Model carries through.

Register on the panel:

```ts
Pilotiq.make('Admin').path('/admin').resources([ArticleResource])
```

This gives working list / create / edit / view pages at `/admin/articles*`. Every method on `Resource` is **static** — Resources register as classes, not instances.

### Folder-per-resource layout (for non-trivial resources)

```
app/Pilotiq/Articles/
├── ArticleResource.ts       # binds form / table / detail / pages
├── Pages/
│   ├── ListArticles.ts      # extends ListPage
│   ├── CreateArticle.ts     # extends CreatePage
│   ├── EditArticle.ts       # extends EditPage
│   └── ViewArticle.ts       # extends ViewPage
├── Schemas/
│   ├── form.ts              # exported form() function
│   └── table.ts             # exported table() function
└── RelationManagers/
    └── CommentsRelationManager.ts
```

### Form Fields

| Field | Renders |
|---|---|
| `TextField` | `<input type="text">` — adds `password()`, `revealable()`, `copyable()`, `mask()`, `prefixAction()`, `suffixAction()` |
| `EmailField` | `<input type="email">` (auto `email()` validator) |
| `NumberField` | `<input type="number">` + `min() / max() / step()` |
| `Slider` | range track |
| `Textarea` | `<textarea>` + `autosize()` / `rows()` |
| `MarkdownField` | textarea + preview tabs |
| `RichTextField` | Tiptap editor (`@pilotiq/tiptap`) |
| `CodeEditorField` | CodeMirror 6 (`@pilotiq/codemirror`) |
| `SelectField` | searchable Select; `options(arr \| fn)`, `createOptionForm()` for inline-create |
| `RadioField` | radio stack |
| `ToggleButtons` | chip-style segmented (sugar over Radio) |
| `CheckboxField` | single checkbox (bool) |
| `CheckboxList` | checkbox stack (`string[]`) |
| `ToggleField` | switch (bool) |
| `TagsInput` | chip multi-tag (`string[]`) |
| `KeyValueField` | key/value rows (`Record<string, string>`) |
| `DateField` / `DateTimePicker` | calendar popovers |
| `ColorPicker` | hex input + swatch |
| `FileUpload` | drop zone (needs `Pilotiq.uploads({ adapter })`) |
| `Repeater` | array-of-subschema with reorderable rows |
| `Builder` | heterogeneous Repeater — each row is one of N block types |
| `HiddenField` | submitted but not rendered |

Every field inherits these setters from `Field`:

```ts
Field.make('name')
  .label('Display label')
  .helperText('Shown below the input')
  .placeholder('e.g. Hello world')
  .default('initial value')
  .prefix('$')                       // or .prefix({ icon: 'dollar' })
  .suffix('USD')
  .required()
  .validate([Field.email(), Field.unique({ model: User })])
  .visible(({ user }) => user.role === 'admin')
  .hidden(rule)
  .disabled(rule)
  .columnSpan(2)                     // inside a Grid / Section.columns(n)
  .live()                            // re-resolve schema on change
  .afterStateUpdated((value, ctx) => ctx.$set('slug', slugify(value)))
  .dehydrated(false)                 // don't submit
  .autofocus()
  .hiddenLabel()
  .disabledOn(['edit'])              // page-mode sugar
  .hiddenOn(['view'])
  .visibleOn(['create', 'edit'])
```

### Form Layouts

```ts
Section.make('Customer details')
  .description('Name and contact info')
  .icon('user')
  .columns(2)
  .schema([
    TextField.make('first'),
    TextField.make('last'),
    TextField.make('email').columnSpan(2),
  ])
```

Section setters: `.description(text)`, `.icon(name)`, `.badge(text)`, `.aside()` (right rail under `Split`), `.compact()`, `.dense()`, `.secondary()` (muted), `.collapsible()`, `.collapsed()`, `.persistCollapsed('key')`, `.afterHeader([Action…])`.

Other layout primitives:

| Element | Use case |
|---|---|
| `Grid` | Named CSS grid; children declare `columnSpan(n)` / `columnStart(n)` |
| `Group` | Chrome-less wrapper — useful for visibility gating without a border |
| `Fieldset` | `<fieldset><legend>` semantics, lighter than Section |
| `Split` | Two-column layout; second child auto-routes to right-rail (or use `Section.aside()`) |
| `Tabs` | Tab strip; each `Tab.make(name).schema([…])` is one panel |
| `Wizard` | Multi-step form. Each `Step.make().schema(...)` validates before advancing |

```ts
Wizard.make()
  .steps([
    Step.make('Account')   .icon('user')      .schema([...]),
    Step.make('Billing')   .icon('credit-card').schema([...]),
    Step.make('Confirm')   .icon('check')     .schema([...]),
  ])
  .skippable()                    // allow forward without saving
  .startOnStep(0)
  .persist(false)                 // disable URL ?step= persistence
```

### Tables

```ts
table
  .columns([
    Column.make('title').sortable().searchable(),
    Column.make('status').badge().colors({ draft: 'gray', live: 'success' }),
    Column.make('createdAt').sortable().since().label('Created'),
  ])
  .defaultSort('createdAt', 'desc')
  .paginate(10)
  .filters([
    SelectFilter.make('status').options({ draft: 'Draft', live: 'Live' }),
    TernaryFilter.make('isPublished').label('Published?'),
    TrashedFilter.make(),         // when softDeletes = true
  ])
  .actions([Action.edit, Action.delete])
  .bulkActions([Action.bulkDelete])
  .reorderable('position')         // drag-handle reorder + persistence
  .persistFiltersInSession()       // 302-restore stored URL slice
  .groups([
    TableGroup.make('status').collapsible(),
  ])
```

Column types: `Column` (text, default), `ImageColumn`, `IconColumn`, `BadgeColumn` / `Column.badge()`, `ColorColumn`, `TextColumn` (rich-display: words/chars/bulleted/markdown/html), `IconColumn`. Common setters: `.sortable()`, `.searchable()`, `.label()`, `.copyable()`, `.tooltip()`, `.formatStateUsing(v => …)`, `.url(rec => '/path')`.

Filters: `Filter` (generic), `SelectFilter`, `TernaryFilter` (yes/no/all), `TrashedFilter`, `QueryBuilderFilter` (runtime constraint builder).

### Actions

`Action` is the unified primitive for buttons — header / row / bulk / form-submit / dropdown items. Same builder, four placement modes (`inline | row | header | bulk`), four mutually-exclusive dispatch modes (`href / method / handler / submit`).

```ts
Action.make('publish')
  .label('Publish')
  .color('success')
  .icon('send')
  .visible(({ record }) => record.status === 'draft')
  .handler(async (ctx) => {
    await ctx.record.publish()
    return { notify: Notification.success('Published') }
  })
```

Built-in factories: `Action.create(...)`, `Action.edit(R, base, id)`, `Action.delete()`, `Action.replicate(R, base, id)`, `Action.restore(...)`, `Action.forceDelete(...)`, `Action.export(...)`, `Action.import(...)`, `Action.bulkDelete()`, `Action.relation*(...)` (attach / detach / bulkDetach).

Add `.schema([…])` to make the action open a form-modal:

```ts
Action.make('reschedule')
  .icon('calendar')
  .schema([DateTimePicker.make('at').required()])
  .handler(async (ctx) => {
    await ctx.record.reschedule(ctx.values.at)
  })
```

Modal chrome setters: `.modalHeading(...)`, `.modalDescription(...)`, `.modalIcon(...)`, `.modalWidth('sm'|'md'|'lg'|'xl')`, `.slideOver()`, `.stickyModalHeader()`, `.closeModalByEscaping(false)`, `.modalContentFooter([Alert, …])`.

Group actions in a dropdown:

```ts
ActionGroup.make('more').label('More').icon('more-horizontal').actions([
  Action.make('export').handler(…),
  Action.make('clone').handler(…),
])
```

### Pages

A Page is "anything with a `schema()`" — the unit of routing, content, and lifecycle. The base `Page` class covers custom pages registered via `panel.pages([AnalyticsPage])`; resource-bound pages can additionally extend `ListPage`, `CreatePage`, `EditPage`, or `ViewPage` to expose override hooks (`getHeader`, `getFormActions`, `beforeCreate`, `afterUpdate`, etc.).

```ts
import { Page, Heading, Card, Text } from '@pilotiq/pilotiq'

class AnalyticsPage extends Page {
  static override slug  = 'analytics'      // optional — derived from class name
  static override label = 'Analytics'
  static override icon  = 'bar-chart-3'

  static override schema(ctx) {
    return [
      Heading.make('Site analytics').level(1),
      Card.make().schema([
        Text.make('Stats coming soon.'),
      ]),
    ]
  }
}
```

Resource page overrides — `static pages()` returns the four (or fewer) bases:

```ts
class ArticleResource extends Resource {
  static override pages() {
    return {
      list:   ListArticles,
      create: CreateArticle,
      edit:   EditArticle,
      view:   ViewArticle,
    }
  }
}

class CreateArticle extends CreatePage {
  static override beforeCreate(data, ctx) {
    data.authorId = ctx.user.id
    return data
  }
}

class EditArticle extends EditPage {
  static override getFormActions(actions: Action[]): Action[] {
    return [
      ...actions,
      Action.make('preview').href(`/preview/${'${ctx.record.id}'}`).color('ghost'),
    ]
  }
}
```

Wizard create-page:

```ts
class CreateArticle extends CreatePage {
  static override getSteps() {
    return [
      Step.make('Content') .schema([TextField.make('title'), MarkdownField.make('body')]),
      Step.make('Publish') .schema([DateField.make('publishAt'), ToggleField.make('isPublic')]),
    ]
  }
}
```

### Authorization

Resources declare `can*` statics; the framework calls them with the resolved user from `Pilotiq.user(req => …)`. Routes fail closed (403 if any predicate returns false).

```ts
Pilotiq.make('Admin')
  .path('/admin')
  .user(async (req) => req.session?.user ?? null)
  .resources([ArticleResource])

class ArticleResource extends Resource {
  static override canAccess(user) { return Boolean(user) }
  static override canView(user, record)   { return user.id === record.authorId || user.role === 'admin' }
  static override canCreate(user)         { return user.role !== 'reader' }
  static override canEdit(user, record)   { return user.id === record.authorId }
  static override canDelete(user, record) { return user.role === 'admin' }
}
```

Per-record gates on collection pages stamp `_visibleActions` / `_disabledActions` on each row before rendering, so server-side eval results are consistent with what the client renders.

### Globals (singleton resources)

`Global` is a singleton-shaped Resource. Same builder, minus list/create/delete; routes are `GET/POST {base}/{slug}` for edit, `GET {base}/{slug}/view` for view.

```ts
class SiteSettings extends Global {
  static override label = 'Site Settings'
  static override icon  = 'settings'
  static override model = Settings
  static override navigationGroup = 'Settings'      // default

  static override form(form) {
    return form.schema([
      TextField.make('siteName').required(),
      Textarea.make('description'),
      ColorPicker.make('brandColor'),
    ])
  }

  static override canAccess(user) { return user.role === 'admin' }
  static override canEdit(user)   { return user.role === 'admin' }
}
```

### Relations

`Resource.relations()` returns `RelationManager[]`. Each manager renders as a tab on the parent resource's view/edit page.

```ts
class ArticleResource extends Resource {
  static override relations(): RelationManagerClass[] {
    return [CommentsRelationManager, TagsRelationManager]
  }
}

class CommentsRelationManager extends RelationManager {
  static override relationName = 'comments'    // Article.comments() relation
  static override label        = 'Comments'
  static override icon         = 'message-square'

  static override table(table) {
    return table.columns([
      Column.make('body').searchable(),
      Column.make('author.name').label('Author'),
      Column.make('createdAt').since(),
    ])
  }

  static override form(form) {
    return form.schema([Textarea.make('body').required()])
  }
}
```

Supports `hasMany`, `belongsToMany` (with pivot extras via `.pivotColumns([…])`), `morphMany`, `morphTo`, `morphToMany`, `morphedByMany`. Use `Action.relationAttach()`, `Action.relationDetach()`, `Action.relationBulkDetach()` for M2M attach/detach UI.

Repeater fields can also be relation-backed via `.relationship('comments')` — same `hasMany`/`morph*`/`M2M` set.

### Reactive fields

`.live()` re-resolves the schema on change; `afterStateUpdated()` fires server-side imperative updates against `$state`:

```ts
TextField.make('title')
  .live()
  .afterStateUpdated((title, ctx) => ctx.$set('slug', slugify(title)))

SelectField.make('country').options(countries).live()
SelectField.make('region').options(({ $get }) => {
  const country = $get('country')
  return country ? regionsFor(country) : {}
})
```

Multi-form pages (record-page with multiple panels) must pin `formId` explicitly: `Form.make().formId('details')`. The auto-fallback covers single-form pages.

Client-only reactivity (no server round-trip): `afterStateUpdatedJs(`$set('slug', $state.title.toLowerCase().replace(/\s+/g, '-'))`)`.

### Theming / Branding

```ts
Pilotiq.make('Admin')
  .branding({ name: 'Acme', logo: '/logo.svg', primaryColor: '#3b82f6' })
  .theme('nova')                                                // built-in preset
  .layout('sidebar')                                            // 'sidebar' | 'topbar'
  .use(themeEditor())                                           // exposes /admin/theme runtime editor
```

Presets: `default`, `nova`, `maia`, `lyra`. Custom themes pass a `Theme` object to `.theme()`.

Plugin-shaped extensions: `.plugins([tiptap(), codeEditor(), recharts()])` — register adapter packages in one call.

## Common Pitfalls

- **`@pilotiq/pilotiq` must be in `optimizeDeps.exclude`.** Pre-bundling pulls `node:fs` into the browser bundle and crashes the dev server with a `node:fs` client error.
- **`static`, not instance.** Every Resource / Page / RelationManager method (`form`, `table`, `relations`, `canAccess`, …) is static. The framework invokes `R.form(…)` directly — instance methods don't run.
- **Folder-per-resource for non-trivial resources.** Inlining everything in `index.ts` becomes unwieldy past two columns of code. Split `Pages/`, `Schemas/`, `RelationManagers/` early.
- **Soft-deletes are two-sided.** `Model.softDeletes = true` (in `@rudderjs/orm`) AND `Resource.softDeletes = true` are both required. Setting only one silently drops the restore/force-delete UI without an error.
- **Multi-form record pages must pin `formId`.** `Form.make().formId('details')` is required when more than one form lives on a single page; otherwise live-resolves cross-talk between forms.
- **Use real per-cell `<a href>` over row `onClick`.** `Column.url(rec => …)` preserves cmd-click, new-tab, middle-click, and screen-reader semantics. Row-level click handlers break all of those.
- **Manual provider composition is fine — auto-discovery is optional.** `bootstrap/providers.ts` can return an explicit array `[pilotiq([panel]), ...]` without invoking `rudder providers:discover`. The doctor warn for "providers manifest missing" doesn't apply.
- **Auto-generated `pages/(pilotiq)/` stubs are gitignored.** Never commit them — the Vite plugin regenerates them on every dev start.

## Key Imports

```ts
import {
  // Builder + provider
  Pilotiq,
  pilotiq,                       // service-provider factory

  // Core classes
  Resource,
  Global,
  Page,
  ListPage,
  CreatePage,
  EditPage,
  ViewPage,
  RelationManager,
  Cluster,                       // group resources under a URL prefix
  Notification,
  AdminPanel,

  // Schema base + layouts
  Form,
  Table,
  Section,
  Tabs,
  Tab,
  Group,
  Fieldset,
  Split,
  Grid,
  Wizard,
  Step,
  Repeater,
  Builder,
  Heading,
  Text,
  Alert,
  Card,
  Divider,
  UnorderedList,

  // Fields
  Field,
  TextField,
  EmailField,
  NumberField,
  Slider,
  Textarea,
  MarkdownField,
  SelectField,
  RadioField,
  ToggleButtons,
  CheckboxField,
  CheckboxList,
  ToggleField,
  TagsInput,
  KeyValueField,
  DateField,
  DateTimePicker,
  ColorPicker,
  FileUpload,
  HiddenField,

  // Tables
  Column,
  ImageColumn,
  IconColumn,
  BadgeColumn,
  ColorColumn,
  TextColumn,
  TableGroup,

  // Filters
  Filter,
  SelectFilter,
  TernaryFilter,
  TrashedFilter,
  QueryBuilderFilter,

  // Actions
  Action,
  ActionGroup,

  // Infolist entries (read-only display)
  Entry,
  TextEntry,
  BadgeEntry,
  IconEntry,
  ImageEntry,
  KeyValueEntry,
  ColorEntry,
  RepeatableEntry,
} from '@pilotiq/pilotiq'

// Subpaths
import { pilotiq } from '@pilotiq/pilotiq/vite'                 // vite plugin
import { useNavigate } from '@pilotiq/pilotiq/react'             // SPA navigate
import { localUpload, s3Upload } from '@pilotiq/pilotiq/uploads' // upload adapters
import { themeEditor } from '@pilotiq/pilotiq/plugins'           // built-in plugins
```

Adapter packages (separate npm packages — install only what you use): `@pilotiq/tiptap` (RichTextField + custom blocks), `@pilotiq/codemirror` (CodeEditorField), `@pilotiq/recharts` (Chart widget).
