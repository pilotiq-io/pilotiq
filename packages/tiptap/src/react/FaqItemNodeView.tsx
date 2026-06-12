import { type ReactElement } from 'react'
import { NodeViewWrapper, NodeViewContent, type NodeViewProps } from '@tiptap/react'

/**
 * React NodeView for a `faqItem` — one row of the FAQ accordion. The question
 * is the always-visible trigger; the answer collapses below it. A chevron
 * toggles the item's `open` attr (the same attr the read-side `<details>`
 * accordion reads, so the editor state is what publishes). The question stays
 * editable on click — only the chevron toggles — which is the right authoring
 * UX (clicking text places the cursor, it doesn't fold the row).
 *
 * One `<NodeViewContent>` holds both child nodes (`faqQuestion` + `faqAnswer`);
 * the answer hides via a CSS attribute selector when collapsed, so its editable
 * content stays mounted and round-trips through FormData on save.
 */
export function FaqItemNodeView({ node, updateAttributes, editor }: NodeViewProps): ReactElement {
  const open     = node.attrs['open'] !== false
  const editable = editor.isEditable

  return (
    <NodeViewWrapper
      data-type="faqItem"
      data-open={open ? 'true' : 'false'}
      className={
        'pilotiq-faq-item relative border-b border-border last:border-b-0 ' +
        '[&[data-open=false]_.pilotiq-faq-answer]:hidden ' +
        '[&_.pilotiq-faq-question]:py-3 [&_.pilotiq-faq-question]:pl-7 [&_.pilotiq-faq-question]:font-medium ' +
        '[&_.pilotiq-faq-answer]:pb-3 [&_.pilotiq-faq-answer]:pl-7 [&_.pilotiq-faq-answer]:text-sm [&_.pilotiq-faq-answer]:text-muted-foreground [&_.pilotiq-faq-answer_p]:my-0'
      }
    >
      <button
        type="button"
        contentEditable={false}
        aria-label={open ? 'Collapse answer' : 'Expand answer'}
        aria-expanded={open}
        disabled={!editable}
        onClick={() => updateAttributes({ open: !open })}
        className="absolute left-0 top-3 flex size-5 items-center justify-center rounded text-muted-foreground transition-transform hover:text-foreground"
        style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}
      >
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m9 18 6-6-6-6" /></svg>
      </button>
      <NodeViewContent />
    </NodeViewWrapper>
  )
}
