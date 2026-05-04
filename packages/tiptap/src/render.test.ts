import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { renderRichTextToHtml, isRichTextValue, type TiptapNode } from './render.js'

describe('renderRichTextToHtml — empty / fallback inputs', () => {
  it('returns empty string for null / undefined', () => {
    assert.equal(renderRichTextToHtml(null), '')
    assert.equal(renderRichTextToHtml(undefined), '')
  })

  it('returns empty string for unparseable JSON-looking strings', () => {
    assert.equal(renderRichTextToHtml('{not json'), '')
  })

  it('passes raw HTML strings through verbatim', () => {
    const html = '<p>already <strong>HTML</strong></p>'
    assert.equal(renderRichTextToHtml(html), html)
  })

  it('renders an empty doc to empty output', () => {
    assert.equal(renderRichTextToHtml({ type: 'doc', content: [] }), '')
  })
})

describe('renderRichTextToHtml — nodes', () => {
  it('paragraph with a text leaf', () => {
    const doc: TiptapNode = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }],
    }
    assert.equal(renderRichTextToHtml(doc), '<p>Hello</p>')
  })

  it('headings clamp to h1..h6', () => {
    const mk = (level: unknown): TiptapNode => ({
      type: 'doc',
      content: [{ type: 'heading', attrs: { level }, content: [{ type: 'text', text: 'Hi' }] }],
    })
    assert.equal(renderRichTextToHtml(mk(2)), '<h2>Hi</h2>')
    assert.equal(renderRichTextToHtml(mk(0)), '<h1>Hi</h1>')   // clamp low
    assert.equal(renderRichTextToHtml(mk(99)), '<h6>Hi</h6>')  // clamp high
    assert.equal(renderRichTextToHtml(mk('x')), '<h1>Hi</h1>') // non-numeric → 1
  })

  it('paragraph + heading carry textAlign as inline style (skipped for left)', () => {
    const right: TiptapNode = {
      type: 'doc',
      content: [{ type: 'paragraph', attrs: { textAlign: 'right' }, content: [{ type: 'text', text: 'r' }] }],
    }
    assert.equal(renderRichTextToHtml(right), '<p style="text-align: right">r</p>')
    const left: TiptapNode = {
      type: 'doc',
      content: [{ type: 'paragraph', attrs: { textAlign: 'left' }, content: [{ type: 'text', text: 'l' }] }],
    }
    assert.equal(renderRichTextToHtml(left), '<p>l</p>')
  })

  it('blockquote / lists / horizontalRule / hardBreak', () => {
    const doc: TiptapNode = {
      type: 'doc',
      content: [
        { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'q' }] }] },
        { type: 'bulletList',  content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }] }] }] },
        { type: 'orderedList', attrs: { start: 3 }, content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'b' }] }] }] },
        { type: 'horizontalRule' },
        { type: 'paragraph', content: [{ type: 'text', text: 'one' }, { type: 'hardBreak' }, { type: 'text', text: 'two' }] },
      ],
    }
    const html = renderRichTextToHtml(doc)
    assert.match(html, /<blockquote><p>q<\/p><\/blockquote>/)
    assert.match(html, /<ul><li><p>a<\/p><\/li><\/ul>/)
    assert.match(html, /<ol start="3"><li><p>b<\/p><\/li><\/ol>/)
    assert.match(html, /<hr>/)
    assert.match(html, /<p>one<br>two<\/p>/)
  })

  it('codeBlock honors language', () => {
    const doc: TiptapNode = {
      type: 'doc',
      content: [{
        type: 'codeBlock',
        attrs: { language: 'ts' },
        content: [{ type: 'text', text: 'const x = 1;' }],
      }],
    }
    assert.equal(renderRichTextToHtml(doc), '<pre><code class="language-ts">const x = 1;</code></pre>')
  })
})

describe('renderRichTextToHtml — image', () => {
  it('renders src + alt + width/height when present', () => {
    const doc: TiptapNode = {
      type: 'doc',
      content: [{
        type: 'image',
        attrs: { src: 'https://example.com/a.png', alt: 'cat', width: 320, height: 240 },
      }],
    }
    assert.equal(
      renderRichTextToHtml(doc),
      '<img src="https://example.com/a.png" alt="cat" width="320" height="240">',
    )
  })

  it('emits empty alt when alt missing', () => {
    const doc: TiptapNode = {
      type: 'doc',
      content: [{ type: 'image', attrs: { src: '/u/file.png' } }],
    }
    assert.equal(renderRichTextToHtml(doc), '<img src="/u/file.png" alt="">')
  })

  it('drops bad width / non-finite dimensions', () => {
    const doc: TiptapNode = {
      type: 'doc',
      content: [{
        type: 'image',
        attrs: { src: '/x.png', width: 'abc', height: -10 },
      }],
    }
    assert.equal(renderRichTextToHtml(doc), '<img src="/x.png" alt="">')
  })

  it('escapes alt + title attributes', () => {
    const doc: TiptapNode = {
      type: 'doc',
      content: [{
        type: 'image',
        attrs: { src: '/x.png', alt: 'a"b', title: '<script>' },
      }],
    }
    assert.equal(
      renderRichTextToHtml(doc),
      '<img src="/x.png" alt="a&quot;b" title="&lt;script&gt;">',
    )
  })

  it('drops javascript: src entirely (no broken <img>)', () => {
    const doc: TiptapNode = {
      type: 'doc',
      content: [{ type: 'image', attrs: { src: 'javascript:alert(1)' } }],
    }
    assert.equal(renderRichTextToHtml(doc), '')
  })
})

describe('renderRichTextToHtml — marks', () => {
  it('inline marks wrap from innermost to outermost (marks[0] is innermost)', () => {
    const doc: TiptapNode = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{
          type: 'text',
          text: 'x',
          marks: [{ type: 'italic' }, { type: 'bold' }],
        }],
      }],
    }
    assert.equal(renderRichTextToHtml(doc), '<p><strong><em>x</em></strong></p>')
  })

  it('underline / sub / sup / strike / code marks', () => {
    const mk = (mark: string): TiptapNode => ({
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{ type: 'text', text: 't', marks: [{ type: mark }] }],
      }],
    })
    assert.equal(renderRichTextToHtml(mk('underline')),   '<p><u>t</u></p>')
    assert.equal(renderRichTextToHtml(mk('subscript')),   '<p><sub>t</sub></p>')
    assert.equal(renderRichTextToHtml(mk('superscript')), '<p><sup>t</sup></p>')
    assert.equal(renderRichTextToHtml(mk('strike')),      '<p><s>t</s></p>')
    assert.equal(renderRichTextToHtml(mk('code')),        '<p><code>t</code></p>')
  })

  it('link marks emit href + opens-in-new-tab gets rel=noopener', () => {
    const doc: TiptapNode = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{
          type: 'text',
          text: 'click',
          marks: [{ type: 'link', attrs: { href: 'https://example.com', target: '_blank' } }],
        }],
      }],
    }
    assert.equal(
      renderRichTextToHtml(doc),
      '<p><a href="https://example.com" target="_blank" rel="noopener noreferrer">click</a></p>',
    )
  })

  it('javascript: URLs in link marks fall back to "#"', () => {
    const doc: TiptapNode = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{
          type: 'text',
          text: 'pwn',
          marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
        }],
      }],
    }
    assert.equal(renderRichTextToHtml(doc), '<p><a href="#">pwn</a></p>')
  })

  it('textStyle.color / highlight.color sanitize against unsafe values', () => {
    const ok: TiptapNode = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{
          type: 'text', text: 'c',
          marks: [
            { type: 'textStyle', attrs: { color: '#ff0000' } },
            { type: 'highlight', attrs: { color: 'yellow' } },
          ],
        }],
      }],
    }
    assert.equal(
      renderRichTextToHtml(ok),
      '<p><mark style="background-color: yellow"><span style="color: #ff0000">c</span></mark></p>',
    )

    const bad: TiptapNode = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{
          type: 'text', text: 'c',
          marks: [{ type: 'textStyle', attrs: { color: 'expression(alert(1))' } }],
        }],
      }],
    }
    // Unsafe color drops the wrapping span entirely.
    assert.equal(renderRichTextToHtml(bad), '<p>c</p>')
  })
})

describe('renderRichTextToHtml — escaping', () => {
  it('text content escapes HTML metacharacters', () => {
    const doc: TiptapNode = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{ type: 'text', text: '<script>alert("x")</script>' }],
      }],
    }
    assert.equal(
      renderRichTextToHtml(doc),
      '<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</p>',
    )
  })

  it('codeBlock language attribute escapes injection attempts', () => {
    const doc: TiptapNode = {
      type: 'doc',
      content: [{
        type: 'codeBlock',
        attrs: { language: 'a"><script>x' },
        content: [{ type: 'text', text: '' }],
      }],
    }
    assert.match(renderRichTextToHtml(doc), /class="language-a&quot;&gt;&lt;script&gt;x"/)
  })
})

describe('renderRichTextToHtml — custom blocks', () => {
  it('unknown nodes emit a data-type wrapper carrying attrs', () => {
    const doc: TiptapNode = {
      type: 'doc',
      content: [{
        type: 'callout',
        attrs: { tone: 'warning' },
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi' }] }],
      }],
    }
    const html = renderRichTextToHtml(doc)
    assert.match(html, /<div data-type="callout" data-attrs="\{&quot;tone&quot;:&quot;warning&quot;\}"><p>hi<\/p><\/div>/)
  })

  it('renderBlock option overrides the default custom-block fallback', () => {
    const doc: TiptapNode = {
      type: 'doc',
      content: [{ type: 'callout', attrs: { tone: 'info' } }],
    }
    const html = renderRichTextToHtml(doc, {
      renderBlock: (n) => `<aside class="${n.type}">${(n.attrs?.['tone'] ?? '')}</aside>`,
    })
    assert.equal(html, '<aside class="callout">info</aside>')
  })
})

describe('renderRichTextToHtml — string input', () => {
  it('parses a JSON-encoded doc string', () => {
    const json = JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'json' }] }],
    })
    assert.equal(renderRichTextToHtml(json), '<p>json</p>')
  })
})

describe('isRichTextValue', () => {
  it('matches Tiptap doc objects', () => {
    assert.equal(isRichTextValue({ type: 'doc', content: [] }), true)
  })

  it('matches JSON-encoded Tiptap doc strings', () => {
    assert.equal(isRichTextValue('{"type":"doc","content":[]}'), true)
  })

  it('rejects plain strings, raw HTML, arbitrary objects', () => {
    assert.equal(isRichTextValue(null), false)
    assert.equal(isRichTextValue(''), false)
    assert.equal(isRichTextValue('<p>html</p>'), false)
    assert.equal(isRichTextValue({ type: 'paragraph' }), false)
    assert.equal(isRichTextValue({ type: 'doc' }), false) // no content[]
    assert.equal(isRichTextValue({ foo: 'bar' }), false)
    assert.equal(isRichTextValue('{not json'), false)
  })
})
