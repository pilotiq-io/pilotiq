import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prismaThemeStorage } from './storage.js'
import type { PanelGlobalDelegate } from './storage.js'

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
