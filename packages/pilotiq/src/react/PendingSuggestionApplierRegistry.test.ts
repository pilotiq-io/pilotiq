import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import {
  registerPendingSuggestionApplier,
  getPendingSuggestionApplier,
  _clearAppliersForTests,
} from './PendingSuggestionApplierRegistry.js'

describe('PendingSuggestionApplierRegistry', () => {
  beforeEach(() => { _clearAppliersForTests() })

  it('returns the scoped applier when both formId and fieldName match', () => {
    const apply = (): void => {}
    registerPendingSuggestionApplier('form-1', 'bio', apply)
    assert.equal(getPendingSuggestionApplier('form-1', 'bio'), apply)
  })

  it('routes scoped lookups to the matching scoped entry across multi-form pages', () => {
    // Two editors in two forms register under the same field name but
    // different formIds — the routing has to disambiguate.
    const applyA = (): void => {}
    const applyB = (): void => {}
    registerPendingSuggestionApplier('form-A', 'summary', applyA)
    registerPendingSuggestionApplier('form-B', 'summary', applyB)
    assert.equal(getPendingSuggestionApplier('form-A', 'summary'), applyA)
    assert.equal(getPendingSuggestionApplier('form-B', 'summary'), applyB)
  })

  it('falls through to the wildcard slot when no scoped match exists', () => {
    const wild = (): void => {}
    registerPendingSuggestionApplier(undefined, 'bio', wild)
    // formId provided but the registry only has a wildcard entry —
    // the lookup should still resolve so historic single-form pages keep
    // working even when consumers thread a formId.
    assert.equal(getPendingSuggestionApplier('form-1', 'bio'), wild)
  })

  it('global producer + scoped consumer: undefined-formId lookup finds the scoped entry', () => {
    // Regression guard for the multi-form fix: after threading `formId`
    // through the Tiptap adapter hooks, every editor registers scoped
    // by its surrounding `FormRenderer`'s id. A global producer (no
    // `formId` stamped on the suggestion) calls
    // `getPendingSuggestionApplier(undefined, fieldName)` — without the
    // fallback, the wildcard slot is empty and the suggestion silently
    // never applies. The fallback returns any matching scoped entry.
    const scopedApply = (): void => {}
    registerPendingSuggestionApplier('form-edit', 'bio', scopedApply)
    assert.equal(getPendingSuggestionApplier(undefined, 'bio'), scopedApply)
  })

  it('global lookup prefers the explicit wildcard slot over scoped fallback', () => {
    const wild = (): void => {}
    const scoped = (): void => {}
    registerPendingSuggestionApplier('form-edit', 'bio', scoped)
    registerPendingSuggestionApplier(undefined,    'bio', wild)
    // Wildcard wins — it was the intent of the original API ("formId
    // defaults to '*'") and a deliberately-registered wildcard applier
    // is presumed authoritative.
    assert.equal(getPendingSuggestionApplier(undefined, 'bio'), wild)
  })

  it('scoped lookup prefers exact match over wildcard slot', () => {
    const wild = (): void => {}
    const scoped = (): void => {}
    registerPendingSuggestionApplier(undefined,   'bio', wild)
    registerPendingSuggestionApplier('form-edit', 'bio', scoped)
    assert.equal(getPendingSuggestionApplier('form-edit', 'bio'), scoped)
  })

  it('returns undefined when no entry matches the fieldName at all', () => {
    registerPendingSuggestionApplier('form-A', 'bio', () => {})
    assert.equal(getPendingSuggestionApplier('form-A', 'subtitle'), undefined)
    assert.equal(getPendingSuggestionApplier(undefined, 'subtitle'), undefined)
  })

  it('unregister cleanup drops the entry', () => {
    const apply = (): void => {}
    const unregister = registerPendingSuggestionApplier('form-1', 'bio', apply)
    assert.equal(getPendingSuggestionApplier('form-1', 'bio'), apply)
    unregister()
    assert.equal(getPendingSuggestionApplier('form-1', 'bio'), undefined)
  })

  it('re-registering replaces the previous entry and its unregister no-ops', () => {
    const first  = (): void => {}
    const second = (): void => {}
    const off1 = registerPendingSuggestionApplier('form-1', 'bio', first)
    registerPendingSuggestionApplier('form-1', 'bio', second) // wins
    assert.equal(getPendingSuggestionApplier('form-1', 'bio'), second)
    // First's unregister must NOT delete the second's entry — the
    // registry tracks identity to defend against unmount-after-remount
    // racing the cleanup of the just-replaced entry.
    off1()
    assert.equal(getPendingSuggestionApplier('form-1', 'bio'), second)
  })
})
