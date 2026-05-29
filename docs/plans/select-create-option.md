# Plan: `SelectField.createOptionForm()` — inline create-from-select modal

> **Status: ✅ SHIPPED.** API (`createOptionForm / createOptionUsing / createOptionAuthorize`), `formCreateOptionData` + `tagSelectCreateOptionUrls` walker, `POST …/_form/:formId/create-option/:fieldName` routes (globals / pages / resource create + edit), and the `SelectFieldInput.tsx` "+" → Dialog client flow are all live. Relation-scope routes and `editOptionForm()` stayed deferred as planned.

**Surfaced by:** Filament v5 fresh audit pass 2026-05-07 cont'd⁸ (Tier 1).

**Goal.** Let users click a "+" next to a `SelectField`, fill out a small form in a modal, submit, get the new option appended + selected — without leaving the parent form. Closes the dig-into-Resource-picker round-trip that hits every "pick an author / category / customer" flow.

---

## Scope (v1 — ship; v2 — defer)

**Ship:**
- `SelectField.createOptionForm(builder | Field[])` — schema for the modal form.
- `SelectField.createOptionUsing(fn)` — handler that returns `{ value, label }` for the new option.
- `SelectField.createOptionAuthorize(rule)` — opt-in visibility gate on the "+" button (parallels `Action.authorize`). Default: visible (creating an option does NOT inherit the parent resource's `canCreate` — different model).

**Defer (no consumer ask yet):**
- `editOptionForm()` — needs option-detail load + per-row mutation. Treats existing options as records, which most select option lists aren't.
- `createOptionAction(action => …)` — modal chrome customizer. Add when first user wants to override `modalHeading` / `modalIcon`.
- `searchDebounce()` / `loadingMessage()` — separate UX-polish Filament methods.
- `getOptionLabelFromRecordUsing()` — handler already returns `{ value, label }` directly.

---

## Wire shape

```ts
// SelectField meta, augmented:
type SelectFieldMeta = FieldMeta & {
  options: SelectOption[]
  createOption?: {
    formId: string             // sub-form id (auto-derived)
    schema: ElementMeta[]      // resolved createOptionForm children
    url: string                // POST endpoint, stamped by walker
  }
}

// Server response from the endpoint:
type CreateOptionResponse =
  | { ok: true,  option: { value: string, label: string } }
  | { ok: false, status: 422, errors: Record<string, string[]> }
```

The `createOption` slot is sparse — absent when the field hasn't called `createOptionForm()`, so existing `SelectField` meta is byte-identical.

---

## Server flow

**`SelectField` API** (`fields/SelectField.ts`):
- Add private `_createOptionForm?: Element[]`, `_createOptionHandler?: (values, ctx) => CreateOptionResult | Promise<CreateOptionResult>`, `_createOptionAuthorize?: VisibilityRule`.
- `createOptionForm(arg)` — accepts `Field[]` directly OR a builder fn `(form) => form.schema([…])`. Stores resolved children list.
- `createOptionUsing(fn)` — stores handler.
- `createOptionAuthorize(rule)` — same shape as `Action.authorize`.
- `toMeta(ctx)` — when `_createOptionForm` set:
  - Resolve children via `resolveSchema(form, ctx)` so dependent options + reactive visibility see the parent ctx.
  - Authorize the "+" button: `await evaluate(_createOptionAuthorize, ctx)`. False → omit `createOption` slot entirely (no button, no endpoint reachable).
  - Stamp `createOption: { formId, schema: childrenMeta, url: '' }`. URL filled by walker.
  - `formId` = `${parentForm.formId}_create-option_${fieldName}` (deterministic so the renderer can target it).

**Walker** (`pageData.ts`, sibling of `tagFormStateUrls`):
- `tagSelectCreateOptionUrls(elements, urlBuilder)` walks the resolved tree, finds every `SelectFieldMeta` with `createOption` set, stamps `createOption.url = urlBuilder(parentFormId, fieldName)`.
- Called from each scope that already calls `tagFormStateUrls` — six scopes: resource-create / resource-edit / global-edit / custom-page / relation-create / relation-edit.

**Endpoint** (one route handler per scope, mirrors `_form/:formId/state` and `_form/:formId/wizard`):
- `POST {…}/_form/:formId/create-option/:fieldName`
- Body: form values for the `createOptionForm` schema (urlencoded or JSON).
- Handler: `formCreateOptionData(pilotiq, scope, body, req?, formId, fieldName)`:
  1. Resolve scope's elements → find form by `formId` → find `SelectField` by `fieldName`. 404 if any miss.
  2. Authorize: `await evaluate(field._createOptionAuthorize, ctx)`. 403 if false.
  3. Coerce + validate body against `_createOptionForm` schema (reuse `coerceFormValues` + `validateSchema`).
  4. 422 if errors.
  5. Run `_createOptionHandler(values, ctx)` (required; throw at meta-time if `createOptionForm` set without `createOptionUsing`).
  6. Handler returns `{ value: string, label: string }`. 200 with `{ ok: true, option }`.
  7. Throwing handler → 500 `{ ok: false, error }`.

No new ORM contract. Handlers are user-supplied (we don't auto-create against `Resource.model` — too prescriptive; v2 sugar `.usingResource(R)` could short-circuit later).

---

## Client flow

**Renderer** (`react/fields/SelectFieldInput.tsx`):
- When `meta.createOption` set, mount a "+" icon-button next to the Select trigger (same row, `flex gap-2`).
- Click → open `<Dialog>` with header `Create ${field.label}` (override via `createOptionLabel?` later).
- Dialog body: `<SchemaRenderer elements={meta.createOption.schema} />` rendered inside a controlled mini-form.
- Submit:
  - `new FormData(form)` → fetch POST `meta.createOption.url` with `Accept: application/json`.
  - 200 + `{ option }`:
    - Append `option` to local options state (React state, not the SSR-resolved `meta.options` — survives until next live re-resolve).
    - Set the SelectField's value to `option.value` (via `useFieldState(name).setValue` when in a FormStateProvider, or DOM-set on uncontrolled fallback).
    - Close dialog; toast `${field.label} created`.
  - 422: stamp inline errors on the modal's fields (reuse the existing `setFieldErrors` pattern from `FormRenderer`).
  - 5xx: error toast; modal stays open.
- If `live()` is set on the parent SelectField, the next render-roundtrip's `options(fn)` resolver may overwrite our local state — that's correct: the canonical resolver wins.

---

## Auth posture

- The "+" button visibility is gated by `createOptionAuthorize(rule)` only — does NOT auto-inherit `R.canCreate`. Different model commonly.
- The endpoint re-runs the same authorize check (request-time, fresh ctx) so a tampered client can't bypass.
- No global "Pilotiq.user must exist" check — anonymous panels stay possible (matches `Action.authorize` posture).

## Validation

- Reuse `validateSchema(createOptionForm, values, undefined, ctx)` — no record (we're creating). Field-level validators (`required`, `email`, `unique({ model, … })`) all work unchanged.
- Form-level validators on the parent form are NOT run — the modal is a sibling, not a child.

## Reactive integration

- The modal's inner schema is resolved with the *parent form's* `RenderContext` so dependent-options resolvers (`SelectField.options(fn)`) see `$get` against the parent's values. Useful: `country` in parent → `state` createOptionForm's `region` Select filters by parent's country.
- `live()` inside the modal: deferred. Modal is short-lived; round-tripping a sub-form's state mid-modal is rarely worth it. Add when first asked.

---

## Tests

`SelectField.test.ts` additions:
- `createOptionForm(arr)` and `createOptionForm((form) => form.schema([…]))` both produce identical resolved meta.
- Bare SelectField (no `createOptionForm`) emits no `createOption` slot.
- `createOptionAuthorize(false)` omits the slot entirely.
- Resolves with parent ctx — dependent-options sees `$get`.
- Throws at meta-time when `createOptionForm` set without `createOptionUsing`.

`pageData/formCreateOptionData.test.ts` (new):
- Happy path: validates body, runs handler, returns `{ ok, option }`.
- 404: unknown formId / fieldName.
- 403: authorize fail.
- 422: validation errors keyed correctly.
- 500: handler throws.

`routes.test.ts` smoke: each of the six scopes registers the new route + dispatches correctly.

Demo: wire `SelectField.make('categoryId').options(…).createOptionForm([…]).createOptionUsing(…)` into `playground/app/Pilotiq/Posts/PostResource.ts`.

---

## Effort + sequencing

- **Phase A** — SelectField API + meta shape + tests (~45 min).
- **Phase B** — `formCreateOptionData` + walker + tests (~45 min).
- **Phase C** — Six routes wiring (~30 min — copy-pasta from form-state pattern).
- **Phase D** — Client renderer + Dialog + integration with `useFieldState` (~1 hr).
- **Phase E** — Demo + docs section in `docs/packages/pilotiq/forms.md` + memory (~30 min).

Total ~3.5 hours. Ship Phase A first, push, continue.

---

## Non-obvious decisions

1. **Authorization does NOT inherit `R.canCreate`.** A `categoryId` Select on `PostResource.form()` creates `Category` records, not `Post` — different policy domain. Opt-in via `createOptionAuthorize`.
2. **`{ value, label }` return shape, not a record.** Handler is user-supplied. Most users want full control over label formatting (`'${name} (${email})'`); forcing them to wrap a record adapter would add ceremony. Sugar `.usingResource(R)` deferred.
3. **No transaction wrapper around the handler.** Mirrors `Action.handler` posture. Users that need a transaction wrap their own.
4. **Modal `formId` derived deterministically** so the client renderer can target it without a server round-trip just to learn its id (`${parentFormId}_create-option_${fieldName}`).
5. **Parent ctx threaded into modal schema** so dependent options + reactive visibility work — but `live()` inside the modal is deferred. Modal lifecycles are short; complexity not worth v1.
