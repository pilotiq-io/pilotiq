import React from 'react'
import type { ElementMeta } from '../../../schema/Element.js'
import { resolveIcon } from '../helpers.js'

// ─── Button-chrome helpers ──────────────────────────────────
//
// Shared between renderAction, MethodActionButton, HandlerActionButton,
// ActionGroupTrigger, and the wizard nav buttons. All stateless — they
// produce className strings and inline JSX for the icon / badge glyphs.

export interface RenderActionOptions {
  /** Ids to send when this action is handler-style. Used by row + bulk
   * placements to pass selected/current record id(s). */
  ids?: string[]
  /** Optional sizing override (e.g. row actions render smaller). */
  size?: 'sm' | 'md'
}

/** Color preset → tailwind class group. `ghost` is bg-less and works
 * with hover:bg-accent. `destructive` uses a soft tonal style (Filament-
 * style) so per-row Delete buttons sit calmly next to primary actions
 * instead of shouting in saturated red — the modal confirm CTA still
 * renders solid red via its own hardcoded class. Others are solid + hover-
 * darken. */
const COLOR_VARIANTS: Record<string, string> = {
  primary:     'bg-primary text-primary-foreground hover:bg-primary/90',
  destructive: 'bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-400 dark:hover:bg-red-950/60',
  success:     'bg-emerald-600 text-white hover:bg-emerald-600/90',
  warning:     'bg-amber-500 text-white hover:bg-amber-500/90',
  info:        'bg-blue-600 text-white hover:bg-blue-600/90',
  ghost:       'bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground',
}

/** Outlined variant — replaces solid bg with a border + transparent bg. */
const OUTLINED_VARIANTS: Record<string, string> = {
  primary:     'border border-primary/40 text-primary bg-transparent hover:bg-primary/10',
  destructive: 'border border-destructive/40 text-destructive bg-transparent hover:bg-destructive/10',
  success:     'border border-emerald-600/40 text-emerald-700 dark:text-emerald-400 bg-transparent hover:bg-emerald-600/10',
  warning:     'border border-amber-500/40 text-amber-700 dark:text-amber-400 bg-transparent hover:bg-amber-500/10',
  info:        'border border-blue-600/40 text-blue-700 dark:text-blue-400 bg-transparent hover:bg-blue-600/10',
  ghost:       'border border-input text-foreground bg-transparent hover:bg-accent',
}

/** Size preset → tailwind sizing classes. Icon-only buttons use the
 * width=height variants from the second map. */
const SIZE_CLASSES: Record<string, string> = {
  sm: 'h-7 px-2 text-xs',
  md: 'h-8 px-3 text-sm',
  lg: 'h-10 px-4 text-base',
}
const ICON_SIZE_CLASSES: Record<string, string> = {
  sm: 'h-7 w-7 text-xs',
  md: 'h-8 w-8 text-sm',
  lg: 'h-10 w-10 text-base',
}

/** Build the trigger button className from action meta + render context. */
export function actionButtonClass(el: ElementMeta, opts: RenderActionOptions): string {
  const destructive = Boolean(el['destructive'])
  const placement   = String(el['placement'] ?? 'inline')
  const outlined    = Boolean(el['outlined'])
  const iconOnly    = Boolean(el['iconOnly'])
  const explicitColor = el['color'] as string | undefined
  const explicitSize  = el['size'] as 'sm' | 'md' | 'lg' | undefined

  // Color: explicit `.color()` wins; `destructive` flag falls back to
  // 'destructive'; otherwise 'primary'.
  const color = explicitColor ?? (destructive ? 'destructive' : 'primary')
  const variant = (outlined ? OUTLINED_VARIANTS[color] : COLOR_VARIANTS[color]) ?? COLOR_VARIANTS['primary']

  // Size: explicit `.size()` wins; otherwise small for row context, md elsewhere.
  const size = explicitSize ?? (opts.size === 'sm' || placement === 'row' ? 'sm' : 'md')
  const sizingMap = iconOnly ? ICON_SIZE_CLASSES : SIZE_CLASSES
  const sizing = sizingMap[size] ?? sizingMap['md']

  return `relative inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition ${variant} ${sizing}`
}

/** Render the action's icon (when set). String names resolve through the
 * user-extensible icon registry; missing names render nothing rather
 * than a fallback glyph (action icons are decorative, not load-bearing). */
export function renderActionIcon(el: ElementMeta): React.ReactNode {
  const name = typeof el['icon'] === 'string' ? el['icon'] : undefined
  const Icon = resolveIcon(name)
  if (!Icon) return null
  return <Icon className="size-4" aria-hidden="true" />
}

/** Tiny corner badge for actions that set `.badge(...)`. */
export function renderActionBadge(el: ElementMeta): React.ReactNode {
  const value = el['badge']
  if (value === undefined || value === null || value === '') return null
  const color = (el['badgeColor'] as string | undefined) ?? 'bg-primary text-primary-foreground'
  return (
    <span className={`absolute -top-1 -right-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-medium ${color}`}>
      {String(value)}
    </span>
  )
}
