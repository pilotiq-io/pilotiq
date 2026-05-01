---
name: Relations
description: Plan #11 — RelationManager primitive. Embed a related resource's Table (and optionally Form) on a parent record's Edit/View page, gated through the parent's authorization and routed under the parent's URL. Scoped to hasOne/hasMany/belongsTo (what `@rudderjs/orm` supports today); pivot/many-to-many deferred until ORM lands belongsToMany.
type: plan
---

# Relations

Plan #11 from `admin-gap-audit.md`. Adds a `RelationManager` primitive
that renders an embedded table of related records on a parent
resource's Edit/View page, with create/edit/delete actions scoped to
the parent. This is the second-largest day-1 ask from users coming
from mature admin frameworks (after page lifecycle hooks, which Plan
#4 covered): once a panel has any non-trivial schema (User → Posts,
Post → Comments, Order → LineItems), users expect to manage children
inline rather than navigating away to a flat top-level list filtered
by parent id.

This plan reuses building blocks already shipped: the `ModelLike /
ModelQuery` contract (`@pilotiq/pilotiq/orm`), the `Resource` static
shape (`form() / table() / recordTitleAttribute`), the `Tabs / Tab`
layout primitives (Plan #8 schema-layouts), `Action.create / edit /
view / delete` factories (Plan #1 actions-tier-1), and the dual-data
SSR/SPA path (`pageData.ts` builders). It adds **one new abstract
class** (`RelationManager`), **a small extension to `ModelLike`** for
resolving a parent's relation as a `ModelQuery`, **four new routes**
(list/create/edit/delete scoped under `${base}/${slug}/:id/${rel}`),
and **a renderer slot** that mounts relation managers under EditPage /
ViewPage tabs.

## Status

| Step | Status | Notes |
|---|---|---|
| 1. `RelationManager` abstract class | ✅ DONE 2026-05-01 | `relationship`, label/labelSingular/icon/recordTitleAttribute, `form(form) / table(table) / detail(record, parentRecord)` configurators, five `can*` predicates (parity with Plan #10 — defaults true), `getRelationship/Label/LabelSingular/Icon/RecordTitleAttribute` accessors, `RESERVED_RELATIONSHIP_TOKENS` set. 14 tests in `RelationManager.test.ts`. |
| 2. `Resource.relations()` typed return | ✅ DONE 2026-05-01 | Now `static relations(): Array<typeof RelationManager>`. `RelationDef` alias dropped (no external consumers). |
| 3. `ModelLike` relation contract | ✅ DONE 2026-05-01 | Added optional `ModelLike.relatedQuery(parent, name)` + helpers `defaultRelatedQuery / resolveRelatedQuery / modelRelationTableRecords`. Default impl reads `parent.related(name)` (rudder ORM convention); override via `ModelLike.relatedQuery` for ORMs without it. `relatedCreate` deferred — users wire foreign-key default through `Form.mutateDataBeforeCreate` on the manager's form (route handler stamps parent context onto FormContext). 7 new tests. |
| 4. `relationManagerData(pilotiq, scope, req)` page-data builder | ✅ DONE 2026-05-01 | Three scopes (`relation-list / -create / -edit`). Loads parent + (for edit) child via IDOR-safe `parent.related(name).where(pk, '=', childId).paginate(1, 1)`. Auto-wires `Table.records()` via `modelRelationTableRecords` and `Form.save / loadRecord` via `modelSave / modelLoadRecord` from the related Resource's model. Authorization in two layers (parent canAccess + canEdit, then manager-scoped). New helpers: `findRelatedResource(M, R, cfg)` (rudder-convention discovery + `M.relatedResource` override). 19 tests in `relationManagerData.test.ts`. |
| 5. Routes | ✅ DONE 2026-05-01 | Six handlers per manager: GET list, GET/POST create, GET/POST edit, POST delete. Reserved-token boot check (`edit / delete / _form / _action / _search / _uploads`) throws with a clear error. Two-layer auth (parent canAccess + canEdit, manager-scope can*). IDOR check re-runs the data builder's `child belongs to parent` query before edit/delete. FormContext stamped with `parent / parentId / relationship` for user lifecycle hooks. 11 tests in `routes-relations.test.ts`. |
| 6. Vike page stubs | ✅ DONE 2026-05-01 | `vite.ts` emits `pages/(pilotiq)/relation-list/`, `relation-create/`, `relation-edit/` (each with `+route.ts`, `+data.ts`, `+Page.tsx`). Route disambiguation by segment count (4 / 5 / 6) + literal-token check (`parts[3]==='edit'` excluded from list, `parts[4]==='create'` for create, `parts[5]==='edit'` for edit). `dispatchPageData` wires the three new pageIds through `relationManagerData`. 5 new tests. |
| 7. Mount on EditPage/ViewPage | ✅ DONE 2026-05-01 | New `RelationTabs` schema element + helper `buildRelationTabs(R, recordId, base, activeKey, mode)`. `resourceEditData / resourceViewData` prepend the strip when `R.relations().length > 0`; same prepend in all three `relationManagerData` scopes so users keep the parent-context strip when drilling into a manager. Renderer uses `<a href>` + SPA-navigate on plain left-click; cmd/ctrl/shift fall through. Active tab styled with primary border. 4 tests covering: relation-list active manager, no-relations skip, resource-edit Edit-active, resource-view Details-active. |
| 8. Authorization | ⏳ NOT STARTED | RelationManager carries its own `canViewAny / canView / canCreate / canEdit / canDelete` predicates — defaults defer to the related resource's policy when `Pilotiq.resourceFor(M)` finds one, otherwise default `true`. Parent's `canEdit(user, parentRecord)` gates *access* to any relation manager. Mismatched manager 404. |
| 9. Reactive integration | ⏳ NOT STARTED | When the parent form has `live()` fields and a manager edits-in-place, the manager's `_recordsUrl` re-fetches on parent state change. (Out of scope for v1; document the pattern.) |
| 10. Tests | ⏳ NOT STARTED | RelationManager registration; `relatedQuery` plumbs through to ModelQuery; routes load+save against the parent; tab mounting; authorization gating; `R.relations()` empty-array short-circuit. |
| 11. Playground demo | ⏳ NOT STARTED | `playground-pilotiq`: `User → Posts` (hasMany) and `Post → Author` (belongsTo, but rendered read-only — belongsTo doesn't get a manager, only hasOne/hasMany do). |
| 12. Docs | ⏳ NOT STARTED | New section in `packages/pilotiq/README.md`; CLAUDE.md notes; migration-from-panels addendum. |

**Tests at start:** 755/755. Build clean.
**Tests after Step 1+2:** 769/769 (+14 in `RelationManager.test.ts`).
**Tests after Step 3:** 776/776 (+7 in `modelDefaults.test.ts`).
**Tests after Step 4:** 795/795 (+19 in `relationManagerData.test.ts`).
**Tests after Step 5:** 806/806 (+11 in `routes-relations.test.ts`).
**Tests after Step 6:** 811/811 (+5 in dispatchPageData wiring section).
**Tests after Step 7:** 815/815 (+4 in relation-tabs auto-mount section).
**Target at completion:** ~830 (+75).

Estimated effort: **~2 weeks** (matches the audit estimate). Steps 1-5
are the bulk; step 7 (tab mounting) requires careful interaction with
the existing Plan #4 page lifecycle and Plan #8 schema-layouts; step 9
is documentation-only for v1.

**Prereqs (all shipped):**
- Plan #1 actions-tier-1 — `Action.create / edit / view / delete`
  factories used for the per-row table actions inside the manager.
- Plan #4 page-lifecycle — `RelationManager` reuses the same
  Form lifecycle hooks (`mutateDataBefore*`, `before/after*`, `save`).
- Plan #7 list-page-tabs — manager tabs mount as `Tabs / Tab`
  containers, but they're a different shape (full-page tabs across
  unrelated tables) so we extend the same primitive in a sibling
  builder rather than reusing `ListTab` directly.
- Plan #8 schema-layouts — the EditPage/ViewPage shell uses Tabs
  to host the relation managers without breaking the existing
  Wizard/Section/Split layouts users author inside `form()`.
- Plan #9 navigation + Plan #10 authorization — every relation
  manager defers to the related resource's policy by default and
  inherits its icon for tab decoration.
- ORM auto-wiring — extends `ModelLike` with optional relation
  helpers; falls back to the rudder ORM `instance.related(name)`
  convention.

**Out of scope (deferred to follow-up plans):**
- `belongsToMany` / pivot fields. `@rudderjs/orm` does not yet
  support many-to-many relations — explicitly out of scope per the
  ORM source comment. When ORM lands `belongsToMany`, a follow-up
  plan adds `attach / detach / sync` actions and pivot-form support.
  Until then, users with M2M needs implement a hand-written join
  resource (e.g. `UserRoleResource`) and use two `hasMany` managers.
- Polymorphic relations (`morphMany / morphTo`) — same blocker; same
  follow-up.
- `RelationGroup` (tabbing multiple managers under one label) — the
  Plan #11 mounting already auto-tabs each manager. RelationGroup
  remains as a Tier-2 polish for nested grouping (e.g. "Permissions"
  tab containing both Roles and DirectGrants managers).
- Inline-edit columns inside the manager's table (`SelectColumn`,
  `ToggleColumn`, `TextInputColumn`). Tier-3 from the audit;
  unrelated to relations specifically.
- Reorderable tables on relation managers (`reorderable`). Needs an
  `R.model.reorder` ORM contract — Tier-2 audit item.

**Companion memories (to write at completion):**
- `project_pilotiq_relations.md` — landing summary.
- `feedback_relations_belongstomany_deferred.md` — record the pivot
  deferral so future-me doesn't re-litigate every time a user asks
  for tags-on-articles.

## Why we want it

Concrete frictions today on the playground:

1. **Editing a User's posts** requires sidebar → Users → click user
   → memorize id → sidebar → Posts → filter `?authorId=` → table
   load. With Plan #11: open the User edit page, switch to the
   "Posts" tab, table renders inline, click a row to edit (still
   under `/admin/users/:id/posts/:postId/edit` so the URL is
   shareable).
2. **Authorization stays scoped.** Without managers, a viewer who
   can list Users but not Posts would either see the Posts nav or
   not — there's no middle ground for "viewer of this *one* user
   sees their posts." With managers: `PostManager.canViewAny(user,
   parentUser)` decides per-parent.
3. **Per-record context for create.** A Post created from
   `User #5 → Posts → Create` should default `authorId = 5`
   without the user typing it. Manager's `mutateFormDataBeforeCreate`
   hook receives `{ parent, parentId, parentRecord }` so the default
   wires up automatically.

Composes with already-shipped features:

- **Authorization (#10):** every manager route runs the parent's
  `R.canEdit(user, parentRecord)` first (gating access to *this*
  manager view), then the related resource's policy on the child
  action (`canCreate(user)`, `canDelete(user, child)`). Two layers,
  fail-closed.
- **Page lifecycle (#4):** managers reuse the exact lifecycle hooks
  Resource forms use — same `mutateData*`, `before/after*`,
  `getRedirectUrl`, notifications. No new hook surface to learn.
- **Schema-layouts (#8):** the auto-Tabs wrapper sits *outside* the
  user's `form()` schema, so nested Wizards/Splits/Sections render
  unchanged inside the first tab. Tabs persistence via
  `Tabs.persist(true)` keeps the right tab open across SPA nav.

## API

### `RelationManager` abstract class

```ts
import { RelationManager, Action, Column } from '@pilotiq/pilotiq'
import { Post } from '../models/Post'

export class PostsManager extends RelationManager {
  /**
   * Required. The key on the parent's `static relations` map (rudder
   * ORM convention) that points at the related model. Pilotiq looks
   * up the related Resource by inspecting the panel for a Resource
   * whose `static model === parent.related(relationship).getModel()`.
   */
  static relationship = 'posts'

  /**
   * Optional. Defaults to the related resource's
   * `recordTitleAttribute` when one is found, or the same fallback
   * chain as Plan #12 global search (name → title → id).
   */
  static recordTitleAttribute = 'title'

  /** Tab label. Defaults to the related resource's `label`. */
  static label = 'Posts'

  /** Tab icon. Defaults to the related resource's `icon`. */
  static icon  = 'newspaper'

  /**
   * Manager's table. Same shape as `Resource.table()` — Columns,
   * filters, default sort, search, actions. Auto-wires
   * `Table.records()` against
   * `parent.related('posts').paginate(page, perPage)` when the
   * parent has a `ModelLike` and the relation resolves cleanly.
   */
  static override table(): Table {
    return Table.make()
      .columns([
        Column.make('title').sortable().searchable(),
        Column.make('publishedAt').dateTime(),
      ])
      .recordActions([
        Action.edit(this, '/* base resolved by router */'),
        Action.delete(this, '/* base resolved by router */'),
      ])
      .headerActions([
        Action.create(this, '/* base resolved by router */'),
      ])
  }

  /**
   * Manager's create/edit form. Same shape as `Resource.form()`.
   * The parent record + parent id are stamped into ctx so
   * mutateFormDataBeforeCreate can default fields from the parent.
   */
  static override form(): Form {
    return Form.make().schema([
      TextField.make('title').required(),
      TextareaField.make('body'),
    ])
  }

  /**
   * Optional. Default the foreign key from the parent record on
   * create. The default impl reads the relation's `foreignKey`
   * config (rudder ORM `RelationDefinition.foreignKey`) and stamps
   * `data[fk] = parentRecord[parentPk]`. Override only when the
   * default doesn't match your schema.
   */
  static override mutateFormDataBeforeCreate(
    data: Record<string, unknown>,
    ctx:  RelationFormContext,
  ): Record<string, unknown> {
    return { ...data, authorId: ctx.parentRecord.id }
  }

  // ─── Authorization (Plan #10 parity) ───
  static override async canViewAny(_user: unknown, _parentRecord: unknown): Promise<boolean> {
    return true
  }
  static override async canView(_user: unknown, _record: unknown, _parentRecord: unknown): Promise<boolean> {
    return true
  }
  static override async canCreate(_user: unknown, _parentRecord: unknown): Promise<boolean> {
    return true
  }
  static override async canEdit(_user: unknown, _record: unknown, _parentRecord: unknown): Promise<boolean> {
    return true
  }
  static override async canDelete(_user: unknown, _record: unknown, _parentRecord: unknown): Promise<boolean> {
    return true
  }
}
```

### Mounting on a Resource

```ts
class UserResource extends Resource {
  static slug                 = 'users'
  static recordTitleAttribute = 'name'
  static model                = User

  static override relations(): typeof RelationManager[] {
    return [PostsManager]
  }

  // form() / table() unchanged.
}
```

The default EditPage/ViewPage detects `R.relations().length > 0`
and wraps the existing form/detail in a Tabs container with the
relation managers as sibling tabs. Users who already use Tabs in
their `form()` get a *second* tab layer at the page root — their
inner Tabs render inside the "Edit" tab unchanged.

Resources that want hand-rolled control can override
`pages: { edit: CustomEditPage }` and skip the auto-tab. The
manager routes still register based on `R.relations()`, so users
can mount managers anywhere via the bare URL even when the page
shell is custom.

### URLs

```
GET    /admin/users/:id/posts                  — list manager
GET    /admin/users/:id/posts/create           — create form
POST   /admin/users/:id/posts/create           — submit
GET    /admin/users/:id/posts/:postId/edit     — edit form
POST   /admin/users/:id/posts/:postId/edit     — submit
POST   /admin/users/:id/posts/:postId/delete   — delete
```

Children's view page is **not** introduced by Plan #11 — clicking
into a child row navigates to the related resource's *own* view URL
(`/admin/posts/:postId`) so the user can drill into the full
record context. (Override via `Table.recordUrl(fn)` on the manager
table to keep navigation in-place.)

### Reserved relation slug check

Resource registration validates that no `R.relations()` manager has
a `relationship` colliding with a reserved URL token under
`${base}/${slug}/:id/...`. Reserved tokens: `edit`, `delete`,
`_form`, `_action`, `_search`. A collision throws at panel boot —
better than a silent 404 at runtime.

## File inventory

```
packages/pilotiq/src/
├─ RelationManager.ts                 NEW — abstract class + types
├─ Resource.ts                        EDIT — typed `relations(): typeof RelationManager[]`
├─ orm/modelDefaults.ts               EDIT — relatedQuery / relatedCreate helpers
├─ pageData.ts                        EDIT — relationManagerData (list / create / edit)
├─ routes.ts                          EDIT — 4 new route handlers + reserved-token guard
├─ vite.ts                            EDIT — emit relation-list / relation-create / relation-edit page stubs
├─ defaultPages.ts                    EDIT — auto-tabs wrapper when relations().length > 0
├─ react/RelationManagerTabs.tsx      NEW — renderer slot for the tab strip + lazy-loaded tab content
├─ react/SchemaRenderer.tsx           EDIT — pass relations through to RelationManagerTabs
└─ index.ts                           EDIT — export RelationManager + RelationFormContext

packages/pilotiq/src/__tests__/        (or co-located .test.ts files)
├─ RelationManager.test.ts            NEW
├─ relationManagerData.test.ts        NEW
└─ routes-relations.test.ts           NEW

playground-pilotiq/app/Pilotiq/
├─ resources/UserResource.ts          EDIT — add PostsManager
├─ relations/PostsManager.ts          NEW
└─ ...

docs/
├─ guide/relations.md                 NEW — usage guide
└─ guide/migrating-from-panels.md     EDIT — relations addendum
```

## Approach by step

### Step 1 — `RelationManager` abstract class

Mirror the `Resource` static shape minus URL ownership. Keep the
class abstract — users always subclass.

```ts
// packages/pilotiq/src/RelationManager.ts
export interface RelationFormContext extends FormContext {
  parent:        typeof Resource
  parentId:      string | number
  parentRecord:  unknown
  relationship:  string
}

export abstract class RelationManager {
  static relationship:        string                          // required
  static label?:              string                          // defaults to related Resource.label
  static labelSingular?:      string
  static icon?:               IconValue
  static recordTitleAttribute?: string
  static navigationBadge?:    NavigationBadgeHandler          // defer; Tier 2

  static form():   Form  { return Form.make() }
  static table():  Table { return Table.make() }
  static detail(): Element[] { return [] }                    // future: ViewPage support

  // Lifecycle — same shape as Resource form lifecycle
  static mutateFormDataBeforeFill?:    (data: Record<string, unknown>, ctx: RelationFormContext) => Record<string, unknown> | Promise<Record<string, unknown>>
  static mutateFormDataBeforeCreate?:  (data: Record<string, unknown>, ctx: RelationFormContext) => Record<string, unknown> | Promise<Record<string, unknown>>
  static mutateFormDataBeforeUpdate?:  (data: Record<string, unknown>, ctx: RelationFormContext) => Record<string, unknown> | Promise<Record<string, unknown>>
  static beforeCreate?:                (ctx: RelationFormContext) => void | Promise<void>
  static afterCreate?:                 (record: unknown, ctx: RelationFormContext) => void | Promise<void>
  static beforeUpdate?:                (ctx: RelationFormContext) => void | Promise<void>
  static afterUpdate?:                 (record: unknown, ctx: RelationFormContext) => void | Promise<void>

  // Authorization
  static async canViewAny(_user: unknown, _parentRecord: unknown): Promise<boolean>            { return true }
  static async canView(_user: unknown, _record: unknown, _parentRecord: unknown): Promise<boolean>  { return true }
  static async canCreate(_user: unknown, _parentRecord: unknown): Promise<boolean>             { return true }
  static async canEdit(_user: unknown, _record: unknown, _parentRecord: unknown): Promise<boolean>  { return true }
  static async canDelete(_user: unknown, _record: unknown, _parentRecord: unknown): Promise<boolean> { return true }

  static getRelationship(): string {
    if (!this.relationship) {
      throw new Error(`[pilotiq] ${this.name}: static relationship must be set`)
    }
    return this.relationship
  }
}
```

### Step 2 — `Resource.relations()` typed

```ts
// Before
export type RelationDef = unknown
static relations(): RelationDef[] { return [] }

// After
import type { RelationManager } from './RelationManager.js'
static relations(): Array<typeof RelationManager> { return [] }
```

Drop the `RelationDef` alias entirely — it's unused outside the
placeholder. (Audit: grep confirms zero external consumers.)

### Step 3 — `ModelLike` relation contract

Extend the existing `ModelLike` interface with two **optional**
helpers so resources without relation needs aren't forced to
implement them. The default impl in `modelDefaults.ts` reads
`parent.related(relationName)` (the rudder ORM convention) when the
parent record has it, and throws a clear error otherwise.

```ts
// packages/pilotiq/src/orm/modelDefaults.ts
export interface ModelLike {
  // ... existing fields ...

  /**
   * Optional. Return a `ModelQuery` scoped to the parent's relation,
   * for pilotiq to drive Table.records() inside a RelationManager.
   * Defaults to `parent.related(relationName)` when the parent
   * exposes that method (rudder ORM convention).
   */
  relatedQuery?(parent: unknown, relationName: string): ModelQuery

  /**
   * Optional. Create a child record under the parent's relation.
   * Defaults to setting the foreign key from the relation
   * definition + calling `RelatedModel.create(data)`.
   */
  relatedCreate?(parent: unknown, relationName: string, data: Record<string, unknown>): Promise<unknown>
}

export function defaultRelatedQuery(parent: unknown, relationName: string): ModelQuery {
  const r = (parent as { related?: (n: string) => ModelQuery }).related
  if (typeof r !== 'function') {
    throw new Error(`[pilotiq] Parent record has no .related() method — implement ModelLike.relatedQuery for "${relationName}".`)
  }
  return r.call(parent, relationName)
}
```

Pilotiq calls `M.relatedQuery?.(parent, name) ?? defaultRelatedQuery(parent, name)`
inside the manager's auto-wired `Table.records()`. Resources whose
ORM doesn't follow the rudder convention override `relatedQuery`.

### Step 4 — page-data builder

```ts
// packages/pilotiq/src/pageData.ts
export type RelationManagerScope =
  | { kind: 'relation-list'; slug: string; recordId: string; relationship: string }
  | { kind: 'relation-create'; slug: string; recordId: string; relationship: string }
  | { kind: 'relation-edit'; slug: string; recordId: string; relationship: string; childId: string }

export async function relationManagerData(
  pilotiq: Pilotiq,
  scope:   RelationManagerScope,
  req?:    unknown,
): Promise<Record<string, unknown> | null> {
  const cfg  = pilotiq.getConfig()
  const user = await pilotiq.resolveUser(req)

  const R = cfg.resources.find(r => r.getSlug() === scope.slug)
  if (!R) return null

  const M = R.relations().find(m => m.getRelationship() === scope.relationship)
  if (!M) return null

  // Authorization — parent canEdit (access gate), then manager-level can*
  if (!await checkPolicy(() => R.canAccess(user)))                                  return forbidden403
  const parentRecord = R.model ? await R.model.find(scope.recordId).catch(() => undefined) : { id: scope.recordId }
  if (!parentRecord)                                                                return null
  if (!await checkPolicy(() => R.canEdit(user, parentRecord)))                      return forbidden403

  switch (scope.kind) {
    case 'relation-list':
      if (!await checkPolicy(() => M.canViewAny(user, parentRecord)))               return forbidden403
      return resolveRelationListSchema(R, M, parentRecord, user, cfg.path, req)

    case 'relation-create':
      if (!await checkPolicy(() => M.canCreate(user, parentRecord)))                return forbidden403
      return resolveRelationCreateSchema(R, M, parentRecord, user, cfg.path)

    case 'relation-edit': {
      const child = await loadChildRecord(R, M, parentRecord, scope.childId)
      if (!child)                                                                   return null
      if (!await checkPolicy(() => M.canEdit(user, child, parentRecord)))           return forbidden403
      return resolveRelationEditSchema(R, M, parentRecord, child, user, cfg.path)
    }
  }
}
```

`loadChildRecord` resolves the related model from the panel's
resource registry: panel scans `cfg.resources` for the one whose
`R.model === ParentRelations[relationship].model()` and uses
*its* `.model.find(childId)`. Plus an authorization check that the
child actually belongs to the parent (filter `where(fk, parentId)`)
to prevent IDOR through URL tampering.

### Step 5 — routes

Four new handlers in `routes.ts`, each running the same
authorization prelude as Plan #10. Reuses `dispatchFormSubmit` for
create/edit; `R.model.delete(childId)` for delete (after re-running
the parent-belongs check).

```
GET    ${base}/${slug}/:id/${rel}                  → relationManagerData('relation-list')
GET    ${base}/${slug}/:id/${rel}/create           → relationManagerData('relation-create')
POST   ${base}/${slug}/:id/${rel}/create           → dispatchFormSubmit + redirect to list
GET    ${base}/${slug}/:id/${rel}/:childId/edit    → relationManagerData('relation-edit')
POST   ${base}/${slug}/:id/${rel}/:childId/edit    → dispatchFormSubmit + redirect
POST   ${base}/${slug}/:id/${rel}/:childId/delete  → M.canDelete + R.model.delete + redirect
```

The reserved-token guard runs at panel boot (in
`PilotiqRegistry.register`): for every manager
`M.getRelationship()`, assert it's not in
`['edit', 'delete', '_form', '_action', '_search']`. Throw with a
clear error pointing at the offending manager + resource.

### Step 6 — Vike page stubs

`vite.ts` extends its generation pass to emit three new stub
routes per panel:

- `pages/(pilotiq)/relation-list/+Page.tsx` — 4-segment route
  `${base}/${slug}/:id/${rel}` matching when `parts[2]` is a
  recordId (not `create`) AND `parts[3]` is in the manager's
  relationship-key set.
- `pages/(pilotiq)/relation-create/+Page.tsx` — 5-segment ending
  in `create`.
- `pages/(pilotiq)/relation-edit/+Page.tsx` — 5-segment with
  `parts[4] === 'edit'`.

Each stub is the same one-line `<SchemaRenderer elements={vp.schemaData ?? []} />`
the existing stubs use. Server resolves; client renders.

The manifest emitted by `_components.ts` already covers any
component-typed icons used by managers (defaults inherited from
the related Resource), so no new manifest changes.

### Step 7 — auto-tab on EditPage / ViewPage

`defaultPages.ts` extends `EditPage.schema(ctx)` and `ViewPage.schema(ctx)`:

```ts
// Pseudocode
const baseSchema = await callOriginalSchema(ctx)         // user's form()/detail()
const managers   = R.relations()
if (managers.length === 0) return baseSchema             // unchanged path

const editTab    = Tab.make('Edit').schema(baseSchema)
const relTabs    = await Promise.all(
  managers.map(async M => Tab.make(M.label ?? defaultLabel(M))
    .icon(M.icon ?? defaultIcon(M))
    .schema([
      // Each tab links to its own URL — clicking the tab
      // navigates so the table renders fresh per parent.
      RelationManagerTabContent.make(M, ctx.recordId)
    ])
  )
)
return [Tabs.make().tabs([editTab, ...relTabs]).persist(true)]
```

The tab content is *not* the manager's full table inline — it's a
thin React placeholder that, once mounted, navigates to the
manager's list URL via SPA. This avoids server-side resolving every
manager's records on every parent page load (would be N+1 even with
parallel resolution).

Alternative considered + rejected: server-resolve every manager's
table in parallel on the parent page load. Faster perceived nav at
the cost of doing work the user might not want — most parents have
2-3 managers and users only open one at a time.

### Step 8 — authorization defaults

When `RelationManager.canX` defaults are not overridden, fall
through to the related resource's policy when the panel has one
registered for the same model. This avoids the user redefining the
same policy in two places.

```ts
// In relationManagerData when M.canCreate hasn't been overridden:
const Related = findResourceForManager(pilotiq, R, M)        // walks cfg.resources
if (Related && !canCreateOverridden(M)) {
  if (!await checkPolicy(() => Related.canCreate(user)))     return forbidden403
}
```

`canXOverridden(M)` checks whether the static differs from
`RelationManager.canX` (reference equality on the prototype chain).
Pure ergonomic sugar — users can always override per-manager when
the policy needs to differ from the related resource.

### Step 9 — reactive integration (doc-only)

If the parent page has a reactive form (Plan #5) and a manager edits
the parent's relation count (e.g. creating a Post should bump the
"Posts (3)" badge), today this requires a manual page refresh.
Future plan adds:
- A `Tabs.dependsOn([fields])` builder that triggers manager-tab
  badge re-fetch when listed fields change.
- The manager list endpoint returns the current count alongside
  rows so the badge updates without a full re-render.

For Plan #11, document the limitation. The page reload after
create/edit/delete (the standard form-post-303 path) fixes the badge
count incidentally, so the worst case is a stale badge between
batched edits — acceptable.

### Step 10 — tests

Mirror the existing Resource test split:

- `RelationManager.test.ts` — abstract-class behavior: required
  `relationship`, label/icon defaults, can* default to true.
- `relationManagerData.test.ts` — page-data builder: scopes route
  correctly, parent authorization gates first, manager
  authorization gates second, child-belongs check, missing
  parent/manager → null, IDOR resistance (child not actually
  related → null, not 200 with wrong data).
- `routes-relations.test.ts` — route handlers: form lifecycle runs
  with parent context stamped in, redirects land on the list,
  delete removes only the targeted child.

Add a regression test: `Resource.relations()` returning a manager
whose relationship collides with `'edit'` throws at panel boot.

### Step 11 — playground demo

`playground-pilotiq/app/Pilotiq/`:

- New `relations/PostsManager.ts` for `User → posts`.
- `resources/UserResource.ts` adds `static relations() { return [PostsManager] }`.
- Seed a few users + posts in `prisma/seed.ts`.
- Verify: navigate to `/new-admin/users/1/edit`, see "Edit" + "Posts" tabs,
  click Posts, table loads against `User#1.related('posts')`, click Create,
  form opens at `/new-admin/users/1/posts/create`,
  `mutateFormDataBeforeCreate` defaults `authorId=1`, submit redirects
  back to the list.

### Step 12 — docs

- `packages/pilotiq/README.md` — new "Relations" section under the
  Resource API docs.
- `CLAUDE.md` — add `RelationManager.ts` to the architecture table
  + the new routes to the route list.
- `docs/guide/migrating-from-panels.md` — addendum explaining
  panels' `RelationField` → pilotiq's `RelationManager` mapping.
- `docs/plans/admin-gap-audit.md` — flip Plan #11 row to ✅.

## Risks + open questions

1. **Auto-tab interference with user-authored Tabs.** A user whose
   `form()` already returns a top-level `Tabs.make()` will see
   their tabs nested inside the auto-tab "Edit" tab. Mitigation:
   detect a top-level `Tabs` in the user's schema and *flatten* —
   prepend their tabs to the manager tabs at the same level.
   Edge cases: user has `Tabs` followed by other elements (Card
   below Tabs). Resolution: only flatten when the schema is exactly
   `[Tabs.make()]` with one element. Otherwise wrap. Document.

2. **Polymorphic resources where multiple resources share a model.**
   `findResourceForManager()` may match multiple resources (e.g.
   `Post` shown both as `BlogPostResource` and `DraftResource`).
   Resolution: require an explicit `M.resource = BlogPostResource`
   override in that case; the auto-resolution throws when ambiguous.
   Add to the boot-time validation pass.

3. **Pivot (M2M) deferral.** Confirmed scope decision: until
   `@rudderjs/orm` adds `belongsToMany`, M2M users hand-roll a join
   resource. We ship a clear error message when `R.relations()`
   returns a manager whose relationship resolves to nothing in
   `parent.relations` — points the user at the join-resource
   pattern with an example link.

4. **Reserved-token expansion.** Today's reserved set is
   `[edit, delete, _form, _action, _search]`. If we later add
   `_export` or `_settings` per-record, every existing relation
   manager needs a migration. Document the reserved set in the
   public API docs so users naming managers `'export'` get an early
   warning rather than a v0.4 break.

5. **N+1 on tab badges.** If a future plan adds badge counts on
   manager tabs (e.g. "Posts (12)"), naively fetching N counts on
   every parent page load is O(N) DB queries. Mitigation: same as
   navigation badges in Plan #9 — `M.navigationBadge()` runs in
   parallel via `Promise.all` and errors swallow.

## Decision log

- **Why static methods** (vs instances): keeps parity with
  `Resource` so users don't context-switch between mental models.
  `RelationManager` is registered by class via
  `Resource.relations()`, never instantiated.
- **Why no `slug`**: managers don't own URLs — they live under the
  parent's URL keyed by `relationship`. The relationship name
  doubles as the URL segment.
- **Why no `pages()` override**: managers reuse the
  list/create/edit/delete pattern that Resource owns. Custom views
  go on the related Resource itself, not on the manager. (The
  manager is a *projection*, not a clone.)
- **Why scope to `hasOne / hasMany / belongsTo` only**: matches
  what `@rudderjs/orm` supports today. Adding `belongsToMany`
  requires both ORM work AND a pivot-form UI primitive — separable
  efforts. Better to ship the 80% case clean than carry a half-done
  M2M API.
- **Why parent's `canEdit` is the access gate** (not `canView`):
  managers are read-write surfaces by default. Users who want a
  read-only inline view can override the manager's `canCreate /
  canEdit / canDelete` to `false`. The parent-level check stays at
  `canEdit` since "I can edit this user" implies "I can manage
  their relations."
