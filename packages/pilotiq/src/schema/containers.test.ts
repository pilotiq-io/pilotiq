import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { resolveSchema, _resetResolverRegistry } from './resolveSchema.js'
import { Section } from './Section.js'
import { Tabs, Tab } from './Tabs.js'
import { Grid } from './Grid.js'
import { Card } from './Card.js'
import { Group } from './Group.js'
import { Fieldset } from './Fieldset.js'
import { Split } from './Split.js'
import { Wizard, Step } from './Wizard.js'
import { Heading } from './Heading.js'
import { Text } from './Text.js'
import { TextField } from '../fields/TextField.js'
import { SelectField } from '../fields/SelectField.js'
import { Action } from '../actions/Action.js'

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

  it('serializes Plan #8 polish (icon, badge, aside, compact)', async () => {
    const tree = [
      Section.make('Publication')
        .icon('calendar')
        .badge('Draft')
        .aside()
        .compact()
        .schema([]),
    ]
    const result = await resolveSchema(tree)
    assert.equal(result[0]!.icon,    'calendar')
    assert.equal(result[0]!.badge,   'Draft')
    assert.equal(result[0]!.aside,   true)
    assert.equal(result[0]!.compact, true)
  })

  it('emits dense flag only when the chainable was called', async () => {
    const off = Section.make('A').schema([])
    const on  = Section.make('B').dense().schema([])
    const ra = (await resolveSchema([off]))[0]!
    const rb = (await resolveSchema([on ]))[0]!
    assert.equal(ra['dense'], undefined)
    assert.equal(rb['dense'], true)
  })

  it('dense composes with compact (orthogonal flags)', async () => {
    const tree = [Section.make('A').compact().dense().schema([])]
    const result = await resolveSchema(tree)
    assert.equal(result[0]!['compact'], true)
    assert.equal(result[0]!['dense'],   true)
  })

  it('emits persistCollapsed only when collapsible is also true', async () => {
    const noColl = Section.make('A').persistCollapsed().schema([])
    const both   = Section.make('B').collapsible().persistCollapsed().schema([])
    const ra = (await resolveSchema([noColl]))[0]!
    const rb = (await resolveSchema([both  ]))[0]!
    assert.equal(ra['persistCollapsed'], undefined)
    assert.equal(rb['persistCollapsed'], true)
  })

  it('persistCollapsed honors a custom key', async () => {
    const tree = [
      Section.make('A').collapsible().persistCollapsed('settings.advanced').schema([]),
    ]
    const result = await resolveSchema(tree)
    assert.equal(result[0]!['persistKey'], 'settings.advanced')
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

  it('emits secondary flag only when the chainable was called', async () => {
    const off = Section.make('A').schema([])
    const on  = Section.make('B').secondary().schema([])
    const ra = (await resolveSchema([off]))[0]!
    const rb = (await resolveSchema([on ]))[0]!
    assert.equal(ra['secondary'], undefined)
    assert.equal(rb['secondary'], true)
  })

  it('afterHeader([Action…]) resolves Actions through the standard walker', async () => {
    const tree = [
      Section.make('Posts').afterHeader([
        Action.make('refresh').label('Refresh'),
        Action.make('export').label('Export'),
      ]).schema([]),
    ]
    const result = await resolveSchema(tree)
    const after = result[0]!['afterHeader'] as Array<{ type: string; name: string }> | undefined
    assert.ok(after)
    assert.equal(after.length,    2)
    assert.equal(after[0]!.type,  'action')
    assert.equal(after[0]!.name,  'refresh')
    assert.equal(after[1]!.name,  'export')
  })

  it('afterHeader is omitted when no actions are passed', async () => {
    const result = await resolveSchema([Section.make('A').schema([])])
    assert.equal(result[0]!['afterHeader'], undefined)
  })

  it('afterHeader Actions evaluate their .visible() rules', async () => {
    const tree = [
      Section.make('Posts').afterHeader([
        Action.make('shown').label('Shown'),
        Action.make('gone').label('Gone').visible(false),
      ]).schema([]),
    ]
    const result = await resolveSchema(tree)
    const after = result[0]!['afterHeader'] as Array<{ name: string }> | undefined
    assert.ok(after)
    assert.equal(after.length,    1)
    assert.equal(after[0]!.name,  'shown')
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

  it('Tabs default variant is pills, .variant("underline") overrides', async () => {
    const pillsTree = [Tabs.make().tabs([Tab.make('A').schema([])])]
    const pills = await resolveSchema(pillsTree)
    assert.equal(pills[0]!['variant'], 'pills')

    const underlineTree = [
      Tabs.make().variant('underline').tabs([Tab.make('A').schema([])]),
    ]
    const underline = await resolveSchema(underlineTree)
    assert.equal(underline[0]!['variant'], 'underline')
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
        TextField.make('conditional').showWhen(({ record }) => (record as { ok: boolean }).ok),
      ]),
    ]
    const result = await resolveSchema(tree, { mode: 'edit', record: { ok: false } })
    assert.equal(result[0]!.children?.length, 1)
    assert.equal(result[0]!.children![0]!['name'], 'always')
  })

  it('Fields disabledWhen evaluates against context.record', async () => {
    const tree = [
      TextField.make('locked').disabledWhen(({ record }) => (record as { locked: boolean }).locked),
    ]
    const a = await resolveSchema(tree, { mode: 'edit', record: { locked: false } })
    const b = await resolveSchema(tree, { mode: 'edit', record: { locked: true } })
    assert.equal(a[0]!['disabled'], false)
    assert.equal(b[0]!['disabled'], true)
  })
})

describe('Group (Plan #8)', () => {
  it('serializes type:group with no chrome state', async () => {
    const tree = [Group.make().schema([Text.make('hi')])]
    const result = await resolveSchema(tree)
    assert.equal(result[0]!.type, 'group')
    assert.equal(result[0]!.children?.length, 1)
  })

  it('inherits visibility from Element', async () => {
    const tree = [
      Group.make().visible(({ values }) => values?.['kind'] === 'a').schema([
        TextField.make('inner'),
      ]),
    ]
    const shown  = await resolveSchema(tree, { values: { kind: 'a' } })
    const hidden = await resolveSchema(tree, { values: { kind: 'b' } })
    assert.equal(shown.length,  1)
    assert.equal(hidden.length, 0)
  })

  it('inherits columnSpan from Element', async () => {
    const tree = [Group.make().columnSpan(2).schema([])]
    const result = await resolveSchema(tree)
    assert.deepEqual(result[0]!._layout, { columnSpan: 2 })
  })
})

describe('Fieldset (Plan #8)', () => {
  it('serializes label, columns, and resolves children', async () => {
    const tree = [
      Fieldset.make('Address').columns(2).schema([
        TextField.make('street'),
        TextField.make('city'),
      ]),
    ]
    const result = await resolveSchema(tree)
    assert.equal(result[0]!.type,    'fieldset')
    assert.equal(result[0]!.label,   'Address')
    assert.equal(result[0]!.columns, 2)
    assert.equal(result[0]!.children?.length, 2)
  })

  it('defaults to single-column layout', async () => {
    const tree = [Fieldset.make('Group').schema([])]
    const result = await resolveSchema(tree)
    assert.equal(result[0]!.columns, 1)
  })

  it('hidden Fieldsets drop themselves and their children', async () => {
    const tree = [
      Fieldset.make('Optional')
        .visible(({ record }) => Boolean((record as { show?: boolean })?.show))
        .schema([TextField.make('a')]),
    ]
    const shown  = await resolveSchema(tree, { mode: 'edit', record: { show: true } })
    const hidden = await resolveSchema(tree, { mode: 'edit', record: { show: false } })
    assert.equal(shown.length,  1)
    assert.equal(hidden.length, 0)
  })
})

describe('Split (Plan #8)', () => {
  it('serializes type:split with from:right by default', async () => {
    const tree = [
      Split.make().schema([
        Section.make('Main').schema([TextField.make('a')]),
        Section.make('Aside').aside().schema([TextField.make('b')]),
      ]),
    ]
    const result = await resolveSchema(tree)
    assert.equal(result[0]!.type, 'split')
    assert.equal(result[0]!.from, 'right')
    assert.equal(result[0]!.gap,  6)
    assert.equal(result[0]!.children?.length, 2)
  })

  it('from(left) flips the aside side', async () => {
    const tree = [Split.make().from('left').schema([])]
    const result = await resolveSchema(tree)
    assert.equal(result[0]!.from, 'left')
  })

  it('gap() overrides the default', async () => {
    const tree = [Split.make().gap(8).schema([])]
    const result = await resolveSchema(tree)
    assert.equal(result[0]!.gap, 8)
  })

  it('inherits visibility from Element', async () => {
    const tree = [Split.make().visible(false).schema([Section.make('hidden').schema([])])]
    const result = await resolveSchema(tree)
    assert.equal(result.length, 0)
  })
})

describe('Wizard / Step (Plan #8)', () => {
  it('serializes type:wizard with default settings', async () => {
    const tree = [
      Wizard.make().steps([
        Step.make('Account').schema([TextField.make('email')]),
        Step.make('Profile').schema([TextField.make('name')]),
      ]),
    ]
    const result = await resolveSchema(tree)
    assert.equal(result[0]!.type, 'wizard')
    assert.equal(result[0]!['skippable'], false)
    assert.equal(result[0]!['startOnStep'], 0)
    assert.equal(result[0]!['persist'], true)
    assert.equal(result[0]!.children?.length, 2)
  })

  it('Step serializes label, icon, description', async () => {
    const tree = [
      Wizard.make().steps([
        Step.make('Account').icon('user').description('Login details.').schema([
          TextField.make('email'),
        ]),
      ]),
    ]
    const result = await resolveSchema(tree)
    const step = result[0]!.children![0]!
    assert.equal(step.type, 'step')
    assert.equal(step['label'], 'Account')
    assert.equal(step['icon'], 'user')
    assert.equal(step['description'], 'Login details.')
    assert.equal(step.children?.length, 1)
  })

  it('skippable + startOnStep + persist setters round-trip', async () => {
    const tree = [
      Wizard.make().skippable().startOnStep(2).persist(false).steps([
        Step.make('a').schema([]),
        Step.make('b').schema([]),
        Step.make('c').schema([]),
      ]),
    ]
    const result = await resolveSchema(tree)
    assert.equal(result[0]!['skippable'], true)
    assert.equal(result[0]!['startOnStep'], 2)
    assert.equal(result[0]!['persist'], false)
  })

  it('all step children resolve so cross-step $get works', async () => {
    // Step 2 has a Section that hides based on a value entered in Step 0;
    // both steps must be resolved on every cycle for the predicate to fire.
    const tree = [
      Wizard.make().steps([
        Step.make('a').schema([TextField.make('flag')]),
        Step.make('b').schema([
          Section.make('conditional')
            .visible(({ values }) => values?.['flag'] === 'show')
            .schema([TextField.make('inside')]),
        ]),
      ]),
    ]
    const shown = await resolveSchema(tree, { values: { flag: 'show' } })
    const hidden = await resolveSchema(tree, { values: { flag: 'hide' } })
    const stepBShown  = shown[0]!.children![1]!
    const stepBHidden = hidden[0]!.children![1]!
    // Section should appear/disappear inside step b based on the flag.
    assert.equal(stepBShown.children?.length, 1)
    assert.equal(stepBHidden.children?.length, 0)
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
