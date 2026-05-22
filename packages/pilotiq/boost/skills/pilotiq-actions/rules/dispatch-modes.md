# Dispatch Modes

Every `Action` has exactly one of four dispatch modes. They're mutually exclusive — calling a setter from a different mode replaces the prior choice. Pick the mode by what the action does, not where it appears.

## 1. `href(url)` — link

```ts
Action.make('docs')
  .label('Documentation')
  .icon('book')
  .href('https://docs.example.com')
```

Renders as `<a href>`. No server round-trip. Cmd+click / right-click "open in new tab" works because it's a real anchor.

`.openInNewTab()` adds `target="_blank" rel="noopener"`. `.tooltip(text)` adds a hover hint.

Use for: external doc links, marketing CTAs, sibling-app deep links.

## 2. `method(verb).action(url)` — form-post

```ts
Action.make('archive')
  .label('Archive')
  .color('warning')
  .method('POST')
  .action(`${base}/articles/${row.id}/archive`)
  .confirm('Archive this article? You can restore it later.')
```

Renders as a hidden `<form>` with a submit button. The form body is empty (or carries `Action.formField(name, value)` pairs — see below). Server responds 303 → browser follows → page re-renders.

This is the **only mode that survives no-JavaScript clients** — useful for back-compat with progressively-enhanced flows or for actions that must remain accessible from raw HTML email links. The framework's `Action.delete` factory ships in this mode for that reason.

`.confirm(message)` wraps the submit in a confirmation Dialog. The submit doesn't fire until the user OKs.

## 3. `handler(ctx => …)` — JSON dispatch

```ts
Action.make('publish')
  .label('Publish')
  .color('primary')
  .icon('send')
  .handler(async (ctx) => {
    const article = await ArticleModel.find(ctx.record.id)
    article.publishedAt = new Date()
    await article.save()
    return {
      notify: { title: 'Published', body: article.title, kind: 'success' },
      redirect: `${ctx.basePath}/articles/${article.id}/edit`,
    }
  })
```

Clicking POSTs `Accept: application/json` to `{basePath}/{slug}/_action/{name}`. The framework routes through `dispatchAction(action, body, ctx)`, calls the handler, normalizes the return shape, ships it back.

**Return shape** (all keys optional):

```ts
{
  notify?:        NotificationLike | NotificationLike[],
  redirect?:      string,                    // URL to navigate to after success
  download?:      { filename, contentType, body },  // triggers <a download> on the client
  ok?:            boolean,                   // false short-circuits to error toast
  error?:         string,                    // surfaced as toast when ok:false
  // ...any extras get round-tripped via additional ActionResult slots
}
```

Client-side: drains notifications via `useToast()`, then `useNavigate(redirect)`. **No page reload** — SPA-only flow. If the response carries a `download` payload, the framework synthesizes a temporary `<a download>` blob and clicks it.

**`ctx` shape:**

```ts
{
  user:       OpaqueUser | null,         // from Pilotiq.user() resolver
  record?:    Record,                    // row placement — current row
  records?:   Record[],                  // bulk placement — selected rows
  basePath:   string,                    // panel base ("/admin")
  resource?:  ResourceLike,              // when in a resource scope
  relation?:  { parent, parentId, relationship },  // when inside a relation manager
  body?:      unknown,                   // raw POST body (FormData-parsed) — modal-form values land here
}
```

Use for: anything that needs server work but is conceptually a one-shot operation, not a page navigation.

## 4. `submit()` — trigger an enclosing form

```ts
// inside CreatePage.getFormActions(R)
Action.make('createAnother')
  .label('Create & create another')
  .outlined()
  .submit()
  .formField('_continueCreate', '1')      // rides the form body so the handler can branch
```

Renders as `<button type="submit">`. No dispatch URL — it submits the enclosing `<form>`. Used in page headers / form footers where the form already wires its own POST.

`.form(formId)` targets a form outside the natural enclosing `<form>` (HTML `form=` attribute). Useful when the submit button lives in the page header but the form lives further down the tree.

`.formField(name, value='1')` attaches a hidden `name`/`value` pair to the form body — the click sets `event.submitter` so `new FormData(form, submitter)` picks it up. Confirm-gated submits intentionally **don't** honor `formField` (programmatic `requestSubmit()` has no submitter).

## Modal-form actions (flavor of handler)

Add `.schema([Field, …])` to a handler action and it switches to modal-form mode:

```ts
Action.make('addNote')
  .label('Add note')
  .icon('plus')
  .schema([
    TextField.make('subject').required(),
    TextareaField.make('body').required(),
    SelectField.make('priority').options({ low: 'Low', med: 'Med', high: 'High' }).default('med'),
  ])
  .handler(async (ctx) => {
    // ctx.body has the parsed + validated form values
    await Note.create({ ...ctx.body, articleId: ctx.record.id })
    return { notify: { title: 'Note added', kind: 'success' } }
  })
```

Clicking the trigger opens a Dialog with the schema mounted as a real pilotiq form. Submit fetches `Accept: application/json`. Server responses:

- **200 `{ ok: true, redirect, notifications }`** — drain notifications, SPA-navigate.
- **422 `{ ok: false, errors: { field: [msg, …] } }`** — stamp inline field errors.
- **5xx `{ ok: false, error }`** — error toast.

The form runs every `pilotiq-fields`-style validator (required / email / unique / distinct) before reaching the handler. Field-level `live()` works inside the modal.

### Modal chrome

12 setters customize the modal:

```ts
Action.make('addNote')
  .modalHeading('Add a note')
  .modalDescription('Notes are visible to all editors.')
  .modalIcon('sticky-note')
  .modalIconColor('warning')
  .modalWidth('lg')                       // 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | 'screen'
  .modalSubmitActionLabel('Save note')
  .modalCancelActionLabel('Discard')
  .modalCloseable(false)                  // user can't close via Esc / outside-click
  .modalContentFooter([                    // Element[] rendered below the form body
    Text.make('Notes auto-archive after 90 days.').size('xs').color('muted'),
  ])
  // …
```

Setters with no special chrome you want, just omit — sensible defaults ship.

## Confirm

Both handler and method modes accept `.confirm(message)`:

```ts
Action.make('publish')
  .handler(/* … */)
  .confirm('Publish this article? It will be visible to everyone.')
```

`.modalConfirmIcon` / `.modalConfirmIconColor` customize the chrome. Confirm dialogs share the same `<ActionModalDialog>` primitive as modal-form — the difference is content: confirm shows a message + Cancel/OK; modal-form mounts a `<FormFields>`.

## Pitfalls

- **`.handler()` on a method action.** Calling `.method('POST').action(...)` then `.handler(...)` will override the method, NOT compose — handler wins. Pick one mode.
- **`.submit().formField(...)` with `.confirm(...)`.** Confirm-gated submits use `form.requestSubmit()` programmatically, which doesn't carry a `submitter`. The `formField` pair will silently drop. If you need both, use `.handler()` + `.confirm()` instead.
- **Modal-form fields inside the modal can't access the outer page's form state.** The modal is a fresh form scope; `$get('outerFieldName')` won't see the page's form. If you need cross-form data, pass it via `ctx.record` instead.
- **Handler returns are async-aware but not stream-aware.** Don't expect to ship progressive output from a long-running handler. For batch operations that take >5s, return immediately with `{ notify: 'Queued', redirect }` and process out-of-band.

## See also

- `visibility-and-authorization.md` — gating which dispatch modes fire for which user / record.
- `factories.md` — pre-built factories you usually want instead of writing dispatch from scratch.
