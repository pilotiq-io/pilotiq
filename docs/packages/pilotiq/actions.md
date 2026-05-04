# Actions

`Action` is the unified primitive for buttons in pilotiq — header
buttons, row buttons, bulk buttons, form submits, dropdown items.
Same builder, four placement modes (`inline | row | header | bulk`),
four mutually-exclusive dispatch modes (`href / method / handler / submit`).

```ts
Action.create('Create post')
  .icon('plus')
  .color('primary')
  .href('/admin/posts/create')

Action.delete()                                    // factory: deletes the row
Action.edit(R, base, recordId)                     // factory: edits
Action.replicate(R, base, recordId)                // factory: clones the row

Action.make('publish')
  .label('Publish')
  .color('success')
  .icon('send')
  .handler(async (ctx) => {
    await ctx.record.publish()
    return { notify: Notification.success('Published') }
  })
  .visible(({ record }) => record.status === 'draft')
```

## Modal-form actions

Drop a `.schema([...])` to make the action open a form-modal:

```ts
Action.make('reschedule')
  .icon('calendar')
  .schema([DateTimePicker.make('at').required()])
  .handler(async (ctx) => {
    await ctx.record.reschedule(ctx.values.at)
  })
```

The trigger renders a Dialog with the schema as form. Submit fetches
with `Accept: application/json`; server returns `{ ok, redirect, notifications }`
on success or `{ ok: false, errors }` on validation failure.

## Replicate (clone a row)

`Action.replicate(R, base, recordId?, opts?)` is a handler-style factory — load the source row → strip the primary key + soft-delete column → optionally mutate the prepared payload → `R.model.create(...)` → redirect to the new record's edit page.

```ts
class ListPosts extends ListPage {
  static override getResource() { return PostResource }
  static override getRowActions(R, basePath) {
    return [
      Action.edit(R, basePath),
      Action.replicate(R, basePath, undefined, {
        excludeAttributes: ['slug'],
        beforeReplicaSaved: (replica) => ({ ...replica, title: `Copy of ${replica.title}` }),
      }),
      Action.delete(R, basePath),
    ]
  }
}
```

- `excludeAttributes` — column names to drop from the replica in addition to the always-stripped PK + soft-delete column. Use it for unique columns the source row holds (`slug`, `email`, etc.) so the duplicate doesn't trip a unique constraint on save.
- `beforeReplicaSaved(replica, source)` — mutate the prepared payload before it's persisted. Receives the already-stripped attributes plus the source record; return the (possibly modified) attributes to persist. Async.

Visibility delegates to `R.canCreate(user)` — replicating writes a new row, so the gate is `canCreate`, not `canView`. Errors raised by `R.model.create` (e.g. unique-constraint violations) surface as a destructive toast and the user stays on the list.

`Action.bulkReplicate(R, base, opts?)` is the bulk sibling — drop into `Resource.table().bulkActions([...])` to clone every selected row in one click. Same `excludeAttributes` + `beforeReplicaSaved` options as the row-level factory; iterates `ctx.records`, skips per-row `canCreate` denials and rows that throw, and notifies with the count actually replicated.

## ActionGroup (dropdown)

```ts
ActionGroup.make('row-overflow')
  .label('More')
  .icon('more-horizontal')
  .actions([Action.duplicate(), Action.archive(), Action.delete()])
```

## Visibility & authorization

```ts
Action.delete().visible(({ record, user }) => user.canDelete(record))
Action.delete().authorize((ctx) => ctx.record.canBeDeleted())
```

> [!NOTE]
> Row-placement actions evaluate visibility per-row server-side; the
> resolver stamps `_visibleActions` / `_disabledActions` on each row so
> the renderer just consumes booleans.
