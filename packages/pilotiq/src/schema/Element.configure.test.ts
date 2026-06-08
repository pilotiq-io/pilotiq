import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import { Element } from './Element.js'
import { Field } from '../fields/Field.js'
import { TextField } from '../fields/TextField.js'
import { NumberField } from '../fields/NumberField.js'
import { BadgeColumn } from '../columns/BadgeColumn.js'
import { Column } from '../Column.js'

// The registry lives on globalThis (SSR-safe), so it persists across tests —
// clear it around every case to keep them isolated.
beforeEach(() => Element.resetConfigurators())
afterEach(() => Element.resetConfigurators())

describe('Element.configureUsing — global defaults', () => {
  it('applies a registered default to every instance made afterward', () => {
    TextField.configureUsing(f => f.helperText('default help'))
    assert.equal(TextField.make('a').getHelperText(), 'default help')
    assert.equal(TextField.make('b').getHelperText(), 'default help')
  })

  it('a per-instance setter overrides the global default', () => {
    TextField.configureUsing(f => f.helperText('default help'))
    // Configurators run at make() time, before user setters — so the
    // explicit call wins.
    assert.equal(TextField.make('a').helperText('custom').getHelperText(), 'custom')
  })

  it('is scoped to the class it was registered on (no leakage to siblings)', () => {
    TextField.configureUsing(f => f.helperText('text-only'))
    assert.equal(TextField.make('a').getHelperText(), 'text-only')
    assert.equal(NumberField.make('a').getHelperText(), undefined)
  })

  it('ancestor configurators run before descendant ones (specific wins)', () => {
    Field.configureUsing(f => f.helperText('from-field'))
    TextField.configureUsing(f => f.helperText('from-text'))
    // TextField gets both, applied Field→TextField, so the specific wins.
    assert.equal(TextField.make('a').getHelperText(), 'from-text')
    // NumberField only matches the Field-level registration.
    assert.equal(NumberField.make('a').getHelperText(), 'from-field')
  })

  it('stacks multiple registrations on one class in call order', () => {
    const order: string[] = []
    TextField.configureUsing(() => order.push('first'))
    TextField.configureUsing(() => order.push('second'))
    TextField.make('a')
    assert.deepEqual(order, ['first', 'second'])
  })

  it('applies to Column subclasses and preserves framework setup (columnType)', () => {
    BadgeColumn.configureUsing(c => c.toggleable())
    const col = BadgeColumn.make('status')
    assert.equal(col.isToggleable(), true)
    assert.equal(col.getColumnType(), 'badge')   // setColumnType still ran
  })

  it('resetConfigurators(className) clears just one class', () => {
    Field.configureUsing(f => f.helperText('field'))
    TextField.configureUsing(f => f.helperText('text'))
    Element.resetConfigurators('TextField')
    // Field-level survives; TextField-specific is gone, so the Field one shows.
    assert.equal(TextField.make('a').getHelperText(), 'field')
  })

  it('is a no-op when nothing is registered (back-compat)', () => {
    assert.equal(TextField.make('a').getHelperText(), undefined)
    assert.equal(Column.make('a').getColumnType(), 'text')
  })
})
