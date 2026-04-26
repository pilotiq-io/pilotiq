import { Element } from './Element.js'

/**
 * Single tab within a `Tabs` container. Holds a label, optional icon/badge,
 * and a list of child Elements. Resolves to its own meta entry inside the
 * parent's children array.
 */
export class Tab extends Element {
  private _icon?: string
  private _badge?: string

  private constructor(private _label: string) {
    super()
  }

  static make(label: string): Tab {
    return new Tab(label)
  }

  icon(i: string): this { this._icon = i; return this }
  badge(b: string): this { this._badge = b; return this }

  schema(elements: Element[]): this {
    this._children = elements
    return this
  }

  getType(): string { return 'tab' }

  toMeta(): Record<string, unknown> {
    return {
      type: 'tab' as const,
      label: this._label,
      ...(this._icon  ? { icon:  this._icon  } : {}),
      ...(this._badge ? { badge: this._badge } : {}),
    }
  }
}

/**
 * Multi-tab container. Children are `Tab` instances; each Tab has its own
 * children rendered when its tab is active. Mirrors panels' `Tabs` element
 * for the static case (model-backed and array-backed Tabs are a future
 * extension).
 */
export class Tabs extends Element {
  private constructor() {
    super()
  }

  static make(): Tabs {
    return new Tabs()
  }

  /** Set the tab list. Each entry is a `Tab` instance with its own schema. */
  tabs(tabs: Tab[]): this {
    this._children = tabs
    return this
  }

  getType(): string { return 'tabs' }

  toMeta(): Record<string, unknown> {
    return { type: 'tabs' as const }
  }
}
