# `grid` / `gridDelete` blocks for `@pilotiq/tiptap`

> **Status:** PROPOSED 2026-05-05 (pickup option #3, last cosmetic row on
> [`rich-editor-gap.md`](./rich-editor-gap.md)). Closes the gap audit. Sibling
> follow-up to [`details-blocks.md`](./details-blocks.md) — same posture (new
> peer surface area, plan-doc-first), same wire shape (custom node trio +
> render branches + opt-in toolbar buttons + slash entries).

## What ships

A new node pair (`grid` + `gridColumn`) wired through:

- the always-on top toolbar (two button ids — `grid` + `gridDelete`,
  defaults-off — opt-in via `.toolbarButtons([...])`);
- the `/`-slash menu (two entries under the existing **Insert** group:
  "Two-column grid" / "Three-column grid");
- `renderRichTextToHtml` (two new `case` branches, emits
  `<div class="grid grid-cols-N gap-4">…<div>col</div>…</div>` —
  consumer owns the CSS, same posture as `lead`/`small`).

User surface in code:

```ts
RichTextField.make('body')
  .toolbarButtons([
    ['bold', 'italic'],
    ['grid', 'gridDelete'],
  ])
```

…or just enable the slash entries without changing the toolbar — the slash
menu picks up both entries unconditionally so power users can insert one
without the buttons being on.

## Why now

- Last "missing — cosmetic" row on `rich-editor-gap.md` (line 104). Closes
  the editor-gap audit completely.
- New peer surface — a custom Tiptap node pair — so plan-doc-first per
  `feedback_when_to_write_plan_doc.md`.
- Implementation is small (~150 LOC across editor + render) and additive
  — no existing surface changes shape.

## Peer deps

**None.** Tiptap doesn't ship a first-party `@tiptap/extension-grid` (verified
via `npm view @tiptap/extension-grid` — package doesn't exist on the v3 line).
We define the node pair inline under `extensions/GridExtension.ts` parallel
to `BlockNodeExtension.ts` — pilotiq-tiptap already builds custom Tiptap
nodes, so no precedent issue.

## Wiring

### `extensions/GridExtension.ts` (new)

Two `Node.create({...})` definitions plus a small command pair. Pure data —
no NodeView, no React mount — so the visual is just the rendered `<div>`s
plus whatever Tailwind classes the consumer's stylesheet ships.

```ts
import { Node, mergeAttributes } from '@tiptap/core'
import type { Fragment } from '@tiptap/pm/model'

export type GridColumns = 2 | 3
const ALLOWED_COLUMNS: ReadonlyArray<GridColumns> = [2, 3] as const

export const Grid = Node.create({
  name:     'grid',
  group:    'block',
  content:  'gridColumn{2,3}',
  defining: true,

  addAttributes() {
    return {
      columns: {
        default: 2 as GridColumns,
        parseHTML: (el) => {
          const n = Number(el.getAttribute('data-columns'))
          return ALLOWED_COLUMNS.includes(n as GridColumns) ? (n as GridColumns) : 2
        },
        renderHTML: (attrs) => {
          const cols = ALLOWED_COLUMNS.includes(attrs.columns) ? attrs.columns : 2
          return {
            'data-columns': String(cols),
            class:          `pilotiq-grid pilotiq-grid-cols-${cols}`,
          }
        },
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="grid"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'grid' }), 0]
  },

  addCommands() {
    return {
      setGrid:
        (options?: { columns?: GridColumns }) =>
        ({ chain }) => {
          const cols = options?.columns ?? 2
          const columns = ALLOWED_COLUMNS.includes(cols) ? cols : 2
          const content = Array.from({ length: columns }, () => ({
            type:    'gridColumn',
            content: [{ type: 'paragraph' }],
          }))
          return chain()
            .focus()
            .insertContent({ type: 'grid', attrs: { columns }, content })
            .run()
        },

      unsetGrid:
        () =>
        ({ state, tr, dispatch }) => {
          const $head = state.selection.$head
          for (let depth = $head.depth; depth > 0; depth--) {
            const node = $head.node(depth)
            if (node.type.name !== 'grid') continue
            const start = $head.before(depth)
            const end   = $head.after(depth)
            // Concat each gridColumn's children into a flat block list.
            const flat: Fragment[] = []
            node.forEach((col) => {
              col.forEach((child) => flat.push(child as unknown as Fragment))
            })
            if (dispatch) tr.replaceWith(start, end, flat as never)
            return true
          }
          return false
        },
    }
  },
})

export const GridColumn = Node.create({
  name:     'gridColumn',
  group:    'gridColumn',  // custom group so only Grid contains it
  content:  'block+',
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-type="gridColumn"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'gridColumn' }), 0]
  },
})
```

Module-augmentation block declares the two new commands so
`editor.chain().setGrid()` typechecks, mirroring `BlockNodeExtension`'s
existing augmentation:

```ts
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    grid: {
      setGrid:   (options?: { columns?: GridColumns }) => ReturnType
      unsetGrid: () => ReturnType
    }
  }
}
```

### `TiptapEditor.tsx`

One named import plus two new lines in the `extensions: [...]` array.
No `.configure()` needed — both nodes use fixed schemas.

```ts
import { Grid, GridColumn } from '../extensions/GridExtension.js'

// inside useEditor({ extensions: [...] }):
Grid,
GridColumn,
```

### `RichTextField.ts`

Add `'grid'` + `'gridDelete'` to the `ToolbarButtonId` union under a new
comment line:

```ts
// Multi-column grid layout (`grid` inserts 2-col by default; `gridDelete`
// unwraps the enclosing grid). Both default-off — opt-in via
// `.toolbarButtons([...])`.
| 'grid' | 'gridDelete'
```

`DEFAULT_TOOLBAR_GROUPS` does **not** include either — keeps the default
toolbar unchanged for existing users.

### `toolbarButtons.tsx`

Two new icon entries + two button defs:

```tsx
grid: {
  id: 'grid', label: '2-column grid', available: true, icon: Icons.grid,
  isActive:   () => false,                           // grid never reads "active" — same posture as table
  isDisabled: (ed) => !ed.can().setGrid({ columns: 2 }),
  command:    (ed) => { ed.chain().focus().setGrid({ columns: 2 }).run() },
},

gridDelete: {
  id: 'gridDelete', label: 'Remove grid', available: true, icon: Icons.gridDelete,
  isActive:   (ed) => ed.isActive('grid'),
  isDisabled: (ed) => !ed.can().unsetGrid(),
  command:    (ed) => { ed.chain().focus().unsetGrid().run() },
},
```

The `grid` button defaults to **2 columns** when clicked — matches
"most-common-case" UX. Users wanting 3 columns reach for the slash
entry. (A column-count popover on the toolbar button is a follow-up
polish — keeping v1 surface tight.)

Icons: a 2×2 grid glyph for `grid`; the same with a slash for `gridDelete`.
Inline SVGs, same `ICON_PROPS` pattern as the rest.

### `SlashCommandExtension.ts`

Two new slash entries under the existing **Insert** group, between
`details` and `image` so the group reads "Table / Details /
Two-column grid / Three-column grid / Image":

```ts
{
  key: 'grid-2', label: 'Two-column grid', icon: '⊞', group: 'Insert',
  searchKey: 'grid columns layout 2 two split side',
  command: ({ editor, range }) =>
    editor.chain().focus().deleteRange(range).setGrid({ columns: 2 }).run(),
},
{
  key: 'grid-3', label: 'Three-column grid', icon: '⊞', group: 'Insert',
  searchKey: 'grid columns layout 3 three split',
  command: ({ editor, range }) =>
    editor.chain().focus().deleteRange(range).setGrid({ columns: 3 }).run(),
},
```

No upload gate — pure schema, available everywhere.

### `render.ts`

Two new `case` branches in `renderNode`:

```ts
case 'grid':       return renderGrid(n, opts)
case 'gridColumn': return `<div>${renderChildren(n, opts)}</div>`
```

`renderGrid` resolves the column count and emits the wrapping `<div>`:

```ts
function renderGrid(n: TiptapNode, opts: RenderRichTextOptions): string {
  const raw  = Number(n.attrs?.['columns'])
  const cols = raw === 2 || raw === 3 ? raw : 2
  return `<div class="pilotiq-grid pilotiq-grid-cols-${cols}">${renderChildren(n, opts)}</div>`
}
```

Class names match the editor's `renderHTML` so the same Tailwind / CSS
rule paints both. Consumer owns the styling (e.g. via Tailwind `[&_.pilotiq-grid-cols-2]:grid-cols-2`)
to keep the package CSS-free, mirroring `lead` / `small`.

### Header docstring update in `render.ts`

Append `/ grid / gridColumn` to the "Coverage matches what `RichTextField`
ships" docstring at the top of `render.ts`. Keeps the file's
self-describing comment honest.

## Tests (`render.test.ts` + `SlashCommandExtension.test.ts` + `GridExtension.test.ts`)

Pure-`node:test` cases. None require a DOM or React.

`render.test.ts` — three cases:

```ts
describe('renderRichTextToHtml — grid', () => {
  it('renders a 2-column grid with paragraph children', () => {
    const doc: TiptapNode = {
      type: 'doc',
      content: [{
        type: 'grid',
        attrs: { columns: 2 },
        content: [
          { type: 'gridColumn', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Left' }] }] },
          { type: 'gridColumn', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Right' }] }] },
        ],
      }],
    }
    assert.equal(
      renderRichTextToHtml(doc),
      '<div class="pilotiq-grid pilotiq-grid-cols-2"><div><p>Left</p></div><div><p>Right</p></div></div>',
    )
  })

  it('renders a 3-column grid', () => {
    const doc: TiptapNode = {
      type: 'doc',
      content: [{
        type: 'grid',
        attrs: { columns: 3 },
        content: [
          { type: 'gridColumn', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A' }] }] },
          { type: 'gridColumn', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'B' }] }] },
          { type: 'gridColumn', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'C' }] }] },
        ],
      }],
    }
    assert.match(renderRichTextToHtml(doc), /^<div class="pilotiq-grid pilotiq-grid-cols-3">/)
  })

  it('clamps invalid column counts to 2', () => {
    const doc: TiptapNode = {
      type: 'doc',
      content: [{
        type: 'grid',
        attrs: { columns: 99 },
        content: [
          { type: 'gridColumn', content: [{ type: 'paragraph' }] },
          { type: 'gridColumn', content: [{ type: 'paragraph' }] },
        ],
      }],
    }
    assert.match(renderRichTextToHtml(doc), /pilotiq-grid-cols-2/)
  })
})
```

`SlashCommandExtension.test.ts` — three cases (extends the existing test
file):

```ts
it('includes Two- and Three-column grid entries under Insert', () => {
  const items = buildSlashItems([], [], '', { hasUpload: false, onInsertImage: () => {} })
  const two   = items.find((i) => i.key === 'grid-2')
  const three = items.find((i) => i.key === 'grid-3')
  assert.ok(two)
  assert.ok(three)
  assert.equal(two!.group,   'Insert')
  assert.equal(three!.group, 'Insert')
})

it('Grid slash items search matches "columns" / "split" / "layout"', () => {
  for (const q of ['columns', 'split', 'layout']) {
    const items = buildSlashItems([], [], q, { hasUpload: false, onInsertImage: () => {} })
    assert.ok(items.some((i) => i.key === 'grid-2'),
      `missing grid-2 for query "${q}"`)
  }
})

it('Three-column entry distinguishes by "three" / "3"', () => {
  const items = buildSlashItems([], [], '3', { hasUpload: false, onInsertImage: () => {} })
  assert.ok(items.some((i) => i.key === 'grid-3'))
})
```

`GridExtension.test.ts` (new) — three cases on the column-clamping pure
helper extracted from `renderHTML`:

```ts
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { clampGridColumns } from './GridExtension.js'

describe('clampGridColumns', () => {
  it('passes through 2 and 3', () => {
    assert.equal(clampGridColumns(2), 2)
    assert.equal(clampGridColumns(3), 3)
  })
  it('falls back to 2 for 1', () => { assert.equal(clampGridColumns(1), 2) })
  it('falls back to 2 for 4+ / NaN / negative / undefined', () => {
    assert.equal(clampGridColumns(4),         2)
    assert.equal(clampGridColumns(NaN),       2)
    assert.equal(clampGridColumns(-1),        2)
    assert.equal(clampGridColumns(undefined), 2)
  })
})
```

`clampGridColumns(value: unknown): GridColumns` is exported from
`GridExtension.ts` so both the editor's `parseHTML` and the renderer can
share one validator.

Expected count: `@pilotiq/tiptap` 137 → **146** (+9).

## Out of scope

- **4+ column grids.** Reads cluttered in a doc; defer until asked. The
  `clampGridColumns` helper rejects them today.
- **Drag-resize column widths.** Equal-width via `grid-cols-N` only. Resize
  needs a separate extension + cell-resize plugin similar to tables; not on
  the audit.
- **Nested grids.** `Grid.content = 'gridColumn{2,3}'` rejects nesting at
  the schema level. If a user really wants a grid-inside-a-grid, they can
  put one inside a custom `Block` and own the layout there.
- **Toolbar column-count popover.** v1 ships a fixed 2-col default on the
  toolbar button + 2-/3- entries on the slash menu. A small popover on the
  toolbar button (matching the `table` row/col picker) is a follow-up
  polish — listed here so we don't relitigate during review.
- **Pasting native `<div class="grid">` HTML from outside the editor.**
  `parseHTML` only matches `div[data-type="grid"]` — naked `<div class>`
  pastes don't round-trip. Filament-equivalent posture (their grid is
  attribute-marked too).

## Acceptance criteria

- `pnpm -F @pilotiq/tiptap test` passes with **146** tests.
- `pnpm -F @pilotiq/tiptap build` is clean.
- Manual smoke (in `playground-pilotiq`):
  - Slash → "Two-column grid" inserts a 2-col grid with empty paragraphs in
    each column; the user can type into either.
  - Slash → "Three-column grid" inserts a 3-col grid.
  - With cursor inside a grid: `gridDelete` toolbar button (or a
    programmatic `unsetGrid` from devtools) unwraps the grid back to a flat
    sequence of paragraphs.
  - `gridDelete` button is greyed-out when the cursor is outside a grid.
- `docs/packages/tiptap.md` + `packages/tiptap/README.md` mention `grid`
  in the slash-menu / toolbar lists.
- `docs/plans/rich-editor-gap.md` row 104 (`Tables — grid / gridDelete`)
  flips from **missing** to ✅ with a cross-link to this doc; the
  audit-status header line at the top updates to "gap closed completely."

## Estimated diff

| File | Change |
|---|---|
| `extensions/GridExtension.ts` (new) | Two `Node.create` + commands + `clampGridColumns` (~120 LOC). |
| `extensions/GridExtension.test.ts` (new) | 3 tests on the helper (~25 LOC). |
| `react/TiptapEditor.tsx` | 1 import + 2 lines in `extensions:` array. |
| `RichTextField.ts` | 1 union-member line + comment. |
| `react/toolbarButtons.tsx` | 2 button defs + 2 icons (~50 LOC). |
| `extensions/SlashCommandExtension.ts` | 2 slash items (~15 LOC). |
| `extensions/SlashCommandExtension.test.ts` | 3 tests (~25 LOC). |
| `render.ts` | 2 cases + `renderGrid` helper + docstring (~15 LOC). |
| `render.test.ts` | 3 tests (~60 LOC). |
| `docs/packages/tiptap.md`, `README.md`, `rich-editor-gap.md`, `packages/tiptap/CLAUDE.md` | ~10 lines. |

## Naming-neutrality reminder

Per `feedback_no_filament_in_user_artifacts.md`: tests / docs / comments
in this plan and the shipped code stay neutral. The reference admin's
button name `gridDelete` happens to read fine in our package too, so we
adopt it directly without coining a new term.
