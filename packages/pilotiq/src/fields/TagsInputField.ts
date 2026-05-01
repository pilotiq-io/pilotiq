import { Field, type FieldMeta } from './Field.js'
import type { RenderContext } from '../schema/resolveSchema.js'

/**
 * Suggestions resolver. Simpler shape than `OptionsResolver` because
 * a tag is its own label — the suggestion list is `string[]`, not
 * `{value,label}[]`. Layer SelectOption-shaped suggestions later if
 * a real consumer needs label / value to diverge.
 */
export type TagsSuggestionsResolver = (ctx: {
  $get?:   (name: string) => unknown
  values?: Record<string, unknown>
  record?: unknown
  user?:   unknown
}) => string[] | Promise<string[]>

async function resolveSuggestions(
  source:    string[] | TagsSuggestionsResolver,
  ctx:       RenderContext | undefined,
  fieldName: string,
): Promise<string[]> {
  if (Array.isArray(source)) return source
  try {
    return await source({
      ...(ctx?.$get   ? { $get:   ctx.$get   } : {}),
      ...(ctx?.values ? { values: ctx.values } : {}),
      ...(ctx?.record !== undefined ? { record: ctx.record } : {}),
      ...(ctx?.user   !== undefined ? { user:   ctx.user   } : {}),
    })
  } catch (err) {
    console.warn(`[pilotiq] suggestions() resolver for "${fieldName}" threw:`, err)
    return []
  }
}

/**
 * Free-text multi-tag input. Value is `string[]`. The client renders
 * pill-shaped chips per committed tag plus a single inline text input;
 * pressing Enter (or any of `splitKeys`) commits the current draft to
 * the chip set. Pasting a string containing `separator` splits into
 * multiple chips at once. Backspace on an empty draft removes the last
 * chip.
 *
 * Wire format mirrors `KeyValue` — the client serializes the chip set
 * as a JSON string in a single hidden input and `coerceFormValues`
 * parses it back into `string[]`. Avoids the multi-input-with-same-name
 * footguns across `application/x-www-form-urlencoded` and
 * `multipart/form-data` bodies.
 */
export class TagsInputField extends Field {
  private _suggestions: string[] | TagsSuggestionsResolver = []
  private _separator:   string | null = ','
  private _splitKeys:   string[] = ['Enter']
  private _reorderable = false
  private _maxTags:     number | null = null

  private constructor(name: string) {
    super(name, 'tagsInput')
  }

  static make(name: string): TagsInputField {
    return new TagsInputField(name)
  }

  suggestions(opts: string[] | TagsSuggestionsResolver): this {
    this._suggestions = opts
    return this
  }

  /**
   * Single character that splits a pasted string into multiple tags.
   * Pass `null` to disable paste-splitting; only `splitKeys` then
   * commits a draft.
   */
  separator(char: string | null): this {
    this._separator = char
    return this
  }

  /**
   * Keys that commit the current draft to the chip set. Defaults to
   * `['Enter']`. Common addition: `['Enter', 'Tab', ',']`. The
   * separator char is automatically treated as a split key as well.
   */
  splitKeys(keys: string[]): this {
    this._splitKeys = keys
    return this
  }

  /** Reserve drag-reorder for v2 — the chip row stays in insertion order. */
  reorderable(value: boolean = true): this {
    this._reorderable = value
    return this
  }

  /** Cap the chip count. Surfaces to validation-renderer + client guard. */
  maxTags(n: number): this {
    this._maxTags = Math.max(1, Math.floor(n))
    return this
  }

  hasDynamicSuggestions(): boolean {
    return typeof this._suggestions === 'function'
  }

  getSuggestions(): string[] {
    return Array.isArray(this._suggestions) ? this._suggestions : []
  }

  getSeparator(): string | null { return this._separator }
  getSplitKeys(): string[]      { return this._splitKeys }
  isReorderable(): boolean      { return this._reorderable }
  getMaxTags(): number | null   { return this._maxTags }

  override async toMeta(ctx?: RenderContext): Promise<FieldMeta> {
    const base        = this.buildMeta(ctx)
    const suggestions = await resolveSuggestions(this._suggestions, ctx, this.name)
    return {
      ...base,
      suggestions,
      ...(this._separator !== ',' ? { separator: this._separator } : {}),
      ...(this._splitKeys.length !== 1 || this._splitKeys[0] !== 'Enter'
            ? { splitKeys: this._splitKeys }
            : {}),
      ...(this._reorderable ? { reorderable: true } : {}),
      ...(this._maxTags     ? { maxTags: this._maxTags } : {}),
    }
  }
}

export const TagsInput = TagsInputField
