# Right sidebar

A second sidebar on the opposite side of the navigation, used by plugins
to mount panes — chat boxes, presence panels, document outlines,
inspectors, switchers. VS Code's *Secondary Side Bar* is the reference.

Pilotiq core ships the chrome (collapse toggle, drag-to-resize, tab
strip, mobile sheet, keyboard shortcut, per-basePath persistence);
plugins register their bodies through a single registry call.

## Quick start

```ts
import { Pilotiq } from '@pilotiq/pilotiq'
import { OutlinePanel } from './right-panels/OutlinePanel.tsx'

Pilotiq.make('admin')
  .rightPanel({
    id:           'outline',
    label:        'Outline',
    icon:         'list-tree',
    render:       OutlinePanel,
    defaultWidth: 280,
  })
```

That's it. The trigger button auto-mounts in the topbar between the
notification bell and the user menu; the body renders inside the
sidebar chrome the first time a user clicks it open.

To register multiple panels in one call, use `.rightPanels([…])`:

```ts
Pilotiq.make('admin')
  .rightPanels([
    { id: 'outline',  label: 'Outline',  render: OutlinePanel },
    { id: 'inspector', label: 'Inspector', render: InspectorPanel, sort: 10 },
  ])
```

Adapter packages typically expose a plugin factory that calls
`panel.rightPanel(...)` from inside `register(panel)` so consumers wire
everything via `.plugins([…])`:

```ts
// hypothetical @example/outline-plugin
export function outline(): PilotiqPlugin {
  return {
    name: '@example/outline-plugin',
    register(panel) {
      panel.rightPanel({
        id:     'outline',
        label:  'Outline',
        icon:   'list-tree',
        render: OutlinePanel,
      })
    },
  }
}

Pilotiq.make('admin').plugins([outline()])
```

## Body component contract

Each contribution's `render` receives `RightPanelProps`:

```ts
import type { RightPanelProps } from '@pilotiq/pilotiq'

export function OutlinePanel({ basePath, currentPath, activeId }: RightPanelProps) {
  return (
    <div className="p-4 text-sm">
      <p>You are at {currentPath ?? basePath}</p>
    </div>
  )
}
```

- `basePath` — the URL prefix the panel is mounted under (matches
  `AppShell.basePath`).
- `currentPath` — the live pathname; re-renders on SPA navigation so the
  body can react to which page the user is on.
- `activeId` — this contribution's id (useful when a single component
  is registered against multiple panels and shares state via context).

The body is mounted on first open and stays mounted while the panel is
visible; closing the panel unmounts it. Persist any per-session state
inside React refs, an outer provider, or `localStorage` if you need it
to survive open/close cycles.

## Programmatic open / close

Any descendant of the panel can drive the surface via `useRightSidebar()`
from `@pilotiq/pilotiq/react`:

```tsx
import { useRightSidebar } from '@pilotiq/pilotiq/react'

function PinThisPanel() {
  const sidebar = useRightSidebar()
  return (
    <button onClick={() => sidebar.setActiveId('inspector')}>
      Pin Inspector
    </button>
  )
}
```

Returned API:

| Field | Description |
|---|---|
| `open: boolean` | Whether the panel is currently open. |
| `setOpen(v)` | Open or close. |
| `toggle()` | Flip open/closed. |
| `activeId: string \| null` | Active contribution's id. |
| `setActiveId(id)` | Switch tabs (also opens the panel). |
| `width: number` | Current panel width in px. |
| `setWidth(px)` | Resize programmatically (clamped to bounds). |
| `contributions: RightPanelMeta[]` | All visible tabs for this panel. |
| `bounds: { min, max, default }` | Width clamps from server meta. |

Outside the sidebar tree (e.g., a topbar render hook), use
`useRightSidebarOptional()` — it returns `null` when no panel is
mounted, so the caller can render conditionally:

```tsx
import { useRightSidebarOptional } from '@pilotiq/pilotiq/react'

function CustomTrigger() {
  const sidebar = useRightSidebarOptional()
  if (!sidebar) return null
  return <button onClick={sidebar.toggle}>✨ Open assistant</button>
}
```

## Auth gating

Pass `canAccess(user)` to gate a contribution behind the panel-level
user resolver. The predicate runs through `panelInfo()` once per
request, mirroring the shape of `Resource.canAccess`:

```ts
panel.rightPanel({
  id:     'admin-tools',
  label:  'Admin tools',
  render: AdminToolsBody,
  canAccess: (user) => Boolean((user as any)?.isAdmin),
})
```

A failing or throwing predicate fails closed — the contribution drops
silently from the tab strip and the registry. Other contributions are
unaffected. The panel-level auth gate (`Pilotiq.guard()`) still runs
in front of every request; `canAccess` is purely a per-pane filter.

## Hidden contributions

Pass `hidden: true` to register a body without surfacing it on the tab
strip. Useful for "trigger-only" panels opened programmatically from
elsewhere in the panel:

```ts
panel.rightPanel({
  id:     'help-floater',
  render: HelpBody,
  hidden: true,
})

// then, from a render hook on the topbar:
function HelpButton() {
  const sidebar = useRightSidebarOptional()
  if (!sidebar) return null
  return (
    <button onClick={() => sidebar.setActiveId('help-floater')}>
      Help
    </button>
  )
}
```

If every registered contribution is `hidden: true`, the panel meta is
absent from `panelInfo()` and the chrome doesn't mount — make sure at
least one contribution is visible *or* one of your render hooks calls
`useRightSidebarOptional()` to reach the surface.

## Sort order

Tabs sort by `sort` ascending (default `100`); ties break by
registration order. The first visible contribution becomes the default
active tab when no localStorage value exists.

## Persistence

The panel persists three slots in `localStorage` under
`pilotiq.rightSidebar.<basePath>.<key>`:

- `.open` — `'true'` / `'false'`
- `.activeId` — the active contribution id
- `.width` — the user's last-set width in px

`<basePath>` is the panel's mount path (`/admin`, `/simple`, etc.) so a
multi-panel app keeps separate state per surface. Width writes happen
on `pointerup` only, so dragging doesn't churn `Storage` between
frames.

## Width bounds

Width clamps to `[240, 800]` px by default; the active contribution can
narrow the clamp by supplying `defaultWidth` (also clamped to that
range). Mobile (`< 768px`) collapses to a fixed-width sheet
(`min(20rem, calc(100vw - 3rem))`) — the resize handle is hidden.

## Keyboard shortcut

Mod+Shift+\ (Cmd+Shift+\ on macOS, Ctrl+Shift+\ elsewhere) toggles the
panel. The shortcut is owned by core and can't be reassigned by plugin
authors — it mirrors VS Code's *View: Toggle Secondary Side Bar*
default.

## Custom trigger placement

The default `RightSidebarTrigger` mounts in the topbar between the
notification bell and the user menu. To replace or relocate it, render
your own affordance via a render hook and call `useRightSidebarOptional()`
to drive open/close:

```ts
import { Heading } from '@pilotiq/pilotiq'

panel.renderHook('panels::topbar.end', () => [
  Heading.make('').components([CustomFloatingTrigger]),
])
```

The default trigger is always rendered alongside any custom one — they
both flip the same state, so two affordances on screen aren't a problem
unless you're tight on header real estate.

## Limitations (v1)

- One open tab at a time. Side-by-side multi-pane is on the v2 list.
- Tab order is registration-time only — no drag-to-reorder.
- Auth state is snapshotted per request; sign-in/out without a nav
  doesn't refresh the tab strip until the next page load.
- The right sidebar overlays content via `position: fixed` and
  compresses host content with a layout shim. Promotion to a "real"
  layout column (so content reflows down to the gutter) is deferred.

## Reference

- API plan: `docs/plans/right-sidebar.md`
- Tests: `packages/pilotiq/src/RightPanel.test.ts`
- Source: `packages/pilotiq/src/RightPanel.ts`,
  `packages/pilotiq/src/react/RightSidebar.tsx`,
  `packages/pilotiq/src/react/RightSidebarContext.tsx`,
  `packages/pilotiq/src/react/RightSidebarTrigger.tsx`
