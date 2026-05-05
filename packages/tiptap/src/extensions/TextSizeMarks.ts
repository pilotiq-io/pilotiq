import { Mark, mergeAttributes } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    lead: {
      /** Toggle the `lead` mark on the current selection. */
      toggleLead: () => ReturnType
    }
    small: {
      /** Toggle the `small` mark on the current selection. */
      toggleSmall: () => ReturnType
    }
  }
}

/**
 * Two inline marks for paragraph-style size variants beyond the standard
 * heading levels:
 *
 *   - `lead`  — opening / lede paragraph styling. Renders as
 *               `<span class="lead">…</span>` so authors keep paragraph
 *               semantics; styling is owned by the consumer's CSS (the
 *               adapter doesn't ship a `.lead` rule — every site already
 *               has one).
 *   - `small` — semantic `<small>` mark. Mirrors the HTML element so
 *               read-side renderers don't need a special class to style
 *               fine print.
 *
 * Both marks live in the standard inline group so they compose with bold,
 * italic, color, etc. without exclusivity rules. Excluding each other isn't
 * useful — a `<small lead>` selection would be inert visually anyway.
 */
export const LeadMarkExtension = Mark.create({
  name: 'lead',

  parseHTML() {
    return [{ tag: 'span.lead' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes({ class: 'lead' }, HTMLAttributes), 0]
  },

  addCommands() {
    return {
      toggleLead:
        () =>
        ({ commands }) =>
          commands.toggleMark(this.name),
    }
  },
})

export const SmallMarkExtension = Mark.create({
  name: 'small',

  parseHTML() {
    return [{ tag: 'small' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['small', mergeAttributes(HTMLAttributes), 0]
  },

  addCommands() {
    return {
      toggleSmall:
        () =>
        ({ commands }) =>
          commands.toggleMark(this.name),
    }
  },
})
