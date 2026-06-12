import { test } from 'node:test'
import assert from 'node:assert/strict'
import MarkdownIt from 'markdown-it'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'

import { Markdown } from '../markdownExtension.js'
import {
  Alert,
  AlertTitle,
  AlertBody,
  parseDirectiveAttrs,
  setupAlertDirective,
} from './contentBlocks.js'

// ── markdown-it layer ───────────────────────────────────────────────────────
// A markdown-it instance with the Alert directive registered — mirrors what
// `tiptap-markdown` wires up via `Alert.storage.markdown.parse.setup`.
function md(): MarkdownIt {
  const instance = new MarkdownIt()
  setupAlertDirective(instance)
  return instance
}

test('parseDirectiveAttrs reads key=value pairs from the info string', () => {
  assert.deepEqual(parseDirectiveAttrs('alert{type=warning}'), { type: 'warning' })
  assert.deepEqual(parseDirectiveAttrs('alert{type="success"}'), { type: 'success' })
  assert.deepEqual(parseDirectiveAttrs('alert{type=info foo=bar}'), { type: 'info', foo: 'bar' })
  assert.deepEqual(parseDirectiveAttrs('alert'), {})
})

test('parse: directive renders the alert / title / body wire HTML', () => {
  const html = md().render(':::alert{type=warning} Heads up\nBe careful.\n:::')
  // The exact shapes Alert / AlertTitle / AlertBody parseHTML key off.
  assert.match(html, /<div data-type="alert" class="pilotiq-alert pilotiq-alert-warning" data-alert-type="warning">/)
  assert.match(html, /<div data-type="alertTitle" class="pilotiq-alert-title">Heads up<\/div>/)
  assert.match(html, /<div data-type="alertBody" class="pilotiq-alert-description">/)
  assert.match(html, /Be careful\./)
})

test('parse: title is optional (empty title div when omitted)', () => {
  const html = md().render(':::alert{type=info}\njust body\n:::')
  assert.match(html, /<div data-type="alertTitle" class="pilotiq-alert-title"><\/div>/)
  assert.match(html, /just body/)
})

test('parse: title HTML is escaped', () => {
  const html = md().render(':::alert{type=info} <script>x\nbody\n:::')
  assert.match(html, /pilotiq-alert-title">&lt;script&gt;x</)
})

test('parse: unknown / missing type falls back to info', () => {
  const html = md().render(':::alert{type=bogus}\nx\n:::')
  assert.match(html, /pilotiq-alert-info/)
  assert.match(html, /data-alert-type="info"/)
})

test('parse: a plain paragraph is untouched by the rule', () => {
  assert.equal(md().render('just text').trim(), '<p>just text</p>')
})

// ── editor round-trip (real tiptap-markdown pipeline, jsdom) ─────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function editor(content?: string): any {
  return new Editor({
    element:    window.document.createElement('div'),
    extensions: [StarterKit, Markdown.configure({ html: false }), Alert, AlertTitle, AlertBody],
    content:    content ?? '',
  })
}

test('round-trip: markdown `:::alert{…} Title` → alert node with title + body', () => {
  const ed = editor(':::alert{type=warning} Heads up\nBe careful.\n:::')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc = ed.getJSON() as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const alert = doc.content?.find((n: any) => n.type === 'alert')
  assert.ok(alert, 'expected an alert node')
  assert.equal(alert.attrs.type, 'warning')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const title = alert.content?.find((c: any) => c.type === 'alertTitle')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body  = alert.content?.find((c: any) => c.type === 'alertBody')
  assert.match(JSON.stringify(title), /Heads up/)
  assert.match(JSON.stringify(body), /Be careful/)
  ed.destroy()
})

test('round-trip: alert node → `:::alert{type=…} Title` markdown', () => {
  const ed = editor()
  ed.commands.setContent({
    type:    'doc',
    content: [{
      type:    'alert',
      attrs:   { type: 'success' },
      content: [
        { type: 'alertTitle', content: [{ type: 'text', text: 'Done' }] },
        { type: 'alertBody',  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'All good.' }] }] },
      ],
    }],
  })
  const out = ed.storage.markdown.getMarkdown()
  assert.match(out, /:::alert\{type=success\} Done/)
  assert.match(out, /All good\./)
  ed.destroy()
})

test('round-trip: icon + color ride the directive attrs both ways', () => {
  const ed = editor()
  ed.commands.setContent({
    type:    'doc',
    content: [{
      type:    'alert',
      attrs:   { type: 'custom', icon: 'rocket', color: '#3b82f6' },
      content: [
        { type: 'alertTitle', content: [{ type: 'text', text: 'Launch' }] },
        { type: 'alertBody',  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Go' }] }] },
      ],
    }],
  })
  const out = ed.storage.markdown.getMarkdown()
  assert.match(out, /:::alert\{type=custom icon=rocket color=#3b82f6\} Launch/)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const back = editor(out).getJSON() as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const alert = back.content?.find((n: any) => n.type === 'alert')
  assert.equal(alert.attrs.icon, 'rocket')
  assert.equal(alert.attrs.color, '#3b82f6')
  ed.destroy()
})
