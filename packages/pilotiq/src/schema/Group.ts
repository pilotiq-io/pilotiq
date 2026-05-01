import { Element } from './Element.js'

/**
 * Chrome-less container. Renders its children in a plain `<div>` with no
 * border, heading, padding, or background. Useful when you need a logical
 * grouping for visibility (`Group.make().visible(({ $get }) => …)`) or for
 * `_layout.columnSpan` on a parent grid without imposing visual chrome.
 *
 * Inherits `visible / hidden / columnSpan / columnStart / columnOrder`
 * from `Element` (Plan #8). No own state apart from children.
 */
export class Group extends Element {
  private constructor() { super() }

  static make(): Group {
    return new Group()
  }

  /** Set the children. Any Element type is accepted. */
  schema(elements: Element[]): this {
    this._children = elements
    return this
  }

  getType(): string { return 'group' }

  toMeta(): Record<string, unknown> {
    return { type: 'group' as const }
  }
}
