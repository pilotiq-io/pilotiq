import React from 'react'
import type { ElementMeta } from '../../../schema/Element.js'
import type { RenderActionOptions } from '../action/buttons.js'

// ─── Row-action chrome ──────────────────────────────────────
//
// Inline action strip mounted in the trailing cell of each table row.
// Per-row visibility and disabled state come from the server-side eval
// inside `dispatchTable` (`_visibleActions` / `_disabledActions` keys on
// the row); we just consume the stamped allow/disallow sets here.
//
// The dispatch (link / fetch+JSON / modal / confirm) lives on the
// action layer — `renderActionLike` is injected to keep the cycle
// between this module and `SchemaRenderer.tsx`'s top-level dispatch
// clean.

type RenderActionLike = (el: ElementMeta, index: number, opts?: RenderActionOptions) => React.ReactNode

/**
 * Render row actions inline. Each Action becomes a small button next to
 * the others; an `ActionGroup` placed in row position keeps its dropdown
 * via `ActionGroupTrigger` (the dropdown UX is opt-in via grouping, not
 * a default). The `:id` substitution comes from `opts.ids = [rowId]`.
 */
export function renderRowActions(
  rowId:            string,
  rowRecord:        Record<string, unknown> | undefined,
  actions:          ElementMeta[],
  renderActionLike: RenderActionLike,
): React.ReactNode {
  const rowVisibleSet  = new Set((rowRecord?.['_visibleActions']  as string[] | undefined) ?? [])
  const rowDisabledSet = new Set((rowRecord?.['_disabledActions'] as string[] | undefined) ?? [])

  const visible = actions.filter(a => {
    if (!a['conditional']) return true
    return rowVisibleSet.has(String(a['name'] ?? ''))
  })

  const decorate = (a: ElementMeta): ElementMeta => {
    const name = String(a['name'] ?? '')
    if (rowDisabledSet.has(name)) {
      return { ...a, disabled: true }
    }
    return a
  }

  return (
    <div className="flex items-center justify-end gap-1">
      {visible.map((a, i) => renderActionLike(decorate(a), i, { ids: [rowId], size: 'sm' }))}
    </div>
  )
}
