import React from 'react'
import type { ComponentType } from 'react'
import type { ElementMeta } from '../../schema/Element.js'
import { getIcon } from '../../icons/registry.js'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip.js'

/** Resolve an icon name through the user-extensible registry. Returns
 * `undefined` when the name isn't registered — callers fall back to
 * their own default. Pilotiq's own chrome never depends on the
 * registry. */
export type IconCmp = ComponentType<{
  className?: string
  style?: React.CSSProperties
  'aria-hidden'?: boolean | 'true' | 'false'
  'aria-label'?: string
}>

export function resolveIcon(name: string | undefined): IconCmp | undefined {
  if (!name) return undefined
  return getIcon(name) as IconCmp | undefined
}

/** Map an element's optional `_layout` hints (Plan #8 — columnSpan /
 * columnStart / columnOrder) to Tailwind utility classes. Returns an
 * empty string when the element has no layout hints. Outside of a
 * parent Grid/Split the classes have no effect — Tailwind generates
 * `col-span-*` / `col-start-*` / `order-*` regardless of context.
 *
 * Tailwind's JIT only ships utilities up to a fixed range; clamp here
 * to the safe defaults (1..12 for col, 1..12 for order). */
export function layoutClasses(el: ElementMeta): string {
  const layout = el['_layout'] as
    | { columnSpan?: number; columnStart?: number; columnOrder?: number }
    | undefined
  if (!layout) return ''
  const out: string[] = []
  if (typeof layout.columnSpan  === 'number') {
    const span = Math.max(1, Math.min(12, layout.columnSpan))
    out.push(`col-span-${span}`)
  }
  if (typeof layout.columnStart === 'number') {
    const start = Math.max(1, Math.min(12, layout.columnStart))
    out.push(`col-start-${start}`)
  }
  if (typeof layout.columnOrder === 'number') {
    const order = Math.max(1, Math.min(12, layout.columnOrder))
    out.push(`order-${order}`)
  }
  return out.join(' ')
}

/** Wrap a child list in a flex column with consistent gap. Caller
 * passes its own `renderElement` so this helper stays free of the
 * SchemaRenderer ↔ leaf-renderers cycle. */
export function renderChildren(
  children: ElementMeta[] | undefined,
  gap: string,
  renderElement: (el: ElementMeta, index: number) => React.ReactNode,
): React.ReactNode {
  if (!children || children.length === 0) return null
  return (
    <div className={`flex flex-col ${gap}`}>
      {children.map((child, i) => renderElement(child, i))}
    </div>
  )
}

/** Wrap a node in the standard hover tooltip. Returns the node as-is when
 *  `tooltip` is falsy. Used wherever a button/affordance needs an
 *  on-hover label without owning its own Popover. */
export function withTooltip(node: React.ReactNode, tooltip: string | undefined): React.ReactNode {
  if (!tooltip) return node
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger render={() => node as React.ReactElement} />
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
