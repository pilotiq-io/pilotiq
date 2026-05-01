import { Element } from './Element.js'

/**
 * Lightweight labeled container. Renders as `<fieldset><legend>` with a
 * thin border + small horizontal padding. Lighter than `Section` — no
 * description, no collapsible disclosure, no badge. Use when fields share
 * a topic but the page already has section-level chrome.
 *
 * Optional `.columns(n)` produces a multi-column layout the same way
 * `Section.columns()` does. Outside of forms, Fieldset still renders the
 * border + legend; the renderer treats `<legend>` as a small heading
 * regardless of context.
 */
export class Fieldset extends Element {
  private _columns: 1 | 2 | 3 = 1

  private constructor(private _label: string) {
    super()
  }

  static make(label: string): Fieldset {
    return new Fieldset(label)
  }

  /** Number of columns the fieldset's children are laid out in. Default 1. */
  columns(n: 1 | 2 | 3): this { this._columns = n; return this }

  /** Set the children. Any Element type is accepted. */
  schema(elements: Element[]): this {
    this._children = elements
    return this
  }

  getType(): string { return 'fieldset' }

  toMeta(): Record<string, unknown> {
    return {
      type: 'fieldset' as const,
      label: this._label,
      columns: this._columns,
    }
  }
}
