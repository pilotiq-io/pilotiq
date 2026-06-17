import { test } from 'node:test'
import assert from 'node:assert/strict'
import { acceptMatches } from './helpers.js'

const file = (name: string, type: string): File =>
  new File([new Uint8Array([0])], name, { type })

test('acceptMatches — MIME wildcard accepts matching subtype', () => {
  assert.equal(acceptMatches('image/*', file('a.png', 'image/png')), true)
  assert.equal(acceptMatches('image/*', file('a.jpg', 'image/jpeg')), true)
  assert.equal(acceptMatches('video/*', file('a.png', 'image/png')), false)
})

test('acceptMatches — exact MIME match', () => {
  assert.equal(acceptMatches('image/png', file('a.png', 'image/png')), true)
  assert.equal(acceptMatches('image/png', file('a.jpg', 'image/jpeg')), false)
})

test('acceptMatches — catch-alls accept anything', () => {
  assert.equal(acceptMatches('*', file('a.bin', 'application/octet-stream')), true)
  assert.equal(acceptMatches('*/*', file('a.bin', 'application/octet-stream')), true)
})

test('acceptMatches — file-extension pattern matches by name', () => {
  assert.equal(acceptMatches('.pdf', file('report.pdf', 'application/pdf')), true)
  // extension wins even when the browser reports a generic type
  assert.equal(acceptMatches('.csv', file('data.csv', 'application/octet-stream')), true)
  assert.equal(acceptMatches('.pdf', file('report.txt', 'text/plain')), false)
})

test('acceptMatches — case-insensitive on type and extension', () => {
  assert.equal(acceptMatches('IMAGE/*', file('a.png', 'IMAGE/PNG')), true)
  assert.equal(acceptMatches('.PNG', file('A.png', 'image/png')), true)
})
