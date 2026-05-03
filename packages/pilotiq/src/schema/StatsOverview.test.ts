/**
 * Plan #15 Phase B — `StatsOverview` element tests.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { Stat } from './Stat.js'
import { StatsOverview } from './StatsOverview.js'
import { resolveSchema, type RenderContext } from './resolveSchema.js'
import { isServerDataElement } from './ServerDataElement.js'

describe('StatsOverview element', () => {
  describe('factory + identity', () => {
    it('StatsOverview.make() returns an instance', () => {
      const w = StatsOverview.make('overview')
      assert.ok(w instanceof StatsOverview)
      assert.equal(w.getType(), 'stats')
    })

    it('falls back to subclass class name when no id passed', () => {
      class UsersStats extends StatsOverview {}
      assert.equal(UsersStats.make().getId(), 'UsersStats')
    })

    it('explicit id wins over class name', () => {
      class UsersStats extends StatsOverview {}
      assert.equal(UsersStats.make('explicit').getId(), 'explicit')
    })

    it('is a ServerDataElement', () => {
      assert.equal(isServerDataElement(StatsOverview.make('a')), true)
    })

    it('lazy default = true (inherited)', () => {
      assert.equal(StatsOverview.make('a').isLazy(), true)
    })
  })

  describe('columns()', () => {
    it('instance setter wins over static', () => {
      class StaticCols extends StatsOverview {
        static override columns = 2
      }
      const w = StaticCols.make().columns(4)
      assert.equal(w.getColumns(), 4)
    })

    it('static columns is the fallback', () => {
      class StaticCols extends StatsOverview {
        static override columns = 3
      }
      assert.equal(StaticCols.make().getColumns(), 3)
    })

    it('returns undefined when neither set', () => {
      assert.equal(StatsOverview.make('a').getColumns(), undefined)
    })
  })

  describe('toMeta()', () => {
    it('emits type=stats', async () => {
      const [meta] = await resolveSchema([StatsOverview.make('a')])
      assert.equal(meta!.type, 'stats')
    })

    it('omits columns when neither static nor instance set', async () => {
      const [meta] = await resolveSchema([StatsOverview.make('a')])
      assert.equal(meta!['columns'], undefined)
    })

    it('emits columns when set on the instance', async () => {
      const [meta] = await resolveSchema([StatsOverview.make('a').columns(4)])
      assert.equal(meta!['columns'], 4)
    })

    it('emits columns when set as a static on the subclass', async () => {
      class S extends StatsOverview {
        static override columns = 2
      }
      const [meta] = await resolveSchema([S.make()])
      assert.equal(meta!['columns'], 2)
    })

    it('serverData wire-shape stamps land on top', async () => {
      class S extends StatsOverview {}
      const w = S.make().poll(60).lazy(false)
      const [meta] = await resolveSchema([w])
      assert.equal(meta!['serverData'], true)
      assert.equal(meta!['id'], 'S')
      assert.equal(meta!['poll'], 60)
      assert.equal(meta!['lazy'], false)
    })
  })

  describe('resolveServerData()', () => {
    it('runs the static getStats() hook and serializes Stat[] into StatMeta[]', async () => {
      class UsersStats extends StatsOverview {
        static override async getStats() {
          return [
            Stat.make('Users').value(42).color('success'),
            Stat.make('Sessions').value(7),
          ]
        }
      }
      const data = await UsersStats.make().resolveServerData({} as RenderContext)
      assert.deepEqual(data, {
        stats: [
          { label: 'Users', value: 42, color: 'success' },
          { label: 'Sessions', value: 7 },
        ],
      })
    })

    it('passes the render context to getStats', async () => {
      let received: unknown = null
      class CtxStats extends StatsOverview {
        static override async getStats(ctx: RenderContext) {
          received = ctx
          return []
        }
      }
      await CtxStats.make().resolveServerData({ user: { id: 1 } } as RenderContext)
      assert.deepEqual(received, { user: { id: 1 } })
    })

    it('fluent .getStatsHandler(fn) overrides the static', async () => {
      class StaticStats extends StatsOverview {
        static override async getStats() { return [Stat.make('Static').value(1)] }
      }
      const w = StaticStats.make().getStatsHandler(async () => [Stat.make('Instance').value(2)])
      const data = await w.resolveServerData({} as RenderContext)
      assert.deepEqual(data, { stats: [{ label: 'Instance', value: 2 }] })
    })

    it('returns { stats: [] } when no hook is configured', async () => {
      const data = await StatsOverview.make('empty').resolveServerData({} as RenderContext)
      assert.deepEqual(data, { stats: [] })
    })
  })
})
