---
name: Icon system
description: Component-ref icons for class-static fields + string registry for schema-time icons. Prereq for Plan #9 (resource-navigation).
type: plan
---

# Icon system

Cross-cutting plan that lands the icon plumbing for the whole framework.
Prereq for Plan #9 (`resource-navigation.md`) — that plan needs
`Resource.icon: ComponentType` to work — and unblocks Plan #2 (column
types, the `IconColumn` story) for cleanup.

**Status:** ✅ DONE — shipped 2026-04-30. Tests went from 485 → 496
(+11). Verified end-to-end in `playground-pilotiq`: component-typed
`ArticleResource.icon = Newspaper` renders via the build-time
`_components.ts` manifest; string-typed `Action.icon('check')` renders
via `registerIcons(lucideIcons)`. SPA `index.pageContext.json`
serializes cleanly (no `__VIKE__NOT_SERIALIZABLE__`).

Estimated effort: ~1 day. Touches the Vite plugin, `react/SchemaRenderer`,
the auto-gen `+Layout.tsx`, every primitive that takes an icon, and adds
a small new public API (`registerIcons`, `lucideIcons` baseline).

## Why we want it

Today `react/SchemaRenderer.tsx` hardcodes a 14-icon `ICON_REGISTRY` map.
Every new icon a user wants to reference (`Resource.icon = 'newspaper'`,
`Action.icon('send')`, etc.) requires an upstream pilotiq edit OR forces
us to ship all 1,500 lucide icons in the bundle. Neither is acceptable.

The replacement has two requirements:

1. **Tree-shakable** — users only bundle what they reference.
2. **Ergonomic** — for the common case (Resource icon), they just import
   from lucide and assign. No config dance.

Two surfaces require different solutions:

- **Class-static fields** (`Resource.icon`, `Page.icon`, `Global.icon`,
  `navigationIcon`): fields on subclasses, statically discoverable from
  the user's panel module → can take a **component reference**.
- **Schema-time fields** (`Action.icon('send')`, `Column.icon(...)`,
  `IconColumn.options(...)`, `EmptyState.icon`, `Notification.icon()`,
  `ListTab.icon()`, `Tab.icon()`): constructed inside `form()` /
  `table()` callbacks at request time, not statically discoverable →
  stay **strings** + user-extensible registry.

Both surfaces matter. The split is ergonomics-driven, not philosophical.

## API — class-static fields

User imports the icon and assigns it. No registration step.

```ts
// app/Pilotiq/Articles/ArticleResource.ts
import { Newspaper } from 'lucide-react'
import { Resource } from '@pilotiq/pilotiq'

export class ArticleResource extends Resource {
  static label = 'Articles'
  static icon  = Newspaper                  // ← component reference

  // Plan #9 nav fields (when icon-system + resource-navigation both land):
  static navigationIcon  = Newspaper
  static navigationGroup = 'Content'
}
```

`Resource.icon` (and the rest) types as `ComponentType<{ className?: string }> | string`. String is supported for back-compat and registry-resolved icons; component is preferred.

### vite.config.ts — zero changes (convention default)

The plugin auto-discovers panels from the convention path
`app/Pilotiq/AdminPanel.ts` (the same path the playgrounds use). User
config stays exactly as it is today:

```ts
// playground-pilotiq/vite.config.ts (UNCHANGED)
plugins: [
  pilotiq(),                                  // ← still no args
  rudderjs(),
  tailwindcss(),
  react(),
]
```

**Resources are registered exactly once** — in `AdminPanel.ts` via
`Pilotiq.make().resources([...])`. The runtime provider
(`bootstrap/providers.ts → pilotiq([pilotiqAdmin])`) and the build-time
icon manifest (this Vite plugin) both read from that same module. No
double registration.

For non-standard layouts, opt-in override:

```ts
pilotiq({ panels: ['./src/admin/panels.ts'] })   // escape hatch only
```

`panels` is `string | string[]`. Default
`['./app/Pilotiq/AdminPanel']`.

### What the plugin does

At config time, the plugin:

1. Resolves each `panels` path and imports it (Vite already does ESM-in-Node
   fine — this is how `vike` reads `+config.ts`).
2. Walks the module's exports for `Pilotiq` instances (objects with
   `getConfig()` returning `{ resources, globals, pages }`).
3. Collects every Resource/Global/Page class across all instances.
4. Emits `pages/(pilotiq)/_components.ts`:

   ```ts
   // AUTO-GENERATED — do not edit
   export { ArticleResource    } from '../../app/Pilotiq/Articles/ArticleResource'
   export { CategoryResource   } from '../../app/Pilotiq/Categories/CategoryResource'
   export { SiteSettings       } from '../../app/Pilotiq/AdminPanel'
   export { SimplePage         } from '../../app/Pilotiq/pages/SimplePage'
   ```

5. Updates the auto-gen `+Layout.tsx` to import `_components.ts`, build a
   `name → class` map, and pass it to `AppShell` so the renderer can
   resolve `panel.navigation[].icon` (which on the wire is just a class
   name) to the actual component for rendering.

### Constraint: panel files must be import-safe

The plugin imports `AdminPanel.ts` at config time. Top-level code in panel
files must not run server-only logic (`node:fs`, db queries, etc.). The
existing pattern — builder calls + class definitions — already satisfies
this. We document it as a constraint with an inline check: if importing
the panel file throws, fail the build with a pointer to the rule.

## API — schema-time fields

Strings + a user-extensible client-side registry.

```ts
// app/Pilotiq/icons.ts (or anywhere imported once at app boot)
import { Send, Trash, Archive } from 'lucide-react'
import { registerIcons } from '@pilotiq/pilotiq/icons'

registerIcons({ send: Send, trash: Trash, archive: Archive })
```

```ts
// inside a table() / form() callback
Action.make('publish').icon('send')
Action.make('archive').icon('archive').color('warning')
```

### Baseline registries — opt-in, multi-library

Pilotiq ships baseline registries for **all four libraries** declared in
`theme.iconLibrary`. Each is a curated map of ~150 common admin-panel
glyphs (chevrons, check/x, edit/trash/archive/eye/eye-off, common nouns:
user/users/file/folder/calendar/bell/inbox/etc.) keyed by canonical
names.

```ts
import { registerIcons } from '@pilotiq/pilotiq/icons'

// Pick one — switching libraries is one import line
import { lucideIcons   } from '@pilotiq/pilotiq/icons/lucide'
import { tablerIcons   } from '@pilotiq/pilotiq/icons/tabler'
import { heroicons     } from '@pilotiq/pilotiq/icons/heroicons'
import { phosphorIcons } from '@pilotiq/pilotiq/icons/phosphor'

registerIcons(tablerIcons)              // panel uses tabler for string-based icons
```

Each baseline is its own entry point so unused libraries aren't bundled.
Mix and match works because `registerIcons` is a plain merge:

```ts
registerIcons({ ...tablerIcons, skull: SkullFromLucide })
```

### Multi-library — class-static fields are library-agnostic for free

The component-ref path doesn't care which library you import from:

```ts
import { IconNewspaper } from '@tabler/icons-react'
class ArticleResource extends Resource {
  static icon = IconNewspaper           // tabler — works
}

import { Newspaper } from 'lucide-react'
class UserResource extends Resource {
  static icon = Newspaper                // lucide — also works
}
```

The Vite plugin re-exports class refs without inspecting components.
Mixing libraries within a single panel is fully supported.

### `theme.iconLibrary` for v1

Today this field is dead config. With this plan it becomes a
**theme-editor preview hint** — the editor shows example glyphs from
the matching library so users can see what they're getting. **No
runtime auto-loading.** Whatever the user `registerIcons()`-es is what
renders. Auto-loading the matching baseline based on
`theme.iconLibrary` is a Tier-2 follow-up — convenient but adds a
magic side effect we're not paying for yet.

### Pilotiq's own chrome

Built-in chrome (toaster, sidebar trigger, calendar nav, sheet close,
checkbox tick, select chevron, filter button, action overflow menu,
default empty-state inbox) keeps direct lucide imports. ~20 icons total,
non-negotiable, never depend on the user registry.

## Wire format

Both surfaces serialize as **strings** through `viewProps`:

| Surface | String value | Resolved at render via |
|---|---|---|
| `Resource.icon`, `Page.icon`, `Global.icon`, `navigationIcon` | Class name (e.g., `'ArticleResource'`) | `_components.ts` manifest from Vite plugin |
| `Action.icon`, `Column.icon`, etc. | User-supplied name (e.g., `'send'`) | `registerIcons()` runtime registry |

The renderer has a single `resolveIcon(name, ctx)` helper that tries the
component manifest first (when `ctx` carries it from the layout), then
the runtime registry, then a fallback `<CircleIcon />` with a dev-mode
`console.warn` naming the unresolved key.

## Implementation

1. **`src/icons/registry.ts`** — `registerIcons(map)`, `getIcon(name)`,
   `useIcon(name)` hook. Pure runtime; no Vite plugin involvement.
2. **`src/icons/lucide.ts` / `tabler.ts` / `heroicons.ts` / `phosphor.ts`** —
   curated baseline maps, ~150 glyphs each, keyed by canonical names.
   Each re-exports component refs from its respective React package.
   All four ship; users opt in via separate entry points so unused
   libraries tree-shake cleanly.
3. **`src/icons/index.ts`** — public entry: `registerIcons`, `getIcon`,
   `useIcon`, `IconType` type alias. Wired up as
   `@pilotiq/pilotiq/icons` package export. Each baseline is its own
   sub-export: `@pilotiq/pilotiq/icons/{lucide,tabler,heroicons,phosphor}`.
4. **`src/vite.ts`** — extend `PilotiqVitePluginOptions` with
   `panels?: string | string[]`. Default `['./app/Pilotiq/AdminPanel']`
   (convention; users with that path do nothing). At config time:
   - Import each panel module via `vite-node` (same approach Vite uses
     for SSR config files) or plain dynamic `import()`.
   - Walk exports for `Pilotiq` instances (duck-typed: has
     `getConfig().resources`).
   - Collect all class refs; de-duplicate by class name.
   - Emit `pages/(pilotiq)/_components.ts` re-export module.
   - Wire `+Layout.tsx` template to import `_components.ts` and pass
     the map to `AppShell`.
5. **`src/react/AppShell.tsx`** — accept `componentRegistry?:
   Record<string, ComponentType>` prop. Pass through to layouts.
6. **`src/react/layouts/SidebarLayout.tsx` / `TopbarLayout.tsx`** —
   replace string-based icon rendering with `resolveIcon(panel.navigation[i].icon, ctx)`. Use the manifest map for class-name keys.
7. **`src/react/SchemaRenderer.tsx`** — replace `ICON_REGISTRY` with
   `getIcon(name)`. Drop the 14-icon hardcoded map. Built-in chrome
   keeps direct imports.
8. **Per-primitive type updates** — `Resource.icon`, `Page.icon`,
   `Global.icon`, `navigationIcon` widen from `string` to
   `string | ComponentType`. `panelInfo()` serializes a class as its
   name string. Schema-time builders (`Action.icon()`, etc.) keep
   `string` typing — no change.
9. **Tests:**
   - `icons/registry.test.ts` — register/lookup/fallback.
   - `vite.test.ts` — plugin emits `_components.ts` matching panel
     contents; importing a non-existent panel path fails with a
     useful error; multiple panels merge.
   - `pageData.test.ts` — class-typed `Resource.icon` serializes as
     class name; string-typed still passes through.
10. **Playground demo** — `ArticleResource.icon = Newspaper` (component);
    `Action.icon('send')` (string + registered). Both render correctly.
11. **Docs** — section in `migrating-from-panels.md`. Update CLAUDE.md
    `Resource.ts` / `Action.ts` / vite plugin / SchemaRenderer bullets.

## What landed (2026-04-30 ship-notes)

A few details worth recording for next-session pickup:

- **Manifest strategy** — the plugin imports the user's panel module via
  `jiti` (added as a `@pilotiq/pilotiq` dep), discovers exported
  `Pilotiq` instances by `getConfig()` duck-typing, and emits
  `pages/(pilotiq)/_components.ts`. The manifest **doesn't re-export
  classes by name** (would require user re-exports in AdminPanel.ts);
  instead it imports the panel instances, walks `getConfig()` at
  module-init time, and stamps every Resource/Global/Page class into
  `componentRegistry[ClassName]`. Zero re-exports needed in user code.
- **forwardRef gotcha** — lucide / tabler / heroicons all ship icons as
  `React.forwardRef(...)` objects, not plain functions. Both
  `serializeIcon` (server) and `useIconFor` (client) accept
  `typeof === 'function' || typeof === 'object'` to cover them. See
  `feedback_forwardref_icons_serialize.md`.
- **Serialization-leak audit** — every callsite that ships an icon to
  viewProps must call `serializeIcon`. Initially missed six sites in
  `pageData.ts` (`resource:` / `global:` field on each per-page-role
  builder) plus `Page.toMeta()`. Symptom: vike SPA fetch returned
  `__VIKE__NOT_SERIALIZABLE__` for both `viewProps` and `data` even
  though SSR HTML rendered fine.
- **Baselines** — only `@pilotiq/pilotiq/icons/lucide` shipped (~150
  curated names). Tabler / heroicons / phosphor entries declared in
  this plan but not yet implemented; require optional peer deps. Add
  when demanded.

## Out of scope (for v1)

- **Filesystem-glob auto-discovery** (scan `app/**/*Resource.ts`).
  Decided against — convention path (`app/Pilotiq/AdminPanel.ts`) +
  reading the `Pilotiq.make()` builder is more explicit, deadcode-safe
  (only exported resources end up in the manifest), and re-uses
  registrations the user already wrote.
- **`registerIcons()` from server.** Registration is client-side only;
  schema-time icon strings serialize fine without a server registry.
  If anyone needs server-side icon resolution (e.g., for SVG-only
  output), revisit.
- **Per-panel icon override.** All panels in a process share one icon
  manifest. Edge case — fold in only if it bites.
- **Icon library auto-detection from `theme.iconLibrary`.** With this
  plan the field becomes a theme-editor preview hint only. Auto-loading
  the matching baseline at boot based on `theme.iconLibrary` is a
  Tier-2 follow-up — convenient but adds a magic side effect not worth
  paying for in v1.
- **Library-swappable chrome.** Pilotiq's own ~20 chrome icons stay on
  lucide for v1 (hardcoded direct imports — must work before any user
  registration). Making chrome icons resolve through the registry so a
  full panel can be tabler-only is a Tier-2 follow-up.

## Risks / non-obvious

- **Vite plugin importing user code at config time.** Already a
  documented Vite pattern (`vite-node`). Risk: panel files that do
  server-only work at import time fail the build. Mitigated by
  documenting the "import-safe" constraint and making the failure
  message useful.
- **Class name as identifier.** `Resource.icon` serializes as the JS
  class name (`'ArticleResource'`). Minified bundlers can mangle class
  names — but `panelInfo()` runs server-side, so the class name read
  via `R.name` reflects the server-bundle name. Document the
  constraint: don't `terser` mangle class names in the server bundle.
  In practice nobody does for SSR builds.
- **Two manifests at once.** Component manifest (build-time, class-name
  keys) + runtime registry (user-registered, schema-time keys). They
  share `resolveIcon()` and don't collide because the keys come from
  different sources, but the indirection is real. Keep `resolveIcon()`
  small and obviously-correct.
- **Vite SSR module dup** (per `feedback_vite_ssr_module_dup_instanceof.md`).
  `_components.ts` re-exports user classes; the manifest is keyed by
  string class names so duplicate-class-identity is irrelevant. No
  `instanceof` checks happen on this path.
- **HMR.** Adding a new resource to `AdminPanel.ts` requires
  regenerating `_components.ts`. The plugin must watch panel files and
  re-emit on change. Without HMR support, dev-mode resource additions
  silently 404 the icon. Build-step in plugin's `handleHotUpdate`.

## Migration

Existing string-based `Resource.icon = 'newspaper'` keeps working as
long as the user registers `'newspaper'` via `registerIcons()` (or imports
the `lucideIcons` baseline). No forced rewrite. Component-style is
preferred for new code; old code keeps running.
