import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { resolveSchema, _resetResolverRegistry } from './resolveSchema.js'
import { Image } from './Image.js'
import { Icon } from './Icon.js'
import { Text } from './Text.js'
import { Markdown } from './Markdown.js'
import { Html } from './Html.js'
import { UnorderedList } from './UnorderedList.js'

beforeEach(() => _resetResolverRegistry())

describe('Image prime', () => {
  it('serializes url + defaults', async () => {
    const tree = [Image.make('https://cdn.example.com/avatar.png')]
    const out = await resolveSchema(tree)
    assert.equal(out[0]!.type,  'image')
    assert.equal(out[0]!['url'],   'https://cdn.example.com/avatar.png')
    assert.equal(out[0]!['alt'],   '')
    assert.equal(out[0]!['shape'], 'square')
    assert.equal(out[0]!['width'],  undefined)
    assert.equal(out[0]!['height'], undefined)
  })

  it('honors alt / width / height / circle', async () => {
    const tree = [Image.make('a.png').alt('avatar').width(64).height(48).circle()]
    const out = await resolveSchema(tree)
    assert.equal(out[0]!['alt'],    'avatar')
    assert.equal(out[0]!['width'],  64)
    assert.equal(out[0]!['height'], 48)
    assert.equal(out[0]!['shape'],  'circle')
  })

  it('size() sugar fills both dimensions', async () => {
    const tree = [Image.make('a.png').size(40)]
    const out = await resolveSchema(tree)
    assert.equal(out[0]!['width'],  40)
    assert.equal(out[0]!['height'], 40)
  })

  it('rounded() sets shape', async () => {
    const tree = [Image.make('a.png').rounded()]
    const out = await resolveSchema(tree)
    assert.equal(out[0]!['shape'], 'rounded')
  })
})

describe('Icon prime', () => {
  it('serializes name + defaults', async () => {
    const tree = [Icon.make('check')]
    const out = await resolveSchema(tree)
    assert.equal(out[0]!.type,  'icon')
    assert.equal(out[0]!['name'],  'check')
    assert.equal(out[0]!['size'],  16)
    assert.equal(out[0]!['color'], 'default')
    assert.equal(out[0]!['label'], undefined)
  })

  it('honors size / color / label', async () => {
    const tree = [Icon.make('check').size(24).color('success').label('Done')]
    const out = await resolveSchema(tree)
    assert.equal(out[0]!['size'],  24)
    assert.equal(out[0]!['color'], 'success')
    assert.equal(out[0]!['label'], 'Done')
  })
})

describe('Text formatting setters', () => {
  it('plain Text emits no formatting keys', async () => {
    const tree = [Text.make('hello')]
    const out = await resolveSchema(tree)
    assert.equal(out[0]!.type,    'text')
    assert.equal(out[0]!['content'], 'hello')
    assert.equal(out[0]!['color'],   undefined)
    assert.equal(out[0]!['size'],    undefined)
    assert.equal(out[0]!['weight'],  undefined)
    assert.equal(out[0]!['badge'],   undefined)
  })

  it('color / size / weight ride through', async () => {
    const tree = [Text.make('hi').color('success').size('lg').weight('semibold')]
    const out = await resolveSchema(tree)
    assert.equal(out[0]!['color'],  'success')
    assert.equal(out[0]!['size'],   'lg')
    assert.equal(out[0]!['weight'], 'semibold')
  })

  it('badge() flips on the pill rendering flag', async () => {
    const tree = [Text.make('Active').badge()]
    const out = await resolveSchema(tree)
    assert.equal(out[0]!['badge'], true)
    assert.equal(out[0]!['badgeColor'], undefined)
  })

  it('badgeColor() implies badge=true', async () => {
    const tree = [Text.make('Pending').badgeColor('warning')]
    const out = await resolveSchema(tree)
    assert.equal(out[0]!['badge'],      true)
    assert.equal(out[0]!['badgeColor'], 'warning')
  })

  it('badge(false) disables the flag', async () => {
    const tree = [Text.make('hi').badge(false)]
    const out = await resolveSchema(tree)
    assert.equal(out[0]!['badge'], undefined)
  })
})

describe('Markdown prime', () => {
  it('serializes converted html + defaults', async () => {
    const tree = [Markdown.make('# hi\n\n**bold**')]
    const out = await resolveSchema(tree)
    assert.equal(out[0]!.type, 'markdown')
    const html = String(out[0]!['html'])
    assert.match(html, /<h1[^>]*>hi<\/h1>/)
    assert.match(html, /<strong>bold<\/strong>/)
    assert.equal(out[0]!['prose'], true)
    assert.equal(out[0]!['size'],  undefined)
  })

  it('prose(false) disables the typographic wrapper flag', async () => {
    const tree = [Markdown.make('hi').prose(false)]
    const out = await resolveSchema(tree)
    assert.equal(out[0]!['prose'], false)
  })

  it('size() flows through', async () => {
    const tree = [Markdown.make('hi').size('lg')]
    const out = await resolveSchema(tree)
    assert.equal(out[0]!['size'], 'lg')
  })

  it('breaks() converts single line breaks to <br>', async () => {
    const tree = [Markdown.make('one\ntwo').breaks()]
    const out = await resolveSchema(tree)
    assert.match(String(out[0]!['html']), /<br/)
  })

  it('default (breaks=false) joins single line breaks', async () => {
    const tree = [Markdown.make('one\ntwo')]
    const out = await resolveSchema(tree)
    assert.doesNotMatch(String(out[0]!['html']), /<br/)
  })

  it('sanitizes <script> tags by default', async () => {
    const tree = [Markdown.make('hi\n\n<script>alert(1)</script>')]
    const out  = await resolveSchema(tree)
    const html = String(out[0]!['html'])
    assert.doesNotMatch(html, /<script/i)
    assert.doesNotMatch(html, /alert\(1\)/)
  })

  it('strips javascript: hrefs by default', async () => {
    const tree = [Markdown.make('[evil](javascript:alert(1))')]
    const out  = await resolveSchema(tree)
    const html = String(out[0]!['html'])
    assert.doesNotMatch(html, /javascript:/i)
  })

  it('allowRaw() preserves <script> for trusted sources', async () => {
    const tree = [Markdown.make('hi\n\n<script>alert(1)</script>').allowRaw()]
    const out  = await resolveSchema(tree)
    const html = String(out[0]!['html'])
    assert.match(html, /<script>alert\(1\)<\/script>/)
  })

  it('sanitize(false) is the explicit opt-out form', async () => {
    const tree = [Markdown.make('<script>x</script>').sanitize(false)]
    const out  = await resolveSchema(tree)
    assert.match(String(out[0]!['html']), /<script>x<\/script>/)
  })

  it('sanitize({ config }) widens the allowlist for trusted CMS HTML', async () => {
    const tree = [
      Markdown.make('<iframe src="https://x.test/embed"></iframe>')
        .sanitize({ allowedTags: ['iframe'], allowedAttributes: { iframe: ['src'] } }),
    ]
    const out  = await resolveSchema(tree)
    const html = String(out[0]!['html'])
    assert.match(html, /<iframe src="https:\/\/x\.test\/embed"><\/iframe>/)
  })
})

describe('Html prime', () => {
  it('passes safe html through after default sanitization', async () => {
    const tree = [Html.make('<p>hi <em>there</em></p>')]
    const out = await resolveSchema(tree)
    assert.equal(out[0]!.type, 'html')
    assert.equal(out[0]!['html'], '<p>hi <em>there</em></p>')
    assert.equal(out[0]!['prose'], true)
  })

  it('prose(false) flips the wrapper flag off', async () => {
    const tree = [Html.make('<p>hi</p>').prose(false)]
    const out = await resolveSchema(tree)
    assert.equal(out[0]!['prose'], false)
  })

  it('size() flows through', async () => {
    const tree = [Html.make('<p>hi</p>').size('sm')]
    const out = await resolveSchema(tree)
    assert.equal(out[0]!['size'], 'sm')
  })

  it('strips <script> by default', async () => {
    const tree = [Html.make('<p>ok</p><script>steal()</script>')]
    const out  = await resolveSchema(tree)
    const html = String(out[0]!['html'])
    assert.doesNotMatch(html, /<script/i)
    assert.doesNotMatch(html, /steal\(\)/)
    assert.match(html, /<p>ok<\/p>/)
  })

  it('strips inline event handlers by default', async () => {
    const tree = [Html.make('<a href="https://ok" onclick="x()">link</a>')]
    const out  = await resolveSchema(tree)
    const html = String(out[0]!['html'])
    assert.doesNotMatch(html, /onclick/i)
    assert.match(html, /href="https:\/\/ok"/)
  })

  it('allowRaw() preserves <script>', async () => {
    const tree = [Html.make('<script>raw</script>').allowRaw()]
    const out  = await resolveSchema(tree)
    assert.equal(out[0]!['html'], '<script>raw</script>')
  })

  it('custom config widens the allowlist', async () => {
    const tree = [
      Html.make('<iframe src="https://x.test"></iframe>')
        .sanitize({ allowedTags: ['iframe'], allowedAttributes: { iframe: ['src'] } }),
    ]
    const out = await resolveSchema(tree)
    assert.equal(out[0]!['html'], '<iframe src="https://x.test"></iframe>')
  })
})

describe('UnorderedList prime', () => {
  it('serializes items array + defaults', async () => {
    const tree = [UnorderedList.make(['one', 'two', 'three'])]
    const out  = await resolveSchema(tree)
    assert.equal(out[0]!.type, 'unorderedList')
    assert.deepEqual(out[0]!['items'], ['one', 'two', 'three'])
    assert.equal(out[0]!['color'],  undefined)
    assert.equal(out[0]!['size'],   undefined)
    assert.equal(out[0]!['weight'], undefined)
  })

  it('items() replaces the list', async () => {
    const tree = [UnorderedList.make(['old']).items(['a', 'b'])]
    const out  = await resolveSchema(tree)
    assert.deepEqual(out[0]!['items'], ['a', 'b'])
  })

  it('make() with no args yields an empty list', async () => {
    const tree = [UnorderedList.make()]
    const out  = await resolveSchema(tree)
    assert.deepEqual(out[0]!['items'], [])
  })

  it('color / size / weight flow through', async () => {
    const tree = [UnorderedList.make(['x']).color('muted').size('lg').weight('semibold')]
    const out  = await resolveSchema(tree)
    assert.equal(out[0]!['color'],  'muted')
    assert.equal(out[0]!['size'],   'lg')
    assert.equal(out[0]!['weight'], 'semibold')
  })
})
