import type { SchemaElement, SchemaElementMeta } from './SchemaElement.js'

export class Card implements SchemaElement {
  private _description?: string
  private _schema: SchemaElement[] = []

  private constructor(private _title?: string) {}

  static make(title?: string): Card {
    return new Card(title)
  }

  description(d: string): this { this._description = d; return this }
  schema(elements: SchemaElement[]): this { this._schema = elements; return this }

  getType(): string { return 'card' }

  /** @internal — used by resolveSchema to access nested elements */
  getSchema(): SchemaElement[] { return this._schema }

  toMeta(): Record<string, unknown> {
    return {
      type: 'card' as const,
      ...(this._title ? { title: this._title } : {}),
      ...(this._description ? { description: this._description } : {}),
      elements: [] as SchemaElementMeta[], // filled by resolveSchema
    }
  }
}
