/**
 * Phase 5 perf sweep — covers the four hot-path changes that landed
 * 2026-05-22:
 *
 *  - 5b Per-user navigation-badge TTL cache (`Pilotiq.navigationBadgeTtl`)
 *  - 5c Map-based slug lookup (`Pilotiq.findResource/findGlobal/findPage`)
 *  - 5a Chunked import (`importFactory.runImport` honors `concurrency`)
 *
 *  5d (`policyGate`) is exercised indirectly by the existing routes /
 *  authorization tests — its contract is identical to the prior
 *  serial pair, just parallelized; no behavior change to assert here.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { Pilotiq } from './Pilotiq.js'
import { Resource } from './Resource.js'
import { Global } from './Global.js'
import { Page } from './Page.js'
import { runImport } from './actions/importFactory.js'

// ─── Fixtures ─────────────────────────────────────────────────

class Articles extends Resource {
  static override slug = 'articles'
  static override label = 'Articles'
}
class Comments extends Resource {
  static override slug = 'comments'
  static override label = 'Comments'
}
class Settings extends Global {
  static override slug = 'settings'
  static override label = 'Settings'
}
class Branding extends Global {
  static override slug = 'branding'
  static override label = 'Branding'
}
class Reports extends Page {
  static override slug = 'reports'
  static override label = 'Reports'
}
class Health extends Page {
  static override slug = 'health'
  static override label = 'Health'
}

// ─── 5c — Map-based slug lookup ───────────────────────────────

describe('Pilotiq.find{Resource,Global,Page}() — Plan 5c', () => {
  it('returns the matching class by slug', () => {
    const p = Pilotiq.make('admin')
      .resources([Articles, Comments])
      .globals([Settings, Branding])
      .pages([Reports, Health])
    assert.equal(p.findResource('articles'), Articles)
    assert.equal(p.findResource('comments'), Comments)
    assert.equal(p.findGlobal('settings'),   Settings)
    assert.equal(p.findGlobal('branding'),   Branding)
    assert.equal(p.findPage('reports'),      Reports)
    assert.equal(p.findPage('health'),       Health)
  })

  it('returns undefined for unknown slugs', () => {
    const p = Pilotiq.make('admin').resources([Articles])
    assert.equal(p.findResource('nope'), undefined)
    assert.equal(p.findGlobal('nope'),   undefined)
    assert.equal(p.findPage('nope'),     undefined)
  })

  it('invalidates the cache when .resources() is reassigned', () => {
    const p = Pilotiq.make('admin').resources([Articles])
    assert.equal(p.findResource('articles'), Articles)
    assert.equal(p.findResource('comments'), undefined)
    p.resources([Articles, Comments])
    assert.equal(p.findResource('comments'), Comments)
  })

  it('invalidates the page cache when .pages() is reassigned', () => {
    const p = Pilotiq.make('admin').pages([Reports])
    assert.equal(p.findPage('reports'), Reports)
    assert.equal(p.findPage('health'),  undefined)
    p.pages([Reports, Health])
    assert.equal(p.findPage('health'), Health)
  })

  it('invalidates the page cache when .dashboard()/.profile() auto-append', () => {
    class Dash extends Page {
      static override slug = 'dash'
      static override label = 'Dashboard'
    }
    const p = Pilotiq.make('admin')
    assert.equal(p.findPage('dash'), undefined)
    p.dashboard(Dash)
    assert.equal(p.findPage('dash'), Dash)
  })
})

// ─── 5b — Navigation badge TTL cache ──────────────────────────

describe('Pilotiq.navigationBadgeTtl() + resolveNavigationBadge() — Plan 5b', () => {
  it('default TTL is 30s', () => {
    const p = Pilotiq.make('admin')
    assert.equal(p.getNavigationBadgeTtl(), 30_000)
  })

  it('navigationBadgeTtl(ms) overrides; clamps negatives to 0', () => {
    const p = Pilotiq.make('admin').navigationBadgeTtl(5_000)
    assert.equal(p.getNavigationBadgeTtl(), 5_000)
    p.navigationBadgeTtl(-1)
    assert.equal(p.getNavigationBadgeTtl(), 0)
  })

  it('navigationBadgeTtl(null) restores the default', () => {
    const p = Pilotiq.make('admin').navigationBadgeTtl(1_000)
    p.navigationBadgeTtl(null)
    assert.equal(p.getNavigationBadgeTtl(), 30_000)
  })

  it('resolveNavigationBadge caches within TTL, busts on user change', async () => {
    const p = Pilotiq.make('admin')
    let calls = 0
    const resolver = async () => { calls++; return String(calls) }

    // First call: miss → resolver fires → returns '1'.
    assert.equal(await p.resolveNavigationBadge('Articles', { id: 1 }, resolver), '1')
    assert.equal(calls, 1)
    // Same user + owner: hit → no new call → still '1'.
    assert.equal(await p.resolveNavigationBadge('Articles', { id: 1 }, resolver), '1')
    assert.equal(calls, 1)
    // Different user: miss → resolver fires again.
    assert.equal(await p.resolveNavigationBadge('Articles', { id: 2 }, resolver), '2')
    assert.equal(calls, 2)
    // Different owner, same user: separate cache slot.
    assert.equal(await p.resolveNavigationBadge('Comments', { id: 1 }, resolver), '3')
    assert.equal(calls, 3)
  })

  it('TTL of 0 disables caching entirely', async () => {
    const p = Pilotiq.make('admin').navigationBadgeTtl(0)
    let calls = 0
    const resolver = async () => { calls++; return 'x' }
    await p.resolveNavigationBadge('Articles', { id: 1 }, resolver)
    await p.resolveNavigationBadge('Articles', { id: 1 }, resolver)
    assert.equal(calls, 2)
  })

  it('caches undefined results (no need to keep re-resolving "no badge")', async () => {
    const p = Pilotiq.make('admin')
    let calls = 0
    const resolver = async () => { calls++; return undefined }
    assert.equal(await p.resolveNavigationBadge('Articles', null, resolver), undefined)
    assert.equal(await p.resolveNavigationBadge('Articles', null, resolver), undefined)
    assert.equal(calls, 1)
  })

  it('navigationBadgeTtl(ms) clears the cache', async () => {
    const p = Pilotiq.make('admin')
    let calls = 0
    const resolver = async () => { calls++; return 'x' }
    await p.resolveNavigationBadge('A', null, resolver)
    assert.equal(calls, 1)
    p.navigationBadgeTtl(60_000)
    await p.resolveNavigationBadge('A', null, resolver)
    assert.equal(calls, 2)
  })

  it('anonymous users share one cache slot', async () => {
    const p = Pilotiq.make('admin')
    let calls = 0
    const resolver = async () => { calls++; return 'x' }
    await p.resolveNavigationBadge('A', null,      resolver)
    await p.resolveNavigationBadge('A', undefined, resolver)
    assert.equal(calls, 1)
  })

  it('falls back to JSON.stringify when user has no .id', async () => {
    const p = Pilotiq.make('admin')
    let calls = 0
    const resolver = async () => { calls++; return 'x' }
    await p.resolveNavigationBadge('A', { role: 'editor' }, resolver)
    await p.resolveNavigationBadge('A', { role: 'editor' }, resolver)
    assert.equal(calls, 1) // same JSON shape → cache hit
    await p.resolveNavigationBadge('A', { role: 'admin'  }, resolver)
    assert.equal(calls, 2) // different JSON → miss
  })
})

// ─── 5a — Chunked importFactory.runImport ─────────────────────

describe('importFactory.runImport — Plan 5a chunking', () => {
  it('runs rows in chunks of `concurrency` and aggregates counts', async () => {
    const created: string[] = []
    let maxInFlight = 0
    let inFlight = 0
    const M = {
      async create(row: { id: string }) {
        inFlight++; if (inFlight > maxInFlight) maxInFlight = inFlight
        await new Promise(r => setTimeout(r, 5))
        inFlight--
        created.push(row.id)
      },
      // unused for create-mode tests but the type wants them present
      query() { return { where() { return { paginate: async () => ({ data: [] }) } } } },
      async update() {},
    }
    const rows = Array.from({ length: 25 }, (_, i) => ({ id: `r${i}` }))
    const summary = await runImport(rows, M, 'create', { concurrency: 5 }, { request: undefined })
    assert.equal(summary.created, 25)
    assert.equal(summary.errors.length, 0)
    // With concurrency=5 we should see at least 4 in-flight at peak.
    assert.ok(maxInFlight >= 4, `expected >=4 concurrent, saw ${maxInFlight}`)
    // Never exceed the cap.
    assert.ok(maxInFlight <= 5, `expected <=5 concurrent, saw ${maxInFlight}`)
  })

  it('preserves original-row indices in error messages despite chunking', async () => {
    const M = {
      async create(row: { id: string }) {
        if (row.id === 'r2') throw new Error('boom')
      },
      query() { return { where() { return { paginate: async () => ({ data: [] }) } } } },
      async update() {},
    }
    const rows = [{ id: 'r0' }, { id: 'r1' }, { id: 'r2' }, { id: 'r3' }]
    const summary = await runImport(rows, M, 'create', { concurrency: 4 }, { request: undefined })
    assert.equal(summary.created, 3)
    assert.equal(summary.skipped, 1)
    assert.equal(summary.errors.length, 1)
    assert.equal(summary.errors[0]?.row, 3) // 1-based, original index 2 → row 3
    assert.match(summary.errors[0]?.message ?? '', /boom/)
  })

  it('defaults to concurrency 10 when unset', async () => {
    let maxInFlight = 0
    let inFlight = 0
    const M = {
      async create() {
        inFlight++; if (inFlight > maxInFlight) maxInFlight = inFlight
        await new Promise(r => setTimeout(r, 3))
        inFlight--
      },
      query() { return { where() { return { paginate: async () => ({ data: [] }) } } } },
      async update() {},
    }
    const rows = Array.from({ length: 30 }, () => ({}))
    await runImport(rows, M, 'create', {}, { request: undefined })
    assert.ok(maxInFlight <= 10, `expected <=10 concurrent, saw ${maxInFlight}`)
    assert.ok(maxInFlight >= 5,  `expected >=5 concurrent under default, saw ${maxInFlight}`)
  })
})
