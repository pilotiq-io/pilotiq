import React from 'react'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronsDownIcon,
  ChevronsUpIcon,
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
 * Drag grip — a `<span>` not a `<button>`. Honors the `reorderAction`
 * customizer for icon / label / tooltip / color so users can swap the
 * glyph or copy without owning the drag wiring.
 *
 * When `dragHandleProps` is passed, the grip carries `draggable=true` +
 * `onDragStart` and becomes the HTML5 drag source — required for row
 * layouts whose body hosts a contenteditable (Tiptap-backed fields).
 * If `draggable=true` lives on the row container instead, a dragstart
 * that initiates over the contenteditable is absorbed by the text-
 * selection handler and the row drag never fires. Moving the source to
 * the grip sidesteps that. Drop-target handlers (`onDragOver/onDrop/
 * onDragEnd`) stay on the row container — `dragend` bubbles so source-
 * side cleanup still reaches it.
 */
export function ReorderGrip({
  disabled,
  buttons,
  dragHandleProps,
}: {
  disabled: boolean
  buttons:  RowButtonsMeta | undefined
  dragHandleProps?: {
    draggable:   true
    onDragStart: (e: React.DragEvent<HTMLElement>) => void
  } | undefined
}): React.ReactElement {
  const { Icon, label, tooltip, colorClass } = resolveRowChromeFor('reorder', DEFAULT_REORDER, buttons)
  return (
    <span
      aria-label={label}
      title={tooltip}
      className={`${colorClass} ${disabled ? 'opacity-30' : 'cursor-grab active:cursor-grabbing'}`}
      {...dragHandleProps}
    >
      <Icon className="size-4" />
    </span>
  )
}

/**
 * Collapse chevron — picks the open/closed glyph from state, then lets
 * customizer overrides take over. When the row is currently collapsed,
 * `expand` (from `expandAction(...)`) wins, falling back to `collapse`
 * (from `collapseAction(...)`) for back-compat with single-override
 * setups. When the row is open, `collapse` is used directly. Authors
 * who want different chrome per state set both `collapseAction` and
 * `expandAction`; authors who want a single uniform override keep
 * setting just `collapseAction`.
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
  const override = isCollapsed
    ? (buttons?.expand ?? buttons?.collapse)
    : buttons?.collapse
  return (
    <RowChromeIconButton
      defaults={defaults}
      override={override}
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
export const DEFAULT_EXPAND_ALL: ButtonDefaults = {
  Icon:       ChevronsDownIcon,
  label:      'Expand all',
  tooltip:    'Expand all',
  colorClass: 'text-muted-foreground hover:text-foreground',
}
export const DEFAULT_COLLAPSE_ALL: ButtonDefaults = {
  Icon:       ChevronsUpIcon,
  label:      'Collapse all',
  tooltip:    'Collapse all',
  colorClass: 'text-muted-foreground hover:text-foreground',
}

/**
 * Field-header strip with bulk Expand-all / Collapse-all chips. Renders
 * only the buttons whose customizer slot is set on `buttons` — the
 * presence of `buttons.expandAll` / `buttons.collapseAll` is what flips
 * the matching button into existence (different from per-row chrome,
 * which always renders when collapsible). Returns `null` when neither
 * slot is configured so callers can mount the strip unconditionally.
 */
export function BulkCollapseHeader({
  buttons,
  disabled,
  onExpandAll,
  onCollapseAll,
}: {
  buttons:        RowButtonsMeta | undefined
  disabled:       boolean
  onExpandAll:    () => void
  onCollapseAll:  () => void
}): React.ReactElement | null {
  const expandAllOverride   = buttons?.expandAll
  const collapseAllOverride = buttons?.collapseAll
  if (!expandAllOverride && !collapseAllOverride) return null
  return (
    <div className="flex items-center justify-end gap-1">
      {expandAllOverride && (
        <BulkChromeButton
          defaults={DEFAULT_EXPAND_ALL}
          override={expandAllOverride}
          disabled={disabled}
          onClick={onExpandAll}
        />
      )}
      {collapseAllOverride && (
        <BulkChromeButton
          defaults={DEFAULT_COLLAPSE_ALL}
          override={collapseAllOverride}
          disabled={disabled}
          onClick={onCollapseAll}
        />
      )}
    </div>
  )
}

/**
 * Compact button used by `BulkCollapseHeader` — icon + label, sized to
 * read as a header chip (smaller than a full Action button, larger than
 * the icon-only per-row chrome). Picks up the same `RowButton`
 * override surface as every other slot.
 */
function BulkChromeButton({
  defaults,
  override,
  disabled,
  onClick,
}: {
  defaults: ButtonDefaults
  override: RowButtonMeta | undefined
  disabled: boolean
  onClick:  () => void
}): React.ReactElement {
  const { Icon, label, tooltip, colorClass } = resolveRowChrome(defaults, override)
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={tooltip}
      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs ${colorClass} disabled:opacity-30`}
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  )
}
