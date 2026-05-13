import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Pilotiq } from '../Pilotiq.js'
import { isNavItemActive } from './component-slots.js'

describe('Pilotiq.components({ nav })', () => {
  it('starts empty', () => {
    const panel = Pilotiq.make('Admin')
    assert.deepEqual(panel.getComponentSlots(), {})
  })

  it('stores a registered nav slot', () => {
    const Nav = () => null
    const panel = Pilotiq.make('Admin').components({ nav: Nav })
    const slots = panel.getComponentSlots()
    assert.equal(slots.nav, Nav)
  })

  it('merges across multiple calls — later wins per slot, unset keys preserved', () => {
    const A = () => null
    const B = () => null
    const panel = Pilotiq.make('Admin')
      .components({ nav: A })
      .components({})            // empty object keeps existing
      .components({ nav: B })    // overrides
    assert.equal(panel.getComponentSlots().nav, B)
  })

  it('survives plugin registration without interference', () => {
    const Nav = () => null
    const panel = Pilotiq.make('Admin')
      .components({ nav: Nav })
      .use({ name: 'noop', register() { /* no-op */ } })
    assert.equal(panel.getComponentSlots().nav, Nav)
  })
})

describe('isNavItemActive', () => {
  const basePath = '/admin'

  it('returns false when currentPath is undefined', () => {
    assert.equal(isNavItemActive('/admin/users', undefined, basePath), false)
  })

  it('matches the dashboard URL only on exact equality', () => {
    assert.equal(isNavItemActive(basePath, basePath, basePath), true)
    // Dashboard URL is a prefix of every panel URL; it must NOT light up
    // for non-root pages — otherwise it'd always read as active.
    assert.equal(isNavItemActive(basePath, '/admin/users', basePath), false)
  })

  it('matches non-dashboard URLs on exact equality', () => {
    assert.equal(isNavItemActive('/admin/users', '/admin/users', basePath), true)
  })

  it('matches non-dashboard URLs as a prefix followed by `/`', () => {
    assert.equal(isNavItemActive('/admin/users', '/admin/users/42', basePath), true)
    assert.equal(isNavItemActive('/admin/users', '/admin/users/42/edit', basePath), true)
  })

  it('does NOT match a sibling URL that shares a prefix without `/`', () => {
    // `/admin/users` must not activate when on `/admin/user` (singular).
    assert.equal(isNavItemActive('/admin/user', '/admin/users', basePath), false)
  })
})
