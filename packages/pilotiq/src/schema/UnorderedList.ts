import { Element } from './Element.js'
import type { TextColor, TextSize, TextWeight } from './Text.js'

/**
 * Read-only bullet list prime — sibling of `Heading / Text / Alert / Divider`.
 *
 * Items are plain strings stamped at schema build time. For dynamic data,
 * compose with Resource state in your schema callback (the items array
 * accepts the result of any expression).
 *
 * Cosmetic chrome mirrors `Text` — `color / size / weight` flow through to
 * each `<li>` so the list reads consistently against neighbouring text in
 * a detail view.
 */
export class UnorderedList extends Element {
  private _items: string[]
  private _color?:  TextColor
  private _size?:   TextSize
  private _weight?: TextWeight

  private constructor(items: string[]) {
    super()
    this._items = items
  }

  /** Create a list. Pass the items inline or via `.items()` later. */
  static make(items: string[] = []): UnorderedList {
    return new UnorderedList(items)
  }

  /** Replace the items array. Last call wins. */
  items(items: string[]): this { this._items = items; return this }

  color(c: TextColor): this   { this._color = c; return this }
  size(s: TextSize): this     { this._size = s; return this }
  weight(w: TextWeight): this { this._weight = w; return this }

  getType(): string { return 'unorderedList' }

  toMeta() {
    return {
      type:  'unorderedList' as const,
      items: this._items,
      ...(this._color  ? { color:  this._color  } : {}),
      ...(this._size   ? { size:   this._size   } : {}),
      ...(this._weight ? { weight: this._weight } : {}),
    }
  }
}
