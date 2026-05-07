import { Element } from './Element.js'
import type { Action } from '../actions/Action.js'

export type AlertType = 'info' | 'warning' | 'success' | 'danger'

export class Alert extends Element {
  private _alertType: AlertType = 'info'
  private _title?: string

  private constructor(private content: string) {
    super()
  }

  static make(content: string): Alert {
    return new Alert(content)
  }

  alertType(t: AlertType): this { this._alertType = t; return this }
  title(t: string): this { this._title = t; return this }

  info(): this { return this.alertType('info') }
  warning(): this { return this.alertType('warning') }
  success(): this { return this.alertType('success') }
  danger(): this { return this.alertType('danger') }

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

  getType(): string { return 'alert' }

  toMeta() {
    return {
      type: 'alert' as const,
      content: this.content,
      alertType: this._alertType,
      ...(this._title ? { title: this._title } : {}),
    }
  }
}
