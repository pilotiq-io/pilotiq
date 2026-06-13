---
"@pilotiq/tiptap": minor
---

Add semantic landmark content blocks and a content-preserving `wrap_blocks` surgical op.

- **`intro` block** — a labelled ("Introduction") landmark for the start of an article. Exported as `Intro` and registered in `contentBlockNodes`; rendered read-side via `renderRichTextToHtml`; available from the slash menu.
- **`summary` block variant** — `summary` gains a `variant: 'section' | 'article'` attr. `section` (default) keeps the "Summary" label for a mid-content paragraph summary; `article` labels it "In summary" for the end-of-article conclusion landmark. The block gear menu offers a Section/Article toggle and the slash menu gains an "Article summary" entry.
- **`wrap_blocks` surgical op** (`planWrapBlocks` + `useAiInlineDiff`) — wraps a contiguous run of top-level blocks `[fromIndex..toIndex]` into a single container node (`intro` / `summary` / `keyTakeaways`) using ProseMirror's own model, with no HTML round-trip, so marks and attrs are preserved verbatim. Lets agents turn unstructured prose into a landmark block without rewriting its text.

These establish document landmarks so block-placement agents can position content deterministically (e.g. key-takeaways after the intro, FAQ after the conclusion).
