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
}

export function FieldShell({ el, name, label, required, children }: FieldShellProps): React.ReactElement {
  const prefix     = el['prefix']     as string | { icon: string } | undefined
  const suffix     = el['suffix']     as string | { icon: string } | undefined
  const helperText = el['helperText'] as string | undefined

  const labelEl = label !== '' ? (
    <label htmlFor={name} className="text-sm font-medium leading-none">
      {label}{required && <span className="text-destructive ml-0.5">*</span>}
    </label>
  ) : null

  const input = (prefix || suffix)
    ? (
      <div className="flex items-center gap-2">
        {prefix && <Decoration content={prefix} side="prefix" />}
        <div className="flex-1 min-w-0">{children}</div>
        {suffix && <Decoration content={suffix} side="suffix" />}
      </div>
    )
    : children

  return (
    <div className="flex flex-col gap-1.5">
      {labelEl}
      {input}
      {helperText && (
        <p className="text-xs text-muted-foreground">{helperText}</p>
      )}
    </div>
  )
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
