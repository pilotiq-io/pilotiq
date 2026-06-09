# Global defaults — `configureUsing()`

Set app-wide defaults for a primitive once, instead of repeating the same
chrome on every field or column. Mirrors Filament's
`Component::configureUsing()`.

```ts
import { TextColumn, TextField } from '@pilotiq/pilotiq'

// Every TextColumn made afterward starts toggleable…
TextColumn.configureUsing(c => c.toggleable())

// …and every TextField gets a one-column span + a 255 max length.
TextField.configureUsing(f => f.columnSpan(1).maxLength(255))
```

Register these once at panel-build time (e.g. in `bootstrap/providers.ts`
or your panel module) before the resources that use them are constructed.

## When the callback runs

The configurator runs at `.make()` time, **after** the framework's built-in
defaults but **before** any per-instance setter — so a one-off override
still wins:

```ts
TextField.configureUsing(f => f.helperText('Default hint'))

TextField.make('title')                       // helperText = 'Default hint'
TextField.make('slug').helperText('Custom')   // helperText = 'Custom'
```

## Scoping and ordering

- **Per class.** A registration on `TextField` affects `TextField` only —
  not `NumberField`, not a sibling.
- **Inheritance.** Ancestor-class registrations run before descendant-class
  ones, so the more specific class wins on a conflicting default:

  ```ts
  Field.configureUsing(f => f.columnSpan(1))      // applies to ALL fields
  TextField.configureUsing(f => f.columnSpan(2))  // TextField overrides to 2
  ```

- **Stacking.** Multiple registrations on the same class all run, in call
  order.

## Clearing

`Element.resetConfigurators(className?)` removes registrations — pass a class
name to clear just one, or omit it to clear everything. Mainly a test seam;
the registry otherwise lives for the process lifetime.

## Scope

Wired on **every Element primitive** — fields, columns, infolist entries,
filters, actions, layout containers (`Section` / `Grid` / `Tabs` / `Wizard` /
…), display primitives (`Text` / `Heading` / `Image` / …), and the dashboard
widgets. So `Action.configureUsing(a => a.icon('plus'))` or
`Section.configureUsing(s => s.compact())` work the same way as on a field.

The only things you can't configure this way are the value-objects that aren't
Elements — table `Summarizer`s, query-builder `Constraint`s, `Stat`, builder
`Block`, `TableGroup`, and `RowButton`. Set their defaults inline.
