import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import {
  registerPanelI18n,
  getPanelI18nResolvers,
  _resetPanelI18nForTests,
} from './registry.js'
import { resolvePanelI18n, _setTestLocale } from './resolve.js'

beforeEach(() => {
  _resetPanelI18nForTests()
  _setTestLocale(undefined) // back to the real soft-import by default
})

afterEach(() => {
  _resetPanelI18nForTests()
  _setTestLocale(undefined)
})

describe('@pilotiq/pilotiq panel-i18n', () => {
  describe('registerPanelI18n', () => {
    it('registers a resolver under a namespace', () => {
      const r = (locale: string) => ({ greeting: locale })
      registerPanelI18n('pilotiq-ai', r)
      assert.equal(getPanelI18nResolvers().get('pilotiq-ai'), r)
    })

    it('re-registering a namespace replaces the resolver', () => {
      registerPanelI18n('ns', () => ({ v: 'first' }))
      registerPanelI18n('ns', () => ({ v: 'second' }))
      assert.deepEqual(getPanelI18nResolvers().get('ns')!('en'), { v: 'second' })
    })

    it('rejects an invalid namespace', () => {
      assert.throws(() => registerPanelI18n('bad name', () => ({})), /invalid namespace/)
      assert.throws(() => registerPanelI18n('', () => ({})), /invalid namespace/)
      assert.throws(() => registerPanelI18n('dots.no', () => ({})), /invalid namespace/)
    })

    it('rejects a non-function resolver', () => {
      // @ts-expect-error — exercising the runtime guard
      assert.throws(() => registerPanelI18n('ns', 'nope'), /must be a function/)
    })
  })

  describe('resolvePanelI18n', () => {
    it('returns undefined when nothing is registered (sparse wire shape)', async () => {
      assert.equal(await resolvePanelI18n(), undefined)
    })

    it('calls each resolver with the active locale and keys by namespace', async () => {
      _setTestLocale('es')
      registerPanelI18n('a', (locale) => ({ hi: `hola-${locale}` }))
      registerPanelI18n('b', (locale) => ({ bye: `adios-${locale}` }))
      assert.deepEqual(await resolvePanelI18n(), {
        a: { hi: 'hola-es' },
        b: { bye: 'adios-es' },
      })
    })

    it('falls back to "en" when localization is absent', async () => {
      _setTestLocale(null) // simulate @rudderjs/localization not installed
      registerPanelI18n('a', (locale) => ({ loc: locale }))
      assert.deepEqual(await resolvePanelI18n(), { a: { loc: 'en' } })
    })

    it('skips a throwing resolver and keeps its siblings', async () => {
      registerPanelI18n('good', () => ({ ok: true }))
      registerPanelI18n('bad', () => {
        throw new Error('boom')
      })
      assert.deepEqual(await resolvePanelI18n(), { good: { ok: true } })
    })

    it('returns undefined when every resolver throws', async () => {
      registerPanelI18n('bad', () => {
        throw new Error('boom')
      })
      assert.equal(await resolvePanelI18n(), undefined)
    })
  })
})
