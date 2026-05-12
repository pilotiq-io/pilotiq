# routes.ts split

`packages/pilotiq/src/routes.ts` is **3,397 lines** — one file that
registers every HTTP route the admin panel exposes (dashboard, resources,
relation managers, globals, custom pages, theme editor, panel-level
sibling endpoints).

This plan splits the file along its existing seams into a directory of
smaller modules. **No behavior change.** Same `registerPilotiqRoutes`
entry point, same routes registered in the same order, same handler
shapes. Goal is "easier to read, edit, review" — not new architecture.

Established workflow: matches the SchemaRenderer split (PRs #29–#33, 6,798
→ 549) and the pageData split (PRs #34–#39, 4,948 → 481). See
`~/.claude/projects/-Users-sleman-Projects-pilotiq/memory/feedback_mega_file_split_pattern.md`
for the durable how-to.

---

## What lives in the file today

Source-order map:

| Lines | Section | Notes |
|---|---|---|
| 1–61 | Imports | 22 named imports across Pilotiq surface |
| 63–77 | `PanelGlobalDelegate` type | Theme editor only |
| 83–611 | Helpers + handler fns | `wantsJson`, `readFormBody`, `normalizeRedirect`, `splitMeta`, `sanitizeFilename`, `sendDownload`, `forbidden`, `cellHookErrorMessage`, `checkPolicy`, `policyAccess`, `resolveDispatchTarget`, `handleFormState`, `handleFormWizard`, `handleFormCreateOption`, `handleFormMentions`, `handleWidgetData`, `handleUploadRequest` |
| 613–815 | `registerPilotiqRoutes` open | Boot-time cluster + relation + sub-page validation, `reorderEnabled` / `editableEnabled` probe |
| 816–974 | Panel routes | Dashboard, `_uploads`, `_widget`, `_search`, `_notifications` ×5 |
| 977–3022 | Resource routes loop | List / `_widget` / `_table` / `_action` / `_reorder` / `_cell`, create+post create state pairs, create POST + create action, view, delete, restore, force-delete, edit + edit state pairs, edit POST, edit action, **depth-1 relation managers** (list / create / edit / delete / restore / force-delete / `_action` / `_detach`), **depth-2 nested relations** (same shape, prefixed with `nestedBase`), record sub-pages |
| 3024–3147 | Globals loop | Edit form state pairs + edit GET / POST + view |
| 3149–3309 | Custom pages loop | `_widget`, form-state pairs, GET, `_action`, POST |
| 3311–3379 | Theme editor | `${base}/theme` GET + `${base}/api/_theme` GET / PUT / DELETE |
| 3381–3391 | Plugin route hook | Iterates `pilotiq.getPlugins()` |
| 3394–3397 | Re-exports | `dispatchFormSubmit`, table helpers, `Form` type |

The resource loop dominates — roughly 2,050 lines of nested code inside
one `for (const R of cfg.resources)` block. Of those, the relation
manager subtree (depth-1 + depth-2, lines ~1789–3000) is itself
~1,200 lines.

---

## Public surface — must stay stable

`packages/pilotiq/src/routes.ts` is the import path consumers use:

- `registerPilotiqRoutes(router, pilotiq)` — service-provider entry point
- `dispatchFormSubmit`, `findForms`, `selectForm` re-exports
- `loadTableRecords`, `parseTableQuery`, `findTables` re-exports
- `Form` type re-export

Tests reach into the same path (`./routes.js`). Every phase keeps these
exports working.

---

## Phase plan

**Risk-ordered: lowest risk first; the resource loop lands last.**

### Phase 1 — `routes/helpers.ts` (lowest risk)

Move all top-of-file pure functions:

- Module-scoped helpers: `wantsJson`, `readFormBody`, `normalizeRedirect`, `splitMeta`, `sanitizeFilename`, `sendDownload`, `forbidden`, `cellHookErrorMessage`, `checkPolicy`, `policyAccess`, `resolveDispatchTarget`.
- Handler helpers (pure — take `pilotiq` as a parameter): `handleFormState`, `handleFormWizard`, `handleFormCreateOption`, `handleFormMentions`, `handleWidgetData`, `handleUploadRequest`.
- Local interfaces (`FormStateBody` / `FormWizardBody` / `FormCreateOptionBody` / `FormMentionsBody` / `WidgetBody`) that ride alongside.
- Re-import all of them back into `routes.ts` so consumer-side imports don't change.

`PanelGlobalDelegate` / `PanelGlobalRow` types stay in `routes.ts` for now — they're only touched by the theme editor block (Phase 3). They'll move with theme.

Target: ~530 lines extracted. No call-site changes — every helper is invoked by `pilotiq`-threading, not by closure.

### Phase 2 — `routes/panel.ts`

Extract the panel-level routes (the section between boot validation and the resource loop):

- `GET ${base}` (dashboard)
- `POST ${base}/_uploads`
- `POST ${base}/_widget/:id`
- `GET ${base}/_search`
- `${base}/_notifications` ×5 (when `cfg.databaseNotifications.enabled`)

New entry point: `registerPanelRoutes(router, pilotiq, base)`. Reads `cfg = pilotiq.getConfig()` internally.

Target: ~160 lines extracted.

### Phase 3 — `routes/theme.ts` + `routes/pages.ts` + `routes/globals.ts`

Three small, isolated modules together (they're each <200 lines):

- `routes/theme.ts` — theme editor block + `PanelGlobalDelegate` / `PanelGlobalRow` types. `registerThemeRoutes(router, pilotiq, base)`.
- `routes/pages.ts` — custom-pages loop. `registerCustomPageRoutes(router, pilotiq, PageClass, base)` (called once per `cfg.pages` entry; the dashboard-page skip stays in the barrel).
- `routes/globals.ts` — globals loop. `registerGlobalRoutes(router, pilotiq, G, base)` (called once per `cfg.globals` entry).

Target: ~400 lines extracted.

### Phase 4 — `routes/relations.ts`

Extract the relation manager subtree (depth-1 + depth-2) from inside the resource loop:

- Depth-1 routes (8 routes per manager: list, create×2, view, edit×2, delete, restore, force-delete, `_action`, `_detach`)
- Depth-2 nested routes (same shape, prefixed with `nestedBase`)

New entry point: `registerRelationRoutes(router, pilotiq, R, M, base)` called from inside the resource loop. Nested registration nests inside.

This is the most closure-heavy module — every handler references `R`, `M`, `slug`, `parentBase`, `model`, etc. Solution: thread a small `ResourceCtx` bag (or just pass each as positional arg).

Target: ~1,200 lines extracted.

### Phase 5 — `routes/resources.ts`

Extract the rest of the resource loop body (depth-0 routes + record sub-pages + edit-state form routes):

- List GET + `_widget` + `_table`
- Resource `_action` dispatch
- `_reorder` (when enabled)
- `_cell` per-row editable column (when enabled)
- Form-state pairs (`/_form/:formId/state` / `wizard` / `mentions` / `create-option`) for both create + edit + post-record-page
- Create GET + POST, create action
- View GET, delete POST, restore POST, force-delete POST
- Edit GET + POST + edit-action POST
- Record sub-pages (`${resourceBase}/:id/${subSlug}`)

New entry point: `registerResourceRoutes(router, pilotiq, R, base, reorderEnabled, editableEnabled)`. Calls `registerRelationRoutes` per relation manager (Phase 4) — composition stays in this module.

Target: ~850 lines extracted (after Phase 4 already pulled out ~1,200 of relations).

### Phase 6 — Barrel polish

After all five extractions land, `routes.ts` should be the entry point shell:

- Imports + re-exports
- `registerPilotiqRoutes(router, pilotiq)` body: boot validation loops + orchestration (`registerPanelRoutes(...)`, the resource loop calling `registerResourceRoutes(...)` per R, globals loop calling `registerGlobalRoutes(...)`, pages loop calling `registerCustomPageRoutes(...)`, `registerThemeRoutes(...)` when `cfg.themeEditor`, plugin hook)
- Tail re-exports

Final cleanup:
- Sweep stale imports from `routes.ts` (the leaf modules are now responsible for their own imports)
- Verify public re-exports still resolve through `./routes.js`
- Confirm `routes.test.ts`, `routes-relations.test.ts`, `routes-nested-relations.test.ts` all run green

Target: ~250–350 lines in the final `routes.ts`.

---

## Verification cadence per phase

After every PR, before opening the next:

```bash
pnpm -F @pilotiq/pilotiq typecheck
pnpm -F @pilotiq/pilotiq test
```

Plus playground smoke: `pnpm dev` in `playground/`, click through `/new-admin`, posts list / create / view / edit / delete, a relation manager, custom page, theme editor.

The high-risk phase (Phase 5 resources) lands clean if every prior phase did — same as SchemaRenderer + pageData.

---

## Convention reminders

(From the durable how-to in [[feedback_mega_file_split_pattern]].)

- **`sed -n 'A,Bp'` to copy verbatim**, then `sed 'A,Bd'` to delete from source. Delete in reverse line order across multiple ranges.
- **`sed -i 's/^function /export function /'`** flips top-level functions — left-anchor `^function` skips nested helpers.
- **Re-import everything moved** back into the source file with a thin import + re-export block so external callers (tests, the package barrel) keep working through `./routes.js`.
- **Dependency injection** for the resource / relation / globals / pages modules: take `pilotiq` + `R` / `M` / `G` / `PageClass` + `base` as function args; don't close over `cfg` (just re-read `pilotiq.getConfig()` inside).
- **Avoid sibling cycles**: if Phase 4 (`relations`) and Phase 5 (`resources`) need the same helper, pull it into `routes/helpers.ts` (Phase 1) — both import from there.
- **Stop at structural matches**: walkers + `findForms` etc. already use `getType()` discriminators, but be careful not to introduce `instanceof` checks that span the split.
