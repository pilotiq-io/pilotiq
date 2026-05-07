# Render hooks plan

**Status:** PROPOSED. The Filament v5 audit (`admin-gap-audit.md`) flagged render hooks alongside filter-layouts as the two outstanding v5 chrome surfaces. Filter-layouts shipped 2026-05-06 (`Table.filtersLayout`); this plan covers the remaining one.

**Goal:** named slots scattered through the panel chrome where apps inject arbitrary `Element[]` (or async resolvers) without forking AppShell / layouts / page renderers. Filament's API ports verbatim — same hook names, same scope semantics — so docs and snippets transfer 1:1 from upstream.

---

## Why now

- The user-menu + profile-page work just touched every chrome integration point this needs (`AppShell`, both layouts, `panelInfo()`, the per-page `panelData` builders). Plumbing render hooks through those same edges is cheap while context is hot.
- Without render hooks, every "small chrome insertion" request (a feature flag warning banner, an environment label in the topbar, a custom panel-footer link) forces apps to either fork the auto-gen `+Layout.tsx` or write a wrapping page. That gap is the single biggest reason to fork pilotiq today.
- Render hooks are a prerequisite for shipping the Filament-parity admin chrome polish items (env banner, license expiry warnings, multi-tenant switchers) without inventing one-off APIs per concern.

---

## API surface

```ts
import { Pilotiq } from '@pilotiq/pilotiq'
import { Alert } from '@pilotiq/pilotiq'

panel.renderHook(
  'panels::topbar.start',
  ({ user }) => [Alert.make('You are impersonating someone').warning()],
)

panel.renderHook(
  'panels::resource.pages.list-records.table.before',
  () => [Heading.make('Bulk import')],
  { resource: ArticleResource },
)
```

Signature:

```ts
type RenderHookName = 'panels::body.start' | 'panels::body.end' | …  // closed union
type RenderHookFn   = (ctx: RenderHookContext) => Element[] | Promise<Element[]>
type RenderHookScope = {
  resource?: ResourceClass
  page?:     typeof Page
  global?:   GlobalClass
}

class Pilotiq {
  renderHook(name: RenderHookName, fn: RenderHookFn, scope?: RenderHookScope): this
}

interface RenderHookContext {
  user:       unknown      // resolved Pilotiq.user(req => …)
  basePath:   string       // panel root (e.g. '/admin')
  url:        string       // request URL (`pageContext.urlPathname` on SSR/SPA-nav)
  resource?:  ResourceClass
  page?:      typeof Page
  global?:    GlobalClass
  recordId?:  string       // present on view/edit/relation pages
}
```

The closed union for `name` is the v1 contract — extending it requires editing `RenderHookName`. That's deliberate: it keeps autocomplete useful and prevents typos from silently no-op'ing.

---

## Hook name catalog (v1)

Ported from Filament's chrome positions. Each name maps to a fixed slot in the renderer. **Reuse Filament's literal names** so user docs / community snippets transfer 1:1.

### Panel chrome (always available)

| Name | Slot |
|---|---|
| `panels::head.start` | First child of generated `+Head.tsx` (before fonts + FOUC script) |
| `panels::head.end` | Inside generated `+Head.tsx`, after the built-in chrome |
| `panels::body.start` | First child inside `<AppShell>` `children` |
| `panels::body.end` | Last child inside `<AppShell>` `children` |
| `panels::topbar.start` | Inside the layout header, before `<SearchTrigger>` |
| `panels::topbar.end` | Inside the layout header, after `<UserMenu>` |
| `panels::sidebar.start` | First entry inside `<SidebarHeader>` |
| `panels::sidebar.nav.start` | First entry of the sidebar nav tree |
| `panels::sidebar.nav.end` | Last entry of the sidebar nav tree |
| `panels::sidebar.footer` | First entry inside `<SidebarFooter>` (above existing theme link) |
| `panels::user-menu.before` | Inserted at top of `<UserMenu>` items |
| `panels::user-menu.after` | Inserted at bottom of `<UserMenu>` items (above sign-out separator) |
| `panels::footer` | Below the page content, inside the layout's content area |
| `panels::scripts` / `panels::styles` | Bottom-of-`+Head` script/style injection |

### Page-level (resolve per page-role)

| Name | Slot |
|---|---|
| `panels::page.start` / `panels::page.end` | First/last child of the page content (above/below `schemaData`) |
| `panels::resource.pages.list-records.table.before` / `.after` | Around the resource list `<Table>` |
| `panels::resource.pages.list-records.tabs.end` | Trailing position on the `ListTabs` strip |
| `panels::resource.pages.create-record.form.before` / `.after` | Around the create form |
| `panels::resource.pages.edit-record.form.before` / `.after` | Around the edit form |
| `panels::resource.pages.view-record.start` / `.end` | Around the view detail |
| `panels::global-search.results.before` / `.after` | Around the Cmd+K palette result list |

(There are more in Filament — relation-manager hooks, action-modal hooks. v1 ships the chrome + page-role set above; relation/action hooks land in v2 once a consumer asks.)

---

## Scope semantics

A hook with no `scope` runs everywhere the slot exists. With a scope, the hook only runs when **at least one** of:

- `scope.resource` matches the active resource (`R` for that route, including the resource that owns a relation manager page),
- `scope.page` matches the active page class,
- `scope.global` matches the active global.

Scope evaluation is OR within the scope object, but the hook is always gated on the slot being relevant for the current page-role too (`resource.pages.list-records.*` only fires on the list page; `panels::topbar.*` fires everywhere). Filament's behaviour matches.

---

## Server flow

Hooks resolve **server-side** so SSR + SPA-nav round-trip identical chrome. No new endpoints — hooks live next to the existing `panel: panelInfo(...)` and `schemaData: resolveSchema(...)` outputs.

1. Builder state: `Pilotiq.renderHook(name, fn, scope?)` appends to `cfg.renderHooks: RenderHookEntry[]`. Multiple hooks against the same name run in registration order; their outputs concat.
2. Per-request resolution: a new `resolveRenderHooks(pilotiq, names, ctx)` walker — given a set of hook names that the current page renders — calls every matching+in-scope hook in parallel, awaits, concats results, recursively `resolveSchema`'s the returned `Element[]` against `ctx`, and returns a `Record<RenderHookName, ElementMeta[]>`.
3. Page-data builders attach the resolved map to viewProps under a `renderHooks` key. Each builder declares which hooks it serves (chrome hooks always; page-role hooks per builder).
4. `panelInfo()` extends with the chrome subset — body/topbar/sidebar/user-menu hooks resolve once per `panelInfo()` call and ship inside `panel.renderHooks`. Page-role hooks ride on the per-builder `renderHooks` slot to keep `panelInfo()`'s payload from ballooning.

Throwing hooks fail closed (their slot's contribution drops; other hooks at the same slot still ship). Same posture as `Resource.canAccess` and `navigationBadge()`.

---

## Client flow

Renderers read `renderHooks[name]` and emit `<RenderHookSlot name="..." />` at every supported position. The slot is a tiny renderer that walks the element-meta array through the existing `<SchemaRenderer>` pathway:

```tsx
function RenderHookSlot({ name, hooks }: { name: RenderHookName; hooks?: ElementMeta[] }) {
  if (!hooks || hooks.length === 0) return null
  return <SchemaRenderer elements={hooks} />
}
```

Layouts and page-role renderers thread `panel.renderHooks` (chrome) and `viewProps.renderHooks` (page-role) into `<RenderHookSlot>` at the right positions. Existing schema rendering handles every Element type the user returns — no new render branches.

---

## Files touched

New:
- `src/RenderHook.ts` — `RenderHookName` union, `RenderHookContext`, `RenderHookEntry` types, `resolveRenderHooks()` walker.
- `src/react/RenderHookSlot.tsx` — slot renderer.
- `docs/guide/render-hooks.md` — user-facing guide.

Edits:
- `src/Pilotiq.ts` — `cfg.renderHooks` + `.renderHook(name, fn, scope)` builder.
- `src/pageData.ts` — `panelInfo()` chrome resolution; per-builder page-role resolution.
- `src/react/AppShell.tsx` — accept `renderHooks` from `panel`, forward.
- `src/react/layouts/SidebarLayout.tsx` + `TopbarLayout.tsx` — mount slots at sidebar/topbar/body/footer/user-menu positions.
- `src/react/SchemaRenderer.tsx` (or per-page renderers) — mount page/list-records/edit-record/etc. slots.
- `src/index.ts` — export `RenderHookName`, `RenderHookContext`, etc.
- `src/vite.ts` — generated `+Head.tsx` mounts head-start/head-end slots.

---

## v1 limits / deliberate deferrals

- **Closed name union.** Custom hook names rejected at compile time. Loosens to a `string` overload only when a real consumer needs it.
- **No relation-manager hooks.** Filament has `panels::resource.relation-manager.*`. Defer until someone asks — the relation surface still moves fast.
- **No action-modal hooks.** Same reason.
- **No render-order between hooks at the same name.** Registration order wins, period. No `.priority(n)`.
- **Hooks see resolved `Element`s, not raw HTML/JSX.** That's a feature, not a bug — keeps the wire shape SSR-safe and lets server output stream back through the existing `<SchemaRenderer>`. Apps wanting raw HTML wrap it in `Html.make(string)`.
- **No `replace` mode.** Filament's render hooks are insertion-only. We match.
- **Scope is OR'd within the object only.** No scope union/AND combinators in v1.

---

## Open questions

- ~~**Where does `panels::head.scripts` write to?**~~ Answered 2026-05-07 cont'd⁸. Path B (request-time read; Filament-equivalent). The four `panels::head.start / .end / .scripts / .styles` slots resolve per request inside `panelInfo()` (already wired by Day 1), the resolved `RenderHookMap` rides through `panel.renderHooks`, and the auto-generated `+Head.tsx` reads it via `usePageContext()` and dispatches through a new `<HeadHooks position="start"|"end">` component (`@pilotiq/pilotiq/react`). Hooks return head-safe primitives (`MetaTag` / `LinkTag` / `ScriptTag` / `StyleTag`) — body-level Elements would emit `<div>` / `<p>` wrappers that terminate `<head>` parsing in the browser, so they're skipped with a warning. Slot ordering inside `<head>`: `head.start` → built-in fonts + FOUC → `head.end` → `scripts` → `styles`. Path A (codegen-time emission) deferred — would lose request-scoped context (`user`, `resource`, `recordId`). ✅ DONE.
- **Caching.** `panelInfo()` runs per-request; hook resolvers may do DB lookups for a real-time banner. Add a `.cache(seconds)` setter in v2 if measurable.
- **Order across multiple panels.** A single repo can register multiple `Pilotiq` instances. Each has its own `cfg.renderHooks` — no cross-panel sharing in v1. (Filament has none either.)

---

## Effort estimate

~2 days end-to-end:
- Day 1: `RenderHook.ts` + `Pilotiq.renderHook()` + `panelInfo()` chrome resolution + AppShell/layout slot mounts. Smoke via a banner hook in playground-pilotiq.
- Day 2: page-role resolution wiring through every per-builder data fn (list/create/edit/view/global/page) + `<RenderHookSlot>` mounts in renderers + `docs/guide/render-hooks.md` + a few demo hooks.

Tests: per-hook-name unit tests aren't valuable (they'd be tautological); integration test the chrome subset via the existing playground SSR snapshot harness.
