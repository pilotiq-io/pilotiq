import React, { useState } from 'react'
import type { ElementMeta } from '../../../schema/Element.js'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../../ui/dialog.js'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '../../ui/dropdown-menu.js'
import { Button } from '../../ui/button.js'
import { useNavigate } from '../../navigate.js'
import { useToast } from '../../Toaster.js'
import { withTooltip } from '../helpers.js'
import { actionButtonClass } from './buttons.js'
import { dispatchHandlerAction, dispatchMethodAction } from './helpers.js'
import { ActionModalDialog } from './ActionModalDialog.js'

/**
 * Trigger button + dropdown menu for an `ActionGroup` meta. Reuses the
 * action button styling helpers so a group's chrome (color/size/outlined/
 * tooltip/iconButton) matches a regular Action. Each child Action
 * dispatches via the same logic as `renderAction` — link/method/handler/
 * confirm/modal — but routed through a `pending` state so the dropdown
 * closes before any dialog opens (shadcn pattern: one popup at a time).
 *
 * `renderFormChild` + `renderElement` are injected through to
 * `ActionModalDialog` for modal-form bodies. They originate in
 * `SchemaRenderer.tsx` (form / dispatch layers).
 */
export function ActionGroupTrigger({
  el,
  ids = [],
  renderFormChild,
  renderElement,
}: {
  el:   ElementMeta
  ids?: string[]
  renderFormChild: (child: ElementMeta, index: number, values: Record<string, unknown>, errors: Record<string, string[]>) => React.ReactNode
  renderElement:  (el: ElementMeta, index: number) => React.ReactNode
}) {
  const [pending, setPending] = useState<ElementMeta | null>(null)
  const navigate = useNavigate()
  const { notify } = useToast()

  const name        = String(el['name'] ?? '')
  const label       = String(el['label'] ?? name)
  const tooltip     = el['tooltip'] as string | undefined
  const iconOnly    = Boolean(el['iconOnly'])
  const isDisabled  = Boolean(el['disabled'])
  const childActions = (el.children ?? []).filter(c => c.type === 'action')

  const className = actionButtonClass(el, {}) + (isDisabled ? ' opacity-50 cursor-not-allowed pointer-events-none' : '')
  const ariaLabel = iconOnly ? label : undefined

  // Direct-dispatch path mirrors renderAction's branches but skipping
  // confirm/modal (those queue into `pending` so the dropdown can close).
  const dispatch = (action: ElementMeta): void => {
    const href        = action['href']        as string | undefined
    const method      = action['method']      as 'post' | 'put' | 'patch' | 'delete' | undefined
    const actionUrl   = action['action']      as string | undefined
    const dispatchUrl = action['dispatchUrl'] as string | undefined
    if (href) {
      navigate(href)
      return
    }
    if (method && actionUrl) {
      void dispatchMethodAction(actionUrl, method, navigate, notify)
      return
    }
    if (dispatchUrl) {
      void dispatchHandlerAction(dispatchUrl, ids, navigate, notify)
      return
    }
  }

  const onItemClick = (action: ElementMeta): void => {
    if (action['modal'] || action['confirm']) {
      setPending(action)
      return
    }
    dispatch(action)
  }

  const pendingHandler     = pending && pending['dispatchUrl']
  const pendingConfirmOnly = pending && !pendingHandler && (pending['confirm'] as { title?: string; message: string } | undefined)
  const pendingConfirm     = pendingConfirmOnly || (pending?.['confirm'] as { title?: string; message: string } | undefined)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={(props) => withTooltip(
            <button
              {...props}
              type="button"
              className={className}
              data-action-group-name={name}
              aria-label={ariaLabel}
            >
              {iconOnly ? null : <span>{label}</span>}
            </button>,
            tooltip,
          ) as React.ReactElement}
        />
        <DropdownMenuContent align="end">
          {childActions.map((a, i) => {
            const itemLabel    = String(a['label'] ?? a['name'] ?? '')
            const destructive  = Boolean(a['destructive'])
            const itemDisabled = Boolean(a['disabled'])
            return (
              <DropdownMenuItem
                key={i}
                destructive={destructive}
                disabled={itemDisabled}
                onClick={() => { if (!itemDisabled) onItemClick(a) }}
              >
                {itemLabel}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Modal / handler-style pending — fetch+JSON dispatch via ActionModalDialog. */}
      {pendingHandler && pending && (
        <ActionModalDialog
          meta={pending}
          ids={ids}
          open={true}
          onOpenChange={(o) => { if (!o) setPending(null) }}
          renderFormChild={renderFormChild}
          renderElement={renderElement}
        />
      )}

      {/* Form-method confirm — fetch+JSON dispatch via dispatchMethodAction; SPA-navigates on success. */}
      <Dialog
        open={Boolean(pendingConfirmOnly)}
        onOpenChange={(o) => { if (!o) setPending(null) }}
      >
        <DialogContent>
          {pendingConfirmOnly && pendingConfirm && (
            <>
              <DialogHeader>
                <DialogTitle>{pendingConfirm.title ?? 'Are you sure?'}</DialogTitle>
                <DialogDescription>{pendingConfirm.message}</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setPending(null)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  autoFocus
                  onClick={() => {
                    const action = pending
                    setPending(null)
                    if (action) dispatch(action)
                  }}
                  className={
                    pending && pending['destructive']
                      ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-destructive/30'
                      : ''
                  }
                >
                  {pending && pending['destructive'] ? 'Delete' : 'Confirm'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
