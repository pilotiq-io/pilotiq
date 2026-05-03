# Plan #16 — Infolist entries (read-only ViewPage primitives)

**Status:** PROPOSED — closes the audit's Tier-2 row "`infolist()` distinction on ViewPage (entries vs disabled form)" plus the related "Infolist entries distinct from primes (label-value pairs)" row.

**Estimated effort:** 2–3 days.

**Goal.** Today `Resource.detail(record)` returns the same form `Element[]` as `Resource.form(form)` — usually rendered read-only by reusing field elements. That's awkward now that the View / Edit sub-nav (2026-05-03) makes the two pages first-class peers. We want a sibling primitive hierarchy — `TextEntry`, `BadgeEntry`, `IconEntry`, `ImageEntry` — that:

- Is **read-only** by construction (no input components, no validators, no submit).
- Reads its value from the loaded `record` via a new `state(name)` setter (label-value pairs).
- Composes inside the existing layout containers (`Card`, `Section`, `Tabs`, `Grid`, `Split`, `Group`, `Fieldset`).
- Reuses the existing display chrome (`color`, `weight`, `size`, `tooltip`, `weight`, badge palette).
- Reuses the existing `Column` formatters (`since` / `dateTime` / `money` / `numeric` / `limit`) for visual parity with table cells.
- Stays orthogonal to the `Text / Heading / Alert / Image / Icon` display primes — those remain bare-string chrome; entries are *record-bound* label-value pairs.

The primary consumer is `Resource.detail(record)`. Nothing changes for users still wiring detail pages with display primes — those keep working unchanged. Entries are an additive surface.

---

## Reference idiom

Filament's **infolist** is the canonical reference (`TextEntry`, `IconEntry`, `ImageEntry`, `ColorEntry`, `KeyValueEntry`). Each entry is the read-only twin of a corresponding form field, with formatter chains (`->copyable()`, `->weight()`, `->since()`) layered on. Entries compose inside the same layout primitives forms use (`Section`, `Grid`, `Tabs`).

> Per repo convention (memory: `feedback_no_filament_in_user_artifacts`): the reference name does not appear in user-facing strings — tests, docs, and comments use neutral terms like "infolist" and "entry".

---

## What lands

### Phase 1 — Entry base + `TextEntry` leaf

New directory `packages/pilotiq/src/entries/`:

- **`Entry.ts`** — abstract base extending `Element`. Holds the shared chrome:
  - `state(name)` — record attribute path. `ctx.record[name]` resolves at `toMeta(ctx)` time. Required.
  - `label(text)` / `inlineLabel(v=true)` — rendered above (default) or to the left of the value.
  - `default(string)` / `placeholder(string)` — fallback when the resolved value is null / undefined / empty.
  - `helperText(text)` — small grey hint below the value (mirrors `Field.helperText`).
  - `tooltip(text)` — info-icon tooltip next to the label.
  - `formatStateUsing((value, record) => string)` — per-record formatter; runs at resolve, output stamped on meta as `_formatted`.
  - `copyable(label?)` — adds a copy-icon button next to the value; copies the *raw* state value (or the formatted string when `formatStateUsing` is set).
  - Returns `'entry'` from `getType()` (subclass overrides set the discriminator).

- **`TextEntry.ts`** — concrete leaf. The default and most common case.
  - `weight(ColumnWeight)` — `normal | medium | semibold | bold`.
  - `color(ColumnColor)` — `default | muted | primary | destructive | success | warning | info`.
  - `size(TextSize)` — reuses `'xs' | 'sm' | 'base' | 'lg' | 'xl'`.
  - `since() / dateTime(pattern?) / money(currency, locale?) / numeric({ decimals?, locale? }) / limit(chars)` — built-in formatters; mirror `Column`'s shape so `applyColumnFormat` can be reused at render.
  - `lineClamp(n) / wrap()` — truncation chrome, parity with `Column`.
  - `getType()` returns `'entry'`; `toMeta(ctx)` emits `entryType: 'text'` for renderer dispatch.

- **`Entry.toMeta(ctx)` shape (wire format):**
  ```ts
  {
    type:        'entry',         // unified discriminator (like 'field')
    entryType:   'text',          // subclass discriminator
    name:        'email',
    label:       'Email',
    value:       'foo@bar.com',   // resolved from ctx.record[name]
    inlineLabel?: boolean,
    default?:    string,
    helperText?: string,
    tooltip?:    string,
    weight?:     ColumnWeight,
    color?:      ColumnColor,
    size?:       TextSize,
    format?:     ColumnFormat,    // when a formatter was attached
    copyable?:   { label?: string },
    _formatted?: string,          // set when formatStateUsing was called
  }
  ```

- **`resolveSchema`** — broaden the existing `el instanceof Field || el instanceof Filter ? el.toMeta(ctx) : el.toMeta()` line to include `Entry` so entries see `ctx.record`.

- **`SchemaRenderer`** — new top-level `case 'entry'` branch that dispatches on `meta.entryType`. The `'text'` branch wraps the value in `<EntryShell>` (label + helperText + tooltip + copyable trigger), running it through `applyColumnFormat` first when `format` is set, falling back to `_formatted` when present.

- **Tests:** `entries/Entry.test.ts`, `entries/TextEntry.test.ts`. Cover state resolution, default fallback, every formatter, copyable, label/inlineLabel, color/weight/size.

### Phase 2 — `BadgeEntry`, `IconEntry`, `ImageEntry`

Three additional leaves with the same `Entry` parent. Each adds a `case` to `SchemaRenderer`:

- **`BadgeEntry`** (`entryType: 'badge'`) — pill rendering. `.colors({ active: 'green', draft: 'gray' })` maps state value → `BadgeColor`; falls back to `gray`. Reuses `BADGE_COLOR_CLASSES`.
- **`IconEntry`** (`entryType: 'icon'`) — value → icon name + color via `.options({ true: { icon: 'check-circle', color: 'success' }, false: { icon: 'x-circle', color: 'destructive' } })`. Reuses the boolean-column rendering pattern (`COLUMN_COLOR_CLASSES`, `resolveIcon`).
- **`ImageEntry`** (`entryType: 'image'`) — `.size(px) / .square() / .circle() / .rounded()`. Value is the image URL. Same shape map as `Image` prime / `ImageColumn`.

### Phase 3 — Record helper sugar

Tiny ergonomics layer; no new classes:

- `Entry.make(name)` static — sugar for `new Subclass(name)`. Each leaf re-declares its own `make(name)` like `TextField.make()` does.
- **Re-export the `Column` formatter helpers** from `entries/format.ts` so `TextEntry`'s formatter setters can call shared logic. (Implementation: extract `applyColumnFormat` into `entries/format.ts` first, re-import from `SchemaRenderer.tsx`. Avoids duplication.)
- **Layout positioning is inherited from `Element`** — `columnSpan / columnStart / columnOrder` and `visible / hidden` already work without entry-specific code.

### Phase 4 — Demo + docs

- **Playground demo.** A new section on `/new-admin/posts/:id` (the existing post ViewPage) reworked to use entries — `TextEntry::make('title').size('lg').weight('bold')`, `BadgeEntry::make('status').colors({ draft: 'gray', published: 'green' })`, `TextEntry::make('publishedAt').since().copyable()`, etc. Composed inside the existing `Section` + `Grid` layouts so we exercise inheritance.
- **Docs.**
  - New `docs/guide/infolists.md` — entry hierarchy, formatter chains, layout composition, "entries vs primes" decision matrix.
  - `README.md` — add a bullet under the schema-system section.
  - `packages/pilotiq/CLAUDE.md` — short summary of the entries directory + wire shape next to the existing schema/* notes.
  - `docs/plans/admin-gap-audit.md` — tick the two relevant rows.

---

## Non-goals (deferred)

- **`KeyValueEntry`** — admin-trusted JSON / kv display. Roll into a follow-up once we have a real consumer.
- **`ColorEntry`** — read-only swatch. Trivial follow-up; defer until needed.
- **Entries inside `RelationManager.detail()`.** Should work for free (managers also call `R.detail(record)`-style hooks), but no explicit demo in v1.
- **Custom-component entries.** Pattern parallels `View` widget — punt until a consumer asks for it.
- **Interactive copyable on the server.** v1 ships client-side `navigator.clipboard.writeText` only.
- **Entries inside table cells.** Cells already have the `Column` hierarchy with the same formatters; mixing entries in would just be confusing.

---

## Risks & call-outs

- **Type collision.** `entries/Entry.ts` is a new top-level export; no existing symbol named `Entry` in the public API (verified via `grep`). `entries/` is a new directory parallel to `fields/`, `columns/`, `filters/`, `schema/`, `actions/`.
- **`type: 'entry'` discriminator.** Currently unused by `SchemaRenderer.renderElement` — confirmed via `grep`. Adding it as a new switch case is a clean extension.
- **Layout-visibility.** `Element.visible()` / `hidden()` already covers entries via the resolver's "every Element except Field/Action/ActionGroup" branch — no changes needed there.
- **`ctx.record` propagation.** ViewPage already builds the loaded record into `RenderContext.record` via the form's load-hook fallback, and `dispatchPageData → resourceViewData` threads it through the `resolveSchema` call. Entries just consume it.
- **Detail-page back-compat.** Existing `Resource.detail()` overrides return `Element[]`; the type signature already accepts entries (entries extend `Element`). No breaking change.
- **`Entry` vs `Filter` ctx pattern.** `Filter.toMeta(ctx?: RenderContext)` is already async-aware; we follow the same shape. Don't widen `Element.toMeta()` itself — keep the override-only escape hatch.
- **Tests.** Plan #16 should bump test count by ~25–35 (Entry base unit tests + per-leaf builder tests + render-pipeline integration in `defaultViewPage.test.ts`).

---

## Out of scope, but worth noting

If `Resource.detail()` ever gets the full async ctx treatment (like `Resource.headerSchema(ctx)` already does for widgets), entries would naturally use it. v1 keeps `detail(record)` sync to avoid a breaking change — entries' `state` resolves against the `record` argument plus `ctx.record` in the resolver.
