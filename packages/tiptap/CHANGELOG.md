# @pilotiq/tiptap

## 4.5.0

### Minor Changes

- 18b9794: Add `SuggestionReviewPopover` — a single floating popover wizard that steps through pending inline-diff suggestions one at a time, replacing the scattered per-region ✓/✕ overlay. The popover anchors to each suggestion's DOM element, shows a step counter (`1 of 3`), a before/after text preview, and Accept/Reject buttons that advance to the next suggestion automatically. Clicking a diff region in the editor jumps the popover to that suggestion. Dismiss (×) collapses the card without resolving. `DiffRegionControls` remains exported for backward compatibility but is no longer used internally.

## 4.4.2

### Patch Changes

- c858821: Fix inline diff regions not reverting when rejected from the pending-suggestions pill. The context→editor cleanup in `useInlineDiff` now calls `rejectInlineDiffRegion` when a suggestion is dismissed externally (e.g. via the chat sidebar pill), so the editor's green/red highlights revert correctly instead of remaining as orphaned regions.

## 4.4.1

### Patch Changes

- 37ace3b: Inline diff: preserve inline marks on the deleted (red) side

  The deleted side of a whole-field AI inline diff now keeps its inline formatting (bold / italic / link / code) instead of flattening to plain text. Previously the single-paragraph branch of the deleted widget extracted the old text via `node.textContent`, dropping every mark, so a removed `<strong>`/`<em>`/`<a>` run rendered as plain struck text while the inserted side stayed formatted — the diff read as broken. The deleted run is now serialized through the schema's `DOMSerializer` (inline content only, so the inline look is kept), matching the inserted side.

  Also documents a known limitation: a formatting-only change (same text, a mark toggled) is not surfaced, because `prosemirror-changeset` is driven by step position maps and mark steps have identity maps.

## 4.4.0

### Minor Changes

- daa6eb0: Render the `keyTakeaways` and `summary` content blocks **labelless**. The built-in, fixed-English "Key takeaways" / "Summary" / "In summary" labels are removed so the section heading can live ABOVE the block as a localized, editable `<h2>` (matching the `faq` block, which never had a baked-in label). This is what lets the AI block agents place a heading in the article's own language instead of a hardcoded English one.

  The `.pilotiq-block-content` wrapper, in-block gear menu, width toggle, and the summary `variant` attr (+ its `data-variant` styling hook used for placement and the article accent) are all preserved — only the `.pilotiq-block-label` line is gone. `intro` (already `plain`) and `alert` / `prosCons` are unchanged.

## 4.3.2

### Patch Changes

- 35daaab: fix(tiptap): preserve wrapper blocks when applying surgical block ops (`replace_block` / `insert_block_before`). `parseContentToSlice` used `parseSlice`, which "opens" the slice's edges and strips a top-level wrapper node whose own body is itself valid at the top level — a `keyTakeaways` / `summary` / `intro` block (body = a list or paragraphs) silently collapsed to its bare inner content, and a `prosCons` block (strict `prosColumn consColumn` content) collapsed to bare lists, an invalid node that threw `contentMatchAt on a node with invalid content` and detached the editor. Surgical block ops always carry complete top-level blocks, so we now full-`parse` the content as a document and wrap it in a closed slice (`openStart`/`openEnd` = 0), preserving every wrapper exactly as authored. Inline/partial content still round-trips (the doc schema wraps it in a paragraph). Unblocks real labeled `keyTakeaways` / `prosCons` blocks in the content-pipeline agents.

## 4.3.1

### Patch Changes

- 4aa4833: fix(inline-diff): correct two `aiDiffView('lines')` rendering bugs when an AI run stages multiple word-level edits (#191)

  - A second changed word on the same block now highlights on the deleted (red) row too — the deleted-widget decoration key folds in the changed ranges, so a later region growing the spans rebuilds the widget instead of reusing a stale one keyed on text alone.
  - Each per-region ✓/✕ control now anchors to its changed word on the added (green) row rather than floating to the deleted row — `DiffRegionControls` prefers the region's `inserted-line-changed` span and falls back to any anchor for pure block insert/delete.

## 4.3.0

### Minor Changes

- e3e81de: feat(tiptap): per-region Accept/Reject for AI inline diffs (#92)

  The inline-diff extension now tracks **multiple independently-resolvable regions** in one editor instead of a single bulk diff. When the AI proposes several surgical edits, each lands as its own `DiffRegion` with its own ✓/✕ control anchored at the change, so the user can accept some and reject others. Accepting one retires just that region (the proposed content is already in the doc); rejecting one restores only that region's captured baseline content; both remap the surviving regions so their positions stay valid. Reject-all reverts only the still-pending regions, composing correctly after a partial accept.

  New commands `acceptInlineDiffRegion(id)` / `rejectInlineDiffRegion(id)` sit alongside the existing `acceptInlineDiff` / `rejectInlineDiff` (now whole-set Accept-all / Reject-all). Controls render via a new **floating overlay** (`<DiffRegionControls>`, exported and mounted by every editor surface): the extension tags each change with an invisible `data-pilotiq-diff-region` anchor, and the overlay measures each anchor and floats a ✓/✕ beside the change — so several changes on one line each get their own control without a mid-text widget splitting the intra-line highlight. Each control bubbles a `pilotiqInlineDiffRegionResolve` DOM event so a host bridge can round-trip the decision through its `PendingSuggestion` queue (the bridge wires it to `approve` / `dismiss` so the sidebar pill + plan checklist stay in sync) and also runs the editor command directly. The bridge (`useInlineDiff`) now pushes every surgical op — batched or cross-tool-call — as its own region. Whole-field replacements degrade to a single region.

  `lines` mode also now **interleaves** each change's removed (red) and inserted (green) rows — `red, green, red, green` — when blocks are edited in place (1:1), instead of grouping all removed rows then all added rows. Merges/splits (unequal counts) keep the grouped, concatenated-word-diff form from #186. Lines mode diffs against a **pending-only baseline** (the current doc with just the unresolved regions reverted), so when several changes share one line, accepting or rejecting one settles _that_ word immediately while the others stay pending — and the red row rebuilds instead of showing stale content. Removed (red) rows render flush against their green counterpart (no gap).

## 4.2.0

### Minor Changes

- 7b962cd: feat(tiptap): intra-line change highlight + refreshed diff palette in `aiDiffView('lines')` (#186)

  The `lines` inline-diff mode now highlights the _changed characters_ of a replaced line, GitHub-style. When a removed block is paired with a similar added block (e.g. an AI "fix grammar" edit), the two block texts are re-diffed at token granularity (new pure `wordDiff` module) and only the actually-edited substrings get a deeper tint — a background highlight, **not** bold. The added side highlights via inline decorations on the live doc; the removed side wraps the serialized red row. Unrelated replacements (low token overlap) and pure adds/deletes render as plain rows, unchanged.

  The diff red/green palette is also refreshed from generic greens/reds to pilotiq-themed emerald (added) / rose (removed) — soft full-row tints with the deeper "changed" tint layered on top. Highlighting is gated to plain textblocks (paragraph/heading) where DOM text aligns with node text; content blocks with non-editable label chrome (FAQ/Alert/…) keep the existing whole-row behavior. No API change; `inline` mode is unaffected.

## 4.1.2

### Patch Changes

- a24d0ce: fix(tiptap): custom blocks no longer vanish on edit under realtime collab (#96)

  Opening a custom block's inline accordion editor under collab silently deleted the block. The accordion renders the block's `Block.schema([...])` via `<FormFields>`, and inside a `<RecordCollabRoom>` its text inputs were being rendered as **collab-bound** fields — each mounting its own `Y.XmlFragment` (`TextLikeInput` → `CollabTextRenderer`). Mounting that nested collab field fired the host editor's collab reconcile (`_forceRerender`), which rebuilt the document from Yjs and dropped the custom block.

  The accordion edits the node's local `blockData` attr, not the surrounding record's collab document, so its fields must never be collab-bound. `BlockNodeView` now shadows the room context with `<CollabRoomContext.Provider value={null}>` around the form, so `useCollabRoom()` returns null for the block's fields and they render as plain inputs — no nested `Y.XmlFragment`, no reconcile, no lost block.

## 4.1.1

### Patch Changes

- 7f2e2a5: fix(tiptap): custom blocks no longer break under realtime collab (#96)

  The `pilotiqBlock` custom-block node now stores its `blockData` as a JSON **string** instead of a plain object. The node is a contentless leaf whose whole state lives in that attr, and under realtime collab the field binds through `@tiptap/extension-collaboration` (y-prosemirror), whose PM↔Yjs attribute sync is string-oriented — an object-valued attr didn't round-trip, so a custom block (e.g. a Callout) silently vanished the moment it was edited and didn't persist. A primitive string syncs cleanly.

  The NodeView and the server renderer parse it back to an object at their boundaries (`parseBlockData`), which still tolerates the legacy object form, so documents saved before this change keep loading and migrate to the string form on the next edit. No API change: `insertBlock(type, data)` still takes an object.

## 4.1.0

### Minor Changes

- 44cb235: feat(tiptap): content-preserving `reorder_blocks` surgical op

  Adds `planReorderBlocks(editor, order)` and wires the `reorder_blocks` op into the inline-diff surgical dispatch. Given a full permutation of the top-level block indices, it re-lays the existing nodes in the new order — content-preserving (every block keeps its marks, attrs, and nested content; no HTML round-trip), mirroring `wrap_blocks`. Returns null for a non-permutation (wrong length / out-of-range / duplicate) or an identity order, so a malformed request can never drop or duplicate a block. Powers `@pilotiq-pro/ai`'s Content Flow agent, which re-sequences article sections (inverted-pyramid) without rewriting text.

## 4.0.0

### Major Changes

- 58794c1: Rename the AI suggestion/diff primitives to provider-neutral names. These are generic inline-diff machinery the package exposes — they contain no AI logic and can be driven by any producer (the actual AI lives in `@pilotiq-pro/ai`), so the `Ai*` prefix oversold them.

  **Renamed exports** (no aliases — direct importers must update):

  | Old                                                                    | New                                                              |
  | ---------------------------------------------------------------------- | ---------------------------------------------------------------- |
  | `AiSuggestionExtension`                                                | `SuggestionChipExtension`                                        |
  | `AiSuggestion`                                                         | `InlineSuggestion`                                               |
  | `AiSuggestionExtensionOptions`                                         | `SuggestionChipExtensionOptions`                                 |
  | `aiSuggestionPluginKey`                                                | `suggestionChipPluginKey`                                        |
  | `useAiSuggestionBridge`                                                | `useSuggestionBridge`                                            |
  | `AiInlineDiffExtension`                                                | `InlineDiffExtension`                                            |
  | `AiInlineDiffExtensionOptions`                                         | `InlineDiffExtensionOptions`                                     |
  | `aiInlineDiffPluginKey`                                                | `inlineDiffPluginKey`                                            |
  | `getAiInlineDiffState`                                                 | `getInlineDiffState`                                             |
  | `AiDiffDisplayMode`                                                    | `DiffDisplayMode`                                                |
  | `useAiInlineDiff` / `useIsAiInlineDiffActive` / `readAiDiffViewMarker` | `useInlineDiff` / `useIsInlineDiffActive` / `readDiffViewMarker` |
  | `AiSuggestionBanner` / `useAiSuggestionBanner`                         | `SuggestionBanner` / `useSuggestionBanner`                       |

  **Renamed editor commands**: `addAiSuggestion` → `addSuggestion`, `approveAiSuggestion` → `approveSuggestion`, `rejectAiSuggestion` → `rejectSuggestion`, `approveAllAiSuggestions` → `approveAllSuggestions`, `rejectAllAiSuggestions` → `rejectAllSuggestions`, `clearAiSuggestions` → `clearSuggestions`; `startAiInlineDiff` → `startInlineDiff`, `applySurgicalAiInlineDiff` → `applySurgicalInlineDiff`, `acceptAiInlineDiff` → `acceptInlineDiff`, `rejectAiInlineDiff` → `rejectInlineDiff`.

  **Renamed CSS classes / DOM markers** (consumers with custom stylesheets must update; the injected defaults follow the new names automatically): `pilotiq-ai-suggestion-*` → `pilotiq-suggestion-*`, `pilotiq-ai-banner-*` → `pilotiq-suggestion-banner-*`, `pilotiq-ai-diff-*` → `pilotiq-diff-*`, and the matching `data-pilotiq-ai-*` attributes → `data-pilotiq-*`.

  **Deliberately unchanged**: the cross-package field-config markers `data-ai-suggestions-mode` / `data-ai-diff-view` (written by `@pilotiq-pro/ai`'s `.aiSuggestionsMode()` / `.aiDiffView()` field API) stay `ai`-prefixed — they configure genuinely AI-specific behavior, not provider-neutral primitives.

### Minor Changes

- 0096a7f: Add an in-block text find→replace surgical op — `planReplaceText` plus a `replace_text` case in the inline-diff dispatch.

  It swaps the first occurrence of a `search` string with `replace`, preserving the surrounding node structure. This lets a producer (e.g. `@pilotiq-pro/ai`) fix a word, number, or typo **inside** a custom block (alert / prosCons / faq / keyTakeaways) or a table cell without rebuilding the block as HTML — which `replace_block` would force, flattening the block. The op is index-free: the match position resolves at apply time, so it composes safely after the index-based block ops in a batch. Returns `null` when `search` isn't present, so a stale or guessed search string changes nothing rather than corrupting the doc.

  New export: `planReplaceText`. Surgical meta op: `{ op: 'replace_text', search, replace }`.

## 3.20.0

### Minor Changes

- 47c8187: Custom blocks now edit inline (accordion) instead of in a right-docked side panel.

  Clicking **Edit** on an inserted custom block (`Block.make().schema([...])`) expands the block in place and renders its schema as a `FormFields` form; edits write straight back onto the node via `updateAttributes({ blockData })` on every change — no popup, no save button.

  This replaces the `BlockSidePanel` and removes the machinery that existed only to host the form outside the NodeView: the `onEdit` bridge + `Mod-e` shortcut on `BlockNodeExtension`, and the host-side `selectedBlock` state / position-remapping in `TiptapEditor`. The form lives in a `contentEditable=false` region with event guards so ProseMirror never treats the inputs as document content. Pure `coerceBlockValues` / `readBlockFieldValue` helpers moved to `react/blockValues.ts`.

### Patch Changes

- 1a1026d: Inline format toolbar visibility fixed for block nodes (#155).

  Two adjustments to `shouldShowFloatingToolbar`:

  - **Hidden on a whole-node block selection.** Clicking a schema-form custom block card (`pilotiqBlock`), an image, an hr, or picking a whole Alert via the drag handle produces a `NodeSelection` with no inline text to format — the bold/italic/link toolbar no longer appears for any of these. Previously only the built-in `alert` block was special-cased, so custom block cards still surfaced the toolbar.
  - **Shown inside the Alert block's editable text.** The Alert block has an editable title and body; the mark toolbar now works there like anywhere else. An earlier fix over-suppressed the entire Alert (including its editable text) — that suppression is reversed; only the whole-node pick is hidden now.

## 3.19.2

### Patch Changes

- 6064202: AI inline diff: the removed/deleted side now keeps its original block formatting (#91).

  Previously the deleted content was flattened with `textBetween()` / `node.textContent`, so a removed heading, list, FAQ, or other formatted block rendered as plain text next to the (correctly-formatted) inserted side. The deleted widget now serializes the baseline's real nodes via the schema's `DOMSerializer` — a removed `<h2>` stays an `<h2>`, a list keeps its `<ul><li>`, a FAQ keeps its wrappers. A single plain top-level paragraph edit still renders as the inline word-level diff (no regression). Applies to both inline and `lines` display modes.

## 3.19.1

### Patch Changes

- ff44b8d: Show the inline mark toolbar on a bare caret inside a formatting mark.

  The selection-based `FloatingToolbar` only appeared on a non-empty text selection, so a link or bold span couldn't be edited by just clicking into it (#156). Its show/hide decision now lives in a pure, exported `shouldShowFloatingToolbar(state)` predicate: a caret (empty selection) surfaces the toolbar when it sits inside one of the toolbar's marks (`bold` / `italic` / `strike` / `code` / `link`), non-empty ranges behave as before, and the callout/alert suppression from #155 still holds. Pinned by `floatingToolbarVisibility.dom.test.ts` against the real schema.

## 3.19.0

### Minor Changes

- 75875da: Slash menu: remove the Align left/center/right, Lead, Small, and Clear formatting
  entries. These remain available as toolbar buttons; dropping them from the `/`
  menu keeps it focused on real content blocks (closes #151, #152).

### Patch Changes

- 4b82d23: Don't show the inline mark toolbar inside the callout (alert) block.

  The selection-based `FloatingToolbar` (bold / italic / strike / code / link) was appearing when text was selected inside an `alert` block, even though the callout owns its own content + chrome through the in-block gear menu (#155). Its `shouldShow` now bails when either selection endpoint sits inside an `alert` at any ancestor depth.

- 4013010: Also hide the inline mark toolbar when the whole callout block is "picked".

  Follow-up to the previous callout fix (#155): the `FloatingToolbar` still appeared when the entire `alert` block was selected via the drag handle, because that is a `NodeSelection` whose `$from` resolves to _before_ the node — so walking ancestors from `$from` never sees the `alert`. The alert-detection is now an exported `isSelectionInAlert(selection)` predicate that handles both a text/range selection inside the alert AND a whole-block `NodeSelection` on it, pinned by `contentBlockAlertSelection.dom.test.ts` against the real schema (including a real `NodeSelection` on the alert).

- d09373b: Fix double-Enter trapping an empty node inside landmark blocks (`keyTakeaways` / `summary` / `intro`).

  These blocks use `content: 'block+'`, so the default list-exit on double-Enter only _lifted_ the empty list item into a paragraph — a valid `block+` child — which stayed trapped inside the block instead of escaping it (#150). A new `LabeledBlockExitKeymap` (high priority, so it runs before `ListItem`'s `splitListItem`) intercepts the gesture: an empty trailing node (a paragraph, or the empty paragraph of a last list item) inside a landmark block is dropped and the cursor lands in a fresh paragraph _after_ the block, mirroring the FAQ block's Enter-flow. The empty-chain-only case replaces the now-useless block with a paragraph. The logic is exported as `planExitLabeledBlock` and pinned by a `contentBlockExit.dom.test.ts` contract test against the real schema.

## 3.18.0

### Minor Changes

- 442df8a: Export `planWrapBlocks` from the package entry point.

  `#148` shipped `planWrapBlocks` but left it internal (only `useAiInlineDiff` could reach it), so the Normalizer agent's wrap path had no way to be contract-tested against the real schema. It now sits alongside the other surgical planners (`planInsertBlockBefore` / `planReplaceBlock` / `planDeleteBlock`) in the public API, and a `surgicalOpsWrap.dom.test.ts` contract test pins its editor-side guarantees (content-preserving wrap, exactly one wrapper node, and the one-trailing-empty-paragraph rule when the wrap produces a terminal landmark) against the live `@pilotiq/tiptap` planners + schema — mirroring the FAQ-placement contract.

## 3.17.0

### Minor Changes

- 4930902: Add semantic landmark content blocks and a content-preserving `wrap_blocks` surgical op.

  - **`intro` block** — a labelled ("Introduction") landmark for the start of an article. Exported as `Intro` and registered in `contentBlockNodes`; rendered read-side via `renderRichTextToHtml`; available from the slash menu.
  - **`summary` block variant** — `summary` gains a `variant: 'section' | 'article'` attr. `section` (default) keeps the "Summary" label for a mid-content paragraph summary; `article` labels it "In summary" for the end-of-article conclusion landmark. The block gear menu offers a Section/Article toggle and the slash menu gains an "Article summary" entry.
  - **`wrap_blocks` surgical op** (`planWrapBlocks` + `useAiInlineDiff`) — wraps a contiguous run of top-level blocks `[fromIndex..toIndex]` into a single container node (`intro` / `summary` / `keyTakeaways`) using ProseMirror's own model, with no HTML round-trip, so marks and attrs are preserved verbatim. Lets agents turn unstructured prose into a landmark block without rewriting its text.

  These establish document landmarks so block-placement agents can position content deterministically (e.g. key-takeaways after the intro, FAQ after the conclusion).

## 3.16.0

### Minor Changes

- 58e9461: Export the default content-block node specs (`contentBlockNodes`, plus `Faq` / `FaqItem` / `FaqQuestion` / `FaqAnswer` / `Alert` / `AlertTitle` / `AlertBody` / `Summary` / `KeyTakeaways` / `ProsCons` / `ProsColumn` / `ConsColumn` / `ContentBlockKeymap` and the `AlertType` helpers) from the package entry. `contentBlockNodes` is the exact array `TiptapEditor` registers, so consumers can build a headless editor whose schema matches the live one — e.g. to parse content-block HTML or drive the surgical-op planners (`planInsertBlockBefore` & co.) in a test — without mounting React. Additive; no behavior change.

## 3.15.1

### Patch Changes

- 2bc1e54: Slash menu now ranks results by relevance instead of definition order.

  A query that matches an entry's **label** (exactly, by prefix, or by word) now
  ranks above an entry that only mentions the word in its `searchKey`. Previously
  the menu was a plain substring filter that preserved definition order, so typing
  `/summary` surfaced **Collapsible block** first — its `searchKey` lists
  "summary" and it's defined before the Summary block — and pressing Enter
  inserted the wrong block. The matched set is unchanged (every entry that matched
  before still matches); only the ordering improves. Ties keep their original menu
  order.

## 3.15.0

### Minor Changes

- c3816ae: In-block content-block controls now live behind a single **gear menu**.

  Blocks with multiple variations used to scatter their controls (a width chip in one corner, a variant dropdown + color swatch + click-the-icon picker in another). They now share one consistent entry point — a gear button in the block's inline-end gutter that opens a **nested settings menu**, one submenu per setting.

  - **New reusable `BlockSettingsMenu`** (replaces `BlockWidthControl`): a gear trigger + a Base UI `Menu` with a `SubmenuRoot` per setting. Two setting kinds — `select` (a radio submenu, e.g. Width / Type) and `custom` (caller-supplied submenu body, e.g. the icon grid / color swatches). The active value rides each row as a hint.
  - **Alert** routes Width, Type, Icon (curated SVG library + Custom SVG paste), and Color (custom variant only) through the gear; the icon in column one is now static and changed from the menu.
  - **Alert gains a `width` attr** (`contained` / `full`), mirroring the FAQ block — emitted read-side as `data-width`. To keep the gear from shifting when width changes, Alert now renders in **two layers** (same as FAQ): a full-width `.pilotiq-alert` anchor wrapping an inner `.pilotiq-alert-box` that carries the box chrome + width. Consumer CSS that targeted `.pilotiq-alert` for the box (border/background/padding/`pilotiq-alert-<type>`) should move to `.pilotiq-alert-box`; full-width is `.pilotiq-alert[data-width="full"] .pilotiq-alert-box`.
  - **FAQ** moves its width toggle into the same gear menu.

  Back-compat: node structures are unchanged; existing Alert/FAQ content loads as-is (alerts default to `contained`).

- b6b28bd: The **FAQ** content block is now a collapsible **accordion**.

  - **Editor:** each Q&A item is a collapsible row (a React NodeView) — the question is the always-visible trigger with a chevron, the answer folds below it. The question stays editable on click; only the chevron toggles. New `open` attr on `faqItem` (defaults open) stores per-item state.
  - **Read-side** (`renderRichTextToHtml`): renders as native **`<details>`/`<summary>`** — a real, accessible, **zero-JS** accordion the browser collapses on its own. Each item's `open` attr drives the platform `open` attribute. Consumer owns the `.pilotiq-faq*` CSS.
  - Dropped the old "Q"/"A" markers in favor of the accordion chrome.
  - **Block width:** an in-block toggle (a reusable `BlockWidthControl`) switches the FAQ between **contained** (max-width, centered) and **full** width — a `width` attr on the `faq` node, emitted read-side as `data-width`. Generic enough to reuse on other blocks.

  Back-compat: the node structure is unchanged (`faq > faqItem > faqQuestion faqAnswer`), so existing FAQ content loads as-is and gains the default-open state; old HTML question/answer wrappers still parse via fallback rules.

- af935e7: The remaining inline content blocks (**Summary**, **Key takeaways**, **Pros & cons**) now use the React NodeView + gear-menu pattern, matching Alert and FAQ.

  - Each gains an in-block **gear menu** with a **Width** setting (`contained` / `full`), surfaced read-side as `data-width`.
  - **Summary** and **Key takeaways** share one new `LabeledBlockNodeView` (they're structurally identical — a label above a `block+` body), driven by the existing `labeledBlock()` factory, which now attaches the NodeView + `width` attr and carries the per-block `label` / `cssClass` on `addOptions()`.
  - **Pros & cons** gets its own `ProsConsNodeView`; the gear lives on the container, the two columns keep their plain label markup.
  - The `width` attr is consolidated into one shared `widthAttribute()` helper (FAQ, Alert, the labelled blocks, and Pros & cons all reuse it, so they can't drift).

  **Read-side / consumer CSS:** each block now renders a full-width outer anchor wrapping an inner content layer (mirrors the FAQ outer/`-content` split, so the gear doesn't move on a width toggle):

  - Summary / Key takeaways: the label + body now sit inside a `.pilotiq-block-content` wrapper; that wrapper carries the max-width / centering (full-width via `[data-width="full"] > .pilotiq-block-content`).
  - Pros & cons: the two-column grid moves from `.pilotiq-pros-cons` onto a new inner `.pilotiq-pros-cons-content`; the outer becomes the full-width anchor.

  Back-compat: node structures are unchanged and parsing is tolerant of the old (unwrapped) HTML, so existing stored content loads as-is and defaults to `contained`.

## 3.14.0

### Minor Changes

- b2fc753: Redesigned the **Alert** content block into an interactive, themeable callout — and made it round-trip through the Markdown editor.

  **Rich-text + markdown editor:**

  - shadcn-style card on the panel's theme tokens (icon column + editable **title** and **body** — previously the label was the fixed variant name).
  - In-block **variant picker** — `info` / `warning` / `success` / `tip` / **`custom`** (the four slash-menu alert entries collapse into one "Alert").
  - In-block **icon picker** — a curated inline-SVG library (~18 icons, ~1-2KB, no `lucide-react`) plus a **"Custom SVG"** paste field. Custom SVG is sanitized via a pure allowlist (`sanitizeIconSvg`) on input and on render — scripts, event handlers, external refs (`use`/`image`/`a`/`href`), `<style>`, `<foreignObject>` are all stripped.
  - The **custom** variant gets an in-block **color** swatch; the box + icon tint via `color-mix` (the value is validated before it reaches inline CSS).
  - **Markdown round-trip** — `:::alert{type=warning icon=rocket} Title` admonition syntax (title rides the opening fence line). `MarkdownField` gains an **Alert** toolbar button (added to the default toolbar).

  **Read-side** (`renderRichTextToHtml`) emits the new `<div class="pilotiq-alert"><span class="pilotiq-alert-icon">…</span><div class="pilotiq-alert-title">…</div><div class="pilotiq-alert-description">…</div></div>` structure; icon SVGs are shared with the editor so the two never drift. Consumer owns the CSS.

  **Back-compat:** the node's content model changed (`block+` → `alertTitle alertBody`). HTML from the previous alert (label + body divs) is parsed into the new shape; JSON-stored alerts from the prior release may lose their body and should be re-inserted.

## 3.13.0

### Minor Changes

- ded54a8: Ship five built-in **inline content blocks** in every `RichTextField` (free + pro): **FAQ**, **Alert** (info/warning/success/tip), **Summary**, **Key takeaways**, and **Pros & cons**.

  They are **inline editable nodes** — a small label on top, content typed straight into the block in place (no card, no popup, no border/background). Inserted from the slash menu's **Content** group. Each renders read-side to semantic `pilotiq-*` HTML via `renderRichTextToHtml` (consumer owns the CSS). Quote and Table remain the native `blockquote` / table extensions.

  - Nodes live in `extensions/contentBlocks.ts`; registered by default in the editor.
  - Alert's type is the label (Info/Warning/Success/Tip), chosen from the slash menu.
  - Pros & cons is two labelled list columns.

  The `Block.make().schema([...])` API (card + side-panel form) stays for **custom** blocks via `RichTextField.blocks([...])`, but no schema block ships as a default. `Block.toMeta()` / `RichTextField.toMeta()` are now `async` so option-fields (Select/Radio/ToggleButtons) resolve correctly inside custom schema blocks.

## 3.12.0

### Minor Changes

- 7252aaa: GitHub-style line-mode rendering for the AI inline diff. `startAiInlineDiff` / `applySurgicalAiInlineDiff` accept an optional `displayMode: 'inline' | 'lines'` — in `'lines'` mode every block touched by an insert renders as a full-width green row (`+` gutter) and deleted content renders as stacked red rows (`−` gutter) above the change, instead of the inline word-flow. `useAiInlineDiff` gained `resolveDisplayMode`, and all three editor surfaces (rich text, markdown, collab text) resolve it from a `data-ai-diff-view` wrapper marker — stamped by `@pilotiq-pro/ai`'s `Field.aiDiffView('lines')` setter. Default stays `'inline'`.

## 3.11.0

### Minor Changes

- 30a802e: `CollabTextRenderer` (the Tiptap surface behind collab/AI `TextField` / `TextareaField`) now renders whole-field AI suggestions through `AiInlineDiffExtension` + `AiSuggestionBanner` — the same red/green inline diff and amber Accept/Reject banner `RichTextField` uses — instead of the legacy green-pill chip with ✓/✕. One review surface across every text shape. The chip bridge stays mounted for producer-supplied `editorRange` suggestions; `onApplyWholeField` remains the fallback when a suggestion can't parse.

## 3.10.8

### Patch Changes

- 0d346bd: Stop emitting JS sourcemaps in the build (`sourceMap` removed from tsconfig.base.json). The previous release excluded `dist/*.js.map` from the tarball but left the trailing `//# sourceMappingURL=` comment in every `.js` file, so Vite dev in consumer apps chased the pointer and logged an ENOENT stack trace per module — louder than the warning it replaced. `declarationMap` stays on (editors silently skip missing `.d.ts.map`; Vite never reads `.d.ts`).
- c7d62e9: Relax the exact `3.22.4` pins on the ten `@tiptap/extension-*` peer (and dev) dependencies to `^3.22.4`. The exact pins were an accident of pinning the installed version when each extension feature landed, not an intentional ceiling — and because Tiptap extensions peer-pin `@tiptap/core` exactly per release train, the pins made it impossible for consumers to align on core ≥3.23 (required by `@tiptap/extension-collaboration@^3.23`), producing unavoidable `unmet peer` warnings. Consumers should keep their whole `@tiptap/*` set on one release train.

## 3.10.7

### Patch Changes

- 4f5515e: Stop shipping sourcemaps in the published tarballs. The maps referenced `../src/*.ts`, which the slimmed tarballs don't include (and `sourcesContent` isn't embedded), so consumers running Vite dev got a "Sourcemap points to missing source files" warning for every dist module — hundreds of lines per cold start when the package is in `optimizeDeps.exclude`. Maps are still generated for workspace/local development where `src/` exists; they're only excluded from the npm artifact.

## 3.10.6

### Patch Changes

- 1c6a067: feat(adapters): ship `boost/guidelines.md` for `@rudderjs/boost` discovery

  Phase C of the boost-producer rollout. Each adapter now ships its own `boost/guidelines.md` so consumer Rudder apps with `@rudderjs/boost` installed pick them up automatically via `rudder boost:install`. Per-agent config files (`CLAUDE.md` / `.cursorrules` / `AGENTS.md` / etc.) include all installed adapter guidelines in the concatenated body.

  - **`@pilotiq/tiptap`** — RichTextField + Block (custom-block side panel), toolbar customization, mentions (static + async) + merge tags, file attachments, JSON vs HTML storage, server-side rendering via `renderRichTextToHtml`.
  - **`@pilotiq/codemirror`** — CodeEditorField + Code alias, language registry (`registerCodeLanguage` / `codeEditor({ languages })`), theming (auto / light / dark), reactive integration, validation, common language packs.
  - **`@pilotiq/recharts`** — Chart class + fluent form, chart types (line / bar / pie / doughnut), Chart.js-shaped data normalized to Recharts internally, per-chart filter dropdown, polling, resource header/footer placement, escape hatch via `static options`.

  Each guideline closes with a "Common Pitfalls" section distilled from project memory + a "Key Imports" reference. No skills shipped in this phase — adapter usage is single-surface enough that the always-loaded `guidelines.md` covers it; skill modules can follow if a consumer asks.

- 6d2ac13: chore: slim published tarballs to `dist` + `boost` + `CHANGELOG.md`

  All four packages now declare `"files": ["dist", "boost", "CHANGELOG.md"]` so npm pack only ships the compiled output, the `@rudderjs/boost` guidelines + skills tree, and the changelog. Previously `@pilotiq/pilotiq` shipped its full `src/`, `CLAUDE.md`, `.turbo/`, and test files; the three adapters shipped `src/` deliberately but no longer need to.

  - **`@pilotiq/pilotiq`** — 2.1 MB → 1.3 MB (~38% smaller). Drops `src/**`, `CLAUDE.md`, `.turbo/` from the tarball.
  - **`@pilotiq/tiptap` / `@pilotiq/codemirror` / `@pilotiq/recharts`** — drop `src/**` from the tarball.

  No API impact. Consumer Tailwind `@source` rules that previously scanned `node_modules/@pilotiq/*/src` should re-point at `node_modules/@pilotiq/*/dist` (Tailwind scans `.js` just fine). Source maps in `dist/` still reference `../src/*.ts` paths that are no longer in the tarball — sourcemap navigation inside `node_modules` won't resolve to TS, but stack traces still line up.

- 6d2ac13: feat(tiptap): ship `pilotiq-tiptap-blocks` boost skill

  First on-demand skill for `@pilotiq/tiptap`. `SKILL.md` declares `appliesTo: ['@pilotiq/tiptap']` so `@rudderjs/boost`'s `boost:install` only writes it to `.ai/skills/` when the consumer has `@pilotiq/tiptap` installed. Trigger heuristics scope the deep rules to specific authoring contexts — defining `Block.make(...)` types, wiring mentions / merge tags, customizing the toolbar, debugging slash-menu or drag-handle behavior.

  Three rule files under `boost/skills/pilotiq-tiptap-blocks/rules/`:

  - **`custom-blocks.md`** — `Block.make().schema([…])`, side panel V2 UX, field-type coverage inside a block (primitives, JSON-encoded, repeater / builder), `Mod-E` / `Esc` / focus trap / width memory, common authoring mistakes (including the `'block'` name collision).
  - **`slash-menu-and-mentions.md`** — slash menu groups, capture-phase keys, `MentionProvider` (static + async via `itemsUsing`), merge tags, mentions inside Repeater / Builder rows.
  - **`toolbar-and-extensibility.md`** — three customization styles (`toolbarButtons` / `enable+disableToolbarButtons` / hide chrome), the recognized button-id union, opt-in primitives (`lead` / `small` / `details` / `grid`), file attachments, drag-handle's three-step drop dance, Tiptap module identity (`resolve.dedupe`), toolbar-driven slash entries.

  Mirrors the shape established by `pilotiq-resource` / `pilotiq-fields` / `pilotiq-relations`.

## 3.10.5

### Patch Changes

- 0002c59: refactor(tiptap): narrow `collabExtensions` + `initialContent` at the typed boundary

  `TiptapEditor` and `MarkdownEditor` previously cast the collab-extension array as `any[]` at the spread site (`...(collabExtensions as any[])`) even though the produced array is `AnyExtension[]`-shaped. Adding `import type { AnyExtension, Content } from '@tiptap/core'` lets us type the `useMemo` directly and narrow `editor.commands.setContent(initialContent as Content)` instead of bypassing the type system entirely.

  `initialContent` is already gated by `isTiptapShapedContent(...)` upstream — the explicit `as Content` cast documents what we expect at the call site rather than papering over with `as any`. No behavior change; tests 193/193.

  The `room as unknown as FrameworkCollabRoom` casts on `CollabTextRenderer` / `CollabCodeMirrorEditor` are deliberate framework-room boundary casts and stay as-is.

## 3.10.4

### Patch Changes

- f28e4f9: fix(ai): move `AiSuggestionBanner` from above the toolbar to below the editor content

  The Accept / Reject strip for whole-field AI suggestions on `RichTextField` and `MarkdownField` previously mounted at the top of the editor wrapper, above the toolbar. That position pushed the toolbar and content down on every suggestion arrival, shifting the writing surface mid-edit and competing with the toolbar for the user's attention.

  The banner now mounts below `<EditorContent>` (after all tab content in `MarkdownEditor`, so the position is uniform across editor/source/preview tabs). The CSS margin flipped from `margin-bottom` to `margin-top` so the banner has breathing room from the content above it instead of the chrome below.

  Behavior is unchanged — same Accept / Reject handlers, same diff-active vs whole-field branching, same per-suggestion stacking semantics.

## 3.10.3

### Patch Changes

- 0b2a8bd: fix(collab): `CollabTextRenderer`'s post-sync seed uses a stable initial-defaultValue ref

  The `useCollabSeed` callback closed over the live `defaultValue` prop. In the cold-mount-against-a-populated-room case, the editor's first `onUpdate` could fire with empty text (a transient sync artifact from y-prosemirror's `ySyncPlugin` running `_forceRerender` before the React owner had stable state), which propagated empty through the host's `onChange` → `setText('')` → `setValue('')` → `FormStateContext.values[name] = ''`, which then cascaded back through `FormBody`'s `renderFieldWithValue` to re-render `CollabTextField` (and `CollabTextRenderer`) with `defaultValue=''`. By the time `room.synced` resolved and `useCollabSeed` fired the seed callback, the closure saw `defaultValue=''` — so the `fragment.length === 0 && defaultValue && editor` seed condition was false (the second clause), `setContent` was skipped, and `onChange(plainTextOf(editor))` propagated the editor's still-empty content. The hidden FormData input was then `value=""` at submit time → server-side `required` validation failed.

  Fix: capture the first non-empty `defaultValue` in a `useRef` at mount time and use it as the seed source inside the seedFn. The ref preserves the original SSR-loaded value across the entire `room.synced` lifecycle, so the seed always recovers the right content even if the host prop has been clobbered to `''` by an intermediate sync-triggered round-trip. Once the user types into the editor the fragment is no longer empty, so the ref is read-only from then on — there's no legitimate "user explicitly cleared the field" case where this masks intent.

  Surfaced by `pilotiq-pro/e2e/tests/collab/relationship-pk-switch.spec.ts` consistently failing against `@pilotiq/pilotiq@0.23.0+` with `422 errors.title = "This field is required"`. After the fix, 3/3 local runs of that spec pass + the full 16/16 `pilotiq-pro/e2e/tests/collab/*` suite passes + 193/193 `@pilotiq/tiptap` unit tests pass + full monorepo typecheck clean.

## 3.10.2

### Patch Changes

- 00b0c48: fix(collab): mirror editor text into the FormData hidden input after first sync

  `CollabTextRenderer` (the plain-text Tiptap editor mounted for `TextField` / `TextareaField` when collab is on) relied on three paths to keep the hidden FormData mirror in sync with the y-prosemirror-backed editor doc:

  1. `onUpdate` — fires on every y-prosemirror transaction.
  2. The mount-time safety-net `useEffect(() => onChange(plainTextOf(editor)), [editor])` — fires once when the editor instance materializes.
  3. The `useCollabSeed` callback — seeded empty fragments with the SSR-rendered `defaultValue`, but never propagated the seed (or the post-sync fragment content) back to the host's `onChange`.

  In the cold-mount case (a fresh peer joining a populated doc), all three paths could miss: the safety net reads `plainTextOf(editor)` before y-prosemirror's `ySyncPlugin` view-hook dispatch has populated the prose-mirror doc, and the subsequent `_forceRerender` / `_typeChanged` transactions occasionally landed in a window where the `update` listener hadn't been installed by the React owner yet. The result: hidden input stayed empty, server-submitted values dropped row text on `disconnect-and-reload`.

  The fix extends the existing `useCollabSeed` callback to also call `onChange(plainTextOf(editor))` after `room.synced` resolves — regardless of whether the seed branch ran. Idempotent (`setText(sameValue)` is a no-op when `onUpdate` already propagated the value); same shape as the catch-up replay in `@pilotiq-pro/collab`'s `rowArrayBinding.subscribeRows`.

  Closes the remaining ~20% flake on `pilotiq-pro/e2e/tests/collab/reorder-persistence.spec.ts` (peer C's `metadata.0.heading` hidden input occasionally never appeared within 20s).

- b87b2a5: fix(ai): scope inline-diff + chip suggestion appliers by surrounding form id

  Multi-form pages would route AI suggestions to whichever editor mounted last because both `useAiInlineDiff` and `useAiSuggestionBridge` hard-coded `formId: undefined` when registering their applier — so two editors sharing a field name across forms (e.g. a "summary" `RichTextField` in the main edit form + the same field in a Replicate modal) would race on `registerPendingSuggestionApplier(undefined, fieldName, …)` and the last `useEffect` would win.

  **`@pilotiq/pilotiq` (minor — new public API, additive)**

  - New `useFormId(): string | undefined` hook re-exported from `@pilotiq/pilotiq/react`. Reads the surrounding `FormRenderer`'s id from `FormIdContext` and normalizes the sentinel empty string to `undefined`. Adapter packages (Tiptap + future editor adapters) consume this to scope per-field registries by form.
  - `getPendingSuggestionApplier(undefined, fieldName)` now falls back to ANY matching scoped entry when no wildcard entry is registered. Closes the regression that would have followed from adapter scoping: editors now register under their form's id, so the wildcard slot is almost always empty — without the fallback, global producers (suggestions pushed without a `formId`) would silently fail to resolve. Scoped lookups + explicit wildcard registrations preserve their original precedence.

  **`@pilotiq/tiptap` (patch — internal hook wiring)**

  `useAiInlineDiff` and `useAiSuggestionBridge` now thread `useFormId()` into `registerPendingSuggestionApplier(formId, fieldName, applier)` and the effect's dep array. No public-surface change; the multi-form routing simply works now.

  Coverage: 9 new unit tests on `PendingSuggestionApplierRegistry` cover scoped lookup, scoped multi-form disambiguation, the global-producer fallback, precedence (wildcard wins over scoped for undefined lookups when both exist; scoped wins for explicit lookups), unregister cleanup, and re-register identity guard.

- 20513fc: fix(collab): mirror markdown editor into the FormData hidden input after first sync

  Third symmetric application of the subscribe-after-sync mirror — `MarkdownEditor` had the same gap as `TiptapEditor` and `CollabTextRenderer`. The wrapping host (`MarkdownEditorHost` in pilotiq core) drives a hidden FormData input from React state populated ONLY through the editor's `onChange` callback. In the cold-mount case (a fresh peer joining a populated doc) y-prosemirror's `ySyncPlugin` view-hook `_forceRerender` could land before the React owner installed the `update` listener — leaving the hidden input at its SSR-rendered `defaultValue` through to submit.

  The `useCollabSeed` callback now serializes the editor's markdown via `editor.storage.markdown.getMarkdown()` and fires `onChange(md)` after `room.synced` resolves, alongside the existing empty-fragment seed branch. Idempotent — when `onUpdate` already propagated the value, this is a no-op `setText(sameValue)`.

  Sister audit on `@pilotiq/codemirror`'s `CollabCodeMirrorEditor` came back clean: that path already reads `yText.toString()` synchronously in its mount effect and propagates via `setText`, so the catch-up is built into the codemirror branch.

- a81af81: fix(collab): mirror rich-text editor into the FormData hidden input after first sync

  Symmetric follow-on to the `CollabTextRenderer` fix from the same session. `TiptapEditor` (the rich-text surface mounted for `RichTextField`) had the same subscribe-after-sync gap: `onUpdate` debounces to `setSerialized(ed.getHTML() | JSON.stringify(ed.getJSON()))` on every keystroke, but in the cold-mount case (a fresh peer joining a populated doc) y-prosemirror's `ySyncPlugin` view-hook `_forceRerender` could land before the React owner installed the `update` listener — leaving the hidden FormData input at its SSR-rendered initial value through to submit.

  The `useCollabSeed` callback now also calls `setSerialized` (using the same `storage`-mode-aware serialization as the debounced `onUpdate` body) after `room.synced` resolves. Idempotent — when `onUpdate` already propagated the value, this is a no-op `setSerialized(sameValue)`.

  Not tickled by `pilotiq-pro/e2e/tests/collab/reorder-persistence.spec.ts` (which exercises plain-text fields), but closes the same latent flake for any `RichTextField` mounted under a populated collab room.

## 3.10.1

### Patch Changes

- 143e4a3: fix(adapters): adapter polish — TiptapEditor.setEditable sync, MarkdownEditor upload errors, CodeMirror useMemo + yCollab cast cleanup

  Bundle of three small adapter-side correctness / hygiene fixes from the 2026-05-21 code-quality sweep (Phase 6 a/b/c). Phase 6d (consume `@rudderjs/sync/react` collab hooks) is deferred to its own focused session since it needs playground + dual-browser smoke; Phase 6e (React-mount test coverage) is its own pass — neither ships here.

  - **6a — `TiptapEditor.setEditable` runtime sync.** `useEditor({ editable: !disabled, … })` only fires at construction. A parent flipping `disabled` after mount (validation failure mid-edit, form submitting state) would silently no-op. Sibling adapters `MarkdownEditor.tsx:256-259` and `CollabTextRenderer.tsx:127-130` already wire the matching effect; this aligns `TiptapEditor.tsx` with them.
  - **6b — `MarkdownEditor.uploadAndInsert` surfaces server errors.** `if (!res.ok || !data.ok || !data.url) return` silently stopped the spinner with no toast and no console — users see the upload button revert with no signal that anything went wrong. Now wired through `useToast()` from `@pilotiq/pilotiq/react` (same surface `<Toolbar>`'s media-dialog already uses): network-fail and server-fail both emit an `error`-type toast with the server's `data.error` (or `"Upload failed (status N)."` fallback). Falls back to a no-op when no `ToasterProvider` is mounted — `useToast` returns a default context.
  - **6c — CodeMirror `useMemo` + `as never` cleanup.** Two adjacent fixes in the codemirror adapter:
    - `CodeMirrorEditor.tsx:131` — the `const initial = useMemo(() => stringValue(defaultValue), [])` indirection was dressing — `useState<string>(initial)`'s initializer only runs once on mount regardless. Inlined as `useState<string>(() => stringValue(defaultValue))` with a comment naming the uncontrolled-fallback semantic + how `key`-based remount is the documented pattern for resetting a starting value across record swaps (the controlled path via `Form.stateUrl` doesn't need it).
    - `CollabCodeMirrorEditor.tsx:125` — `yCollab(yText, awareness, { undoManager: false } as never)` dropped the `as never` cast. Verified against `y-codemirror.next@^0.5`'s `index.d.ts`: the option key is `undoManager` (typed `Y.UndoManager | false`), not the suspected `yUndoManager` — the cast was bypassing typecheck for nothing.

  Tests: 183 / 183 green in `@pilotiq/tiptap`; 22 / 22 green in `@pilotiq/codemirror`; monorepo `pnpm typecheck` clean (9 / 9 packages).

- 89a9101: feat(collab): consume `@rudderjs/sync/react`'s collab-room lifecycle via `useCollabSeed` (Phase 6d of the code-quality sweep)

  The same `provider.once('synced', …)` + empty-fragment seed dance was duplicated across four pilotiq adapters (`TiptapEditor`, `MarkdownEditor`, `CollabTextRenderer`, `CollabCodeMirrorEditor`) and `@pilotiq-pro/collab`'s `useRecordCollabRoom`. `@rudderjs/sync@1.2.0` shipped `@rudderjs/sync/react` with `CollabRoomManager` (cancellation-safe, idempotent stop, optional `y-indexeddb`); this PR threads its synced Promise through pilotiq's open-core `CollabRoom` so adapters can consume the consolidated seed-gate via `useCollabSeed`.

  **`@pilotiq/pilotiq` (minor — new public API + widened `CollabRoom` shape, both additive)**

  - `CollabRoom` interface widened with two optional fields:
    - `synced?: Promise<void>` — resolves on the provider's first sync. Stamped by `@pilotiq-pro/collab@>=0.2`'s `<RecordCollabRoom>`; absent for legacy / hand-rolled providers.
    - `persistence?: unknown` — `y-indexeddb` handle, opaque to pilotiq core. Present when the room owner wired offline persistence; absent otherwise.
  - New `useCollabSeed(room, fragmentKey, seedFn)` hook (re-exported from `@pilotiq/pilotiq/react`). Mirrors `@rudderjs/sync/react`'s shape — reimplemented locally so pilotiq core stays free of any hard runtime dep on Yjs. Waits for `room.synced` to resolve, wraps `seedFn` in `ydoc.transact(..., 'pilotiq-collab-seed')`. Consumers manage their own share-type lookup (`doc.getXmlFragment(key)` for Tiptap; `doc.getText(key)` for CodeMirror) and emptiness check, since the share type varies per adapter and pilotiq's `CollabRoom.ydoc` stays `unknown`.
  - `onProviderSynced` is unchanged and still exported for back-compat — legacy rooms without `.synced` short-circuit through `useCollabSeed` immediately (seeded=true with no callback fired), so any adapter still calling `onProviderSynced` keeps working unchanged.

  **`@pilotiq/tiptap` (patch — internal migration, no public-surface change)**

  `TiptapEditor`, `MarkdownEditor`, and `CollabTextRenderer` each dropped their inline `useEffect(() => onProviderSynced(provider, trySeed), [editor, collabActive, room])` block in favour of one `useCollabSeed(editor && collabActive ? room : null, collabName, seedFn)`. The shape of the seed (Y.XmlFragment empty-check + `editor.commands.setContent(initialContent)` via the y-prosemirror binding) is unchanged. Roughly −40 LOC per file; the `hasSeeded` `useState` slots are gone (the hook owns dedup).

  **`@pilotiq/codemirror` (patch — internal migration, additive prop)**

  - New optional `synced?: Promise<void> | null` prop on `CollabCodeMirrorEditor`. Threaded from the wrapper in `CodeMirrorEditor.tsx`'s `<CollabBranch>` so the renderer can gate the brand-new-record Y.Text seed on the same Promise.
  - Seed logic moved out of the EditorView mount effect to a top-level `useCollabSeed` call. The mount-time pre-seed (`EditorState.create({ doc: yText.toString(), ... })`) is unchanged — that path handles re-mount onto a yText that already has content (e.g. `renameRow` clones); the post-sync seed handles brand-new records where the share is empty after first sync.
  - `onProviderSynced` + `SyncedProviderLike` no longer imported. The `synced` prop is optional with `null` default — passing nothing falls back to seeding immediately, matching the legacy `onProviderSynced(null, …)` no-op posture.

  No wire-protocol changes. The race window (two peers mounting against a brand-new record may both see "empty" + seed) is unchanged from the prior `onProviderSynced` path; the fix is server-side seed handoff, deferred.

  Coverage: existing tests pass unchanged (tiptap 183/183, codemirror 22/22, pilotiq monorepo typecheck 9/9). Dual-browser smoke via the existing `pilotiq-pro/e2e/collab` Playwright suite gates the actual sync behaviour.

- 63b5dc1: fix(tiptap): inline-diff effect re-runs when editor doc shape changes

  `useAiInlineDiff`'s diff-start effect previously depended only on `[editor, list]`, so a surgical suggestion arriving during the seed window of a collab-enabled markdown / richtext editor (editor mounts with an empty placeholder paragraph, then the Yjs provider seeds the real content asynchronously) would call `planReplaceBlock(editor, blockIndex, …)` against the empty doc, get `null` for any blockIndex >= 1, and silently bail. The suggestion stayed in the queue, the banner appeared, but no decorations rendered. On Accept, the applier's auto-mode fallback re-planned the modifier against the now-seeded doc and dispatched it — so the change landed but the user never saw a preview.

  Fix: subscribe to the editor's `doc.childCount` via `useEditorState` and include it in the diff-start effect's deps. The effect now re-runs when the doc transitions from empty (during seed) → loaded (after sync), picking up any suggestions whose modifier returned null on first attempt.

  No behaviour change outside the seed-race window. Established tests + e2e suite (5 cases, ~15s) green.

## 3.10.0

### Minor Changes

- 349c1f3: fix(collab-text): split `name` (FormData/AI routing) from `fragmentKey` (collab Y fragment) on the plain-text collab renderer

  Audit catch from the same family as the `MarkdownEditor` fix in `@pilotiq/pilotiq@0.20.0` / `@pilotiq/tiptap@3.9.0`. The `CollabTextRenderer` (Tiptap-backed plain-text editor used by collab-enabled `TextField` / `TextareaField` / `MarkdownField`'s collab fallback) had the same single-prop / two-concerns shape:

  - `TextLikeInput.tsx → CollabTextField` and `MarkdownInput.tsx → MarkdownCollabInput` both overrode the renderer's `name` with the composite row-id fragment key — needed for `Y.XmlFragment` stability under reorders — but that override ALSO re-keyed AI suggestion routing (`useAiSuggestionBridge`), so the chip-widget surface on a plain `TextField` nested in a Repeater row would never receive AI suggestions addressed by the positional FormData name (`metadata.0.title`).

  Fix: `CollabTextRendererProps` now carries an optional `fragmentKey`. `CollabTextRenderer` uses `fragmentKey ?? name` for the collab factory `fieldName` + first-load `ydoc.getXmlFragment(...)` seed only; AI suggestion bridge + form integration stay on `name`. Both host wrappers pass `name={hiddenInputName}` (positional FormData path) and `fragmentKey={composite}` (row-id-anchored) when the two differ; top-level fields omit `fragmentKey` and keep today's behavior.

  Latent bug, fixed preemptively: AI tool calls on plain `TextField` nested in a Repeater / Builder row would silently fail to render their inline-diff chip — same root cause as the `MarkdownField` bug in `@pilotiq/tiptap@3.8.0` and below, just for the chip-widget surface instead of the inline-diff overlay.

  All 16 collab e2e tests + 4 AI surgical e2e tests pass against the change.

- 29ccaff: fix(tiptap): RichTextField collab Y fragment now uses a row-id-anchored composite key inside Repeater / Builder rows

  Mirrors the `MarkdownField` fix shipped in `@pilotiq/tiptap@3.9.0`. When `TiptapEditor` mounts inside a Repeater / Builder row (i.e. its `name` is a dotted positional path like `metadata.0.body` AND a `RowCoordsContext` is present), the editor now computes a stable composite key — `metadata.<rowId>.body` — and uses it for:

  - `ydoc.getXmlFragment(...)` first-load seeding
  - The collab extension factory's `fieldName` (Yjs collab scope per field)

  `name` remains the positional FormData path everywhere else — AI suggestion routing (`useAiInlineDiff`, `useAiSuggestionBridge`), the inline-diff banner, mentions, and the hidden form input.

  Different mechanics from the `MarkdownField` fix: `MarkdownField` has a textarea fallback path that needs the same composite, so the logic lived in `@pilotiq/pilotiq`'s `MarkdownInput` host. `RichTextField` has no fallback — pilotiq core dispatches the registered renderer directly — so the composite logic lives here, inside the only editor that needs it. `useRowCoords` + `parseRowFieldPath` are already exported from `@pilotiq/pilotiq/react`.

  Latent bug, fixed preemptively: no consumer currently nests `RichTextField` inside a Repeater / Builder row, but if one did, row reorders would silently rebind the Y.XmlFragment to the wrong row's editor (the fragment key was the positional `metadata.<index>.body`, which shifts on reorder). AI suggestion routing was unaffected — positional names matched on both sides.

## 3.9.0

### Minor Changes

- cead688: fix(markdown): split `name` (FormData/AI routing) from `fragmentKey` (collab Y fragment) on the markdown editor

  `MarkdownEditorProps` previously had a single `name` prop that drove both the FormData hidden input + AI suggestion routing AND the `Y.XmlFragment` key. Inside a Repeater / Builder row, `MarkdownInput` overrode `name` with a row-id-anchored composite (`metadata.<rowId>.body`) so the Y fragment survived row reorders — but this also re-keyed the AI applier registry and `<AiSuggestionBanner>`, so tool calls that referenced the field by its dotted FormData name (`metadata.0.body`) never reached the row editor.

  Result: AI surgical / whole-field suggestions on a `MarkdownField` nested inside a Repeater row silently failed — the tool reported "queued for review" but no diff overlay appeared in the row.

  Fix: `MarkdownEditorProps` now carries a separate optional `fragmentKey` prop. The editor uses it for the collab Y fragment key (`ydoc.getXmlFragment(...)` + the collab factory's `fieldName`) but keeps `name` for everything else — AI suggestion routing, applier registry, hidden FormData input, inline-diff banner. Top-level fields omit `fragmentKey`; row leaves pass the composite as `fragmentKey` while leaving `name` as the dotted FormData path.

  `@pilotiq/tiptap`'s `MarkdownEditor` accepts the new prop and routes it correctly. `@pilotiq/pilotiq`'s `MarkdownInput` passes both props to the registered editor.

  Caveat: `RichTextField`'s `TiptapEditor` has the analogous single-`name` shape and would surface the same gap if nested in a Repeater. Not in scope for this change — no consumer currently nests `RichTextField` in a row. File a follow-up when it becomes a real path.

## 3.8.0

### Minor Changes

- 7cbf610: feat(tiptap): auto-mode applier for surgical AI inline-diff ops

  `useAiInlineDiff`'s registry applier now handles two paths:

  1. **Review accept (existing).** Suggestion was already started via `startAiInlineDiff` / `applySurgicalAiInlineDiff`; approve runs `acceptAiInlineDiff()`.
  2. **Auto-mode direct apply (new).** Suggestion arrives at the applier with `meta.surgical` but was never started (the producer bypassed the queue). The hook plans the same modifier the diff path uses and dispatches it as a plain transaction — no diff overlay, no Accept / Reject step.

  Mirrors the existing `set_value` auto-mode behaviour, where the AI tool binding calls the applier directly with a synthesized suggestion to skip the review queue. Surgical ops in `Pilotiq.aiSuggestionsMode('auto')` now write through immediately instead of always waiting on the user.

  Review-mode behaviour unchanged.

- 374168b: feat(tiptap): cross-tool-call stacking for surgical AI inline-diff ops

  When a surgical AI suggestion arrives while an inline-diff review is already active for the same field, `useAiInlineDiff` now folds the new op into the active diff instead of stalling the suggestion in the queue.

  Previously: the second suggestion sat in the queue until the user approved or rejected the first, then started its own diff afterwards. Worse, if the user clicked Accept while two were pending, the banner's "approve all" path dismissed both queue entries even though only the first had been applied — the second was silently dropped.

  Now: the new modifier dispatches as a plain transaction; the extension's plugin folds the resulting steps into the running changeset, so:

  - The banner shows the combined count (`"N changes suggested"`).
  - Decorations update to cover both ops' ranges.
  - Accept commits the union, Reject reverts to the original baseline captured when the first suggestion started the diff — semantically "reject all pending suggested changes", matching the banner copy.

  Whole-field (non-surgical) suggestions still bail when a diff is active — replacing the entire doc on top of an active review would be too disruptive. That gap (whole-field stacking + silent-drop) remains a known issue, deferred until a consumer hits it.

- cabbcf3: feat(tiptap): surgical AI inline-diff ops now support markdown fields

  `planReplaceBlock` and `planInsertBlockBefore` now auto-detect markdown editors by sniffing for the `tiptap-markdown` extension's `storage.markdown.parser`:

  - **Richtext (`RichTextField` / `TiptapEditor`)** — unchanged. `content` is HTML and parses through `DOMParser.fromSchema(...).parseSlice(...)` directly.
  - **Markdown (`MarkdownField` / `MarkdownEditor`)** — new. `content` is markdown source; the planner runs it through the markdown-it parser bundled with `tiptap-markdown` to produce HTML first, then parses that as a Slice.

  Mirrors the same auto-detect strategy `MarkdownEditor.tsx` already uses for whole-field `parseSuggestion` callbacks, so surgical ops on markdown fields now share the same content-handling path as the existing whole-field replacement path.

  Closes follow-up #4 of the surgical block ops shipped in `@pilotiq/tiptap@3.7.0`.

## 3.7.0

### Minor Changes

- b5462b7: feat(tiptap): surgical block-level inline-diff ops for AI agents

  Adds 4 precise block-edit primitives the AI agent can call instead of always rewriting the whole field via `set_value`. Each lands an inline-diff overlay scoped to just the changed range — far cheaper in tokens, far cleaner UX for the reviewer.

  **New extension command** on `AiInlineDiffExtension`:

  - `applySurgicalAiInlineDiff(id, applyFn)` — snapshots the current doc as the baseline, runs `applyFn(tr)` to mutate the transaction with a precise change, then folds the resulting steps into the changeset. The existing decoration spec walks per-change ranges, so surgical edits get the same green-insert / red-strikethrough overlay as whole-field replacements, but only on the touched blocks.

  **4 planner helpers** in a new `surgicalOps.ts` module (re-exported from the package root):

  - `planReplaceBlock(editor, blockIndex, html)` — swap one top-level block.
  - `planInsertBlockBefore(editor, blockIndex, html)` — insert before a given index (or append at `doc.childCount`).
  - `planDeleteBlock(editor, blockIndex)` — delete one top-level block. Refuses the last remaining block.
  - `planUpdateBlockMark(editor, blockIndex, mark, range, apply, attrs?)` — apply/remove inline marks on a character range _within_ a block. Offsets are 0-based within the block's text.
  - `summarizeBlockStructure(doc, maxChars?)` — render the doc's top-level structure as a numbered list (`[0] heading: Welcome`, …) for sending to the AI alongside the field value.

  Each planner returns a `TransactionModifier | null` — `null` means "abort, this can't be planned" (out-of-range index, unparseable HTML, unknown mark).

  **`useAiInlineDiff` hook** now reads `meta.surgical` on pending suggestions in two shapes:

  ```ts
  // Single op (one surgical change)
  meta: { surgical: { op: 'replace_block', blockIndex: 2, content: '<h2>...</h2>' } }

  // Batched ops (multiple surgical changes from one AI tool call)
  meta: { surgical: { ops: [
    { op: 'replace_block',       blockIndex: 0, content: '<h1>Title</h1>' },
    { op: 'insert_block_before', blockIndex: 2, content: '<p>New para</p>' },
  ] } }
  ```

  Batches are applied as one combined diff: modifiers are computed against the original (pre-transaction) doc, then dispatched in DESC `blockIndex` order so earlier modifiers' edits at higher positions don't shift the absolute positions later modifiers were planned with. The user sees a single inline-diff overlay with one Accept / Reject covering every op in the batch — rather than N pending suggestions that have to be reviewed serially.

  Whole-field suggestions (no surgical meta) continue through the existing `startAiInlineDiff` path.

  Also re-exports `AiInlineDiffExtension` / `aiInlineDiffPluginKey` / `getAiInlineDiffState` from the package root for consumers that want to read diff state directly.

## 3.6.0

### Minor Changes

- 8a32c8e: feat(tiptap): inline-diff visualization + banner UX for whole-field AI suggestions on RichTextField and MarkdownField

  The chip widget path (`AiSuggestionExtension`) keeps its role for _surgical_ range-anchored suggestions (`format_text`, `set_link`, `insert_paragraph`, …) — those have a precise location worth visualizing inline. For whole-field replacements from chat-driven `update_form_state` / `set_value` calls, the chip's `textContent` render surfaced raw markup as literal text inside the green pill — visually unparseable on multi-paragraph rewrites.

  Two new pieces in `@pilotiq/tiptap`:

  1. **`AiInlineDiffExtension` + `useAiInlineDiff` hook** — Tiptap-Pro-class inline-diff visualization driven by [`prosemirror-changeset`](https://github.com/ProseMirror/prosemirror-changeset). The hook watches `<PendingSuggestionsContext>` for whole-field suggestions, runs the renderer-supplied parser (`tiptap-markdown.parser.parse(value)` → HTML → `ProseMirrorDOMParser.parseSlice` for markdown / direct DOMParser for richtext), and calls `editor.commands.startAiInlineDiff(id, slice)`. The extension snapshots the current doc as the baseline, replaces the doc body with the proposed slice, and initializes a changeset tracking the diff. Decorations render:

     - Green-background `<span>` over inserted ranges (current doc).
     - Strikethrough widget at the insert anchor showing the _deleted_ text in red — the deleted content isn't in the current doc, so a widget is the only way to surface it.
     - `acceptAiInlineDiff()` clears the diff state (current doc IS the accepted state). `rejectAiInlineDiff()` reverts the doc to the captured baseline. Both commands are public and the host's banner drives them.

  2. **`<AiSuggestionBanner>` host component** — a top-of-editor strip that mounts above the editor when whole-field suggestions are pending. Replaces the chip path for richtext / markdown surfaces (which always had ugly raw-markup chips). Two modes:
     - Default (no diff): Accept routes through the renderer-supplied `onApplyWholeField(value)`, mirroring the previous chip-Approve semantics for plain text fallback.
     - Diff-active: `onAcceptViaEditor` / `onRejectViaEditor` props route through the extension's commands so the doc commits / reverts cleanly.

  Default CSS for both the banner chrome and the diff decorations auto-injects on first mount (idempotent via sentinels), so consumers see the visualization out of the box. Class names (`pilotiq-ai-banner-*` + `pilotiq-ai-diff-*`) stay the documented surface for theme customization.

  `MarkdownEditor` and `TiptapEditor` mount the new extension + banner; `CollabTextRenderer` keeps the chip path (plain-text replacement renders cleanly in the chip).

  Wire shape unchanged on the host side — `@pilotiq-pro/ai`'s `update_form_state` → `set_value` tool keeps emitting a single `suggestedValue` string. The renderer-supplied parser decides what to do with it.

## 3.5.0

### Minor Changes

- 644939b: fix(pilotiq, tiptap): route AI suggestions through the Tiptap bridge for collab-on / markdown / richtext fields — fixes chat-driven `update_form_state` no-op

  Two cooperating bugs left chat-sidebar Approve doing nothing on Tiptap-backed fields:

  1. **`FieldShell` overlay shadowed the bridge.** The gate `isRichText = fieldType === 'richtext'` ran the legacy overlay UI on `markdown` / `text` / `textarea`, _and_ registered a generic DOM-write applier that overwrote the Tiptap bridge's applier in the registry (parent effect runs after children). Approve set the hidden `<input>`'s `.value`, which the Tiptap editor never observes, so the visible content never changed.

  2. **Bridge skipped whole-field suggestions.** `useAiSuggestionBridge` only pushed entries with `meta.editorRange = { from, to }` into the editor. Chat-agent producers like `@pilotiq-pro/ai`'s `update_form_state` tool target the whole field — no range — so suggestions sat in the queue with no chip widget and no applier path.

  Fix:

  - **`@pilotiq/pilotiq`** — `FieldShell` widens `isRichText` to `isTiptapMounted`: `richtext` always, `markdown` when a `MarkdownEditor` is registered, `text` / `textarea` when both a `CollabTextRenderer` is registered and `useCollabRoom()` resolves a room. Hides the legacy overlay and skips DOM-write applier registration so the bridge's editor-driven applier owns the surface.

  - **`@pilotiq/tiptap`** — `useAiSuggestionBridge` accepts a new `onApplyWholeField(value)` option. When Approve fires for a non-bridge-pushed id, the bridge calls this callback instead of no-op'ing. Each renderer passes its own implementation:
    - `CollabTextRenderer` → `editor.commands.setContent(plainTextToDoc(value, multiline))` — y-prosemirror syncs the resulting transaction to peers when collab is on.
    - `MarkdownEditor` → `editor.commands.setContent(value)` — the Markdown extension parses the raw source.
    - `TiptapEditor` (RichTextField) → `editor.commands.setContent(value)` — HTML / JSON.

  After the fix every chat-driven `update_form_state` set-value lands on the visible editor surface across all three Tiptap mounts. Range-anchored suggestions (existing chip-widget path) keep their original behavior unchanged.

  **Plus inline-diff visualization for whole-field suggestions.** Two follow-on improvements in `@pilotiq/tiptap`:

  - `useAiSuggestionBridge` accepts `synthesizeWholeFieldRange(editor, suggestion) => { from, to } | undefined`. When opted in, whole-field suggestions get a synthesized range and the inline-diff chip widget renders BEFORE the user approves (red strikethrough on the current value + green chip with the suggested text + ✓/✕ buttons). `CollabTextRenderer` opts in with `{ from: 0, to: editor.state.doc.content.size }` — its plain-text schema accepts the extension's text-node replacement on Approve cleanly. `MarkdownEditor` and `TiptapEditor` abstain (they'd lose formatting on the chip-driven approve) and continue to use the silent `onApplyWholeField` fallback.

  - `AiSuggestionExtension` injects minimal default styles into `<head>` on first mount (idempotent via a `data-pilotiq-ai-suggestion-styles` sentinel). Consumers no longer need to wire CSS for the chip — they see the visualization out of the box. User stylesheets still override since they cascade after the injected `<style>` block, and the class names (`pilotiq-ai-suggestion-original` / `-chip` / `-replacement` / `-accept` / `-reject`) stay the documented surface for customization.

### Patch Changes

- adc0ce0: feat(pilotiq, tiptap): auto-upgrade `TextField` / `TextareaField` to the Tiptap-backed editor when AI agents are attached (no collab required)

  Previously, the Tiptap-backed renderer (`CollabTextRenderer` in `@pilotiq/tiptap`) only mounted when a `<RecordCollabRoom>` was active — so AI suggestions on plain (non-collab) `TextField` / `TextareaField` fell back to the legacy DOM-write overlay, with no inline-diff chip widget.

  The rule is now: a text-like field gets the Tiptap surface if **any one of**:

  1. A collab room is active (existing behavior — cursor preservation under concurrent edits).
  2. AI agents are attached via `field.ai([…])` (new — the inline-diff chip needs a ProseMirror surface to render).
  3. The field is a `MarkdownField` (existing — always Tiptap).

  `TextLikeInput` widens its routing gate from `room && collabRenderer …` to `(room || hasAi) && collabRenderer …`. `FieldShell` mirrors the widening so its legacy overlay + DOM-write applier stay out of the way when the Tiptap bridge owns the surface. `CollabTextRenderer` already handles `useCollabRoom() === null` — it just mounts the editor without the Yjs Collaboration extension, so this widening doesn't force a collab room.

  No new public API. Users get the auto-upgrade for free by attaching agents — exactly what they already do to opt into AI features on a field.

  **`@pilotiq/tiptap` follow-on:**

  - `CollabTextRenderer` now sets `immediatelyRender: false` on the editor config. Pre-rule-#2 the host's `TextLikeInput` gated on a live collab room (client-only state), so SSR fell through to the native input and the editor never constructed server-side. With AI-attached fields now SSR-rendering Tiptap, `useEditor` would throw `"Tiptap Error: SSR has been detected, please set immediatelyRender explicitly to false"` on the first direct-navigation request. The flag defers construction to the first React effect — empty shell on SSR, live editor on hydration.
  - Build script no longer ships `dist/markdownExtension.js.map`. The bundled file is 371 KB of inlined `tiptap-markdown` + `markdown-it` chain; the sourcemap from `tsc` only described the original ~20-line wrapper, leaving Vite to log a `Sourcemap … points to missing source files` warning on every consumer dev boot.

  **Inline-diff chip visualization extended to MarkdownEditor + TiptapEditor.** Both now opt into `synthesizeWholeFieldRange` so chat-driven whole-field suggestions (`update_form_state`'s `set_value`) render the chip widget over the whole doc. The bridge tracks synthesized ids in a separate set: on Approve, _producer-supplied_ range hits the editor's `approveAiSuggestion` (text-node replace, surgical), while _synthesized_ whole-doc range delegates to the renderer's `onApplyWholeField` (`setContent(...)`) and clears the chip with a no-op reject. Without this split, approving a synthesized chip on richtext / markdown would do a plain-text replace and clobber all formatting; without the synthesis, the user saw no visualization at all on richtext / markdown.

## 3.4.0

### Minor Changes

- 071ca3a: fix(tiptap): mount `AiSuggestionExtension` + `useAiSuggestionBridge` in `CollabTextRenderer` and `MarkdownEditor`

  The cross-package AI suggestion plumbing (extension + host bridge to `<PendingSuggestionsContext>`) was wired into `TiptapEditor` (RichTextField) but missing from the other two Tiptap-backed editors:

  - `CollabTextRenderer` — the Tiptap-backed plain-text path used by `TextField` and `TextareaField` when collab is on.
  - `MarkdownEditor` — `MarkdownField`'s editor surface.

  `editor.commands.addAiSuggestion(...)` was a no-op on those fields. Now every Tiptap mount across the adapter participates in suggestion mode uniformly — same wire-shape ids, same Approve / Reject chip widgets, same dismissal lifecycle as the rich-text path.

  No host changes required — the bridge reads the field name from the props the renderers already accept.

## 3.3.3

### Patch Changes

- 1b8c1bc: feat(pilotiq): extract `onProviderSynced(provider, fn)` helper for the seed-on-synced collab lifecycle pattern

  Adapter packages that bind to a collab room (Tiptap-backed editors, the CodeMirror collab adapter) all need the same choreography on mount: if the provider's already streamed in the initial room state, run the seed callback now; otherwise register `provider.once('synced', fn)` and clean up via `provider.off?.('synced', fn)`. That gate was implemented separately in 4 renderers (`CollabTextRenderer`, `MarkdownEditor`, `TiptapEditor` in `@pilotiq/tiptap`; `CollabCodeMirrorEditor` in `@pilotiq/codemirror`).

  This change extracts the pattern into a single helper in `@pilotiq/pilotiq/react` so future bug fixes in the gate logic (StrictMode double-fire, missing-off-method providers, etc.) fix in one place and so adapters from outside this monorepo can adopt the same pattern with one import.

  **New public surface on `@pilotiq/pilotiq/react`:**

  - `onProviderSynced(provider, fn): () => void` — runs `fn` synchronously if `provider.synced`, otherwise registers `provider.once('synced', fn)`. Returns a cleanup that safely unregisters via `try { provider.off?.('synced', fn) } catch {}`. Null/undefined provider returns a no-op cleanup.
  - `SyncedProviderLike` — structural type with `synced?: boolean`, `once?(event: 'synced', fn): void`, `off?(event: 'synced', fn): void`. No yjs / y-websocket peer dep — callers cast their concrete provider via `provider as SyncedProviderLike`.

  **Adapter package changes (patch-grade):**

  - `@pilotiq/tiptap`: `CollabTextRenderer`, `MarkdownEditor`, and `TiptapEditor` each replace their ~10-line gate block with `return onProviderSynced(provider, trySeed)` (still inside the existing `useEffect`).
  - `@pilotiq/codemirror`: `CollabCodeMirrorEditor` stores the cleanup and invokes it alongside `view.destroy()` inside the mount effect's combined cleanup.

  Behavior is unchanged — no double-fire risk, no missed-cleanup risk, no API changes for callers of any of the affected renderers.

  Test coverage: 6 new unit tests in `packages/pilotiq/src/react/onProviderSynced.test.ts` cover synced-now, defer-until-synced, cleanup-before-synced, null provider, off-throws, and provider-missing-once/off.

## 3.3.2

### Patch Changes

- 5907520: fix(tiptap): bundle the markdown extension chain into dist

  `tiptap-markdown@^0.9`'s transitive `markdown-it-task-lists@2.1.1` is pure CJS (`module.exports = function...`) with no `default` export, which Vite's dev runtime can't synthesize — the `import x from 'markdown-it-task-lists'` inside tiptap-markdown's task-list node threw `does not provide an export named 'default'` at module init and silently killed the entire admin client bundle (no editors mounted, no console-visible error beyond a single `pageerror`). The previous workaround was for downstream consumers to wire `tiptap-markdown` + `markdown-it` + `markdown-it-task-lists` into their `optimizeDeps.include`.

  Now the chain is pre-bundled into `dist/markdownExtension.js` at `@pilotiq/tiptap` build time via esbuild (`scripts.bundle:markdown`). `MarkdownEditor.tsx` imports `{ Markdown }` from `../markdownExtension.js` instead of `'tiptap-markdown'` directly, so the CJS↔ESM interop lives inside our dist and consumers can drop the `optimizeDeps.include` workaround.

  `tiptap-markdown` moves from `peerDependencies` to `devDependencies` (consumers no longer need to install it; only used at build time).

## 3.3.1

### Patch Changes

- 894e82a: Fix Tiptap v3 SSR crash in `MarkdownEditor` under Vike. Sets `immediatelyRender: false` so the editor defers DOM construction until the first React effect; SSR renders an empty shell and hydration mounts the live editor.

## 3.3.0

### Minor Changes

- 850638f: `MarkdownField` swaps its textarea + manual-toolbar UI for a real WYSIWYG editor when `@pilotiq/tiptap` is installed. The editor parses markdown into a Tiptap document, exposes a rich-text toolbar (bold / italic / strike / link / heading / lists / blockquote / code / attach files), and serializes back to markdown on every change via `tiptap-markdown`. Editor / Source / Preview tabs let users switch between WYSIWYG, raw markdown, and a rendered preview.

  Collab is automatic — when a `<RecordCollabRoom>` is up-tree the editor binds to the shared `Y.XmlFragment` the same way `RichTextField` does. All peers see live edits; only the local serialize-to-markdown runs per peer.

  Wire format unchanged — a plain markdown string under the field name. Panels that don't install `@pilotiq/tiptap` keep the textarea fallback.

  New public API in pilotiq core:

  - `registerMarkdownEditor(C) / getMarkdownEditor()` + `MarkdownEditor / MarkdownEditorProps` types — re-exported from `@pilotiq/pilotiq/react`.

  New in `@pilotiq/tiptap`:

  - `MarkdownEditor` component, auto-registered by `registerTiptap()` / `tiptap()` plugin.
  - `tiptap-markdown@^0.9` peer dep.

## 3.2.1

### Patch Changes

- Phase D — drop the `_pt:` field-name prefix from `CollabTextRenderer`. The `Y.XmlFragment` now lives under the natural field name. The prefix was a temporary workaround during the Tiptap-backed text-collab swap to dodge a `Y.Text` / `Y.XmlFragment` constructor collision against the legacy form-binding allocation in `@pilotiq-pro/collab`.

  **Coordination requirement when using `@pilotiq-pro/collab`:** ship the matching `@pilotiq-pro/collab` Phase D update (drops the per-field `Y.Text` allocation) at the same time. Without it, the natural-key `Y.XmlFragment` collides with the legacy `Y.Text(name)` slot and the binding throws on mount. Standalone `@pilotiq/tiptap` consumers (no collab) are unaffected — there's no `Y.Text` allocation in play.

  Migration note: records that were edited under the pre-Phase-D code carry a stale `Y.Text(name)` in their IndexedDB / server-persisted ydoc state. The new code ignores it (no consumer touches that slot anymore); the persisted record value is unaffected, only per-keystroke CRDT history from active sessions during the migration is silently dropped.

## 3.2.0

### Minor Changes

- 353a228: feat(tiptap): collab-aware editor via pilotiq's collab registries

  `TiptapEditor` now plugs into `@pilotiq/pilotiq`'s `CollabRoomContext`
  and `CollabExtensionFactory` registry — when a `<RecordCollabRoom>` is
  mounted up-tree AND a plugin (e.g. `@pilotiq-pro/collab`) has registered
  extensions, the editor attaches to the room and uses the field's name as
  the `Y.XmlFragment` selector. Multiple `RichTextField`s on one record
  share ONE Y.Doc + ONE WebSocket connection — mirrors Tiptap's
  "Collaborative Fields" experiment.

  ### Behavior

  - **Remount on collab toggle.** A `CollabAwareTiptap` shell reads the
    room + factory and keys `ClientEditor` on `collabActive ? 'collab' :
'local'`. Tiptap can't swap `Collaboration` at runtime, so the keyed
    remount handles the room-attaches-after-mount case cleanly.
  - **History disabled when collab is active.** Yjs ships its own undo
    manager via `Collaboration`; StarterKit's `undoRedo` extension is
    disabled in the collab branch to avoid two stacks fighting.
  - **First-load seed.** After `provider.synced` fires, if the field's
    Y.XmlFragment is empty AND `defaultValue` looks like a Tiptap doc
    (`isTiptapShapedContent` guard), seed once via
    `editor.commands.setContent`. Subsequent joiners find the fragment
    populated and skip.
  - **Lexical-shape guard.** Existing rows holding old Lexical-format JSON
    (`{ root: {...} }`) no longer crash the editor — the same guard skips
    the parse so the editor mounts empty instead.
  - **Per-field opt-out.** `RichTextField.make('private').collab(false)`
    stamps `meta.collab === false`; the renderer skips the collab
    extensions even with a room mounted. (`.collab()` itself lives on the
    `Field` base in `@pilotiq/pilotiq`; this PR only wires the renderer.)

  ### Cosmetics

  - Field container `<div>` lost `gap-1` — collab cursors render flush
    against the editor frame now.

  ### Required peers (when collab is in use)

  `@pilotiq/tiptap` itself takes no new peer deps — the collab factory is
  opaque `unknown[]`. The pro consumer (`@pilotiq-pro/collab`) declares
  `@tiptap/extension-collaboration` + `@tiptap/extension-collaboration-caret`
  peers + ships the Yjs runtime.

## 3.1.1

### Patch Changes

- b14119e: Widen the `@pilotiq/pilotiq` peer dependency from `workspace:^` (publishes as `^<version>`) to the literal range `>=0.6.0 <1.0.0`.

  Under pre-1.0 caret semver, `^0.6.0` does not satisfy `0.7.0`, so every pilotiq minor bump was breaking the adapters' published peer range — which in turn made changesets propose a MAJOR bump on the adapters on every release, even when nothing in them changed. The literal range covers the whole `0.x` track, so the trap no longer fires.

## 3.1.0

### Minor Changes

- e1a79f6: feat(core+tiptap): cross-tree applier registry — Approve from anywhere

  Phase 8.5 of the AI UX polish plan. Adds an open-core registry that
  lets aggregate consumers — chat-sidebar pending-pills, bulk-action
  menus, future "AI inbox" surfaces — apply a `PendingSuggestion` to its
  target field without sharing the form's React tree.

  ```ts
  import { registerPendingSuggestionApplier } from "@pilotiq/pilotiq/react";

  // Renderer-side (auto-wired by FieldShell + Tiptap bridge):
  useEffect(
    () =>
      registerPendingSuggestionApplier(formId, fieldName, (suggestion) => {
        /* apply to this field's underlying input or editor */
      }),
    [formId, fieldName]
  );
  ```

  **Core (`@pilotiq/pilotiq`)**:

  - New module `react/PendingSuggestionApplierRegistry.ts` — module-level
    Map keyed by `(formId, fieldName)` (`formId` defaults to `'*'` for
    global form scope; form-scoped registrations always win over the
    wildcard for the same field). Exposes `registerPendingSuggestionApplier`
    (returns unregister fn for `useEffect` cleanup) and
    `getPendingSuggestionApplier`.
  - `PendingSuggestionsApi` extended with `approve(id)` and
    `approveAll(filter?)` — resolves the suggestion's `(formId,
fieldName)` against the registry, runs the applier, then dismisses.
    Falls through to plain `dismiss` when no applier is registered or
    the applier throws (so a busted applier doesn't strand entries).
    Default no-op context implements both as plain dismiss.
  - `<FieldShell>` auto-registers a generic applier on mount for every
    non-richtext, non-dotted-path field. Applier uses
    `useFieldState.setValue` for controlled (live) forms and a DOM
    fallback (React's internal value setter via
    `Object.getOwnPropertyDescriptor(proto, 'value').set`) for
    uncontrolled forms. Cleanup on unmount.

  **Tiptap (`@pilotiq/tiptap`)**:

  - `useAiSuggestionBridge` registers a richtext-aware applier that
    calls `editor.chain().focus().approveAiSuggestion(id).run()` —
    same path the inline chip click takes. The transaction listener
    already mirrors the editor-side dismissal back to context, so a
    pill-driven Approve flows: pill → applier → editor command →
    editor `onTransaction` → context `dismiss`.

  The registry is generic — not AI-specific. Future field-mutation
  extensions (form-recovery, undo stacks, bulk imports) can register
  through the same seam.

  Default no-op context still ships, so trees without a real provider
  mounted (e.g. headless tests, marketing-site previews) see no behavior
  change.

- 56a6f62: feat(core+tiptap): PendingSuggestionsContext seam + RichTextField AI bridge

  Adds a cross-package, plugin-fillable queue of suggested field-value
  changes that any field renderer can subscribe to. Open-core seam — core
  defines the shape + provider, plugins like `@pilotiq-pro/ai` ship the
  real implementation.

  ```ts
  import { usePendingSuggestionsForField } from "@pilotiq/pilotiq/react";

  const { list, dismiss } = usePendingSuggestionsForField("body");
  //      ↑ filtered to suggestions targeting this field+formId
  ```

  **`@pilotiq/pilotiq` exports** (`@pilotiq/pilotiq/react`):

  - `PendingSuggestion` — `{ id, fieldName, formId?, currentValue,
suggestedValue, source?, createdAt, meta? }`. The `meta` bag carries
    field-type-specific extras (e.g. `editorRange: { from, to }` for
    `richtext`).
  - `PendingSuggestionsApi` — `{ list, push, dismiss, dismissAll }`. Core
    ships a no-op default context so trees without a real provider never
    throw.
  - `PendingSuggestionsContext`, `usePendingSuggestions()`,
    `usePendingSuggestionsForField(name, formId?)` — the subscription
    surface.
  - `registerPendingSuggestionOverlay(C)` — mirrors
    `registerFieldLabelSlot()`. A plugin registers a single component
    (`{ suggestion, onApprove, onReject }` props) that `<FieldShell>`
    mounts below the input whenever a matching pending suggestion exists.
    Skipped on `richtext` fields (those render the diff inline via the
    Tiptap extension).

  **`@pilotiq/tiptap` `RichTextField` bridge**:

  The Tiptap renderer now subscribes to the queue and mirrors entries
  into its `AiSuggestionExtension`. Producers push a `PendingSuggestion`
  with `meta.editorRange = { from, to }` and a string `suggestedValue`;
  the bridge calls `editor.commands.addAiSuggestion(...)` so the inline
  diff + Approve / Reject chips appear. When the user clicks a chip,
  the editor command runs (mutating the doc on Approve, leaving it on
  Reject) and the bridge mirrors the removal back to the queue via
  `dismiss(id)` so other surfaces (chat-sidebar pill, FieldShell
  overlay registered by another plugin) clear in lock-step.

  The bridge is no-op when no provider is mounted — pilotiq core ships
  the default no-op context, so consumers without `@pilotiq-pro/ai` see
  no behavior change.

  Pure helpers + types are public; the bridge hook
  `useAiSuggestionBridge` is exported from `@pilotiq/tiptap` for advanced
  producers that want to drive their own editor instances.

- 4f8e03b: feat(tiptap): AiSuggestion extension — inline diff + Approve/Reject chips

  Always-on Tiptap extension that tracks AI-suggested edits as inline
  strikethrough decorations on the original range plus a chip widget at
  the range end carrying a preview of the replacement and per-hunk
  Approve / Reject buttons. Idle until the host calls
  `editor.commands.addAiSuggestion(...)`.

  ```ts
  editor.commands.addAiSuggestion({
    id: "seo-1",
    from: 12,
    to: 18,
    replacement: "better",
    source: { agentLabel: "SEO" },
  });
  // User clicks ✓ on the chip, or:
  editor.commands.approveAiSuggestion("seo-1");
  ```

  Command surface: `addAiSuggestion`, `addAiSuggestions`,
  `approveAiSuggestion(id)`, `rejectAiSuggestion(id)`,
  `approveAllAiSuggestions()`, `rejectAllAiSuggestions()`,
  `clearAiSuggestions()`. `approveAll` runs in highest-`from`-first order
  so earlier-in-doc replacements don't shift the positions of later
  suggestions.

  Suggestion ranges remap through every doc transaction; ranges that
  collapse past each other under user edits drop automatically. Plain-text
  replacement only in v1 (marks/structure are not carried).

  The package stays CSS-free — consumers wire styles against the
  documented class names: `pilotiq-ai-suggestion-original` (strikethrough
  on the original range), `pilotiq-ai-suggestion-chip` (widget root),
  `pilotiq-ai-suggestion-replacement` (suggested-text preview),
  `pilotiq-ai-suggestion-accept` / `pilotiq-ai-suggestion-reject`
  (buttons). Class prefix is configurable via the extension's
  `classPrefix` option.

  `onChange(suggestions)` callback fires whenever the suggestion list
  changes (after any add / approve / reject / clear, plus when a doc edit
  collapses a range). Lets consumers mirror state into a React context
  without polling editor state.

### Patch Changes

- Updated dependencies [b6dffde]
- Updated dependencies [8845b90]
- Updated dependencies [2c441b7]
- Updated dependencies [ae1450e]
- Updated dependencies [e1a79f6]
- Updated dependencies [df85886]
- Updated dependencies [56a6f62]
- Updated dependencies [e791f65]
- Updated dependencies [cce4f52]
- Updated dependencies [bd8229e]
- Updated dependencies [2f42dcd]
- Updated dependencies [425cf50]
- Updated dependencies [d7dbc80]
- Updated dependencies [8d92594]
  - @pilotiq/pilotiq@0.7.0

## 3.0.0

### Patch Changes

- Updated dependencies [3b9d69c]
- Updated dependencies [e7f46a3]
- Updated dependencies [546b7bb]
- Updated dependencies [badb132]
- Updated dependencies [4440ec4]
  - @pilotiq/pilotiq@0.6.0

## 2.0.1

### Patch Changes

- 863505c: Use caret peer dep for `@pilotiq/pilotiq` so adapter packages stay compatible across minor bumps.

## 2.0.0

### Patch Changes

- Updated dependencies [a1c3e40]
  - @pilotiq/pilotiq@0.4.0

## 1.0.0

### Patch Changes

- Updated dependencies [58232be]
- Updated dependencies [58232be]
- Updated dependencies [43428d6]
  - @pilotiq/pilotiq@0.3.0

## 0.2.0

### Patch Changes

- Updated dependencies [2dedc56]
  - @pilotiq/pilotiq@0.2.0

## 0.1.0

### Patch Changes

- Updated dependencies [8cea72c]
- Updated dependencies [786da6b]
- Updated dependencies [2f4c948]
- Updated dependencies [4bdae5d]
- Updated dependencies [e5cd3f1]
  - @pilotiq/pilotiq@0.1.0
