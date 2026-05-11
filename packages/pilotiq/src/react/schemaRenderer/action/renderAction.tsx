import React from 'react'
import type { ElementMeta } from '../../../schema/Element.js'
import { withTooltip } from '../helpers.js'
import {
  actionButtonClass,
  renderActionBadge,
  renderActionIcon,
  type RenderActionOptions,
} from './buttons.js'
import { ActionGroupTrigger } from './ActionGroupTrigger.js'
import { ActionModalDialog } from './ActionModalDialog.js'
import { ConfirmActionDialog } from './ConfirmActionDialog.js'
import { HandlerActionButton } from './HandlerActionButton.js'
import { MethodActionButton } from './MethodActionButton.js'

/**
 * Function-prop deps for action rendering — injected from
 * `SchemaRenderer.tsx`'s top-level dispatch. `renderElement` is needed
 * for slot-component pass-through and modal-content-footer; `renderFormChild`
 * is needed by `ActionModalDialog` for its form-body fields.
 */
export interface ActionRendererDeps {
  renderElement:  (el: ElementMeta, index: number) => React.ReactNode
  renderFormChild: (child: ElementMeta, index: number, values: Record<string, unknown>, errors: Record<string, string[]>) => React.ReactNode
}

/** Render either a single Action or an ActionGroup based on `el.type`.
 * Used by callsites that accept both (table header / bulk toolbars,
 * heading actions, container schemas). */
export function renderActionLike(
  el:    ElementMeta,
  index: number,
  opts:  RenderActionOptions,
  deps:  ActionRendererDeps,
): React.ReactNode {
  if (el.type === 'slotComponent') {
    // Plugin-contributed React mount — render through the main element
    // dispatcher, which looks up the registered component and forwards
    // its serialised props bag. Keeps every action-row slot (heading
    // children, alert footer, empty-state footer, table-toolbar bulk
    // strip) usable as a plugin extension point.
    return deps.renderElement(el, index)
  }
  if (el.type === 'actionGroup') {
    return (
      <ActionGroupTrigger
        key={index}
        el={el}
        ids={opts.ids ?? []}
        renderFormChild={deps.renderFormChild}
        renderElement={deps.renderElement}
      />
    )
  }
  return renderAction(el, index, opts, deps)
}

/** Render a single `Action` element. Dispatches on the Action's mode
 *  (submit / href / method / handler) and chrome (confirm, modal). */
export function renderAction(
  el:    ElementMeta,
  index: number,
  opts:  RenderActionOptions,
  deps:  ActionRendererDeps,
): React.ReactNode {
  const name        = String(el['name'] ?? '')
  const label       = String(el['label'] ?? name)
  const destructive = Boolean(el['destructive'])
  const href        = el['href']        as string | undefined
  const method      = el['method']      as 'post' | 'put' | 'patch' | 'delete' | undefined
  const actionUrl   = el['action']      as string | undefined
  const dispatchUrl = el['dispatchUrl'] as string | undefined
  const submit      = Boolean(el['submit'])
  const confirm     = el['confirm']     as { title?: string; message: string } | undefined
  const tooltip     = el['tooltip'] as string | undefined
  const iconOnly    = Boolean(el['iconOnly'])
  const isDisabled  = Boolean(el['disabled'])

  const className = actionButtonClass(el, opts) + (isDisabled ? ' opacity-50 cursor-not-allowed pointer-events-none' : '')
  const icon  = renderActionIcon(el)
  const badge = renderActionBadge(el)
  // Icon-only buttons hide the label visually but expose it via aria-label.
  const ariaLabel = iconOnly ? label : undefined
  const inner = iconOnly ? <>{icon}{badge}</> : <>{icon}<span>{label}</span>{badge}</>

  // Submit-style action — renders as <button type="submit">. Optionally
  // targets a specific form via the HTML `form="<id>"` attribute so the
  // button can submit a form it lives outside of (e.g. a page-header
  // Save button driving a form below). When `formField` is set, the
  // button posts a sentinel name/value pair (e.g. `_continueCreate=1`)
  // so the server can branch on which submit was clicked.
  if (submit) {
    const formTarget = el['form'] as string | undefined
    const formField  = el['formField'] as { name: string; value: string } | undefined
    if (confirm) {
      // Confirm-gated submit: render as type="button" so click opens the
      // dialog instead of submitting; on confirm, programmatically submit
      // the targeted form (or the closest enclosing form if no formTarget).
      // `formField` is intentionally not threaded here — programmatic
      // `requestSubmit()` has no submitter, so the name/value pair would
      // be lost anyway. Pair `.confirm()` with a hidden input on the form
      // if you need a sentinel under a confirm flow.
      return (
        <ConfirmActionDialog
          key={index}
          title={confirm.title}
          message={confirm.message}
          destructive={destructive}
          onConfirm={() => {
            if (typeof document === 'undefined') return
            const form = formTarget
              ? document.getElementById(formTarget) as HTMLFormElement | null
              : document.querySelector<HTMLFormElement>('form')
            form?.requestSubmit()
          }}
          trigger={(open) => withTooltip(
            <button
              type="button"
              onClick={open}
              className={className}
              data-action-name={name}
              aria-label={ariaLabel}
            >
              {inner}
            </button>,
            tooltip,
          )}
        />
      )
    }
    return withTooltip(
      <button
        key={index}
        type="submit"
        form={formTarget}
        className={className}
        data-action-name={name}
        aria-label={ariaLabel}
        {...(formField ? { name: formField.name, value: formField.value } : {})}
      >
        {inner}
      </button>,
      tooltip,
    )
  }

  // Substitute the `:id` placeholder with the current row id when this
  // action is rendered in a row context. Lets row-level link/form actions
  // ship a single template URL like `/admin/articles/:id/edit`.
  const rowId = opts.ids?.length === 1 ? opts.ids[0]! : undefined
  const resolveTemplate = (s: string | undefined): string | undefined =>
    s && rowId ? s.replace(':id', rowId) : s

  // Link-style action.
  if (href) {
    return withTooltip(
      <a
        key={index}
        href={resolveTemplate(href)}
        className={className}
        data-action-name={name}
        aria-label={ariaLabel}
      >
        {inner}
      </a>,
      tooltip,
    )
  }

  // Form-style action (POST/PUT/PATCH/DELETE) — fetch + JSON, no full reload.
  if (method) {
    const resolvedUrl = resolveTemplate(actionUrl)
    return (
      <MethodActionButton
        key={index}
        url={resolvedUrl}
        method={method}
        confirm={confirm}
        destructive={destructive}
        className={className}
        name={name}
        ariaLabel={ariaLabel}
        tooltip={tooltip}
        inner={inner}
      />
    )
  }

  // Handler-style action — fetch + JSON dispatch with `ids[]` body.
  if (dispatchUrl) {
    const ids = opts.ids ?? []
    const modal = el['modal']
    if (confirm || modal) {
      return (
        <ActionModalDialog
          key={index}
          meta={el}
          ids={ids}
          trigger={(open) => withTooltip(
            <button
              type="button"
              onClick={open}
              className={className}
              data-action-name={name}
              aria-label={ariaLabel}
            >
              {inner}
            </button>,
            tooltip,
          )}
          renderFormChild={deps.renderFormChild}
          renderElement={deps.renderElement}
        />
      )
    }
    return (
      <HandlerActionButton
        key={index}
        url={dispatchUrl}
        ids={ids}
        className={className}
        name={name}
        ariaLabel={ariaLabel}
        tooltip={tooltip}
        inner={inner}
      />
    )
  }

  // No dispatch wired (no href / method / dispatchUrl). Render a disabled
  // placeholder so the user sees the button, but it does nothing.
  return withTooltip(
    <button
      key={index}
      type="button"
      disabled
      className={className + ' opacity-50 cursor-not-allowed'}
      data-action-name={name}
      aria-label={ariaLabel}
    >
      {inner}
    </button>,
    tooltip,
  )
}
