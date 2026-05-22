# Page Overrides

Resources auto-generate four pages — list / create / edit / view. The defaults render `Resource.table()` / `Resource.form()` / `Resource.detail()` with sensible chrome. Subclass the corresponding base only when you need to override a hook.

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
```

You can return any subset — omit a key to keep the framework default. Dropping a key (`{ list: ListArticles }` only) also suppresses the corresponding sub-nav tab on record pages.

## CreatePage hooks

```ts
import { CreatePage, Action, Notification } from '@pilotiq/pilotiq'

class CreateArticle extends CreatePage {
  static override getResource() { return ArticleResource }

  // Stamp values onto the data BEFORE validation
  static override mutateFormDataBeforeCreate(data, ctx) {
    data.authorId = ctx.user.id
    return data
  }

  // Or mutate AFTER validation, just before the model call
  static override beforeCreate(data, ctx) {
    data.slug = data.slug ?? slugify(data.title)
    return data
  }

  // Run side-effects AFTER create
  static override async afterCreate(record, ctx) {
    await sendNewArticleNotification(record)
  }

  // Override the success notification title
  static override getCreatedNotificationTitle(record, ctx) {
    return `${record.title} drafted — ready for review`
  }

  // Customize the redirect target
  static override getRedirectUrl(record, ctx) {
    return `${ctx.basePath}/articles/${record.id}/edit`
  }

  // Add a secondary submit ("Save as draft") alongside the default
  static override getFormActions(R) {
    return [
      Action.make('submit').label('Publish').color('primary').submit(),
      Action.make('draft').label('Save as draft').outlined().submit().formField('_continueCreate', '1'),
    ]
  }
}
```

By default, `CreatePage.getFormActions(R)` ships TWO submits — the primary `submit` ("Create Article") plus an outlined secondary `createAnother` ("Create & create another"). Override to drop the second, or to add more.

## CreatePage wizard mode

For multi-step create flows:

```ts
import { Step, TextField, DateField, ToggleField, MarkdownField } from '@pilotiq/pilotiq'

class CreateArticle extends CreatePage {
  static override getResource() { return ArticleResource }

  static override getSteps(R) {
    return [
      Step.make('Content')
        .icon('file-text')
        .schema([
          TextField.make('title').required(),
          MarkdownField.make('body'),
        ]),
      Step.make('Publish')
        .icon('send')
        .schema([
          DateField.make('publishAt'),
          ToggleField.make('isPublic'),
        ]),
    ]
  }

  static override getWizard(wizard, R) {
    return wizard.skippable().startOnStep(0).persistStepInQueryString('step')
  }
}
```

When `getSteps()` returns a non-empty array, the framework wraps `R.form()` in a Wizard. Per-step validation reuses the same partial-resolve endpoint as reactive fields. Author the fields directly inside `Step.make(label).schema([…])` — they REPLACE the `Resource.form()` children.

## EditPage hooks

```ts
class EditArticle extends EditPage {
  static override getResource() { return ArticleResource }

  static override mutateFormDataBeforeFill(data, ctx) {
    // Modify data BEFORE it populates the form (e.g. expanding JSON columns)
    return { ...data, metadata: JSON.parse(data.metadata ?? '{}') }
  }

  static override mutateFormDataBeforeSave(data, ctx) {
    // Modify data BEFORE the save (e.g. re-stringifying JSON columns)
    return { ...data, metadata: JSON.stringify(data.metadata) }
  }

  static override beforeUpdate(data, ctx) { /* … */ return data }
  static override async afterUpdate(record, ctx) { /* … */ }

  static override getSavedNotificationTitle(record, ctx) {
    return `${record.title} saved`
  }

  // Add a "Preview" action next to Save in the form header
  static override getFormActions(actions, R, ctx) {
    return [
      ...actions,
      Action.make('preview')
        .label('Preview')
        .icon('eye')
        .color('ghost')
        .href(`/preview/${ctx.record.id}`),
    ]
  }
}
```

Form lifecycle order (every hook is async-aware):

1. `mutateFormDataBeforeFill` (edit only) — modify record before it populates form
2. `loadRecord` (auto-wired from `static model`) — read the record
3. *(user fills form, submits)*
4. validate
5. `mutateFormDataBeforeSave` / `mutateFormDataBeforeCreate` / `mutateFormDataBeforeUpdate`
6. `beforeCreate` / `beforeUpdate`
7. `save` (auto-wired from `static model`) — actual model call
8. `afterCreate` / `afterUpdate`

All form-mutation hooks accept `(data, ctx)` and return the (possibly modified) data. Side-effect hooks (`after*`) return void.

## ListPage hooks

```ts
class ListArticles extends ListPage {
  static override getResource() { return ArticleResource }

  // Header actions appear in the top-right of the list page header
  static override getHeaderActions(R, base) {
    return [
      Action.create(R, base),                 // built-in factory
      Action.make('import').label('Import CSV').icon('upload').schema([
        FileUpload.make('file').required(),
      ]).handler(handleImport),
    ]
  }

  // Per-row actions (right-most cell)
  static override getRowActions(R, base) {
    return [
      Action.edit(R, base),
      Action.replicate(R, base),
      Action.delete(),
    ]
  }

  // Bulk actions (shown when 1+ rows selected)
  static override getBulkActions(R, base) {
    return [
      Action.bulkDelete(),
      Action.make('archive').label('Archive selected').handler(handleBulkArchive),
    ]
  }

  // List tabs (above the table)
  static override getTabs() {
    return [
      ListTab.make('all').label('All').default(),
      ListTab.make('drafts').label('Drafts').badge(async () => Article.where('status', 'draft').count())
        .modifyQuery(q => q.where('status', 'draft')),
      ListTab.make('published').label('Published')
        .modifyQuery(q => q.where('status', 'published')),
    ]
  }
}
```

Action factories: `Action.create(R, base)`, `Action.edit(R, base, recordId)`, `Action.view(R, base, recordId)`, `Action.delete()`, `Action.replicate(R, base, recordId, opts?)`, `Action.restore(...)`, `Action.forceDelete(...)`, `Action.export(R)`, `Action.import(R)`, `Action.bulkDelete()`, `Action.bulkRestore()`, `Action.bulkForceDelete()`, `Action.bulkReplicate(R, base, opts?)`, `Action.bulkExport(R)`.

By default the action slots are empty — Filament-style explicit opt-in. The factories also auto-attach `.visible(...)` rules consulting the matching `canX` policy.

## ViewPage hooks

```ts
class ViewArticle extends ViewPage {
  static override getResource() { return ArticleResource }

  static override async getRecord(id, ctx) {
    // Override the default Article.find — useful for eager-loading relations
    return Article.with('author', 'tags').find(id)
  }

  static override getInfolistActions(R, base, ctx) {
    return [Action.edit(R, base, ctx.record.id)]
  }
}
```

## Custom (non-resource) pages

Plain `Page` subclasses register via `panel.pages([…])`:

```ts
import { Page, Heading, Card, Text } from '@pilotiq/pilotiq'

class AnalyticsPage extends Page {
  static override slug  = 'analytics'      // optional — derived from class name
  static override label = 'Analytics'
  static override icon  = 'bar-chart-3'
  static override navigationGroup = 'Reports'

  static override schema(ctx) {
    return [
      Heading.make('Site analytics').level(1),
      Card.make().schema([
        Text.make(`Welcome, ${ctx.user.name}. Stats coming soon.`),
      ]),
    ]
  }

  static override async canAccess(user) {
    return user.role === 'admin'
  }
}
```

```ts
Pilotiq.make('Admin').path('/admin').pages([AnalyticsPage])
```

URL is `${base}/${slug}`. The `schema(ctx)` receives a `SchemaContext` with `mode`, `recordId`, `basePath`, `user`, and `record` (for record-mode sub-pages).

## Record sub-pages

For per-record secondary pages (e.g. an "audit log" tab on each Article record), declare under `Resource.pages().record`:

```ts
class ArticleResource extends Resource {
  static override pages() {
    return {
      edit: EditArticle,
      record: {
        audit: AuditLogPage,
        activity: ActivityPage,
      },
    }
  }
}

class AuditLogPage extends Page {
  static override slug = 'audit'
  static override label = 'Audit Log'
  static override icon  = 'clipboard-list'

  static override schema(ctx) {
    return [
      // ctx.record is the loaded Article
      Heading.make(`Audit log for ${ctx.record.title}`),
      Table.make().records(async () => AuditEntry.where('articleId', ctx.record.id).get()),
    ]
  }

  static override async canAccess(user, record) {
    return user.id === record.authorId || user.role === 'admin'
  }
}
```

URLs become `${base}/articles/:id/audit`. The sub-page slug shows as a tab in the record's sub-nav strip between `__edit` and the relation managers, in declaration order.

## Common pitfalls

- **Don't put lifecycle hooks on the Resource itself.** `Resource.beforeCreate` won't run — only `CreatePage.beforeCreate` does. The framework calls hooks on the page, not the resource.
- **`getRowActions` defaults to `[]` (Filament-style explicit).** A bare `ListPage` gets no Edit/Delete buttons until you opt in via override or `Resource.table().recordActions([...])`.
- **`getFormActions(actions, R, ctx)` vs `getFormActions(R)`.** EditPage takes the existing actions array as the first arg (so you can spread + extend); CreatePage takes only `(R)` (since it builds the action list itself).
- **Mode-specific behavior** — `Field.disabledOn(['edit'])` / `visibleOn(['create'])` / `hiddenOn(['view'])` are easier than splitting form() per page.
