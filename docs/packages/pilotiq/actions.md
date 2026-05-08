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

### Modal chrome

Both confirm-only and form-modal actions accept the same chrome setters.
All defaults match the legacy renderer — calling none of them keeps the
modal byte-identical.

```ts
Action.make('publish')
  .schema([Toggle.make('notifySubscribers')])
  .handler(handler)
  // Header chrome
  .modalHeading('Publish article')
  .modalDescription('Subscribers receive an email immediately on publish.')
  .modalIcon('rocket')
  .modalIconColor('primary')             // gray | primary | success | warning | destructive | info
  .modalAlignment('start')               // start | center (default) | end
  // Footer chrome
  .modalSubmitActionLabel('Publish now') // Filament v5 alias for modalSubmitLabel
  .modalCancelActionLabel('Keep as draft')
  // Width / layout
  .modalWidth('lg')                      // sm | md (default) | lg | xl
  .slideOver()                           // right-side slide-over instead of centered popup
  .stickyModalHeader()                   // long forms: heading stays pinned while body scrolls
  .stickyModalFooter()                   // long forms: footer buttons stay reachable
  // Dismissal
  .closeModalByClickingAway(false)       // disable outside-click dismissal
  .closeModalByEscaping(false)           // disable Esc-key dismissal
  .modalCloseButton()                    // render an X button in the top-right
  // Focus
  .modalAutofocus()                      // focus first form input on open
  .modalAutofocus(false)                 // skip the default submit-button autofocus
  // Auxiliary content between the form body and the Cancel/Submit footer
  .modalContentFooter([
    Alert.make('Subscribers will be emailed immediately.').warning(),
  ])
```

**Defaults preserved.** `closeModalByClickingAway` / `closeModalByEscaping`
are on by default — calling without an argument turns them OFF (Filament's
`->closeModalByClickingAway(false)` shape). Sticky chrome and the X close
button are off by default; call without an argument to turn ON.

**`modalContentFooter([Element…])`** mounts auxiliary Elements between
the form body (or confirmation copy) and the Cancel/Submit row. Useful
for an inline `Alert` summarising the consequence of the action,
supplemental `Text` / `Heading`, or a secondary `Action` (e.g. a
"Learn more" link) sitting alongside the primary submit. Inner Actions
keep their `.visible() / .disabled()` rules — the slot resolves through
the standard schema walker. In sticky-footer mode the slot scrolls with
the body; only the action row stays pinned.

**`modalAutofocus` semantics:**

| Call | Behaviour |
|---|---|
| _(omitted)_ | Submit button autofocuses for confirm-only modals; nothing autofocuses when the modal contains a form. |
| `.modalAutofocus()` | First form input (or submit button when no form) autofocuses on open. |
| `.modalAutofocus(false)` | Nothing autofocuses on open. |

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
