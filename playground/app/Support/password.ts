import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

/**
 * Minimal scrypt password hashing for the demo login flow. Server-only
 * (node:crypto) — imported by the seeder and routes/web.ts, never by
 * panel modules. Real apps use `@rudderjs/auth`, which owns hashing.
 *
 * Stored format: `scrypt:<salt-hex>:<hash-hex>`.
 */
export function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(plain, salt, 32).toString('hex')
  return `scrypt:${salt}:${hash}`
}

export function verifyPassword(plain: string, stored: string | null | undefined): boolean {
  if (!stored) return false
  const [scheme, salt, hash] = stored.split(':')
  if (scheme !== 'scrypt' || !salt || !hash) return false
  const expected = Buffer.from(hash, 'hex')
  const candidate = scryptSync(plain, salt, expected.length)
  return candidate.length === expected.length && timingSafeEqual(candidate, expected)
}
