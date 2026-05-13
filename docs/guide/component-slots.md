# Component slots

Component slots let you swap entire pieces of the panel chrome with a
custom React component instead of patching around it. Use a slot when
[render hooks](./render-hooks.md) can't reach far enough — render hooks
*splice* into named positions, while slots *replace* a whole region.

v1 ships the **`nav`** slot. Other slots (`header`, `footer`) will land
when a real consumer asks; the API shape is stable so additions don't
break this surface.

## Quick start

```ts
import { Pilotiq } from '@pilotiq/pilotiq'
// `.tsx` extension is intentional — see "Authoring `.tsx` inside the
// panel module" below for why.
import { MyCustomSidebar } from './MyCustomSidebar.tsx'

Pilotiq.make('admin').components({ nav: MyCustomSidebar })
```

The supplied component replaces:

- **`SidebarLayout`** — the entire `<SidebarMenu>` tree (the body of
  `<SidebarContent>`). The branding header, footer chrome, and sign-out
  menu stay.
- **`TopbarLayout`** — the `<nav>` cluster between the brand and the
  right-side controls (search, theme toggle, bell, user menu). When
  you replace the topbar nav, your component also owns the Dashboard
  link and theme-editor link the default cluster renders.

`render-hooks` (e.g. `panels::sidebar.nav.start` / `panels::sidebar.nav.end`)
still fire whether the nav is the framework default OR a custom slot
component — so plugins that just want to inject a header banner above
the nav don't fight with consumers that swap the whole nav.

## Component contract

```ts
import type { NavComponentProps, NavItem } from '@pilotiq/pilotiq/react'

export function MyCustomSidebar({ navigation, basePath, currentPath }: NavComponentProps) {
  // navigation: NavItem[] — pre-grouped, pre-sorted by panelInfo()
  // basePath:   string    — e.g. '/admin'
  // currentPath?: string  — current request pathname (undefined in unit-test contexts)
  return (/* … */)
}
```

`NavComponentProps`, `NavItem`, and `ComponentSlotRegistry` are
re-exported from `@pilotiq/pilotiq/react` alongside `isNavItemActive`
(see below).

### Active-link state

The framework's default sidebar highlights a nav item using a
longest-prefix match — the dashboard URL only matches on exact
equality, and non-dashboard URLs match as a prefix followed by `/` or
end-of-string so `/admin/users` doesn't activate when the user is on
`/admin/user` (singular).

Re-export to reuse the same semantics in your custom component:

```ts
import { isNavItemActive } from '@pilotiq/pilotiq/react'

const active = isNavItemActive(item.url, currentPath, basePath)
```

## Authoring `.tsx` inside the panel module

The Vite plugin loads your panel module (`app/Pilotiq/AdminPanel.ts`)
through `jiti` at boot so it can harvest `cfg.components` into the
`_components.ts` manifest. Two things to know if your custom component
lives in the panel module dir:

1. **jiti needs JSX support.** Already enabled — the plugin passes
   `jsx: { runtime: 'automatic' }` to `createJiti`. That matches the
   playground tsconfig's `"jsx": "react-jsx"` so you don't need to
   `import React from 'react'` in every component file.
2. **Use the literal `.tsx` extension in the import.** jiti's resolver
   falls through `.js` → `.ts` but NOT `.js` → `.tsx`. The playground
   tsconfig has `allowImportingTsExtensions: true` so TypeScript is
   happy with `import { MyCustomSidebar } from './MyCustomSidebar.tsx'`.

The alternative — registering the component via
`registerWidgetComponents` / `registerEntryComponents` from
`+Layout.tsx` — doesn't apply to slots, because slots need a real
component reference at panel-build time, not a registry name.

## Merge semantics

Calling `.components(...)` twice merges — the latest registration wins
per slot; unset keys preserve the prior value:

```ts
Pilotiq.make('admin')
  .components({ nav: A })
  .components({})          // empty object keeps existing
  .components({ nav: B })  // overrides — final nav is B
```

This makes it safe for a plugin's `register(panel)` to set the `nav`
slot without clobbering whatever the host app set previously on a
different (future) slot.

## Render hooks vs. slots

| Need | Use |
|---|---|
| Inject UI above / below / inside the nav region | Render hooks (`panels::sidebar.nav.start`, etc.) |
| Wrap the entire layout tree in a React provider | `Pilotiq.layoutProvider(C)` |
| Replace the whole nav body with your own component | `Pilotiq.components({ nav })` |
| Add chrome inside the topbar / sidebar but keep the default nav | Render hooks (`panels::topbar.start` / `panels::sidebar.footer` / …) |

A custom nav slot composes with render hooks — the surrounding
`panels::sidebar.start` / `panels::sidebar.footer` / `panels::topbar.start`
hooks all keep firing.

## Reference

- `Pilotiq.components(slots)` — `src/Pilotiq.ts`
- `NavComponentProps`, `isNavItemActive` — `@pilotiq/pilotiq/react`
- `componentSlotRegistry` build-time manifest — emitted by the Vite
  plugin alongside `componentRegistry` and `rightPanelRegistry`
- See also: [Render hooks](./render-hooks.md), [Right sidebar](./right-sidebar.md)
