import { useMemo, useRef, useState } from 'react'
import {
  usePendingSuggestionsForField,
  usePendingSuggestions,
  type PendingSuggestion,
} from '@pilotiq/pilotiq/react'

/** Per-region before/after text preview, derived from diff state by the host renderer. */
export interface DiffRegionPreview {
  id:     string
  before: string
  after:  string
}

export interface SuggestionBannerProps {
  fieldName: string
  onApplyWholeField: (suggestedValue: string) => void
  onAcceptViaEditor?: () => void
  onRejectViaEditor?: () => void
  /**
   * Before/after text for each active diff region, derived from the
   * editor's `InlineDiffExtension` state by the host renderer. When
   * provided, the banner gains a collapsible accordion showing each change
   * with per-region Approve/Decline controls.
   */
  diffRegionPreviews?: readonly DiffRegionPreview[]
  /**
   * Per-region resolve callback (Accept or Reject a single change). The
   * host threads the editor's command + event dispatch through here so the
   * banner's per-region ✓/✗ buttons don't need direct editor access.
   */
  onResolveRegion?: (id: string, decision: 'accept' | 'reject') => void
}

export function useSuggestionBanner(fieldName: string): {
  pending:    readonly PendingSuggestion[]
  approveAll: (apply: (value: string) => void) => void
  rejectAll:  () => void
} {
  const { list, dismiss } = usePendingSuggestionsForField(fieldName)
  const pending = useMemo(() => list.filter(s => !hasEditorRange(s)), [list])

  const approveAll = (apply: (value: string) => void): void => {
    for (const s of pending) {
      if (typeof s.suggestedValue === 'string') apply(s.suggestedValue)
      dismiss(s.id)
    }
  }
  const rejectAll = (): void => { for (const s of pending) dismiss(s.id) }

  return { pending, approveAll, rejectAll }
}

function hasEditorRange(s: PendingSuggestion): boolean {
  const meta  = (s.meta ?? {}) as Record<string, unknown>
  const range = meta['editorRange'] as { from?: unknown; to?: unknown } | undefined
  return !!(range && typeof range.from === 'number' && typeof range.to === 'number')
}

function truncate(text: string, max = 52): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`
}

export function SuggestionBanner({
  fieldName,
  onApplyWholeField,
  onAcceptViaEditor,
  onRejectViaEditor,
  diffRegionPreviews = [],
  onResolveRegion,
}: SuggestionBannerProps): React.ReactElement | null {
  const { pending, approveAll, rejectAll } = useSuggestionBanner(fieldName)
  const { dismiss } = usePendingSuggestions()
  const [expanded, setExpanded] = useState(false)

  // Track how many have been resolved so we can show "X/N resolved".
  // Incremented by per-region actions; also bumped in bulk on Accept-all/Reject-all.
  const [resolvedCount, setResolvedCount] = useState(0)

  // When new regions arrive (more than current total), reset the resolved counter
  // so a second AI run shows a fresh "0/N" rather than stale counts.
  const totalRef = useRef(diffRegionPreviews.length)
  const currentTotal = resolvedCount + diffRegionPreviews.length
  if (diffRegionPreviews.length > totalRef.current) {
    // More regions than we've tracked — new batch arrived; reset.
    totalRef.current = diffRegionPreviews.length
    // (We deliberately mutate during render here — the only safe way to
    // re-seed without a useEffect delay before the first paint shows "0/0".)
  }
  const displayTotal = Math.max(totalRef.current, currentTotal)

  if (pending.length === 0) return null

  const single     = pending.length === 1
  const hasPreview = diffRegionPreviews.length > 0 || resolvedCount > 0

  const handleAcceptAll = (): void => {
    setResolvedCount(c => c + diffRegionPreviews.length)
    if (onAcceptViaEditor) {
      onAcceptViaEditor()
      for (const s of pending) dismiss(s.id)
      return
    }
    approveAll(onApplyWholeField)
  }

  const handleRejectAll = (): void => {
    setResolvedCount(c => c + diffRegionPreviews.length)
    if (onRejectViaEditor) {
      onRejectViaEditor()
      for (const s of pending) dismiss(s.id)
      return
    }
    rejectAll()
  }

  const handleResolveOne = (id: string, decision: 'accept' | 'reject'): void => {
    setResolvedCount(c => c + 1)
    onResolveRegion?.(id, decision)
  }

  return (
    <div
      role="region"
      aria-label="AI suggested changes"
      data-pilotiq-suggestion-banner=""
      className="mt-1.5 overflow-hidden rounded-md border border-border"
    >
      {/* Header row — left side is the accordion toggle */}
      <div className="flex items-center">
        {/* Toggle area — sparkle + label + resolved count + chevron */}
        <button
          type="button"
          className="flex flex-1 items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/40"
          onClick={() => setExpanded(e => !e)}
          aria-expanded={expanded}
        >
          {/* Sparkle icon */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-3.5 shrink-0 text-muted-foreground/60"
            aria-hidden="true"
          >
            <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
          </svg>

          <span className="text-xs font-medium text-foreground/80">
            {single ? 'Change suggested' : `${pending.length} changes suggested`}
          </span>

          {/* Resolved count — only shown when we know the total */}
          {hasPreview && displayTotal > 0 && (
            <span className="text-[11px] text-muted-foreground/60 tabular-nums">
              {resolvedCount}/{displayTotal}
            </span>
          )}

          {/* Chevron */}
          {hasPreview && (
            <span className="ml-auto text-[11px] text-muted-foreground/50">
              {expanded ? '▴' : '▾'}
            </span>
          )}
        </button>

        {/* Action buttons — right side, outside the toggle area */}
        <div
          className="flex items-center gap-1.5 px-3"
          onClick={e => e.stopPropagation()}
        >
          <button
            type="button"
            className="rounded border border-rose-200 px-2.5 py-1 text-xs text-rose-700 transition-colors hover:bg-rose-50 dark:border-rose-800 dark:text-rose-400 dark:hover:bg-rose-950/30"
            onClick={handleRejectAll}
          >
            {single ? 'Reject' : 'Reject all'}
          </button>
          <button
            type="button"
            className="rounded bg-foreground px-2.5 py-1 text-xs text-background transition-colors hover:bg-foreground/85"
            onClick={handleAcceptAll}
          >
            {single ? 'Accept' : 'Accept all'}
          </button>
        </div>
      </div>

      {/* Accordion body */}
      {expanded && hasPreview && (
        <div className="border-t border-border bg-muted/20 px-3 py-2 space-y-2">
          {diffRegionPreviews.map((r, i) => (
            <div key={r.id} className="flex items-start gap-2">
              {/* Change number */}
              <span className="mt-0.5 shrink-0 text-[11px] tabular-nums text-muted-foreground/50">
                {i + 1}.
              </span>

              {/* Before → after inline */}
              <p className="min-w-0 flex-1 truncate text-xs leading-relaxed">
                {r.before && (
                  <span className="text-rose-600 line-through opacity-75 dark:text-rose-400">
                    {truncate(r.before)}
                  </span>
                )}
                {r.before && r.after && (
                  <span className="mx-1 text-muted-foreground/40">→</span>
                )}
                {r.after && (
                  <span className="text-emerald-700 dark:text-emerald-400">
                    {truncate(r.after)}
                  </span>
                )}
              </p>

              {/* Per-region ✗ / ✓ buttons */}
              {onResolveRegion && (
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    title="Reject this change"
                    className="rounded border border-rose-200 p-1 text-[11px] leading-none text-rose-600 transition-colors hover:bg-rose-50 dark:border-rose-800 dark:text-rose-400 dark:hover:bg-rose-950/30"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => handleResolveOne(r.id, 'reject')}
                  >
                    ✕
                  </button>
                  <button
                    type="button"
                    title="Accept this change"
                    className="rounded border border-emerald-200 p-1 text-[11px] leading-none text-emerald-600 transition-colors hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => handleResolveOne(r.id, 'accept')}
                  >
                    ✓
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
