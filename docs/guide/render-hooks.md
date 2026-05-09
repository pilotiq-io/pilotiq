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
| `panels::head.start` | First child of the generated `<head>` — before font links and the FOUC-prevention script |
| `panels::head.end` | After the built-in chrome inside `<head>` |
| `panels::scripts` | Late-load `<script>` block — appended after `panels::head.end` |
| `panels::styles` | Late-load `<style>` block — appended after `panels::scripts` |

### Page-level

Resolved per page-role by the matching data builder and spliced into
the page's `schemaData` at the position implied by the slot name.

| Slot | Position |
|---|---|
| `panels::page.start` / `panels::page.end` | Top / bottom of the page schema (every role: dashboard, list, create, edit, view, global-edit, global-view, custom page, all relation/nested-relation) |
| `panels::resource.pages.list-records.table.before` / `.after` | Immediately above / below the first top-level `Table` on the resource list page |
| `panels::resource.pages.list-records.tabs.end` | Appended into the `ListTabs` strip's children (after the user's tabs) |
| `panels::resource.pages.list-records.header.actions.before` / `.after` | Action chips alongside the page-title actions on the resource list page |
| `panels::resource.pages.create-record.form.before` / `.after` | Around the first top-level `Form` on the resource create page |
| `panels::resource.pages.create-record.header.actions.before` / `.after` | Action chips alongside the page-title actions on the resource create page |
| `panels::resource.pages.edit-record.form.before` / `.after` | Around the first top-level `Form` on the resource edit page |
| `panels::resource.pages.edit-record.header.actions.before` / `.after` | Action chips alongside the page-title actions on the resource edit page |
| `panels::resource.pages.view-record.start` / `.end` | Wraps the resource view page schema (inside `panels::page.start/.end` if both are set) |
| `panels::resource.pages.view-record.header.actions.before` / `.after` | Action chips alongside the page-title actions on the resource view page |
| `panels::global-search.results.before` / `.after` | Around the Cmd+K palette's result list — only fires when the user is actively searching (≥ 2 chars) |

The `*-records.table.*` and `*-record.form.*` splice points work on the
**first top-level** match. Tables / Forms nested inside a Section or
Group don't currently receive these hooks — register `panels::page.start`
or use the universal slots if you need to wrap a nested anchor.

The `*.header.actions.before / .after` slots splice into the first
top-level page heading's children — the same row pilotiq mounts the
built-in resource actions on (`Create`, `View`, `Delete`, `Save`).
Contributions are appended into that slot, so only `Action` /
`ActionGroup`-typed elements end up rendered (other element types are
silently skipped at render, mirroring the head-slot posture for
body-level elements). When a custom page header doesn't include a
`Heading` at the top level, the contribution drops silently — register
`panels::page.start` instead if you need to mount a toolbar without a
heading anchor.

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

## Head-only elements

The four `panels::head.*` slots render directly inside the document
`<head>`. Body-level Elements (`Heading`, `Alert`, `Card`, …) emit
`<div>` / `<p>` wrappers that would terminate `<head>` parsing in the
browser, so they're skipped with a warning.

Use the four head-safe primitives instead — they map to native head
children:

```ts
import { Pilotiq, MetaTag, LinkTag, ScriptTag, StyleTag } from '@pilotiq/pilotiq'

Pilotiq.make('admin')
  .renderHook('panels::head.start', () => [
    LinkTag.make({ rel: 'icon', href: '/favicon.svg', mimeType: 'image/svg+xml' }),
    LinkTag.make({ rel: 'canonical', href: 'https://app.example.com' }),
  ])
  .renderHook('panels::head.end', ({ user }) => [
    MetaTag.make({ name: 'csrf-token', content: getCsrf(user) }),
    MetaTag.make({ property: 'og:title', content: 'Acme Admin' }),
  ])
  .renderHook('panels::scripts', () => [
    ScriptTag.make({
      src: 'https://plausible.io/js/script.js',
      defer: true,
      dataAttributes: { domain: 'app.example.com' },
    }),
    ScriptTag.make({ body: 'window.__APP_TENANT__ = "acme"' }),
  ])
  .renderHook('panels::styles', ({ user }) => [
    StyleTag.make(`:root { --pilotiq-brand: ${tenantBrand(user)} }`),
  ])
```

Each tag's setter receives the same `RenderHookContext` (next section)
so per-user / per-route content works the same as body slots. Schema-side
`visible(...)` / `hidden(...)` predicates still apply.

> **Why `mimeType` instead of `type`?** The wire shape uses `type` as the
> element discriminator (`'meta' | 'link' | 'script' | 'style'`). The
> head-tag classes rename the HTML `type=` attribute to `mimeType` to
> avoid the collision. Renderer maps it back to `type=` on the rendered
> `<link>` / `<script>`.

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
