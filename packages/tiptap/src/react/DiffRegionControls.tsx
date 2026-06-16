/**
 * Floating per-region Approve / Reject controls (#92).
 *
 * Inline-diff regions tag their changed text in the doc with an invisible
 * anchor span (`data-pilotiq-diff-region="<id>"`, added by `InlineDiffExtension`).
 * This overlay measures each anchor's on-screen box and floats a ✓/✕ beside it,
 * so every change — even several on one line — gets its own control without a
 * mid-text widget splitting the intra-line highlight.
 *
 * Resolving a control mirrors the old inline widget: it bubbles the
 * `pilotiqInlineDiffRegionResolve` event (so the host bridge syncs its
 * `PendingSuggestion` queue) AND runs the editor command directly (so it works
 * standalone). The overlay re-measures on every editor update, scroll, and
 * resize. It renders nothing when no diff is active.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { useEditorState } from '@tiptap/react'
import {
  getInlineDiffState,
  INLINE_DIFF_REGION_RESOLVE_EVENT,
  type InlineDiffRegionResolveDetail,
} from '../extensions/InlineDiffExtension.js'

interface ControlPos {
  id:  string
  top: number
}

/** Min vertical spacing between two controls so same-line changes don't overlap. */
const CONTROL_SLOT = 22

function resolveRegion(editor: Editor, id: string, decision: 'accept' | 'reject'): void {
  const detail: InlineDiffRegionResolveDetail = { id, decision }
  editor.view.dom.dispatchEvent(new CustomEvent(INLINE_DIFF_REGION_RESOLVE_EVENT, { bubbles: true, detail }))
  if (decision === 'accept') editor.commands.acceptInlineDiffRegion(id)
  else                       editor.commands.rejectInlineDiffRegion(id)
}

export interface DiffRegionControlsProps {
  editor:       Editor | null
  /** Class prefix, matched to `InlineDiffExtension`'s. Default `'pilotiq-diff'`. */
  classPrefix?: string
}

export function DiffRegionControls({ editor, classPrefix = 'pilotiq-diff' }: DiffRegionControlsProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)
  const [positions, setPositions] = useState<ControlPos[]>([])

  // A token that changes whenever the diff's regions OR the doc change, so the
  // measure effect re-runs after every relevant render.
  const token = useEditorState({
    editor,
    selector: ({ editor: ed }) => {
      const ds = ed ? getInlineDiffState(ed.state) : null
      if (!ds) return ''
      return `${ed!.state.doc.content.size}:${ds.regions.map(r => `${r.id}@${r.from}-${r.to}`).join(',')}`
    },
  }) ?? ''

  const measure = useCallback(() => {
    const container = containerRef.current
    if (!editor || !container) { setPositions([]); return }
    const ds = getInlineDiffState(editor.state)
    if (!ds || ds.regions.length === 0) { setPositions([]); return }
    const root  = editor.view.dom as HTMLElement
    const cRect = container.getBoundingClientRect()
    const next: ControlPos[] = []
    // Document order (by position) so the controls read top-to-bottom regardless
    // of the order the ops were applied in.
    for (const region of [...ds.regions].sort((a, b) => a.from - b.from)) {
      const el = root.querySelector(`[data-pilotiq-diff-region="${cssEscape(region.id)}"]`)
      if (!el) continue
      // First client rect = the START of the (possibly wrapping) change — align
      // the gutter control to the visual line the change begins on.
      const rects = el.getClientRects()
      const rect  = rects.length > 0 ? rects[0]! : el.getBoundingClientRect()
      next.push({ id: region.id, top: rect.top - cRect.top })
    }
    // Controls live in a right-edge gutter at each change's line. Push any that
    // would overlap (two changes sharing one line) down a slot so each stays
    // clickable.
    next.sort((a, b) => a.top - b.top)
    let floor = -Infinity
    for (const p of next) {
      if (p.top < floor) p.top = floor
      floor = p.top + CONTROL_SLOT
    }
    setPositions(next)
  }, [editor])

  // Measure after layout whenever the token changes (regions / doc edits).
  useLayoutEffect(() => { measure() }, [measure, token])

  // Keep positions correct through scroll / resize / late layout (fonts, async
  // content). ResizeObserver covers editor reflow; capture-phase scroll covers
  // any scrolling ancestor.
  useEffect(() => {
    if (!editor) return
    const onChange = (): void => measure()
    const ro = new ResizeObserver(onChange)
    ro.observe(editor.view.dom as HTMLElement)
    if (containerRef.current) ro.observe(containerRef.current)
    window.addEventListener('scroll', onChange, true)
    window.addEventListener('resize', onChange)
    return () => {
      ro.disconnect()
      window.removeEventListener('scroll', onChange, true)
      window.removeEventListener('resize', onChange)
    }
  }, [editor, measure])

  return (
    <div ref={containerRef} className={`${classPrefix}-controls-layer`} aria-hidden={positions.length === 0}>
      {editor && positions.map(p => (
        <span
          key={p.id}
          className={`${classPrefix}-control`}
          style={{ position: 'absolute', top: `${p.top}px`, right: '0.25em' }}
        >
          <button
            type="button"
            className={`${classPrefix}-control-accept`}
            title="Approve this change"
            aria-label="Approve this change"
            onMouseDown={e => e.preventDefault()}
            onClick={() => resolveRegion(editor, p.id, 'accept')}
          >✓</button>
          <button
            type="button"
            className={`${classPrefix}-control-reject`}
            title="Reject this change"
            aria-label="Reject this change"
            onMouseDown={e => e.preventDefault()}
            onClick={() => resolveRegion(editor, p.id, 'reject')}
          >✕</button>
        </span>
      ))}
    </div>
  )
}

/** Minimal CSS.escape fallback — region ids are our own slugs, but quote-safe. */
function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value)
  return value.replace(/["\\]/g, '\\$&')
}
