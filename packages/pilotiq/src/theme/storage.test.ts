import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { databaseThemeStorage, prismaThemeStorage } from './storage.js'
import type { PanelGlobalDelegate, ThemeStorageDb, ThemeStorageQuery } from './storage.js'

/**
 * Per-test stub for the prisma panelGlobal delegate. Captures the args
 * each method was called with so tests can assert the exact wire shape
 * we send Prisma (slug, JSON-encoded data, etc).
 */
interface PrismaStub extends PanelGlobalDelegate {
  rows: Map<string, { data: string | object | null }>
  calls: { method: string; args: unknown }[]
  /** When set, the next call to this method throws this error. */
  throwOnce?: { method: 'findUnique' | 'upsert' | 'delete'; error: unknown }
}

function makeStub(initial: Record<string, unknown> = {}): PrismaStub {
  const rows = new Map<string, { data: string | object | null }>()
  for (const [slug, data] of Object.entries(initial)) {
    rows.set(slug, { data: typeof data === 'string' ? data : JSON.stringify(data) })
  }
  const calls: { method: string; args: unknown }[] = []
  const stub: PrismaStub = {
    rows,
    calls,
    panelGlobal: {
      async findUnique(args) {
        calls.push({ method: 'findUnique', args })
        if (stub.throwOnce?.method === 'findUnique') {
          const e = stub.throwOnce.error; delete stub.throwOnce; throw e
        }
        return rows.get(args.where.slug) ?? null
      },
      async upsert(args) {
        calls.push({ method: 'upsert', args })
        if (stub.throwOnce?.method === 'upsert') {
          const e = stub.throwOnce.error; delete stub.throwOnce; throw e
        }
        rows.set(args.where.slug, { data: args.update.data })
        return undefined
      },
      async delete(args) {
        calls.push({ method: 'delete', args })
        if (stub.throwOnce?.method === 'delete') {
          const e = stub.throwOnce.error; delete stub.throwOnce; throw e
        }
        if (!rows.has(args.where.slug)) {
          const e: Error & { code?: string } = new Error('Record not found')
          e.code = 'P2025'
          throw e
        }
        rows.delete(args.where.slug)
        return undefined
      },
    },
  }
  return stub
}

describe('prismaThemeStorage', () => {
  let prisma: PrismaStub

  beforeEach(() => { prisma = makeStub() })

  it('load() returns null when no row exists', async () => {
    const storage = prismaThemeStorage(prisma, { slug: 'admin__theme' })
    assert.equal(await storage.load(), null)
    assert.deepEqual(prisma.calls, [{ method: 'findUnique', args: { where: { slug: 'admin__theme' } } }])
  })

  it('load() parses JSON-string data', async () => {
    prisma.rows.set('admin__theme', { data: JSON.stringify({ preset: 'nova' }) })
    const storage = prismaThemeStorage(prisma, { slug: 'admin__theme' })
    assert.deepEqual(await storage.load(), { preset: 'nova' })
  })

  it('load() passes through pre-parsed object data', async () => {
    prisma.rows.set('admin__theme', { data: { preset: 'maia' } })
    const storage = prismaThemeStorage(prisma, { slug: 'admin__theme' })
    assert.deepEqual(await storage.load(), { preset: 'maia' })
  })

  it('save() JSON-encodes the overrides via upsert', async () => {
    const storage = prismaThemeStorage(prisma, { slug: 'admin__theme' })
    await storage.save({ preset: 'lyra', radius: 'medium' })
    const stored = prisma.rows.get('admin__theme')
    assert.ok(stored)
    assert.equal(typeof stored.data, 'string')
    assert.deepEqual(JSON.parse(stored.data as string), { preset: 'lyra', radius: 'medium' })
    const upsertCall = prisma.calls.find(c => c.method === 'upsert')
    assert.ok(upsertCall, 'expected upsert call')
  })

  it('clear() deletes the row', async () => {
    prisma.rows.set('admin__theme', { data: '{}' })
    const storage = prismaThemeStorage(prisma, { slug: 'admin__theme' })
    await storage.clear()
    assert.equal(prisma.rows.has('admin__theme'), false)
  })

  it('clear() tolerates "row not found" (P2025)', async () => {
    const storage = prismaThemeStorage(prisma, { slug: 'admin__theme' })
    // Row does not exist — stub throws P2025 — clear() must not propagate.
    await storage.clear()
  })

  it('clear() rethrows non-P2025 errors', async () => {
    prisma.rows.set('admin__theme', { data: '{}' })
    prisma.throwOnce = { method: 'delete', error: new Error('connection lost') }
    const storage = prismaThemeStorage(prisma, { slug: 'admin__theme' })
    await assert.rejects(() => storage.clear(), /connection lost/)
  })

  it('save() bubbles non-P2025 errors', async () => {
    prisma.throwOnce = { method: 'upsert', error: new Error('connection lost') }
    const storage = prismaThemeStorage(prisma, { slug: 'admin__theme' })
    await assert.rejects(() => storage.save({ preset: 'nova' }), /connection lost/)
  })

  it('load() bubbles errors (callers swallow if they want back-compat)', async () => {
    prisma.throwOnce = { method: 'findUnique', error: new Error('connection lost') }
    const storage = prismaThemeStorage(prisma, { slug: 'admin__theme' })
    await assert.rejects(() => storage.load(), /connection lost/)
  })
})

// ─── databaseThemeStorage ─────────────────────────────────

/**
 * Per-test stub for the duck-typed ORM adapter. Backs a Map keyed by
 * slug and records every query so tests can assert table + where shape.
 */
interface DbStub extends ThemeStorageDb {
  rows: Map<string, Record<string, unknown>>
  calls: { table: string; wheres: [string, unknown][]; method: string; args?: unknown }[]
  /** When set, the next terminal call of this method throws this error. */
  throwOnce?: { method: 'first' | 'updateAll' | 'insertMany' | 'deleteAll'; error: unknown }
}

function makeDbStub(initial: Record<string, unknown> = {}): DbStub {
  const rows = new Map<string, Record<string, unknown>>()
  for (const [slug, data] of Object.entries(initial)) {
    rows.set(slug, { slug, data: typeof data === 'string' ? data : JSON.stringify(data) })
  }
  const calls: DbStub['calls'] = []
  const stub: DbStub = {
    rows,
    calls,
    query(table: string): ThemeStorageQuery {
      const wheres: [string, unknown][] = []
      const matching = () =>
        [...rows.values()].filter(r => wheres.every(([col, v]) => r[col] === v))
      const maybeThrow = (method: NonNullable<DbStub['throwOnce']>['method']) => {
        if (stub.throwOnce?.method === method) {
          const e = stub.throwOnce.error; delete stub.throwOnce; throw e
        }
      }
      const q: ThemeStorageQuery = {
        where(column, value) {
          wheres.push([column, value])
          return q
        },
        async first() {
          calls.push({ table, wheres: [...wheres], method: 'first' })
          maybeThrow('first')
          return (matching()[0] as { data: string | object | null } | undefined) ?? null
        },
        async updateAll(data) {
          calls.push({ table, wheres: [...wheres], method: 'updateAll', args: data })
          maybeThrow('updateAll')
          const hit = matching()
          for (const row of hit) Object.assign(row, data)
          return hit.length
        },
        async insertMany(newRows) {
          calls.push({ table, wheres: [...wheres], method: 'insertMany', args: newRows })
          maybeThrow('insertMany')
          for (const row of newRows) rows.set(String(row['slug']), { ...row })
        },
        async deleteAll() {
          calls.push({ table, wheres: [...wheres], method: 'deleteAll' })
          maybeThrow('deleteAll')
          const hit = matching()
          for (const row of hit) rows.delete(String(row['slug']))
          return hit.length
        },
      }
      return q
    },
  }
  return stub
}

describe('databaseThemeStorage', () => {
  let db: DbStub

  beforeEach(() => { db = makeDbStub() })

  it('load() returns null when no row exists', async () => {
    const storage = databaseThemeStorage(db, { slug: 'admin__theme' })
    assert.equal(await storage.load(), null)
    assert.deepEqual(db.calls, [
      { table: 'panelGlobal', wheres: [['slug', 'admin__theme']], method: 'first' },
    ])
  })

  it('load() parses JSON-string data', async () => {
    db.rows.set('admin__theme', { slug: 'admin__theme', data: JSON.stringify({ preset: 'nova' }) })
    const storage = databaseThemeStorage(db, { slug: 'admin__theme' })
    assert.deepEqual(await storage.load(), { preset: 'nova' })
  })

  it('load() passes through pre-parsed object data (pg json columns)', async () => {
    db.rows.set('admin__theme', { slug: 'admin__theme', data: { preset: 'maia' } })
    const storage = databaseThemeStorage(db, { slug: 'admin__theme' })
    assert.deepEqual(await storage.load(), { preset: 'maia' })
  })

  it('save() updates the existing row in place', async () => {
    db.rows.set('admin__theme', { slug: 'admin__theme', data: '{}' })
    const storage = databaseThemeStorage(db, { slug: 'admin__theme' })
    await storage.save({ preset: 'lyra' })
    assert.deepEqual(JSON.parse(db.rows.get('admin__theme')!['data'] as string), { preset: 'lyra' })
    assert.ok(!db.calls.some(c => c.method === 'insertMany'), 'no insert when update matched')
  })

  it('save() inserts when no row matched', async () => {
    const storage = databaseThemeStorage(db, { slug: 'admin__theme' })
    await storage.save({ preset: 'nova' })
    const stored = db.rows.get('admin__theme')
    assert.ok(stored)
    assert.deepEqual(JSON.parse(stored['data'] as string), { preset: 'nova' })
    // updatedAt is written as an ISO string, never a Date (sqlite binding).
    assert.equal(typeof stored['updatedAt'], 'string')
  })

  it('save() honors a custom table name', async () => {
    const storage = databaseThemeStorage(db, { slug: 'admin__theme', table: 'settings' })
    await storage.save({ preset: 'nova' })
    assert.ok(db.calls.every(c => c.table === 'settings'))
  })

  it('clear() deletes the row and tolerates an empty store', async () => {
    db.rows.set('admin__theme', { slug: 'admin__theme', data: '{}' })
    const storage = databaseThemeStorage(db, { slug: 'admin__theme' })
    await storage.clear()
    assert.equal(db.rows.has('admin__theme'), false)
    await storage.clear() // second clear: deleteAll matches 0 rows — no throw
  })

  it('accepts a lazy resolver thunk', async () => {
    let resolved = 0
    const storage = databaseThemeStorage(() => { resolved++; return db }, { slug: 'admin__theme' })
    assert.equal(resolved, 0, 'thunk not called at construction time')
    await storage.save({ preset: 'nova' })
    assert.ok(resolved > 0)
    assert.deepEqual(JSON.parse(db.rows.get('admin__theme')!['data'] as string), { preset: 'nova' })
  })

  it('load()/save() bubble adapter errors', async () => {
    const storage = databaseThemeStorage(db, { slug: 'admin__theme' })
    db.throwOnce = { method: 'first', error: new Error('connection lost') }
    await assert.rejects(() => storage.load(), /connection lost/)
    db.throwOnce = { method: 'updateAll', error: new Error('no such table: panelGlobal') }
    await assert.rejects(() => storage.save({ preset: 'nova' }), /no such table/)
  })

  it('load()/clear() tolerate a missing table (pre-migrate boot)', async () => {
    const storage = databaseThemeStorage(db, { slug: 'admin__theme' })
    // sqlite shape — message only
    db.throwOnce = { method: 'first', error: new Error('no such table: panelGlobal') }
    assert.equal(await storage.load(), null)
    // pg shape — code on the error
    const pgErr = Object.assign(new Error('relation "panelGlobal" does not exist'), { code: '42P01' })
    db.throwOnce = { method: 'first', error: pgErr }
    assert.equal(await storage.load(), null)
    // wrapped one level down in `cause` (driver wrappers)
    db.throwOnce = { method: 'deleteAll', error: Object.assign(new Error('query failed'), {
      cause: Object.assign(new Error('boom'), { errno: 1146 }),
    }) }
    await storage.clear()
  })
})
