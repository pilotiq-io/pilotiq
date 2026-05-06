import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { EmptyState } from './EmptyState.js'
import { Action } from '../actions/Action.js'

describe('EmptyState schema primitive', () => {
  it('emits heading + contained:true by default', () => {
    const meta = EmptyState.make('No reports yet').toMeta()
    assert.equal(meta.type,      'emptyState')
    assert.equal(meta.heading,   'No reports yet')
    assert.equal(meta.contained, true)
    assert.equal('description' in meta, false)
    assert.equal('icon'        in meta, false)
  })

  it('emits description / icon when set', () => {
    const meta = EmptyState.make('Empty')
      .description('Add your first item')
      .icon('file-text')
      .toMeta()
    assert.equal(meta.description, 'Add your first item')
    assert.equal(meta.icon,        'file-text')
  })

  it('contained(false) flips the wrapper flag', () => {
    const meta = EmptyState.make('Empty').contained(false).toMeta()
    assert.equal(meta.contained, false)
  })

  it('footer(actions) lands on the children pipe (resolved by walker)', () => {
    const create = Action.make('create').label('Create')
    const empty  = EmptyState.make('No rows').footer([create])
    // _children is the pre-resolve slot the schema walker reads.
    assert.equal(Array.isArray(empty['_children' as keyof typeof empty]), true)
  })
})
