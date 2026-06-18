import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { media } from './plugin.js'
import { categorize } from './types.js'
import {
  registerLibrary,
  getLibrary,
  getDefaultLibrary,
  getLibraryNames,
  resetLibraries,
} from './registry.js'

beforeEach(() => resetLibraries())

// Minimal fake panel — `register()` appends the library page via
// `panel.pages([...panel.getConfig().pages, MediaLibraryPage])` and reads
// `panel.getConfig().path` to scope library registration.
function fakePanel(path = '/admin') {
  let pages: unknown[] = []
  return {
    panel: { getConfig: () => ({ pages, path }), pages: (p: unknown[]) => { pages = p } } as never,
    getPages: () => pages,
  }
}

test('media() returns a PilotiqPlugin with the package name', () => {
  const plugin = media()
  assert.equal(plugin.name, '@pilotiq/media')
  assert.equal(typeof plugin.register, 'function')
})

test('media().register() registers a default library from sensible fallbacks', () => {
  const plugin = media()
  const { panel } = fakePanel()
  assert.doesNotThrow(() => plugin.register(panel))
  assert.deepEqual(getDefaultLibrary('/admin'), { disk: 'public', directory: 'media' })
  assert.deepEqual(getLibraryNames('/admin'), ['default'])
})

test('media().register() appends the library page to the panel', () => {
  const plugin = media()
  const { panel, getPages } = fakePanel()
  plugin.register(panel)
  const pages = getPages() as Array<{ getSlug?: () => string }>
  assert.equal(pages.length, 1)
  assert.equal(pages[0]?.getSlug?.(), 'media')
})

test('top-level MediaConfig fields form the default library', () => {
  media({
    disk: 'r2',
    directory: 'assets',
    acceptedMimes: ['image/*'],
    maxUploadSize: 5_000_000,
  }).register(fakePanel().panel)

  assert.deepEqual(getDefaultLibrary('/admin'), {
    disk: 'r2',
    directory: 'assets',
    accept: ['image/*'],
    maxUploadSize: 5_000_000,
  })
})

test('metaFields are serialized to FieldMeta on the registered library', () => {
  // A core-field-shaped stub (only toMeta() is contractually required).
  const field = (name: string, label: string) => ({
    toMeta: () => ({ name, label, fieldType: 'text' }),
  })
  media({
    metaFields: [field('credit', 'Credit'), field('license', 'License')],
  }).register(fakePanel().panel)

  const lib = getDefaultLibrary('/admin')
  assert.deepEqual(lib.metaFields, [
    { name: 'credit', label: 'Credit', fieldType: 'text' },
    { name: 'license', label: 'License', fieldType: 'text' },
  ])
})

test('named libraries register alongside the default', () => {
  media({
    libraries: {
      photos: { disk: 'public', directory: 'photos', acceptedMimes: ['image/*'] },
      docs:   { disk: 'public', directory: 'docs' },
    },
  }).register(fakePanel().panel)

  assert.deepEqual(getLibraryNames('/admin').sort(), ['default', 'docs', 'photos'])
  assert.equal(getLibrary('/admin', 'photos')?.directory, 'photos')
  assert.deepEqual(getLibrary('/admin', 'photos')?.accept, ['image/*'])
  // A named lib without disk/directory still falls back to the defaults.
  assert.deepEqual(getLibrary('/admin', 'docs'), { disk: 'public', directory: 'docs' })
})

test('getLibrary returns undefined for an unregistered name', () => {
  assert.equal(getLibrary('/admin', 'nope'), undefined)
})

test('getDefaultLibrary falls back before any registration', () => {
  assert.deepEqual(getDefaultLibrary(), { disk: 'public', directory: 'media' })
})

test('two panels with the same library name do not clobber each other', () => {
  const field = (name: string) => ({ toMeta: () => ({ name, fieldType: 'text' }) })

  media({ metaFields: [field('credit')] }).register(fakePanel('/admin').panel)
  media({ metaFields: [field('caption')] }).register(fakePanel('/guest').panel)

  const admin = getDefaultLibrary('/admin')
  const guest = getDefaultLibrary('/guest')

  assert.deepEqual(admin.metaFields?.map(f => f['name']), ['credit'])
  assert.deepEqual(guest.metaFields?.map(f => f['name']), ['caption'])
})

test('scoped lookup falls back to unscoped registration', () => {
  // Unscoped registration (backward-compat 2-arg form).
  registerLibrary('default', { disk: 'r2', directory: 'legacy' })

  // Scoped lookup finds the unscoped entry as a fallback.
  assert.deepEqual(getLibrary('/any-panel', 'default'), { disk: 'r2', directory: 'legacy' })
  assert.deepEqual(getDefaultLibrary('/any-panel'), { disk: 'r2', directory: 'legacy' })
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
