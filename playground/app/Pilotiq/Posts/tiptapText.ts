/**
 * Extract plain text from a Tiptap/ProseMirror JSON document. Used by
 * the post analytics sub-page and the `ReadingStats` infolist entry —
 * `post.content` stores the editor document, not a string.
 *
 * Accepts the document object, a JSON-encoded string of it, or
 * null/undefined (returns ''). Text nodes join with spaces so word
 * counts behave across block boundaries.
 */
export function tiptapText(content: unknown): string {
  let doc: unknown = content
  if (typeof content === 'string') {
    try { doc = JSON.parse(content) } catch { return content }
  }
  if (!doc || typeof doc !== 'object') return ''

  const parts: string[] = []
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return
    const n = node as { text?: unknown; content?: unknown[] }
    if (typeof n.text === 'string') parts.push(n.text)
    if (Array.isArray(n.content)) for (const child of n.content) walk(child)
  }
  walk(doc)
  return parts.join(' ')
}
