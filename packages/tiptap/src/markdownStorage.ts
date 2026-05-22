import type { Editor } from '@tiptap/core'

/**
 * Typed accessor for the `tiptap-markdown` extension's editor.storage slot.
 *
 * Tiptap's `Storage` type is a generic that defaults to `any` (see
 * `@tiptap/core` `ExtendableConfig<Options, Storage = any>`), so the
 * markdown extension's contributions aren't reachable through a clean
 * module augmentation. This module centralizes the structural narrow in
 * one place — every caller used to repeat `(editor.storage as any).markdown`
 * with the same `typeof getMarkdown === 'function'` guard.
 *
 * The shape mirrors `tiptap-markdown@^0.9.0`'s actual runtime contract.
 * If the markdown extension isn't installed (or hasn't initialized yet),
 * the accessors return `undefined` / `''` rather than throwing.
 */

interface MarkdownStorage {
  getMarkdown(): string
  parser: { parse(source: string): string }
}

function readStorage(editor: Editor): unknown {
  return (editor.storage as unknown as Record<string, unknown>)['markdown']
}

export function getMarkdownStorage(editor: Editor): MarkdownStorage | undefined {
  const s = readStorage(editor)
  if (
    s !== null &&
    typeof s === 'object' &&
    typeof (s as MarkdownStorage).getMarkdown === 'function' &&
    typeof (s as { parser?: { parse?: unknown } }).parser?.parse === 'function'
  ) {
    return s as MarkdownStorage
  }
  return undefined
}

/** Read the editor's current content as a markdown string. Returns '' when the markdown extension isn't installed. */
export function getMarkdownString(editor: Editor): string {
  return getMarkdownStorage(editor)?.getMarkdown() ?? ''
}

/** Parse a markdown source string to HTML via the markdown extension's parser. Returns undefined when unavailable. */
export function parseMarkdownToHtml(editor: Editor, source: string): string | undefined {
  const html = getMarkdownStorage(editor)?.parser.parse(source)
  return typeof html === 'string' ? html : undefined
}
