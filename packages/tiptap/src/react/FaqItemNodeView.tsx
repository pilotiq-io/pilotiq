import { type ReactElement } from 'react'
import { NodeViewWrapper, NodeViewContent, type NodeViewProps } from '@tiptap/react'

/**
 * React NodeView for a `faqItem` — one row of the FAQ accordion. The question
 * is the always-visible trigger; the answer collapses below it. The chevron (on
 * the right, shadcn-style) toggles the item's `open` attr — the same attr the
 * read-side `<details>` accordion reads, so the editor state is what publishes.
 * The question stays editable on click; only the chevron toggles.
 *
 * One `<NodeViewContent>` holds both child nodes (`faqQuestion` + `faqAnswer`).
 * Layout + the collapse (hiding `.pilotiq-faq-answer` when `data-open="false"`)
 * live in the consumer's `.pilotiq-faq*` CSS — shared with the read-side — so
 * the editable answer stays mounted (round-trips through FormData on save) and
 * the editor matches the published look.
 */
export function FaqItemNodeView({ node, updateAttributes, editor }: NodeViewProps): ReactElement {
  const open     = node.attrs['open'] !== false
  const editable = editor.isEditable

  return (
    <NodeViewWrapper data-type="faqItem" data-open={open ? 'true' : 'false'} className="pilotiq-faq-item relative">
      <button
        type="button"
        contentEditable={false}
        aria-label={open ? 'Collapse answer' : 'Expand answer'}
        aria-expanded={open}
        disabled={!editable}
        onClick={() => updateAttributes({ open: !open })}
        className="absolute start-0 top-2.5 flex size-5 items-center justify-center text-muted-foreground/60 transition-transform hover:text-foreground"
        style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
      >
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m6 9 6 6 6-6" /></svg>
      </button>
      <NodeViewContent />
    </NodeViewWrapper>
  )
}
