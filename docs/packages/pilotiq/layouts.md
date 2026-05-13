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

### Custom nav buttons

Override the chrome of the built-in Back / Next / Submit buttons. The
customizer receives a default `Action` and returns a customized one (or
a brand-new `Action`); chrome (`label`, `icon`, `color`, `size`,
`outlined`, `iconOnly`, `tooltip`, `disabled`) flows through to the
rendered button. Click behavior stays hardwired (advance / recede /
submit-form) — dispatch overrides like `.handler()` are ignored.

```ts
Wizard.make()
  .steps([...])
  .previousAction(a => a.label('Go back'))
  .nextAction(a => a.label('Continue').icon('arrow-right'))
  .submitAction(a => a.label('Create campaign').size('lg'))
```

`submitAction` is the opt-in case: by default the wizard renders a hint
pointing at the surrounding form's Save button. Setting `submitAction`
mounts a real `<button type="submit">` inside the wizard chrome on the
final step — use this when the wizard is the entire form and there's no
page-level Save. Pair with `CreatePage.getFormActions(R)` returning `[]`
to suppress the page-level Save when you'd otherwise have two submits.

### Persist step in URL

```ts
Wizard.make().steps([...]).persistStepInQueryString()           // ?step=2
Wizard.make().steps([...]).persistStepInQueryString('checkout') // ?checkout=2
```

Mirrors the active step to the URL as `?<key>=N` (1-based for human-
friendly URLs). When set, the URL value wins over `localStorage` on
initial mount, so deep-linking to a specific step works. Bare wizards
keep `localStorage` as the only persistence — toggle with `.persist(false)`
to disable that. Multi-wizard pages should use distinct keys to avoid
collisions on the same query string.

## Panel-level chrome

The page-level layouts above run *inside* the panel chrome (sidebar
or topbar). Customizing the chrome itself is a separate surface:

- **Splice into named positions** — [render hooks](../../guide/render-hooks.md)
  inject `Element[]` at `panels::sidebar.start`, `panels::topbar.end`,
  `panels::user-menu.before`, etc. Use these for banners, badges, and
  per-page widgets that sit alongside the framework defaults.
- **Replace a whole region** — [component slots](../../guide/component-slots.md)
  swap an entire chrome region with your own React component. Three
  slots ship: `nav` (replaces the sidebar nav body / topbar nav
  cluster — surrounding chrome stays), `header` (replaces the whole
  `<header>` chrome bar — search / theme / bell / user menu in
  `SidebarLayout`, the entire top region including the brand + nav
  in `TopbarLayout`), `footer` (mounts a `<footer>` element below
  the main content area in both layouts).
  ```ts
  Pilotiq.make('admin').components({
    nav:    MyCustomSidebar,
    header: MyTopBar,
    footer: MyFooter,
  })
  ```
- **Wrap with a React provider** — `Pilotiq.layoutProvider(C)` mounts
  a context provider around `<AppShell>` so a plugin's React context
  is in scope for every page. See
  [Extending pilotiq → Layout providers](../../guide/extending-pilotiq.md#layout-providers).
- **User menu** — `Pilotiq.userMenuItems([...])` / `.signOut(...)` /
  `.profile(P)` configure the top-right dropdown. See
  [User menu](../../guide/user-menu.md).
