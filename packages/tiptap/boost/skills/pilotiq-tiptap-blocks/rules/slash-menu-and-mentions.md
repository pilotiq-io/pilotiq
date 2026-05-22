# Slash Menu, Mentions, and Merge Tags

Three closely-related surfaces share the same editor real estate — the cursor-anchored popover menu. Slash menu opens on `/`; mention dropdowns open on a configurable trigger char (`@`, `#`, etc.); merge tags surface as a *group within* the slash menu rather than their own dropdown.

## Slash menu (`/`)

Type `/` at the start of a line (or in an otherwise-empty inline position) to open the slash menu. The menu groups, in order:

1. **Insert** — paragraph, headings, lists, code block, blockquote, horizontal rule, plus opt-in primitives (`details`, `Two-column grid`, `Three-column grid`) when enabled in toolbar/slash config.
2. **Style** — text-size marks (`lead`, `small`), text color, highlight (when those buttons are in the active toolbar).
3. **Format** — alignment options (when alignment buttons are in the toolbar).
4. **Merge tags** — every id in `.mergeTags([…])`. Selecting one inserts a `{{ id }}` chip.
5. **User blocks** — one entry per `Block` in `.blocks([…])`, in declaration order. Each shows the block's `.icon(…)` + `.label(…)`.

Disable the slash menu per-field:

```ts
RichTextField.make('body').slashCommand(false)
```

### Slash menu internals (relevant when debugging)

- `SlashCommandExtension.ts` registers a Tiptap `Suggestion` plugin that listens on document-level **capture-phase** key events. Capture-phase is intentional — it has to win against any bubble-phase handlers in surrounding code (including the side panel's `Esc` listener — see `custom-blocks.md` § Keyboard).
- The menu mounts as a Base UI Popover anchored to a virtual element at the caret position. Cursor anchoring means the menu follows the user's typing position even mid-line, but it also means autoplacement / flip logic can collide with other Base UI popovers — see [[feedback-baseui-popover-cursor-anchor]] for the established pattern.
- Items derive from `extension.options.blocks` plus the framework's built-ins. The blocks array is plumbed at editor mount and updated when the field's meta changes.

## Mentions (`@`, `#`, custom triggers)

`MentionProvider` powers @-mention dropdowns. Each provider has a single trigger char and a static or async item resolver:

```ts
import { RichTextField, MentionProvider } from '@pilotiq/tiptap'

RichTextField.make('body')
  .mentions([
    MentionProvider.make('@')
      .items([
        { id: 'alice', label: 'Alice', subtitle: 'Engineering' },
        { id: 'bob',   label: 'Bob',   subtitle: 'Design' },
      ]),

    MentionProvider.make('#')
      .itemsUsing(async (query, ctx) => {
        const tags = await Tag.query()
          .where('name', 'LIKE', `%${query}%`)
          .paginate(1, 10)
        return tags.data.map(t => ({ id: t.slug, label: t.name }))
      }),
  ])
```

### Item shape

```ts
{
  id:        string         // required — what serializes in the chip
  label:     string         // required — what the user sees
  subtitle?: string         // optional — second line in the dropdown
  icon?:     string         // optional — pilotiq icon registry name
}
```

The chip serializes to HTML as `@alice` / `#performance` text (the literal trigger + id) and to JSON as a node attr — your render-time substitution layer chooses how to resolve the chip (link, badge, lookup, etc).

### Static vs async

- **`.items([…])`** — synchronous, renders immediately when the trigger char is typed. Best for small, static sets (status labels, sentiment markers).
- **`.itemsUsing(async (query, ctx) => …)`** — POSTs to a per-form `_mentions/:provider` endpoint with the typed query string and the form's render context. Async resolvers see `ctx.user`, `ctx.record`, `ctx.parent` (when inside a `Repeater` / `Builder` row), so you can scope results to the current panel/record/row.

Async items go through `pageData.findRichTextFieldByName(form, dottedName)` to resolve which `MentionProvider` matches the request. The dotted path the editor posts is row-relative when the field is inside an array row (`items.0.body` for Repeater, `blocks.0.data.body` for Builder). The dispatcher walks the appropriate template — both shapes are first-class.

### Mentions inside Repeater / Builder rows

Works out of the box for the standard nesting. The stamper (`tagRichTextMentionUrls`) walks Builder block schemas explicitly because `BuilderField.getChildren()` returns `undefined` to keep generic field walkers from treating heterogeneous rows as flat children — see [[project-pilotiq-builder]] for the broader walker pattern.

**Non-standard nesting** (Repeater-inside-Repeater, custom container) needs a manual `tagRichTextMentionUrls` walker extension — there's no automatic depth recursion yet. Confirm a request works end-to-end by submitting a mention from inside the nested row and checking the network panel for a 200 on the `_mentions/:provider` endpoint.

## Merge tags (`{{ id }}`)

For server-side substitution placeholders — typically email templates, document templates, transactional content where you write text like `Hi {{ firstName }}` and the rendering layer substitutes at send time:

```ts
RichTextField.make('body')
  .mergeTags(['firstName', 'lastName', 'company', 'unsubscribeUrl'])
```

Each id surfaces under the **Merge tags** group of the slash menu and inserts a `{{ id }}` chip. The chip serializes verbatim as `{{ firstName }}` literal text in HTML output — your downstream substitution (mail send, doc generation) handles the actual replacement.

Difference from mentions: merge tags are a fixed set known at form-definition time, no DB lookup, no user search. Use mentions when the set is dynamic (users, tags, records); use merge tags when it's a closed enum of template variables.

## Pitfalls

- **Async mention failures** — if `itemsUsing` throws, the dropdown shows an empty result silently. Wrap risky DB calls in try/catch and return `[]` on error if you'd rather not surface server logs to the user; or let the request 500 and the dropdown will degrade gracefully.
- **Trigger char collision** — `@` and `#` are common; `:` collides with emoji shortcodes if you also wire those upstream. Pick something unambiguous when adding custom triggers (`+` for assignees, `&` for accounts).
- **`mentions([…])` resets on every meta resolve** — providers are recreated server-side every time the form re-resolves. Don't store mutable state inside a `MentionProvider` instance; treat it as a value object.
- **Capture-phase keys.** If you mount your own keyboard handler near the editor and it doesn't fire when the slash or mention menu is open, that's by design — the menus stop propagation on capture. To handle keys that pass through, listen on the editor's `view.dom` directly rather than at `document`.

## See also

- `custom-blocks.md` — how `Block.make(...)` entries land in the slash menu's user-blocks section.
- `toolbar-and-extensibility.md` — how toolbar config affects which Style / Format groups appear in the slash menu (slash entries are derived from active toolbar buttons).
