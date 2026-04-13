import type { SchemaElement } from './SchemaElement.js'

export type AlertType = 'info' | 'warning' | 'success' | 'danger'

export class Alert implements SchemaElement {
  private _alertType: AlertType = 'info'
  private _title?: string

  private constructor(private content: string) {}

  static make(content: string): Alert {
    return new Alert(content)
  }

  alertType(t: AlertType): this { this._alertType = t; return this }
  title(t: string): this { this._title = t; return this }

  info(): this { return this.alertType('info') }
  warning(): this { return this.alertType('warning') }
  success(): this { return this.alertType('success') }
  danger(): this { return this.alertType('danger') }

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
