# Layouts

Layout primitives wrap fields with chrome (cards, sections, columns,
wizards) without changing the data shape. Every layout is an `Element`
that may contain children — including more layouts.

## Section

```ts
Section.make('Customer details')
  .description('Name and contact info')
  .icon('user')
  .columns(2)
  .schema([
    TextField.make('first'),
    TextField.make('last'),
    TextField.make('email').columnSpan(2),
  ])
```

| Setter | Effect |
|---|---|
| `.description(text)` | Subtitle below the heading |
| `.icon(name)` | Lucide / Tabler icon next to the title |
| `.badge(text)` | Small pill in the header |
| `.aside()` | Renders as right-rail when nested in `Split` |
| `.compact()` | Tightens outer padding + heading size |
| `.dense()` | Tightens inner gap (gap-2 vs gap-4) |
| `.secondary()` | Muted background variant — recedes beneath a primary section |
| `.collapsible()` | Adds chevron toggle |
| `.collapsed()` | Start collapsed |
| `.persistCollapsed(key?)` | Remember collapse state in localStorage |
| `.columns(n)` | Inner CSS grid columns |
| `.afterHeader([Action…])` | Right-aligned action buttons in the section header |

```ts
Section.make('Posts')
  .afterHeader([
    Action.make('refresh').label('Refresh').icon('refresh-cw').iconButton(),
    Action.make('export').label('Export').handler(async () => { /* … */ }),
  ])
  .schema([ /* … */ ])
```

`afterHeader` accepts `Action[]` only — every Action's chrome
(`.color() / .icon() / .iconButton() / .visible() / .disabled()`)
works the same as in any other slot.

## Grid / Group / Fieldset / Split

| Element | Use case |
|---|---|
| `Grid` | Named CSS grid; children declare `columnSpan(n)` / `columnStart(n)` |
| `Group` | Chrome-less wrapper — useful for visibility gating |
| `Fieldset` | `<fieldset><legend>` semantics, lighter than Section |
| `Split` | Two-column layout; second child auto-routes to right-rail |

## Wizard

Multi-step form. Each step has its own schema; navigation enforces
validation per step before advancing.

```ts
Wizard.make()
  .steps([
    Step.make('Account')   .icon('user')      .schema([...]),
    Step.make('Billing')   .icon('credit-card').schema([...]),
    Step.make('Confirm')   .icon('check')     .schema([...]),
  ])
  .skippable()
  .startOnStep(0)
  .persist(false)
```

> [!IMPORTANT]
> Wizards work with reactive fields — cross-step `$get` reads always see
> the freshest values because all steps resolve every cycle.

### Step hooks

Each `Step` can run async hooks around the validation gate that fires
when the user clicks Next. Use them to mutate values before validators
run, run availability checks the schema-level validators don't cover,
or fire side effects that should only run on confirmed advance.

```ts
Step.make('Email')
  .schema([TextField.make('email').required()])
  .beforeValidation(async (values, { user }) => {
    // Mutate values in place — the validators see the updated object.
    values['email'] = String(values['email'] ?? '').toLowerCase()
  })
  .afterValidation(async (values, { record, user }) => {
    // Async availability check that schema-level validators don't cover.
    const taken = await User.query().where('email', '=', values['email']).paginate(1, 1)
    if (taken.data.length > 0) throw new Error('That email is already in use.')
  })
```

Both hooks receive `(values, { record, user })` and may be async. Throw
to halt the advance — the thrown message lands under the reserved
`_step` error key in the 422 response so the renderer can surface it
next to the Next button. `beforeValidation` runs first, then the
schema validators, then `afterValidation` only when validators pass.
