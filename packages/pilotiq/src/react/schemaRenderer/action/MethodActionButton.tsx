import React from 'react'
import { useNavigate } from '../../navigate.js'
import { useToast } from '../../Toaster.js'
import { withTooltip } from '../helpers.js'
import { dispatchMethodAction } from './helpers.js'
import { ConfirmActionDialog } from './ConfirmActionDialog.js'

/**
 * Button + optional confirm dialog for a form-method action (Delete and
 * the like). Click → fetch + JSON dispatch via `dispatchMethodAction` —
 * no full page reload, no server-rendered form. Confirm dialog gates the
 * dispatch when configured.
 */
export function MethodActionButton({
  url,
  method,
  confirm,
  destructive,
  className,
  name,
  ariaLabel,
  tooltip,
  inner,
}: {
  url:         string | undefined
  method:      'post' | 'put' | 'patch' | 'delete'
  confirm:     { title?: string; message: string } | undefined
  destructive: boolean
  className:   string
  name:        string
  ariaLabel:   string | undefined
  tooltip:     string | undefined
  inner:       React.ReactNode
}) {
  const navigate = useNavigate()
  const { notify } = useToast()
  const dispatch = (): void => {
    if (!url) return
    void dispatchMethodAction(url, method, navigate, notify)
  }

  if (confirm) {
    return (
      <ConfirmActionDialog
        title={confirm.title}
        message={confirm.message}
        destructive={destructive}
        onConfirm={dispatch}
        trigger={(open) => withTooltip(
          <button type="button" onClick={open} className={className} data-action-name={name} aria-label={ariaLabel}>
            {inner}
          </button>,
          tooltip,
        )}
      />
    )
  }
  return withTooltip(
    <button type="button" onClick={dispatch} className={className} data-action-name={name} aria-label={ariaLabel}>
      {inner}
    </button>,
    tooltip,
  )
}
