import { Element } from './Element.js'

export class Divider extends Element {
  private constructor(private _label?: string) {
    super()
  }

  static make(label?: string): Divider {
    return new Divider(label)
  }

  getType(): string { return 'divider' }

  toMeta() {
    return {
      type: 'divider' as const,
      ...(this._label ? { label: this._label } : {}),
    }
  }
}
