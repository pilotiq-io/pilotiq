import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Pilotiq, type PilotiqPlugin } from './Pilotiq.js'

describe('Pilotiq plugins', () => {
  it('.use() invokes register() with the panel and records the plugin', () => {
    const seen: Array<{ name: string; same: boolean }> = []
    const p1: PilotiqPlugin = {
      name: 'p1',
      register(panel) { seen.push({ name: 'p1', same: panel instanceof Pilotiq }) },
    }
    const panel = Pilotiq.make('Admin').use(p1)
    assert.deepEqual(seen, [{ name: 'p1', same: true }])
    const installed = panel.getPlugins()
    assert.equal(installed.length, 1)
    assert.equal(installed[0]?.name, 'p1')
  })

  it('.plugins([…]) runs each plugin in array order', () => {
    const order: string[] = []
    const make = (name: string): PilotiqPlugin => ({
      name,
      register() { order.push(name) },
    })
    const panel = Pilotiq.make('Admin').plugins([make('a'), make('b'), make('c')])
    assert.deepEqual(order, ['a', 'b', 'c'])
    assert.deepEqual(panel.getPlugins().map((p) => p.name), ['a', 'b', 'c'])
  })

  it('.plugins([]) is a no-op', () => {
    const panel = Pilotiq.make('Admin').plugins([])
    assert.equal(panel.getPlugins().length, 0)
  })

  it('.plugins([…]) composes with .use()', () => {
    const log: string[] = []
    const mk = (n: string): PilotiqPlugin => ({ name: n, register() { log.push(n) } })
    const panel = Pilotiq.make('Admin')
      .use(mk('first'))
      .plugins([mk('second'), mk('third')])
      .use(mk('fourth'))
    assert.deepEqual(log, ['first', 'second', 'third', 'fourth'])
    assert.deepEqual(panel.getPlugins().map((p) => p.name), [
      'first', 'second', 'third', 'fourth',
    ])
  })
})
