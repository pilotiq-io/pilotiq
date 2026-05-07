import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { Alert } from './Alert.js'
import { Action } from '../actions/Action.js'
import { resolveSchema, _resetResolverRegistry } from './resolveSchema.js'

beforeEach(() => _resetResolverRegistry())

describe('Alert schema primitive', () => {
  it('emits content + info default + no title key', () => {
    const meta = Alert.make('Heads up').toMeta()
    assert.equal(meta.type,      'alert')
    assert.equal(meta.content,   'Heads up')
    assert.equal(meta.alertType, 'info')
    assert.equal('title' in meta, false)
  })

  it('honors warning / success / danger', () => {
    assert.equal(Alert.make('a').warning().toMeta().alertType, 'warning')
    assert.equal(Alert.make('a').success().toMeta().alertType, 'success')
    assert.equal(Alert.make('a').danger().toMeta().alertType,  'danger')
  })

  it('emits title when set', () => {
    const meta = Alert.make('body').title('Heads up').toMeta()
    assert.equal(meta.title, 'Heads up')
  })

  it('actions(...) lands on _children and resolves into meta.children', async () => {
    const upgrade = Action.make('upgrade').label('Upgrade').url('/billing')
    const tree = [Alert.make('Free tier limits reached').warning().actions([upgrade])]
    const out = await resolveSchema(tree)
    assert.equal(out[0]!.type, 'alert')
    const children = (out[0]!.children ?? []) as Array<{ type: string; name?: string }>
    assert.equal(children.length, 1)
    assert.equal(children[0]!.type, 'action')
    assert.equal(children[0]!.name, 'upgrade')
  })

  it('actions visibility evaluates against the schema context', async () => {
    const a = Action.make('admin-only').label('Admin').visible(({ user }) => Boolean(user))
    const b = Action.make('always')    .label('Both' )
    const tree = [Alert.make('hi').actions([a, b])]

    // No user → admin-only action drops out.
    const noUser = await resolveSchema(tree, {})
    const noUserChildren = (noUser[0]!.children ?? []) as Array<{ name?: string }>
    assert.equal(noUserChildren.length, 1)
    assert.equal(noUserChildren[0]!.name, 'always')

    // User present → both survive.
    const withUser = await resolveSchema(tree, { user: { name: 'Sue' } })
    const withUserChildren = (withUser[0]!.children ?? []) as Array<{ name?: string }>
    assert.equal(withUserChildren.length, 2)
  })

  it('without actions(...) emits no children key', async () => {
    const tree = [Alert.make('plain').info()]
    const out = await resolveSchema(tree)
    assert.equal('children' in out[0]!, false)
  })
})
