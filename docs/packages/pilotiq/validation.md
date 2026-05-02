# Validation

Validators run server-side after coercion and before the form-level
`save()` hook fires. Failed validation returns a 422 with field-keyed
errors that the client renders inline.

## Built-in validators

```ts
TextField.make('email')
  .required()
  .email()
  .maxLength(120)

NumberField.make('quantity')
  .min(1)
  .max(99)

TextField.make('username')
  .required()
  .pattern(/^[a-z0-9_]+$/)
  .unique({ model: User, ignoreRecord: true })
```

| Rule | Notes |
|---|---|
| `required()` | Auto-attached when the field is required |
| `email()` | Loose RFC check — good enough for intake forms |
| `minLength(n) / maxLength(n)` | String-length bounds |
| `min(n) / max(n)` | Numeric bounds |
| `pattern(re, msg?)` | Regex |
| `unique({ model, column?, ignoreRecord?, where?, caseInsensitive?, message? })` | DB probe via `Model.query().where(...).paginate(1, 2)` |
| `distinct(opts?)` | Cross-row uniqueness inside a Repeater / Builder |

## Custom validators

A validator is `(value, ctx?) => string | null | Promise<string | null>`:

```ts
TextField.make('zipCode').validate((value) => {
  if (!value) return null               // skip when empty (use required for that)
  return /^\d{5}$/.test(value) ? null : 'Must be 5 digits'
})
```

Async is fine — `validateSchema` awaits each rule in declaration order.

> [!TIP]
> Validators that share state across rows (e.g. "no two rows with the
> same email") should use `Field.distinct()` on the inner field, not a
> custom validator. Distinct is array-row-aware.

## Form-level validators

Form-level rules attach errors under the reserved `_form` key. Useful
for cross-field invariants:

```ts
Form.make()
  .schema([...])
  .validate((values) => {
    if (values.start_at >= values.end_at) {
      return 'End date must be after start date.'
    }
    return null
  })
```
