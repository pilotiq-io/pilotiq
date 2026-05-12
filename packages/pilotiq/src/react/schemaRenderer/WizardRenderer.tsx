import React, { useEffect, useState } from 'react'
import type { ElementMeta } from '../../schema/Element.js'
import { useFormState } from '../FormStateContext.js'
import { readStoredString, writeStoredString } from '../persistedState.js'
import { layoutClasses, resolveIcon, withTooltip } from './helpers.js'
import { actionButtonClass, renderActionBadge, renderActionIcon } from './action/buttons.js'

// ─── Wizard (Plan #8) ───────────────────────────────────────

/**
 * Deps injected from the top-level dispatch so the wizard body can
 * recurse into the main element renderer without creating a cycle
 * with SchemaRenderer.tsx.
 */
export interface WizardRendererDeps {
  renderElement: (el: ElementMeta, index: number) => React.ReactNode
}

/**
 * Resolve the initial active step for `WizardRenderer`. Priority:
 * 1. URL `?<queryKey>=N` (1-based — wizards expose human-friendly indexes
 *    when `Wizard.persistStepInQueryString()` is enabled).
 * 2. `localStorage[<storageKey>]` (0-based, set by the persist effect).
 * 3. `startOnStep` configured on the Wizard.
 *
 * SSR-safe: returns `startOnStep` when `window` is undefined.
 */
function readInitialWizardStep(
  total:       number,
  startOnStep: number,
  storageKey:  string | undefined,
  queryKey:    string | undefined,
): number {
  if (typeof window === 'undefined') return startOnStep
  if (queryKey) {
    try {
      const raw = new URL(window.location.href).searchParams.get(queryKey)
      if (raw !== null && raw !== '') {
        const n = Number(raw) - 1
        if (Number.isFinite(n) && n >= 0 && n < total) return n
      }
    } catch { /* ignore */ }
  }
  if (storageKey) {
    const stored = readStoredString(storageKey)
    if (stored !== null) {
      const n = Number(stored)
      if (Number.isFinite(n) && n >= 0 && n < total) return n
    }
  }
  return startOnStep
}

/**
 * Multi-step form layout. Tracks active step in `useState`, optionally
 * persisted to localStorage and/or the URL query string. On Next click,
 * POSTs `{ step, values }` to the form's `wizardUrl` (stamped by the
 * route handler when the form has a Wizard descendant). 200 → advance;
 * 422 → stamp inline errors; absent `wizardUrl` → advance immediately
 * (no validation).
 *
 * Inactive steps render hidden (display:none) rather than unmounted so
 * controlled inputs preserve their values across step transitions and
 * cross-step `$get` works on the resolved meta.
 *
 * Nav buttons honor `Wizard.submitAction() / nextAction() / previousAction()`
 * — chrome (label / icon / color / size / outlined / iconOnly / tooltip /
 * disabled rules) carries through to the rendered button while the click
 * behavior stays hardwired (advance / recede / submit-form). Bare wizards
 * keep the built-in defaults.
 */
export function WizardRenderer({
  el,
  index,
  deps,
}: {
  el:    ElementMeta
  index: number
  deps:  WizardRendererDeps
}) {
  const { renderElement } = deps
  const formState = useFormState()
  const formId    = formState?.formMeta['formId'] ? String(formState.formMeta['formId']) : undefined
  const wizardUrl = formState?.formMeta['wizardUrl'] ? String(formState.formMeta['wizardUrl']) : undefined

  const steps = (el.children ?? []).filter(c => c.type === 'step')
  const skippable   = Boolean(el['skippable'])
  const startOnStep = Math.max(0, Math.min(Math.max(0, steps.length - 1), Number(el['startOnStep'] ?? 0)))
  const persist     = el['persist'] !== false
  const storageKey  = persist && formId ? `pilotiq.wizard.${formId}.step` : undefined
  const queryKey    = typeof el['persistStepInQueryString'] === 'string'
    ? String(el['persistStepInQueryString'])
    : undefined

  const submitActionMeta   = el['submitAction']   as ElementMeta | undefined
  const nextActionMeta     = el['nextAction']     as ElementMeta | undefined
  const previousActionMeta = el['previousAction'] as ElementMeta | undefined

  // Initial-step resolution priority: URL (?<key>=N, 1-based) > localStorage >
  // startOnStep. URL wins on first paint so deep links land on the right step
  // before localStorage can override. Lazy initializer — resolution runs once.
  const [active, setActive] = useState(() => readInitialWizardStep(steps.length, startOnStep, storageKey, queryKey))
  const [advancing, setAdvancing] = useState(false)
  const [advanceError, setAdvanceError] = useState<string | null>(null)

  // Persist active step changes to localStorage (when enabled).
  useEffect(() => {
    if (!storageKey) return
    writeStoredString(storageKey, String(active))
  }, [storageKey, active])

  // Mirror active step to the URL via replaceState — purely client-side state
  // sync, no SPA re-fetch. 1-based externally; cleared when on the first step
  // so bare URLs don't grow ?step=1 noise.
  useEffect(() => {
    if (!queryKey) return
    if (typeof window === 'undefined') return
    try {
      const url = new URL(window.location.href)
      if (active === 0) url.searchParams.delete(queryKey)
      else              url.searchParams.set(queryKey, String(active + 1))
      window.history.replaceState(window.history.state, '', url.toString())
    } catch { /* ignore */ }
  }, [queryKey, active])

  if (steps.length === 0) {
    return (
      <div key={index} className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        No steps configured.
      </div>
    )
  }

  const isLast  = active === steps.length - 1
  const isFirst = active === 0

  const advance = async (target: number) => {
    setAdvanceError(null)
    if (!wizardUrl) {
      setActive(target)
      return
    }
    setAdvancing(true)
    try {
      const values = formState?.values ?? {}
      // Validate intermediate steps in order when jumping ahead.
      const path = target > active
        ? Array.from({ length: target - active }, (_, k) => active + k)
        : [active] // jumping back is unconstrained
      let landed = active
      for (const stepIdx of path) {
        const res = await fetch(wizardUrl, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body:    JSON.stringify({ step: stepIdx, values }),
        })
        if (res.status === 422) {
          const data = await res.json().catch(() => ({}))
          const errors = (data?.errors ?? {}) as Record<string, string[]>
          if (formState?.applyErrors) formState.applyErrors(errors)
          landed = stepIdx
          setAdvanceError('Please fix the highlighted fields.')
          break
        }
        if (!res.ok) {
          setAdvanceError('Step validation failed.')
          break
        }
        landed = stepIdx + 1
      }
      setActive(target > active ? landed : target)
    } catch {
      setAdvanceError('Step validation failed.')
    } finally {
      setAdvancing(false)
    }
  }

  return (
    <div key={index} className={`flex flex-col gap-6 ${layoutClasses(el)}`.trim()}>
      {/* Step indicator */}
      <ol className="flex items-center gap-3 overflow-x-auto" aria-label="Wizard progress">
        {steps.map((s, i) => {
          const Icon = resolveIcon(s['icon'] ? String(s['icon']) : undefined)
          const reachable = skippable || i <= active
          const isActive = i === active
          const isDone = i < active
          return (
            <li key={i} className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={!reachable || advancing}
                onClick={() => reachable && advance(i)}
                className={[
                  'flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition',
                  isActive ? 'border-primary bg-primary/10 text-foreground'
                  : isDone ? 'border-border text-muted-foreground hover:bg-muted'
                  : 'border-border text-muted-foreground',
                  reachable ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed',
                ].join(' ')}
                aria-current={isActive ? 'step' : undefined}
              >
                <span className={[
                  'flex size-5 items-center justify-center rounded-full text-[11px] font-semibold',
                  isActive ? 'bg-primary text-primary-foreground'
                  : isDone ? 'bg-muted-foreground/20 text-foreground'
                  : 'bg-muted text-muted-foreground',
                ].join(' ')}>
                  {Icon ? <Icon className="size-3" aria-hidden="true" /> : i + 1}
                </span>
                <span className="font-medium">{String(s['label'] ?? `Step ${i + 1}`)}</span>
              </button>
              {i < steps.length - 1 && <span className="h-px w-6 bg-border" aria-hidden="true" />}
            </li>
          )
        })}
      </ol>

      {/* Active step heading */}
      {Boolean(steps[active]?.['description']) && (
        <p className="text-sm text-muted-foreground">{String(steps[active]!['description'])}</p>
      )}

      {/* Step content. Inactive steps render hidden so controlled inputs survive. */}
      {steps.map((s, i) => (
        <div
          key={i}
          className={i === active ? 'flex flex-col gap-4' : 'hidden'}
          aria-hidden={i === active ? undefined : true}
        >
          {(s.children ?? []).map((c, ci) => renderElement(c, ci))}
        </div>
      ))}

      {advanceError && (
        <p className="text-sm text-destructive" role="alert">{advanceError}</p>
      )}

      {/* Step nav. The Form's Save button (in Heading actions or page chrome)
          stays as-is by default — only the final step's submit goes through
          the form. `Wizard.submitAction()` opts into a wizard-owned submit
          button on the final step (use this when the wizard is the entire
          form and there's no page chrome). `nextAction() / previousAction()`
          customize the chrome of the built-in Back / Next buttons. */}
      <div className="flex items-center justify-between gap-2">
        <WizardNavButton
          actionMeta={previousActionMeta}
          fallbackLabel="Back"
          disabled={isFirst || advancing}
          onClick={() => advance(active - 1)}
        />
        {isLast
          ? (submitActionMeta
              ? <WizardNavButton
                  actionMeta={submitActionMeta}
                  fallbackLabel="Submit"
                  type="submit"
                  disabled={advancing}
                        />
              : <span className="text-xs text-muted-foreground">Submit the form to finish.</span>)
          : <WizardNavButton
              actionMeta={nextActionMeta}
              fallbackLabel={advancing ? 'Validating…' : 'Next'}
              disabled={advancing}
              onClick={() => advance(active + 1)}
                />
        }
      </div>
    </div>
  )
}

/**
 * Renders one wizard nav slot (Back / Next / Submit). Falls back to plain
 * built-in chrome (border button for Back, primary button for Next/Submit)
 * when no `actionMeta` is supplied; otherwise reads the resolved Action's
 * chrome (`label / icon / color / size / outlined / iconOnly / tooltip /
 * disabled`) and applies it to a button whose click is hardwired by the
 * surrounding wizard. `type="submit"` lets the Submit slot trigger the
 * surrounding form's onSubmit dispatcher (no `onClick` needed).
 *
 * Hidden actions (`.visible(false)` resolved-away) drop the slot entirely
 * — the resolver returns `undefined` for hidden Action elements, which
 * arrives here as `actionMeta == null` so we fall through to the default
 * chrome. Use `Wizard.skippable()` semantics to hide nav buttons when
 * appropriate; for permanent removal subclass the wizard.
 */
function WizardNavButton({
  actionMeta,
  fallbackLabel,
  type = 'button',
  disabled,
  onClick,
}: {
  actionMeta:     ElementMeta | undefined
  fallbackLabel:  string
  type?:          'button' | 'submit'
  disabled?:      boolean
  onClick?:       () => void
}) {
  // Bare default — keep historical chrome for back-compat (un-customized
  // wizards look identical to before this change).
  if (!actionMeta) {
    const isPrimary = type === 'submit' || fallbackLabel !== 'Back'
    return (
      <button
        type={type}
        disabled={disabled}
        onClick={onClick}
        className={isPrimary
          ? 'rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed'
          : 'rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed'}
      >
        {fallbackLabel}
      </button>
    )
  }

  const ownDisabled = Boolean(actionMeta['disabled'])
  const label       = String(actionMeta['label'] ?? fallbackLabel)
  const tooltip     = actionMeta['tooltip'] ? String(actionMeta['tooltip']) : undefined
  const iconOnly    = Boolean(actionMeta['iconOnly'])
  const className   = actionButtonClass(actionMeta, {})
  const node = (
    <button
      type={type}
      disabled={disabled || ownDisabled}
      onClick={onClick}
      className={`${className} disabled:opacity-50 disabled:cursor-not-allowed`}
      aria-label={iconOnly ? label : undefined}
    >
      {renderActionIcon(actionMeta)}
      {!iconOnly && <span>{label}</span>}
      {renderActionBadge(actionMeta)}
    </button>
  )
  return <>{withTooltip(node, tooltip)}</>
}
