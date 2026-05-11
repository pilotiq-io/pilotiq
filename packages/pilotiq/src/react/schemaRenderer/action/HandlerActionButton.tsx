import React from 'react'
import { useNavigate } from '../../navigate.js'
import { useToast } from '../../Toaster.js'
import { withTooltip } from '../helpers.js'
import { dispatchHandlerAction } from './helpers.js'

/**
 * Button for a handler-style action without confirm/modal. Click →
 * fetch + JSON via `dispatchHandlerAction`, then SPA-navigate +
 * show notifications. No full page reload.
 */
export function HandlerActionButton({
  url,
  ids,
  className,
  name,
  ariaLabel,
  tooltip,
  inner,
}: {
  url:       string
  ids:       string[]
  className: string
  name:      string
  ariaLabel: string | undefined
  tooltip:   string | undefined
  inner:     React.ReactNode
}) {
  const navigate = useNavigate()
  const { notify } = useToast()
  return withTooltip(
    <button
      type="button"
      onClick={() => void dispatchHandlerAction(url, ids, navigate, notify)}
      className={className}
      data-action-name={name}
      aria-label={ariaLabel}
    >
      {inner}
    </button>,
    tooltip,
  )
}
