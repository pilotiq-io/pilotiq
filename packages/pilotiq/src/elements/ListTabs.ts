import { Element, type ElementMeta } from '../schema/Element.js'
import type { ListTab } from '../Tab.js'

/** Container element holding a strip of `ListTab` triggers above a Table.
 * Built by `ListPage.schema()` from `ListPage.getTabs()` — users typically
 * don't construct this directly. The renderer treats it like a flat row of
 * tab triggers (no body / no per-tab content), since each tab modifies the
 * shared Table query rather than swapping in different content. */
export class ListTabs extends Element {
  private constructor() { super() }

  static make(): ListTabs {
    return new ListTabs()
  }

  /** Set the tab list. Each entry is a `ListTab` instance with its own
   * label/icon/badge/query modifier. */
  tabs(tabs: ListTab[]): this {
    this._children = tabs
    return this
  }

  override getType(): string { return 'listTabs' }

  override toMeta(): ElementMeta {
    return { type: 'listTabs' }
  }
}
