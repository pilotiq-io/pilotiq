---
"@pilotiq/tiptap": patch
---

Show the inline mark toolbar on a bare caret inside a formatting mark.

The selection-based `FloatingToolbar` only appeared on a non-empty text selection, so a link or bold span couldn't be edited by just clicking into it (#156). Its show/hide decision now lives in a pure, exported `shouldShowFloatingToolbar(state)` predicate: a caret (empty selection) surfaces the toolbar when it sits inside one of the toolbar's marks (`bold` / `italic` / `strike` / `code` / `link`), non-empty ranges behave as before, and the callout/alert suppression from #155 still holds. Pinned by `floatingToolbarVisibility.dom.test.ts` against the real schema.
