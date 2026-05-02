import React from 'react'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CopyIcon,
  GripVerticalIcon,
  Trash2Icon,
} from 'lucide-react'
import { getIcon, type IconType } from '../../icons/registry.js'
import type {
  RowButtonColor,
  RowButtonKind,
  RowButtonMeta,
  RowButtonsMeta,
} from '../../fields/RowButton.js'

/**
 * Foreground color slot → Tailwind class pair. Mirrors `Action.color()`
 * semantics with a softer hover transition since these are
 * icon-only buttons inside a dense row header.
 */
const COLOR_CLASS: Record<RowButtonColor, string> = {
  foreground:  'text-muted-foreground hover:text-foreground',
  destructive: 'text-muted-foreground hover:text-destructive',
  primary:     'text-primary hover:text-primary/80',
  success:     'text-emerald-600 hover:text-emerald-700',
  warning:     'text-amber-600 hover:text-amber-700',
  info:        'text-blue-600 hover:text-blue-700',
  muted:       'text-muted-foreground/60 hover:text-muted-foreground',
}

interface ButtonDefaults {
  Icon:    IconType
  label:   string
  tooltip: string
  /**
   * Default tailwind color class when no `color` override is set. Most
   * row buttons share `text-muted-foreground hover:text-foreground`;
   * the trash slot defaults to `…hover:text-destructive`. Defaults always
   * lose to an explicit `RowButton.color()` call.
   */
  colorClass: string
}

interface ResolvedChrome {
  Icon:       IconType
  label:      string
  tooltip:    string
  colorClass: string
}

/**
 * Merge a meta override on top of a slot's hardcoded defaults. The
 * override may set any subset of `{ icon, label, color, tooltip }`; missing
 * keys fall through. An overridden `icon` that doesn't resolve in the
 * runtime registry falls back to the default Lucide glyph (matches
 * `useIconFor`'s fail-soft posture).
 */
export function resolveRowChrome(
  defaults: ButtonDefaults,
  override: RowButtonMeta | undefined,
): ResolvedChrome {
  if (override === undefined) return defaults
  const overrideIcon = override.icon !== undefined ? getIcon(override.icon) : undefined
  return {
    Icon:       overrideIcon ?? defaults.Icon,
    label:      override.label   ?? defaults.label,
    tooltip:    override.tooltip ?? defaults.tooltip,
    colorClass: override.color !== undefined ? COLOR_CLASS[override.color] : defaults.colorClass,
  }
}

/**
 * Default chrome for each of the seven slots. Centralized here so both
 * Repeater and Builder renderers stay in sync — when a new slot lands,
 * the defaults live in one place. The Icon imports happen at the call
 * site (renderers already import from lucide-react); we accept them as
 * inputs to keep this file React-tree-shake friendly.
 */
export type SlotDefaults = Record<RowButtonKind, ButtonDefaults>

/** Convenience for renderers — pass a slot kind + the merged buttons meta. */
export function resolveRowChromeFor(
  kind:      RowButtonKind,
  defaults:  ButtonDefaults,
  buttons:   RowButtonsMeta | undefined,
): ResolvedChrome {
  return resolveRowChrome(defaults, buttons?.[kind])
}

/**
 * Standard icon-button shell used by every row chrome slot except the
 * grip (which is a draggable `<span>`) and the Add button (which uses
 * the shadcn `<Button>` for outline styling). Centralizes the
 * `disabled` opacity, focus ring, and icon sizing so customizer overrides
 * land consistently across Repeater + Builder.
 */
export function RowChromeIconButton({
  defaults,
  override,
  disabled,
  onClick,
  extraClassName = '',
  ariaExpanded,
}: {
  defaults:        ButtonDefaults
  override:        RowButtonMeta | undefined
  disabled:        boolean
  onClick:         () => void
  extraClassName?: string
  ariaExpanded?:   boolean
}): React.ReactElement {
  const { Icon, label, tooltip, colorClass } = resolveRowChrome(defaults, override)
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={tooltip}
      {...(ariaExpanded !== undefined ? { 'aria-expanded': ariaExpanded } : {})}
      className={`${colorClass} disabled:opacity-30 ${extraClassName}`.trim()}
    >
      <Icon className="size-4" />
    </button>
  )
}

/**
 * Drag grip — a `<span>` not a `<button>`, since native HTML5 DnD only
 * fires `dragstart` on parents with `draggable=true`. Honors the
 * `reorderAction` customizer for icon / label / tooltip / color so users
 * can swap the glyph or copy without owning the drag wiring.
 */
export function ReorderGrip({
  disabled,
  buttons,
}: {
  disabled: boolean
  buttons:  RowButtonsMeta | undefined
}): React.ReactElement {
  const { Icon, label, tooltip, colorClass } = resolveRowChromeFor('reorder', DEFAULT_REORDER, buttons)
  return (
    <span
      aria-label={label}
      title={tooltip}
      className={`${colorClass} ${disabled ? 'opacity-30' : 'cursor-grab active:cursor-grabbing'}`}
    >
      <Icon className="size-4" />
    </span>
  )
}

/**
 * Collapse chevron — picks the open/closed glyph from state, then lets a
 * `collapseAction` customizer override icon / label / tooltip / color.
 * When a custom icon is set, both states use it (matches Filament; flat
 * customizer surface — separate open/closed icon overrides aren't worth
 * the extra setter).
 */
export function CollapseChevron({
  isCollapsed,
  disabled,
  buttons,
  onToggle,
}: {
  isCollapsed: boolean
  disabled:    boolean
  buttons:     RowButtonsMeta | undefined
  onToggle:    () => void
}): React.ReactElement {
  const defaults = {
    Icon:       isCollapsed ? ChevronRightIcon : ChevronDownIcon,
    label:      isCollapsed ? 'Expand' : 'Collapse',
    tooltip:    isCollapsed ? 'Expand' : 'Collapse',
    colorClass: 'text-muted-foreground hover:text-foreground',
  }
  return (
    <RowChromeIconButton
      defaults={defaults}
      override={buttons?.collapse}
      disabled={disabled}
      onClick={onToggle}
      ariaExpanded={!isCollapsed}
    />
  )
}

// ─── Per-slot defaults ─────────────────────────────────────
// Centralized so Repeater + Builder stay in lockstep. When a new slot
// lands, defaults live in one place. `colorClass` defaults match the
// historic hardcoded classes — preserves chrome for non-customized fields.

export const DEFAULT_MOVE_UP: ButtonDefaults = {
  Icon:       ArrowUpIcon,
  label:      'Move up',
  tooltip:    'Move up',
  colorClass: 'text-muted-foreground hover:text-foreground',
}
export const DEFAULT_MOVE_DOWN: ButtonDefaults = {
  Icon:       ArrowDownIcon,
  label:      'Move down',
  tooltip:    'Move down',
  colorClass: 'text-muted-foreground hover:text-foreground',
}
export const DEFAULT_CLONE: ButtonDefaults = {
  Icon:       CopyIcon,
  label:      'Duplicate row',
  tooltip:    'Duplicate row',
  colorClass: 'text-muted-foreground hover:text-foreground',
}
export const DEFAULT_DELETE: ButtonDefaults = {
  Icon:       Trash2Icon,
  label:      'Remove row',
  tooltip:    'Remove row',
  colorClass: 'text-muted-foreground hover:text-destructive',
}
export const DEFAULT_REORDER: ButtonDefaults = {
  Icon:       GripVerticalIcon,
  label:      'Drag to reorder',
  tooltip:    'Drag to reorder',
  colorClass: 'text-muted-foreground',
}
