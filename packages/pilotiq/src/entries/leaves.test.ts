import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { resolveSchema, _resetResolverRegistry } from '../schema/resolveSchema.js'
import { BadgeEntry }    from './BadgeEntry.js'
import { IconEntry }     from './IconEntry.js'
import { ImageEntry }    from './ImageEntry.js'
import { KeyValueEntry } from './KeyValueEntry.js'
import { ColorEntry }    from './ColorEntry.js'
import type { EntryMeta } from './Entry.js'

beforeEach(() => _resetResolverRegistry())

describe('BadgeEntry', () => {
  it('serializes the discriminator + value', async () => {
    const out = await resolveSchema(
      [BadgeEntry.make('status')],
      { record: { status: 'draft' } },
    )
    const m = out[0] as EntryMeta
    assert.equal(m.entryType, 'badge')
    assert.equal(m.value, 'draft')
  })

  it('emits the colors map when set', async () => {
    const out = await resolveSchema(
      [BadgeEntry.make('status').colors({ draft: 'gray', published: 'success' })],
      { record: { status: 'published' } },
    )
    const m = out[0] as EntryMeta & { colors?: Record<string, string> }
    assert.deepEqual(m.colors, { draft: 'gray', published: 'success' })
  })

  it('omits the colors key when no colors() call', async () => {
    const out = await resolveSchema([BadgeEntry.make('status')], { record: { status: 'a' } })
    const m = out[0] as EntryMeta & { colors?: Record<string, string> }
    assert.equal(m.colors, undefined)
  })

  it('successive colors() calls merge rather than replace', async () => {
    const out = await resolveSchema(
      [BadgeEntry.make('status').colors({ draft: 'gray' }).colors({ published: 'success' })],
      { record: { status: 'published' } },
    )
    const m = out[0] as EntryMeta & { colors?: Record<string, string> }
    assert.deepEqual(m.colors, { draft: 'gray', published: 'success' })
  })
})

describe('IconEntry', () => {
  it('serializes the discriminator + value', async () => {
    const out = await resolveSchema(
      [IconEntry.make('verified')],
      { record: { verified: true } },
    )
    const m = out[0] as EntryMeta
    assert.equal(m.entryType, 'icon')
    assert.equal(m.value, true)
  })

  it('emits the options map when set', async () => {
    const out = await resolveSchema(
      [
        IconEntry.make('verified').options({
          true:  { icon: 'check-circle', color: 'success' },
          false: { icon: 'x-circle',     color: 'destructive', label: 'Unverified' },
        }),
      ],
      { record: { verified: false } },
    )
    const m = out[0] as EntryMeta & { options?: Record<string, { icon: string }> }
    assert.deepEqual(m.options, {
      true:  { icon: 'check-circle', color: 'success' },
      false: { icon: 'x-circle',     color: 'destructive', label: 'Unverified' },
    })
  })

  it('omits the options key when no options() call', async () => {
    const out = await resolveSchema([IconEntry.make('verified')], { record: { verified: true } })
    const m = out[0] as EntryMeta & { options?: unknown }
    assert.equal(m.options, undefined)
  })
})

describe('ImageEntry', () => {
  it('serializes the discriminator + value (URL)', async () => {
    const out = await resolveSchema(
      [ImageEntry.make('avatarUrl')],
      { record: { avatarUrl: 'https://cdn.example.com/a.png' } },
    )
    const m = out[0] as EntryMeta
    assert.equal(m.entryType, 'image')
    assert.equal(m.value, 'https://cdn.example.com/a.png')
  })

  it('default size 64×64, rounded shape', async () => {
    const out = await resolveSchema(
      [ImageEntry.make('avatarUrl')],
      { record: { avatarUrl: 'a.png' } },
    )
    const m = out[0] as EntryMeta & {
      imageWidth?: number; imageHeight?: number; imageSize?: number; imageShape?: string
    }
    assert.equal(m.imageWidth,  64)
    assert.equal(m.imageHeight, 64)
    assert.equal(m.imageSize,   64) // square ⇒ size shorthand emitted
    assert.equal(m.imageShape,  'rounded')
  })

  it('width / height set independently', async () => {
    const out = await resolveSchema(
      [ImageEntry.make('hero').width(800).height(400)],
      { record: { hero: 'h.png' } },
    )
    const m = out[0] as EntryMeta & {
      imageWidth?: number; imageHeight?: number; imageSize?: number
    }
    assert.equal(m.imageWidth,  800)
    assert.equal(m.imageHeight, 400)
    assert.equal(m.imageSize,   undefined) // non-square ⇒ no size shorthand
  })

  it('dimensions() sugar fills both', async () => {
    const out = await resolveSchema(
      [ImageEntry.make('avatarUrl').dimensions(96)],
      { record: { avatarUrl: 'a.png' } },
    )
    const m = out[0] as EntryMeta & {
      imageWidth?: number; imageHeight?: number; imageSize?: number
    }
    assert.equal(m.imageWidth,  96)
    assert.equal(m.imageHeight, 96)
    assert.equal(m.imageSize,   96)
  })

  it('shape — square / rounded / circle', async () => {
    const cases: { make: () => ImageEntry; expected: string }[] = [
      { make: () => ImageEntry.make('a').square(),  expected: 'square' },
      { make: () => ImageEntry.make('a').rounded(), expected: 'rounded' },
      { make: () => ImageEntry.make('a').circle(),  expected: 'circle' },
    ]
    for (const { make, expected } of cases) {
      const out = await resolveSchema([make()], { record: { a: 'a.png' } })
      const m = out[0] as EntryMeta & { imageShape?: string }
      assert.equal(m.imageShape, expected)
    }
  })
})

describe('KeyValueEntry', () => {
  it('serializes the discriminator + value', async () => {
    const out = await resolveSchema(
      [KeyValueEntry.make('headers')],
      { record: { headers: { 'X-Source': 'admin', 'X-Trace': 'abc' } } },
    )
    const m = out[0] as EntryMeta
    assert.equal(m.entryType, 'keyValue')
    assert.deepEqual(m.value, { 'X-Source': 'admin', 'X-Trace': 'abc' })
  })

  it('emits default key/value labels', async () => {
    const out = await resolveSchema(
      [KeyValueEntry.make('headers')],
      { record: { headers: {} } },
    )
    const m = out[0] as EntryMeta & { keyLabel?: string; valueLabel?: string }
    assert.equal(m.keyLabel,   'Key')
    assert.equal(m.valueLabel, 'Value')
  })

  it('keyLabel / valueLabel overrides', async () => {
    const out = await resolveSchema(
      [KeyValueEntry.make('headers').keyLabel('Header').valueLabel('Setting')],
      { record: { headers: {} } },
    )
    const m = out[0] as EntryMeta & { keyLabel?: string; valueLabel?: string }
    assert.equal(m.keyLabel,   'Header')
    assert.equal(m.valueLabel, 'Setting')
  })

  it('passes raw object through (renderer-side normalization)', async () => {
    const out = await resolveSchema(
      [KeyValueEntry.make('meta')],
      { record: { meta: { count: 3, nested: { a: 1 } } } },
    )
    const m = out[0] as EntryMeta
    assert.deepEqual(m.value, { count: 3, nested: { a: 1 } })
  })

  it('passes JSON-string values through unmodified (renderer parses)', async () => {
    const json = '{"a":1,"b":"two"}'
    const out  = await resolveSchema(
      [KeyValueEntry.make('settings')],
      { record: { settings: json } },
    )
    assert.equal((out[0] as EntryMeta).value, json)
  })
})

describe('ColorEntry', () => {
  it('serializes the discriminator + value', async () => {
    const out = await resolveSchema(
      [ColorEntry.make('brandColor')],
      { record: { brandColor: '#d97757' } },
    )
    const m = out[0] as EntryMeta
    assert.equal(m.entryType, 'color')
    assert.equal(m.value,     '#d97757')
  })

  it('default size 24×24, rounded shape, value visible', async () => {
    const out = await resolveSchema(
      [ColorEntry.make('c')],
      { record: { c: '#000' } },
    )
    const m = out[0] as EntryMeta & {
      colorWidth?: number; colorHeight?: number; colorSize?: number
      colorShape?: string; showValue?: boolean
    }
    assert.equal(m.colorWidth,  24)
    assert.equal(m.colorHeight, 24)
    assert.equal(m.colorSize,   24)
    assert.equal(m.colorShape,  'rounded')
    assert.equal(m.showValue,   undefined)
  })

  it('width / height set independently — no size shorthand', async () => {
    const out = await resolveSchema(
      [ColorEntry.make('c').width(64).height(32)],
      { record: { c: '#fff' } },
    )
    const m = out[0] as EntryMeta & {
      colorWidth?: number; colorHeight?: number; colorSize?: number
    }
    assert.equal(m.colorWidth,  64)
    assert.equal(m.colorHeight, 32)
    assert.equal(m.colorSize,   undefined)
  })

  it('dimensions() sugar fills both', async () => {
    const out = await resolveSchema(
      [ColorEntry.make('c').dimensions(48)],
      { record: { c: '#aabbcc' } },
    )
    const m = out[0] as EntryMeta & { colorWidth?: number; colorSize?: number }
    assert.equal(m.colorWidth, 48)
    assert.equal(m.colorSize,  48)
  })

  it('shape — square / rounded / circle', async () => {
    const cases: { make: () => ColorEntry; expected: string }[] = [
      { make: () => ColorEntry.make('c').square(),  expected: 'square' },
      { make: () => ColorEntry.make('c').rounded(), expected: 'rounded' },
      { make: () => ColorEntry.make('c').circle(),  expected: 'circle' },
    ]
    for (const { make, expected } of cases) {
      const out = await resolveSchema([make()], { record: { c: '#fff' } })
      const m = out[0] as EntryMeta & { colorShape?: string }
      assert.equal(m.colorShape, expected)
    }
  })

  it('hideValue() flips showValue=false', async () => {
    const out = await resolveSchema(
      [ColorEntry.make('c').hideValue()],
      { record: { c: '#000' } },
    )
    assert.equal((out[0] as EntryMeta & { showValue?: boolean }).showValue, false)
  })

  it('hideValue(false) restores default (omits showValue)', async () => {
    const out = await resolveSchema(
      [ColorEntry.make('c').hideValue().hideValue(false)],
      { record: { c: '#000' } },
    )
    assert.equal((out[0] as EntryMeta & { showValue?: boolean }).showValue, undefined)
  })
})

describe('Phase 2 leaf — common Entry inheritance', () => {
  it('every leaf inherits label / state / formatStateUsing', async () => {
    const out = await resolveSchema(
      [
        BadgeEntry.make('status').label('Stage'),
        IconEntry.make('verified').formatStateUsing(v => (v ? 'Y' : 'N')),
        ImageEntry.make('avatarUrl').helperText('Profile picture'),
        KeyValueEntry.make('headers').inlineLabel(),
        ColorEntry.make('brandColor').tooltip('Hex sRGB'),
      ],
      {
        record: {
          status:      'draft',
          verified:    false,
          avatarUrl:   'a.png',
          headers:     { 'X-Foo': '1' },
          brandColor:  '#d97757',
        },
      },
    )
    assert.equal(out[0]!['label'],       'Stage')
    assert.equal(out[1]!['_formatted'],  'N')
    assert.equal(out[2]!['helperText'],  'Profile picture')
    assert.equal(out[3]!['inlineLabel'], true)
    assert.equal(out[4]!['tooltip'],     'Hex sRGB')
  })
})
