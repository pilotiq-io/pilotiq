/**
 * Plan #15 Phase B — `Stat` value-object surface tests.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { Stat } from './Stat.js'

describe('Stat fluent surface', () => {
  it('Stat.make(label) returns an instance whose meta carries the label', () => {
    const meta = Stat.make('Users').toMeta()
    assert.equal(meta.label, 'Users')
  })

  it('omits unset optional keys (compact wire)', () => {
    const meta = Stat.make('Users').toMeta()
    assert.deepEqual(Object.keys(meta).sort(), ['label'])
  })

  it('value(n) emits a numeric value', () => {
    const meta = Stat.make('Users').value(42).toMeta()
    assert.equal(meta.value, 42)
  })

  it('value(string) emits a string value (e.g. preformatted currency)', () => {
    const meta = Stat.make('Revenue').value('$1,234').toMeta()
    assert.equal(meta.value, '$1,234')
  })

  it('value(undefined) round-trips as null (renderer placeholder)', () => {
    const meta = Stat.make('Users').value(undefined).toMeta()
    assert.equal(meta.value, null)
  })

  it('value(null) emits null', () => {
    const meta = Stat.make('Users').value(null).toMeta()
    assert.equal(meta.value, null)
  })

  it('description() emits the supplementary line', () => {
    const meta = Stat.make('Users').description('+12%').toMeta()
    assert.equal(meta.description, '+12%')
  })

  it('descriptionIcon(name) defaults to position=after', () => {
    const meta = Stat.make('Users').descriptionIcon('trending-up').toMeta()
    assert.deepEqual(meta.descriptionIcon, { name: 'trending-up', position: 'after' })
  })

  it('descriptionIcon(name, "before") preserves the position', () => {
    const meta = Stat.make('Users').descriptionIcon('trending-up', 'before').toMeta()
    assert.deepEqual(meta.descriptionIcon, { name: 'trending-up', position: 'before' })
  })

  it('icon(name) emits the main icon', () => {
    const meta = Stat.make('Users').icon('users').toMeta()
    assert.equal(meta.icon, 'users')
  })

  it('color(c) emits the color preset', () => {
    const meta = Stat.make('Users').color('success').toMeta()
    assert.equal(meta.color, 'success')
  })

  it('chart([…]) emits a copy of the array (no aliasing)', () => {
    const series = [1, 2, 3]
    const stat   = Stat.make('Users').chart(series)
    series.push(99)
    assert.deepEqual(stat.toMeta().chart, [1, 2, 3])
  })

  it('url(href) emits the URL', () => {
    const meta = Stat.make('Users').url('/admin/users').toMeta()
    assert.equal(meta.url, '/admin/users')
  })

  it('openUrlInNewTab() defaults to true', () => {
    const meta = Stat.make('Users').url('/x').openUrlInNewTab().toMeta()
    assert.equal(meta.openInNewTab, true)
  })

  it('openUrlInNewTab(false) opts back out', () => {
    const meta = Stat.make('Users').url('/x').openUrlInNewTab(false).toMeta()
    assert.equal(meta.openInNewTab, false)
  })

  it('extraAttributes spreads onto meta as-is', () => {
    const meta = Stat.make('Users').extraAttributes({ 'data-id': '1', 'aria-label': 'Users' }).toMeta()
    assert.deepEqual(meta.extraAttributes, { 'data-id': '1', 'aria-label': 'Users' })
  })

  it('chained setters compose into a single meta', () => {
    const meta = Stat.make('Users')
      .value(1234)
      .description('+12%')
      .descriptionIcon('trending-up', 'before')
      .icon('users')
      .color('primary')
      .chart([1, 2, 3, 4, 5])
      .url('/admin/users')
      .openUrlInNewTab()
      .extraAttributes({ 'data-test': 'users-stat' })
      .toMeta()
    assert.deepEqual(meta, {
      label: 'Users',
      value: 1234,
      description: '+12%',
      descriptionIcon: { name: 'trending-up', position: 'before' },
      icon: 'users',
      color: 'primary',
      chart: [1, 2, 3, 4, 5],
      url: '/admin/users',
      openInNewTab: true,
      extraAttributes: { 'data-test': 'users-stat' },
    })
  })
})
