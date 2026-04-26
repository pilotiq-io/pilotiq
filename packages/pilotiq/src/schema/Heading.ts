import { Element } from './Element.js'

export class Heading extends Element {
  private _level: 1 | 2 | 3 = 1
  private _description?: string

  private constructor(private content: string) {
    super()
  }

  static make(content: string): Heading {
    return new Heading(content)
  }

  level(l: 1 | 2 | 3): this { this._level = l; return this }
  description(d: string): this { this._description = d; return this }

  getType(): string { return 'heading' }

  toMeta() {
    return {
      type: 'heading' as const,
      content: this.content,
      level: this._level,
      ...(this._description ? { description: this._description } : {}),
    }
  }
}
