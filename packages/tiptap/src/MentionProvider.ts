/**
 * Static menu item surfaced by a {@link MentionProvider}. `id` is the wire
 * identifier that survives serialization; `label` is what the editor shows
 * after the trigger char (`@Sleman`). `group` is purely cosmetic — the menu
 * uses it to bucket items under headings.
 */
export interface MentionItem {
  id:     string
  label:  string
  group?: string
}

/** Wire-side shape of a {@link MentionProvider}. */
export interface MentionProviderMeta {
  trigger: string
  items:   MentionItem[]
}

/**
 * Builder for a single mention provider — the trigger character (`@` /
 * `#` / …) and the items the popover offers when the user types it.
 *
 * Async resolvers / API-backed providers are not part of v1 — items are
 * declared once at form-build time and inlined into the field meta. Read-time
 * label resolution still works through `renderRichTextToHtml(content,
 * { resolveMention })` for cases where the cached label has gone stale.
 *
 * @example
 * ```ts
 * RichTextField.make('body').mentions([
 *   MentionProvider.make('@').items([
 *     { id: 'sleman', label: 'Sleman' },
 *     { id: 'alex',   label: 'Alex'   },
 *   ]),
 *   MentionProvider.make('#').items([
 *     { id: 'general', label: 'general' },
 *     { id: 'random',  label: 'random'  },
 *   ]),
 * ])
 * ```
 */
export class MentionProvider {
  private _trigger: string
  private _items:   MentionItem[] = []

  protected constructor(trigger: string) {
    if (typeof trigger !== 'string' || trigger.length !== 1) {
      throw new Error(`MentionProvider trigger must be a single character (got ${JSON.stringify(trigger)})`)
    }
    this._trigger = trigger
  }

  static make(trigger: string): MentionProvider {
    return new MentionProvider(trigger)
  }

  /** Replace the static item list. */
  items(items: MentionItem[]): this {
    this._items = items
    return this
  }

  getTrigger(): string { return this._trigger }
  getItems():   readonly MentionItem[] { return this._items }

  /** @internal */
  toMeta(): MentionProviderMeta {
    return { trigger: this._trigger, items: [...this._items] }
  }
}
