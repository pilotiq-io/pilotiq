# Right Sidebar (plugin-extensible secondary panel)

A second sidebar on the opposite side of the navigation, used by plugins
to mount panes (chat, presence, inspectors, switchers). VS Code's
"Secondary Side Bar" is the reference. Pilotiq core ships the chrome
(toggle, drag-to-resize, tab strip, persistence); plugins register
contributions.

This plan is scoped to **pilotiq core only**. The pilotiq-pro AI package
is the first real consumer but lives in a separate repo and is *not*
covered here. Where the AI package's existing chat UI shape might
constrain a decision, that's called out.

---

## Why a first-class registry, not render hooks

Render hooks (`Pilotiq.renderHook('panels::sidebar.right.start', …)`)
were considered and rejected:

- No contribution model — first plugin wins or contributions stack
  vertically with no chrome.
- Each plugin would re-implement open/close + resize + persistence.
- Sharing the same surface across plugins (AI chat + collab presence +
  workspaces switcher) requires negotiated geometry; render hooks have
  no negotiation surface.

Pilotiq has precedent for first-class registry chrome:
`Pilotiq.userMenuItems(...)`, `Pilotiq.databaseNotifications()`,
`Pilotiq.signOut(url)`, `panel.dashboard(P)`. The right sidebar is the
same kind of surface.

---

## Public API

```ts
import type { ComponentType } from 'react'
import type { IconValue } from '@pilotiq/pilotiq/icons'

export interface RightPanelContribution {
  /** Stable id, e.g. 'ai.chat'. Doubles as localStorage key segment and
   *  the active-tab token in panelInfo. Required, unique per panel. */
  id: string
  /** Tab strip label. Auto-derived from id if absent. */
  label?: string
  /** Tab strip icon (string registry name OR component). */
  icon?: IconValue
  /** Body component. Receives `RightPanelContext` props. Must be
   *  client-imported (Vite plugin will _components.ts it). */
  render: ComponentType<RightPanelProps>
  /** Default open width in px. Clamped [240, 800]; default 360. */
  defaultWidth?: number
  /** Optional auth gate — same UserResolver shape as Resource.canAccess. */
  canAccess?: (user: unknown) => boolean | Promise<boolean>
  /** Hide the contribution entirely from the tab strip. Default false.
   *  Useful for "trigger only" panels — open programmatically. */
  hidden?: boolean
  /** Order hint for the tab strip; lower first. Default 100. */
  sort?: number
}

export interface RightPanelProps {
  /** Path-prefix the panel is mounted under (matches AppShell.basePath). */
  basePath: string
  /** Live current pathname — re-renders on SPA nav. Lets the body react
   *  to which page the user is on (record id, resource slug, etc). */
  currentPath?: string
  /** Active tab id (this contribution's id when mounted). Useful for
   *  consumers that share state across multiple panels via context. */
  activeId: string
}
```

Builder methods on `Pilotiq`:

```ts
class Pilotiq {
  // …existing members…

  /** Register a single right-sidebar contribution. */
  rightPanel(contribution: RightPanelContribution): this

  /** Bulk variant — `.rightPanels([{...}, {...}])`. */
  rightPanels(list: RightPanelContribution[]): this
}
```

Naming rationale: `rightPanel` matches `userMenuItems` /
`databaseNotifications` / `dashboard` (verb-on-builder + noun). Avoid
`registerRightPanel` because the rest of the builder doesn't say
"register".

### Why expose a hook for plugin authors

Plugins shipped as adapter packages (or in the future, pro packages)
expose a factory that goes inside `.plugins([…])`:

```ts
// hypothetical @pilotiq-pro/ai
export function ai(): PilotiqPlugin {
  return {
    name: '@pilotiq-pro/ai',
    register(panel) {
      panel.rightPanel({
        id: 'ai.chat',
        label: 'AI Assistant',
        icon: 'sparkles',
        render: AiChatPanelBody,
        defaultWidth: 360,
      })
    },
  }
}
```

Plugin contract stays consistent with the cont'd¹³ work — adapters live
behind `.plugins([…])`.

---

## Where panel state lives

State is split between server (`panelInfo()` meta) and client
(localStorage + React).

### Server-side (`panelInfo()`)

`PilotiqPanelInfo` gains a sparse field:

```ts
{
  // existing: navigation, userMenu, databaseNotifications, themeEditor, renderHooks
  rightSidebar?: RightSidebarMeta
}

export interface RightSidebarMeta {
  /** Per-tab metadata (after canAccess + auth gates). */
  panels: RightPanelMeta[]
  /** Fallback width when localStorage has no value. */
  defaultWidth: number      // px, clamped 240-800
  /** Min/max for the resize handle. */
  minWidth: number          // 240
  maxWidth: number          // 800
}

export interface RightPanelMeta {
  id: string
  label: string             // resolved (auto-derived from id if absent)
  icon?: SerializedIcon     // same shape as nav icons
  defaultWidth: number      // contribution-level override or rolls up
}
```

Sparse: `rightSidebar` is **absent** from `panelInfo()` when

- no contributions registered, OR
- every registered contribution failed `canAccess(user)`, OR
- every registered contribution is `hidden: true` AND no programmatic
  open is wired up.

`buildRightSidebarMeta(cfg, user)` (new helper next to
`buildDatabaseNotificationsMeta` in `pageData.ts`) runs `canAccess` in
parallel via `Promise.all`, drops failures (errors swallow,
fail-closed), sorts by `sort`, then by `id` as a stable tiebreaker.

The `render` component reference does **not** ship over the wire —
that's an icon-class problem solved the same way `Resource.icon` is:
contributions ride through the Vite plugin's `_components.ts` manifest
keyed by `id`. The renderer looks up the React component at mount
time.

### Vite plugin: `_components.ts` manifest

`pilotiq()` Vite plugin already emits a `componentRegistry` for
icon-bearing classes. Extend the same emitter to write a parallel
`rightPanelRegistry`:

```ts
// pages/(pilotiq)/_components.ts
export const rightPanelRegistry: Record<string, ComponentType<RightPanelProps>> = {
  'ai.chat': AiChatPanelBody,
}
```

Keyed on contribution `id`. The plugin walks each panel's
`getRightPanelContributions()` and emits one entry per `id` whose
`render` references a non-anonymous component. (For inline components,
a console warning at boot suggests extracting to a named export.)

### Client-side persistence

```
pilotiq.rightSidebar.<basePath>.open       'true' | 'false'
pilotiq.rightSidebar.<basePath>.width      px (number string)
pilotiq.rightSidebar.<basePath>.activeId   contribution id
```

Per-panel keys (mirror of `databaseNotifications`'s
`pilotiq.notifications:<basePath>` pattern). The basePath segment
prevents a multi-panel app (`/admin` + `/simple`) from sharing state.

Defaults when no value:

- `open` → `false` (collapsed by default; opens on first explicit click
  or programmatic call).
- `width` → server's `RightSidebarMeta.defaultWidth` (or the active
  contribution's own `defaultWidth` when available — narrower of the
  two wins).
- `activeId` → first contribution by `sort`/id order.

### Programmatic control (for plugin internals)

```ts
// from '@pilotiq/pilotiq/react'
export function useRightSidebar(): {
  open:        boolean
  setOpen:     (v: boolean) => void
  activeId:    string | null
  setActiveId: (id: string) => void
  width:       number
  setWidth:    (px: number) => void
  contributions: RightPanelMeta[]   // current panel's tabs
}
```

Plugins call `useRightSidebar()` from inside their `render` body or
from any descendant component. Mirrors the `useToast` /
`useFormState` / `useCommandPaletteOpener` pattern.

---

## AppShell layout shift

Today (`SidebarLayout`):

```
SidebarProvider
├── Sidebar         (left nav, collapsible="icon")
└── SidebarInset    (header + main content)
```

After:

```
SidebarProvider
├── Sidebar              (left nav)
├── SidebarInset         (header + main content)
└── RightSidebar         (NEW — only when meta.rightSidebar present)
```

Mounted as a **sibling** of `SidebarInset` rather than nested inside
it. SidebarProvider's grid template is widened from
`[sidebar inset]` to `[sidebar inset rightSidebar]` so the inset
flexes between the two.

Two reasons for the sibling shape:

1. The rail-style left sidebar lives on `<SidebarProvider>`, not
   `<SidebarInset>`. Putting the right sidebar inside the inset would
   double-nest scroll containers and break the existing sticky
   header.
2. The pro AI package's current `AiChatPanel` uses
   `position: fixed; inset-y-0; right: 0` with a "gap" div to push
   content. We want to *replace* that ad-hoc pattern with a real
   layout column, but the pro package's component should drop into
   the slot without re-implementing positioning. So the chrome lives
   in core, the body slots in.

`TopbarLayout` gets the same shift: today it's `<header><main>`; after
it becomes `<header><main + rightSidebar grid>`. The right sidebar is
identical chrome across both layout modes — the right-sidebar
component is mounted by `AppShell` once and rendered after the layout
returns, not by each layout duplicating it.

### Mobile

Below `md:` (matches today's nav-sidebar breakpoint), the right
sidebar becomes a `<Sheet>` (the same shadcn primitive the pro AI
package already uses). Tap a tab in the topbar → sheet slides in from
the right; tap-away closes. Width on mobile is fixed at
`min(20rem, calc(100vw - 3rem))` — no resize handle.

### Trigger affordances

A toggle button mounts in the topbar's right cluster, between
`NotificationBell` and `UserMenu`:

```tsx
<RightSidebarTrigger meta={panel.rightSidebar} />
```

Trigger renders only when `panel.rightSidebar` is present. Two visual
modes:

- **Single contribution** — single icon button (the contribution's
  icon). Toggles open/close.
- **Multiple contributions** — same icon button when collapsed; when
  open, the tab strip already shows all tabs, so the button just
  collapses.

Keyboard shortcut: **`Mod-Shift-\`** (mirrors VS Code's secondary
side bar shortcut). The shortcut is owned by core, not by plugin
authors — stops contributions fighting for the same key.

The `RightSidebarTrigger` exports a default version mounted by
`SidebarLayout` / `TopbarLayout`. Plugins that want a *different*
trigger placement (e.g., a floating bottom-right "✨" button for the
AI package) can call `useRightSidebar()` and roll their own — that's
opt-in, not the default.

---

## Resize handle

A 4px-wide vertical strip on the **left edge** of the right sidebar.
Hovering reveals a 1px highlight; dragging adjusts width. Same
mechanic the Tiptap custom-block side panel already ships
(`packages/tiptap/src/react/BlockSidePanel.tsx`'s width-memory
helper) — extracted into `react/useResizableWidth.ts` so both
features share it.

`clampPanelWidth(value, { min, max, default })` is exported from
`react/useResizableWidth.ts` for tests.

Width persists to localStorage on `pointerup`, not on every drag pixel
(no Storage churn).

---

## File plan (new + modified)

**New (8):**

```
packages/pilotiq/src/RightPanel.ts                       # builder type + canAccess gate
packages/pilotiq/src/rightSidebarMeta.ts                 # buildRightSidebarMeta() helper
packages/pilotiq/src/react/RightSidebar.tsx              # outer chrome (open state, tab strip, resize)
packages/pilotiq/src/react/RightSidebarTrigger.tsx       # topbar toggle button
packages/pilotiq/src/react/RightSidebarContext.tsx       # useRightSidebar() hook + provider
packages/pilotiq/src/react/useResizableWidth.ts          # extracted from Tiptap BlockSidePanel
packages/pilotiq/src/RightPanel.test.ts                  # canAccess gating, sort order, sparse meta
packages/pilotiq/src/react/RightSidebar.test.tsx         # only if we add jsdom; otherwise skip
docs/guide/right-sidebar.md                              # consumer docs
```

**Modified (8):**

```
packages/pilotiq/src/Pilotiq.ts                          # +rightPanel() / +rightPanels()
packages/pilotiq/src/pageData.ts                         # call buildRightSidebarMeta in panelInfo()
packages/pilotiq/src/react/AppShell.tsx                  # mount RightSidebar at AppShell level
packages/pilotiq/src/react/layouts/SidebarLayout.tsx     # add RightSidebarTrigger to topbar cluster
packages/pilotiq/src/react/layouts/TopbarLayout.tsx      # same
packages/pilotiq/src/vite.ts                             # emit rightPanelRegistry in _components.ts
packages/pilotiq/CLAUDE.md                               # +"Right sidebar" subsection in Plugin system
docs/packages/pilotiq/index.md (or sidebar guide)        # link to new guide
packages/tiptap/src/react/BlockSidePanel.tsx             # adopt the extracted useResizableWidth
```

Tiptap touch is a small refactor: it already has the same resize
logic; extracting to a shared helper keeps the Tiptap side-panel and
the new right sidebar in sync. **Optional** for the first ship — can
defer if the shared helper looks like a bigger change than expected.

---

## Phases

Implement in 4 phases so the surface is testable at each step.

### Phase A — builder + meta (server-only, ~1h)

- `Pilotiq.rightPanel({…})` and `Pilotiq.rightPanels([…])` on the
  builder; reject duplicate ids at boot.
- `buildRightSidebarMeta(cfg, user)` in `pageData.ts` parallel to
  `buildDatabaseNotificationsMeta`.
- `panelInfo()` returns `rightSidebar?: RightSidebarMeta` (sparse).
- Tests for: dup-id boot error, `canAccess` gate (gate fails →
  contribution dropped), `sort` ordering, all-failed → sparse
  (`rightSidebar` absent), error swallowed (one throwing canAccess
  doesn't kill the others).

No client work yet. `panel.rightSidebar` shows up in viewProps but
nothing renders it.

### Phase B — Vite plugin manifest (~30m)

- Extend `_components.ts` emitter to write `rightPanelRegistry` (`{ id
  → ComponentRef }`).
- `getRightPanelComponent(id)` accessor in
  `react/right-panel-context.tsx` (or wherever icon-context lives).
- Tests: plugin walks contributions, emits one entry per id,
  warns when `render` is anonymous.

### Phase C — chrome + state (~2h)

- `RightSidebar.tsx` mounted by `AppShell` when `panel.rightSidebar`
  is set.
- Open/close state via `useRightSidebar()` context, persisted to
  localStorage `pilotiq.rightSidebar.<basePath>.{open,activeId,width}`.
- Tab strip when 2+ contributions; auto-hide tab strip with single
  contribution.
- Resize handle on the left edge with `useResizableWidth`.
- Mobile sheet fallback.
- `RightSidebarTrigger` mounted in both layouts.
- `Mod-Shift-\` keyboard shortcut.

Tests: jsdom-flavored if we already have any (we don't — pilotiq
tests are pure node:test). Skip React-mount tests; verify chrome via
playground manually.

### Phase D — docs + guide (~30m)

- `docs/guide/right-sidebar.md` — "Build a right-sidebar plugin" with
  a worked example (no AI dependency — use a "page outline" demo).
- `packages/pilotiq/CLAUDE.md` — add the surface to the plugin-system
  section.
- `docs/guide/extending-pilotiq.md` — cross-link.

Total: ~4 hours of work. Phase A is parallelizable with reading the
pilotiq-pro AI package source if any decisions need reconfirming.

---

## Decisions deferred to v2

- **Left sidebar registry** (`Pilotiq.leftPanel(...)`). The existing
  navigation sidebar already has render hooks for inserting panes
  (`panels::sidebar.nav.start` / `panels::sidebar.footer`); a real
  registry on the left can wait until a consumer asks.
- **Multi-instance panes** (e.g., two chat sessions side-by-side in
  the right sidebar). v1 = one tab open at a time, mirrors VS Code's
  default.
- **Resizable to "auxiliary view"** (drag width to >50% to "promote"
  to half-screen). VS Code does this; nice but not minimum-viable.
- **Drag-and-drop tab reordering**. Sorted by `sort` field at
  registration time; users can't reorder. Add later if needed.
- **Floating panes** (detach to a separate window). v1 = docked only.
- **Auth-gated visibility transitions**. `canAccess` runs once per
  page load (server-side). If the user's auth changes mid-session
  without a nav, the sidebar doesn't update. Same posture as nav
  visibility.

---

## Compatibility with the pro AI package

Audit of `~/Projects/pilotiq-pro/packages/ai/src/components/agents/AiChatPanel.tsx`:

- `AiChatPanel` is currently 600+ LOC and owns its **entire** sidebar
  shell — fixed positioning, slide animation, mobile Sheet branch,
  width var. Its inner content is `<AiChatContent />`.
- `AiChatTrigger` is a separate exported function — designed to mount
  in a topbar slot.

When the AI package ports to pilotiq:

- The plugin registers `{ id: 'ai.chat', render: AiChatContent }` —
  drops the outer shell entirely; core's `RightSidebar` provides
  positioning/sizing/mobile-sheet.
- `AiChatTrigger` either becomes core's default `RightSidebarTrigger`
  (single-contribution case) OR continues to render via a render hook
  if the AI package wants a custom-styled trigger.
- The `AiChatContent` body reads context from `useRightSidebar()` to
  know its width, plus uses `currentPath` from `RightPanelProps` for
  page-aware behavior.
- `AiChatProvider` (the chat session state context) keeps living in
  the pro package and can wrap `<AiChatContent />` from the inside —
  no changes needed to the chat protocol.

The `AiUiContext` slot bag pattern in pilotiq core (free-pages-can-call-pro-components-by-name)
is **orthogonal** to the right sidebar registry. They serve different
goals — slot bag = pro injects components into free pages; right
sidebar = plugins claim their own pane. The slot bag stays as-is.

---

## Open questions

- **Should `rightPanel.canAccess(user)` re-run on every navigation, or
  once per page load?** Today's `Resource.canAccess` runs per request,
  so a fresh `panelInfo()` resolves on every nav. The right-sidebar
  meta runs through the same path — re-runs per nav. No design choice
  needed; matches the rest of the panel.
- **Tab strip overflow when many contributions.** v1: assume <=4
  tabs; if more, pick a horizontal scroll strip later. Document the
  expectation.
- **Resize past 50% screen width.** Cap at 800px or 50vw, whichever
  is smaller? VS Code lets it grow further. Recommend cap at 50vw on
  desktop for sanity; revisit when a consumer wants more.
