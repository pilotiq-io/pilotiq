---
'@pilotiq/tiptap': patch
---

fix(tiptap): bundle the markdown extension chain into dist

`tiptap-markdown@^0.9`'s transitive `markdown-it-task-lists@2.1.1` is pure CJS (`module.exports = function...`) with no `default` export, which Vite's dev runtime can't synthesize — the `import x from 'markdown-it-task-lists'` inside tiptap-markdown's task-list node threw `does not provide an export named 'default'` at module init and silently killed the entire admin client bundle (no editors mounted, no console-visible error beyond a single `pageerror`). The previous workaround was for downstream consumers to wire `tiptap-markdown` + `markdown-it` + `markdown-it-task-lists` into their `optimizeDeps.include`.

Now the chain is pre-bundled into `dist/markdownExtension.js` at `@pilotiq/tiptap` build time via esbuild (`scripts.bundle:markdown`). `MarkdownEditor.tsx` imports `{ Markdown }` from `../markdownExtension.js` instead of `'tiptap-markdown'` directly, so the CJS↔ESM interop lives inside our dist and consumers can drop the `optimizeDeps.include` workaround.

`tiptap-markdown` moves from `peerDependencies` to `devDependencies` (consumers no longer need to install it; only used at build time).
