import { Entry, type EntryMeta } from './Entry.js'
import type { RenderContext } from '../schema/resolveSchema.js'

/**
 * Read-only sibling of `KeyValueField`. Renders a `Record<string, unknown>`
 * (or any plain object) as a two-column key/value table. Useful for debug
 * surfaces — request headers, webhook payloads, settings blobs.
 *
 * The state value at `ctx.record[name]` may be:
 *   - a plain object → rendered as key→value rows
 *   - a JSON string  → parsed and rendered (admin-trusted; non-JSON falls
 *     through as a single "value" entry)
 *   - null / undefined / empty → renders the `default()` placeholder
 *
 * Values that are themselves objects / arrays are stringified via JSON
 * for compactness; primitives render as their string form.
 *
 * @example
 * KeyValueEntry.make('headers').keyLabel('Header').valueLabel('Value')
 */
export class KeyValueEntry extends Entry {
  private _keyLabel   = 'Key'
  private _valueLabel = 'Value'

  private constructor(name: string) {
    super(name)
  }

  static make(name: string): KeyValueEntry {
    return this.configured(new KeyValueEntry(name))
  }

  keyLabel(label: string): this   { this._keyLabel = label; return this }
  valueLabel(label: string): this { this._valueLabel = label; return this }

  protected override getEntryType(): string { return 'keyValue' }

  override async toMeta(ctx?: RenderContext): Promise<EntryMeta> {
    const meta = await Promise.resolve(super.toMeta(ctx)) as EntryMeta & {
      keyLabel?:   string
      valueLabel?: string
    }
    meta.keyLabel   = this._keyLabel
    meta.valueLabel = this._valueLabel
    return meta
  }
}
