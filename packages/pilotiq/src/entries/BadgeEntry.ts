import { Entry, type EntryMeta } from './Entry.js'
import type { BadgeColor } from '../columns/BadgeColumn.js'
import type { RenderContext } from '../schema/resolveSchema.js'

/**
 * Read-only sibling of `BadgeColumn`. Renders the resolved state value as
 * a colored pill. Pair with `.colors({ value: BadgeColor })` to map each
 * value to a preset; unknown values fall back to `gray`.
 *
 * @example
 * BadgeEntry.make('status').colors({ draft: 'gray', published: 'success', archived: 'warning' })
 */
export class BadgeEntry extends Entry {
  private _colors: Record<string, BadgeColor> = {}

  private constructor(name: string) {
    super(name)
  }

  static make(name: string): BadgeEntry {
    return new BadgeEntry(name)
  }

  /** value→color preset map. Unknown values render as `gray`. */
  colors(map: Record<string, BadgeColor>): this {
    this._colors = { ...this._colors, ...map }
    return this
  }

  protected override getEntryType(): string { return 'badge' }

  override async toMeta(ctx?: RenderContext): Promise<EntryMeta> {
    const meta = await Promise.resolve(super.toMeta(ctx)) as EntryMeta & { colors?: Record<string, BadgeColor> }
    if (Object.keys(this._colors).length > 0) {
      meta.colors = this._colors
    }
    return meta
  }
}
