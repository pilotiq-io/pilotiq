import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { ListTab } from './Tab.js'

describe('ListTab', () => {
  it('toMeta emits type=listTab with name/label/active=false/url defaults', () => {
    const meta = ListTab.make('drafts').label('Drafts').toMeta()
    assert.equal(meta.type,   'listTab')
    assert.equal(meta.name,   'drafts')
    assert.equal(meta.label,  'Drafts')
    assert.equal(meta.active, false)
    assert.equal(meta.url,    '?tab=drafts')
  })

  it('label defaults to capitalized name when not set', () => {
    const meta = ListTab.make('archived').toMeta()
    assert.equal(meta.label, 'Archived')
  })

  it('icon round-trips on the meta', () => {
    const meta = ListTab.make('published').icon('check-circle').toMeta()
    assert.equal(meta.icon, 'check-circle')
  })

  it('static badge round-trips on the meta', () => {
    const meta = ListTab.make('drafts').badge('5').toMeta()
    assert.equal(meta.badge, '5')
  })

  it('badge handler is exposed for parallel resolution; static badge becomes resolved', async () => {
    const tab = ListTab.make('drafts').badge(async () => 7)
    assert.equal(typeof tab.getBadgeHandler(), 'function')
    assert.equal(tab.getStaticBadge(), undefined)
    const v = await tab.getBadgeHandler()!()
    assert.equal(v, 7)
  })

  it('badgeColor round-trips on the meta', () => {
    const meta = ListTab.make('drafts').badge('5').badgeColor('warning').toMeta()
    assert.equal(meta.badgeColor, 'warning')
  })

  it('isDefault flips when default() is called', () => {
    const tab = ListTab.make('all')
    assert.equal(tab.isDefault(), false)
    tab.default()
    assert.equal(tab.isDefault(), true)
  })

  it('modifyQuery / modifyContext round-trip via getQuery / getContextFn', () => {
    const qFn   = ((q: unknown) => q) as never
    const ctxFn = ((c: unknown) => c) as never
    const tab = ListTab.make('drafts').modifyQuery(qFn).modifyContext(ctxFn)
    assert.equal(tab.getQuery(), qFn)
    assert.equal(tab.getContextFn(), ctxFn)
  })

  it('withActive / withResolvedBadge / withUrl populate render-time state', () => {
    const tab = ListTab.make('drafts')
      .withActive()
      .withResolvedBadge('12')
      .withUrl('/admin/articles?tab=drafts')
    const meta = tab.toMeta()
    assert.equal(meta.active, true)
    assert.equal(meta.badge,  '12')
    assert.equal(meta.url,    '/admin/articles?tab=drafts')
  })

  it('withResolvedBadge(undefined) clears a previously-stamped badge', () => {
    const tab = ListTab.make('drafts').badge('static').withResolvedBadge('12')
    assert.equal(tab.toMeta().badge, '12')
    tab.withResolvedBadge(undefined)
    // Falls back to the static badge.
    assert.equal(tab.toMeta().badge, 'static')
  })

  it('isActive reflects withActive state', () => {
    const tab = ListTab.make('drafts')
    assert.equal(tab.isActive(), false)
    tab.withActive()
    assert.equal(tab.isActive(), true)
    tab.withActive(false)
    assert.equal(tab.isActive(), false)
  })

  it('encodes special chars in the default url', () => {
    const meta = ListTab.make('with space').toMeta()
    assert.equal(meta.url, '?tab=with%20space')
  })
})
