import { Element } from './Element.js'
import type { Action } from '../actions/Action.js'
import type { IconColor } from './Icon.js'

export type AlertType = 'info' | 'warning' | 'success' | 'danger'

/**
 * Alignment for the footer-actions row inside an `Alert` (Filament v5
 * parity). `'start'` aligns the buttons to the leading edge (LTR =
 * left), `'center'` to the middle, `'end'` to the trailing edge (LTR =
 * right). Defaults to `'start'`.
 */
export type AlertActionsAlignment = 'start' | 'center' | 'end'

export class Alert extends Element {
  private _alertType:        AlertType = 'info'
  private _title?:           string
  private _dismissible       = false
  private _persistKey?:      string
  private _iconColor?:       IconColor
  private _actionsAlignment: AlertActionsAlignment = 'start'

  private constructor(private content: string) {
    super()
  }

  static make(content: string): Alert {
    return this.configured(new Alert(content))
  }

  alertType(t: AlertType): this { this._alertType = t; return this }
  title(t: string):        this { this._title     = t; return this }

  info():    this { return this.alertType('info')    }
  warning(): this { return this.alertType('warning') }
  success(): this { return this.alertType('success') }
  danger():  this { return this.alertType('danger')  }

  /**
   * Action buttons rendered as a footer row below the alert body —
   * matches the reference admin's `Callout` shape (in-callout CTAs like
   * "Upgrade" or "Read changelog"). Same wiring as `Heading.actions(...)`
   * and `EmptyState.footer(...)` — actions land on `_children` and the
   * standard schema walker resolves them so `Action.evaluate(ctx)`
   * (visibility / authorize) fires unchanged.
   */
  actions(actions: Action[]): this {
    this._children = actions
    return this
  }

  /** Filament v5 parity alias for `actions([...])`. Identical semantics. */
  controls(actions: Action[]): this {
    return this.actions(actions)
  }

  /**
   * Filament v5 parity — variadic `controlActions(a, b, c, …)` matches
   * the spread shape `controlActions(Action::make(...), Action::make(...))`.
   */
  controlActions(...actions: Action[]): this {
    return this.actions(actions)
  }

  /**
   * Toggle the close (`×`) button rendered in the alert's top-right
   * corner. Off by default (matches today's behaviour). Dismissal is
   * per-mount (component-local state) unless paired with
   * `persistDismissal(key)`, which writes to `localStorage` so the
   * alert stays hidden across reloads.
   *
   * @example
   *   Alert.make('Heads up — billing downgrades on Friday.')
   *     .warning()
   *     .dismissible()
   *     .persistDismissal('billing-downgrade-2026-q2')
   */
  dismissible(value: boolean = true): this {
    this._dismissible = value
    return this
  }

  /**
   * Persist dismissal under a stable localStorage key. Auto-arms
   * `dismissible(true)` so the close button shows up. The key is
   * stored under `pilotiq.alert.<key>` to namespace from other
   * pilotiq localStorage entries; users only see the leaf segment.
   */
  persistDismissal(key: string): this {
    this._persistKey  = key
    this._dismissible = true
    return this
  }

  /**
   * Override the icon color independent of the alert type. By default
   * the renderer picks an icon hue matching `alertType`
   * (info/warning/success/danger); call this to force a different one
   * — e.g. a `warning`-typed alert with a `'destructive'` icon when
   * the message escalates partway through a flow.
   */
  iconColor(color: IconColor): this {
    this._iconColor = color
    return this
  }

  /**
   * Align the footer actions row. Defaults to `'start'` (LTR-left).
   * Use `'end'` for "primary action sits opposite the close button"
   * layouts; `'center'` for short single-button alerts.
   */
  footerActionsAlignment(alignment: AlertActionsAlignment): this {
    this._actionsAlignment = alignment
    return this
  }

  getType(): string { return 'alert' }

  toMeta() {
    return {
      type:      'alert' as const,
      content:   this.content,
      alertType: this._alertType,
      ...(this._title             !== undefined ? { title:             this._title             } : {}),
      ...(this._dismissible                     ? { dismissible:       true                    } : {}),
      ...(this._persistKey        !== undefined ? { persistDismissal:  this._persistKey        } : {}),
      ...(this._iconColor         !== undefined ? { iconColor:         this._iconColor         } : {}),
      ...(this._actionsAlignment !== 'start'    ? { actionsAlignment:  this._actionsAlignment  } : {}),
    }
  }
}
