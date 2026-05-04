import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { resolveSchema, _resetResolverRegistry } from '../schema/resolveSchema.js'
import { ComponentEntry } from './ComponentEntry.js'
import type { EntryMeta } from './Entry.js'

beforeEach(() => _resetResolverRegistry())

describe('ComponentEntry — wire shape', () => {
  it('serializes with entryType=component', async () => {
    const out = await resolveSchema(
      [ComponentEntry.make('location').component('CoordinatesMap')],
      { record: { location: { lat: 51.5, lng: -0.13 } } },
    )
    const m = out[0] as EntryMeta & { component?: string }
    assert.equal(m.entryType, 'component')
    assert.equal(m.component, 'CoordinatesMap')
  })

  it('passes the resolved value through unchanged', async () => {
    const out = await resolveSchema(
      [ComponentEntry.make('location').component('CoordinatesMap')],
      { record: { location: { lat: 51.5, lng: -0.13 } } },
    )
    const m = out[0] as EntryMeta
    assert.deepEqual(m.value, { lat: 51.5, lng: -0.13 })
  })

  it('value is undefined when record is missing the attribute', async () => {
    const out = await resolveSchema(
      [ComponentEntry.make('coords').component('Map')],
      { record: { other: 1 } },
    )
    assert.equal((out[0] as EntryMeta).value, undefined)
  })
})

describe('ComponentEntry — fluent vs subclass', () => {
  class CoordinatesMap extends ComponentEntry {
    static override componentName = 'CoordinatesMap'
  }

  it('subclass form picks up static componentName', async () => {
    const out = await resolveSchema(
      [CoordinatesMap.make('location')],
      { record: { location: { lat: 1, lng: 2 } } },
    )
    const m = out[0] as EntryMeta & { component?: string }
    assert.equal(m.component, 'CoordinatesMap')
  })

  it('instance .component() overrides the static', async () => {
    const out = await resolveSchema(
      [CoordinatesMap.make('location').component('OtherMap')],
      { record: { location: { lat: 1, lng: 2 } } },
    )
    assert.equal((out[0] as EntryMeta & { component?: string }).component, 'OtherMap')
  })

  it('falls back to entry name when no static + no instance setter', async () => {
    const out = await resolveSchema(
      [ComponentEntry.make('location')],
      { record: { location: 'x' } },
    )
    assert.equal((out[0] as EntryMeta & { component?: string }).component, 'location')
  })
})

describe('ComponentEntry — inherits Entry surface', () => {
  it('label / helperText / tooltip / inlineLabel', async () => {
    const out = await resolveSchema(
      [
        ComponentEntry.make('location')
          .component('Map')
          .label('Where')
          .helperText('lat/lng pair')
          .tooltip('Stored as a JSON object')
          .inlineLabel(),
      ],
      { record: { location: 'x' } },
    )
    const m = out[0] as EntryMeta
    assert.equal(m.label,       'Where')
    assert.equal(m.helperText,  'lat/lng pair')
    assert.equal(m.tooltip,     'Stored as a JSON object')
    assert.equal(m.inlineLabel, true)
  })

  it('honors state(path) for nested values', async () => {
    const out = await resolveSchema(
      [ComponentEntry.make('mapData').component('Map').state('venue.coords')],
      { record: { venue: { coords: { lat: 5, lng: 9 } } } },
    )
    assert.deepEqual((out[0] as EntryMeta).value, { lat: 5, lng: 9 })
  })

  it('honors state(fn) for computed values', async () => {
    const out = await resolveSchema(
      [
        ComponentEntry.make('mapData').component('Map').state((r) => ({
          lat:   (r as { lat: number }).lat,
          lng:   (r as { lng: number }).lng,
          label: (r as { name: string }).name,
        })),
      ],
      { record: { lat: 1, lng: 2, name: 'HQ' } },
    )
    assert.deepEqual((out[0] as EntryMeta).value, { lat: 1, lng: 2, label: 'HQ' })
  })

  it('formatStateUsing still stamps _formatted', async () => {
    const out = await resolveSchema(
      [
        ComponentEntry.make('coords')
          .component('Map')
          .formatStateUsing((v) => `(${(v as { lat: number }).lat},${(v as { lng: number }).lng})`),
      ],
      { record: { coords: { lat: 1, lng: 2 } } },
    )
    assert.equal((out[0] as EntryMeta)._formatted, '(1,2)')
  })

  it('honors visible(false) — drops the entry', async () => {
    const out = await resolveSchema(
      [ComponentEntry.make('coords').component('Map').visible(false)],
      { record: { coords: 'x' } },
    )
    assert.equal(out.length, 0)
  })

  it('honors columnSpan() under a parent grid', async () => {
    const out = await resolveSchema(
      [ComponentEntry.make('coords').component('Map').columnSpan(3)],
      { record: { coords: 'x' } },
    )
    assert.deepEqual((out[0] as EntryMeta)._layout, { columnSpan: 3 })
  })
})

describe('ComponentEntry — registry', () => {
  it('register + lookup round-trip', async () => {
    const { registerEntryComponents, getEntryComponent, _resetEntryRegistryForTests } =
      await import('./registry.js')
    _resetEntryRegistryForTests()
    const Stub = () => null
    registerEntryComponents({ Stub: Stub as never })
    assert.equal(getEntryComponent('Stub'), Stub)
    assert.equal(getEntryComponent('Missing'), undefined)
    _resetEntryRegistryForTests()
  })

  it('skips falsy entries on register (defensive)', async () => {
    const { registerEntryComponents, getEntryComponent, _resetEntryRegistryForTests } =
      await import('./registry.js')
    _resetEntryRegistryForTests()
    registerEntryComponents({ Bad: undefined as never })
    assert.equal(getEntryComponent('Bad'), undefined)
  })

  it('multiple register calls merge', async () => {
    const { registerEntryComponents, getEntryComponent, _resetEntryRegistryForTests } =
      await import('./registry.js')
    _resetEntryRegistryForTests()
    const A = () => null
    const B = () => null
    registerEntryComponents({ A: A as never })
    registerEntryComponents({ B: B as never })
    assert.equal(getEntryComponent('A'), A)
    assert.equal(getEntryComponent('B'), B)
    _resetEntryRegistryForTests()
  })
})
