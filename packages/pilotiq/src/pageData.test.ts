import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { Form } from './elements/Form.js'
import { applyFillPipeline } from './pageData.js'

describe('applyFillPipeline', () => {
  it('defaults to a shallow record copy when nothing is configured', async () => {
    const form = Form.make()
    const record = { id: 1, title: 'Hello' }
    const values = await applyFillPipeline(form, record)
    assert.deepEqual(values, { id: 1, title: 'Hello' })
    assert.notEqual(values, record)
  })

  it('runs mutateFormDataBeforeFill before fillFromRecord', async () => {
    const order: string[] = []
    const form = Form.make<{ id: number; tags: string[] }>()
      .mutateFormDataBeforeFill(v => { order.push('before'); return { ...v, tagsCsv: '' } })
      .fillFromRecord(r => { order.push('fill'); return { id: r.id, tagsCsv: r.tags.join(',') } })

    const values = await applyFillPipeline(form, { id: 1, tags: ['a', 'b'] })
    assert.deepEqual(order, ['before', 'fill'])
    assert.deepEqual(values, { id: 1, tagsCsv: 'a,b' })
  })

  it('runs mutateFormDataAfterFill after fillFromRecord', async () => {
    const form = Form.make<{ id: number; title: string }>()
      .fillFromRecord(r => ({ id: r.id, title: r.title }))
      .mutateFormDataAfterFill(v => ({ ...v, title: String(v['title']).toUpperCase() }))

    const values = await applyFillPipeline(form, { id: 1, title: 'hello' })
    assert.deepEqual(values, { id: 1, title: 'HELLO' })
  })

  it('passes the loaded record on ctx.record to both mutators', async () => {
    const seen: { before?: unknown; after?: unknown } = {}
    const form = Form.make<{ id: number; secret: string }>()
      .mutateFormDataBeforeFill((v, ctx) => { seen.before = ctx.record; return v })
      .mutateFormDataAfterFill((v, ctx)  => { seen.after  = ctx.record; return v })

    const record = { id: 1, secret: 'hidden' }
    await applyFillPipeline(form, record)
    assert.equal(seen.before, record)
    assert.equal(seen.after, record)
  })

  it('supports async mutators', async () => {
    const form = Form.make<{ id: number }>()
      .mutateFormDataAfterFill(async v => ({ ...v, async: true }))
    const values = await applyFillPipeline(form, { id: 1 })
    assert.deepEqual(values, { id: 1, async: true })
  })
})
