import { Element } from './Element.js'

/**
 * Phase C — one rung in the breadcrumb chain. A trailing item without
 * a `url` is rendered as the current page (unlinked, `aria-current="page"`).
 */
export interface BreadcrumbItem {
  label: string
  url?:  string
}

/**
 * Phase C — server-resolved breadcrumb strip. Page-data builders
 * prepend it ahead of any other top-of-page chrome (e.g. RelationTabs)
 * so the renderer can paint:
 *
 *   Home / Posts / "Hello world" / Edit
 *
 * Users do not author this directly; the per-page-role builders in
 * `pageData.ts` construct it via `Breadcrumbs.make([...])` after they've
 * already loaded the parent / child records they need to derive titles.
 */
export class Breadcrumbs extends Element {
  private constructor(private readonly _items: BreadcrumbItem[]) {
    super()
  }

  static make(items: BreadcrumbItem[]): Breadcrumbs {
    return this.configured(new Breadcrumbs(items))
  }

  getType(): string { return 'breadcrumbs' }

  toMeta() {
    return {
      type:  'breadcrumbs' as const,
      items: this._items,
    }
  }
}
