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
  /** Set when the provider is backed by an `itemsUsing(fn)` resolver — the
   *  client fetches items from the field's `mentionsUrl` instead of using
   *  the (empty) inlined list. */
  async?:  boolean
}

/**
 * Context handed to `MentionProvider.itemsUsing(fn)` resolvers. Mirrors the
 * subset of {@link RenderContext} the route handler can re-derive at request
 * time — `user` from `Pilotiq.user(req=>…)`, `record` for edit-mode forms,
 * and the raw `request` for adapters that need cookie / header access.
 */
export interface MentionResolverContext {
  user?:    unknown
  record?:  unknown
  request?: unknown
}

export type MentionItemsResolver = (
  query: string,
  ctx:   MentionResolverContext,
) => MentionItem[] | Promise<MentionItem[]>

/**
 * Builder for a single mention provider — the trigger character (`@` /
 * `#` / …) and the items the popover offers when the user types it.
 *
 * Two shapes:
 *   - `MentionProvider.make('@').items([...])` — static items declared at
 *     form-build time, inlined into the field meta.
 *   - `MentionProvider.make('@').itemsUsing(async (query, ctx) => […])` —
 *     async resolver. The client fetches every keystroke; the server runs
 *     the user fn and returns the matched items. `items` and `itemsUsing`
 *     are mutually exclusive — last call wins, with a warning when both
 *     have been set.
 *
 * Read-time label resolution still works through `renderRichTextToHtml(
 * content, { resolveMention })` for cases where the cached label has gone
 * stale.
 *
 * @example Static items
 * ```ts
 * MentionProvider.make('@').items([
 *   { id: 'sleman', label: 'Sleman' },
 *   { id: 'alex',   label: 'Alex'   },
 * ])
 * ```
 *
 * @example Async items
 * ```ts
 * MentionProvider.make('@').itemsUsing(async (query) => {
 *   const users = await db.users.search(query, { limit: 10 })
 *   return users.map(u => ({ id: u.id, label: u.name }))
 * })
 * ```
 */
export class MentionProvider {
  private _trigger: string
  private _items:   MentionItem[] = []
  private _itemsUsing?: MentionItemsResolver

  protected constructor(trigger: string) {
    if (typeof trigger !== 'string' || trigger.length !== 1) {
      throw new Error(`MentionProvider trigger must be a single character (got ${JSON.stringify(trigger)})`)
    }
    this._trigger = trigger
  }

  static make(trigger: string): MentionProvider {
    return new MentionProvider(trigger)
  }

  /** Replace the static item list. Mutually exclusive with `itemsUsing()`. */
  items(items: MentionItem[]): this {
    if (this._itemsUsing !== undefined) {
      console.warn(
        `[pilotiq/tiptap] MentionProvider('${this._trigger}'): items() called after ` +
        `itemsUsing(). The static list now wins; clear itemsUsing first to avoid surprise.`,
      )
      delete this._itemsUsing
    }
    this._items = items
    return this
  }

  /**
   * Install an async resolver. Called every keystroke with the current
   * query (the text after the trigger char) and a `MentionResolverContext`.
   *
   * Mutually exclusive with `items()` — the last call wins; a warning fires
   * when the previously-set static items are dropped silently.
   */
  itemsUsing(fn: MentionItemsResolver): this {
    if (this._items.length > 0) {
      console.warn(
        `[pilotiq/tiptap] MentionProvider('${this._trigger}'): itemsUsing() called after ` +
        `items(). The async resolver now wins; the static items array will be ignored.`,
      )
      this._items = []
    }
    this._itemsUsing = fn
    return this
  }

  getTrigger(): string { return this._trigger }
  getItems():   readonly MentionItem[] { return this._items }
  isAsync():    boolean { return this._itemsUsing !== undefined }

  /**
   * Run the resolver — `itemsUsing(fn)` when set, otherwise the cached
   * static list. Wraps non-array returns in `[]` so a misbehaving
   * resolver doesn't crash the route handler.
   *
   * Synchronous resolvers are awaited the same way as async ones; the
   * single code path keeps the call-site cheap.
   */
  async runResolver(query: string, ctx: MentionResolverContext): Promise<MentionItem[]> {
    if (this._itemsUsing === undefined) {
      // Static path mirrors the client-side filter so the server endpoint
      // would be useful for static providers too — but the client never
      // calls it for them (no `async: true` flag → no fetch).
      return [...this._items]
    }
    const result = await this._itemsUsing(query, ctx)
    return Array.isArray(result) ? result : []
  }

  /** @internal */
  toMeta(): MentionProviderMeta {
    if (this._itemsUsing !== undefined) {
      // Async providers ship empty `items`; the client checks `async: true`
      // and fetches from the field's `mentionsUrl` per-keystroke instead.
      return { trigger: this._trigger, items: [], async: true }
    }
    return { trigger: this._trigger, items: [...this._items] }
  }
}
