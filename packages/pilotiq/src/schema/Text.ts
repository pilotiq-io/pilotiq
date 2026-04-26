import { Element } from './Element.js'

export class Text extends Element {
  private constructor(private content: string) {
    super()
  }

  static make(content: string): Text {
    return new Text(content)
  }

  getType(): string { return 'text' }

  toMeta() {
    return { type: 'text' as const, content: this.content }
  }
}
