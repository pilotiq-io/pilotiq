import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import type { Extension } from '@codemirror/state'

import {
  registerCodeLanguage,
  getCodeLanguage,
  listCodeLanguages,
  type CodeLanguageFactory,
} from './languageRegistry.js'

// The registry is module-level state shared across tests in this file —
// each test cleans up after itself with a sentinel id to avoid bleed.

describe('registerCodeLanguage', () => {
  beforeEach(() => {
    // Wipe any sentinel ids prior tests left behind.
    for (const id of listCodeLanguages()) {
      if (id.startsWith('__test__')) {
        registerCodeLanguage(id, (() => []) as CodeLanguageFactory)
      }
    }
  })

  it('round-trips a factory under its id', () => {
    const sentinel: Extension = []
    const factory: CodeLanguageFactory = () => sentinel

    registerCodeLanguage('__test__a', factory)

    const got = getCodeLanguage('__test__a')
    assert.equal(typeof got, 'function')
    assert.equal(got!(), sentinel)
  })

  it('returns undefined for unknown ids', () => {
    assert.equal(getCodeLanguage('__test__nope'), undefined)
  })

  it('overwrites silently on re-register (HMR-friendly)', () => {
    const first:  CodeLanguageFactory = () => 'first'  as unknown as Extension
    const second: CodeLanguageFactory = () => 'second' as unknown as Extension

    registerCodeLanguage('__test__b', first)
    assert.equal(getCodeLanguage('__test__b')!(), 'first')

    registerCodeLanguage('__test__b', second)
    assert.equal(getCodeLanguage('__test__b')!(), 'second')
  })

  it('listCodeLanguages reports every registered id', () => {
    registerCodeLanguage('__test__c', (() => []) as CodeLanguageFactory)
    assert.ok(listCodeLanguages().includes('__test__c'))
  })
})
