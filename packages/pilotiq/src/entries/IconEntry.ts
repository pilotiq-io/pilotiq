import { Entry, type EntryMeta } from './Entry.js'
import type { RenderContext } from '../schema/resolveSchema.js'

/** Per-value icon mapping. `icon` is a registry name (`getIcon(name)`);
 *  `color` is one of the standard column-color tokens; `label` overrides
 *  the accessible label (defaults to the raw value). */
export interface IconEntryOption {
  icon:   string
  color?: string
  label?: string
}

/**
 * Read-only sibling of `IconColumn` / `BooleanColumn`. Renders an icon
 * for the resolved state value via a value→icon map. Use for status
 * indicators on detail pages (active/inactive, paid/unpaid, …).
 *
 * @example
 * IconEntry.make('verified').options({
 *   true:  { icon: 'check-circle', color: 'success', label: 'Verified' },
 *   false: { icon: 'x-circle',     color: 'destructive', label: 'Unverified' },
 * })
 */
export class IconEntry extends Entry {
  private _options: Record<string, IconEntryOption> = {}

  private constructor(name: string) {
    super(name)
  }

  static make(name: string): IconEntry {
    return new IconEntry(name)
  }

  options(map: Record<string, IconEntryOption>): this {
    this._options = { ...this._options, ...map }
    return this
  }

  protected override getEntryType(): string { return 'icon' }

  override async toMeta(ctx?: RenderContext): Promise<EntryMeta> {
    const meta = await Promise.resolve(super.toMeta(ctx)) as EntryMeta & { options?: Record<string, IconEntryOption> }
    if (Object.keys(this._options).length > 0) {
      meta.options = this._options
    }
    return meta
  }
}
