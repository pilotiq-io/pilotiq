import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  sanitizeIconSvg,
  buildAlertIconSvg,
  resolveAlertIconInner,
  ALERT_ICONS,
} from './alertVariants.js'

test('sanitizeIconSvg keeps a clean SVG (allowed tags + attrs)', () => {
  const out = sanitizeIconSvg('<svg viewBox="0 0 24 24"><path d="M4 4h16v16H4z" stroke="currentColor"/></svg>')
  assert.match(out, /^<svg/)
  assert.match(out, /<path d="M4 4h16v16H4z" stroke="currentColor"/)
})

test('sanitizeIconSvg strips <script> and its content', () => {
  const out = sanitizeIconSvg('<svg><script>alert(1)</script><path d="M0 0"/></svg>')
  assert.doesNotMatch(out, /script/i)
  assert.doesNotMatch(out, /alert\(1\)/)
  assert.match(out, /<path d="M0 0"/)
})

test('sanitizeIconSvg strips event-handler attributes', () => {
  const out = sanitizeIconSvg('<svg onload="alert(1)"><circle cx="1" cy="1" r="1" onclick="x()"/></svg>')
  assert.doesNotMatch(out, /onload/i)
  assert.doesNotMatch(out, /onclick/i)
  assert.match(out, /<circle cx="1" cy="1" r="1"\s*\/?>/)
})

test('sanitizeIconSvg drops external-reference elements (use / image / a) + href', () => {
  const out = sanitizeIconSvg('<svg><use href="http://evil/x#a"/><image href="http://evil/x.png"/><a href="javascript:x()"><path d="M0 0"/></a></svg>')
  assert.doesNotMatch(out, /<use|<image|<a\b|href=/i)
  assert.match(out, /<path d="M0 0"/)
})

test('sanitizeIconSvg strips <foreignObject> and <style> blocks', () => {
  const out = sanitizeIconSvg('<svg><foreignObject><iframe src="x"></iframe></foreignObject><style>*{x:y}</style><path d="M0 0"/></svg>')
  assert.doesNotMatch(out, /foreignObject|iframe|style/i)
  assert.match(out, /<path d="M0 0"/)
})

test('sanitizeIconSvg rejects non-svg input', () => {
  assert.equal(sanitizeIconSvg('<div>nope</div>'), '')
  assert.equal(sanitizeIconSvg('plain text'), '')
  assert.equal(sanitizeIconSvg(''), '')
  assert.equal(sanitizeIconSvg(null), '')
})

test('buildAlertIconSvg: sanitized custom svg wins over the library', () => {
  const out = buildAlertIconSvg('rocket', '<svg><path d="M1 1"/></svg>', 'info')
  assert.match(out, /M1 1/)
  assert.doesNotMatch(out, /M4\.5 16\.5/) // not the rocket default
})

test('buildAlertIconSvg: falls back to library key, then variant default', () => {
  assert.match(buildAlertIconSvg('rocket', '', 'info'), new RegExp('M4\\.5 16\\.5'))
  const def = buildAlertIconSvg('', '', 'warning')
  assert.ok(def.includes(ALERT_ICONS['warning'] as string))
})

test('buildAlertIconSvg: a malicious custom svg falls back safely (sanitizes to empty → library)', () => {
  const out = buildAlertIconSvg('check', '<script>alert(1)</script>', 'info')
  assert.doesNotMatch(out, /script/i)
  assert.ok(out.includes(resolveAlertIconInner('check', 'info')))
})
