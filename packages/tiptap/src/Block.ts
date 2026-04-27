import type { Field } from '@pilotiq/pilotiq'
import type { FieldMeta } from '@pilotiq/pilotiq'

/**
 * JSON-serializable block descriptor sent to the editor renderer. Mirrors
 * the shape `@pilotiq/lexical` used in the panels world so existing intuition
 * carries over.
 */
export interface BlockMeta {
  name:   string
  label:  string
  icon:   string | undefined
  schema: FieldMeta[]
}

/**
 * Builder for a custom block type that can be inserted into a `RichTextField`
 * via the slash menu and rendered inline as an editable form.
 *
 * @example
 * ```ts
 * Block.make('callout')
 *   .label('Callout')
 *   .icon('💡')
 *   .schema([
 *     TextField.make('title'),
 *     TextareaField.make('content').required(),
 *   ])
 * ```
 */
export class Block {
  private _name:   string
  private _label?: string
  private _icon?:  string
  private _schema: Field[] = []

  protected constructor(name: string) {
    this._name = name
  }

  static make(name: string): Block {
    return new Block(name)
  }

  /** Display label shown in the slash menu. Defaults to the block name. */
  label(label: string): this {
    this._label = label
    return this
  }

  /** Emoji or icon string shown in the slash menu. */
  icon(icon: string): this {
    this._icon = icon
    return this
  }

  /** Fields rendered inline when this block is inserted. */
  schema(fields: Field[]): this {
    this._schema = fields
    return this
  }

  getName():   string  { return this._name }
  getLabel():  string  { return this._label ?? this._name }
  getIcon():   string | undefined { return this._icon }
  getSchema(): readonly Field[] { return this._schema }

  /** @internal */
  toMeta(): BlockMeta {
    return {
      name:   this._name,
      label:  this._label ?? this._name,
      icon:   this._icon,
      schema: this._schema.map((f) => f.toMeta() as FieldMeta),
    }
  }
}
