# Component slots

Component slots let you swap entire pieces of the panel chrome with a
custom React component instead of patching around it. Use a slot when
[render hooks](./render-hooks.md) can't reach far enough — render hooks
*splice* into named positions, while slots *replace* a whole region.

Three slots ship today:

| Slot | Replaces |
|---|---|
| `nav` | The default nav tree (`<SidebarMenu>` body in `SidebarLayout`, the `<nav>` cluster in `TopbarLayout`). Surrounding chrome (branding header, render-hook splices, footer, sign-out menu) stays. |
| `header` | The entire `<header>` chrome bar. In `SidebarLayout` that's the top bar with search / theme / bell / user menu; in `TopbarLayout` it's the *whole* top region including the brand cluster AND the nav (the `nav` slot becomes irrelevant when you set `header` on TopbarLayout). |
| `footer` | Mounts a `<footer>` element below the main content area in both layouts. Separate from the `panels::footer` render hook, which keeps firing inside the content area for per-page trailing chrome. |

The API shape is open-ended so additional slots can land without
breaking this surface when a concrete consumer asks for them.

## Quick start

```ts
import { Pilotiq } from '@pilotiq/pilotiq'
// `.tsx` extensions are intentional — see "Authoring `.tsx` inside the
// panel module" below for why.
import { MyCustomSidebar } from './MyCustomSidebar.tsx'
import { MyTopBar }        from './MyTopBar.tsx'
import { MyFooter }        from './MyFooter.tsx'

Pilotiq.make('admin').components({
  nav:    MyCustomSidebar,
  header: MyTopBar,
  footer: MyFooter,
})
```

### `nav`

Replaces the default nav tree. Surrounding chrome (branding header,
sign-out menu, render hooks above and below the nav) stays. Use this
when you want a bespoke navigation tree but the rest of the panel
chrome is fine as-is.

### `header`

Replaces the entire `<header>` chrome bar. The consumer reimplements
whatever controls they want from inside it. Pilotiq's existing chrome
components are exported so you can drop them back in à la carte:

```tsx
import {
  SearchTrigger,
  ThemeToggle,
  NotificationBell,
  RightSidebarTrigger,
  UserMenu,
} from '@pilotiq/pilotiq/react'
```

> **Render hooks inside the default header do NOT fire when the header
> is replaced.** `panels::topbar.start`, `panels::topbar.end`,
> `panels::user-menu.before`, and `panels::user-menu.after` splice into
> the default header — once the header is gone, there's nowhere for
> them to splice into. If a plugin author relies on those splices, they
> can call `RenderHookSlot` themselves from inside the custom header:
>
> ```tsx
> import { RenderHookSlot } from '@pilotiq/pilotiq/react'
> // …
> <RenderHookSlot name="panels::topbar.start" hooks={panel.renderHooks} />
> ```

Hooks rooted outside the header (`panels::sidebar.start` / `.footer`,
`panels::sidebar.nav.start` / `.end`, `panels::footer`) keep firing
regardless.

### `footer`

Mounts a `<footer>` element below the main content area in both
layouts. Use this for site-chrome that frames every page — a status
bar, a copyright row, a build-version stamp. For per-page trailing
chrome (a "next steps" callout under one resource's list page),
prefer the `panels::footer` render hook — it fires *inside* the
scroll region.

## Component contracts

```ts
import type {
  NavComponentProps,
  HeaderComponentProps,
  FooterComponentProps,
  NavItem,
} from '@pilotiq/pilotiq/react'

export function MyCustomSidebar({ navigation, basePath, currentPath }: NavComponentProps) {
  // navigation: NavItem[] — pre-grouped, pre-sorted by panelInfo()
  // basePath:   string    — e.g. '/admin'
  // currentPath?: string  — current request pathname (undefined in unit-test contexts)
  return (/* … */)
}

export function MyTopBar({ navigation, basePath, currentPath }: HeaderComponentProps) {
  // Same shape as NavComponentProps so a topbar header that wants to
  // render the nav inline can do so without juggling two slots.
  return (/* … */)
}

export function MyFooter({ basePath, currentPath }: FooterComponentProps) {
  // Minimal shape — footers rarely need the nav tree. Compose with
  // page-aware UI by reading currentPath.
  return (/* … */)
}
```

`NavComponentProps`, `HeaderComponentProps`, `FooterComponentProps`,
`NavItem`, and `ComponentSlotRegistry` are re-exported from
`@pilotiq/pilotiq/react` alongside `isNavItemActive` (see below).

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
  .components({ nav: A, header: H })
  .components({})          // empty object keeps existing
  .components({ nav: B })  // overrides nav; header stays as H
```

This makes it safe for a plugin's `register(panel)` to set one slot
without clobbering whatever the host app set previously on the others.

## Render hooks vs. slots

| Need | Use |
|---|---|
| Inject UI above / below / inside the nav region | Render hooks (`panels::sidebar.nav.start`, etc.) |
| Wrap the entire layout tree in a React provider | `Pilotiq.layoutProvider(C)` |
| Replace the whole nav body with your own component | `Pilotiq.components({ nav })` |
| Replace the whole `<header>` chrome bar | `Pilotiq.components({ header })` |
| Add a panel-wide footer below the content area | `Pilotiq.components({ footer })` |
| Append per-page trailing chrome inside content | `panels::footer` render hook |
| Add chrome inside the topbar / sidebar but keep the default chrome | Render hooks (`panels::topbar.start` / `panels::sidebar.footer` / …) |

A custom `nav` slot composes with render hooks — the surrounding
`panels::sidebar.start` / `panels::sidebar.footer` / `panels::topbar.start`
hooks all keep firing. The `header` slot is the exception: render
hooks that splice *inside* the default header no longer fire (the
container is gone). Call `<RenderHookSlot name="…" hooks={panel.renderHooks} />`
yourself from inside a custom header if you want to preserve that
contract for plugin authors.

## Reference

- `Pilotiq.components(slots)` — `src/Pilotiq.ts`
- `NavComponentProps`, `HeaderComponentProps`, `FooterComponentProps`,
  `isNavItemActive` — `@pilotiq/pilotiq/react`
- `componentSlotRegistry` build-time manifest — emitted by the Vite
  plugin alongside `componentRegistry` and `rightPanelRegistry`
- See also: [Render hooks](./render-hooks.md), [Right sidebar](./right-sidebar.md)
