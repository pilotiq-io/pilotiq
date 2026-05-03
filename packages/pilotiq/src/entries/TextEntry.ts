import { Entry } from './Entry.js'

/**
 * The default infolist entry. Renders a label-value pair with the value
 * as plain text; honors all the inherited chrome (`color / weight / size
 * / lineClamp / wrap / tooltip / copyable`) and built-in formatters
 * (`since / dateTime / money / numeric / limit`).
 *
 * @example
 * Resource.detail(record) {
 *   return [
 *     TextEntry.make('email').copyable(),
 *     TextEntry.make('publishedAt').since(),
 *     TextEntry.make('amount').money('USD').weight('semibold'),
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
}
