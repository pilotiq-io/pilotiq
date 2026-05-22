# Code-quality sweep — pilotiq

**Status:** OPEN 2026-05-21
**Scope:** `@pilotiq/pilotiq` (104K LOC) + adapter packages (`tiptap`, `codemirror`, `recharts`)
**Source:** Senior-engineer review pass, 2026-05-21
**Severity mix:** 1 security + 1 React crash + perf + a11y / DX polish

This plan tracks fixes uncovered by a focused code-quality review across the open-source admin panel and its three editor/widget adapters. Phase 1 is the only security-relevant item; Phase 2 contains a known React crash; Phases 3–5 are non-blocking improvements that can ship independently.

---

## Phase 1 — Enforce `Pilotiq.guard()` via `router.group()` 🔒 ✅ SHIPPED 2026-05-21 (commit 67aadbd)

**Severity:** high — possible unauthenticated panel exposure
**Effort:** ~1h + regression test
**Outcome:** `registerPilotiqRoutes` wraps every core route in `router.group({ middleware: [guardMiddleware] })`; redundant inline guard removed from `_uploads`; regression test at `routes/guard.test.ts` (325 lines, 19 cases) asserts every documented route 401s when `guard(() => false)` is set.

### The bug

`Pilotiq.guard()` is documented as the 401 layer (CLAUDE.md, `routes/helpers.ts:220`), but the guard callback is only consulted on a single route — the file upload handler at `packages/pilotiq/src/routes/helpers.ts:595`. Every other route — list, view, create, edit, delete, `_action`, `_widget`, `_form`, `_table`, `_search`, relation managers, custom pages, theme editor — relies on the user resolver returning `null` and the resource's `R.canX(user, …)` predicates defaulting to `true`.

An app that wires `Pilotiq.guard(req => Auth.check())` but ships any `Resource` without overriding `canAccess` ends up with an **unauthenticated, fully-readable** admin panel. The intent is documented; the wiring isn't there.

### Root cause

`packages/pilotiq/src/routes/{resources,relations,globals,pages,panel,theme}.ts` register every handler as a flat `router.get(...)` / `router.post(...)` call. There's no enclosing structure to attach a panel-level guard to.

### Fix — use the existing framework primitive

`@rudderjs/router` already exposes `router.group({ prefix, middleware }, fn)` (Laravel-parity `Route::group([...])`) — `packages/router/src/index.ts:569`. Composes prefix + middleware, nests cleanly, applies middleware to every route registered inside the callback. This is the right primitive; we just aren't using it.

Refactor `registerPilotiqRoutes` to wrap all panel routes in one group:

```ts
const guardMiddleware: MiddlewareHandler = async (req, _res, next) => {
  if (cfg.guard && !(await cfg.guard(req))) {
    return new Response('Unauthorized', { status: 401 })
  }
  return next()
}

router.group({ prefix: panel.basePath, middleware: [guardMiddleware] }, () => {
  registerPanelRoutes(router, cfg)
  registerResourceRoutes(router, cfg)
  registerRelationRoutes(router, cfg)
  registerGlobalRoutes(router, cfg)
  registerPageRoutes(router, cfg)
  registerThemeRoutes(router, cfg)
})
```

Side benefit: every registered URL inside the callback can drop the `panel.basePath` prefix from its path literal (group prefix concatenates automatically), which removes a lot of `${base}/...` template strings from the route registration sites. Optional cleanup — can stay as-is to keep this PR focused.

Note: `_uploads` already has an inline guard call (`routes/helpers.ts:595`) — once the group middleware fires, that inline call becomes redundant. Remove it to avoid double-firing.

No new framework surface needed; no new `requireGuard()` helper. The fix is "use the framework correctly."

### Regression test

Add `routes/guard.test.ts` that:
1. Builds a panel with `Pilotiq.guard(() => false)` and a resource whose `canViewAny` is the default (`true`)
2. Iterates every documented route path (list, view, edit, etc.) and asserts each returns 401
3. Builds the same panel with `Pilotiq.guard(() => true)` and asserts each route reaches its handler (200 / 422 / 302, anything that isn't 401)

This is the file we want a future regression to fail loudly — keep it boring and exhaustive.

---

## Phase 2 — React hook-order crash in `PieChartView` ✅ SHIPPED 2026-05-21 (commit b232826)

**Severity:** medium — known crash, triggers when filter yields empty datasets
**Effort:** 5 min + test
**Outcome:** `useMemo` moved above the early return in `ChartRenderer.tsx:198-201`; `recharts` peer widened to `^2 || ^3`.

`packages/recharts/src/react/ChartRenderer.tsx:197-202`:

```tsx
const ds = data.datasets[0]
if (!ds) return <ChartEmpty />
const slices = useMemo(() => buildSlices(ds), [ds])
```

Conditional return before `useMemo` violates Rules-of-Hooks. When a chart's dataset becomes empty across renders (e.g. filter switches to a no-data range), React throws "Rendered fewer hooks than expected". Move the `useMemo` above the early return and branch on the result.

Also bump `recharts` peer to `^2 || ^3` (currently pinned `^2`, blocks consumers on v3.x which shipped Sep 2024).

---

## Phase 3 — Use framework `.first()` API for one-record lookups ✅ SHIPPED (commit 15661ec)

**Severity:** low — works today, just verbose and slower than necessary
**Effort:** ~15 min
**Outcome:** All three call sites now prefer `q.first()` with `paginate(1, 1)` as a defensive fallback for ORM adapters that don't yet implement `first()`. Comment at `orm/modelDefaults.ts` updated to reflect the new default strategy.

`@rudderjs/orm` ships `Model.where(...).first()` / `firstOrFail()` / `firstOrCreate()` — Laravel-parity API at `packages/orm/src/index.ts:1079`. Pilotiq hand-rolls the same lookup as `paginate(1, 1)` in three spots:

| File:line | Current | Should be |
|---|---|---|
| `pageData/relationPages.ts:196` | `const result = await q.where(childPk, '=', childId).paginate(1, 1)` then `result.data[0]` | `await q.where(childPk, '=', childId).first()` |
| `orm/modelDefaults.ts:211` | `const result = await q.paginate(1, 1)` (default record loader) | `await q.first()` |
| `orm/modelDefaults.ts:237` | `await R.query(ctx).where(pk, '=', id).paginate(1, 1)` | `await R.query(ctx).where(pk, '=', id).first()` |

Skip purely-illustrative comments / JSDoc references to "paginate(1, 1)" — only swap real callsites.

`paginate(1, 1)` builds + executes a COUNT query plus the data query; `.first()` does a single `LIMIT 1` SELECT. Functionally identical for these callers, ~half the work on the DB.

Update the comment in `orm/modelDefaults.ts:195` from "Default strategy: paginate(1, 1) — i.e. 'the first row'" to "Default strategy: `.first()` — i.e. the first matching row".

No new framework surface. No regression test needed beyond existing coverage (these paths are well-tested in `relationManagerData.test.ts` and `modelDefaults.test.ts`).

---

## Phase 4 — Replace prisma-coupled theme persistence with a storage adapter ✅ SHIPPED 2026-05-22

**Severity:** low — works today, but breaks ORM-agnostic story and swallows real startup errors
**Effort:** ~2h

`packages/pilotiq/src/PilotiqServiceProvider.ts:33-41`:

```ts
const prisma = this.app.make('prisma') as any
try {
  const row = await prisma.panelGlobal.findUnique({ where: { key: 'theme' } })
  // ...
} catch { /* no DB or no table */ }
```

This (a) hard-couples theme persistence to Prisma — `@rudderjs/orm` works fine on Drizzle and the panel claims ORM-agnostic, (b) is the only `as any` in non-test code that hides a real coupling rather than cosmetic looseness, (c) the bare catch silently hides legitimate errors like a misconfigured Prisma client or a `panelGlobal` schema rename.

### Fix

Define a `ThemeStorageAdapter` interface in `pilotiq.ts`:

```ts
interface ThemeStorageAdapter {
  load(): Promise<ThemeJson | null>
  save(theme: ThemeJson): Promise<void>
  clear(): Promise<void>
}
```

Move the Prisma shape into a `prismaThemeStorage(prisma)` factory that returns this adapter. Default `Pilotiq.themeEditor({ storage: prismaThemeStorage(app.make('prisma')) })`; explicit opt-in keeps the Prisma reference out of the auto-discovered provider. Narrow the load-time catch to "no row found" only — re-throw on connection / schema errors.

Migration path for existing apps: log a one-time deprecation if `prisma` resolves on boot but no `storage` is configured, defaulting to `prismaThemeStorage` for one minor version, then required.

---

## Phase 5 — Hot-path perf wins (4 items, can ship as one PR or split) ✅ SHIPPED 2026-05-22

**Severity:** low — none of these are bottlenecks today; measurable above ~50 resources or ~10K rows
**Effort:** ~3h total

### 5a. Chunk `importFactory.runImport`

`packages/pilotiq/src/actions/importFactory.ts:127-161` runs `await M.create(row)` (or upsert: a `paginate(1, 1)` lookup + conditional `await M.update`) in a serial `for…of`. Default `maxRows = 10_000`, ~5–10ms per round-trip → 50–100s of pinned request time, upsert mode doubles it.

Fix: chunk into batches (default `concurrency = 10`) with `Promise.all` per chunk:

```ts
const concurrency = opts.concurrency ?? 10
for (let i = 0; i < rows.length; i += concurrency) {
  const chunk = rows.slice(i, i + concurrency)
  await Promise.all(chunk.map(processRow))
}
```

Stretch: when `@rudderjs/queue` is registered, expose `Action.queue?(jobName)` so big imports go off-thread entirely. Don't over-engineer — chunking alone covers the realistic case.

### 5b. Cache navigation badges

`packages/pilotiq/src/pageData/navigation.ts:762` — every page render re-resolves every `R.navigationBadge()` / `G.navigationBadge()` / `C.navigationBadge()`. A panel with 20 resources each calling `Model.count()` for the badge is 20+ extra queries per nav. Parallelizing only fixes latency, not total work.

Fix: per-user TTL cache keyed by `(userIdentity, resourceClass.name)`, default 30s, exposed via `Pilotiq.navigationBadgeTtl(ms)`. Stretch: pass stale badges through SSR and refresh client-side on window focus.

### 5c. Map-based resource lookup

`packages/pilotiq/src/pageData/{resourcePages,relationPages,misc,forms}.ts` — at least 14 call sites do `cfg.resources.find(r => r.getSlug() === slug)`, plus relation managers do nested walks for chain resolution. O(n) per request, negligible at 10 resources, measurable around 100+.

Fix: precompute three `Map<slug, ResourceClass | GlobalClass | PageClass>` on the `Pilotiq` instance alongside the cluster-validation pass in `routes.ts`. Expose `pilotiq.findResource(slug)` / `pilotiq.findGlobal(slug)` / `pilotiq.findPage(slug)`. Same for managers-by-relationship-key.

### 5d. Parallelize `policyAccess` + `canViewAny` pairs

~32 routes await `policyAccess(R, user)` then `checkPolicy(() => R.canViewAny(user))` serially. `policyAccess` already overlaps cluster + canAccess internally; just compose the `canViewAny` / `canEdit` alongside in a `Promise.all`. Halves auth latency on slow predicates.

---

## Phase 6 — Adapter polish (tiptap / codemirror / recharts)

**Severity:** low (mostly) — one runtime-disabled-toggle bug, otherwise tidying
**Effort:** ~3h spread across packages
**Status:** 6a/b/c/e shipped; 6d remains (framework-blocked on `@rudderjs/sync/react` hooks landing).

### 6a. `TiptapEditor` doesn't mirror `disabled` at runtime ✅ SHIPPED

`packages/tiptap/src/react/TiptapEditor.tsx:260` — `editable: !disabled` is set at construction only. Siblings `MarkdownEditor.tsx:257-259` and `CollabTextRenderer.tsx:127-130` both call `editor.setEditable(...)` in an effect; this one doesn't. Toggling `disabled` at runtime (e.g. parent flips read-only on validation) silently no-ops.

Fix: add `useEffect(() => { editor?.setEditable(!disabled) }, [editor, disabled])`.

### 6b. `MarkdownEditor.uploadAndInsert` swallows server errors ✅ SHIPPED

`packages/tiptap/src/react/MarkdownEditor.tsx:386` — `if (!res.ok || !data.ok || !data.url) return` after `setUploading(false)`. User sees the spinner stop, no toast, no console. Same shape as `Toolbar.tsx:389` `onUpload`. Surface via the notification primitives shipped in `@pilotiq/pilotiq`.

### 6c. CodeMirror `useMemo` deps + cast cleanup ✅ SHIPPED 2026-05-22 (useThemeIsDark dedupe commit 79ded10; useMemo deps + yCollab key shipped earlier)

- `CodeMirrorEditor.tsx:131` — `useMemo(..., [])` reads `defaultValue` once. If parent ever changes it between renders (form reset, record swap without remount), editor sticks with the original. Mirror `CollabBranch`'s posture (include `defaultValue` in deps) or document a `key` requirement on parents.
- `CollabCodeMirrorEditor.tsx:125` — `yCollab(yText, awareness, { undoManager: false } as never)` bypasses real `y-codemirror.next` typing. Verify the option key — it's `yUndoManager` in current upstream typings. If wrong, undo via `historyKeymap` works coincidentally because Yjs adds its own history.
- Fold local `useThemeIsDark` in `CodeMirrorEditor.tsx:183-213` into the shared `useSyncExternalStore` helper in `CollabCodeMirrorEditor.tsx:259-303` to avoid per-Repeater-row listener fan-out.

### 6d. Consume framework collab hooks (depends on framework plan) ✅ MOSTLY SHIPPED 2026-05-22 (commit 223eb38)

**Outcome:** Tiptap's three editor adapters (`TiptapEditor`, `MarkdownEditor`, `CollabTextRenderer`) now import `useCollabSeed` from `@rudderjs/sync/react` directly. `YDocShape` shim deleted. Framework hook returns the `(doc, fragment)` pair pre-resolved so callers drop their `(doc as YDocShape).getXmlFragment(name)` boilerplate. `@rudderjs/sync` added as optional peer on `@pilotiq/tiptap`.

**Not migrated:** CodeMirror — framework's `useCollabSeed` is `Y.XmlFragment`-only (calls `doc.getXmlFragment(fragmentKey)` internally); CodeMirror's seed uses `Y.Text`. Framework would need a `useCollabSeedText` variant. Tracked separately.

**Not migrated:** pilotiq core's `useCollabSeed.ts` shim — kept as deprecation surface for external consumers; framework's hook lives next to it under its own import path. Drop in next major (the local shim's behavior is a strict subset of the framework hook's).

`TiptapEditor` / `MarkdownEditor` / `CollabTextRenderer` / `CollabCodeMirrorEditor` all duplicate `room.ydoc as any` + `room.provider as any` + `onProviderSynced(provider, trySeed)` + the empty-fragment seed dance with the same race-window comment.

This boilerplate is **also** duplicated in `pilotiq-pro/packages/collab/src/useRecordCollabRoom.ts`. The right home is `@rudderjs/sync/react` — see `~/Projects/rudder/docs/plans/2026-05-21-sync-react-hooks.md` for the framework-side proposal (`useCollabRoom()` + `useCollabSeed()`).

Once the framework hooks ship:
- Replace the four pilotiq adapters' inline lifecycle code with `useCollabSeed(editor, room, fragmentKey, seedFn)`
- Delete the `as any` casts (typed by the new sync surface)
- Eliminates ~80 lines + 8 `as any` from pilotiq alone, plus the same shape in pilotiq-pro

If the framework plan stalls, the local-extraction fallback is to add a `useCollabSeed` helper in `@pilotiq/pilotiq/react` — same shape, smaller blast radius. Prefer the framework path; this is a textbook framework concern.

### 6e. React-mount test coverage ✅ SHIPPED (commit 56cf795)

Zero React tests across all three adapter packages — every `.test.ts` is pure Node against helpers, schemas, registries, Tiptap extensions sans React. The biggest behavioral risk (lifecycle, hydration, listener cleanup) ships uncovered. `MarkdownEditor.tsx` (588 LOC) and `TiptapEditor.tsx` (757 LOC) are entirely untested.

Minimum viable: jsdom + `@testing-library/react` covering:
- `TiptapEditor` mount/unmount + `disabled` flip + collab provider swap
- `MarkdownEditor` upload error surface
- `CodeMirrorEditor` `disabled` flip + dark-mode toggle
- `PieChartView` empty-datasets path (catches Phase 2)
- `BlockSidePanel` open/close + ESC

---

## Notable (yellow, no phase yet — track and decide)

Items worth fixing eventually but not part of this sweep:

- `routes/resources.ts:223` + `defaultPages.ts:123` rebuild `R.table(Table.make())` per request. Memoize per-class at boot.
- `pageData/helpers.ts:471 / 508 / 612` — three serial `for…await` hydrator loops that could be `Promise.all`.
- `dispatchTable.ts` per-row has 7+ independent try/catch branches; hoist feature detection outside the row map for tables that don't use the feature.
- `TableRendererBody.tsx` (974 LOC, no `React.memo`) — children re-render on every parent state tick.
- `findInQueryWithTrashed` catches all errors → 404, masking adapter bugs. Add `console.warn`.
- `splitMeta()` (`routes/helpers.ts:78`) strips `_formId`/`_method`/`_continueCreate` but not `_csrf`/`_token` — mass-assignment policy catches it, but worth documenting.
- `readFormBody` returns `{}` on `parseBody()` throw — surface malformed multipart as 400 instead.
- `notifications/database.ts:268, :288` look like single-record materialization — verify they're the same `paginate(1, 1)` → `.first()` swap as Phase 3; bundle them in if so.

---

## Coverage gaps to backfill alongside

- `importFactory` upsert mode + partial-failure rollback semantics + validate "" vs non-empty
- Form lifecycle hooks (`mutateFormDataBefore*`, `mutateData*`, `getRedirectUrl`, `getCreatedNotificationTitle`) interaction with `dispatchFormSubmit` 422 re-render path
- `pageData/helpers.ts` 12 URL-tag helpers — negative cases (e.g. `tagFormStateUrls` with no `live()` descendants)
- `PilotiqServiceProvider` theme-load branch — currently has zero tests
- `io/csv.ts` — fuzz unterminated quotes / mixed line endings

---

## Suggested PR order

1. **Phase 1** alone (`fix(security): enforce guard() via router.group()` + changeset patch) — small, high-value, regression-tested
2. **Phase 2** alone (`fix(recharts): hook-order + peer range` + changeset patch)
3. **Phase 3** alone (`refactor: use .first() over paginate(1, 1)` + no changeset — internal only)
4. **Phase 5 a/b/c/d** bundled as one perf PR (`perf:` + changeset patch)
5. **Phase 4** alone (`refactor(theme-storage):` + changeset minor) — touches public surface, needs deprecation window
6. **Phase 6 a/b/c** bundled as one adapter-polish PR (`fix(adapters):` + changeset patch)
7. **Phase 6 d** alone (`refactor(adapters): consume @rudderjs/sync/react hooks` + changeset patch) — blocked on framework plan
8. **Phase 6 e** alone (`test(adapters):` — no changeset, no version bump)

Phases 1, 2, and 3 should ship today; the rest can wait for normal cadence. Phase 6d is blocked on the framework-side `@rudderjs/sync/react` plan landing first.

---

## Strengths noted (for context)

The review surfaced 5 actionable findings but also a lot to like:

- Only 23 `as any` / `@ts-ignore` across ~85K LOC of non-test code, almost all in Vite-emitted codegen or genuinely unsafe DOM bridges. Critical paths are escape-hatch-free.
- Authorization is consistently fail-closed via `checkPolicy(() => fn())` wrapping every `canX` call. IDOR pattern (`childBelongsToParent` via `paginate(1, 1)`) is the right shape.
- Recent module splits are clean — `pageData.ts` 4948 → 481 via 6 focused submodules, `routes.ts` similar.
- `Pilotiq.resolveUser` deliberately swallows errors → `null`, matching Laravel's `Auth::user()` semantics.
- No SQL-injection surface. The one `new Function` (client-side, schema-author-trusted, documented, cached) is fine.
- Adapter exemplars: `DragHandleExtension` (full DOM listener cleanup, no leaks), `useAiSuggestionBridge` (ref-mirror pattern), `CollabCodeMirrorEditor` Compartment design (preserves cursor + scroll + undo across toggles).

The negative findings sit on top of a fundamentally healthy codebase.
