# Render hooks

Render hooks are named slots scattered through the panel chrome where you
can inject arbitrary `Element[]` without forking the auto-generated
layouts or page renderers. Use them for environment banners, license
warnings, contextual help links, custom user-menu rows, or anything else
that needs to surface in the panel without reaching for a custom Page.

## Quick start

```ts
import { Pilotiq, Alert, Heading } from '@pilotiq/pilotiq'

Pilotiq.make('admin')
  .renderHook('panels::topbar.start', () => [
    Alert.make('You are impersonating someone').warning(),
  ])
  .renderHook(
    'panels::sidebar.footer',
    () => [Heading.make('Need help?').level(6)],
  )
```

The callback returns an `Element[]`; pilotiq resolves it server-side
through the same schema pipeline that powers the rest of the admin UI.
Multiple hooks against the same name run in registration order; their
outputs concatenate.

## Available slots (v1)

### Panel chrome

These resolve once per request inside `panelInfo()` and ride on
`panel.renderHooks`. They mount in the layout shell, so they fire on
every page in the panel.

| Slot | Position |
|---|---|
| `panels::body.start` | First child inside `<AppShell>` |
| `panels::body.end` | Last child inside `<AppShell>` |
| `panels::topbar.start` | Inside the layout header, before the search trigger |
| `panels::topbar.end` | Inside the layout header, after the user menu |
| `panels::sidebar.start` | First entry inside `<SidebarHeader>` |
| `panels::sidebar.nav.start` | First entry of the sidebar nav tree |
| `panels::sidebar.nav.end` | Last entry of the sidebar nav tree |
| `panels::sidebar.footer` | First entry inside `<SidebarFooter>` |
| `panels::user-menu.before` | Top of the user-menu dropdown (above identity) |
| `panels::user-menu.after` | Bottom of the user-menu dropdown (above sign-out) |
| `panels::footer` | Below the page content |
| `panels::head.start` / `panels::head.end` | Around the generated `<head>` (mount points reserved; v1 wiring shipping in a follow-up) |

### Page-level

Resolved per page-role by the matching data builder; available on
`viewProps.renderHooks`. Wiring shipping in a follow-up — the closed
name union is already in the type so you can register today; the
mounts will start firing without changes once the per-builder
resolution lands.

```ts
'panels::page.start' | 'panels::page.end'
'panels::resource.pages.list-records.table.before'
'panels::resource.pages.list-records.table.after'
'panels::resource.pages.list-records.tabs.end'
'panels::resource.pages.create-record.form.before'
'panels::resource.pages.create-record.form.after'
'panels::resource.pages.edit-record.form.before'
'panels::resource.pages.edit-record.form.after'
'panels::resource.pages.view-record.start'
'panels::resource.pages.view-record.end'
'panels::global-search.results.before'
'panels::global-search.results.after'
```

## Scope

Pass an optional third argument to restrict a hook to a single
resource / page / global. Scope keys are OR'd within the object — the
hook fires when **any** of the listed identifiers matches the active
route.

```ts
panel.renderHook(
  'panels::topbar.start',
  () => [Alert.make('Articles area').info()],
  { resource: ArticleResource },
)
```

Without a scope, the hook fires every time the slot is rendered.

## Hook context

```ts
type RenderHookContext = {
  user:      unknown   // resolved via Pilotiq.user(req => …) (or null)
  basePath:  string    // panel root, e.g. '/admin'
  url:       string    // current URL pathname
  resource?: ResourceClass
  page?:     typeof Page
  global?:   GlobalClass
  recordId?: string    // present on view/edit/relation pages
}
```

Use it to read the active user, branch on the active route, or build
links off `basePath`.

## Failure posture

A hook that throws is logged and dropped — its slot's contribution
vanishes, but other hooks at the same slot still ship. Same posture as
`Resource.canAccess()` and `navigationBadge()`.

## v1 limits

- **Closed name union.** Custom names are rejected at compile time.
  Loosens to a `string` overload only when a real consumer needs custom
  slot names.
- **No relation-manager / action-modal hooks.** Filament has
  `panels::resource.relation-manager.*` and action-modal hooks; v1
  ships chrome + page-role only.
- **No render order between hooks at the same name.** Registration
  order wins — no `.priority(n)`.
- **No replace mode.** Render hooks are insertion-only.

## Related

- Plan: [`docs/plans/render-hooks.md`](../plans/render-hooks.md)
- API reference: `Pilotiq.renderHook(name, fn, scope?)` in `@pilotiq/pilotiq`.
