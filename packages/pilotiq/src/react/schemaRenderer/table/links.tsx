import React from 'react'
import { XIcon } from 'lucide-react'
import { useNavigate, type NavigateFn } from '../../navigate.js'
import { buildTableQuery, type TableUrlState } from './url.js'

// ─── Inline link chrome ─────────────────────────────────────
//
// Three small chrome components used by the table body:
//   - RecordCellLink wraps each row-data cell in a real <a href> so
//     cmd-click / right-click "open in new tab" works; plain clicks
//     SPA-nav via useNavigate.
//   - ActiveGroupKeyChip surfaces the current `?groupKey=` drill-in
//     state above the table with an × that clears it.
//   - GroupHeadingLink turns a banded group's heading into a clickable
//     drill-in trigger when the group is scopable.


export function RecordCellLink({
  href, navigate, children,
}: {
  href:     string
  navigate: NavigateFn
  children: React.ReactNode
}) {
  const onClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0) return
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    void navigate(href)
  }
  return (
    <a
      href={href}
      onClick={onClick}
      className="block px-2 py-2 text-inherit no-underline hover:text-inherit focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
    >
      {children}
    </a>
  )
}

/**
 * "Drilled into <Label>: <Value>" chip above the table when a group
 * heading has been clicked. The × clears `?<prefix>groupKey=`, returning
 * the table to its banded view. Real `<a href>` with `useNavigate()`
 * intercept on plain left-click so cmd-click / middle-click open a
 * fresh tab (rare but valid for sharing the banded view URL).
 */
export function ActiveGroupKeyChip({
  label, value, displayValue, clearHref, navigate,
}: {
  label:        string
  value:        string
  displayValue: string
  clearHref:    string
  navigate:     NavigateFn
}) {
  const onClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0) return
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    void navigate(clearHref)
  }
  return (
    <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
      <span className="text-muted-foreground">Drilled into</span>
      <span className="font-medium text-foreground">
        {label ? `${label}: ` : ''}{displayValue || value}
      </span>
      <a
        href={clearHref}
        onClick={onClick}
        aria-label="Clear drill-in"
        className="ms-auto text-muted-foreground hover:text-foreground"
      >
        ×
      </a>
    </div>
  )
}

/**
 * Group-heading text wrapped in a real `<a href>` that SPA-navs into the
 * drilled-in URL. Plain left-click intercepts for `useNavigate()`;
 * cmd/ctrl/shift-click + middle-click fall through to the browser so
 * "open in new tab" semantics work. Visually inherits the heading
 * styling — the link adds underline-on-hover affordance without
 * disturbing the surrounding text-transform / size.
 */
export function GroupHeadingLink({
  href, navigate, children,
}: {
  href:     string
  navigate: NavigateFn
  children: React.ReactNode
}) {
  const onClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0) return
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    void navigate(href)
  }
  return (
    <a
      href={href}
      onClick={onClick}
      className="inline-flex items-center gap-1 text-inherit no-underline hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
    >
      {children}
    </a>
  )
}
