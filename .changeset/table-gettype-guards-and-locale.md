---
"@pilotiq/pilotiq": minor
---

feat(pilotiq): `Pilotiq.locale()` for deterministic date/number formatting + fix row actions & date cells under dev module-duplication

**Fix — row actions and date cells silently broke after a dev HMR re-boot.**
`dispatchTable`'s per-row stamping pass was gated behind `instanceof Column` / `instanceof Action` / `instanceof SelectColumn` (and `Table.getColumns()` / `getFilters()` used `instanceof` too). Under Vite SSR module duplication — which happens after editing a panel/schema file in dev — the page's element classes resolve to a different module identity than the ones these files import, so `instanceof` returned false and the whole pass was skipped. Symptoms: rule-gated row actions (`.visible()` / `.disabled()`) never appeared (no `_visibleActions` stamp), and built-in `dateTime` / `since` cell formats weren't stamped into `_formatted`, so the client re-formatted dates in the browser locale → React hydration mismatch. All of these now match structurally on `getType()` (mirroring the earlier `findTables` fix). Production SSR was unaffected (single bundle, no duplication); this restores correct dev behavior.

**Feature — `Pilotiq.locale(localeTag)`.** Sets the BCP-47 app locale used to format built-in `dateTime` / `money` / `numeric` column and infolist-entry formats. Formatting runs once server-side and is stamped into `_formatted`, so it must be deterministic — without an explicit locale, `Intl` / `toLocaleString` fell back to the Node host machine's locale, which differs between a dev box and a prod server (and from the user's browser). Pass the same locale your app's localization config uses, e.g. `Pilotiq.make('Admin').locale('en')`. A per-column `Column.money({ locale })` still wins over the panel default; unset leaves the previous host-default behavior.

Also (table design):
- **Smooth row reordering via `@dnd-kit`.** Reorderable tables (`Table.reorderable(col)`) now drag through `@dnd-kit` (`DndContext`/`SortableContext`/`useSortable`) instead of native HTML5 DnD — animated, keyboard-accessible (focus grip → Space → ↑/↓ → Space), grip-handle-only so cell links/inputs stay clickable. Optimistic reorder + POST-or-rollback persistence unchanged. `@dnd-kit/{core,sortable,modifiers,utilities}` added as dependencies; non-reorderable tables render exactly as before (no `DndContext`, zero overhead).
- Column-header sort indicator replaced with a two-arrow `arrow-up-down` icon whose halves are independently colored: the half matching the active sort direction is highlighted, the rest stays muted (both muted when unsorted, lifting on header hover).
- Column headers restyled to the quiet shadcn convention — `text-muted-foreground font-medium`, normal case (was `text-xs uppercase tracking-wider`).

Also (page-header design):
- `Heading` titles render at `font-semibold` (was `font-bold`); single-line header actions are vertically centered against the title.
- View/record pages (`ViewPage`) now attach their `getActions()` (Edit / Delete / …) to the page heading — right-aligned next to the title, matching create/edit pages — instead of rendering them as full-width stacked buttons below it. `Heading.actions()` widened to accept any action-like element (Action / ActionGroup / SlotComponent), and `buildHeader` is form-agnostic (works without a form) and uses `getType()` rather than `instanceof`.
