import { Element, type ElementMeta } from '../schema/Element.js'
import {
  Action,
  type ActionColor,
  type ActionSize,
  type ActionPlacement,
  type ActionVisibilityContext,
  type VisibilityRule,
} from './Action.js'

export interface ActionGroupMeta extends ElementMeta {
  type:        'actionGroup'
  name:        string
  label:       string
  placement:   ActionPlacement
  icon?:       string
  tooltip?:    string
  color?:      ActionColor
  size?:       ActionSize
  outlined?:   boolean
  iconOnly?:   boolean
  /** True when the group itself has visibility rules. The renderer checks
   * `disabled` separately. */
  conditional?: boolean
  disabled?:   boolean
}

/**
 * `ActionGroup` — a labelled trigger that opens a dropdown of related
 * actions. Lives wherever a single `Action` can live (header slot,
 * inline in a Card, etc). Children are `Action[]` (nesting groups inside
 * groups is supported but renders flat — the inner group's actions are
 * folded into the parent dropdown).
 *
 * Visibility evaluation: each child Action's own `.visible()`/`.hidden()`
 * rules still apply at render time. The group itself can also opt-in to
 * group-level visibility via the same builders. When ALL children would
 * be hidden the group falls back to the disabled-ghost state so the
 * trigger doesn't disappear unexpectedly — the renderer handles that.
 */
export class ActionGroup extends Element {
  readonly name: string

  protected _label: string
  protected _icon?: string
  protected _tooltip?: string
  protected _placement: ActionPlacement = 'inline'

  // Trigger styling
  protected _color?: ActionColor
  protected _size?: ActionSize
  protected _outlined = false
  protected _iconOnly = false

  // Visibility
  protected _visible?: VisibilityRule
  protected _hidden?: VisibilityRule
  protected _isDisabled?: VisibilityRule

  private constructor(name: string) {
    super()
    this.name = name
    this._label = name.charAt(0).toUpperCase() + name.slice(1)
  }

  static make(name: string): ActionGroup {
    return new ActionGroup(name)
  }

  // ─── Children ─────────────────────────────────────────

  /** Set the actions inside this group. Accepts plain `Action`s; nested
   * `ActionGroup`s are accepted but flatten in v1 (their children get
   * pulled up into this group's dropdown). */
  actions(items: Array<Action | ActionGroup>): this {
    const flat: Action[] = []
    for (const item of items) {
      if (item instanceof ActionGroup) {
        flat.push(...item.getActions())
      } else {
        flat.push(item)
      }
    }
    this._children = flat
    return this
  }

  /** Convenience: the `Action` children only. */
  getActions(): Action[] {
    return (this._children ?? []).filter((c): c is Action => c instanceof Action)
  }

  // ─── Trigger config ───────────────────────────────────

  label(l: string): this { this._label = l; return this }
  icon(i: string): this  { this._icon  = i; return this }
  tooltip(t: string): this { this._tooltip = t; return this }
  color(c: ActionColor): this { this._color = c; return this }
  size(s: ActionSize): this { this._size = s; return this }
  outlined(v = true): this { this._outlined = v; return this }
  iconButton(v = true): this { this._iconOnly = v; return this }

  // ─── Placement ────────────────────────────────────────

  placement(p: ActionPlacement): this { this._placement = p; return this }
  inline(): this { return this.placement('inline') }
  row(): this    { return this.placement('row') }
  bulk(): this   { return this.placement('bulk') }
  header(): this { return this.placement('header') }

  // ─── Visibility ───────────────────────────────────────

  visible(rule: VisibilityRule): this { this._visible = rule; return this }
  hidden(rule: VisibilityRule): this  { this._hidden = rule; return this }
  disabled(rule: VisibilityRule): this { this._isDisabled = rule; return this }
  authorize(rule: VisibilityRule): this { return this.visible(rule) }

  async evaluate(ctx: ActionVisibilityContext = {}): Promise<{ visible: boolean; disabled: boolean }> {
    const evalRule = async (rule: VisibilityRule | undefined, fallback: boolean): Promise<boolean> => {
      if (rule === undefined) return fallback
      if (typeof rule !== 'function') return rule
      try {
        return await rule(ctx)
      } catch {
        return !fallback
      }
    }
    const [visibleRaw, hiddenRaw, disabledRaw] = await Promise.all([
      evalRule(this._visible, true),
      evalRule(this._hidden, false),
      evalRule(this._isDisabled, false),
    ])
    return {
      visible:  visibleRaw && !hiddenRaw,
      disabled: disabledRaw,
    }
  }

  hasVisibilityRules(): boolean {
    return this._visible !== undefined || this._hidden !== undefined || this._isDisabled !== undefined
  }

  // ─── Getters ──────────────────────────────────────────

  getLabel():     string             { return this._label }
  getIcon():      string | undefined { return this._icon }
  getTooltip():   string | undefined { return this._tooltip }
  getPlacement(): ActionPlacement    { return this._placement }
  getColor():     ActionColor | undefined { return this._color }
  getSize():      ActionSize | undefined  { return this._size }
  isOutlined():   boolean { return this._outlined }
  isIconOnly():   boolean { return this._iconOnly }

  // ─── Element contract ────────────────────────────────

  override getType(): string { return 'actionGroup' }

  override toMeta(): ActionGroupMeta {
    return {
      type:      'actionGroup',
      name:      this.name,
      label:     this._label,
      placement: this._placement,
      ...(this._icon     ? { icon:     this._icon     } : {}),
      ...(this._tooltip  ? { tooltip:  this._tooltip  } : {}),
      ...(this._color    ? { color:    this._color    } : {}),
      ...(this._size     ? { size:     this._size     } : {}),
      ...(this._outlined ? { outlined: true           } : {}),
      ...(this._iconOnly ? { iconOnly: true           } : {}),
      ...(this.hasVisibilityRules() ? { conditional: true } : {}),
    }
  }
}
