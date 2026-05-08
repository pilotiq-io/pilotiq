import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { RowButton } from './RowButton.js'
import { Repeater } from './RepeaterField.js'
import { Builder } from './BuilderField.js'
import { Block } from '../schema/Block.js'
import { TextField } from './TextField.js'

describe('RowButton', () => {
  test('toMeta() drops unset keys so renderer ?? doesn\'t clobber defaults', () => {
    assert.deepEqual(RowButton.make().toMeta(), {})
    assert.deepEqual(RowButton.make().label('Add line').toMeta(), { label: 'Add line' })
  })

  test('chained setters round-trip through toMeta()', () => {
    const meta = RowButton.make()
      .label('Remove forever')
      .icon('trash')
      .color('destructive')
      .tooltip('This cannot be undone')
      .toMeta()
    assert.deepEqual(meta, {
      label:   'Remove forever',
      icon:    'trash',
      color:   'destructive',
      tooltip: 'This cannot be undone',
    })
  })

  test('getters reflect what was set', () => {
    const b = RowButton.make().icon('plus-circle').color('primary')
    assert.equal(b.getIcon(), 'plus-circle')
    assert.equal(b.getColor(), 'primary')
    assert.equal(b.getLabel(), undefined)
    assert.equal(b.getTooltip(), undefined)
  })
})

describe('RepeaterField row-action customizers', () => {
  test('non-customized field omits meta.buttons entirely', () => {
    const meta = Repeater.make('items')
      .schema([TextField.make('text')])
      .toMeta() as { buttons?: unknown }
    assert.equal(meta.buttons, undefined)
  })

  test('addAction / cloneAction / deleteAction emit per-slot meta', () => {
    const meta = Repeater.make('items')
      .schema([TextField.make('text')])
      .addAction(RowButton.make().label('Add line item').icon('plus-circle'))
      .cloneAction(RowButton.make().tooltip('Duplicate'))
      .deleteAction(RowButton.make().color('destructive').label('Remove'))
      .toMeta() as unknown as { buttons?: Record<string, Record<string, unknown>> }
    assert.deepEqual(meta.buttons, {
      add:    { label: 'Add line item', icon: 'plus-circle' },
      clone:  { tooltip: 'Duplicate' },
      delete: { color: 'destructive', label: 'Remove' },
    })
  })

  test('all seven slots map to meta keys with the documented kind names', () => {
    const meta = Repeater.make('items')
      .schema([TextField.make('text')])
      .addAction(RowButton.make().label('a'))
      .cloneAction(RowButton.make().label('c'))
      .deleteAction(RowButton.make().label('d'))
      .moveUpAction(RowButton.make().label('u'))
      .moveDownAction(RowButton.make().label('w'))
      .reorderAction(RowButton.make().label('r'))
      .collapseAction(RowButton.make().label('x'))
      .toMeta() as { buttons?: Record<string, { label?: string }> }
    assert.equal(meta.buttons?.add?.label,      'a')
    assert.equal(meta.buttons?.clone?.label,    'c')
    assert.equal(meta.buttons?.delete?.label,   'd')
    assert.equal(meta.buttons?.moveUp?.label,   'u')
    assert.equal(meta.buttons?.moveDown?.label, 'w')
    assert.equal(meta.buttons?.reorder?.label,  'r')
    assert.equal(meta.buttons?.collapse?.label, 'x')
  })

  test('addActionLabel and addAction.label coexist (renderer picks customizer)', () => {
    // Field meta keeps both; the renderer's `buttons.add.label ?? addActionLabel`
    // chain decides which wins. The wire format must carry both faithfully.
    const meta = Repeater.make('items')
      .schema([TextField.make('text')])
      .addActionLabel('Old label')
      .addAction(RowButton.make().label('New label'))
      .toMeta() as { addActionLabel?: string; buttons?: { add?: { label?: string } } }
    assert.equal(meta.addActionLabel, 'Old label')
    assert.equal(meta.buttons?.add?.label, 'New label')
  })

  test('getButton(kind) returns the configured customizer or undefined', () => {
    const r = Repeater.make('items')
      .schema([TextField.make('text')])
      .deleteAction(RowButton.make().color('destructive'))
    assert.notEqual(r.getButton('delete'), undefined)
    assert.equal(r.getButton('delete')!.getColor(), 'destructive')
    assert.equal(r.getButton('clone'), undefined)
  })

  test('expandAction lands on meta.buttons.expand (separate from collapseAction)', () => {
    const meta = Repeater.make('items')
      .schema([TextField.make('text')])
      .collapsible()
      .collapseAction(RowButton.make().icon('chevron-down'))
      .expandAction(RowButton.make().icon('chevron-right').tooltip('Open'))
      .toMeta() as { buttons?: { collapse?: { icon?: string }; expand?: { icon?: string; tooltip?: string } } }
    assert.deepEqual(meta.buttons?.collapse, { icon: 'chevron-down' })
    assert.deepEqual(meta.buttons?.expand,   { icon: 'chevron-right', tooltip: 'Open' })
  })

  test('expandAllAction() with no arg flips on the slot with empty defaults', () => {
    const meta = Repeater.make('items')
      .schema([TextField.make('text')])
      .expandAllAction()
      .toMeta()
    assert.deepEqual(meta.buttons?.expandAll, {})
    assert.equal(meta.collapsible, true, 'expandAllAction() auto-arms collapsible()')
  })

  test('expandAllAction(button) keeps the override and still auto-arms collapsible', () => {
    const meta = Repeater.make('items')
      .schema([TextField.make('text')])
      .expandAllAction(RowButton.make().label('Open everything').icon('chevrons-down'))
      .toMeta() as { buttons?: { expandAll?: { label?: string; icon?: string } }; collapsible?: boolean }
    assert.deepEqual(meta.buttons?.expandAll, { label: 'Open everything', icon: 'chevrons-down' })
    assert.equal(meta.collapsible, true)
  })

  test('collapseAllAction() with no arg flips on the slot and auto-arms collapsible', () => {
    const meta = Repeater.make('items')
      .schema([TextField.make('text')])
      .collapseAllAction()
      .toMeta()
    assert.deepEqual(meta.buttons?.collapseAll, {})
    assert.equal(meta.collapsible, true)
  })

  test('collapseAllAction(button) routes through the override', () => {
    const meta = Repeater.make('items')
      .schema([TextField.make('text')])
      .collapseAllAction(RowButton.make().label('Hide all').color('muted'))
      .toMeta() as { buttons?: { collapseAll?: { label?: string; color?: string } } }
    assert.deepEqual(meta.buttons?.collapseAll, { label: 'Hide all', color: 'muted' })
  })

  test('non-customized field omits the new slots entirely', () => {
    // Bare field never serializes any of the four new slots — back-compat
    // for renderers that read `meta.buttons` and assume only the original
    // seven keys are reachable.
    const meta = Repeater.make('items')
      .schema([TextField.make('text')])
      .collapsible()
      .toMeta() as { buttons?: unknown }
    assert.equal(meta.buttons, undefined)
  })
})

describe('BuilderField row-action customizers', () => {
  test('non-customized field omits meta.buttons entirely', () => {
    const meta = Builder.make('blocks')
      .blocks([Block.make('hero').schema([TextField.make('title')])])
      .toMeta() as { buttons?: unknown }
    assert.equal(meta.buttons, undefined)
  })

  test('all seven setters land on meta.buttons under the same kind keys', () => {
    const meta = Builder.make('blocks')
      .blocks([Block.make('hero').schema([TextField.make('title')])])
      .addAction(RowButton.make().label('Add block').icon('plus-circle'))
      .cloneAction(RowButton.make().tooltip('Clone'))
      .deleteAction(RowButton.make().color('destructive'))
      .moveUpAction(RowButton.make().tooltip('Up'))
      .moveDownAction(RowButton.make().tooltip('Down'))
      .reorderAction(RowButton.make().tooltip('Drag'))
      .collapseAction(RowButton.make().icon('chevrons-up-down'))
      .toMeta() as unknown as { buttons?: Record<string, Record<string, unknown>> }
    assert.deepEqual(meta.buttons, {
      add:      { label: 'Add block', icon: 'plus-circle' },
      clone:    { tooltip: 'Clone' },
      delete:   { color: 'destructive' },
      moveUp:   { tooltip: 'Up' },
      moveDown: { tooltip: 'Down' },
      reorder:  { tooltip: 'Drag' },
      collapse: { icon: 'chevrons-up-down' },
    })
  })

  test('shares the serializer with Repeater (same wire shape)', () => {
    const overrides = {
      add:    RowButton.make().label('+'),
      delete: RowButton.make().color('destructive'),
    }
    const r = Repeater.make('items').schema([TextField.make('text')])
      .addAction(overrides.add)
      .deleteAction(overrides.delete)
      .toMeta() as { buttons?: unknown }
    const b = Builder.make('blocks')
      .blocks([Block.make('hero').schema([TextField.make('title')])])
      .addAction(overrides.add)
      .deleteAction(overrides.delete)
      .toMeta() as { buttons?: unknown }
    assert.deepEqual(r.buttons, b.buttons)
  })

  test('expandAction / expandAllAction / collapseAllAction land on Builder meta with the same kind keys', () => {
    const meta = Builder.make('blocks')
      .blocks([Block.make('hero').schema([TextField.make('title')])])
      .expandAction(RowButton.make().icon('chevron-right'))
      .expandAllAction(RowButton.make().label('Open everything'))
      .collapseAllAction()
      .toMeta()
    assert.deepEqual(meta.buttons?.expand,      { icon: 'chevron-right' })
    assert.deepEqual(meta.buttons?.expandAll,   { label: 'Open everything' })
    assert.deepEqual(meta.buttons?.collapseAll, {})
    assert.equal(meta.collapsible, true, 'Builder bulk setters auto-arm collapsible()')
  })
})
