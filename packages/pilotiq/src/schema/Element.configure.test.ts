import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import { Element } from './Element.js'
import { Field } from '../fields/Field.js'
import { TextField } from '../fields/TextField.js'
import { NumberField } from '../fields/NumberField.js'
import { BadgeColumn } from '../columns/BadgeColumn.js'
import { Column } from '../Column.js'
import { TextEntry } from '../entries/TextEntry.js'
import { SelectFilter } from '../filters/SelectFilter.js'
import { TernaryFilter } from '../filters/TernaryFilter.js'
import { Action } from '../actions/Action.js'
import { Section } from './Section.js'
import { StatsOverview } from './StatsOverview.js'

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

// configureUsing is wired on every Element primitive (2026-06-09), not just
// Field + Column. These cover a representative slice of the newly-wired
// surfaces — entries, filters (incl. the stateful make()s that set a default
// queryFn), actions, layout containers, and the polymorphic-`this` widget
// factories that funnel through `<Base>.configured(new this())`.
describe('Element.configureUsing — wired across all Element primitives', () => {
  it('applies to Entry subclasses', () => {
    let seen: TextEntry | undefined
    TextEntry.configureUsing(e => { seen = e })
    const made = TextEntry.make('title')
    assert.equal(seen, made)
  })

  it('applies to Action', () => {
    let seen: Action | undefined
    Action.configureUsing(a => { seen = a })
    const made = Action.make('save')
    assert.equal(seen, made)
  })

  it('applies to layout containers (Section)', () => {
    let seen: Section | undefined
    Section.configureUsing(s => { seen = s })
    const made = Section.make('Details')
    assert.equal(seen, made)
  })

  it('applies to plain Filters', () => {
    let seen: SelectFilter | undefined
    SelectFilter.configureUsing(f => { seen = f })
    const made = SelectFilter.make('status')
    assert.equal(seen, made)
  })

  it('runs AFTER a stateful make() — framework queryFn survives', () => {
    // TernaryFilter.make() installs a default queryFn; the configurator runs
    // on the already-configured instance, so both coexist.
    let seen = false
    TernaryFilter.configureUsing(() => { seen = true })
    const f = TernaryFilter.make('active')
    assert.equal(seen, true)
    assert.equal(typeof f.getQuery(), 'function')  // framework default intact
  })

  it('walks the prototype chain for polymorphic-`this` factories (widgets)', () => {
    // StatsOverview.make() returns `new this(id)` via Base.configured(...) —
    // a subclass made through it must still pick up the registration on the
    // ancestor class (the chain walk keys off the instance, not the static).
    class SalesStats extends StatsOverview {}
    let seen: StatsOverview | undefined
    StatsOverview.configureUsing(s => { seen = s })
    const made = SalesStats.make('sales')
    assert.equal(seen, made)
    assert.ok(made instanceof SalesStats)
  })
})
