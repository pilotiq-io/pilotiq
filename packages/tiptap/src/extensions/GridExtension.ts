import { Node, mergeAttributes } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    grid: {
      /**
       * Insert a multi-column grid at the cursor. Each column gets one
       * empty paragraph. Defaults to 2 columns; pass `{ columns: 3 }` for
       * the three-column variant.
       */
      setGrid: (options?: { columns?: GridColumns }) => ReturnType
      /**
       * Unwrap the enclosing grid: replace the grid node with the flat
       * concatenation of every column's children. No-op when the cursor
       * isn't inside a grid.
       */
      unsetGrid: () => ReturnType
    }
  }
}

/** Allowed column counts. */
export type GridColumns = 2 | 3

const ALLOWED_COLUMNS: ReadonlyArray<GridColumns> = [2, 3] as const

/**
 * Coerce any input into one of the allowed column counts. Out-of-range
 * values, NaN, undefined, and non-numeric strings all fall back to 2 — the
 * conservative default.
 *
 * Exported for unit tests and so the renderer in `render.ts` can share the
 * same validator with the editor's `parseHTML`.
 */
export function clampGridColumns(raw: unknown): GridColumns {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) return 2
  const trunc = Math.trunc(n)
  return ALLOWED_COLUMNS.includes(trunc as GridColumns) ? (trunc as GridColumns) : 2
}

/**
 * Multi-column grid container. Schema constrains it to exactly 2 or 3
 * `gridColumn` children, so the user can't construct a 1-column or
 * 4-column grid through any path (toolbar, slash, paste).
 *
 * Renders to `<div data-type="grid" data-columns="N" class="pilotiq-grid
 * pilotiq-grid-cols-N">` — consumers ship the matching CSS (Tailwind
 * `grid grid-cols-N gap-4` or hand-rolled). Same posture as `lead` /
 * `small` size marks: the package stays CSS-free.
 */
export const Grid = Node.create({
  name:     'grid',
  group:    'block',
  content:  'gridColumn{2,3}',
  defining: true,

  addAttributes() {
    return {
      columns: {
        default: 2 as GridColumns,
        parseHTML: (el) => clampGridColumns(el.getAttribute('data-columns')),
        renderHTML: (attrs) => {
          const cols = clampGridColumns(attrs['columns'])
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
        (options) =>
        ({ chain }) => {
          const columns = clampGridColumns(options?.columns ?? 2)
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
            // Concatenate each column's children into a flat block list.
            const flat: unknown[] = []
            node.forEach((col) => {
              col.forEach((child) => flat.push(child))
            })
            if (dispatch) tr.replaceWith(start, end, flat as never)
            return true
          }
          return false
        },
    }
  },
})

/**
 * Individual column inside a `grid`. Belongs to its own custom group so the
 * top-level document only accepts `Grid` (not bare `gridColumn`s).
 */
export const GridColumn = Node.create({
  name:     'gridColumn',
  group:    'gridColumn',
  content:  'block+',
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-type="gridColumn"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'gridColumn' }), 0]
  },
})
