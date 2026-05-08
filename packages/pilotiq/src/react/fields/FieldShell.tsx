import React from 'react'
import type { ElementMeta } from '../../schema/Element.js'
import { getIcon } from '../../icons/registry.js'

/**
 * Shared chrome around every field input — label + required asterisk +
 * helper text + prefix/suffix decoration. The actual input component
 * is passed as `children`. Keeps `renderField` in `SchemaRenderer.tsx`
 * lean: dispatcher above, layout here.
 *
 * Decoration: `prefix` / `suffix` may be a plain string or an icon
 * descriptor (`{ icon: 'name' }` / `{ icon: { class } }`). Strings
 * render inside a muted-foreground span; icons resolve via the
 * registry. When neither prefix nor suffix is present the input
 * renders without any extra wrapper to preserve the legacy DOM.
 */
export interface FieldShellProps {
  el:        ElementMeta
  name:      string
  label:     string
  required:  boolean
  children:  React.ReactNode
  /** Optional ReactNode rendered to the left of the input, after the
   *  passive `prefix` decoration (when set). Used by `TextField`'s
   *  `prefixAction()` / mask / datalist / etc. — composes with the
   *  passive `prefix` slot rather than replacing it. */
  before?:   React.ReactNode
  /** Right-of-input counterpart. Used by `revealable() / copyable() /
   *  suffixAction()`. Renders after the passive `suffix` decoration. */
  after?:    React.ReactNode
  /** Optional ReactNode rendered inline next to the label — used by
   *  plugins that register via `registerFieldLabelSlot()`. */
  labelSlot?: React.ReactNode
}

export function FieldShell({ el, name, label, required, children, before, after, labelSlot }: FieldShellProps): React.ReactElement {
  const prefix     = el['prefix']     as string | { icon: string } | undefined
  const suffix     = el['suffix']     as string | { icon: string } | undefined
  const helperText = el['helperText'] as string | undefined
  const inline     = el['inlineLabel'] === true
  const hiddenLabel = el['hiddenLabel'] === true
  const wrapperAttrs = pickWrapperAttrs(el)

  const labelClass = hiddenLabel
    ? 'sr-only'
    : 'text-sm font-medium leading-none'
  const labelEl = label !== '' ? (
    <label htmlFor={name} className={labelClass}>
      {label}{required && <span className="text-destructive ml-0.5">*</span>}
      {labelSlot}
    </label>
  ) : null

  const hasDecoration = !!(prefix || suffix || before || after)
  const input = hasDecoration
    ? (
      <div className="flex items-center gap-2">
        {before}
        {prefix && <Decoration content={prefix} side="prefix" />}
        <div className="flex-1 min-w-0">{children}</div>
        {suffix && <Decoration content={suffix} side="suffix" />}
        {after}
      </div>
    )
    : children

  if (inline) {
    return (
      <div className="flex items-baseline gap-3" {...wrapperAttrs}>
        {labelEl && <div className="min-w-32 pt-2">{labelEl}</div>}
        <div className="min-w-0 flex-1">
          {input}
          {helperText && (
            <p className="mt-1 text-xs text-muted-foreground">{helperText}</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5" {...wrapperAttrs}>
      {labelEl}
      {input}
      {helperText && (
        <p className="text-xs text-muted-foreground">{helperText}</p>
      )}
    </div>
  )
}

/**
 * Merge `extraAttributes` (Filament-parity short name) and
 * `extraFieldWrapperAttributes` (verbose alias) into one record. Latter
 * wins on key collisions so callers who set both can override.
 */
function pickWrapperAttrs(el: ElementMeta): Record<string, string | number | boolean> {
  const a = el['extraAttributes']             as Record<string, string | number | boolean> | undefined
  const b = el['extraFieldWrapperAttributes'] as Record<string, string | number | boolean> | undefined
  if (!a && !b) return {}
  return { ...(a ?? {}), ...(b ?? {}) }
}

function Decoration({ content, side }: {
  content: string | { icon: string }
  side:    'prefix' | 'suffix'
}): React.ReactElement {
  if (typeof content === 'string') {
    return (
      <span className="text-sm text-muted-foreground shrink-0" data-side={side}>
        {content}
      </span>
    )
  }
  return <DecorationIcon name={content.icon} />
}

function DecorationIcon({ name }: { name: string }): React.ReactElement | null {
  const Icon = getIcon(name) as React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }> | undefined
  if (!Icon) return null
  return <Icon className="size-4 text-muted-foreground shrink-0" aria-hidden="true" />
}
