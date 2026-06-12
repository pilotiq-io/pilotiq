import { test } from 'node:test'
import assert from 'node:assert/strict'

import { renderRichTextToHtml } from '../render.js'
import { RichTextField } from '../RichTextField.js'
import { defaultBlocks } from './index.js'

// ─── helpers ──────────────────────────────────────────────────────────

function doc(node: unknown): unknown {
  return { type: 'doc', content: [node] }
}
const para = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const list = (text: string) => ({
  type: 'bulletList',
  content: [{ type: 'listItem', content: [para(text)] }],
})

// ─── defaults are inline nodes now, not schema blocks ─────────────────

test('no schema blocks ship as defaults (defaults are inline nodes)', () => {
  assert.deepEqual([...defaultBlocks], [])
})

test('a bare RichTextField has no default schema blocks', async () => {
  assert.deepEqual((await RichTextField.make('body').toMeta()).blocks, [])
})

// ─── inline content-block node rendering ──────────────────────────────

test('keyTakeaways node renders a labelled list', () => {
  const html = renderRichTextToHtml(doc({ type: 'keyTakeaways', content: [list('First')] }))
  assert.match(html, /^<div class="pilotiq-key-takeaways"><div class="pilotiq-block-label">Key takeaways<\/div>/)
  assert.match(html, /<li><p>First<\/p><\/li>/)
})

test('summary node renders a labelled body', () => {
  const html = renderRichTextToHtml(doc({ type: 'summary', content: [para('The gist.')] }))
  assert.match(html, /pilotiq-summary"><div class="pilotiq-block-label">Summary</)
  assert.match(html, /The gist\./)
})

test('faq node renders structured Q/A items with Q/A markers', () => {
  const html = renderRichTextToHtml(
    doc({
      type: 'faq',
      content: [
        {
          type: 'faqItem',
          content: [
            { type: 'faqQuestion', content: [{ type: 'text', text: 'Is it strong?' }] },
            { type: 'faqAnswer', content: [para('Yes.')] },
          ],
        },
      ],
    }),
  )
  assert.match(html, /pilotiq-faq"><div class="pilotiq-block-label">FAQ</)
  assert.match(html, /pilotiq-faq-question"><span class="pilotiq-faq-marker">Q<\/span><span class="pilotiq-faq-text">Is it strong\?</)
  assert.match(html, /pilotiq-faq-answer"><span class="pilotiq-faq-marker">A<\/span><div class="pilotiq-faq-body"><p>Yes\.<\/p>/)
})

test('alert node renders icon + editable title + description, defaulting unknown types to info', () => {
  const warn = renderRichTextToHtml(doc({
    type: 'alert', attrs: { type: 'warning' },
    content: [
      { type: 'alertTitle', content: [{ type: 'text', text: 'Heads up' }] },
      { type: 'alertBody',  content: [para('Careful')] },
    ],
  }))
  assert.match(warn, /class="pilotiq-alert pilotiq-alert-warning" data-alert-type="warning"/)
  assert.match(warn, /<span class="pilotiq-alert-icon"[^>]*><svg /)
  assert.match(warn, /<div class="pilotiq-alert-title">Heads up<\/div>/)
  assert.match(warn, /<div class="pilotiq-alert-description"><p>Careful<\/p><\/div>/)

  // Title falls back to the variant label when the alertTitle child is absent.
  const noTitle = renderRichTextToHtml(doc({ type: 'alert', attrs: { type: 'success' }, content: [{ type: 'alertBody', content: [para('Done')] }] }))
  assert.match(noTitle, /<div class="pilotiq-alert-title">Success<\/div>/)

  // Unknown variant → info.
  const bad = renderRichTextToHtml(doc({ type: 'alert', attrs: { type: 'nope' }, content: [{ type: 'alertBody', content: [para('x')] }] }))
  assert.match(bad, /pilotiq-alert-info/)
})

test('alert node renders a chosen icon + custom-variant color', () => {
  const html = renderRichTextToHtml(doc({
    type: 'alert', attrs: { type: 'custom', icon: 'rocket', color: '#3b82f6' },
    content: [
      { type: 'alertTitle', content: [{ type: 'text', text: 'Launch' }] },
      { type: 'alertBody',  content: [para('Go')] },
    ],
  }))
  assert.match(html, /pilotiq-alert pilotiq-alert-custom/)
  assert.match(html, /M4\.5 16\.5c/)                          // rocket icon path
  assert.match(html, /border-color:color-mix\(in srgb,#3b82f6 35%/) // tinted box
  assert.match(html, /<span class="pilotiq-alert-icon"[^>]*style="color:#3b82f6"/)
})

test('alert node drops an unsafe custom color (injection guard)', () => {
  const html = renderRichTextToHtml(doc({
    type: 'alert', attrs: { type: 'custom', color: 'red"><script>alert(1)</script>' },
    content: [{ type: 'alertBody', content: [para('x')] }],
  }))
  assert.doesNotMatch(html, /<script>/)
  assert.doesNotMatch(html, /color-mix/)
})

test('alert node renders a sanitized custom SVG icon, stripping scripts', () => {
  const html = renderRichTextToHtml(doc({
    type: 'alert', attrs: { type: 'info', iconSvg: '<svg><script>alert(1)</script><path d="M2 2h4"/></svg>' },
    content: [{ type: 'alertBody', content: [para('x')] }],
  }))
  assert.match(html, /<span class="pilotiq-alert-icon"[^>]*><svg><path d="M2 2h4" \/><\/svg><\/span>/)
  assert.doesNotMatch(html, /<script>/)
})

test('prosCons node renders two labelled columns', () => {
  const html = renderRichTextToHtml(
    doc({
      type: 'prosCons',
      content: [
        { type: 'prosColumn', content: [list('Good')] },
        { type: 'consColumn', content: [list('Bad')] },
      ],
    }),
  )
  assert.match(html, /^<div class="pilotiq-pros-cons">/)
  assert.match(html, /pilotiq-pros"><div class="pilotiq-block-label">Pros<\/div>.*Good/s)
  assert.match(html, /pilotiq-cons"><div class="pilotiq-block-label">Cons<\/div>.*Bad/s)
})

test('inline-block body content is HTML-escaped', () => {
  const html = renderRichTextToHtml(doc({ type: 'summary', content: [para('<script>x</script>')] }))
  assert.doesNotMatch(html, /<script>/)
  assert.match(html, /&lt;script&gt;/)
})
