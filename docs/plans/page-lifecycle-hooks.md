# Page lifecycle hooks

Round out the Form load/save lifecycle with the missing fill-side hooks, distinguish create vs update timing, and surface the override surface as static methods on the resource page subclasses. Also auto-fire success toasts after create/save so the most common notification case stops being boilerplate.

**Status:** ✅ DONE — shipped 2026-04-30. Tests went from 398 → 435 (+37).

**Depends on:** existing `Form` lifecycle (`mutateData / beforeSave / save / afterSave / redirectAfterSave / loadRecord / fillFromRecord`), `dispatchFormSubmit`, `pageData.ts` (load path), Notification primitive.

**Companion plan:** `admin-gap-audit.md` (this is plan #4 in that roadmap).

---

## Goal

After this lands, a developer can write:

```ts
class EditArticle extends EditPage {
  static override getResource() { return ArticleResource }

  static override async mutateFormDataBeforeFill(values, ctx) {
    return { ...values, tags: (ctx.record.tags ?? []).join(', ') }
  }

  static override async beforeUpdate(data, ctx) {
    data.editedBy = ctx.user?.id
  }

  static override async afterUpdate(record, _ctx) {
    await invalidateCache(record.id)
  }

  static override getSavedNotificationTitle() {
    return 'Article updated'
  }

  static override getRedirectUrl(record) {
    return `articles/${record.id}`   // override the default list redirect
  }
}
```

…or equivalently at the Form level inside `Resource.form()`:

```ts
static form(form: Form): Form {
  return form
    .schema([…])
    .mutateDataBeforeFill((values, ctx) => ({ ...values, tags: ctx.record.tags.join(', ') }))
    .beforeUpdate((data, ctx) => { data.editedBy = ctx.user?.id })
    .afterUpdate(async (record) => { await invalidateCache(record.id) })
    .savedNotification('Article updated')
}
```

Both paths converge on the same Form hooks; the page-class methods are sugar that install themselves onto the form during `schema()`.

---

## Current state

| Stage | Form hook today | Gap |
|---|---|---|
| Load record | `loadRecord(id, ctx) → record` | No way to mutate `id` or post-process the record. |
| Map record → values | `fillFromRecord(record) → values` | Fires once; no separate before/after fill hook. |
| Validate submit | field validators + `validate()` | OK. |
| Coerce types | `coerceFormValues` (built-in) | OK. |
| Mutate payload | `mutateData(data, ctx) → data` | Single hook for both create and update. |
| Persist | `save(data, ctx) → record` | Single hook for both create and update. |
| Post-save | `afterSave(record, ctx)` | Single hook for both create and update. |
| Redirect | `redirectAfterSave(record, ctx) → url` | OK. Just needs documentation as the override surface. |
| Notify | nothing | No auto-toast on create/save. |

Net: load-side has one hook; save-side has three but they conflate create vs update; nothing fires a default success toast.

---

## New Form hooks

All non-breaking additions to `Form`. Existing `mutateData / beforeSave / afterSave` keep working — they run on **both** create and update. New hooks layer on top.

### Load path (edit mode only)

```ts
form.mutateFormDataBeforeFill((values, ctx) => values)   // before fillFromRecord runs
form.mutateFormDataAfterFill((values, ctx) => values)    // after fillFromRecord, before render
```

`ctx.record` is the loaded record. Both hooks may be async. Return a new values map (immutable-style) — the existing values argument is the input, not mutated in place.

Wired in `pageData.resourceEditData / globalEditData` between `loadRecord` and `form.withValues(...)`.

### Save path — create vs update split

```ts
form.beforeCreate(fn) / afterCreate(fn)        // fires only when ctx.record === undefined
form.beforeUpdate(fn) / afterUpdate(fn)        // fires only when ctx.record !== undefined
form.mutateDataBeforeCreate(fn)                // create-only payload mutation
form.mutateDataBeforeUpdate(fn)                // update-only payload mutation
form.handleCreate(fn) / handleUpdate(fn)       // override the persistence step itself, replacing save() for that mode
```

Dispatch order in `dispatchFormSubmit` becomes:

```
validateSchema
  → form-level validators
  → mutateData (existing — both modes)
  → mutateDataBeforeCreate / mutateDataBeforeUpdate
  → beforeSave (existing — both modes)
  → beforeCreate / beforeUpdate
  → handleCreate || handleUpdate || save     ← persistence
  → afterCreate / afterUpdate
  → afterSave (existing — both modes)
  → redirectAfterSave
```

Pre-existing handlers run before mode-specific ones, which keeps generic cross-cutting logic (auth stamping, audit fields) above mode-specific business rules.

### Notification hook

```ts
form.savedNotification('Article saved')                  // string → default success toast
form.savedNotification((record, ctx) => Notification.make('Saved').body(`#${record.id}`).success())
form.disableSavedNotification()                          // opt out
form.createdNotification(...)                            // optional create-only override; falls back to savedNotification
```

`dispatchFormSubmit` returns the resolved notification on success; the existing `routes.ts` POST handler attaches it to the JSON response (`{ ok, redirect, notifications }`) on the modal-form path. For the form-post 303 path, the notification is dropped (same limitation as action notifications today — flash mechanism deferred).

Default behavior when nothing configured: **a success toast is auto-emitted** with body `"${R.labelSingular} saved"` (or `"created"` for the create page). Saying nothing should produce a sensible toast, matching the audit's "day-1 expectation" framing. Resource page subclasses can override per-mode via `getCreatedNotificationTitle / getSavedNotificationTitle`.

---

## Page-class override surface

Each resource page subclass already exposes static override methods (`getHeader`, `getFormActions`, etc.). Add the lifecycle hooks the same way and have the page install them onto the form during `schema()`.

Pattern in `defaultPages.ts`:

```ts
class CreatePage extends ResourcePage {
  static override schema(): Element[] {
    const R = this.getResource()
    const form = R.form(Form.make())
    applyFormDefaults(R, form, 'create')
    this.installLifecycleHooks(form)             // ← new
    …
  }

  /** @internal — copy static page methods onto the form so dispatch sees them. */
  protected static installLifecycleHooks(form: Form): void {
    if (this.beforeCreate)    form.beforeCreate(this.beforeCreate.bind(this))
    if (this.afterCreate)     form.afterCreate(this.afterCreate.bind(this))
    if (this.handleCreate)    form.handleCreate(this.handleCreate.bind(this))
    if (this.mutateFormDataBeforeFill) form.mutateFormDataBeforeFill(this.mutateFormDataBeforeFill.bind(this))
    if (this.getRedirectUrl)  form.redirectAfterSave(this.getRedirectUrl.bind(this))
    const title = this.getCreatedNotificationTitle?.()
    if (title === null)       form.disableSavedNotification()
    else if (title)           form.createdNotification(title)
  }

  // Override surface (all optional, all undefined by default)
  static beforeCreate?: LifecycleHandler
  static afterCreate?:  AfterSaveHandler
  static handleCreate?: SaveHandler
  static mutateFormDataBeforeFill?: FillMutator
  static getRedirectUrl?: (record: unknown) => string
  static getCreatedNotificationTitle?: () => string | null
}
```

`EditPage` mirrors with `beforeUpdate / afterUpdate / handleUpdate / getSavedNotificationTitle`. Both also expose the generic `mutateData / beforeSave / afterSave` fields.

The page-class hooks are **purely sugar** — anything reachable via the static page method is reachable via the equivalent `Form` method inside `Resource.form()`. That's important: keeps `Resource.form()` self-contained for users who don't want page subclassing.

---

## File touch list

```
packages/pilotiq/src/elements/
  Form.ts                       # 8 new setters + getters; FillMutator type
  dispatchForm.ts               # branch by ctx.record presence; new dispatch order
  Form.test.ts                  # cover new setters serialize-only
  dispatchForm.test.ts          # cover new ordering + create/update branching

packages/pilotiq/src/notifications/
  Notification.ts               # already exists — no changes
  resolveSavedNotification.ts   # new helper: turns string|fn|undefined → NotificationMeta | null

packages/pilotiq/src/
  pageData.ts                   # call mutateFormDataBeforeFill / AfterFill in resourceEditData + globalEditData
  defaultPages.ts               # installLifecycleHooks + new optional static fields on CreatePage/EditPage
  routes.ts                     # thread saved-notification through 200 JSON response on the modal-form path

playground-pilotiq/app/Pilotiq/Articles/Pages/
  EditArticle.ts                # demo: override afterUpdate + getSavedNotificationTitle
```

No package-public-API breakage. Existing `mutateData / beforeSave / save / afterSave / redirectAfterSave` keep their signatures and behavior.

---

## Implementation steps

1. **Form setters & getters.** Add the eight new methods + types in `Form.ts`. No dispatch yet — just storage. Update `Form.test.ts` to assert serialization passthrough.

2. **Dispatch ordering.** Rewrite `dispatchFormSubmit` to branch on `ctx.record === undefined` (create) vs not (update). Run mode-specific hooks in the order above. Update `dispatchForm.test.ts` with create + update fixtures asserting hook order and exclusivity (create-mode shouldn't fire `beforeUpdate` etc.).

3. **Fill hooks.** In `pageData.resourceEditData` (and `globalEditData`), wrap the existing `loadRecord` → `fillFromRecord` step:
   - run `mutateFormDataBeforeFill(values, { record })` if set
   - then `fillFromRecord(record)` (existing default = `{ ...record }`)
   - then `mutateFormDataAfterFill(values, { record })` if set
   - finally `form.withValues(values)`.

4. **Notifications.** Add `resolveSavedNotification(form, mode, record, ctx)` helper. `dispatchFormSubmit` returns `notifications: NotificationMeta[]` alongside `record / redirect`. Update `routes.ts` POST handler so JSON response includes `notifications`. Default toast text: `"${R.labelSingular} created"` / `"${R.labelSingular} saved"`. Default-toast disable hook: `form.disableSavedNotification()` or page returns `null` from `getSavedNotificationTitle`. Skip the form-post 303 path for now (carry-flash deferred).

5. **Page override surface.** Add the optional static fields to `CreatePage` / `EditPage` / `defaultGlobalEditPage` and the `installLifecycleHooks` helper. Tests in `defaultPages.test.ts`: a subclass that overrides `beforeCreate` and `getCreatedNotificationTitle` actually sees its hooks fire on submit.

6. **Playground demo.** Update `EditArticle.ts` (and maybe the global config-edit page) to override one or two hooks so the smoke check exercises them.

7. **Docs.** Append a "Lifecycle" section to `migrating-from-panels.md` mapping panels' instance methods to pilotiq's static page overrides; update the matching CLAUDE.md paragraphs.

---

## Tests target

Existing 398 → ~410. New coverage:
- create vs update mode-routing (4 cases × 4 mode-specific hooks).
- fill-side hooks ordering.
- default + override notification resolution (string, fn, null=disabled).
- page-subclass override propagating into the form.

---

## Out of scope (intentionally deferred)

- **"Create & create another" submit button.** Filament-style stays-on-page after submit. Adds a second submit + per-button redirect logic; defer to a small follow-up.
- **Flash notifications across the form-post 303 path.** Needs a session/cookie flash mechanism — separate, broader concern (also blocks action-tier-1's same gap).
- **`infolist()` / View-page entries.** Distinct from form lifecycle; covered by future schema-layouts work (audit #8).
- **Reactive `live()` callbacks.** Audit #5; this plan assumes single-shot validation+save.
- **Wizard step lifecycle.** Audit #8.
