# Pilotiq admin-API gap audit — Tables, Resources, Schemas, Forms

A panoramic inventory of where pilotiq stands relative to mature server-driven admin frameworks across the four most-touched surface areas. Goal: turn "let's reach feature parity" into a sequenced roadmap of plan docs, not a single 6-month rewrite.

**Status:** PROPOSED — directional roadmap. Each tier-1 area gets its own focused plan doc before implementation.

**Companion plan:** `actions-tier-1.md` (already written) — handles the Action API gap exhaustively. This doc references it and does NOT duplicate.

**Methodology:** read 24 reference admin-framework docs (tables, columns, filters, layouts, summaries, grouping, empty-state, custom-data, the eleven resources pages, schemas overview/layouts/primes/custom-components, forms overview) + audited current pilotiq source.

---

## TL;DR — the recommended sequence

Land in this order. Each step is independently shippable; later steps build on earlier ones.

| # | Plan doc | Effort | Why this order |
|---|---|---|---|
| 1 | ✅ `actions-tier-1.md` DONE | ~3 days | Slots, form-modal actions, variants, visibility, ActionGroup all shipped 2026-04-29. |
| 2 | ✅ `column-types.md` DONE | ~2 days | TextColumn formatters + Badge/Icon/Boolean/ImageColumn + Table chrome (heading/description/striped/emptyState) shipped 2026-04-29. |
| 3 | ✅ `notifications.md` DONE | ~1 day | Notification builder + Toaster + JSON-response wiring shipped 2026-04-29. Flash across 303 redirects via `@rudderjs/session` shipped 2026-04-30 (`flash-notifications.md`). |
| 4 | ✅ `page-lifecycle-hooks.md` DONE | ~1 day | Form lifecycle split (create/update), fill-side hooks, page-class overrides, default success toasts shipped 2026-04-30. |
| 5 | ✅ `reactive-fields.md` DONE | ~3 days | `live()` + `$get/$set` + `afterStateUpdated` + dependent options + reactive visibility shipped 2026-04-30 (server) and 2026-05-01 (client + demo). |
| 6 | ✅ `field-types-expansion.md` DONE | ~3 days | Hidden / Checkbox / Radio / CheckboxList / Slider / ColorPicker / DateTimePicker / KeyValue / FileUpload + Field cross-field plumbing (prefix/suffix/helperText/default/dehydrated/formatStateUsing) + UploadAdapter contract + localUpload + `_uploads` route shipped 2026-05-01. Demo at `/new-admin/field-types-demo`. |
| 7 | `list-page-tabs.md` | ~1 day | High value (every "Drafts / Published / Archived" view), small scope, layers on existing Tabs primitive. |
| 8 | ✅ `schema-layouts.md` DONE | ~2 days | Wizard / Step, Fieldset, Split, Group, Element-level visibility + columnSpan/columnStart, Section polish (icon/badge/aside/compact/persistCollapsed), wizard step-validate endpoint shipped 2026-05-01. Demo at `/new-admin/layouts-demo`. |
| 8.5 | ✅ `icon-system.md` DONE | ~1 day | Component-typed `Resource.icon = Newspaper` via Vite-plugin manifest + string registry for schema-time icons. Multi-library (lucide / tabler / heroicons / phosphor). Shipped 2026-04-30 as a prereq for #9. |
| 9 | `resource-navigation.md` | ~1 day | navigationGroup, navigationSort, navigationBadge, recordTitleAttribute. Cosmetic but expected. Builds on icon-system (above). |
| 10 | `authorization.md` | ~2 days | Resource policies (canView/canCreate/canEdit/canDelete). Pairs with @rudderjs/auth wiring. |
| 11 | ✅ `relations.md` DONE | ~2 weeks | RelationManager. Shipped 2026-05-01: class + ORM contract + data builder + IDOR + routes + Vike stubs + auto-Tabs + auth fall-through + reactive-integration doc + playground demo (`User → Posts`) + guide. 834 tests. Scoped to hasOne/hasMany/belongsTo; pivot/M2M deferred. Manager-row-action ergonomics polish (`RelationManagerContext` threaded into `static table()` + `Action.relation*(M, ctx)` factories) shipped 2026-05-01 as a follow-up. **M2M follow-up shipped 2026-05-03** (`relations-m2m.md`): `RelationMode` + auto-detection + `canAttach / canDetach` predicates + `Action.relationAttach / relationDetach / relationBulkDetach` factories + manager-scoped `_action / _detach` routes + Article ↔ Tag playground demo. ORM blocker for `belongsToMany` cleared same day. 1758 tests. |
| 12 | ✅ `global-search.md` DONE | ~1 week | `Resource.globalSearch` opt-in + 4 override statics + `searchAllResources` helper + `GET /_search` + Cmd+K palette + sidebar/topbar trigger pill shipped 2026-05-01. |
| 13 | ✅ `soft-deletes.md` DONE | ~1 week | Resource.softDeletes opt-in + TrashedFilter (auto-inject) + Restore/ForceDelete routes + Action.restore/forceDelete + bulk variants shipped 2026-05-01. Verified rudder ORM already shipped the primitives (Model.softDeletes, restore/forceDelete, withTrashed/onlyTrashed). 885 tests. Two-sided opt-in (Model + Resource) by design. Demo at `playground-pilotiq` PostResource. |

Penciled for later (Tier 3): Repeater/Builder fields ✅ shipped (Plans #14, #14-followup); widgets/dashboards ✅ shipped (Plan #15); import/export ✅ shipped (`import-export-actions.md`, 2026-05-03); resource nesting, sub-navigation still open.

**Cross-repo blockers tracked outside pilotiq:**
- ✅ `belongsToMany` / pivot / M2M — `@rudderjs/orm` shipped pivot support (2026-05-03). Pilotiq's RelationManager M2M follow-up is now **unblocked** — needs its own plan doc + impl (attach/detach/sync actions, pivot-form primitive, RelationManager M2M mode). Polymorphic relations status separate; verify before assuming.

---

## Inventory by area

### 1. Tables (`Table.ts`)

**We have:** columns, filters, recordActions/headerActions/bulkActions (via placement, slots-refactor coming in `actions-tier-1.md` #1), search, sort, pagination, defaultSort, perPage, currentPath, server-side filter values, `Table.records()` arbitrary loader.

**Gaps:**

| Feature | Tier | Notes |
|---|---|---|
| Column types (TextColumn, IconColumn, ImageColumn, BadgeColumn, BooleanColumn, ColorColumn, etc.) | **1** | We render every cell as bare text. **Plan #2.** |
| ✅ `defaultGroup` + `groups([...])` (group-by row banding) DONE | 2 | Shipped 2026-05-04 — server-side stable-sort + `_groupValue` + banded heading row. Rich `Table.groups([TableGroup.make(col).label().collapsible().getTitleFromRecordUsing().date()])` shipped 2026-05-03 — multi-option "Group by" dropdown above the table, per-row `_groupTitle`/`_groupDescription`, collapsible groups with `localStorage` persistence, date-bucketed grouping (`YYYY-MM-DD`). `defaultGroup(string \| TableGroup)` widened. URL key `?group=` reserved. Manual group ordering + per-group summarizers deferred. |
| ✅ `summaries()` (Sum/Avg/Count/Range row at footer) DONE | 2 | Shipped 2026-05-04 — `Column.summarize([Sum/Average/Count/Range])`; per-page only; `<tfoot>` row. **Per-group summary rows (2026-05-03):** when an active group is set, `loadTableRecords` also computes per-bucket summaries and stamps `TableMeta.groupSummaries`; renderer emits an inline summary row at the end of each group band. Cross-page aggregation deferred. |
| ✅ `reorderable(column)` (drag-to-reorder rows) DONE | 2 | Shipped 2026-05-04 — `Table.reorderable('sort')` + optional `ModelLike.reorder?(ids)` contract + `POST {base}/{slug}/_reorder` + grip-handle column with native HTML5 DnD. Drag locks off when filters/search/non-default-sort/page>1 are active so only the canonical order round-trips. |
| ✅ `poll(interval)` (auto-refresh) DONE | 2 | Shipped 2026-05-04 — SPA-friendly via vike navigate; pauses on hidden tab. |
| `recordUrl(fn)` (entire row clickable) | 2 | One-liner in renderer. |
| `striped()` | 1 | Trivial. Roll into #2. |
| ✅ `recordClasses(fn)` (per-row CSS) DONE | 2 | Shipped 2026-05-04 — server-side per-row eval, stamped under `_recordClasses`. |
| `heading() / description()` on Table | 1 | Trivial. Roll into #2. |
| `deferLoading()` (skeleton on first paint) | 3 | Edge case. |
| `queryStringIdentifier()` (multi-table on one page) | 3 | Currently we'd collide on `?sort=...`. |
| ✅ Editable columns (SelectColumn, ToggleColumn, TextInputColumn) DONE | 3 | Shipped 2026-05-03 — inline-edit cells PATCH a single column via `POST {base}/{slug}/:id/_cell/:column`. See `editable-cell-columns.md`. |
| ✅ `TernaryFilter` (true/false/blank) DONE | 1 | Shipped 2026-05-03 alongside `DateRangeFilter` — see `filter-expansion.md`. |
| ✅ `Filter` with custom schema (form fields per filter) DONE | 2 | Shipped 2026-05-04 — `FormFilter.make().form([fields…]).handle((q, values) => q).formIndicator(values => string)`. JSON-encoded single URL key. Inner schema resolved with the surrounding `RenderContext` via `resolveSchema`; field `defaultValue`s pre-hydrated from the parsed URL value so the popover round-trips. `parseFormFilterValue / encodeFormFilterValue` exported. |
| `persistFiltersInSession()` | 3 | Stateful behavior; defer. |
| Tabs on list page (filter-by-tab) | **1** | **Plan #7.** Layers on existing Tabs primitive. |
| `emptyStateHeading/Description/Icon/Actions` | 1 | We render bare "No records yet." Easy. Roll into #2. |
| Filtered-but-empty distinct empty state | 2 | Different copy when search/filter active. |
| Custom-data sort/search expectations (`$sortColumn`, `$columnSearches`) | already covered | Our `TableContext` already passes these. |
| Layout components (Stack/Split/Grid for card-listing) | 3 | "Cards listing" mode. Defer. |

### 2. Columns (`Column.ts`)

**We have:** `name`, `label`, `sortable`, `searchable`. That's it. One renderer (text).

**Massive gap:** Mature admin frameworks expose 10+ column types with `formatStateUsing`, `getStateUsing`, `tooltip`, `copyable`, `color`, `icon`, `badge`, `weight`, `size`, `wrap`, `lineClamp`, `limit`, `default`, `placeholder`, `since`, `dateTime`, `money`, `numeric`, `alignment`, `width`, `toggleable`. Each is a specific, common need.

**Recommendation:** Plan #2 ships a column-type hierarchy similar to fields:
- `TextColumn` (default) with `formatStateUsing` / `dateTime` / `money` / `numeric` / `since` / `limit` / `lineClamp` / `tooltip` / `copyable` / `color` / `weight` / `placeholder`
- `BadgeColumn` (pill rendering)
- `IconColumn` (boolean → icon mapping)
- `ImageColumn` (avatar / thumbnail)
- `BooleanColumn` (sugar over IconColumn)

Skip `ColorColumn` for now. Editable columns (`SelectColumn` / `ToggleColumn` / `TextInputColumn`) shipped separately — see `editable-cell-columns.md`.

**Editable columns** (Tier 3) shipped 2026-05-03 — see `editable-cell-columns.md`. Three new column subclasses (`TextInputColumn`, `ToggleColumn`, `SelectColumn`); per-cell PATCH route at `POST {base}/{slug}/:id/_cell/:column`; per-row server-side `R.canEdit` gate; optimistic UI with rollback toast on failure.

### 3. Filters (`filters/`)

**We have:** `SelectFilter`, `BooleanFilter`, `TernaryFilter`, `DateRangeFilter`, `TrashedFilter`. Active values from URL, `Filter.query(fn)` override, model-aware where-clause application.

**Gap:**

| Feature | Tier | Notes |
|---|---|---|
| ✅ `TernaryFilter` (true/false/blank — distinct from Boolean) DONE | 1 | Shipped 2026-05-03 — see `filter-expansion.md`. |
| ✅ Filter with arbitrary form schema (multi-field filters) DONE | 2 | Shipped 2026-05-04 — `FormFilter.make().form([fields…]).handle((q, values) => q)`. JSON-encoded URL key, async `toMeta(ctx)` resolves the inner schema with the same `RenderContext` as the surrounding table. |
| ✅ Filter `indicator()` (pill in active-filters bar) DONE | 2 | Shipped 2026-05-02 — Batch C. `Filter.indicator(string\|fn)` + `<ActiveFiltersBar>` pill row above the table. |
| `persistFiltersInSession` | 3 | |
| `QueryBuilder` filter (advanced AND/OR/grouped) | 3 | Big. |
| ✅ Date-range filter DONE | 2 | Shipped 2026-05-03 — see `filter-expansion.md`. |
| ✅ Multi-select filter DONE | 2 | Shipped 2026-05-02 — Batch C. `MultiSelectFilter.make().options([...])`, comma-separated URL value, `where(name,'IN',values)`. |

### 4. Resources (`Resource.ts`)

**We have:** `label`, `labelSingular`, `slug`, `icon`, `model`, `form()`, `table()`, `detail()`, `deleteRecord()`, `pages()`, `resolvePages()`, `relations()` (placeholder).

**Gap:**

| Feature | Tier | Notes |
|---|---|---|
| `navigationGroup` / `navigationSort` / `navigationLabel` / `navigationBadge` / `navigationParentItem` | **1** | **Plan #9.** Currently sidebar is flat. |
| `recordTitleAttribute` | 1 | Roll into #9; needed by global search later. |
| Authorization (canView/canCreate/canEdit/canDelete + canAccess) | **1** | **Plan #10.** Currently nothing. |
| Soft-delete integration (TrashedFilter, Force/Restore actions) | 2 | **Plan #13.** Needs @rudderjs/orm soft-delete support first. |
| `getEloquentQuery()` override (global scopes) | 1 | Just a hook on `Resource.model.query` we forward through. |
| Sub-navigation (View/Edit/Manage Relations tabs at record level) | 2 | UX polish; tied to relations. |
| Resource nesting (`/parent/{id}/child/...` URL) | 3 | Needs route registry + breadcrumb work. |
| Global search (cmd+K) | 2 | **Plan #12.** |
| Header / footer widgets per page | 3 | Big — widgets/dashboards system. |
| Custom resource pages (sibling of List/Create/Edit/View) | 1 | Mostly already supported via `Resource.pages()`; need to document the pattern + add nav-integration. |

### 5. Pages (`Page.ts`, `defaultPages.ts`)

**We have:** `ListPage`, `CreatePage`, `EditPage`, `ViewPage` — base classes with override hooks (`getHeader`, `getHeaderActions`, `getRowActions`, `getFormActions`, `getActions`).

**Gap:** lifecycle hooks. This is the single biggest day-1 ask from users coming from mature admin frameworks.

| Feature | Tier | Notes |
|---|---|---|
| `mutateFormDataBeforeFill` / `afterFill` | **1** | **Plan #4.** Add to `Form` lifecycle. |
| `mutateFormDataBeforeCreate` / `BeforeSave` | **1** | We have `mutateData` already; rename to align + add timing. |
| `beforeFill` / `afterFill` / `beforeCreate` / `afterCreate` / `beforeSave` / `afterSave` (sentinel hooks) | 1 | We have `beforeSave` / `afterSave`. Add the rest. |
| `handleRecordCreation` / `handleRecordUpdate` (override the save itself) | 1 | We already support this via `Form.save()`. Document. |
| `getRedirectUrl()` / customizable post-save redirect | 1 | We have `redirectAfterSave`. Document the override surface. |
| `getCreatedNotificationTitle` / `getSavedNotificationTitle` / disable notifications | 1 | Needs Plan #3 (notifications) first, then #4. |
| ✅ "Create & create another" submit DONE | 2 | Shipped 2026-05-03 — secondary outlined submit on `CreatePage` posts `_continueCreate=1`; create POST routes redirect back to `/create` and JSON includes `force:true` so SPA-nav remounts a fresh form on the same URL. |
| `getHeaderActions` on EditPage (delete/view/replicate buttons in header) | 1 | Already supported via override; document. |
| Wizard creation (`HasWizard` trait equivalent) | 2 | Tied to Plan #8 (Wizard layout). |
| `infolist()` distinction on ViewPage (entries vs disabled form) | 2 | Currently `Resource.detail()` returns Elements; need entry components (= primes-as-display, see Schemas section). |

### 6. Schemas / Layouts (`schema/`)

**We have:** `Heading`, `Text`, `Alert`, `Divider`, `Card`, `Section`, `Tabs`, `Tab`, `Grid`. Resolver walks children. `Tabs` migrated to shadcn primitive in late April.

**Gap:**

| Feature | Tier | Notes |
|---|---|---|
| `Wizard` / `Step` (multi-step form layout) | 2 | **Plan #8.** Pairs with reactive fields. |
| `Fieldset` (grouped fields with label/border) | 1 | Trivial. Roll into #8. |
| `Split` / `Flex` (horizontal flex layout) | 2 | Useful for two-column forms. |
| `Group` (logical grouping w/o visual chrome) | 1 | Trivial wrapper. |
| `columnSpan` / `columnStart` / `columnOrder` (positional control inside Grid) | 1 | Schema layouts feel cramped without these. Roll into #8. |
| ✅ `Section.dense()` DONE | 2 | Shipped 2026-05-03 — orthogonal to `compact()`: tightens inner grid gap (gap-2 vs gap-4) without changing outer padding. |
| Container queries (`gridContainer()`, `@md:`) | 3 | |
| `aside()` / `compact()` / `collapsed()` / `collapsible()` / `persistCollapsed` on Section | 2 | Section is currently inert; usability win. |
| Section `description()` / `icon()` / `badge()` | 1 | Trivial. Roll into #8. |
| `hidden(fn)` / `visible(fn)` on layouts (we have on Fields) | 1 | Easy uplift. |

### 7. Primes (display elements within `schema/`)

**We have:** `Heading`, `Text`, `Alert`, `Divider`. Decent baseline.

**Gap:**

| Feature | Tier | Notes |
|---|---|---|
| `Image::make` (display) | 1 | Trivial. |
| `Icon::make` | 1 | Trivial — we already use Lucide. |
| `UnorderedList` | 2 | |
| `Text` formatting: `color`, `size`, `weight`, `font`, `badge` | 1 | Polish on existing. |
| Markdown / HTML rendering | 2 | We have RichTextField for editing; need read-only display equivalent. |
| **Infolist entries** distinct from primes (label-value pairs) | 2 | Some frameworks treat `TextEntry`/`ImageEntry` as a different category from primes. We could collapse both into our primes since the distinction is mostly template-driven elsewhere. |

### 8. Forms / Fields (`fields/`)

**We have:** `TextField`, `EmailField`, `NumberField`, `SelectField`, `TextareaField`, `ToggleField`, `DateField`, `SlugField` (8 types). Plus `RichTextField` from `@pilotiq/tiptap`.

**Massive gap:** ~12 missing field types, plus reactivity.

**Field types (Plan #6):**

| Type | Tier | Notes |
|---|---|---|
| `Checkbox` (single) | 1 | Distinct from Toggle. |
| `Radio` | 1 | |
| `CheckboxList` | 1 | |
| ✅ `ToggleButtons` (segmented control) DONE | 2 | Shipped 2026-05-04 — `ToggleButtons.make().options([...])`, sugar over Radio with chip rendering; same data semantics as Radio (single-select string), no separate coercion. Multi-select stays out of scope; reach for `CheckboxList`. |
| `FileUpload` | 1 | Pairs with `@pilotiq/media`. Big-ish. |
| ✅ `MarkdownEditor` DONE | 2 | Shipped 2026-05-04 cont'd — `MarkdownField.make(name).toolbarButtons([…]) / .disableToolbarButtons([…]) / .minHeight(css) / .maxHeight(css) / .fileAttachmentsDirectory(d) / .fileAttachmentsVisibility('public'\|'private')`. Plain `<textarea>` + formatting toolbar (10 buttons by default) + tabbed live preview rendered client-side via `marked`. Stores raw markdown — same wire format as `TextareaField`, no new coerce branch. `attachFiles` reuses the existing `_uploads` route + `UploadAdapter`; the button is stripped server-side (via new `RenderContext.hasUploadAdapter` flag stamped by `uploadCtx`) when no adapter is registered. Plan doc: `docs/plans/markdown-editor.md`. |
| ✅ `CodeEditor` DONE | 2 | Shipped 2026-05-04 cont'd — separate adapter package `@pilotiq/codemirror` (mirrors `@pilotiq/tiptap`). `CodeEditorField.make(name).language(id).height(css).lineNumbers(b).lineWrapping(b).indentWithTabs(b).indentSize(n).theme('auto'\|'light'\|'dark').readOnly(b)`. Languages registered via `registerCodeLanguage(id, factory)` (string-id only; CM `Extension` values aren't JSON-serializable). v1 ships highlight + indent + line numbers + theme. Plan doc: `docs/plans/code-editor.md`. |
| `KeyValue` (dynamic key-value list) | 2 | |
| ✅ `TagsInput` DONE | 2 | Shipped 2026-05-04 — `TagsInput.make().suggestions([...]|fn) / .separator(',') / .splitKeys(['Enter']) / .reorderable() / .maxTags(n)`. `string[]` value, JSON-encoded in a single hidden input; new `tagsInput` coerce branch parses back. Backspace pops last chip; suggestion popover filters by typed prefix. |
| `ColorPicker` | 2 | |
| `Slider` | 2 | |
| `Hidden` | 1 | Trivial. |
| ✅ `Repeater` (array of sub-schemas) DONE | 3 | Shipped 2026-05-01 (Plan #14) + extensive Tier-1/2 polish + relationship-backed rows shipped 2026-05-03 (`Repeater.relationship(name)` — stores rows in a `HasMany` relation instead of JSON; create / update / delete diff against the child model; `orderColumn` writes 0-based index). See `repeater-field.md` + `repeater-relationship.md` + `docs/guide/repeater.md`. |
| ✅ `Builder` (heterogeneous array) DONE | 2 | Shipped 2026-05-02 — `Block.make(name).schema(…).maxItems(n)` + `Builder.make(name).blocks([…])`, `{type, data}` storage envelope, per-block `maxItems`, server-side resolve / coerce / validate / partial-resolve mirroring Repeater. Demo at `/new-admin/builder-demo`. See `builder-field.md` + `docs/guide/builder.md`. |
| `DateTimePicker` (vs current DateField) | 1 | Add time component to existing. |

**Reactivity (Plan #5):**

| Feature | Tier | Notes |
|---|---|---|
| `live()` (re-render schema on field change) | 1 | Foundation. |
| `live(onBlur: true)` / `live(debounce: 500)` | 1 | |
| `$get('otherField')` / `$set('otherField', val)` in callbacks | 1 | Server roundtrip vs JS expression. |
| `afterStateUpdated(fn)` | 1 | |
| `afterStateUpdatedJs(string)` | 2 | Client-side reactivity. |
| Dependent select options (`SelectField.options(fn)` with $get) | 1 | Most-asked feature. |
| Conditional `hidden(fn)` / `visible(fn)` re-evaluating live | 1 | We have static visibility; add reactive. |

**Field-level features (Plan #6 catch-all):**

| Feature | Tier | Notes |
|---|---|---|
| `prefix()` / `suffix()` (icon or text) | 1 | |
| `helperText()` / `belowLabel` / `aboveLabel` content slots | 1 | |
| `placeholder()` | already have on most | Verify all fields. |
| `inlineLabel()` (label-left layout) | 2 | |
| `dehydrated(false)` (don't submit) | 1 | |
| `dehydrateStateUsing(fn)` (transform on submit) | 1 | We have `mutateData` form-level; field-level finer-grained. |
| `formatStateUsing(fn)` (display transform) | 1 | |
| `unique()` validator with DB check | ✅ | `unique({ model, column?, ignoreRecord=true, where?, caseInsensitive?, message? })` — async validator awaited by `validateSchema`. Uses `M.query().where(col, value).paginate(1, 2)` (no new ORM contract). Ignores own record on edit. (2026-05-04 cont'd) |
| `validationAttribute()` (label override in errors) | 1 | Trivial. |
| `autofocus()` | 1 | Trivial. |

---

## Other major missing systems

These don't fit cleanly into the above buckets but show up across many reference admin frameworks.

### Notifications (toasts) — **Plan #3**
The `Notification::make()->success()->title(...)->send()` pattern is referenced everywhere in mature frameworks. We have nothing. Need:
- A `Toaster` provider + `useToast()` hook (Sonner or hand-built).
- Server → client: stash flash notifications in `viewProps.notifications`, consume on mount.
- Action handlers + form lifecycle return notifications via the dispatcher.

Tiny primitive but unblocks meaningful UX everywhere.

### Authorization — **Plan #10**
Currently no permission checks. Policy-style API:
```ts
static canView(record): boolean
static canViewAny(): boolean
static canCreate(): boolean
static canEdit(record): boolean
static canDelete(record): boolean
static canAccess(): boolean   // panel-level
```

Should integrate with `@rudderjs/auth` (when wired up). Plan #10 should include sidebar filtering, route guards, and per-action visibility (which `actions-tier-1.md` #4 already wires up via `authorize(fn)`).

### Relations — **Plan #11**
Already on Phase 3 hot list. Big enough for its own ~2-week effort. A RelationManager renders an embedded Table on Edit/View pages with attach/detach/associate/dissociate actions. Needs:
- `Resource.relations()` returning RelationManager classes (we have placeholder).
- `RelationManager` base class with its own `form()` / `table()`.
- Pivot field support for `BelongsToMany`.
- `RelationGroup` for tabbing multiple managers.
- ORM contract additions (`@rudderjs/orm` relations are basic; we'd need attach/detach helpers).

### Global search — **Plan #12**
Cmd-K palette searching across all resources. Needs:
- `Resource.recordTitleAttribute` (Plan #9).
- `Resource.getGlobalSearchEloquentQuery` override.
- `Resource.getGlobalSearchResultDetails` for subtitle.
- `Resource.getGlobalSearchResultUrl` for navigation.
- Client-side debounced fetch + result rendering in a Dialog.
- Optional: opt-in registration so quiet resources don't clutter results.

### Soft-deletes — **Plan #13**
Needs `@rudderjs/orm` soft-delete support FIRST. Then:
- `TrashedFilter` (showing trashed/with-trashed/only).
- `ForceDeleteAction` / `RestoreAction` (auto-injected when resource opts in).
- Bulk variants.
- Authorization (`canForceDelete`, `canRestore`).

### Widgets / Dashboards — **Plan #15** ✅ DONE
Dashboard widgets shipped as schema Elements (no parallel `Widget` hierarchy). `StatsOverview` / `Chart` / `TableWidget` / `View` extend `Element` directly; `Stat` is the fluent value object emitted by `StatsOverview.getStats()`. `panel.dashboard(MyPage)` marks a Page as the panel root. Lazy by default (skeleton + `_widget/:id` POST on mount); per-element `.poll(seconds)` for auto-refresh; per-Chart filter dropdown for time-window switches. Resource-level `headerSchema()` / `footerSchema()` slot widgets above/below list tables. Adapter package `@pilotiq/recharts` (peer-installed, opt-in `registerChartRenderer()`) keeps recharts out of the core bundle. Resolved 2026-05-03.

### Wizard — **Plan #8** (folded into schema-layouts)
Multi-step form. `Wizard::make([Step::make('a'), Step::make('b')])`. Each step has its own schema; navigation enforces validation per step before advancing. Pairs naturally with reactive fields (Plan #5).

---

## What we explicitly aren't matching

These features from PHP-stack admin frameworks don't translate well to JS / Vike / our model. Skip:

- **Server-roundtrip-on-every-keystroke reactivity** — we use form serialization + reactive fields with `live()` but won't replicate the deep wire-style server-roundtrip model.
- **Server-template escape hatch** (`$view = 'custom-view'`) — our equivalent is "drop down to React" by overriding the page renderer, which is more powerful and idiomatic.
- **Container queries** in schema layouts — possible but low ROI.
- **Polling for auto-refresh** — can wire later via vike's `+data` reload; not urgent.
- **Configure-using globals** (`Table::configureUsing`) — easy to add later, not foundational.

---

## How this fits the existing roadmap

This audit refines but doesn't replace the Phase 3 status:

- `project_phase_3_progress.md` "next session pick" list:
  - **Block save/load verification** — still valid, ~30min cleanup.
  - **Tabs primitive** — DONE.
  - **Relations** — Plan #11 (audit confirms this is correct prioritization).
  - **Scaffolder CLI** — separate. Audit doesn't change this.
  - **Pro packages (collab/AI)** — separate. Audit doesn't change this.

- The audit's tier-1 items (#1 actions ✅, #2 column types ✅, #3 notifications ✅, #4 page lifecycle ✅, #5 reactive fields ✅, #6 field types ✅, #7 list-page tabs ✅, #8 schema-layouts ✅, #8.5 icon-system ✅, #9 nav metadata ✅, #10 authorization ✅, #12 global search ✅) all shipped in Phase 3. The remaining mainline items are #11 relations (~2 weeks, big enough to need its own planning cycle) and #13 soft-deletes (blocked on @rudderjs/orm support).

- `actions-tier-1.md` stays as planned and ships alongside #2 onwards.

---

## Process going forward

1. Land `actions-tier-1.md` first (already planned).
2. Pick the next plan doc from the sequence above and write it focused (~1 page each) before implementation.
3. Update memory `project_phase_3_progress.md` after each plan ships, marking that plan's items DONE.
4. Re-evaluate this audit at the end of every 5 plans — the gap will look different after #1-5.
