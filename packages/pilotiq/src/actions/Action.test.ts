import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { Action } from './Action.js'
import { resolveSchema, _resetResolverRegistry } from '../schema/resolveSchema.js'
import { Card } from '../schema/Card.js'

beforeEach(() => _resetResolverRegistry())

describe('Action.toMeta', () => {
  it('emits required fields with sensible defaults', () => {
    const meta = Action.make('publish').toMeta()
    assert.equal(meta.type,        'action')
    assert.equal(meta.name,        'publish')
    assert.equal(meta.label,       'Publish') // auto-derived from name
    assert.equal(meta.placement,   'inline')
    assert.equal(meta.destructive, false)
    assert.equal(meta.icon,        undefined)
    assert.equal(meta.confirm,     undefined)
  })

  it('label() overrides the auto-derived label', () => {
    const meta = Action.make('publish').label('Publish Now').toMeta()
    assert.equal(meta.label, 'Publish Now')
  })

  it('icon() emits the icon string', () => {
    const meta = Action.make('save').icon('check').toMeta()
    assert.equal(meta.icon, 'check')
  })

  it('destructive() flips the flag', () => {
    const meta = Action.make('delete').destructive().toMeta()
    assert.equal(meta.destructive, true)
  })

  describe('placement', () => {
    it('placement(p) sets it directly', () => {
      assert.equal(Action.make('a').placement('row').toMeta().placement,    'row')
      assert.equal(Action.make('a').placement('bulk').toMeta().placement,   'bulk')
      assert.equal(Action.make('a').placement('header').toMeta().placement, 'header')
    })

    it('shorthand setters .row() / .bulk() / .header() / .inline()', () => {
      assert.equal(Action.make('a').row().toMeta().placement,    'row')
      assert.equal(Action.make('a').bulk().toMeta().placement,   'bulk')
      assert.equal(Action.make('a').header().toMeta().placement, 'header')
      assert.equal(Action.make('a').row().inline().toMeta().placement, 'inline')
    })
  })

  describe('confirm', () => {
    it('string shorthand becomes { message }', () => {
      const meta = Action.make('delete').confirm('Are you sure?').toMeta()
      assert.deepEqual(meta.confirm, { message: 'Are you sure?' })
    })

    it('object form preserves all keys', () => {
      const meta = Action.make('delete').confirm({
        title:        'Delete user',
        message:      'This action cannot be undone.',
        confirmLabel: 'Yes, delete',
      }).toMeta()
      assert.deepEqual(meta.confirm, {
        title:        'Delete user',
        message:      'This action cannot be undone.',
        confirmLabel: 'Yes, delete',
      })
    })

    it('omitted when not set', () => {
      assert.equal('confirm' in Action.make('save').toMeta(), false)
    })
  })

  describe('handler', () => {
    it('is stored but does not appear in serialized meta', () => {
      const fn = async () => {}
      const a = Action.make('publish').handler(fn)
      assert.equal(a.getHandler(), fn)
      assert.equal('handler' in a.toMeta(), false)
    })
  })
})

describe('Action in the schema tree', () => {
  it('resolves with type=action via the unified resolver', async () => {
    const result = await resolveSchema([Action.make('save').icon('check')])
    assert.equal(result[0]!.type, 'action')
    assert.equal(result[0]!['name'], 'save')
    assert.equal(result[0]!['icon'], 'check')
  })

  it('appears as a child inside a container Element', async () => {
    const tree = [
      Card.make('Header').schema([
        Action.make('export').header(),
        Action.make('delete').row().destructive().confirm('Sure?'),
      ]),
    ]
    const result = await resolveSchema(tree)
    assert.equal(result[0]!.children?.length, 2)
    assert.equal(result[0]!.children![0]!.type,        'action')
    assert.equal(result[0]!.children![0]!['placement'], 'header')
    assert.equal(result[0]!.children![1]!['placement'], 'row')
    assert.deepEqual(result[0]!.children![1]!['confirm'], { message: 'Sure?' })
  })
})

describe('Action variants & cosmetics', () => {
  it('color() sets the visual color', () => {
    assert.equal(Action.make('a').color('success').toMeta().color, 'success')
    assert.equal(Action.make('a').color('warning').toMeta().color, 'warning')
    assert.equal(Action.make('a').color('ghost').toMeta().color,   'ghost')
  })

  it('destructive() implies color="destructive" when no explicit color', () => {
    const meta = Action.make('delete').destructive().toMeta()
    assert.equal(meta.destructive, true)
    assert.equal(meta.color, 'destructive')
  })

  it('explicit color() wins over destructive() flag', () => {
    const meta = Action.make('warn').destructive().color('warning').toMeta()
    assert.equal(meta.destructive, true)
    assert.equal(meta.color, 'warning')
  })

  it('size() sets the size preset', () => {
    assert.equal(Action.make('a').size('sm').toMeta().size, 'sm')
    assert.equal(Action.make('a').size('lg').toMeta().size, 'lg')
  })

  it('tooltip() round-trips', () => {
    const meta = Action.make('save').tooltip('Save changes').toMeta()
    assert.equal(meta.tooltip, 'Save changes')
  })

  it('outlined() emits the flag only when set', () => {
    assert.equal(Action.make('a').toMeta().outlined, undefined)
    assert.equal(Action.make('a').outlined().toMeta().outlined, true)
  })

  it('iconButton() emits iconOnly: true', () => {
    const meta = Action.make('refresh').icon('refresh').iconButton().toMeta()
    assert.equal(meta.iconOnly, true)
  })

  it('badge() / badgeColor() round-trip', () => {
    const meta = Action.make('inbox').badge(7).badgeColor('bg-red-500').toMeta()
    assert.equal(meta.badge, 7)
    assert.equal(meta.badgeColor, 'bg-red-500')
  })

  it('cosmetic builders are absent from meta when not called', () => {
    const meta = Action.make('plain').toMeta()
    assert.equal(meta.color, undefined)
    assert.equal(meta.size, undefined)
    assert.equal(meta.tooltip, undefined)
    assert.equal(meta.outlined, undefined)
    assert.equal(meta.iconOnly, undefined)
    assert.equal(meta.badge, undefined)
  })
})
