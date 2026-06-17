import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import type { MediaPreviewComponent } from './registry.js'
import {
  registerMediaPreview,
  registerMediaPreviews,
  getMediaPreview,
  resolveMediaPreview,
  getMediaPreviewCategories,
  resetMediaPreviews,
} from './registry.js'

// Sentinel "components" — identity is all these tests check.
const Image = (() => null) as unknown as MediaPreviewComponent
const Pdf = (() => null) as unknown as MediaPreviewComponent
const Fallback = (() => null) as unknown as MediaPreviewComponent

beforeEach(() => resetMediaPreviews())

test('register + get by category', () => {
  registerMediaPreview('image', Image)
  assert.equal(getMediaPreview('image'), Image)
  assert.equal(getMediaPreview('video'), undefined)
})

test('registerMediaPreviews registers many', () => {
  registerMediaPreviews({ image: Image, pdf: Pdf })
  assert.equal(getMediaPreview('image'), Image)
  assert.equal(getMediaPreview('pdf'), Pdf)
  assert.deepEqual(getMediaPreviewCategories().sort(), ['image', 'pdf'])
})

test('resolveMediaPreview maps mime → category renderer', () => {
  registerMediaPreviews({ image: Image, pdf: Pdf })
  assert.equal(resolveMediaPreview('image/png'), Image)
  assert.equal(resolveMediaPreview('application/pdf'), Pdf)
})

test('resolveMediaPreview falls back to the "other" renderer', () => {
  registerMediaPreviews({ image: Image, other: Fallback })
  // application/zip → 'archive' (no renderer) → falls back to 'other'.
  assert.equal(resolveMediaPreview('application/zip'), Fallback)
  // null mime → 'other'.
  assert.equal(resolveMediaPreview(null), Fallback)
})

test('resolveMediaPreview returns undefined when nothing is registered', () => {
  assert.equal(resolveMediaPreview('image/png'), undefined)
})

test('re-registering a category replaces it', () => {
  registerMediaPreview('image', Image)
  registerMediaPreview('image', Pdf)
  assert.equal(getMediaPreview('image'), Pdf)
})
