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
| `.collapsible()` | Adds chevron toggle |
| `.collapsed()` | Start collapsed |
| `.persistCollapsed(key?)` | Remember collapse state in localStorage |
| `.columns(n)` | Inner CSS grid columns |

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
