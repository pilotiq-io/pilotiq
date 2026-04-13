import type { SchemaElement } from './SchemaElement.js'

export class Divider implements SchemaElement {
  private constructor(private _label?: string) {}

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
