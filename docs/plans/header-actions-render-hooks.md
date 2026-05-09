# Header-actions render-hook slots (8 new closed-union members)

Status: **planning**
Filed: 2026-05-09
Driven by: `pilotiq-pro/docs/plans/admin-ai-ux-polish.md` Phase 5 (resource-header AI agents dropdown)
Effort: ~50 LOC + tests, S

---

## Why

`@pilotiq-pro/ai`'s next UX phase introduces a `[✦ Agents ▾]` dropdown that needs to render alongside the existing resource-page header actions (`Create`, `View`, `Delete`, `Save`). The plugin contributes via the existing render-hooks API — but no slot in the closed `RenderHookName` union covers the header-actions row today.

This is a generic capability — not AI-specific. Any future plugin (collab presence avatars, workspace switchers, custom toolbar widgets) hitting the same wall would need the same slots. Worth shipping once, generally.

## What's missing

The closed union currently has page-role slots for content anchors:

```
panels::resource.pages.list-records.table.before / .after
panels::resource.pages.list-records.tabs.end
panels::resource.pages.create-record.form.before / .after
panels::resource.pages.edit-record.form.before / .after
panels::resource.pages.view-record.start / .end
panels::page.start / .end
```

…but nothing for the action chips that ride on the page title (the right side of the `Heading`'s row).

Rendering today (`packages/pilotiq/src/defaultPages.ts`):

- `getHeader(R) → [Heading.make('...').level(1)]`
- `getHeaderActions(R, basePath)` (ListPage) or `getFormActions(R, basePath, recordId?)` (Create / Edit) → `Action[]`
- `buildHeader()` (`defaultPages.ts:240-249`) attaches actions to the first `Heading`'s `children` via `el.actions(targeted)`
- `SchemaRenderer.tsx:2952` renders the `heading` case, filtering children by `c.type === 'action' || c.type === 'actionGroup'` into the right-side flex row

## Proposed slot names

8 new members on `RenderHookName`, mirroring the existing `before/after` pattern:

```ts
'panels::resource.pages.list-records.header.actions.before'
'panels::resource.pages.list-records.header.actions.after'
'panels::resource.pages.create-record.header.actions.before'
'panels::resource.pages.create-record.header.actions.after'
'panels::resource.pages.edit-record.header.actions.before'
'panels::resource.pages.edit-record.header.actions.after'
'panels::resource.pages.view-record.header.actions.before'
'panels::resource.pages.view-record.header.actions.after'
```

Add to `PAGE_HOOK_NAMES`. Hook payload is `Element[]`; only `action` / `actionGroup`-typed elements end up rendered (matches the existing `Heading` children filter — non-action contributions are silently skipped, same as a body-level Element returned in a head slot).

## Splice logic

`applyPageHooks.ts` already has the matching pattern for `list-records.tabs.end` (find the first top-level `'listTabs'` meta, append into its `children`). Same idea here, against the first top-level `'heading'` meta:

```ts
function spliceHeaderActions(
  schemaData: ElementMeta[],
  hooks: RenderHookMap,
  role: PageRole,
): void {
  const beforeName = roleHeaderActionsBefore(role)   // panels::resource.pages.{role}.header.actions.before
  const afterName  = roleHeaderActionsAfter(role)
  const before = hooks[beforeName] ?? []
  const after  = hooks[afterName]  ?? []
  if (before.length === 0 && after.length === 0) return

  const heading = schemaData.find(m => m.type === 'heading')
  if (!heading) return   // no anchor — drop silently (same posture as missing form/table anchor)

  // Header actions live in heading.children alongside built-in actions.
  // SchemaRenderer filters by type, so non-action contributions are no-op.
  heading.children = [
    ...before,
    ...(heading.children ?? []),
    ...after,
  ]
}
```

Wire-up: `applyPageHooks(schemaData, hooks, role)` calls `spliceHeaderActions(...)` for each of the four resource roles. No-op for `dashboard`, `global-edit`, `global-view`, `customPage`, `relation-*`, `search`, `nested-relation-*`.

## Tests

In `packages/pilotiq/src/applyPageHooks.test.ts`:

- list-records: contributing an `Action` via `header.actions.before` puts it left of `Create`
- create-record / edit-record / view-record: same shape, both before/after
- non-action contribution: `Heading.make('foo')` returned in a header-actions slot is silently skipped (rendered or not)
- empty schemaData (no `heading`): contribution drops silently, sibling slots still ship
- scope filtering: contribution scoped to `R = PostResource` doesn't appear on `UserResource`'s edit page

## Docs

- `docs/guide/render-hooks.md` — extend the slot table with the 8 new rows + a note on the action-only filter at render time
- No changelog beyond the `feat(pilotiq):` changeset

## Out of scope

- No new "global header" hook — only resource-page roles (where headers exist). Custom pages, dashboard, global pages can splice via `panels::page.start` if they need toolbar contributions.
- No `.priority(n)` ordering — registration order wins, same as today.
- No "replace built-in actions" mode — append-only.

## Suggested commit message

`feat(pilotiq): 8 header-actions render-hook slots — list/create/edit/view-record header.actions.before/after`
