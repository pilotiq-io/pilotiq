import { Element } from './Element.js'

export class Card extends Element {
  private _description?: string

  private constructor(private _title?: string) {
    super()
  }

  static make(title?: string): Card {
    return this.configured(new Card(title))
  }

  description(d: string): this { this._description = d; return this }

  /**
   * Set the child elements of this card. Children can be any Element —
   * Fields, other display elements, Actions, etc. Resolved recursively
   * by `resolveSchema()` and attached to meta as `meta.children`.
   */
  schema(elements: Element[]): this {
    this._children = elements
    return this
  }

  getType(): string { return 'card' }

  toMeta(): Record<string, unknown> {
    return {
      type: 'card' as const,
      ...(this._title ? { title: this._title } : {}),
      ...(this._description ? { description: this._description } : {}),
    }
  }
}
