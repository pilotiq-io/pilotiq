import React, { useState } from 'react'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../../ui/dialog.js'
import { Button } from '../../ui/button.js'

/**
 * Confirm-style dialog wrapping an action's button. The trigger button is
 * rendered inline; clicking it opens the dialog. On confirm we run
 * `onConfirm` (which is action-style-specific — submit a form, programmatic
 * POST, etc.) and close the dialog. Used by submit-style and form-method
 * actions; handler-style + confirm/modal flows through `ActionModalDialog`
 * instead.
 */
export function ConfirmActionDialog({
  trigger,
  title,
  message,
  destructive,
  onConfirm,
}: {
  trigger:     (open: () => void) => React.ReactNode
  title:       string | undefined
  message:     string
  destructive: boolean
  onConfirm:   () => void
}) {
  const [open, setOpen] = useState(false)
  // Modal confirm CTA stays SOLID red (stronger than pilotiq's soft
  // `destructive` Button variant used for inline/row actions).
  const confirmOverride = destructive
    ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-destructive/30'
    : ''
  return (
    <>
      {trigger(() => setOpen(true))}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title ?? 'Are you sure?'}</DialogTitle>
            <DialogDescription>{message}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => { setOpen(false); onConfirm() }}
              className={confirmOverride}
              autoFocus
            >
              {destructive ? 'Delete' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
