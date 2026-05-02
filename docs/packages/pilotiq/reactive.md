# Reactive fields

`live()` makes a field re-resolve the form on change. Combined with
`$get` / `$set` and `afterStateUpdated`, you can wire dependent options,
auto-fill slugs, conditional sections, and more — all server-resolved
so the same logic runs on SSR and SPA navigation.

## The `live()` modifier

```ts
TextField.make('title').live()                                        // every keystroke
TextField.make('title').live({ onBlur: true })                        // on blur
TextField.make('title').live({ debounce: 500 })                       // 500ms after typing stops
```

Without `.live()` the field's state only re-evaluates when the form
submits.

## `afterStateUpdated`

```ts
TextField.make('title')
  .live()
  .afterStateUpdated((value, ctx) => {
    ctx.$set('slug', slugify(value as string))
  })
```

`ctx.$set` writes to the form state synchronously; the next re-resolve
cycle picks it up.

## Dependent options

`SelectField.options(fn)` is async-aware and gets the same `$get` /
`$set` / `record` / `user` context:

```ts
SelectField.make('country').live(),

SelectField.make('state')
  .options(async ({ $get }) => {
    const country = $get('country')
    if (!country) return []
    return await statesFor(country)
  })
```

> [!IMPORTANT]
> Live forms must pin a stable `formId`:
> ```ts
> Form.make().formId('post-form').schema([...])
> ```
> Single-form pages auto-fall-back; multi-form pages need an explicit id
> to disambiguate which form's state changed.

## Conditional visibility

```ts
TextField.make('coupon_code')
  .visible(({ $get }) => $get('discount_kind') === 'coupon')
```

The `visible` rule re-evaluates on every live re-resolve, so the field
appears/disappears as the user types.
