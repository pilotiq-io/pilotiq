import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { View } from './View.js'
import { resolveSchema, type RenderContext } from './resolveSchema.js'
import { isServerDataElement } from './ServerDataElement.js'

describe('View element', () => {
  describe('factory + identity', () => {
    it('View.make() returns a View instance', () => {
      const v = View.make('foo')
      assert.ok(v instanceof View)
      assert.equal(v.getType(), 'view')
    })

    it('falls back to subclass class name when no id passed', () => {
      class ContributionMap extends View {}
      const v = ContributionMap.make()
      assert.equal(v.getId(), 'ContributionMap')
    })

    it('explicit id wins over class name', () => {
      class ContributionMap extends View {}
      const v = ContributionMap.make('explicit-id')
      assert.equal(v.getId(), 'explicit-id')
    })

    it('is a ServerDataElement', () => {
      assert.equal(isServerDataElement(View.make('a')), true)
    })
  })

  describe('component lookup name', () => {
    it('uses the static componentName from the subclass', () => {
      class ContributionMap extends View {
        static override componentName = 'CalendarHeatmap'
      }
      assert.equal(ContributionMap.make().getComponentName(), 'CalendarHeatmap')
    })

    it('fluent .component(name) overrides the static', () => {
      class ContributionMap extends View {
        static override componentName = 'CalendarHeatmap'
      }
      const v = ContributionMap.make().component('OtherComponent')
      assert.equal(v.getComponentName(), 'OtherComponent')
    })

    it('falls back to id when no componentName is set', () => {
      const v = View.make('my-widget')
      assert.equal(v.getComponentName(), 'my-widget')
    })
  })

  describe('toMeta()', () => {
    it('emits type and component', async () => {
      class ContributionMap extends View {
        static override componentName = 'CalendarHeatmap'
      }
      const [meta] = await resolveSchema([ContributionMap.make()])
      assert.equal(meta!.type, 'view')
      assert.equal(meta!['component'], 'CalendarHeatmap')
    })

    it('serverData wire-shape stamps land on top', async () => {
      class ContributionMap extends View {
        static override componentName = 'CalendarHeatmap'
      }
      const v = ContributionMap.make().poll(60).lazy(false)
      const [meta] = await resolveSchema([v])
      assert.equal(meta!['serverData'], true)
      assert.equal(meta!['id'], 'ContributionMap')
      assert.equal(meta!['poll'], 60)
      assert.equal(meta!['lazy'], false)
    })
  })

  describe('resolveServerData()', () => {
    it('runs the static getData hook', async () => {
      class StatsView extends View {
        static override async getData() { return { total: 42 } }
      }
      const v = StatsView.make()
      const data = await v.resolveServerData({} as RenderContext)
      assert.deepEqual(data, { total: 42 })
    })

    it('passes the render context', async () => {
      let received: unknown = null
      class StatsView extends View {
        static override async getData(ctx: RenderContext) { received = ctx; return null }
      }
      await StatsView.make().resolveServerData({ user: { id: 1 } } as RenderContext)
      assert.deepEqual(received, { user: { id: 1 } })
    })

    it('fluent .getDataHandler(fn) overrides the static', async () => {
      class StatsView extends View {
        static override async getData() { return 'static' }
      }
      const v = StatsView.make().getDataHandler(async () => 'instance')
      const data = await v.resolveServerData({} as RenderContext)
      assert.equal(data, 'instance')
    })

    it('returns null when no hook is configured', async () => {
      const v = View.make('empty')
      assert.equal(await v.resolveServerData({} as RenderContext), null)
    })
  })
})
