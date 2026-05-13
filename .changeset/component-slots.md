---
'@pilotiq/pilotiq': minor
---

feat(pilotiq): `Pilotiq.components({ nav, header, footer })` chrome slots

Three new chrome-slot overrides let a panel swap an entire region of
the default layout for a custom React component, alongside the
existing render-hook splicing surface. Use slots when render hooks
can't reach far enough — slots *replace* a whole region; hooks
*splice* at named positions.

```ts
import { Pilotiq } from '@pilotiq/pilotiq'
import { MyCustomSidebar } from './MyCustomSidebar.tsx'
import { MyTopBar }        from './MyTopBar.tsx'
import { MyFooter }        from './MyFooter.tsx'

Pilotiq.make('admin').components({
  nav:    MyCustomSidebar,
  header: MyTopBar,
  footer: MyFooter,
})
```

### Slots

- **`nav`** — replaces the default nav tree. In `SidebarLayout`
  that's the `<SidebarContent>` body (`<SidebarMenu>` tree); in
  `TopbarLayout` it's the `<nav>` cluster between the brand and
  the right-side controls. Surrounding chrome (branding header,
  render-hook splices, footer, sign-out menu) stays.
- **`header`** — replaces the whole `<header>` chrome bar. In
  `SidebarLayout` that's the top bar with search / theme / bell /
  user menu; in `TopbarLayout` it's the whole top region including
  the brand cluster AND the nav (setting `header` makes the `nav`
  slot irrelevant there).
- **`footer`** — mounts a `<footer>` element below the main content
  area in both layouts. Separate from the `panels::footer` render
  hook, which keeps firing INSIDE the content area for per-page
  trailing chrome.

### Prop contracts

`nav` and `header` both receive `{ navigation, basePath, currentPath? }`
(matching `NavComponentProps` / `HeaderComponentProps`) — same
pre-grouped, pre-sorted nav tree the default renderers consume, so a
custom topbar can render its own nav inline without juggling two
slots. `footer` receives the minimal `{ basePath, currentPath? }`.

### Render-hook caveat for `header`

Hooks rooted *inside* the default header — `panels::topbar.start`,
`panels::topbar.end`, `panels::user-menu.before`,
`panels::user-menu.after` — do NOT fire when the header is replaced
(the surrounding container is gone). Hooks rooted outside
(`panels::sidebar.*`, `panels::footer`, `panels::sidebar.nav.*`) keep
firing. Consumers rebuilding the header can mount
`<RenderHookSlot name="…" hooks={panel.renderHooks} />` themselves
from inside the custom component to preserve the splice contract for
plugins.

### Chrome components exported for rebuilding headers

`SearchTrigger`, `ThemeToggle`, `NotificationBell`,
`RightSidebarTrigger`, and `UserMenu` are all re-exported from
`@pilotiq/pilotiq/react` so a `header` slot consumer can drop the
default controls back in à la carte rather than reimplementing every
one. `HeaderComponentProps`, `FooterComponentProps`, and
`isNavItemActive` are also re-exported alongside the existing
`NavComponentProps` and `ComponentSlotRegistry`.

### Authoring `.tsx` inside the panel module

The Vite plugin loads `app/Pilotiq/AdminPanel.ts` through `jiti` at
boot to harvest `cfg.components` into the build-time
`_components.ts` manifest. To make this play nicely with `.tsx`
component files alongside the panel module, the jiti loader now
enables JSX support (`jsx: { runtime: 'automatic' }`). Two gotchas to
know:

1. JSX support is enabled by default — no per-file `import React from 'react'`
   needed when authoring `.tsx` panel-adjacent files.
2. jiti's resolver falls through `.js` → `.ts` but NOT `.js` → `.tsx`.
   The import in the panel module must use the literal `.tsx`
   extension: `import { MyCustomSidebar } from './MyCustomSidebar.tsx'`.
   `allowImportingTsExtensions: true` in your tsconfig keeps TS happy.

See `docs/guide/component-slots.md` for the full guide.
