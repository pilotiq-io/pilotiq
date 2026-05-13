# Collab — per-Resource / per-Page opt-in

> **Status:** drafting 2026-05-13
> **Scope:** flip collab from "register plugin → activate everywhere" to "register plugin → nothing activates until a Resource or custom Page opts in." Adds `Resource.collab({...})` and `Page.collab({...})` declarative config. Per-field `.collab(false)` stays as the escape hatch.
>
> **Out of scope (v1):** field allowlist/denylist at resource level (covered today by `Field.collab(false)`), per-page-role overrides within a Resource (`MyEditPage.collab(false)` to opt out a single page while resource opts in), callback-form room ids on Resource.

---

## TL;DR

| Decision | Choice | Why |
|---|---|---|
| Activation model | **Opt-in per surface** | Most resources don't need collab — registering a plugin shouldn't impose WS overhead + presence leakage on every edit page. Pre-1.0, no migration weight. |
| Resource API | **`static collab = { pages?, presence?, room? }`** | Mirrors the existing static-field pattern (`static softDeletes`, `static globalSearch`). Declarative. Reads naturally. |
| Custom page API | **`static collab = { room: string, presence? }` — `room` REQUIRED** | Custom pages have no recordId to derive a room from. Forcing the literal makes intent explicit and the room-id scheme greppable. |
| Field-level | **Unchanged — `Field.collab(false)` opt-out wins over any Resource setting** | Existing escape hatch keeps working; resource-level allowlist deferred. |
| Defaults when `static collab = {}` | **`pages: ['edit']`, `presence: true`** | Edit is the only page role where value-sync is meaningful; presence default-on matches today's behavior for opted-in resources. |
| Panel plugin | **Stays as `collab()` in `.plugins([...])`** | Plugin still wires the global singletons (transport, Tiptap extension factory, renderer registry slots). What changes is the *gate*, not the registration. |
| Breaking change | **Yes — minor bump on pilotiq** | Pre-1.0; document in changeset. Migration is two lines per affected resource. |
| Estimated diff | **~250 LOC + ~150 LOC tests across pilotiq core + pilotiq-pro/collab** | Resource API + meta serialization + gate rewrite + custom-page hook + tests + playground update. |

---

## Why opt-in, not opt-out

Current model: registering the `collab()` plugin activates collab on every `/:id/edit` URL across the panel. That implicitly assumes "most resources want collab." For pilotiq's intended use (admin panels — mostly internal tools, settings, audit logs) the opposite is closer to true: most edit pages have one user at a time, and presence/awareness leakage (who's looking at what record) can be a real concern.

Opt-in also gives a natural home for per-surface config that opt-out can't:
- `room` override on custom pages (no recordId).
- Future allow/deny lists at Resource level.
- Future per-resource WS auth tightening.

---

## API surface

### `Resource.collab`

```ts
// packages/pilotiq/src/resources/Resource.ts

export interface ResourceCollabConfig {
  /**
   * Page roles where collab activates. Defaults to ['edit'].
   * - 'edit': value-sync + presence on the edit page.
   * - 'view': presence-only on the view page (value-sync is moot — page is read-only).
   * - 'create': no effect in v1 (no recordId until save); accepted for forward-compat.
   */
  pages?: Array<'edit' | 'view' | 'create'>

  /**
   * Whether to broadcast awareness (focus chips, cursor positions).
   * Default true. Set false to sync values without leaking who's editing what.
   */
  presence?: boolean
}

export abstract class Resource {
  static collab?: ResourceCollabConfig | true
  // ...
}
```

Two valid spellings:
- `static collab = true` → shorthand for `{ pages: ['edit'], presence: true }`. The 90% case.
- `static collab = { ... }` → explicit config.
- Omitted → collab is OFF for this resource regardless of plugin registration.

### `Page.collab` (for custom panel pages)

```ts
// packages/pilotiq/src/pages/Page.ts (custom-page base class)

export interface PageCollabConfig {
  /**
   * Room id for this page's Y.Doc. Required — no recordId to derive from.
   * Convention: 'page:{slug}' or 'team:{teamId}:settings' etc.
   */
  room: string

  /** Default true. */
  presence?: boolean
}

export abstract class Page {
  static collab?: PageCollabConfig
  // ...
}
```

No `true` shorthand here — `room` is required.

### Field — unchanged

`Field.collab(false)` continues to work and overrides any Resource setting. `Field.collab(true)` is forward-compat (currently a no-op since collab default is "inherit"; once allowlist support lands, `true` will force-include).

---

## Implementation

### 1. Resource meta serialization

`Resource.toMeta()` already produces a `ResourceMeta` consumed by the client. Add a `collab` slot:

```ts
// packages/pilotiq/src/resources/Resource.ts — toMeta()

const collabRaw = (this.constructor as typeof Resource).collab
const collab: ResourceCollabConfig | null = 
  collabRaw === true ? { pages: ['edit'], presence: true }
  : collabRaw ? { 
      pages: collabRaw.pages ?? ['edit'], 
      presence: collabRaw.presence ?? true,
    }
  : null

return {
  // ...existing fields
  collab,
}
```

`ResourceMeta.collab: ResourceCollabConfig | null` — `null` = collab disabled for this resource.

### 2. `RecordWrapperGate` — check resource opt-in

Today: `RecordWrapperGate.tsx:28-40` parses the URL via `parseRecordEditUrl` and mounts `<RecordCollabRoom>` for any matching URL when the gate is registered.

After: resolve the resource from the URL's slug, check `resourceMeta.collab`, and only mount if non-null AND the current page role is in `collab.pages`.

```ts
// packages/pilotiq/src/react/RecordWrapperGate.tsx

const identity = parseRecordEditUrl(currentPath, basePath)
if (!identity) return <>{children}</>

const resource = panelInfo.resources.find(r => r.slug === identity.slug)
if (!resource?.collab) return <>{children}</>  // opted out

// page role derived from URL — `/edit` → 'edit', `/view` → 'view', etc.
const pageRole = identity.role 
if (!resource.collab.pages.includes(pageRole)) return <>{children}</>

return <RecordCollabRoom recordId={identity.id} resource={resource}>{children}</RecordCollabRoom>
```

`parseRecordEditUrl` needs widening to also recognize `/view` (currently only matches `/edit`). Rename: `parseRecordPageUrl`, returns `{ slug, id, role: 'edit' | 'view' }`.

### 3. Custom-page gate

Custom pages currently mount under the panel's base path with no `id` segment. They aren't recognized by `parseRecordEditUrl` and so never trigger `RecordWrapperGate`. Add a separate hook:

```ts
// packages/pilotiq/src/react/CustomPageCollabGate.tsx (new)

export function CustomPageCollabGate({ pageMeta, children }: Props) {
  if (!pageMeta.collab) return <>{children}</>
  
  return (
    <CustomPageCollabRoom room={pageMeta.collab.room} presence={pageMeta.collab.presence}>
      {children}
    </CustomPageCollabRoom>
  )
}
```

Mount inside the custom-page renderer in `AppShell`. Pass `pageMeta.collab` through `PageMeta`.

`@pilotiq-pro/collab` registers a `CustomPageCollabRoom` factory the same way it registers `RecordCollabRoom` today — new module-singleton slot: `registerCustomPageCollabRoom(fn)`. If unregistered (plugin not installed), the gate renders children directly.

### 4. Field-level wins over Resource

In `formCollabBinding` (`@pilotiq-pro/collab`), the existing walk:

```ts
const TEXT_FIELD_TYPES = ['text','textarea','email','slug','markdown']
const collabFields = formMeta.fields.filter(f => 
  TEXT_FIELD_TYPES.includes(f.type) && f.collab !== false
)
```

stays as is. Resource-level config controls *whether the binding instance is created at all*; the field-level check inside the binding continues to govern individual fields. No conflict.

### 5. Plugin behavior

`collab()` plugin (`@pilotiq-pro/collab/plugin.ts`) keeps doing what it does — registers the 5 global singletons + the new `CustomPageCollabRoom` factory. What changes:
- It no longer activates anything by virtue of being registered.
- The gates now consult resource/page meta to decide whether to mount.

The plugin is now a *prerequisite* (without it, the registry slots are empty and gates render children directly even if a resource opts in). Document this.

---

## Migration

For consumers (pilotiq-pro playground, downstream installs):

```ts
// Before — collab activates on every resource's edit page
class Post extends Resource {
  // ...
}

// After — explicit opt-in
class Post extends Resource {
  static collab = true   // or { pages: ['edit'], presence: true }
  // ...
}
```

Changeset: minor bump (0.9.x → 0.10.0). BREAKING note in changelog spelling out the migration. Pilotiq-pro playground's `Post` resource gets the new flag in the same PR.

---

## Test plan

`packages/pilotiq/test/resources/collab-config.test.ts`:
- `static collab = true` → `toMeta().collab` returns `{ pages: ['edit'], presence: true }`.
- `static collab = { pages: ['edit','view'] }` → meta carries `pages: ['edit','view']`, `presence: true` (default).
- `static collab = { presence: false }` → meta carries `pages: ['edit']`, `presence: false`.
- Omitted → `toMeta().collab === null`.

`packages/pilotiq/test/react/record-wrapper-gate.test.tsx`:
- Resource without collab + URL matches edit → children only, no `<RecordCollabRoom>`.
- Resource with `collab = true` + URL matches edit → `<RecordCollabRoom>` mounts.
- Resource with `collab: { pages: ['edit'] }` + URL is `/view` → children only.
- Resource with `collab: { pages: ['view'] }` + URL is `/view` → `<RecordCollabRoom>` mounts.

`packages/pilotiq/test/react/custom-page-collab-gate.test.tsx`:
- Page without `static collab` → children only.
- Page with `static collab = { room: 'settings:general' }` → `<CustomPageCollabRoom room="settings:general">` mounts.
- Plugin not registered (`registerCustomPageCollabRoom` slot empty) → children render directly even if page has collab config.

`pilotiq-pro/packages/collab/__tests__/formCollabBinding.test.ts` — existing 17 tests should still pass. Add one regression: field-level `.collab(false)` overrides resource-level inclusion.

Playground manual smoke (`pilotiq-pro/playground`):
- `Post.collab = true` → two windows on `/admin/posts/:id/edit` sync as today.
- Remove the flag from `Post` → two windows behave independently (no sync, no presence). Same URL, no console errors.
- Add `static collab = { room: 'settings:general' }` to a custom Settings page → two windows on `/admin/settings` sync the form.

---

## Rollout

1. **PR 1 — pilotiq core (this plan):**
   - `Resource.collab` static + `toMeta` serialization
   - `Page.collab` static + custom-page meta wiring
   - `RecordWrapperGate` resource-lookup + role-check
   - `CustomPageCollabGate` new component + `registerCustomPageCollabRoom` slot
   - `parseRecordEditUrl` → `parseRecordPageUrl` rename (private; no external break)
   - Tests
   - Changeset (minor, BREAKING note)

2. **PR 2 — `@pilotiq-pro/collab`:**
   - Register `CustomPageCollabRoom` in plugin.ts
   - `RecordCollabRoom` unchanged
   - Bump peer range on `@pilotiq/pilotiq` to the new pilotiq minor
   - Pilotiq-pro playground migration: add `static collab = true` to `Post` resource + sample custom page with `collab = { room: ... }` for the smoke story
   - Tests + changeset

Order matters: PR 1 must publish to npm before PR 2 (pilotiq-pro consumes published pilotiq). Stage in lockstep.

3. **PR 3 — pilotiq.io docs sync:** update `content/docs/pro/collab.md` to show the opt-in usage. Search index rebuild.

---

## Open questions (answered as drafted)

- **Should `static collab = true` mean the 'edit' page only, or all collab-able pages?** → 'edit' only. View has no value-sync, Create has no recordId. Opt into others explicitly.
- **Can a Resource override the room id format?** → No, not in v1. Format stays `${slug}/${recordId}`. Custom pages get the explicit `room` field. Add a callback later if a real use case appears.
- **What about nested resources?** → They produce their own `/:id/edit` URLs once mounted in the parent's relation tab. The gate already resolves the *inner* slug from the URL, so the inner resource's `static collab` config applies independently. No extra work.
- **Should the plugin warn if no resource opts in?** → Probably yes, dev-only console warning: "@pilotiq-pro/collab is installed but no resource or page opts in via static collab. The plugin is a no-op." Catches the silent-misconfig case. Cheap.

---

## Risks & mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Downstream consumers miss the migration → silent loss of collab in production | Medium | BREAKING tag in changeset; explicit changelog entry; dev-only warning when plugin is installed but no opt-ins detected. |
| Custom-page `room` collision (two pages pick same literal) | Low | Document the convention `page:{slug}` in the JSDoc; collisions are user error and Yjs handles them gracefully (just merged docs, no crash). |
| Resource lookup in `RecordWrapperGate` adds render cost on every navigation | Negligible | Lookup is `panelInfo.resources.find(...)` on a small array; memoize by URL if it ever shows up in a profile. |
| Future allowlist API conflicts with `Field.collab(false)` precedence | Low | Document now: field-level always wins. Allowlist becomes a default for fields that don't set explicit `.collab()`. Same model Filament uses for `->hidden()` interactions. |
