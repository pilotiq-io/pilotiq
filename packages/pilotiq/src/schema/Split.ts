import { Element } from './Element.js'

export type SplitFrom = 'left' | 'right'

/**
 * Two-column layout — main + aside. Renders as a stacked flex on small
 * viewports and a horizontal flex on `@md` (container query). Children
 * tagged with `.aside()` (e.g. `Section.aside()`) become the right-rail
 * (or left, when `from('left')`); without explicit markers, the second
 * child is treated as the aside.
 *
 * The renderer picks the aside-styled width from a small palette of
 * shadcn-flavoured sidebar widths (~20rem). The main child grows to
 * fill the remaining space.
 *
 * Useful for settings pages with a navigation card on the side, or for
 * resource forms where the primary content is a long article body and
 * the aside holds publish controls.
 */
export class Split extends Element {
  private _from: SplitFrom = 'right'
  private _gap = 6

  private constructor() { super() }

  static make(): Split {
    return new Split()
  }

  /** Which side the aside child sits on. Defaults to `'right'`. */
  from(side: SplitFrom): this { this._from = side; return this }

  /** Gap between main and aside (Tailwind spacing scale). Default 6 (24px). */
  gap(n: number): this { this._gap = n; return this }

  schema(elements: Element[]): this {
    this._children = elements
    return this
  }

  getType(): string { return 'split' }

  toMeta(): Record<string, unknown> {
    return {
      type: 'split' as const,
      from: this._from,
      gap:  this._gap,
    }
  }
}
