import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { resolveSchema, _resetResolverRegistry } from './resolveSchema.js'
import { Image } from './Image.js'
import { Icon } from './Icon.js'
import { Text } from './Text.js'

beforeEach(() => _resetResolverRegistry())

describe('Image prime', () => {
  it('serializes url + defaults', async () => {
    const tree = [Image.make('https://cdn.example.com/avatar.png')]
    const out = await resolveSchema(tree)
    assert.equal(out[0]!.type,  'image')
    assert.equal(out[0]!['url'],   'https://cdn.example.com/avatar.png')
    assert.equal(out[0]!['alt'],   '')
    assert.equal(out[0]!['shape'], 'square')
    assert.equal(out[0]!['width'],  undefined)
    assert.equal(out[0]!['height'], undefined)
  })

  it('honors alt / width / height / circle', async () => {
    const tree = [Image.make('a.png').alt('avatar').width(64).height(48).circle()]
    const out = await resolveSchema(tree)
    assert.equal(out[0]!['alt'],    'avatar')
    assert.equal(out[0]!['width'],  64)
    assert.equal(out[0]!['height'], 48)
    assert.equal(out[0]!['shape'],  'circle')
  })

  it('size() sugar fills both dimensions', async () => {
    const tree = [Image.make('a.png').size(40)]
    const out = await resolveSchema(tree)
    assert.equal(out[0]!['width'],  40)
    assert.equal(out[0]!['height'], 40)
  })

  it('rounded() sets shape', async () => {
    const tree = [Image.make('a.png').rounded()]
    const out = await resolveSchema(tree)
    assert.equal(out[0]!['shape'], 'rounded')
  })
})

describe('Icon prime', () => {
  it('serializes name + defaults', async () => {
    const tree = [Icon.make('check')]
    const out = await resolveSchema(tree)
    assert.equal(out[0]!.type,  'icon')
    assert.equal(out[0]!['name'],  'check')
    assert.equal(out[0]!['size'],  16)
    assert.equal(out[0]!['color'], 'default')
    assert.equal(out[0]!['label'], undefined)
  })

  it('honors size / color / label', async () => {
    const tree = [Icon.make('check').size(24).color('success').label('Done')]
    const out = await resolveSchema(tree)
    assert.equal(out[0]!['size'],  24)
    assert.equal(out[0]!['color'], 'success')
    assert.equal(out[0]!['label'], 'Done')
  })
})

describe('Text formatting setters', () => {
  it('plain Text emits no formatting keys', async () => {
    const tree = [Text.make('hello')]
    const out = await resolveSchema(tree)
    assert.equal(out[0]!.type,    'text')
    assert.equal(out[0]!['content'], 'hello')
    assert.equal(out[0]!['color'],   undefined)
    assert.equal(out[0]!['size'],    undefined)
    assert.equal(out[0]!['weight'],  undefined)
    assert.equal(out[0]!['badge'],   undefined)
  })

  it('color / size / weight ride through', async () => {
    const tree = [Text.make('hi').color('success').size('lg').weight('semibold')]
    const out = await resolveSchema(tree)
    assert.equal(out[0]!['color'],  'success')
    assert.equal(out[0]!['size'],   'lg')
    assert.equal(out[0]!['weight'], 'semibold')
  })

  it('badge() flips on the pill rendering flag', async () => {
    const tree = [Text.make('Active').badge()]
    const out = await resolveSchema(tree)
    assert.equal(out[0]!['badge'], true)
    assert.equal(out[0]!['badgeColor'], undefined)
  })

  it('badgeColor() implies badge=true', async () => {
    const tree = [Text.make('Pending').badgeColor('warning')]
    const out = await resolveSchema(tree)
    assert.equal(out[0]!['badge'],      true)
    assert.equal(out[0]!['badgeColor'], 'warning')
  })

  it('badge(false) disables the flag', async () => {
    const tree = [Text.make('hi').badge(false)]
    const out = await resolveSchema(tree)
    assert.equal(out[0]!['badge'], undefined)
  })
})
