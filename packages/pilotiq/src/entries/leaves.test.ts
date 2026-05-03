import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { resolveSchema, _resetResolverRegistry } from '../schema/resolveSchema.js'
import { BadgeEntry } from './BadgeEntry.js'
import { IconEntry }  from './IconEntry.js'
import { ImageEntry } from './ImageEntry.js'
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

describe('Phase 2 leaf — common Entry inheritance', () => {
  it('every leaf inherits label / state / formatStateUsing', async () => {
    const out = await resolveSchema(
      [
        BadgeEntry.make('status').label('Stage'),
        IconEntry.make('verified').formatStateUsing(v => (v ? 'Y' : 'N')),
        ImageEntry.make('avatarUrl').helperText('Profile picture'),
      ],
      { record: { status: 'draft', verified: false, avatarUrl: 'a.png' } },
    )
    assert.equal(out[0]!['label'],     'Stage')
    assert.equal(out[1]!['_formatted'], 'N')
    assert.equal(out[2]!['helperText'], 'Profile picture')
  })
})
