---
'@pilotiq/tiptap': minor
---

feat(tiptap): AiSuggestion extension — inline diff + Approve/Reject chips

Always-on Tiptap extension that tracks AI-suggested edits as inline
strikethrough decorations on the original range plus a chip widget at
the range end carrying a preview of the replacement and per-hunk
Approve / Reject buttons. Idle until the host calls
`editor.commands.addAiSuggestion(...)`.

```ts
editor.commands.addAiSuggestion({
  id:          'seo-1',
  from:        12,
  to:          18,
  replacement: 'better',
  source:      { agentLabel: 'SEO' },
})
// User clicks ✓ on the chip, or:
editor.commands.approveAiSuggestion('seo-1')
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
