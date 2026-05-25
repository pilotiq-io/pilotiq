# Responsive tables — card-per-row on mobile + auto-card from columns

**Status:** SHIPPED 2026-05-26. Phase A `d9fbf5f` (auto-card), Phase B `6cd595b` (`stackOnMobile`), Phase C `369196d` (`visibleFrom`/`hiddenFrom`), Phase D docs + changeset. All four layouts user-verified by resizing at `:3003`. Released as part of the next `@pilotiq/pilotiq` minor (changeset `table-responsive-cards`).

**Goal:** a normal columnar list table should stay a table on desktop and collapse to **one card per row on mobile**, so wide tables stop forcing a horizontal scroll on phones. The card content is **built automatically from the table's columns** (no hand-written schema required), with optional image/description and a full override escape hatch.

This closes the one real responsive-table gap vs the design reference (its v5.2.0 "stacked rows on mobile") while reusing the card layout pilotiq already ships (`Table.cards()` / `CardsLayoutBody`). The reference stacks the *defined columns* as label·value lines and leaves the richer "avatar + title" row to hand-built `Split`/`Stack` composition; pilotiq goes one better by auto-deriving a titled card from each resource's `recordTitleAttribute` (+ optional image/description), since pilotiq already knows that metadata per resource.

---

## Decisions (locked)

1. **Opt-in, not on-by-default.** `Table.stackOnMobile('md')`. Existing tables keep today's horizontal-scroll until the author opts in — a silent mobile reflow of every customer table is the worse default, and it matches pilotiq's posture (`cards()`, `dense()`, `deferLoading()` are all opt-in). (The reference ships it on by default, but it controls its own theme; pilotiq is a library.)
2. **No new renderer — reuse `CardsLayoutBody`.** Below the breakpoint, render rows through the existing card body, forced to one column. That *is* the stacked-rows look. The only genuinely new rendering bit is the auto-card-from-columns content.
3. **Auto-card content, when no `cardSchema` is set:** optional image, title (heading), optional description (muted subtitle), then the remaining columns as `label · value` lines. Title is the only required piece.
4. **Card field sources (all optional except title):**
   - Title — `Resource.recordTitleAttribute` (already exists).
   - Image — new optional `Resource.recordImageAttribute`; if unset, fall back to the first `ImageColumn` in the table if there is one, else no image.
   - Description — new optional `Resource.recordDescriptionAttribute`; unset → omitted.
   - Rest — the table's other columns, reusing each row's already-computed `_formatted[col]` so the card matches the table exactly.
5. **`cardSchema` becomes three-level.** Signature widened to `cardSchema((record, auto) => Element[])`:
   - no `cardSchema` → auto-card.
   - `cardSchema(record => [...])` (one arg) → full replace (today's behaviour — Videos is unchanged).
   - `cardSchema((record, auto) => [...auto, extra])` → extend the auto-card.
   The current "No card content configured" empty state goes away — it becomes the auto-card.
6. **Per-column responsive visibility uses the reference idiom:** `Column.visibleFrom('md')` / `Column.hiddenFrom('md')` — breakpoint-parameterized, not a boolean `hiddenOnMobile()`. A `visibleFrom('md')` column is desktop-only (in the table, not in the mobile card); a `hiddenFrom('md')` column is mobile-only (in the card, not the desktop table). Same idiom, both surfaces.

### Explicitly deferred (v2)
- A `Split`/`Stack` table-column composition system (the reference's full mechanism). The auto-card covers the common case; composition is a separate, larger feature — only if a consumer asks.
- A user-facing density toggle for the desktop table (compact/comfortable) — not a reference feature either; out of scope.
- Per-card-line breakpoint control finer than `visibleFrom`/`hiddenFrom`.

---

## API surface

```ts
// Resource — new optional record-identity statics (mirror recordTitleAttribute)
static recordImageAttribute?       = 'thumbnail'
static recordDescriptionAttribute? = 'excerpt'

// Table — opt into responsive card-on-mobile
table.stackOnMobile()        // breakpoint defaults to 'md'
table.stackOnMobile('sm' | 'md' | 'lg')

// Table — extend/replace the auto-card (signature widened, back-compatible)
table.cardSchema((record, auto) => Element[])

// Column — reference-idiom responsive visibility (applies to table cell AND auto-card line)
Column.make('slug').visibleFrom('md')   // desktop only
Column.make('tags').hiddenFrom('md')    // mobile only
```

`Table.cards()` is unchanged in meaning (cards at *every* breakpoint) — it just gains the auto-card default and the `(record, auto)` extension for free.

| | desktop | mobile |
|---|---|---|
| (nothing) | table | table (horizontal scroll) — unchanged |
| `stackOnMobile()` | table | auto-card (or `cardSchema`) |
| `cards()` | cards | cards |

---

## Server / wire changes

- **`Resource`**: `recordImageAttribute?` / `recordDescriptionAttribute?` statics.
- **`Table`**: `stackOnMobile(bp = 'md')` → emits `stackOnMobile: 'sm'|'md'|'lg'` on the meta (sparse). `cardSchema` callback gets the second `auto` arg.
- **`Column`**: `visibleFrom(bp)` / `hiddenFrom(bp)` → `visibleFrom?` / `hiddenFrom?` on column meta (sparse).
- **Thread record attributes into the table-load context.** `recordTitleAttribute` / `recordImageAttribute` / `recordDescriptionAttribute` ride `LoadTableHooks` (same path as the existing `locale` / `canEdit` hooks) from `resourceIndexData` into `dispatchTable.loadTableRecords`.
- **Auto-card builder (`dispatchTable.ts`).** When `cards` OR `stackOnMobile` is set, after per-row formatting, build the card `Element[]` per row:
  1. If a `cardSchema` is set, call it with `(record, autoElements)` — single-arg authors ignore `autoElements` (full replace); two-arg authors extend.
  2. Else use `autoElements` directly.
  Resolve through `resolveSchema` and stamp `_cardChildren` (exactly the key `CardsLayoutBody` already reads). The builder reuses `row._formatted[col]` for each column line so card and table values match. Columns whose `visibleFrom` ≥ the stack breakpoint are desktop-only → excluded from the auto-card.
  - **Cost note:** under `stackOnMobile`, `_cardChildren` is stamped even though most views are desktop. It's cheap (Element metas) and only when opted in.

No ORM contract change. No new route. Wire additions are sparse (absent unless opted in).

---

## Renderer changes

- **`TableRendererBody`** under `stackOnMobile('md')`: render **both** bodies and toggle with Tailwind responsive classes (literal class strings for the JIT scanner, à la `cardsPerRowClasses`):
  - the `<table>` wrapper → `hidden md:block`
  - `CardsLayoutBody` (forced one column) → `md:hidden`
  - Shared chrome (heading / search / filters / pagination / bulk toolbar) stays outside both — rendered once.
  - The "Sort by" picker (already shown in cards mode because headers are hidden) shows on **mobile only** here (`md:hidden`); the desktop table keeps its sortable column headers.
- **`CardsLayoutBody`**: add a `forceSingleColumn` prop for the mobile-stack case (ignore `cardsPerRow`, always one column). Otherwise unchanged — it already renders `_cardChildren` + reuses `_recordUrl` / bulk-select / row-actions / group banding.
- **`Column` `visibleFrom`/`hiddenFrom`**: stamp responsive `hidden` / `md:table-cell` (etc.) classes onto the `<th>` + `<td>` for that column. Breakpoint → literal class map (sm/md/lg), same JIT constraint.

---

## Phases

- **Phase A — auto-card + record attributes + `cardSchema(record, auto)`.** Makes `cards()` work with zero or partial schema. Verify on the Videos page: temporarily drop its `cardSchema` and confirm the auto-card (title + url/createdAt lines) appears; restore it and confirm the custom schema still wins; add a two-arg extend and confirm the extra element appends.
- **Phase B — `Table.stackOnMobile(bp)` responsive switch.** Table on desktop, card on mobile. Verify by resizing a normal list page (e.g. `/new-admin/articles`) across the `md` breakpoint — table ⇄ cards, sort-by picker appears on mobile, no horizontal scroll.
- **Phase C — `Column.visibleFrom` / `hiddenFrom`.** Per-column responsive trimming on both surfaces. Verify a `visibleFrom('md')` column disappears below `md` (table + card) and a `hiddenFrom('md')` column is mobile-only.
- **Phase D — docs + demo + changeset.** Add `stackOnMobile()` to a demo resource (and a `recordImageAttribute`/`recordDescriptionAttribute` showcase), document in `docs/guide/` (tables / card layout section), `@pilotiq/pilotiq` minor changeset. Mirror the relevant column/table additions into the boost guidelines if applicable.

Each phase builds + `pnpm -F @pilotiq/pilotiq test`; Phases A–C end with a user resize/visual check at `:3003` (browser verification is the user's call — don't drive a headless browser).

---

## Acceptance criteria

- A resource with `Table.stackOnMobile()` and **no** `cardSchema` shows a usable titled card per row below `md` (title + columns as label·value), and a normal table above `md`, with no horizontal scroll on mobile.
- `recordImageAttribute` / `recordDescriptionAttribute`, when set, enrich the auto-card; unset, they're cleanly omitted.
- `cardSchema(record => …)` (one arg) still fully replaces — Videos renders identically to today.
- `cardSchema((record, auto) => …)` appends/wraps the auto elements.
- `Column.visibleFrom('md')` / `hiddenFrom('md')` hide/show the column on the matching surface(s).
- Existing tables with none of these set render exactly as before (the additions are sparse/opt-in).
- 3093+ tests green; new unit tests cover the auto-card builder (Element shape from columns + record attributes), the `(record, auto)` extension, and the column visibility meta.

---

## References

- Existing card layout: `packages/pilotiq/src/react/schemaRenderer/table/CardsLayoutBody.tsx`, `Table.cards()` / `cardSchema()` / `cardsPerRow()`, demo `playground/app/Pilotiq/Videos/VideoResource.ts`.
- Per-row stamping + load hooks: `packages/pilotiq/src/elements/dispatchTable.ts` (`loadTableRecords`, `LoadTableHooks`), `src/pageData/resourcePages.ts` (`resourceIndexData`).
- Reference behaviour (design north-star, not named in shipped artifacts): "stacked table rows on mobile" (filamentphp/filament PR #19113, v5.2.0); `Split` / `Stack` table layout + `visibleFrom()` / `hiddenFrom()` (Tables → Layout docs).
- Related memory: card-listing layout, table query-string identifier, the @dnd-kit table-drag work (same renderer subtree).
