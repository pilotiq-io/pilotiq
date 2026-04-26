import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { resolveSchema, _resetResolverRegistry } from './resolveSchema.js'
import { Section } from './Section.js'
import { Tabs, Tab } from './Tabs.js'
import { Grid } from './Grid.js'
import { Card } from './Card.js'
import { Heading } from './Heading.js'
import { Text } from './Text.js'
import { TextField } from '../fields/TextField.js'
import { SelectField } from '../fields/SelectField.js'

beforeEach(() => _resetResolverRegistry())

describe('Section', () => {
  it('serializes title, description, and columns', async () => {
    const tree = [
      Section.make('Profile')
        .description('Your account details')
        .columns(2)
        .schema([Heading.make('inside')]),
    ]
    const result = await resolveSchema(tree)
    assert.equal(result[0]!.type,        'section')
    assert.equal(result[0]!.title,       'Profile')
    assert.equal(result[0]!.description, 'Your account details')
    assert.equal(result[0]!.columns,     2)
    assert.equal(result[0]!.collapsible, false)
  })

  it('emits defaultCollapsed only when collapsible is true', async () => {
    const a = Section.make().defaultCollapsed().schema([])
    const b = Section.make().collapsible().defaultCollapsed().schema([])
    const ra = (await resolveSchema([a]))[0]!
    const rb = (await resolveSchema([b]))[0]!
    assert.equal(ra['defaultCollapsed'], undefined) // collapsible is off → flag suppressed
    assert.equal(rb['defaultCollapsed'], true)
  })

  it('children resolve recursively via the unified Element resolver', async () => {
    const tree = [
      Section.make('Settings').schema([
        TextField.make('name'),
        Text.make('hint text'),
      ]),
    ]
    const result = await resolveSchema(tree)
    assert.equal(result[0]!.children?.length, 2)
    assert.equal(result[0]!.children![0]!.type, 'field')
    assert.equal(result[0]!.children![1]!.type, 'text')
  })
})

describe('Tabs / Tab', () => {
  it('Tabs resolves with each Tab as a child', async () => {
    const tree = [
      Tabs.make().tabs([
        Tab.make('General').schema([TextField.make('name')]),
        Tab.make('SEO').icon('search').schema([TextField.make('seoTitle')]),
      ]),
    ]
    const result = await resolveSchema(tree)
    assert.equal(result[0]!.type, 'tabs')
    assert.equal(result[0]!.children?.length, 2)
    assert.equal(result[0]!.children![0]!.type,  'tab')
    assert.equal(result[0]!.children![0]!.label, 'General')
    assert.equal(result[0]!.children![1]!.icon,  'search')
  })

  it('Tab nests its own children that the resolver walks transitively', async () => {
    const tree = [
      Tabs.make().tabs([
        Tab.make('Inputs').schema([
          TextField.make('a'),
          SelectField.make('b').options([{ value: 'x', label: 'X' }]),
        ]),
      ]),
    ]
    const result = await resolveSchema(tree)
    const firstTab = result[0]!.children![0]!
    assert.equal(firstTab.children?.length, 2)
    assert.equal(firstTab.children![1]!['fieldType'], 'select')
  })
})

describe('Grid', () => {
  it('serializes columns and gap when set', async () => {
    const tree = [Grid.make().columns(3).gap(8).schema([])]
    const result = await resolveSchema(tree)
    assert.equal(result[0]!.type,    'grid')
    assert.equal(result[0]!.columns, 3)
    assert.equal(result[0]!.gap,     8)
  })

  it('omits gap when not set', async () => {
    const tree = [Grid.make().columns(2).schema([])]
    const result = await resolveSchema(tree)
    assert.equal('gap' in result[0]!, false)
  })
})

describe('Field-as-Element (unified resolver)', () => {
  it('Fields resolve through resolveSchema with type=field', async () => {
    const tree = [
      TextField.make('title').required().placeholder('Type here'),
    ]
    const result = await resolveSchema(tree)
    assert.equal(result[0]!.type,                'field')
    assert.equal(result[0]!['fieldType'],   'text')
    assert.equal(result[0]!['name'],        'title')
    assert.equal(result[0]!['required'],    true)
    assert.equal(result[0]!['placeholder'], 'Type here')
  })

  it('hidden Fields are dropped from the resolved tree', async () => {
    const tree = [
      TextField.make('a'),
      TextField.make('b').hideFromTable(),
      TextField.make('c'),
    ]
    const result = await resolveSchema(tree, { mode: 'table' })
    assert.equal(result.length, 2)
    assert.deepEqual(result.map(r => r['name']), ['a', 'c'])
  })

  it('Fields hidden by showWhen are dropped recursively inside containers', async () => {
    const tree = [
      Section.make('Settings').schema([
        TextField.make('always'),
        TextField.make('conditional').showWhen(r => (r as { ok: boolean }).ok),
      ]),
    ]
    const result = await resolveSchema(tree, { mode: 'edit', record: { ok: false } })
    assert.equal(result[0]!.children?.length, 1)
    assert.equal(result[0]!.children![0]!['name'], 'always')
  })

  it('Fields disabledWhen evaluates against context.record', async () => {
    const tree = [
      TextField.make('locked').disabledWhen(r => (r as { locked: boolean }).locked),
    ]
    const a = await resolveSchema(tree, { mode: 'edit', record: { locked: false } })
    const b = await resolveSchema(tree, { mode: 'edit', record: { locked: true } })
    assert.equal(a[0]!['disabled'], false)
    assert.equal(b[0]!['disabled'], true)
  })
})

describe('mixing Fields + display elements + containers', () => {
  it('a Card can contain Heading + Field + nested Section', async () => {
    const tree = [
      Card.make('Article').schema([
        Heading.make('Edit your article'),
        TextField.make('title').required(),
        Section.make('SEO').columns(2).schema([
          TextField.make('seoTitle'),
          TextField.make('seoDescription'),
        ]),
      ]),
    ]
    const result = await resolveSchema(tree, { mode: 'edit' })

    assert.equal(result[0]!.type, 'card')
    assert.equal(result[0]!.children?.length, 3)
    assert.equal(result[0]!.children![0]!.type, 'heading')
    assert.equal(result[0]!.children![1]!.type, 'field')
    assert.equal(result[0]!.children![2]!.type, 'section')
    assert.equal(result[0]!.children![2]!.children?.length, 2)
  })
})
