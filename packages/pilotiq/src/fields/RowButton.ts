/**
 * Chrome customizer for the built-in per-row buttons rendered by
 * `RepeaterField` and `BuilderField`. Mirrors Filament's
 * `addAction / cloneAction / deleteAction / moveUpAction / moveDownAction /
 *  reorderAction / collapseAction` ergonomic — swap the icon, label, color,
 * or tooltip without rewriting the renderer.
 *
 * Intentionally NOT an `Action`. The pilotiq `Action` primitive carries
 * dispatch modes (handler / href / submit / modal / form-field), visibility
 * rules, and a per-row dispatch URL — none of which apply here. The
 * built-in buttons own their behavior; the customizer is chrome only.
 *
 * Icons are string-only and resolved through the runtime icon registry
 * (`registerIcons({ … })` → `getIcon(name)`), the same posture as
 * `Block.icon()` and `Section.icon()`. Component-typed icons stay reserved
 * for top-level Resource / Global / Page bindings that own a manifest entry.
 *
 * @example
 *   Repeater.make('items')
 *     .schema([…])
 *     .addAction(RowButton.make().label('Add line item').icon('plus-circle'))
 *     .deleteAction(RowButton.make().tooltip('Remove this line').color('destructive'))
 *     .cloneAction(RowButton.make().icon('files'))
 */

export type RowButtonColor =
  | 'foreground'
  | 'destructive'
  | 'primary'
  | 'success'
  | 'warning'
  | 'info'
  | 'muted'

export interface RowButtonMeta {
  label?:   string
  icon?:    string
  color?:   RowButtonColor
  tooltip?: string
}

export class RowButton {
  private _label?:   string
  private _icon?:    string
  private _color?:   RowButtonColor
  private _tooltip?: string

  private constructor() {}

  static make(): RowButton {
    return new RowButton()
  }

  /**
   * Override the button's visible label. Today only the bottom Add button
   * renders a label; icon-only row buttons (clone / delete / move /
   * collapse / reorder grip) read this for `aria-label` so screen readers
   * still pick up custom wording.
   */
  label(s: string): this { this._label = s; return this }

  /**
   * Override the button's icon. Pass a registry key — the renderer resolves
   * via `getIcon(name)` against the runtime registry populated by
   * `registerIcons({ … })`. Falls back to the slot's default Lucide icon
   * when the key isn't registered.
   */
  icon(name: string): this { this._icon = name; return this }

  /**
   * Override the button's foreground color. Maps to a small palette of
   * Tailwind class pairs picked at render — keeps the customizer JSON-safe
   * and matches `Action.color()`'s tokens.
   */
  color(c: RowButtonColor): this { this._color = c; return this }

  /**
   * Override the hover tooltip. Defaults: `'Drag to reorder'` on the
   * grip, `'Move up' / 'Move down'` on the arrows, `'Duplicate row'` on
   * the clone button, `'Remove row'` on the trash, `'Expand' / 'Collapse'`
   * on the chevron.
   */
  tooltip(s: string): this { this._tooltip = s; return this }

  // ─── Read-only access ────────────────────────────────

  getLabel():   string | undefined        { return this._label   }
  getIcon():    string | undefined        { return this._icon    }
  getColor():   RowButtonColor | undefined { return this._color  }
  getTooltip(): string | undefined        { return this._tooltip }

  // ─── Wire format ─────────────────────────────────────

  /**
   * Serialize to a flat JSON-safe meta. Drops keys the user never set so
   * the renderer can `??` against its built-in defaults without clobbering
   * them with `undefined`.
   */
  toMeta(): RowButtonMeta {
    const meta: RowButtonMeta = {}
    if (this._label   !== undefined) meta.label   = this._label
    if (this._icon    !== undefined) meta.icon    = this._icon
    if (this._color   !== undefined) meta.color   = this._color
    if (this._tooltip !== undefined) meta.tooltip = this._tooltip
    return meta
  }
}

/**
 * Slot id for one of the seven built-in row chrome buttons. The renderer
 * looks these up in `meta.buttons[kind]` to merge customizer overrides
 * onto its hardcoded defaults.
 */
export type RowButtonKind =
  | 'add'
  | 'clone'
  | 'delete'
  | 'moveUp'
  | 'moveDown'
  | 'reorder'
  | 'collapse'

export type RowButtonsMeta = {
  [K in RowButtonKind]?: RowButtonMeta
}
