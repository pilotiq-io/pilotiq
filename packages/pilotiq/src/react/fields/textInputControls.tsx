import React, { useState, useCallback } from 'react'
import type { ElementMeta } from '../../schema/Element.js'
import { useToast } from '../Toaster.js'

/**
 * TextField rich affordances live in this file (audit gap #3):
 *  - `revealable()` — eye-icon toggle that flips `type="password"` ↔ `text`
 *  - `copyable(message?)` — copy-to-clipboard button + toast
 *  - `prefixAction(Action) / suffixAction(Action)` — embedded Action buttons
 *  - `mask(pattern)`     — keystroke-by-keystroke pattern formatter
 *
 * The components export a `useTextInputControls(el, name)` hook that
 * returns `{ before, after, type, applyMask }` so the calling renderer
 * can mount the controls inside `FieldShell`'s `before / after` slots
 * and feed the masked value back through the controlled-input bridge.
 *
 * Mask alphabet:
 *   `9` — digit (0-9)
 *   `a` — alpha (A-Za-z)
 *   `*` — alphanumeric or any character
 *   anything else — literal (rendered verbatim)
 *
 * Submitted values are stripped of mask literals via `stripCharacters`
 * (server-side coerce); the client also strips on input so what the user
 * sees in the DOM matches what gets posted.
 */

export interface TextInputControlsResult {
  before: React.ReactNode
  after:  React.ReactNode
  /** Effective `type` attribute — `'password'` when password+!revealed,
   *  `'text'` otherwise. Pass through to the rendered `<input>`. */
  type:   string
  /** When the field has `mask(pattern)` set, format `value` against the
   *  pattern. Returns the formatted string. Skips when no mask. */
  applyMask: (value: string) => string
}

/** `renderAction(meta)` is supplied by the caller (SchemaRenderer's
 *  `renderElement`) to avoid an import cycle between the controls
 *  module and the main schema renderer. */
export function useTextInputControls(
  el:           ElementMeta,
  name:         string,
  renderAction: (meta: ElementMeta) => React.ReactNode,
): TextInputControlsResult {
  const isPassword  = el['password']   === true
  const isRevealable= el['revealable'] === true
  const isCopyable  = el['copyable']   === true
  const copyMessage = (el['copyMessage'] as string | undefined) ?? 'Copied!'
  const mask        = el['mask']       as string | undefined
  const prefixAct   = el['prefixAction'] as ElementMeta | undefined
  const suffixAct   = el['suffixAction'] as ElementMeta | undefined

  const [revealed, setRevealed] = useState(false)
  const inputId = name

  const onCopy = useCopyHandler(inputId, copyMessage)

  const type = isPassword && !revealed ? 'password' : 'text'

  const beforeNodes: React.ReactNode[] = []
  if (prefixAct) beforeNodes.push(
    <div key="pre-act" className="shrink-0">{renderAction(prefixAct)}</div>
  )

  const afterNodes: React.ReactNode[] = []
  if (isCopyable)   afterNodes.push(<CopyButton    key="copy"    onCopy={onCopy} />)
  if (isRevealable && isPassword) {
    afterNodes.push(
      <RevealToggle
        key="reveal"
        revealed={revealed}
        onToggle={() => setRevealed(v => !v)}
      />
    )
  }
  if (suffixAct) afterNodes.push(
    <div key="suf-act" className="shrink-0">{renderAction(suffixAct)}</div>
  )

  const applyMask = useCallback((value: string): string => {
    if (!mask) return value
    return formatWithMask(value, mask)
  }, [mask])

  return {
    before: beforeNodes.length > 0 ? <>{beforeNodes}</> : null,
    after:  afterNodes.length  > 0 ? <>{afterNodes}</>  : null,
    type,
    applyMask,
  }
}

/**
 * Format `raw` against `mask` using the documented alphabet. Literals
 * in the mask render verbatim and consume no source character; pattern
 * tokens consume the next matching source character (skipping
 * mismatches so the user can paste an already-formatted value and have
 * it re-format cleanly).
 */
export function formatWithMask(raw: string, mask: string): string {
  let out = ''
  let r   = 0
  for (let m = 0; m < mask.length; m++) {
    const token = mask[m]!
    const isPattern = token === '9' || token === 'a' || token === '*'
    if (isPattern) {
      if (r >= raw.length) break
      // Advance through `raw` until we find a matching character.
      while (r < raw.length) {
        const ch = raw[r]!
        const ok = token === '9'
          ? /[0-9]/.test(ch)
          : token === 'a'
            ? /[A-Za-z]/.test(ch)
            : true
        r++
        if (ok) { out += ch; break }
      }
    } else {
      // Literal character — emit even when raw is exhausted, so a
      // partially-typed value still shows the upcoming chrome
      // (e.g. `(415) ` after the user types three digits). Consume the
      // matching raw char if present so a paste of the already-formatted
      // value doesn't double up.
      out += token
      if (raw[r] === token) r++
    }
  }
  return out
}

function useCopyHandler(
  inputId: string,
  message: string,
): () => void {
  const { notify } = useToast()
  return () => {
    if (typeof document === 'undefined') return
    const el = document.getElementById(inputId) as HTMLInputElement | HTMLTextAreaElement | null
    if (!el) return
    const value = el.value
    const writeText = navigator?.clipboard?.writeText?.bind(navigator.clipboard)
    if (writeText) {
      writeText(value).then(
        () => notify({ type: 'success', title: message, duration: 2000 }),
        () => notify({ type: 'error',   title: 'Copy failed' }),
      )
    } else {
      // Fallback: select + execCommand. Modern browsers all expose
      // navigator.clipboard, so this is rare-path.
      el.select()
      try {
        document.execCommand('copy')
        notify({ type: 'success', title: message, duration: 2000 })
      } catch {
        notify({ type: 'error', title: 'Copy failed' })
      }
      el.setSelectionRange?.(0, 0)
    }
  }
}

function ChromeButton({ onClick, ariaLabel, children, autoFocus }: {
  onClick:    (e: React.MouseEvent) => void
  ariaLabel:  string
  children:   React.ReactNode
  autoFocus?: boolean
}): React.ReactElement {
  return (
    <button
      type="button"
      tabIndex={-1}
      onClick={(e) => { e.preventDefault(); onClick(e) }}
      aria-label={ariaLabel}
      className="inline-flex items-center justify-center rounded-md size-8 text-muted-foreground hover:bg-accent hover:text-accent-foreground shrink-0"
      autoFocus={autoFocus}
    >
      {children}
    </button>
  )
}

function CopyButton({ onCopy }: { onCopy: () => void }): React.ReactElement {
  return (
    <ChromeButton onClick={onCopy} ariaLabel="Copy">
      <CopyIcon className="size-4" />
    </ChromeButton>
  )
}

function RevealToggle({ revealed, onToggle }: {
  revealed: boolean
  onToggle: () => void
}): React.ReactElement {
  return (
    <ChromeButton
      onClick={onToggle}
      ariaLabel={revealed ? 'Hide value' : 'Show value'}
    >
      {revealed ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
    </ChromeButton>
  )
}

// ─── Inline icon SVGs (avoids pulling lucide-react import into this file
// without checking it's already a dep — keeps the bundle stable). ────

function CopyIcon(props: React.SVGProps<SVGSVGElement>): React.ReactElement {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  )
}

function EyeIcon(props: React.SVGProps<SVGSVGElement>): React.ReactElement {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function EyeOffIcon(props: React.SVGProps<SVGSVGElement>): React.ReactElement {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" x2="22" y1="2" y2="22" />
    </svg>
  )
}

