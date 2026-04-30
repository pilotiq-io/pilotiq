import { Field, type FieldMeta } from './Field.js'
import type { RenderContext } from '../schema/resolveSchema.js'

/**
 * Edits a flat `Record<string, string>`. Server-canonical shape:
 *
 *   { "X-Source": "admin", "X-Trace": "abc123" }
 *
 * The client serializes the map as a JSON string in a hidden input on
 * submit; `coerceFormValues` parses it back into an object. Keeping
 * the wire-format JSON dodges the bracket-notation parser footguns
 * across `application/x-www-form-urlencoded` and `multipart/form-data`.
 */
export class KeyValueField extends Field {
  private _keyLabel = 'Key'
  private _valueLabel = 'Value'
  private _addLabel = 'Add row'
  private _reorderable = false

  private constructor(name: string) {
    super(name, 'keyValue')
  }

  static make(name: string): KeyValueField {
    return new KeyValueField(name)
  }

  keyLabel(label: string): this   { this._keyLabel = label; return this }
  valueLabel(label: string): this { this._valueLabel = label; return this }
  addLabel(label: string): this   { this._addLabel = label; return this }

  /**
   * Show up/down arrow controls per row. Drag-and-drop ordering not
   * shipped in v1 — call back to up/down only when the persisted
   * order matters.
   */
  reorderable(value: boolean = true): this { this._reorderable = value; return this }

  getKeyLabel(): string { return this._keyLabel }
  getValueLabel(): string { return this._valueLabel }
  getAddLabel(): string { return this._addLabel }
  isReorderable(): boolean { return this._reorderable }

  override toMeta(ctx?: RenderContext): FieldMeta {
    return {
      ...this.buildMeta(ctx),
      keyLabel:    this._keyLabel,
      valueLabel:  this._valueLabel,
      addLabel:    this._addLabel,
      ...(this._reorderable ? { reorderable: true } : {}),
    }
  }
}

export const KeyValue = KeyValueField
