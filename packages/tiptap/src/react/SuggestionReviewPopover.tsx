/**
 * Single floating popover wizard for reviewing pending inline-diff
 * suggestions one at a time (#249). Replaces the scattered per-region
 * ✓/✕ overlay (`DiffRegionControls`) with a step-through card that
 * anchors to each suggestion's DOM element in turn.
 *
 * The popover stays open while there are pending regions and the user
 * has not dismissed it. After Accept or Reject the region is removed
 * from the editor state and the popover auto-advances (sorted region
 * list shrinks, current index clamps, next region shown). Dismiss (×)
 * hides the card without resolving anything — it re-opens when a new
 * suggestion arrives.
 *
 * Click-to-jump: clicking any diff-decorated element in the editor
 * (`[data-pilotiq-diff-region]`) snaps the popover to that suggestion.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { useEditorState } from '@tiptap/react'
import { Popover } from '@base-ui/react/popover'
import {
  getInlineDiffState,
  INLINE_DIFF_REGION_RESOLVE_EVENT,
  type InlineDiffRegionResolveDetail,
} from '../extensions/InlineDiffExtension.js'
import { extractChangedPair } from '../extensions/wordDiff.js'

function resolveRegion(editor: Editor, id: string, decision: 'accept' | 'reject'): void {
  const detail: InlineDiffRegionResolveDetail = { id, decision }
  editor.view.dom.dispatchEvent(new CustomEvent(INLINE_DIFF_REGION_RESOLVE_EVENT, { bubbles: true, detail }))
  if (decision === 'accept') editor.commands.acceptInlineDiffRegion(id)
  else                       editor.commands.rejectInlineDiffRegion(id)
}

function findAnchorEl(editorDom: HTMLElement, id: string, classPrefix: string): Element | null {
  const sel = `[data-pilotiq-diff-region="${cssEscape(id)}"]`
  // Priority: prefer the deleted (red) element — it sits above the green row
  // and is the natural anchor for the change the user is deciding on.
  //   Inline mode: .pilotiq-diff-deleted-lines / .pilotiq-diff-deleted
  //   Lines mode:  .pilotiq-diff-deleted-lines (hunk widget, matched by ownerId)
  //                .pilotiq-diff-inserted-line-changed (per-word highlight, matched by wordRegion)
  //                .pilotiq-diff-inserted-line (green row, matched by ownerId as fallback)
  return editorDom.querySelector(`.${classPrefix}-deleted-lines${sel}`)
      ?? editorDom.querySelector(`.${classPrefix}-deleted${sel}`)
      ?? editorDom.querySelector(`.${classPrefix}-inserted-line-changed${sel}`)
      ?? editorDom.querySelector(`.${classPrefix}-inserted-line${sel}`)
      ?? editorDom.querySelector(sel)
}

function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value)
  return value.replace(/["\\]/g, '\\$&')
}

function truncate(text: string, max = 60): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`
}

export interface SuggestionReviewPopoverProps {
  editor:       Editor | null
  classPrefix?: string
}

export function SuggestionReviewPopover({
  editor,
  classPrefix = 'pilotiq-diff',
}: SuggestionReviewPopoverProps): React.ReactElement {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [dismissed,    setDismissed]    = useState(false)

  // Subscribe to region changes via a stable string token (array identity
  // would re-render on every state change). Mirrors DiffRegionControls.
  const token = useEditorState({
    editor,
    selector: ({ editor: ed }) => {
      const ds = ed ? getInlineDiffState(ed.state) : null
      if (!ds) return ''
      return `${ed!.state.doc.content.size}:${ds.regions.map(r => `${r.id}@${r.from}-${r.to}`).join(',')}`
    },
  }) ?? ''

  // Derive sorted regions synchronously from the live state (token drives renders).
  const ds = editor ? getInlineDiffState(editor.state) : null
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const regions = useMemo(() => (ds ? [...ds.regions].sort((a, b) => a.from - b.from) : []), [token])

  const total     = regions.length
  const safeIndex = total > 0 ? Math.min(currentIndex, total - 1) : 0
  const region    = regions[safeIndex] ?? null

  // Clamp index when a region is resolved (list shrinks).
  useEffect(() => {
    if (total > 0 && currentIndex >= total) setCurrentIndex(total - 1)
  }, [total, currentIndex])

  // Re-open when new suggestions arrive so the user sees every incoming diff.
  const prevTotalRef = useRef(0)
  useEffect(() => {
    if (total > prevTotalRef.current) setDismissed(false)
    prevTotalRef.current = total
  }, [total])

  // Click-to-jump: clicking any diff-decorated node snaps the popover to it.
  useEffect(() => {
    if (!editor) return
    const dom = editor.view.dom
    const onClick = (e: MouseEvent): void => {
      const target = (e.target as Element | null)?.closest('[data-pilotiq-diff-region]')
      if (!target) return
      const id  = target.getAttribute('data-pilotiq-diff-region')
      if (!id)  return
      const idx = regions.findIndex(r => r.id === id)
      if (idx < 0) return
      setCurrentIndex(idx)
      setDismissed(false)
    }
    dom.addEventListener('click', onClick)
    return () => dom.removeEventListener('click', onClick)
  }, [editor, regions])

  // Virtual element anchor — lazily resolves the current region's DOM node so
  // position updates automatically as the user accepts/rejects and the DOM changes.
  const anchor = useMemo(() => {
    if (!editor || !region) return null
    const editorDom = editor.view.dom as HTMLElement
    const id = region.id
    return {
      getBoundingClientRect: (): DOMRect => {
        // 1. Prefer the specific diff decoration element (works in both modes).
        const el = findAnchorEl(editorDom, id, classPrefix)
        if (el) {
          const rects = el.getClientRects()
          if (rects.length > 0) return rects[0]!
          const r = el.getBoundingClientRect()
          if (r.width > 0 || r.height > 0) return r
        }
        // 2. Fallback: use ProseMirror cursor coordinates for region.from.
        // Fires in lines mode when a region's word highlight doesn't exist
        // (non-textblock node, empty bRanges) — avoids snapping to (0, 0).
        // Look up the live `from` position by ID so it's always current even
        // if the doc shifted while this memo closure was alive.
        try {
          if (editor) {
            const liveRegion = getInlineDiffState(editor.state)?.regions.find(r => r.id === id)
            if (liveRegion) {
              const safePos = Math.min(liveRegion.from, editor.state.doc.content.size - 1)
              const coords  = editor.view.coordsAtPos(safePos)
              return new DOMRect(coords.left, coords.top, 0, coords.bottom - coords.top)
            }
          }
        } catch { /* no-op */ }
        return new DOMRect(0, 0, 0, 0)
      },
    }
  // region.id + editor identity drives anchor re-creation.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, region?.id, classPrefix])

  // Content preview — show the specific changed word(s) for this region, not
  // the entire paragraph. Strategy:
  //   1. Get the full text of the enclosing block in both the baseline doc
  //      and the current doc.
  //   2. Run wordLevelDiff to identify which word-tokens changed.
  //   3. Find the changed pair whose after-range contains `region.from`'s
  //      offset within the block — that's the word this region corresponds to.
  //   4. Return that specific (before, after) pair so the popover shows
  //      "tst → test" rather than the whole sentence.
  const { baselineText, suggestedText } = (() => {
    if (!region || !editor) return { baselineText: '', suggestedText: '' }
    const ds = getInlineDiffState(editor.state)
    if (!ds) return { baselineText: '', suggestedText: '' }
    try {
      const $pos     = editor.state.doc.resolve(region.from)
      const blockIdx = $pos.index(0)
      if (blockIdx >= ds.baseline.childCount) return { baselineText: '', suggestedText: '' }
      // textBetween(…, ' ', ' ') inserts a space for leaf nodes (hard-breaks,
      // images) so "hello\nworld" doesn't collapse to "helloworld".
      const afterText     = $pos.parent.textBetween(0, $pos.parent.content.size, ' ', ' ').trim()
      const beforeText    = ds.baseline.child(blockIdx).textBetween(0, ds.baseline.child(blockIdx).content.size, ' ', ' ').trim()
      const offsetInAfter = $pos.parentOffset
      const pair          = extractChangedPair(beforeText, afterText, offsetInAfter)
      return { baselineText: pair.before, suggestedText: pair.after }
    } catch {
      return { baselineText: '', suggestedText: '' }
    }
  })()

  const handleAccept  = (): void => { if (editor && region) resolveRegion(editor, region.id, 'accept') }
  const handleReject  = (): void => { if (editor && region) resolveRegion(editor, region.id, 'reject') }
  const handleDismiss = (): void => setDismissed(true)

  const open = total > 0 && !dismissed

  return (
    <Popover.Root open={open} onOpenChange={() => {}}>
      <Popover.Portal>
        <Popover.Positioner
          anchor={anchor}
          positionMethod="fixed"
          side="top"
          align="center"
          sideOffset={6}
          className="isolate z-50"
        >
          <Popover.Popup
            initialFocus={false}
            finalFocus={false}
            tabIndex={-1}
            className="relative origin-(--transform-origin) w-52 rounded-md border bg-popover text-popover-foreground shadow-md outline-hidden data-[side=top]:slide-in-from-bottom-2 data-[side=bottom]:slide-in-from-top-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
          >
            {/* Dismiss — unobtrusive corner button */}
            <button
              type="button"
              className="absolute right-1 top-1 rounded p-0.5 text-[10px] leading-none text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground"
              title="Dismiss"
              aria-label="Dismiss suggestion popover"
              onMouseDown={e => e.preventDefault()}
              onClick={handleDismiss}
            >
              ×
            </button>

            {/* Content preview — inline "old → new" */}
            {(baselineText || suggestedText) && (
              <p className="px-3 pb-1 pt-2.5 pr-5 text-xs leading-relaxed">
                {baselineText && (
                  <span className="text-rose-600 line-through opacity-75 dark:text-rose-400">
                    {truncate(baselineText, 32)}
                  </span>
                )}
                {baselineText && suggestedText && (
                  <span className="mx-1 text-muted-foreground/40">→</span>
                )}
                {suggestedText && (
                  <span className="text-emerald-700 dark:text-emerald-400">
                    {truncate(suggestedText, 32)}
                  </span>
                )}
              </p>
            )}

            {/* Actions — step counter with prev/next + compact icon buttons */}
            <div className={`flex items-center justify-between px-3 pb-2.5 ${baselineText || suggestedText ? 'pt-1.5' : 'pt-3'}`}>
              {/* Step navigation */}
              <div className="flex items-center gap-1">
                {total > 1 && (
                  <button
                    type="button"
                    className="rounded p-0.5 text-[11px] leading-none text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
                    disabled={safeIndex === 0}
                    title="Previous change"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => setCurrentIndex(i => Math.max(0, i - 1))}
                  >
                    ‹
                  </button>
                )}
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {safeIndex + 1}/{total}
                </span>
                {total > 1 && (
                  <button
                    type="button"
                    className="rounded p-0.5 text-[11px] leading-none text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
                    disabled={safeIndex === total - 1}
                    title="Next change"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => setCurrentIndex(i => Math.min(total - 1, i + 1))}
                  >
                    ›
                  </button>
                )}
              </div>

              {/* Reject / Accept icon buttons */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  title="Reject"
                  className="rounded border border-rose-200 px-2 py-1 text-[11px] leading-none text-rose-600 transition-colors hover:bg-rose-50 dark:border-rose-800 dark:text-rose-400 dark:hover:bg-rose-950/30"
                  onMouseDown={e => e.preventDefault()}
                  onClick={handleReject}
                >
                  ✕
                </button>
                <button
                  type="button"
                  title="Accept"
                  className="rounded border border-emerald-200 px-2 py-1 text-[11px] leading-none text-emerald-600 transition-colors hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
                  onMouseDown={e => e.preventDefault()}
                  onClick={handleAccept}
                >
                  ✓
                </button>
              </div>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
