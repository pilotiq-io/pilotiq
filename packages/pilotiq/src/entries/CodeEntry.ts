import { Entry, type EntryMeta } from './Entry.js'

export interface CodeEntryMeta extends EntryMeta {
  language?: string
}

/**
 * Read-only sibling of `CodeEditorField` — renders the resolved value as
 * `<pre><code>` with a monospace font. Pairs with `Resource.detail()` for
 * showing user-supplied code, JSON blobs, or config snippets.
 *
 * v1 ships **without bundled syntax highlighting** to keep the core
 * package small. Pass a `language()` hint and a consumer can register a
 * highlighter via the existing rich-text renderer registry pattern (or
 * the upcoming `@pilotiq/codemirror` adapter's read-only mode); without
 * a registered highlighter the entry renders plain monospaced text.
 *
 *   CodeEntry.make('payload').language('json').copyable()
 *
 * Honors all the inherited chrome (`color / size / weight / tooltip /
 * copyable`), though `weight` is rarely useful on code blocks.
 *
 * For PHP arrays / JS objects, set `formatStateUsing(JSON.stringify)`
 * to control the wire shape — entries don't auto-stringify objects.
 */
export class CodeEntry extends Entry {
  private _language?: string

  private constructor(name: string) {
    super(name)
  }

  static make(name: string): CodeEntry {
    return new CodeEntry(name)
  }

  /**
   * Language hint passed through to the meta (`'json' | 'ts' | 'html' |
   * …`). Plays the same role as `CodeEditorField.language()` — opaque to
   * the framework, consumed by an optional highlighter registered by
   * the consumer.
   */
  language(id: string): this { this._language = id; return this }

  protected override getEntryType(): string { return 'code' }

  override toMeta(ctx?: Parameters<Entry['toMeta']>[0]): CodeEntryMeta {
    const meta = super.toMeta(ctx) as CodeEntryMeta
    if (this._language !== undefined) meta.language = this._language
    return meta
  }
}
