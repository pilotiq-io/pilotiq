import { Field, type FieldMeta, type FieldType, type RenderContext } from '@pilotiq/pilotiq'
import { Block, type BlockMeta } from './Block.js'

export type RichTextToolbar = 'default' | 'none'

// Inherits `fieldType` from FieldMeta; we don't narrow it here because the
// `FieldType` union admits `(string & {})` which makes the narrow `'richtext'`
// literal incompatible during interface extension. `fieldType` is always
// `'richtext'` at runtime.
export interface RichTextFieldMeta extends FieldMeta {
  blocks:       BlockMeta[]
  slashCommand: boolean
  toolbar:      RichTextToolbar
}

/**
 * Field that renders a Tiptap-based rich-text editor with slash menu,
 * draggable blocks, and a custom-block API.
 *
 * @example
 * ```ts
 * RichTextField.make('body')
 *   .label('Article body')
 *   .placeholder('Start writing…')
 *   .blocks([
 *     Block.make('callout').label('Callout').icon('💡').schema([
 *       TextField.make('title'),
 *       TextareaField.make('content').required(),
 *     ]),
 *   ])
 * ```
 */
export class RichTextField extends Field {
  private _blocks:       Block[] = []
  private _slashCommand  = true
  private _toolbar:      RichTextToolbar = 'default'

  private constructor(name: string) {
    super(name, 'richtext' as FieldType)
  }

  static make(name: string): RichTextField {
    return new RichTextField(name)
  }

  /** Custom blocks available via the slash menu. */
  blocks(blocks: Block[]): this {
    this._blocks = blocks
    return this
  }

  /** Toggle the slash menu (`/`) on/off. Defaults to `true`. */
  slashCommand(enabled: boolean): this {
    this._slashCommand = enabled
    return this
  }

  /**
   * Toolbar profile. v1 has just `'default'` (selection-based bold/italic/link)
   * and `'none'`. Profile system can grow later.
   */
  toolbar(profile: RichTextToolbar): this {
    this._toolbar = profile
    return this
  }

  getBlocks():       readonly Block[] { return this._blocks }
  isSlashEnabled():  boolean { return this._slashCommand }
  getToolbar():      RichTextToolbar { return this._toolbar }

  override toMeta(ctx?: RenderContext): RichTextFieldMeta {
    // RichTextField has no async resolvers, so the parent always returns
    // the sync FieldMeta branch — cast away the union for the spread.
    const base = super.toMeta(ctx) as FieldMeta
    return {
      ...base,
      blocks:       this._blocks.map((b) => b.toMeta()),
      slashCommand: this._slashCommand,
      toolbar:      this._toolbar,
    }
  }
}
