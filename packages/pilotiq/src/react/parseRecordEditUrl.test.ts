import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseRecordEditUrl, parseRecordPageUrl } from './parseRecordEditUrl.js'

test('parseRecordEditUrl: bare resource edit', () => {
  assert.deepEqual(
    parseRecordEditUrl('/admin/articles/123/edit', '/admin'),
    { resourceSlug: 'articles', recordId: '123' },
  )
})

test('parseRecordEditUrl: cluster-prefixed resource edit', () => {
  assert.deepEqual(
    parseRecordEditUrl('/admin/blog/articles/123/edit', '/admin'),
    { resourceSlug: 'blog/articles', recordId: '123' },
  )
})

test('parseRecordEditUrl: nested-relation edit picks child id', () => {
  assert.deepEqual(
    parseRecordEditUrl('/admin/articles/123/comments/456/edit', '/admin'),
    { resourceSlug: 'articles/123/comments', recordId: '456' },
  )
})

test('parseRecordEditUrl: list page returns null', () => {
  assert.equal(parseRecordEditUrl('/admin/articles', '/admin'), null)
  assert.equal(parseRecordEditUrl('/admin/articles/123', '/admin'), null)
})

test('parseRecordEditUrl: create page returns null', () => {
  assert.equal(parseRecordEditUrl('/admin/articles/create', '/admin'), null)
  assert.equal(parseRecordEditUrl('/admin/articles/123/comments/create', '/admin'), null)
})

test('parseRecordEditUrl: basePath mismatch returns null', () => {
  assert.equal(parseRecordEditUrl('/site/articles/123/edit', '/admin'), null)
})

test('parseRecordEditUrl: trailing slashes tolerated on URL', () => {
  assert.deepEqual(
    parseRecordEditUrl('/admin/articles/123/edit/', '/admin'),
    { resourceSlug: 'articles', recordId: '123' },
  )
})

test('parseRecordEditUrl: trailing slashes tolerated on basePath', () => {
  assert.deepEqual(
    parseRecordEditUrl('/admin/articles/123/edit', '/admin/'),
    { resourceSlug: 'articles', recordId: '123' },
  )
})

test('parseRecordEditUrl: root basePath', () => {
  assert.deepEqual(
    parseRecordEditUrl('/articles/123/edit', ''),
    { resourceSlug: 'articles', recordId: '123' },
  )
})

test('parseRecordEditUrl: empty path returns null', () => {
  assert.equal(parseRecordEditUrl('', '/admin'), null)
})

test('parseRecordEditUrl: too-short path returns null', () => {
  assert.equal(parseRecordEditUrl('/admin/edit', '/admin'), null)
  // 'edit' alone after basePath isn't enough — needs slug + id + 'edit'.
})

test('parseRecordEditUrl: slug-only edit (no record id) returns null', () => {
  // '/admin/123/edit' would technically match parts.length===3 with
  // 'edit' last and '123' as recordId — but with empty slug after the
  // slice. Defensive: reject when slugParts is empty.
  assert.equal(parseRecordEditUrl('/admin/edit', '/admin'), null)
})

// ─── parseRecordPageUrl (role-aware) ─────────────────────────

test('parseRecordPageUrl: edit URL returns role=edit', () => {
  assert.deepEqual(
    parseRecordPageUrl('/admin/articles/123/edit', '/admin'),
    { resourceSlug: 'articles', recordId: '123', role: 'edit' },
  )
})

test('parseRecordPageUrl: view URL returns role=view', () => {
  assert.deepEqual(
    parseRecordPageUrl('/admin/articles/123/view', '/admin'),
    { resourceSlug: 'articles', recordId: '123', role: 'view' },
  )
})

test('parseRecordPageUrl: cluster-prefixed view URL', () => {
  assert.deepEqual(
    parseRecordPageUrl('/admin/blog/articles/123/view', '/admin'),
    { resourceSlug: 'blog/articles', recordId: '123', role: 'view' },
  )
})

test('parseRecordPageUrl: terminal token other than edit|view returns null', () => {
  // 'delete' / 'restore' / 'force-delete' are POST handlers, not pages.
  assert.equal(parseRecordPageUrl('/admin/articles/123/delete', '/admin'), null)
  assert.equal(parseRecordPageUrl('/admin/articles/123/restore', '/admin'), null)
  // Custom record sub-pages also fall through here — they have their own
  // gate path (not record-bound for collab purposes in v1).
  assert.equal(parseRecordPageUrl('/admin/articles/123/history', '/admin'), null)
})

test('parseRecordPageUrl: view URL in nested-relation form', () => {
  assert.deepEqual(
    parseRecordPageUrl('/admin/articles/123/comments/456/view', '/admin'),
    { resourceSlug: 'articles/123/comments', recordId: '456', role: 'view' },
  )
})

// ─── Legacy alias: parseRecordEditUrl filters view URLs ──────

test('parseRecordEditUrl: view URL returns null (back-compat: edit-only)', () => {
  // A consumer still calling the legacy `parseRecordEditUrl` should
  // continue to see view URLs filtered out — only edit URLs round-trip.
  assert.equal(parseRecordEditUrl('/admin/articles/123/view', '/admin'), null)
})
