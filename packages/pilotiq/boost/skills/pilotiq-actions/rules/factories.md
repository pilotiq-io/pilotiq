# Built-in Action Factories

Pilotiq ships ~25 pre-built `Action.*` factories for the operations every admin panel needs. They handle dispatch wiring, visibility gating, chrome, and notification copy — most of the time you reach for one of these instead of `Action.make(...)`.

## CRUD basics (single row)

```ts
import { Action } from '@pilotiq/pilotiq'

Action.create(R, base)              // header — "Create <Label>"; href = `${base}/${slug}/create`
Action.edit(R, base, recordId)      // row — pencil icon; href = `${base}/${slug}/:id/edit`
Action.view(R, base, recordId)      // row — eye icon; href = `${base}/${slug}/:id`
Action.delete(R, base, recordId)    // row — trash icon; method POST → `${base}/${slug}/:id/delete` with .confirm()
```

Each delegates visibility to the matching Resource policy (`canCreate` / `canEdit` / `canView` / `canDelete`) automatically — see `visibility-and-authorization.md` § Composing with Resource policies.

## Replicate

```ts
Action.replicate(R, base, recordId, {
  excludeAttributes:    ['name', 'slug'],     // strip these in addition to PK + soft-delete column
  beforeReplicaSaved:   async (replica, source) => {
    replica.name = `Copy of ${source.name}`
    replica.slug = await generateSlug(replica.name)
  },
  getCreatedNotificationTitle: ({ replica, source }) => `Cloned "${source.title}"`,
  getRedirectUrl:       ({ replica }) => `${base}/articles/${replica.id}/edit`,
})
```

Clones the source row via `R.model.create(...)`. Strips PK + soft-delete column + `opts.excludeAttributes`, runs `beforeReplicaSaved` to mutate, persists, redirects to the new record's edit page. Visibility delegates to `R.canCreate`.

`Action.bulkReplicate(R, base, opts?)` is the bulk variant — iterates `ctx.records`, applies the same strip-mutate-create pipeline per row, skips rows that throw or fail per-row `canCreate`, notifies with the count.

`opts.getCreatedNotificationTitle` and `opts.getRedirectUrl` are both sync-or-async; receive `{ replica, source }` (single) or `{ count, records }` (bulk). Returning `undefined` falls back to the default copy. Empty string is honored — won't be swallowed by `??`.

## Soft delete (when `Resource.softDeletes = true`)

```ts
Action.restore(R, base, recordId)            // row — only visible on trashed rows
Action.forceDelete(R, base, recordId)        // row — only visible on trashed rows; method POST with .confirm()

Action.bulkRestore(R, base)                  // bulk — restores selected trashed rows
Action.bulkForceDelete(R, base)              // bulk
```

`Action.delete` auto-hides on already-trashed rows (per Plan #13 soft-delete wiring); restore / forceDelete auto-hide on non-trashed rows. The toggling is structural, not optional — opt out by overriding `.visible()` after the factory.

## Import / Export

```ts
Action.export(R, base, {
  format:    'csv',                                  // 'csv' | 'json'
  columns:   ['id', 'title', 'publishedAt'],         // omit → all columns from R.table()
  filename:  () => `articles-${new Date().toISOString().slice(0, 10)}.csv`,
})

Action.bulkExport(R, base, opts?)                    // bulk — exports only selected rows

Action.import(R, base, {
  format:     'csv',                                 // omit → auto-detect from filename
  upsertBy:   ['email'],                             // turns it into an upsert action; mode-select appears in the modal
  maxRows:    10_000,                                // default cap
})
```

`Action.export` reads from the resource's `Table.records(ctx)` (so filters / search / sort flow through); writes the body to a `download` envelope that the client synthesizes as `<a download>`. CSV via the in-tree `src/io/csv.ts` (RFC 4180, in-memory only).

`Action.import` auto-builds a modal-form schema with a `FileUpload` field (and a `Mode` select when `upsertBy` is set). Handler reads `ctx.values.file`, fetches the URL the upload stamped, parses CSV/JSON, walks rows through `R.model.create` (or `R.model.update` for matched upserts). Per-row `validate / beforeCreate / beforeUpdate` lifecycle hooks fire from the resource's form config. Partial-failure-soft: rows that throw / fail validate accumulate in `summary.errors` and the import keeps going. v1 has **no transaction wrapper** — partial imports leave the DB in a partially-applied state.

## Relation factories (inside RelationManagers)

```ts
// inside a RelationManager static table(table, ctx)
Action.relationCreate(M, ctx)                        // header — "Create <Label>"; opens create form in tab
Action.relationEdit(M, ctx, recordId)                // row — pencil
Action.relationDelete(M, ctx, recordId)              // row — trash
Action.relationRestore(M, ctx, recordId)             // row — soft-delete trash only
Action.relationForceDelete(M, ctx, recordId)         // row — soft-delete trash only

Action.relationReplicate(M, ctx, recordId, opts?)
Action.relationBulkReplicate(M, ctx, opts?)

// M2M only (auto-hide outside `belongsToMany / morphToMany / morphedByMany`)
Action.relationAttach(M, ctx)                        // header — modal-form picker
Action.relationDetach(M, ctx, recordId)              // row
Action.relationBulkDetach(M, ctx)                    // bulk
```

`ctx` is the `RelationManagerContext` injected into `M.table(table, ctx)` — it carries `basePath / parentSlug / parentId / relationship / parentRecord / related? / mode`. The factories thread URLs + parent attachment automatically.

`relationReplicate` force-pins the parent FK back onto the replica AFTER strip + BEFORE `beforeReplicaSaved`, so a tampered source row can't slip a different parent in by riding its own FK column. Auto-hides on M2M (replicate doesn't fit pivot semantics) and on `morphTo` (no single owner to pin to).

For the broader RelationManager surface (when to override `canDelete` vs `canDetach`, how `ctx.mode` derives), see [[pilotiq-relations]].

## Common chrome customizations

The factory result is just an `Action` instance — every chain method composes after the factory call:

```ts
Action.delete(R, base, row.id)
  .label('Move to trash')                   // override default copy
  .color('warning')                          // override 'destructive'
  .tooltip('Trashed items auto-purge after 30 days')
  .confirm('Move this article to trash?')   // override default confirm copy
  .visible(({ user }) => user?.role === 'admin')
```

The `.visible()` you set wins over the factory's auto-attached policy gate.

## When NOT to use a factory

- **Custom modal-form** — the import factory's modal schema is fixed (FileUpload + maybe Mode). For richer modals (multi-field policy decisions, conditional reactivity), use `Action.make('foo').schema([…]).handler(…)` directly.
- **Cross-record orchestration** — bulk factories iterate row-by-row. For "select 50 rows, run one SQL UPDATE" semantics, write a handler that consumes `ctx.records` and dispatches a single ORM call.
- **Compound flows** — anything that needs multi-step UX (confirm → modal-form → second confirm) doesn't compose from factories. Build it from `Action.make()` primitives.

## Pitfalls

- **`opts.beforeReplicaSaved` mutates a plain object, not a model instance.** It's `Record<string, unknown>`, pre-create. Don't expect `replica.save()` / lifecycle hooks — those are framework-internal post-mutation.
- **Bulk factories don't wrap in a transaction.** Partial failures leave the DB partially updated. The notification shows the count succeeded; the rest accumulate in `summary.errors`. If you need atomicity, write a handler that opens a transaction explicitly via your ORM.
- **`Action.import`'s `upsertBy` requires `R.model.update` to exist.** Without it, the import will throw on the first matching row. Boot-time guard catches the missing method.
- **Relation factories' `ctx.mode` lies about `morphOne` / `hasOne`.** Both collapse into `'hasMany'` for action dispatch — `morphOne / hasOne` semantically still allow one child, but the factory shape is the same.

## See also

- `dispatch-modes.md` — what each factory does under the hood.
- `visibility-and-authorization.md` — how factory auto-visibility composes with manual `.visible()`.
- [[pilotiq-relations]] — broader RelationManager + `Repeater.relationship` patterns.
- [[pilotiq-resource]] — the `Resource.softDeletes` + `can*` static surface that factories key off.
