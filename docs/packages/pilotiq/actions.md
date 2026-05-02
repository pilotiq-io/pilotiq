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
