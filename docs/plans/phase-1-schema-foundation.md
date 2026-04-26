# Phase 1 — Schema Foundation Plan

Establish the composable primitive model for `@pilotiq/pilotiq` that Pages, Resources, and Globals all build on top of. This is the **single highest-leverage piece of the new pilotiq architecture** — every later feature (forms, tables, AI, collab) depends on the shape we lock in here.

**Status:** PROPOSED — awaiting alignment.

**Depends on:** none (this is the foundation).

**Related memory:** `project_pilotiq_package.md`

---

## Goal

After this phase, `@pilotiq/pilotiq` exposes one composable primitive — **`Element`** — with two specialized subtypes (**`Field`** for form inputs, **`Action`** for handlers). Display things (Text, Heading, Card, Section, Stat, Tabs) extend `Element` directly without an intermediate category. Resources, Pages, and Globals are thin wrappers that arrange Elements; they have no unique element types of their own.

Concretely:

1. A single `Element` interface (`getType()` + `toMeta()`) is the contract every primitive implements.
2. **Field** = form input. Knows its `name`, holds optional validation/visibility/persistence config.
3. **Element** = display block. Renders content. Some Elements are **containers** (Card, Section, Tabs) and have `children: Element[]`; others are **leaves** (Text, Heading, Stat).
4. **Action** = does something. Has a handler, optional confirmation form, optional URL navigation.
5. The **resolver** is plugin-extensible — built-in handlers cover the core primitives, plugins register new types.
6. Existing `src/schema/` and `src/fields/` are refactored to fit this model. `@pilotiq/panels` is **not touched** — it stays on its current architecture until sunset.

---

## Non-Goals

- **Porting every panels primitive at once.** Phase 1 covers the foundation + a minimum viable element set. Stats, Chart, Table, RelationManager, Dialog, Wizard — all Phase 2+.
- **Replacing the editor (Lexical → Tiptap).** Tracked separately; the `RichContentField` lands later once a Tiptap reference example is provided.
- **Building Resources/Globals end-to-end.** Phase 2 covers those. Phase 1 stops at "Resource and Page can compose Phase-1 primitives".
- **Changing `@pilotiq/panels` during this phase.** Panels stays untouched while new pilotiq grows. **End-game** (after all features are ported and the AI/Collab pro plugins are retargeted to new pilotiq): the entire `@pilotiq/panels` package is deleted. Phase 1 doesn't trigger that — but every architectural decision here is made knowing panels has a finite lifespan.
- **Designing the plugin extension points for AI/Collab.** That's Phase 3. Phase 1 just makes sure plugins *could* hook in cleanly later — no specific hooks.

---

## Audit Summary

(See full audit at the top of this doc's PR / conversation. Headlines:)

**New pilotiq has:** 5 display elements (Text, Heading, Alert, Divider, Card), 9 form fields (Text, Email, Number, Select, Slug, Textarea, Toggle, Date), Page, Resource shell, Column.

**New pilotiq is missing:** unified base interface across SchemaElement and Field; `Field.toMeta()`; layout primitives (Section, Tabs, Grid); display primitives (Stat, Chart, Table, View-as-data-adapter); Action and Filter classes; conditional visibility; validation hooks; persistence hooks; Global concept; plugin-extensible resolver.

**Critical inconsistencies inside new pilotiq:**
- `SchemaElement` (display) and `Field` (form input) are unrelated hierarchies. They can't be composed in the same tree.
- `SchemaElement` subclasses serialize via `toMeta()`. `Field` has no serialization. `Column` has neither.
- `resolveSchema()` only walks `Card` recursively. No plugin registry, no field handling, no conditional filtering.

---

## Recommended Architecture

### Element as the base, two specialized subtypes

```
Element                          // base — getType, toMeta, optional children: Element[]
  │
  ├── Field                      // specialized — has name, value, validators, visibility flags
  │     ├── TextField, EmailField, NumberField, SelectField, ToggleField, ...
  │     └── (extension point for plugins: RichContentField, MediaField, ...)
  │
  ├── Action                     // specialized — has handler, optional confirm form
  │     └── (placement: 'inline' | 'bulk' | 'row' | 'header')
  │
  └── (display elements extend Element directly — no intermediate category)
        ├── leaf elements:       Text, Heading, Alert, Divider, Stat
        └── container elements:  Card, Section, Tabs, Grid    // have children: Element[]
```

### Why this shape

There's no separate `Node` base or `View`/`Block`/`Display` category. **Everything in the schema tree IS an Element.** `Field` and `Action` are the only specialized subtypes — they have specific lifecycles (input value, action handler) that justify their own classes. Display things (Text, Heading, Card, Section) extend `Element` directly because they don't need any extra plumbing — they're just `getType()` + `toMeta()` + optional children.

### Containers

Any `Element` can have `children: Element[]`. Most don't — leaves like `Text` and `Heading` leave it undefined. Containers (`Card`, `Section`, `Tabs`, `Grid`) populate it with any mix of Fields, other Elements, and Actions. This replaces panels' `FormItem = Field | Section | Tabs` discriminated union — a single rule (`children: Element[]`) covers all container scenarios.

### Field anatomy

Every Field has, baked into the base class:
- `name`, `_label`, `_required`, `_readonly`, `_placeholder` (already exist).
- **New, ported from panels:** `_hideFromTable`, `_hideFromCreate`, `_hideFromEdit`, `_hideFromView`, `_showWhen`, `_hideWhen`, `_disabledWhen`.
- **New:** `_validators: Validator[]` — pure functions `(value, ctx) => string | null`. Run on the server during submit; serialized rules also run client-side for live UX.
- **Deferred to Phase 2/3:** persistence (localStorage/url/Yjs), AI hooks. Keep the field shape extensible so these can be added without breaking changes.

`Field.toMeta()` is **mandatory** — emits the JSON the client renders from. This is the primary fix vs. current state.

### Display-element anatomy

(Display elements = Elements that aren't Fields or Actions: Text, Heading, Alert, Divider, Stat, Card, Section, Tabs, Grid.)

- **Leaves** are just data + a renderer key. `Text { text: string }`, `Heading { level, text, description? }`, etc.
- **Containers** carry `children: Element[]` (heterogeneous — Fields, other display elements, Actions, all valid).
- Display elements are **read-only**. They don't have a `name` or value. If one needs to be data-driven (compute from a record), it's expressed via a callback at construction time, baked into `toMeta()`'s output before serialization.

### Action anatomy

- `name`, `label`, `icon`, `_destructive`, `_confirm`.
- One of: `handler: (ctx) => Promise<void>` (server action) or `href: string | (ctx) => string` (client navigation).
- Optional `form: Field[]` for "ask the user before running" (matches panels' Action-with-modal-form).
- Actions live anywhere — inline in an Element's children (a button inside a Card), or attached to a Resource (bulk action on a list).

### Serialization & resolver

- `Element.toMeta()` returns a plain JSON-safe object. The resolver walks the tree, calls `toMeta()` on every node, recurses into container `children`, and produces the `SchemaMeta` sent to the client.
- The resolver is async (already is) — async children resolve in parallel.
- **New: plugin registry.** `registerResolver(type, fn)` lets plugins (and pro packages) add new element types without modifying the core resolver. This is the seam AI/Collab will use.
- **New: visibility filter pass.** Before serializing a Field, the resolver checks `_hideFromTable` / `_hideFromCreate` / etc. against the current rendering context (`{ context: 'table' | 'create' | 'edit' | 'view' }`) and drops fields that opt out.

### Resource & Page integration

- **Page**: keep `static schema(ctx)` returning `Element[]`. No change in shape — just the type widens from `SchemaElement[]` to `Element[]`.
- **Resource**: gains `.detail()` returning `Element[]` (port from panels). `table()` and `form()` config objects are refactored to return `{ columns, actions, filters }` and `{ schema, ... }` respectively, where `schema` is `Element[]`. Column gains a `toMeta()` method and joins the resolver tree.
- **Global** (new): mirror of Resource for singletons — `.form()` returning `Element[]`. Phase 1 adds the class shell; Phase 2 fills in the lifecycle.

---

## Decisions (recommended answers to audit's open questions)

The audit listed 12 open questions. Recommendations for each — these are the calls the human needs to confirm before implementation.

| # | Question | Recommendation |
|---|---|---|
| 1 | Unify `SchemaElement` and `Field` under a common base? | **Yes** — `Element` is the base. `Field` and `Action` are specialized subtypes. Display things (Text, Heading, Card…) extend `Element` directly. Container Elements accept `Element[]` children. |
| 2 | When does `Field.toMeta()` get called? | At resolver time. Made mandatory on the base class. Visibility flags evaluated by resolver, not field. |
| 3 | Add Section/Tabs/Grid? | **Yes** — as container Elements. Phase 1 ships Section + Tabs + Grid. Wizard, Dashboard, Dialog deferred. |
| 4 | Where do Actions live? | **First-class Element**. Can appear inline in container Elements (header buttons in a Card) AND attached to Resource (bulk/row actions on lists). Both use the same `Action` base. |
| 5 | `Resource.detail()` vs `Page.schema()`? | **Both.** Resource gains `.detail(record)` for show pages. Custom one-off pages still use `Page.schema()`. They both return `Element[]`. |
| 6 | Form as a schema element? | **No** in Phase 1. Forms are config on Resource/Global, not embeddable elements. Revisit if a real use-case appears. |
| 7 | Add Global class? | **Yes** — Phase 1 adds the class shell, Phase 2 fills in lifecycle. Cheap to scaffold now. |
| 8 | Plugin resolver registry? | **Yes** — needed for pro packages (AI/Collab register new element types). Simple `Map<type, ResolverFn>`. |
| 9 | Visibility flags on Fields? | **Yes** — port `_hideFromTable/Create/Edit/View` + `_showWhen/hideWhen/disabledWhen`. Evaluated in resolver. |
| 10 | Nested Section/Tabs in Forms? | **Yes, via container Elements.** A Form's `schema: Element[]` can contain Sections containing Fields. Same as panels' nesting, but expressed through the unified Element model. |
| 11 | Column as a primitive? | **Yes** — gains `toMeta()`, becomes part of the resolver tree. Lives under `src/schema/` alongside other Elements. |
| 12 | Validation/display/persistence hooks scope? | **Validation: Phase 1**, on Field only. **Display formatting: Phase 1**, on Field (`.display(fn)`). **Persistence: Phase 2.** **AI hooks: Phase 3.** Field shape stays extensible — add later without breaking changes. |

---

## Implementation Order (sub-phases within Phase 1)

Each sub-phase is mergeable on its own. None of them break existing playground behavior.

### 1.1 — Base `Element` class + resolver refactor
- Replace existing `SchemaElement` interface (`src/schema/SchemaElement.ts`) with an abstract `Element` class — same `getType()` + `toMeta()` contract, plus optional `children: Element[]`.
- Update existing display classes (`Text`, `Heading`, `Alert`, `Divider`, `Card`) to extend `Element`.
- `resolveSchema()` rewritten to walk any `Element` tree, recurse into container children, return `Element.toMeta()` output.
- Add resolver registry (`registerResolver`) but no plugin uses it yet.
- **Tests**: cover the resolver — empty tree, leaf elements, nested containers, plugin registration.

### 1.2 — `Field.toMeta()` + visibility flags
- Make `toMeta()` mandatory on `Field`. Implement on all 9 existing field types.
- Add `_hideFromTable/Create/Edit/View` + `_showWhen/hideWhen/disabledWhen` to `Field` base.
- Resolver applies visibility filter using a `RenderContext` parameter.
- Update `SchemaRenderer.tsx` to render fields based on `toMeta()` output.
- **Tests**: cover field serialization, visibility filtering, render context propagation.

### 1.3 — Container elements + Field-as-Element
- `Field` extends `Element` (instead of being a separate hierarchy). Fields can now appear anywhere an Element can — including as `children` of containers.
- Card uses `children: Element[]` (replaces its current `_schema` getter).
- Add three new container Elements: `Section`, `Tabs`, `Grid`.
- **Tests**: container child resolution, mixing Fields + display elements + Actions in the same parent.

### 1.4 — `Action` primitive
- New `Action` base + concrete `ButtonAction`, `BulkAction`, `RowAction`, `HeaderAction`.
- Inline placement in container Elements works automatically.
- Resource gains `.actions()` returning `Action[]` for list-page bulk/row actions.
- **No handler dispatch yet** — that's Phase 2. Phase 1 just defines the shape and serialization.
- **Tests**: action serialization, optional confirmation form serialization.

### 1.5 — `Validator` hooks on Field
- `Field.validate(fn)` for inline validation. `_validators: Validator[]` runs server-side on submit.
- Built-in helpers: `required()`, `minLength(n)`, `email()`, `pattern(regex)`.
- Serialized rules emit on `toMeta()` so client can mirror them for live UX.
- **Tests**: validator composition, server-side runner, serialized rule shape.

### 1.6 — `Resource.detail()` + `Global` shell + `Column.toMeta()`
- Resource gains `.detail(record): Element[]`. `Page.schema()` unchanged.
- New `Global` class — same shape as Resource minus the list/table side.
- `Column` joins the Element tree with its own `toMeta()`.
- **Tests**: Resource shape, Global shape, Column serialization.

### 1.7 — Documentation pass
- Update `CLAUDE.md` with the new primitive model.
- Update `src/index.ts` exports — curate what's public.
- Add a `docs/schema.md` short reference (1–2 pages) for plugin authors.

---

## Open Questions for the User

Before kicking off 1.1, these need confirmation:

**Settled (2026-04-26):**

1. **`Element` as abstract class** (not interface). Lets us bake shared logic into the base (`_children` storage, `addChild()` helpers). Matches panels' style.
2. **Action handler signature: `handler: (ctx) => Promise<void>`** — same shape as panels.
3. **Validators: duplicate, don't share.** Old panels is being sunset; coupling new pilotiq to its API risks dragging baggage forward. Surface is small (~5 helpers). If a third consumer ever needs them, extract then.

**Deferred:**

4. **Action variants** (single class with `placement` field vs. separate `ButtonAction`/`BulkAction`/`RowAction`/`HeaderAction` classes vs. factory helpers). Sub-phase 1.4 ships ONE Action class with a `placement` field. Revisit after Phase 2's first real Resource exercises bulk + row + header actions — at that point we'll know whether placement-as-field is enough.

---

## Risks & Mitigations

- **Risk: foundation re-design forces second rewrite later** when AI/Collab actually plug in.
  - *Mitigation:* Ship 1.1's plugin registry early, exercise it with a trivial example plugin in Phase 1.6. Catches API smells before pro packages depend on it.

- **Risk: too many phases — perfectionism stalls feature development.**
  - *Mitigation:* Each 1.x sub-phase is independently mergeable. After 1.4 we can already build a usable Resource. 1.5–1.7 are polish.

- **Risk: divergence from panels patterns confuses users porting code.**
  - *Mitigation:* Where panels' API works, copy it verbatim (Field.required(), Action handler signature, etc.). Diverge only where panels has known issues (e.g. SchemaElement and Field unrelated — we unify).
