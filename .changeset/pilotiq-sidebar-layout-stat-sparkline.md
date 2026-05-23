---
'@pilotiq/pilotiq': minor
---

feat(pilotiq): sidebar layout options + palette-driven stat sparklines

- `Pilotiq.layout('sidebar', opts?)` is now overloaded so the sidebar chrome options bind to the `'sidebar'` mode: `variant: 'sidebar' | 'floating' | 'inset'`, `collapsible: 'offcanvas' | 'icon' | 'none'`, `side: 'left' | 'right'` (defaults `inset` / `icon` / `left`). `.layout('topbar', {...})` is a compile error so sidebar-only config can't silently no-op under topbar. The sticky page header gains `border-b bg-background/95 backdrop-blur`; the `md:rounded-t-xl` float applies only to `variant: 'inset'`.
- `StatsOverview` sparklines render as soft area-fills and default to the theme chart palette.
