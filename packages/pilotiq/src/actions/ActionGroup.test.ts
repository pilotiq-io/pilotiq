import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { Action } from './Action.js'
import { ActionGroup } from './ActionGroup.js'
import { resolveSchema, _resetResolverRegistry } from '../schema/resolveSchema.js'

beforeEach(() => _resetResolverRegistry())

describe('ActionGroup builder', () => {
  it('emits type=actionGroup with sensible defaults', () => {
    const meta = ActionGroup.make('manage').toMeta()
    assert.equal(meta.type,      'actionGroup')
    assert.equal(meta.name,      'manage')
    assert.equal(meta.label,     'Manage')  // auto-derived
    assert.equal(meta.placement, 'inline')
  })

  it('label() / icon() / tooltip() round-trip', () => {
    const meta = ActionGroup.make('m').label('More').icon('more-horizontal').tooltip('More actions').toMeta()
    assert.equal(meta.label,   'More')
    assert.equal(meta.icon,    'more-horizontal')
    assert.equal(meta.tooltip, 'More actions')
  })

  it('placement helpers', () => {
    assert.equal(ActionGroup.make('a').header().toMeta().placement, 'header')
    assert.equal(ActionGroup.make('a').row().toMeta().placement,    'row')
    assert.equal(ActionGroup.make('a').bulk().toMeta().placement,   'bulk')
  })

  it('cosmetic builders round-trip', () => {
    const meta = ActionGroup.make('a').color('success').size('lg').outlined().iconButton().toMeta()
    assert.equal(meta.color,    'success')
    assert.equal(meta.size,     'lg')
    assert.equal(meta.outlined, true)
    assert.equal(meta.iconOnly, true)
  })

  it('actions() stores the children', () => {
    const g = ActionGroup.make('m').actions([
      Action.make('export'),
      Action.make('archive'),
    ])
    const children = g.getActions()
    assert.deepEqual(children.map(a => a.name), ['export', 'archive'])
  })

  it('actions() flattens nested ActionGroups', () => {
    const inner = ActionGroup.make('inner').actions([Action.make('a'), Action.make('b')])
    const outer = ActionGroup.make('outer').actions([Action.make('c'), inner])
    assert.deepEqual(outer.getActions().map(a => a.name), ['c', 'a', 'b'])
  })

  it('hasVisibilityRules detects any rule', () => {
    assert.equal(ActionGroup.make('a').hasVisibilityRules(), false)
    assert.equal(ActionGroup.make('a').visible(true).hasVisibilityRules(), true)
  })

  it('evaluate combines visible and hidden via AND', () => {
    const g = ActionGroup.make('a').visible(true).hidden(({ user }) => (user as { admin?: boolean })?.admin === false)
    assert.equal(g.evaluate({ user: { admin: true  } }).visible, true)
    assert.equal(g.evaluate({ user: { admin: false } }).visible, false)
  })

  it('toMeta emits conditional:true when rules exist', () => {
    assert.equal(ActionGroup.make('a').toMeta().conditional, undefined)
    assert.equal(ActionGroup.make('a').visible(true).toMeta().conditional, true)
  })
})

describe('ActionGroup through resolveSchema', () => {
  it('drops the group when its rule resolves to !visible', async () => {
    const tree = [ActionGroup.make('hidden').visible(false).actions([Action.make('a')])]
    const result = await resolveSchema(tree)
    assert.equal(result.length, 0)
  })

  it('serializes children as meta.children', async () => {
    const tree = [
      ActionGroup.make('m').actions([
        Action.make('export'),
        Action.make('delete').destructive(),
      ]),
    ]
    const result = await resolveSchema(tree)
    assert.equal(result[0]!.type, 'actionGroup')
    assert.equal(result[0]!.children?.length, 2)
    assert.equal(result[0]!.children![0]!['name'], 'export')
    assert.equal(result[0]!.children![1]!['destructive'], true)
  })

  it('child Action visibility rules still apply', async () => {
    const tree = [
      ActionGroup.make('m').actions([
        Action.make('shown'),
        Action.make('hidden').visible(false),
      ]),
    ]
    const result = await resolveSchema(tree)
    assert.equal(result[0]!.children?.length, 1)
    assert.equal(result[0]!.children![0]!['name'], 'shown')
  })

  it('stamps disabled:true on the group when its disabled rule matches', async () => {
    const tree = [
      ActionGroup.make('m').disabled(true).actions([Action.make('a')]),
    ]
    const result = await resolveSchema(tree)
    assert.equal(result[0]!['disabled'], true)
  })
})
