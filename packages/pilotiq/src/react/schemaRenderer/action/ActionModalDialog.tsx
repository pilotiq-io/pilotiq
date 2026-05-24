import React, { useEffect, useRef, useState } from 'react'
import { XIcon } from 'lucide-react'
import type { ElementMeta } from '../../../schema/Element.js'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../../ui/dialog.js'
import { Button } from '../../ui/button.js'
import { useIconFor } from '../../icon-context.js'
import { useNavigate } from '../../navigate.js'
import { useToast } from '../../Toaster.js'

/**
 * Modal-form action dialog. Opens a Dialog with an optional form schema
 * (rendered via the injected `renderFormChild`) plus header/footer chrome
 * from `meta.modal`. On submit, fetches the dispatchUrl with `Accept:
 * application/json` so the server can return:
 *   - 200 `{ ok: true, redirect }` → navigate (SPA via useNavigate)
 *   - 422 `{ ok: false, errors: { field: string[] } }` → inline errors
 *   - 500 `{ ok: false, error }` → server error banner
 *
 * Used for handler-style actions that have a schema and/or a modal config.
 * Confirm-only actions without a schema also flow through here (no fields
 * rendered, just header + footer = same UX as the old confirm dialog).
 *
 * `renderFormChild` is injected (form-layer concern, Phase 4) and
 * `renderElement` is injected for `modalContentFooter` auxiliary Elements
 * (avoids the SchemaRenderer ↔ action cycle).
 */
export function ActionModalDialog({
  trigger,
  meta,
  ids,
  initialValues = {},
  open: controlledOpen,
  onOpenChange,
  renderFormChild,
  renderElement,
}: {
  trigger?:       (open: () => void) => React.ReactNode
  meta:           ElementMeta
  ids:            string[]
  initialValues?: Record<string, unknown>
  open?:          boolean
  onOpenChange?:  (open: boolean) => void
  renderFormChild: (child: ElementMeta, index: number, values: Record<string, unknown>, errors: Record<string, string[]>) => React.ReactNode
  renderElement:  (el: ElementMeta, index: number) => React.ReactNode
}) {
  const [internalOpen, setInternalOpen] = useState(false)
  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : internalOpen
  const setOpen = (o: boolean): void => {
    if (isControlled) onOpenChange?.(o)
    else setInternalOpen(o)
  }
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()
  const { notify } = useToast()

  const modal       = meta['modal']    as {
    heading?:     string
    description?: string
    submitLabel?: string
    cancelLabel?: string
    icon?:        string
    iconColor?:   'gray'|'primary'|'success'|'warning'|'destructive'|'info'
    width?:       'sm'|'md'|'lg'|'xl'
    alignment?:   'start'|'center'|'end'
    slideOver?:   boolean
    closeByClickingAway?: boolean
    closeByEscaping?:     boolean
    stickyHeader?:        boolean
    stickyFooter?:        boolean
    autofocus?:           boolean
    closeButton?:         boolean
  } | undefined
  const confirm     = meta['confirm']  as { title?: string; message: string } | undefined
  const destructive = Boolean(meta['destructive'])
  const dispatchUrl = meta['dispatchUrl'] as string | undefined
  const fields      = (meta.children ?? []) as ElementMeta[]
  const hasForm     = fields.length > 0
  // Filament v5 — auxiliary Elements stamped by the resolver between
  // the body and the footer (Alert / Text / Heading / Action / …).
  const contentFooter = (meta['modalContentFooter'] ?? []) as ElementMeta[]

  const heading     = modal?.heading ?? confirm?.title ?? (hasForm ? String(meta['label'] ?? 'Submit') : 'Are you sure?')
  const description = modal?.description ?? confirm?.message
  const submitLabel = modal?.submitLabel ?? (destructive ? 'Delete' : (hasForm ? 'Submit' : 'Confirm'))
  const cancelLabel = modal?.cancelLabel ?? 'Cancel'
  const widthClass  = ({ sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' } as const)[modal?.width ?? 'md']

  // Modal chrome extras (Tier-2 audit gap #2). Defaults match the
  // previous renderer behaviour exactly — sparse meta keys round-trip
  // as `undefined` so existing modals are byte-identical.
  const closeByClickingAway = modal?.closeByClickingAway !== false
  const closeByEscaping     = modal?.closeByEscaping     !== false
  const stickyHeader        = modal?.stickyHeader === true
  const stickyFooter        = modal?.stickyFooter === true
  const showCloseButton     = modal?.closeButton  === true
  const alignmentClass      = ({ start: 'text-left', center: 'text-center sm:text-left', end: 'text-right' } as const)[modal?.alignment ?? 'center']
  const iconColorClass      = modal?.iconColor
    ? ({
        gray:        'text-muted-foreground',
        primary:     'text-primary',
        success:     'text-emerald-600 dark:text-emerald-300',
        warning:     'text-amber-600   dark:text-amber-300',
        destructive: 'text-destructive',
        info:        'text-blue-600    dark:text-blue-300',
      } as const)[modal.iconColor]
    : undefined
  // Existing default: only the submit button autofocuses (and only for
  // confirm-only modals). When `modalAutofocus(false)` is set the user
  // wants nothing to autofocus; `modalAutofocus(true)` shifts focus to
  // the first form input via a mount-effect ref.
  const explicitAutofocus = modal?.autofocus
  const submitAutofocus   = explicitAutofocus === false ? false
                          : explicitAutofocus === true  ? !hasForm
                          : !hasForm
  const formRef = useRef<HTMLFormElement | null>(null)
  useEffect(() => {
    if (!open || explicitAutofocus !== true || !hasForm) return
    // Wait for the popup to mount + fields to render. Microtask is enough
    // because Base UI's mount transition is decoupled from our render.
    const id = window.requestAnimationFrame(() => {
      const form = formRef.current
      if (!form) return
      const target = form.querySelector<HTMLElement>(
        'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled])',
      )
      if (target) target.focus()
    })
    return () => window.cancelAnimationFrame(id)
  }, [open, explicitAutofocus, hasForm])

  const reset = (): void => { setErrors({}); setServerError(null); setSubmitting(false) }

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault()
    if (!dispatchUrl) return
    setSubmitting(true)
    setServerError(null)
    setErrors({})

    const fd = new FormData(e.currentTarget)
    for (const id of ids) fd.append('ids', id)

    try {
      const res = await fetch(dispatchUrl, {
        method: 'POST',
        headers: { 'Accept': 'application/json' },
        body: fd,
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 422) {
        setErrors((data as { errors?: Record<string, string[]> }).errors ?? {})
        setSubmitting(false)
        return
      }
      if (!res.ok) {
        setServerError(String((data as { error?: string }).error ?? `Request failed (${res.status})`))
        setSubmitting(false)
        return
      }
      setOpen(false)
      reset()
      // Server-emitted notifications come through the JSON response;
      // surface them via the Toaster before navigating so the user
      // sees the success/error toast even when navigation re-renders.
      const notifs = (data as { notifications?: Array<{ id: string; type: string; title: string; body?: string; icon?: string; duration?: number }> }).notifications
      if (notifs && notifs.length > 0) {
        for (const n of notifs) notify(n as Parameters<typeof notify>[0])
      }
      const redirect = String((data as { redirect?: string }).redirect ?? '')
      if (redirect) navigate(redirect)
      else if (typeof window !== 'undefined') navigate(window.location.pathname + window.location.search)
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Submit failed')
      setSubmitting(false)
    }
  }

  // Modal confirm CTA stays SOLID red (stronger than pilotiq's soft
  // `destructive` Button variant used for inline/row actions).
  const confirmOverride = destructive
    ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-destructive/30'
    : ''

  // Resolved icon component for the modal header (Filament-style chrome
  // — leading glyph next to the heading). Passed through `useIconFor`
  // for the same registry lookup used by Resource / Page / Action icons.
  const HeaderIcon = useIconFor(modal?.icon)

  // Build a className for the popup that respects width + sticky-chrome
  // + slideOver. Sticky modes give the popup a max height + overflow so
  // the inner scroll surface exists for sticky to bite onto.
  const stickyMode  = stickyHeader || stickyFooter
  const popupClass  = [
    widthClass,
    stickyMode ? 'max-h-[90vh] overflow-hidden p-0' : '',
  ].filter(Boolean).join(' ')

  // Inner scroll body (only used in sticky mode). When inactive the
  // existing flat layout applies (header / fields / footer flow).
  const headerCls   = `${alignmentClass} ${stickyHeader ? 'sticky top-0 bg-background z-10 px-6 pt-6 pb-3 border-b' : ''}`.trim()
  const footerCls   = stickyFooter   ? 'sticky bottom-0 bg-background z-10 px-6 py-3 border-t' : ''
  const bodyCls     = stickyMode ? 'flex-1 overflow-y-auto px-6 py-3' : ''
  const formCls     = stickyMode ? 'flex flex-col h-full' : ''

  return (
    <>
      {trigger?.(() => { reset(); setOpen(true) })}
      <Dialog
        open={open}
        disablePointerDismissal={!closeByClickingAway}
        onOpenChange={(o, details) => {
          // Cancel Esc-triggered closes when the user has opted out.
          // Base UI's `details.cancel()` aborts the open-state change.
          if (!o && !closeByEscaping && details && (details as { reason?: string }).reason === 'escapeKey') {
            const cancel = (details as { cancel?: () => void }).cancel
            if (typeof cancel === 'function') cancel()
            return
          }
          if (!o) reset()
          setOpen(o)
        }}
      >
        <DialogContent className={popupClass}>
          {showCloseButton && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Close"
              onClick={() => setOpen(false)}
              className="absolute top-3 right-3 z-20 text-muted-foreground"
            >
              <XIcon className="size-4" />
            </Button>
          )}
          <form ref={formRef} onSubmit={onSubmit} className={formCls}>
            <DialogHeader className={headerCls}>
              <DialogTitle className={modal?.icon ? 'flex items-center gap-2' : undefined}>
                {HeaderIcon && (
                  <HeaderIcon
                    aria-hidden
                    className={`size-5 shrink-0 ${iconColorClass ?? ''}`.trim()}
                  />
                )}
                <span>{heading}</span>
              </DialogTitle>
              {description && <DialogDescription>{description}</DialogDescription>}
            </DialogHeader>
            {(hasForm || contentFooter.length > 0) && (
              <div className={`flex flex-col gap-3 py-2 ${bodyCls}`.trim()}>
                {fields.map((f, i) => renderFormChild(f, i, initialValues, errors))}
                {contentFooter.map((c, i) => renderElement(c, fields.length + i))}
              </div>
            )}
            {!hasForm && contentFooter.length === 0 && stickyMode && <div className={bodyCls} />}
            {serverError && (
              <p className={`py-2 text-sm text-destructive ${stickyMode ? 'px-6' : ''}`.trim()}>{serverError}</p>
            )}
            <DialogFooter className={footerCls}>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {cancelLabel}
              </Button>
              <Button type="submit" disabled={submitting} autoFocus={submitAutofocus} className={confirmOverride}>
                {submitting ? 'Working…' : submitLabel}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
