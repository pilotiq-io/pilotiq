# Validation

Validators are functions: `(value, ctx?) => string | null | Promise<string | null>`. Return a message string to fail; return `null` to pass. The framework runs them in declaration order, awaits async ones, and aggregates per-field errors before calling the form's `save` handler.

## Built-in validators

```ts
import { Field } from '@pilotiq/pilotiq'

TextField.make('email')
  .validate([
    Field.required(),                              // or just .required()
    Field.email(),
    Field.maxLength(255),
  ])

TextField.make('password')
  .password()
  .validate([
    Field.required(),
    Field.minLength(8, 'At least 8 characters'),
    Field.pattern(/[A-Z]/, 'Must contain an uppercase letter'),
    Field.pattern(/[0-9]/, 'Must contain a digit'),
  ])

NumberField.make('age')
  .validate([
    Field.min(18, 'Must be 18 or older'),
    Field.max(120),
  ])

TextField.make('slug')
  .validate([
    Field.required(),
    Field.pattern(/^[a-z0-9-]+$/, 'Lowercase letters, numbers, hyphens only'),
  ])
```

The full set: `required(message?) / email(message?) / minLength(n, message?) / maxLength(n, message?) / min(n, message?) / max(n, message?) / pattern(regex, message)`.

`Field.required()` is auto-contributed when you call `.required()` directly — no need to add it twice.

## Custom validators

A validator is just a function. Inline:

```ts
TextField.make('username')
  .validate(async (value, ctx) => {
    if (typeof value !== 'string') return null
    if (value.length < 3) return 'At least 3 characters'
    if (value.startsWith('admin')) return 'Reserved prefix'
    return null                                    // pass
  })
```

The `ctx` shape:

```ts
{
  record?: unknown                                 // current record on edit/view
  values?: Record<string, unknown>                 // all form values
  user?: unknown
  mode?: 'create' | 'edit' | 'view'
  basePath?: string
}
```

Async is fine — the framework awaits each one.

## `Field.unique()` async DB probe

The standard "this field must be unique across all records" check:

```ts
import { Field } from '@pilotiq/pilotiq'

TextField.make('slug')
  .validate(Field.unique({
    model: Article,
    column: 'slug',                              // optional, defaults to field name
    ignoreRecord: true,                           // skip the row matching ctx.record[pk]
    where: { status: 'published' },               // optional scope
    caseInsensitive: true,
    message: 'Slug is already in use',            // optional custom message
  }))
```

How it works:

- Issues `M.query().where(column, value).paginate(1, 2)` — limit 2 to detect uniqueness without scanning the table.
- `ignoreRecord: true` (default `true`) skips the row matching `ctx.record[primaryKey]` so edit-no-change saves don't conflict.
- `caseInsensitive: true` switches to SQL `LIKE` with `%` / `_` / `\` escaped (SQLite + MySQL friendly; Postgres collation-dependent).
- `where: { status: 'published' }` adds AND-clauses to the lookup query (useful for soft scopes — "unique among published rows").
- Inside a `Repeater`, `unique()` probes the database but does NOT see unsaved sibling rows. Pair with `distinct()` for cross-row uniqueness within the form.

`Field.unique` accepts a `Model`-like object (anything with `.query()`). The Resource doesn't need to be using the same Model.

## `Field.distinct()` cross-row uniqueness inside Repeater / Builder

Inside a `Repeater` or `Builder`, `unique()` only checks the database. To enforce that values are unique ACROSS rows in the form itself (before submit), use `distinct()`:

```ts
Repeater.make('contacts')
  .schema([
    TextField.make('email')
      .validate(Field.email())
      .distinct(),                                 // unique within this Repeater
    TextField.make('label'),
  ])
```

Options:

```ts
TextField.make('email')
  .distinct({
    caseInsensitive: true,                         // default false
    ignoreNulls: true,                             // default true — skip empty rows
    message: 'Email already used in another row',
  })
```

For `Builder`, distinctness is per-block-type — `heading.text="X"` never conflicts with `paragraph.text="X"`.

Pair with `unique({ model })` for in-form + cross-record uniqueness:

```ts
TextField.make('slug')
  .validate(Field.unique({ model: Article }))     // unique in DB
  .distinct()                                      // unique in this form too
```

## Form-level validators

`Form.validate(fn)` runs after every field's validators have passed:

```ts
form
  .schema([
    DateField.make('startsAt').required(),
    DateField.make('endsAt').required(),
  ])
  .validate(({ values }) => {
    if (values.endsAt < values.startsAt) {
      return { endsAt: 'Must be after start date' }
    }
    return null
  })
```

Return shape:
- `null` (or `{}`) — pass
- `{ [fieldName]: 'message' }` — per-field errors (replaces any field-level errors)
- `{ _form: 'Top-level message' }` — form-wide error, rendered at the top of the form

Form-level validators run AFTER coercion (so values are typed) but BEFORE save.

## Validation order

For each form submit, the framework runs:

1. **Coerce raw FormData values** to typed values (string → number for NumberField, JSON-string → object for KeyValueField, etc.). Coerce errors aren't reported per-field; raw values fall through.
2. **Field-level validators** — for every Field with `validate([...])` or `.required()`. Aggregated by field name.
3. **Form-level `validate(fn)`** — if present, runs only when no field errors fired (early exit).
4. **`save(ctx)` / model.create / model.update** — only reached when validation passes.

Important: **validate runs BEFORE coerce in `dispatchFormSubmit`**, then field-types do their own coerce-fold during their `runValidators`. The order is "validate the raw value, then coerce the validated value" — useful to remember when writing custom validators.

## Errors on the wire

Field errors land on `FormMeta.errors` as `Record<fieldName, string[]>`. The renderer auto-stamps them under each field's input. Repeater/Builder errors key as `items.<i>.<name>` / `name.<i>.data.<child>` respectively; `min/maxItems` lands under the bare field name.

For form-level errors, the `_form` key is special — the renderer surfaces it as an Alert at the top of the form.

## Throwing validators

A validator that throws is treated as a failure. The message comes from `err.message`:

```ts
TextField.make('email')
  .validate(async (value) => {
    if (typeof value !== 'string') throw new Error('Email is required')
    if (!value.includes('@')) return 'Invalid email'
    return null
  })
```

For unique-across-DB or other async lookups, prefer returning `null` for "skip the check" rather than throwing — throws log + fail with the error message verbatim.

## Common pitfalls

- **`required()` doesn't see `null` as empty** — by default `required()` checks for `value !== null && value !== undefined && value !== ''`. For domain-specific empty (`[]`, `{}`), write a custom validator.
- **`Field.unique()` without `ignoreRecord: true`** trips on edit-no-change saves — the row's own value conflicts with itself. Default is `true`; only set to `false` for "even my own row counts."
- **`distinct()` outside a Repeater/Builder** is a no-op. The framework only evaluates it inside an array-row container.
- **Async validators in parallel** — validators within ONE field run serially in declaration order; validators across DIFFERENT fields run in parallel. Don't rely on cross-field ordering.
- **`pattern(/regex/)` without anchors** matches anywhere in the string. Add `^…$` if you mean "the whole value."
- **Validation result `{}`** (empty object) means "pass" — the framework treats no-keys as no-errors. Return `null` for clarity.
