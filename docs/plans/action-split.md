# Action.ts split

`packages/pilotiq/src/actions/Action.ts` is **2,159 lines** — the
`Action` primitive class plus a long list of resource-aware static
factories (`Action.create`, `Action.bulkDelete`,
`Action.relationAttach`, etc).

This plan splits the file along its existing seams into sibling factory
modules. **No behavior change.** Same `Action` class, same static
factory call sites (`Action.create(R, base)`), same wire shape — every
factory stays exposed as a static delegator on the class. Goal is
"easier to read, edit, review" — not new architecture.

Established workflow: matches the SchemaRenderer split (PRs #29–#33,
6,798 → 549), the pageData split (PRs #34–#39, 4,948 → 481), and the
routes.ts split (3,397 → 279, single-commit phased). See
`~/.claude/projects/-Users-sleman-Projects-pilotiq/memory/feedback_mega_file_split_pattern.md`
for the durable how-to.

The `import / export / bulkExport` factories already delegate their
implementation guts to `importFactory.ts` / `exportFactory.ts`. They're
short enough on the Action.ts side (~30 lines each) to leave in place —
the existing helper-only pattern is its own seam.

---

## What lives in the file today

Source-order map:

| Lines | Section | Notes |
|---|---|---|
| 1–286 | Imports + types | `ActionContext / NotificationLike / DownloadEnvelope / ActionResult / ActionHandler / ActionConfirm / ActionMethod / ActionColor / ActionSize / ActionVisibilityContext / VisibilityRule / ActionModalWidth / ActionModalAlignment / ActionModalIconColor / ReplicateNotificationContext / ReplicateRedirectContext / ReplicateOptions / ResourceLike` |
| 287–488 | Module helpers | `resourceBase / labelForCount / isM2MMode / relationUrlPrefix / computeRelationPin / persistRelationReplica / runRelationReplicateRow / isTrashed / loadTableClass / callPredicate` |
| 489–602 | More types | `ActionModalMeta / ActionMeta` |
| 604–700 | Class header | Fields + constructor + `static make()` |
| 702–902 | CRUD factories | `create / edit / view / delete / replicate / restore / forceDelete` (single-row, resource-scope) |
| 917–938 | Notification factory | `markAsRead` |
| 940–1089 | Bulk factories | `bulkDelete / bulkRestore / bulkForceDelete / bulkReplicate` |
| 1091–1243 | Import/export factories | `export / bulkExport / import` — already delegate guts to sibling files; **stays in Action.ts** |
| 1245–1398 | Relation CRUD factories | `relationCreate / relationEdit / relationDelete / relationRestore / relationForceDelete` (hasMany + morphMany) |
| 1400–1519 | Relation replicate factories | `relationReplicate / relationBulkReplicate` |
| 1521–1678 | M2M factories | `relationAttach / relationDetach / relationBulkDetach` (belongsToMany + morphToMany + morphedByMany) |
| 1680–2155 | Instance methods | Placement / behavior / chrome / visibility / modal / link / form / getters / `toMeta()` |
| 2157–2159 | Re-export | `ValidationErrors` type |

---

## Public surface — must stay stable

`packages/pilotiq/src/actions/Action.ts` is the import path consumers
use. Two stability constraints:

1. **Static factory call sites** — every `Action.create(R, base)` /
   `Action.relationAttach(M, ctx)` etc must keep working unchanged.
   Factories stay as `static` methods on the class; their bodies move
   to sibling modules and the class methods become thin delegators
   (`static create(R, b) { return createAction(R, b) }`).
2. **Type re-exports** — `ActionContext`, `ActionResult`,
   `ActionHandler`, `ActionVisibilityContext`, `ResourceLike`,
   `ReplicateOptions`, etc are imported by routes / page builders /
   `RelationManager.ts`. Stay exported from `Action.ts` (re-export from
   wherever they end up if moved).

---

## Phase breakdown — 4 phases, direct commits to main

Convention from prior splits: lowest-risk extractions first. Each phase
preserves the public surface, runs the full test suite green, commits
on main without a PR. After every phase: `pnpm -F @pilotiq/pilotiq
typecheck && pnpm -F @pilotiq/pilotiq test` plus playground smoke.

### Phase 1 — CRUD single-row factories

**Extract → `actions/crudFactories.ts`:**
- `create / edit / view / delete / replicate / restore / forceDelete`
- `markAsRead` (notification factory; same shape)

**Shared helpers → `actions/factoryHelpers.ts`** (new file consumed by
every later phase):
- `resourceBase / callPredicate / isTrashed`
- `ResourceLike` type stays exported from `Action.ts` but `factoryHelpers.ts`
  imports it via `./Action.js`

**Action.ts shrinks by ~200 lines.**

### Phase 2 — Bulk factories

**Extract → `actions/bulkFactories.ts`:**
- `bulkDelete / bulkRestore / bulkForceDelete / bulkReplicate`
- `labelForCount` private helper (only this phase uses it).

**Action.ts shrinks by another ~150 lines.**

### Phase 3 — Relation hasMany/morph factories

**Extract → `actions/relationFactories.ts`:**
- `relationCreate / relationEdit / relationDelete / relationRestore / relationForceDelete`
- `relationReplicate / relationBulkReplicate`
- Move replicate helpers: `computeRelationPin /
  persistRelationReplica / runRelationReplicateRow`
- Move `relationUrlPrefix / isM2MMode` into `factoryHelpers.ts`
  (also consumed by Phase 4).

**Action.ts shrinks by ~280 lines.**

### Phase 4 — M2M factories

**Extract → `actions/m2mFactories.ts`:**
- `relationAttach / relationDetach / relationBulkDetach`
- Reuses `isM2MMode / relationUrlPrefix` from `factoryHelpers.ts` (already
  there from Phase 3).

**Action.ts shrinks by ~150 lines.**

### Target shape after all 4 phases

| File | Lines | Scope |
|---|---|---|
| `Action.ts` | ~1,250 | Types + `Action` class (instance methods, modal chrome, visibility eval, `toMeta`) + thin static factory delegators + `import / export / bulkExport` factories (already delegate-style) |
| `factoryHelpers.ts` | ~120 | `resourceBase / callPredicate / isTrashed / isM2MMode / relationUrlPrefix` |
| `crudFactories.ts` | ~210 | Single-row resource factories |
| `bulkFactories.ts` | ~150 | Bulk-placement factories |
| `relationFactories.ts` | ~300 | Relation hasMany+morph factories + replicate helpers |
| `m2mFactories.ts` | ~150 | Pivot factories |

Action.ts ends ~58% lighter (2,159 → ~1,250). Factories total another
~810 lines across four focused files. The bulk of the remaining
Action.ts is the class itself (constructor + ~50 instance setters +
`toMeta()`); that's coherent enough to stay monolithic.

---

## Convention recap

- **Static factory delegators** — `static create(R, b) { return createAction(R, b) }`. Preserves public surface.
- **Factory modules import `Action` from `./Action.js`.** Runtime cycle is fine — factories only use `Action.make()` *inside function bodies* (call-time, not module-eval-time). Same shape that already works for `importFactory.ts` ↔ `Action.ts`.
- **Shared helpers in `factoryHelpers.ts`.** Anything used by 2+ phases lives there. Phase-local helpers stay in their phase's file.
- **`ResourceLike` and `RelationManagerContext` flow through type-only imports** in the factory modules — no cycle weight.
- **No new tests written.** Existing `Action.test.ts` (~2,500 lines, 41+ factory call sites) is the regression net — green before each commit.

---

## Sibling files unchanged

- `attachFactory.ts` (172 lines) — helpers for `relationAttach`'s modal-form schema. Consumed by Phase 4's `m2mFactories.ts`.
- `exportFactory.ts` (215 lines) — `export / bulkExport` internals (still consumed via dynamic import from Action.ts).
- `importFactory.ts` (222 lines) — `import` internals (still consumed via static + dynamic import from Action.ts).
- `ActionGroup.ts` (173 lines) — unrelated; `ActionGroup` primitive.
