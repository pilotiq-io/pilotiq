// Re-export of `tiptap-markdown`'s `Markdown` extension. The .ts source
// here only types the re-export; the .js emitted alongside it under
// `dist/` is REPLACED at build time by an esbuild-produced ESM bundle
// that inlines `tiptap-markdown` + `markdown-it` + `markdown-it-task-lists`.
//
// Why bundle. `tiptap-markdown@0.9.0`'s task-list node imports
// `markdown-it-task-lists` as `import x from 'markdown-it-task-lists'`,
// but that package ships pure CJS (`module.exports = fn`) with no
// `default` export. Vite's dev runtime serves the raw CJS and does not
// synthesize a `default`, so the import throws at client-bundle init and
// the whole admin app silently fails to mount. Pre-bundling the chain
// here moves CJS↔ESM interop to @pilotiq/tiptap's build step (esbuild
// handles it cleanly) so downstream consumers don't have to wire
// `optimizeDeps.include` for the CJS transitive.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { Markdown as MarkdownImpl } from 'tiptap-markdown'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const Markdown: any = MarkdownImpl
