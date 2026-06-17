import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { media } from './plugin.js'
import { categorize } from './types.js'
import {
  getLibrary,
  getDefaultLibrary,
  getLibraryNames,
  resetLibraries,
} from './registry.js'

beforeEach(() => resetLibraries())

test('media() returns a PilotiqPlugin with the package name', () => {
  const plugin = media()
  assert.equal(plugin.name, '@pilotiq/media')
  assert.equal(typeof plugin.register, 'function')
})

test('media().register() registers a default library from sensible fallbacks', () => {
  const plugin = media()
  assert.doesNotThrow(() => plugin.register({} as never))
  assert.deepEqual(getDefaultLibrary(), { disk: 'public', directory: 'media' })
  assert.deepEqual(getLibraryNames(), ['default'])
})

test('top-level MediaConfig fields form the default library', () => {
  media({
    disk: 'r2',
    directory: 'assets',
    acceptedMimes: ['image/*'],
    maxUploadSize: 5_000_000,
  }).register({} as never)

  assert.deepEqual(getDefaultLibrary(), {
    disk: 'r2',
    directory: 'assets',
    accept: ['image/*'],
    maxUploadSize: 5_000_000,
  })
})

test('named libraries register alongside the default', () => {
  media({
    libraries: {
      photos: { disk: 'public', directory: 'photos', acceptedMimes: ['image/*'] },
      docs:   { disk: 'public', directory: 'docs' },
    },
  }).register({} as never)

  assert.deepEqual(getLibraryNames().sort(), ['default', 'docs', 'photos'])
  assert.equal(getLibrary('photos')?.directory, 'photos')
  assert.deepEqual(getLibrary('photos')?.accept, ['image/*'])
  // A named lib without disk/directory still falls back to the defaults.
  assert.deepEqual(getLibrary('docs'), { disk: 'public', directory: 'docs' })
})

test('getLibrary returns undefined for an unregistered name', () => {
  assert.equal(getLibrary('nope'), undefined)
})

test('getDefaultLibrary falls back before any registration', () => {
  assert.deepEqual(getDefaultLibrary(), { disk: 'public', directory: 'media' })
})

test('categorize() maps MIME types to preview categories', () => {
  assert.equal(categorize('image/png'), 'image')
  assert.equal(categorize('video/mp4'), 'video')
  assert.equal(categorize('audio/mpeg'), 'audio')
  assert.equal(categorize('application/pdf'), 'pdf')
  assert.equal(categorize('application/vnd.openxmlformats-officedocument.wordprocessingml.document'), 'document')
  assert.equal(categorize('text/csv'), 'spreadsheet')
  assert.equal(categorize('text/markdown'), 'text')
  assert.equal(categorize('application/zip'), 'archive')
  assert.equal(categorize('application/octet-stream'), 'other')
  assert.equal(categorize(null), 'other')
})
