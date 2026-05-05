# `details` collapsible blocks for `@pilotiq/tiptap`

> **Status:** ✅ shipped 2026-05-05 cont'd⁷. **137 tests** in
> `@pilotiq/tiptap` (was 131). Closes the last cosmetic item from
> [`rich-editor-gap.md`](./rich-editor-gap.md) — collapsible `<details>` blocks
> shipped in the reference admin's RichEditor. Out of scope for the original
> Phases A-G; tracked here as a small standalone follow-up because it touches
> new peer surface area.

## What ships

A new node trio (`details` / `detailsSummary` / `detailsContent`) wired through:

- the always-on top toolbar (one button id, defaults-off — opt-in via
  `.toolbarButtons([...])` or `.enableToolbarButtons(['details'])`);
- the `/`-slash menu (one entry under the existing **Insert** group, alongside
  `Table` / `Image`);
- `renderRichTextToHtml` (three new `case` branches, emits the obvious
  `<details><summary>…</summary>…</details>` shape, honors `open: true`).

User surface in code:

```ts
RichTextField.make('body')
  .toolbarButtons([
    ['bold', 'italic'],
    ['details', 'table'],
  ])
```

…or just enable the slash entry without changing the toolbar — the slash menu
gets the `details` item unconditionally so power users can insert one without
the button being on.

## Why now

- Filament-equivalent feature; closes the last "missing — cosmetic, low
  priority" row from `rich-editor-gap.md`.
- New peer surface — three Tiptap extensions — so plan-doc-first per the
  `feedback_when_to_write_plan_doc.md` rule (new public surface, new peer
  deps).
- Implementation is small (~120 LOC across editor + render) and additive —
  no existing surface changes shape.

## Peer deps

Tiptap v3 consolidates the trio into a **single** package — `@tiptap/extension-details`
re-exports `Details`, `DetailsSummary`, and `DetailsContent` from one entry
point. (Verified via `npm pack @tiptap/extension-details@3.22.4` —
`dist/index.d.ts` exports all three classes, and `extension-details-summary`
/ `extension-details-content` don't exist as standalone packages on the v3
line.)

```json
"@tiptap/extension-details": "3.22.4"
```

Pinned to **3.22.4** to match the rest of the `@tiptap/extension-*` set on this
package (mismatched minors emit a noisy peer-dep warning). Added to both
`peerDependencies` and `devDependencies`.

## Wiring

### `TiptapEditor.tsx`

One named import plus three new lines in the `extensions: [...]` array. No
`.configure()` needed on the children — the trio uses a fixed schema; only
`Details` carries options:

```ts
import { Details, DetailsSummary, DetailsContent } from '@tiptap/extension-details'

// inside useEditor({ extensions: [...] }):
Details.configure({
  // Persist open/closed state across reloads. Stored as the node's `open`
  // attribute (Tiptap's default) and rendered to the HTML attribute on
  // serialize, so reloads / SSR snapshots restore the same state.
  persist: true,
  // Default summary text when the user picks "Details" from the slash menu.
  // Tiptap fills the summary slot with this string on insert.
  HTMLAttributes: { class: 'details' },
}),
DetailsSummary,
DetailsContent,
```

(`persist: true` is the Tiptap-side default for the v3 line; including it
explicitly keeps the intent obvious in the wiring.)

### `RichTextField.ts`

Add `'details'` to the `ToolbarButtonId` union under a new comment line:

```ts
// Collapsible details block (single button — mirrors Filament's `details`).
| 'details'
```

`DEFAULT_TOOLBAR_GROUPS` does **not** include `details` — keeps the default
toolbar unchanged for existing users. Opt-in via `.toolbarButtons([...])`.

### `toolbarButtons.tsx`

Add `details` button def + icon. Icon is a small chevron + line glyph (inline
SVG, same `ICON_PROPS` pattern as the rest):

```tsx
details: {
  id: 'details', label: 'Collapsible block', available: true, icon: Icons.details,
  isActive:   (ed) => ed.isActive('details'),
  isDisabled: (ed) => !ed.can().setDetails(),
  command:    (ed) => { ed.chain().focus().setDetails().run() },
}
```

`setDetails()` is the Tiptap command shipped by `@tiptap/extension-details` —
it wraps the current paragraph in a `details` node with an empty summary +
the paragraph's existing content as the body.

### `SlashCommandExtension.ts`

Add one new slash entry under the existing **Insert** group, between `table`
and `image` so the group reads "Table / Details / Image":

```ts
{
  key: 'details', label: 'Collapsible block', icon: '▸', group: 'Insert',
  searchKey: 'details collapsible disclosure summary toggle',
  command: ({ editor, range }) =>
    editor.chain().focus().deleteRange(range).setDetails().run(),
}
```

No upload gate (unlike `image`) — pure schema, available everywhere.

### `render.ts`

Three new `case` branches in `renderNode`:

```ts
case 'details':        return renderDetails(n, opts)
case 'detailsSummary': return wrap('summary', n, opts)
case 'detailsContent': return renderChildren(n, opts)
```

`renderDetails` emits the wrapping element with the optional `open` attribute:

```ts
function renderDetails(n: TiptapNode, opts: RenderRichTextOptions): string {
  const isOpen = n.attrs?.['open'] === true
  return `<details${isOpen ? ' open' : ''}>${renderChildren(n, opts)}</details>`
}
```

`detailsContent` doesn't get its own wrapping element — the editor's
NodeView emits a `<div data-type="detailsContent">`, but for read-side HTML
the children inline directly inside `<details>` (after the `<summary>`), which
matches how authors expect a `<details>` block to render in markdown / docs.

### Header docstring update in `render.ts`

The "Coverage matches what `RichTextField` ships" block at the top of
`render.ts` currently reads `…/ table / tableRow / tableCell / tableHeader / mergeTag / mention`.
Append `/ details / detailsSummary / detailsContent` to that line. Keeps the
file's self-describing comment honest.

## Tests (`render.test.ts` + `SlashCommandExtension.test.ts`)

Five new pure-`node:test` cases. None require a DOM or React.

`render.test.ts` — three cases:

```ts
describe('renderRichTextToHtml — details', () => {
  it('renders a closed details block with summary + content', () => {
    const doc: TiptapNode = {
      type: 'doc',
      content: [{
        type: 'details',
        content: [
          { type: 'detailsSummary', content: [{ type: 'text', text: 'Click me' }] },
          { type: 'detailsContent', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hidden' }] }] },
        ],
      }],
    }
    assert.equal(
      renderRichTextToHtml(doc),
      '<details><summary>Click me</summary><p>Hidden</p></details>',
    )
  })

  it('emits the `open` attribute when attrs.open is true', () => {
    const doc: TiptapNode = {
      type: 'doc',
      content: [{
        type: 'details',
        attrs: { open: true },
        content: [
          { type: 'detailsSummary', content: [{ type: 'text', text: 'S' }] },
          { type: 'detailsContent', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'B' }] }] },
        ],
      }],
    }
    assert.match(renderRichTextToHtml(doc), /^<details open>/)
  })

  it('escapes summary text content', () => {
    const doc: TiptapNode = {
      type: 'doc',
      content: [{
        type: 'details',
        content: [
          { type: 'detailsSummary', content: [{ type: 'text', text: '<script>' }] },
          { type: 'detailsContent', content: [{ type: 'paragraph' }] },
        ],
      }],
    }
    assert.match(renderRichTextToHtml(doc), /<summary>&lt;script&gt;<\/summary>/)
  })
})
```

`SlashCommandExtension.test.ts` — two cases (extends the existing test file):

```ts
it('includes a Details entry under the Insert group', () => {
  const items = buildSlashItems([], [], '', { hasUpload: false, onInsertImage: () => {} })
  const details = items.find((i) => i.key === 'details')
  assert.ok(details)
  assert.equal(details!.group, 'Insert')
  assert.equal(details!.label, 'Collapsible block')
})

it('Details slash item search matches "collapsible" / "summary" / "toggle"', () => {
  for (const q of ['collapsible', 'summary', 'toggle']) {
    const items = buildSlashItems([], [], q, { hasUpload: false, onInsertImage: () => {} })
    assert.ok(items.some((i) => i.key === 'details'), `missing details for query "${q}"`)
  }
})
```

Expected count: `@pilotiq/tiptap` 131 → **136** (+5).

## Out of scope

- **Accordion mode (one-row-open-at-a-time across multiple details).** Filament
  doesn't ship this for `details`; if a user wants accordion behavior, they can
  layer their own JS. Defer until asked.
- **Pasting native `<details>` HTML from outside the editor.** Tiptap's
  extensions ship a `parseHTML` rule that picks up a `<details>` paste — no
  extra work needed, but no test for it either (would require a DOM mount).
- **`grid` / `gridDelete` blocks.** Listed alongside `details` in the
  rich-editor-gap audit; ship separately if requested.

## Acceptance criteria

- `pnpm -F @pilotiq/tiptap test` passes with 136 tests.
- `pnpm -F @pilotiq/tiptap build` is clean.
- Manual smoke (in `playground-pilotiq`): inserting a Details block via slash
  menu, typing into summary + body, toggling open/closed, reloading the page
  preserves open state, the toolbar `details` button shows active when the
  cursor sits inside one.
- `docs/packages/tiptap.md` + `packages/tiptap/README.md` mention the
  feature in the slash-menu / toolbar lists.
- `docs/plans/rich-editor-gap.md`'s gap-table row for "Tables — `grid` /
  `gridDelete` / `details` collapsible" gets a partial-tick + cross-link to
  this doc.

## Estimated diff

- `package.json`            — +3 peer deps + 3 devDeps (~10 lines).
- `TiptapEditor.tsx`        — 3 imports + ~6 lines in the `extensions:` array.
- `RichTextField.ts`        — 1 union member + comment.
- `toolbarButtons.tsx`      — 1 icon + 1 button def (~25 lines).
- `SlashCommandExtension.ts`— 1 slash item (~10 lines).
- `render.ts`               — 3 new cases + 1 helper (~15 lines) + docstring.
- `render.test.ts`          — 3 new tests (~50 lines).
- `SlashCommandExtension.test.ts` — 2 new tests (~15 lines).
- `docs/packages/tiptap.md` + `README.md` + `rich-editor-gap.md` — ~10 lines
  total.

Total: ~140 LOC. Single PR, no phases.
