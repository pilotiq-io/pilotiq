---
name: pilotiq-fields
description: Form fields in pilotiq — the 24 built-in field types, common setters, validators, and reactive ($get/$set + live + afterStateUpdated) patterns
license: MIT
appliesTo:
  - '@pilotiq/pilotiq'
trigger: defining or editing a form field inside a `Resource.form()` schema — `TextField` / `SelectField` / `Repeater` / etc., setting `validate()` / `unique()` / `distinct()`, or wiring reactive `live()` / `afterStateUpdated`
skip: working with read-only display primitives (`TextEntry` / `BadgeEntry` / etc.) — those are infolist entries, not form fields
metadata:
  author: pilotiq
---

# Pilotiq Fields

## When to use this skill

Load when you're:

- Picking a field type for a form (text vs textarea vs markdown vs richtext, single-select vs multi-select)
- Setting common chrome — labels, placeholders, helper text, prefixes, suffixes
- Adding validators (`required`, `email`, `min/maxLength`, `pattern`, `unique`, `distinct`)
- Wiring reactive behavior — `live()` to re-resolve schema on change, `afterStateUpdated()` to imperatively update sibling fields

For Resource-level concerns (when to override `form()` itself), use `pilotiq-resource`. For relation-backed array fields (`Repeater.relationship()`), see `pilotiq-relations`.

## Quick Reference

| Task | Open |
|---|---|
| Field types — full catalog of 24 built-ins, when to use each | `rules/field-catalog.md` |
| Validation — built-in validators, `unique()` async DB probe, `distinct()` cross-row uniqueness | `rules/validation.md` |
| Reactive fields — `live()`, `afterStateUpdated`, `afterStateUpdatedJs`, `$get` / `$set`, multi-form `formId` | `rules/reactive-fields.md` |

## Key concepts (load once)

- **Every field is a static `make(name)` builder.** `TextField.make('title').required().label('Title')` — the `name` is the form field name AND the model column name.
- **Common setters cascade from `Field` base.** `.label() / .helperText() / .placeholder() / .default() / .prefix() / .suffix() / .required() / .validate() / .visible() / .hidden() / .disabled() / .columnSpan() / .live() / .afterStateUpdated() / .dehydrated() / .formatStateUsing() / .autofocus() / .hiddenLabel() / .disabledOn() / .hiddenOn() / .visibleOn()` work on every subclass.
- **Operation-aware shortcuts.** `disabledOn(['edit'])` / `hiddenOn(['view'])` / `visibleOn(['create', 'edit'])` resolve against page mode (`'create' | 'edit' | 'view'`). They no-op on custom Pages (mode unset). `readonly()` still wins over `disabledOn`.
- **Validators are async.** `Validator = (value, ctx?) => string | null | Promise<string | null>` — return a message string to fail, `null` to pass. `validateSchema()` awaits each field's validators in declaration order.
- **Reactive fields require `live()`.** Without it, `afterStateUpdated` only fires on submit. With it, every change POSTs to a partial-resolve endpoint that re-runs the schema with fresh `$get/$set` state.
- **Live forms must pin `formId`.** `Form.make().formId('details')` is required when more than one form lives on a single page. The auto-fallback covers single-form pages.

## Examples

- `playground/app/Pilotiq/Articles/Schemas/form.ts` — typical form with TextField / Textarea / SelectField / DateField.
- `playground/app/Pilotiq/Posts/Schemas/form.ts` — reactive fields (`live()` + `afterStateUpdated`) for title→slug.
- `playground/app/Pilotiq/BlocksDemo/Schemas/form.ts` — Builder field with heterogeneous block types.
