import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Pilotiq } from '../Pilotiq.js'
import { themeEditor } from './themeEditor.js'
import type { ThemeStorageAdapter } from '../theme/storage.js'

function makeStubAdapter(): ThemeStorageAdapter {
  return {
    async load() { return null },
    async save() { /* noop */ },
    async clear() { /* noop */ },
  }
}

describe('themeEditor() plugin', () => {
  it('bare themeEditor() leaves the storage slot undefined (boot resolves it)', () => {
    const panel = Pilotiq.make('admin').use(themeEditor())
    assert.equal(panel.getConfig().themeEditor, true)
    assert.equal(panel.getThemeStorage(), undefined)
  })

  it('themeEditor({ storage }) stamps the adapter onto the panel', () => {
    const adapter = makeStubAdapter()
    const panel = Pilotiq.make('admin').use(themeEditor({ storage: adapter }))
    assert.equal(panel.getThemeStorage(), adapter)
  })

  it('themeEditor() can be called on multiple panels without leaking adapters', () => {
    const a = makeStubAdapter()
    const b = makeStubAdapter()
    const panelA = Pilotiq.make('admin').use(themeEditor({ storage: a }))
    const panelB = Pilotiq.make('billing').use(themeEditor({ storage: b }))
    assert.equal(panelA.getThemeStorage(), a)
    assert.equal(panelB.getThemeStorage(), b)
  })
})
