import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { resolveSchema, _resetResolverRegistry } from './resolveSchema.js'
import { MetaTag }   from './MetaTag.js'
import { LinkTag }   from './LinkTag.js'
import { ScriptTag } from './ScriptTag.js'
import { StyleTag }  from './StyleTag.js'

beforeEach(() => _resetResolverRegistry())

describe('MetaTag head element', () => {
  it('emits name + content', async () => {
    const out = await resolveSchema([MetaTag.make({ name: 'csrf-token', content: 'abc' })])
    assert.equal(out[0]!.type,        'meta')
    assert.equal(out[0]!['name'],     'csrf-token')
    assert.equal(out[0]!['content'],  'abc')
    assert.equal(out[0]!['property'], undefined)
  })

  it('emits property + content (Open Graph shape)', async () => {
    const out = await resolveSchema([MetaTag.make({ property: 'og:image', content: 'https://x/y.png' })])
    assert.equal(out[0]!['property'], 'og:image')
    assert.equal(out[0]!['content'],  'https://x/y.png')
  })

  it('emits httpEquiv + charset', async () => {
    const out = await resolveSchema([
      MetaTag.make({ httpEquiv: 'X-UA-Compatible', content: 'IE=edge' }),
      MetaTag.make({ charset: 'utf-8' }),
    ])
    assert.equal(out[0]!['httpEquiv'], 'X-UA-Compatible')
    assert.equal(out[1]!['charset'],   'utf-8')
  })

  it('honors layout-level visibility', async () => {
    const tree = [
      MetaTag.make({ name: 'env', content: 'prod' }).visible(({ user }) => Boolean(user)),
      MetaTag.make({ name: 'env', content: 'guest' }).visible(({ user }) => !user),
    ]
    const out = await resolveSchema(tree, {})  // no user
    assert.equal(out.length, 1)
    assert.equal(out[0]!['content'], 'guest')
  })
})

describe('LinkTag head element', () => {
  it('emits rel + href + mimeType', async () => {
    const out = await resolveSchema([
      LinkTag.make({ rel: 'icon', href: '/favicon.svg', mimeType: 'image/svg+xml' }),
    ])
    assert.equal(out[0]!.type,         'link')
    assert.equal(out[0]!['rel'],       'icon')
    assert.equal(out[0]!['href'],      '/favicon.svg')
    assert.equal(out[0]!['mimeType'],  'image/svg+xml')
  })

  it('emits canonical link', async () => {
    const out = await resolveSchema([
      LinkTag.make({ rel: 'canonical', href: 'https://app.example.com/dashboard' }),
    ])
    assert.equal(out[0]!['rel'],  'canonical')
    assert.equal(out[0]!['href'], 'https://app.example.com/dashboard')
  })

  it('rides extra attrs (sizes / integrity / crossOrigin)', async () => {
    const out = await resolveSchema([
      LinkTag.make({
        rel: 'preload',
        href: '/fonts/x.woff2',
        as: 'font',
        mimeType: 'font/woff2',
        crossOrigin: 'anonymous',
      }),
    ])
    assert.equal(out[0]!['as'],          'font')
    assert.equal(out[0]!['crossOrigin'], 'anonymous')
  })
})

describe('ScriptTag head element', () => {
  it('emits external src + defer + dataAttributes', async () => {
    const out = await resolveSchema([
      ScriptTag.make({
        src: 'https://plausible.io/js/script.js',
        defer: true,
        dataAttributes: { domain: 'example.com', api: '/proxy/event' },
      }),
    ])
    assert.equal(out[0]!.type,           'script')
    assert.equal(out[0]!['src'],         'https://plausible.io/js/script.js')
    assert.equal(out[0]!['defer'],       true)
    assert.deepEqual(out[0]!['dataAttributes'], { domain: 'example.com', api: '/proxy/event' })
  })

  it('emits inline body for window-globals', async () => {
    const out = await resolveSchema([
      ScriptTag.make({ body: 'window.__APP_TENANT__ = "acme"' }),
    ])
    assert.equal(out[0]!['body'], 'window.__APP_TENANT__ = "acme"')
    assert.equal(out[0]!['src'],  undefined)
  })

  it('emits async + nonce + integrity', async () => {
    const out = await resolveSchema([
      ScriptTag.make({
        src: 'https://x/y.js',
        async: true,
        nonce: 'abc123',
        integrity: 'sha384-xxx',
        crossOrigin: 'anonymous',
      }),
    ])
    assert.equal(out[0]!['async'],       true)
    assert.equal(out[0]!['nonce'],       'abc123')
    assert.equal(out[0]!['integrity'],   'sha384-xxx')
    assert.equal(out[0]!['crossOrigin'], 'anonymous')
  })
})

describe('StyleTag head element', () => {
  it('emits inline css', async () => {
    const css = ':root { --pilotiq-brand: #d97757; }'
    const out = await resolveSchema([StyleTag.make(css)])
    assert.equal(out[0]!.type,   'style')
    assert.equal(out[0]!['css'], css)
    assert.equal(out[0]!['nonce'], undefined)
  })

  it('emits nonce when supplied', async () => {
    const out = await resolveSchema([StyleTag.make('body { color: red }', { nonce: 'n1' })])
    assert.equal(out[0]!['nonce'], 'n1')
  })
})
