import type { SchemaElement } from './SchemaElement.js'

export class Text implements SchemaElement {
  private constructor(private content: string) {}

  static make(content: string): Text {
    return new Text(content)
  }

  getType(): string { return 'text' }

  toMeta() {
    return { type: 'text' as const, content: this.content }
  }
}
