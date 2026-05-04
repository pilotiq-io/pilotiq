import { tryRenderRichText } from '../richtext/registry.js'
import type { RenderContext } from '../schema/resolveSchema.js'
import { Entry, type EntryMeta } from './Entry.js'

export interface TextEntryMeta extends EntryMeta {
  /** True when the value was auto-rendered from Tiptap rich-text content;
   *  the renderer should inject the value via `dangerouslySetInnerHTML`
   *  rather than escape it as plain text. */
  richtext?: true
}

/**
 * The default infolist entry. Renders a label-value pair with the value
 * as plain text; honors all the inherited chrome (`color / weight / size
 * / lineClamp / wrap / tooltip / copyable`) and built-in formatters
 * (`since / dateTime / money / numeric / limit`).
 *
 * **Rich-text auto-render:** when an adapter package has registered a
 * renderer (`@pilotiq/tiptap` does this on `registerTiptap()`) and the
 * resolved value is recognizably Tiptap content, `TextEntry` ships
 * finished HTML in `_formatted` and flips `richtext: true` so the client
 * renders the markup. No-op when no renderer is registered or the value
 * is plain text.
 *
 * @example
 * Resource.detail(record) {
 *   return [
 *     TextEntry.make('email').copyable(),
 *     TextEntry.make('publishedAt').since(),
 *     TextEntry.make('amount').money('USD').weight('semibold'),
 *     TextEntry.make('body'),                       // auto-renders Tiptap JSON
 *   ]
 * }
 */
export class TextEntry extends Entry {
  private constructor(name: string) {
    super(name)
  }

  static make(name: string): TextEntry {
    return new TextEntry(name)
  }

  protected override getEntryType(): string { return 'text' }

  override toMeta(ctx?: RenderContext): TextEntryMeta {
    // Parent runs `formatStateUsing` first — it wins over auto-render so a
    // user-supplied formatter can opt out of HTML even when a richtext
    // renderer is registered.
    const meta = super.toMeta(ctx) as TextEntryMeta
    if (meta._formatted !== undefined || meta.format !== undefined) return meta

    const html = tryRenderRichText(meta.value)
    if (html === null) return meta

    meta._formatted = html
    meta.richtext   = true
    return meta
  }
}
