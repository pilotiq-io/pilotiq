---
'@pilotiq/pilotiq': minor
---

feat(pilotiq): per-Resource collab opt-in — `Resource.collab` declarative config

Flips collab activation from "register the `@pilotiq-pro/collab` plugin
and every edit page collaborates" to "register the plugin and nothing
activates until a resource opts in." Today's `@pilotiq-pro/collab` keeps
working unchanged — only the gate that decides whether to mount the
record wrapper now consults per-resource opt-in.

### BREAKING — migration

Resources that currently get collab via the plugin's panel-wide
activation must add an explicit opt-in:

```diff
 class Post extends Resource {
+  static override collab = true
   // ...
 }
```

Two-line per resource. Without the flag, the record wrapper is not
mounted — collab fields render as plain inputs and presence chips do not
appear.

### New `static collab` field on `Resource`

```ts
class Post extends Resource {
  static override collab = true                                        // shorthand
  // or:
  static override collab = { pages: ['edit', 'view'], presence: false } // explicit
  // or:
  static override collab = false                                       // explicit opt-out
}
```

- `true` → defaults `{ pages: ['edit'], presence: true }` (the 90% case).
- Object form merges with defaults; only override what you need.
- Omitted / `false` → collab is off for the resource regardless of
  whether the plugin is registered.

`Resource.getResolvedCollabConfig()` normalizes the raw setting to
`ResourceCollabConfig | null` and is the function consumed by
`panelInfo()`. Override only if you need to compute the config
dynamically (rare).

### Field-level `.collab(false)` still wins

A resource opting in then opting individual fields out is the supported
shape — the field-level setting always overrides the resource-level
default.

### Wire-shape addition

`panelInfo()` now emits an optional `recordCollab: Record<URLSlug,
ResourceCollabConfig>` map (sparse — absent when no resource opted in).
Built from `cfg.resources` filtered by `R.getResolvedCollabConfig()`.
Keys are the same slug `parseRecordPageUrl` produces:
`${cluster.slug}/${R.slug}` for clustered resources, `${R.slug}` for
non-clustered.

### URL parser widened

- New `parseRecordPageUrl(path, base)` returns `{ resourceSlug,
  recordId, role: 'edit' | 'view' }`. Recognizes both `/edit` and
  `/view` terminal segments.
- `parseRecordEditUrl` kept as a thin back-compat wrapper that filters
  `role !== 'edit'` — existing consumers calling the legacy function see
  the same edit-only behavior.
- New `RecordPageRole` type exported alongside the existing
  `RecordEditIdentity`.

### `RecordWrapperGate` resource-aware

The gate now accepts an optional `recordCollab` map prop. Mount logic:

1. Resolve URL via `parseRecordPageUrl`.
2. Look up the slug in `recordCollab`.
3. If found AND the URL role is in `cfg.pages`, mount the
   plugin-registered wrapper.
4. Otherwise render `children` directly.

`AppShell` threads `panel.recordCollab` (from `panelInfo()`) through to
the gate. Existing plugins that registered via `registerRecordWrapper`
need no changes — the wrapper component contract is unchanged.

### v1 limitations (documented, not blocked)

- **Nested-relation edit URLs** (`/articles/:parentId/comments/:childId/edit`)
  carry a dynamic-id segment in the URL slug, so they don't match the
  resource-keyed `recordCollab` map. Collab on nested-relation edits is
  a follow-up.
- **Custom panel pages** (Dashboard / Settings / etc. registered via
  `Pilotiq.pages(...)`) have no per-page collab opt-in yet. Filed as a
  follow-up — needs a separate wrapper shape (literal `room` instead of
  `(slug, recordId)`) and URL-pattern disambiguation.

### Tested

- 2971/2971 pilotiq tests pass (was 2957; +14 new: `Resource.collab`
  normalization, `parseRecordPageUrl` view-URL coverage, `panelInfo`
  `recordCollab` emit).
