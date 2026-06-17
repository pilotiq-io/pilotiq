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

test('keyTakeaways node is labelless — content-only (the heading sits above as an <h2>)', () => {
  const html = renderRichTextToHtml(doc({ type: 'keyTakeaways', content: [list('First')] }))
  assert.match(html, /^<div class="pilotiq-key-takeaways"><div class="pilotiq-block-content"><div class="pilotiq-block-body">/)
  assert.doesNotMatch(html, /pilotiq-block-label/)
  assert.match(html, /<li><p>First<\/p><\/li>/)
})

test('summary node is labelless — content-only body (the heading sits above as an <h2>)', () => {
  const html = renderRichTextToHtml(doc({ type: 'summary', content: [para('The gist.')] }))
  assert.match(html, /pilotiq-summary"><div class="pilotiq-block-content"><div class="pilotiq-block-body">/)
  assert.doesNotMatch(html, /pilotiq-block-label/)
  assert.match(html, /The gist\./)
})

test('labelled blocks emit data-width only when set to full', () => {
  const contained = renderRichTextToHtml(doc({ type: 'summary', content: [para('x')] }))
  assert.doesNotMatch(contained, /data-width/)
  const full = renderRichTextToHtml(doc({ type: 'summary', attrs: { width: 'full' }, content: [para('x')] }))
  assert.match(full, /^<div class="pilotiq-summary" data-width="full"><div class="pilotiq-block-content">/)
})

test('faq node renders a native <details> accordion, honoring the open attr', () => {
  const html = renderRichTextToHtml(
    doc({
      type: 'faq',
      content: [
        {
          type: 'faqItem', // default open
          content: [
            { type: 'faqQuestion', content: [{ type: 'text', text: 'Is it strong?' }] },
            { type: 'faqAnswer', content: [para('Yes.')] },
          ],
        },
        {
          type: 'faqItem', attrs: { open: false },
          content: [
            { type: 'faqQuestion', content: [{ type: 'text', text: 'Collapsed?' }] },
            { type: 'faqAnswer', content: [para('This one starts closed.')] },
          ],
        },
      ],
    }),
  )
  assert.match(html, /^<div class="pilotiq-faq">/)
  assert.match(html, /<details class="pilotiq-faq-item" open><summary class="pilotiq-faq-question">Is it strong\?<\/summary><div class="pilotiq-faq-answer"><p>Yes\.<\/p><\/div><\/details>/)
  // open:false → no `open` attribute on the <details>
  assert.match(html, /<details class="pilotiq-faq-item"><summary class="pilotiq-faq-question">Collapsed\?</)
})

test('faq node emits data-width only when set to full', () => {
  const item = { type: 'faqItem', content: [{ type: 'faqQuestion', content: [{ type: 'text', text: 'Q' }] }, { type: 'faqAnswer', content: [para('A')] }] }
  const contained = renderRichTextToHtml(doc({ type: 'faq', content: [item] }))
  assert.match(contained, /^<div class="pilotiq-faq">/) // no data-width
  const full = renderRichTextToHtml(doc({ type: 'faq', attrs: { width: 'full' }, content: [item] }))
  assert.match(full, /^<div class="pilotiq-faq" data-width="full">/)
})

test('alert node renders icon + editable title + description, defaulting unknown types to info', () => {
  const warn = renderRichTextToHtml(doc({
    type: 'alert', attrs: { type: 'warning' },
    content: [
      { type: 'alertTitle', content: [{ type: 'text', text: 'Heads up' }] },
      { type: 'alertBody',  content: [para('Careful')] },
    ],
  }))
  assert.match(warn, /<div class="pilotiq-alert" data-alert-type="warning">/)
  assert.match(warn, /<div class="pilotiq-alert-box pilotiq-alert-warning" role="note">/)
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

test('alert node emits data-width only when set to full', () => {
  const body = { type: 'alertBody', content: [para('x')] }
  const contained = renderRichTextToHtml(doc({ type: 'alert', attrs: { type: 'info' }, content: [body] }))
  assert.doesNotMatch(contained, /data-width/)
  const full = renderRichTextToHtml(doc({ type: 'alert', attrs: { type: 'info', width: 'full' }, content: [body] }))
  assert.match(full, /data-alert-type="info" data-width="full"/)
})

test('alert node renders a chosen icon + custom-variant color', () => {
  const html = renderRichTextToHtml(doc({
    type: 'alert', attrs: { type: 'custom', icon: 'rocket', color: '#3b82f6' },
    content: [
      { type: 'alertTitle', content: [{ type: 'text', text: 'Launch' }] },
      { type: 'alertBody',  content: [para('Go')] },
    ],
  }))
  assert.match(html, /pilotiq-alert-box pilotiq-alert-custom/)
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
  assert.match(html, /^<div class="pilotiq-pros-cons"><div class="pilotiq-pros-cons-content">/)
  assert.match(html, /pilotiq-pros"><div class="pilotiq-block-label">Pros<\/div>.*Good/s)
  assert.match(html, /pilotiq-cons"><div class="pilotiq-block-label">Cons<\/div>.*Bad/s)
})

test('prosCons node emits data-width only when set to full', () => {
  const cols = [
    { type: 'prosColumn', content: [para('g')] },
    { type: 'consColumn', content: [para('b')] },
  ]
  const contained = renderRichTextToHtml(doc({ type: 'prosCons', content: cols }))
  assert.doesNotMatch(contained, /data-width/)
  const full = renderRichTextToHtml(doc({ type: 'prosCons', attrs: { width: 'full' }, content: cols }))
  assert.match(full, /^<div class="pilotiq-pros-cons" data-width="full"><div class="pilotiq-pros-cons-content">/)
})

test('inline-block body content is HTML-escaped', () => {
  const html = renderRichTextToHtml(doc({ type: 'summary', content: [para('<script>x</script>')] }))
  assert.doesNotMatch(html, /<script>/)
  assert.match(html, /&lt;script&gt;/)
})
