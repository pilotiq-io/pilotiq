---
'@pilotiq/pilotiq': minor
---

feat(core): `Form.inlineLabel()` / `Section.inlineLabel()` cascade

Set `inlineLabel` once at the top of a form (or any section) and every
descendant `Field` inherits it instead of repeating `.inlineLabel()`
on each one. Per-field calls still win.

```ts
Form.make().inlineLabel().schema([
  TextField.make('name'),       // → inlineLabel: true
  TextField.make('email'),      // → inlineLabel: true
  TextField.make('bio').inlineLabel(false),  // explicit → label-above
  Section.make('Address').inlineLabel(false).schema([
    TextField.make('street'),   // subtree resets → label-above
    TextField.make('city'),     // → label-above
  ]),
])
```

**Resolution chain (most-specific wins):**

1. Field-level `Field.inlineLabel(true|false)` — explicit setting on the
   field itself.
2. Nearest ancestor `Section` with `.inlineLabel(true|false)` — overrides
   any outer container for its subtree.
3. Outer `Form.inlineLabel(true|false)` — applies to the whole form.
4. Default — label-above.

**Implementation:**

- `RenderContext.inlineLabelDefault?: boolean` — pushed by
  `resolveSchema.deriveChildContext` when a `Form` or `Section` calls
  `.inlineLabel(...)`. Children inherit until another container resets
  the flag.
- `Field._inlineLabel` widened from `boolean` (default `false`) to
  `boolean | undefined`. `Field.buildMeta(ctx)` reads
  `this._inlineLabel ?? ctx.inlineLabelDefault` to decide whether to
  emit the meta key. No public-API change — the setter is unchanged
  (`inlineLabel(v = true)`).
- New `Form.inlineLabel(v = true)` + `Form.getInlineLabel()` and the
  parallel `Section.inlineLabel(v = true)` + `Section.getInlineLabel()`.

**No wire-shape change.** The on-the-wire `FieldMeta.inlineLabel` is
still emitted with `true` only — the cascade is server-side.

Closes the "Schema-wide `inlineLabel()` cascading default on
Form/Section. Easy but no consumer ask." item from the field
micro-additions audit (`docs/plans/admin-gap-audit.md`).
