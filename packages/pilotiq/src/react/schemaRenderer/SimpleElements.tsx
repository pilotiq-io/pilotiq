import React from 'react'
import type { ElementMeta } from '../../schema/Element.js'
import {
  BADGE_COLOR_CLASSES,
  COLUMN_COLOR_CLASSES,
  TEXT_COLOR_CLASSES,
  TEXT_SIZE_CLASSES,
  TEXT_WEIGHT_CLASSES,
} from './constants.js'
import { layoutClasses, renderChildren, resolveIcon } from './helpers.js'

/** Stateless leaf renderers — every element here is a pure function of
 *  its meta. Cases that own children defer back to the caller's
 *  `renderElement` via `deps.renderElement`. Cases that mount Action
 *  triggers in header / footer slots defer to `deps.renderActionLike`.
 *
 *  `renderSimpleElement` returns `null` only when the type is one of the
 *  handled leaves and resolves to no output (e.g. `icon` with no
 *  registered name). For unknown types it returns the sentinel
 *  `undefined` so the caller falls through to the rest of its switch. */

export interface SimpleElementDeps {
  /** Recurse into a child element. Injected to avoid the cycle with
   *  SchemaRenderer's main dispatch. */
  renderElement: (el: ElementMeta, index: number) => React.ReactNode
  /** Render an action / actionGroup / slotComponent meta as a button or
   *  trigger. Used by `heading` and `emptyState` for their header /
   *  footer action slots. */
  renderActionLike: (el: ElementMeta, index: number) => React.ReactNode
}

/** Render the `text` element. Hot path — pulled out so the `case 'text'`
 *  branch in the main switch stays a one-liner. */
function renderText(el: ElementMeta, index: number): React.ReactNode {
  const content = String(el['content'] ?? '')
  const color   = el['color']  ? String(el['color'])  : undefined
  const size    = el['size']   ? String(el['size'])   : undefined
  const weight  = el['weight'] ? String(el['weight']) : undefined
  const isBadge = el['badge'] === true

  if (isBadge) {
    const badgeKey = el['badgeColor'] ? String(el['badgeColor']) : 'gray'
    const cls      = BADGE_COLOR_CLASSES[badgeKey] ?? BADGE_COLOR_CLASSES['gray']
    return (
      <span
        key={index}
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}
      >
        {content}
      </span>
    )
  }

  // Defaults match the previous bare `<p>` for back-compat: text-sm + muted.
  const sizeCls   = size   ? (TEXT_SIZE_CLASSES[size]     ?? '') : 'text-sm'
  const colorCls  = color  ? (TEXT_COLOR_CLASSES[color]   ?? '') : 'text-muted-foreground'
  const weightCls = weight ? (TEXT_WEIGHT_CLASSES[weight] ?? '') : ''
  return (
    <p key={index} className={`${sizeCls} ${colorCls} ${weightCls}`.trim()}>
      {content}
    </p>
  )
}

/** Dispatch helper for stateless leaf + layout-primitive element types.
 *  Returns `undefined` when the type isn't handled here, letting the
 *  caller fall through to its remaining switch arms. */
export function renderSimpleElement(
  el: ElementMeta,
  index: number,
  deps: SimpleElementDeps,
): React.ReactNode | undefined {
  const { renderElement, renderActionLike } = deps

  switch (el.type) {
    case 'text':
      return renderText(el, index)

    case 'image': {
      const url    = String(el['url'] ?? '')
      const alt    = String(el['alt'] ?? '')
      const width  = el['width']  as number | undefined
      const height = el['height'] as number | undefined
      const shape  = String(el['shape'] ?? 'square')
      const shapeCls = shape === 'circle' ? 'rounded-full' : shape === 'rounded' ? 'rounded-md' : ''
      return (
        <img
          key={index}
          src={url}
          alt={alt}
          {...(width  !== undefined ? { width }  : {})}
          {...(height !== undefined ? { height } : {})}
          className={`inline-block object-cover ${shapeCls}`}
        />
      )
    }

    case 'icon': {
      const name  = el['name'] ? String(el['name']) : undefined
      const size  = (el['size'] as number | undefined) ?? 16
      const color = String(el['color'] ?? 'default')
      const label = el['label'] ? String(el['label']) : undefined
      const Cmp = resolveIcon(name)
      if (!Cmp) return null
      const colorClass = COLUMN_COLOR_CLASSES[color] ?? ''
      return (
        <Cmp
          key={index}
          className={`inline ${colorClass}`}
          {...(label ? { 'aria-label': label } : { 'aria-hidden': true })}
          style={{ width: size, height: size }}
        />
      )
    }

    case 'markdown':
    case 'html': {
      const html  = String(el['html']  ?? '')
      const prose = el['prose'] !== false
      const size  = el['size'] ? String(el['size']) : undefined
      const proseCls = prose
        ? `prose max-w-none ${size === 'sm' ? 'prose-sm' : size === 'lg' ? 'prose-lg' : ''}`.trim()
        : ''
      return (
        <div
          key={index}
          className={proseCls || undefined}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )
    }

    case 'heading': {
      const level = (el['level'] as number) ?? 1
      const content = String(el['content'] ?? '')
      const description = el['description'] ? String(el['description']) : undefined
      const headerActions = (el.children ?? []).filter(c => c.type === 'action' || c.type === 'actionGroup' || c.type === 'slotComponent')
      const Tag = level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3'
      const sizes = { 1: 'text-2xl', 2: 'text-lg', 3: 'text-base' } as const
      // Single-line title: vertically center the actions against it. With a
      // description the block is taller, so top-align instead.
      const alignActions = description ? 'items-start' : 'items-center'
      const titleBlock = (
        <div className="min-w-0">
          <Tag className={`${sizes[level as 1 | 2 | 3]} font-semibold tracking-tight text-foreground`}>
            {content}
          </Tag>
          {description && (
            <p className="text-sm text-muted-foreground mt-1">{description}</p>
          )}
        </div>
      )
      if (headerActions.length === 0) {
        return <div key={index}>{titleBlock}</div>
      }
      return (
        <div key={index} className={`flex ${alignActions} justify-between gap-4`}>
          {titleBlock}
          <div className="flex items-center gap-2 shrink-0">
            {headerActions.map((a, i) => renderActionLike(a, i))}
          </div>
        </div>
      )
    }

    case 'emptyState': {
      const heading     = String(el['heading'] ?? '')
      const description = el['description'] ? String(el['description']) : undefined
      const iconName    = el['icon']        ? String(el['icon'])        : undefined
      const contained   = el['contained'] !== false
      const Icon        = iconName ? resolveIcon(iconName) : undefined
      const footer      = (el.children ?? []).filter(c => c.type === 'action' || c.type === 'actionGroup' || c.type === 'slotComponent')
      const wrapper = contained
        ? 'rounded-lg border border-border bg-card text-card-foreground py-12 px-6'
        : 'py-8'
      return (
        <div key={index} className={`${wrapper} flex flex-col items-center text-center gap-3`}>
          {Icon && <Icon className="size-10 text-muted-foreground" aria-hidden="true" />}
          <h3 className="text-lg font-semibold">{heading}</h3>
          {description && <p className="text-sm text-muted-foreground max-w-md">{description}</p>}
          {footer.length > 0 && (
            <div className="flex items-center gap-2 mt-2">
              {footer.map((a, i) => renderActionLike(a, i))}
            </div>
          )}
        </div>
      )
    }

    case 'divider': {
      const label = el['label'] ? String(el['label']) : undefined
      return label
        ? <div key={index} className="relative py-2">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
            <div className="relative flex justify-center"><span className="bg-background px-2 text-xs text-muted-foreground">{label}</span></div>
          </div>
        : <hr key={index} className="border-border" />
    }

    case 'unorderedList': {
      const items   = (el['items'] as unknown[] | undefined) ?? []
      const color   = el['color']  ? String(el['color'])  : undefined
      const size    = el['size']   ? String(el['size'])   : undefined
      const weight  = el['weight'] ? String(el['weight']) : undefined
      const sizeCls   = size   ? (TEXT_SIZE_CLASSES[size]     ?? '') : 'text-sm'
      const colorCls  = color  ? (TEXT_COLOR_CLASSES[color]   ?? '') : ''
      const weightCls = weight ? (TEXT_WEIGHT_CLASSES[weight] ?? '') : ''
      return (
        <ul key={index} className={`list-disc list-inside space-y-1 ${sizeCls} ${colorCls} ${weightCls}`.trim()}>
          {items.map((item, i) => (
            <li key={i}>{String(item)}</li>
          ))}
        </ul>
      )
    }

    case 'card': {
      const title = el['title'] ? String(el['title']) : undefined
      const description = el['description'] ? String(el['description']) : undefined
      return (
        <div key={index} className="rounded-xl border bg-card p-6 shadow-sm">
          {title && <h3 className="font-semibold mb-1">{title}</h3>}
          {description && <p className="text-sm text-muted-foreground mb-4">{description}</p>}
          {renderChildren(el.children, 'gap-4', renderElement)}
        </div>
      )
    }

    case 'grid': {
      const columns = Math.max(1, Math.min(12, Number(el['columns'] ?? 2)))
      const gapPx   = el['gap'] !== undefined ? `${Number(el['gap'])}px` : undefined
      return (
        <div
          key={index}
          className={`grid gap-4 ${layoutClasses(el)}`.trim()}
          style={{
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            ...(gapPx ? { gap: gapPx } : {}),
          }}
        >
          {(el.children ?? []).map((c, i) => renderElement(c, i))}
        </div>
      )
    }

    case 'group': {
      const layout = layoutClasses(el)
      return (
        <div key={index} className={layout || undefined}>
          {renderChildren(el.children, 'gap-4', renderElement)}
        </div>
      )
    }

    case 'split': {
      const from = el['from'] === 'left' ? 'left' : 'right'
      const gap  = Math.max(0, Math.min(12, Number(el['gap'] ?? 6)))
      const children = el.children ?? []
      // Find the explicit aside child first; fall back to "second child is
      // aside" so terse Split.make().schema([main, aside]) still works.
      let asideIdx = children.findIndex(c => c['aside'] === true)
      if (asideIdx === -1 && children.length >= 2) asideIdx = 1
      const mainChildren  = children.filter((_, i) => i !== asideIdx)
      const asideChild    = asideIdx >= 0 ? children[asideIdx] : undefined

      const orderClasses  = from === 'left'
        ? { aside: '@md:order-first', main: '@md:order-last' }
        : { aside: '@md:order-last',  main: '@md:order-first' }

      return (
        <div
          key={index}
          className={`@container flex flex-col @md:flex-row gap-${gap} ${layoutClasses(el)}`.trim()}
        >
          <div className={`flex flex-col gap-4 flex-1 min-w-0 ${orderClasses.main}`}>
            {mainChildren.map((c, i) => renderElement(c, i))}
          </div>
          {asideChild && (
            <aside className={`flex flex-col gap-4 @md:w-80 @md:shrink-0 ${orderClasses.aside}`}>
              {renderElement(asideChild, asideIdx)}
            </aside>
          )}
        </div>
      )
    }

    case 'fieldset': {
      const label   = String(el['label'] ?? '')
      const columns = Math.max(1, Math.min(3, Number(el['columns'] ?? 1)))
      const gridStyle = columns > 1
        ? { display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: '1rem' }
        : undefined
      return (
        <fieldset
          key={index}
          className={`rounded-md border border-border px-4 pt-3 pb-4 ${layoutClasses(el)}`.trim()}
        >
          {label && <legend className="px-1 text-xs font-medium text-muted-foreground">{label}</legend>}
          <div className={columns === 1 ? 'flex flex-col gap-3' : undefined} style={gridStyle}>
            {(el.children ?? []).map((c, i) => renderElement(c, i))}
          </div>
        </fieldset>
      )
    }

    default:
      return undefined
  }
}
