import { Route } from '@rudderjs/router'
import { app } from '@rudderjs/core'
import { Auth, AuthMiddleware, PasswordBroker, MemoryTokenRepository, EloquentUserProvider, runWithAuth, AuthManager } from '@rudderjs/auth'
import { Hash } from '@rudderjs/hash'
import { RateLimit } from '@rudderjs/middleware'
import { User } from '../app/Models/User.js'

// Auth rate limit — keyed by IP + path so each endpoint (sign-in, sign-out, sign-up)
// has its own counter per client.
const authLimit = RateLimit.perMinute(10)
  .by(req => {
    const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim()
      ?? (req.headers['x-real-ip'] as string | undefined)
      ?? 'unknown'
    return `${ip}:${req.path}`
  })
  .message('Too many auth attempts. Try again later.')

// GET /api/me — returns current user (null if not logged in)
Route.get('/api/me', async (req) => {
  const user = (req.raw as Record<string, unknown>)['__rjs_user'] ?? null
  return Response.json({ user })
}, [AuthMiddleware()])

// ── Auth Routes ──────────────────────────────────────────

// POST /api/auth/sign-up/email — register
Route.post('/api/auth/sign-up/email', async (req, res) => {
  const { name, email, password } = req.body as { name: string; email: string; password: string }
  if (!name || !email || !password) return res.status(422).json({ message: 'Name, email, and password are required.' })
  if (password.length < 8) return res.status(422).json({ message: 'Password must be at least 8 characters.' })

  const existing = await User.query().where('email', email).first()
  if (existing) return res.status(409).json({ message: 'An account with that email already exists.' })

  const hashed = await Hash.make(password)
  const user = await User.create({ name, email, password: hashed })

  const manager = app().make<AuthManager>('auth.manager')
  await runWithAuth(manager, async () => {
    const authenticatable = { getAuthIdentifier: () => String(user.id), getAuthPassword: () => hashed, getRememberToken: () => null, setRememberToken: () => {} }
    await Auth.login(authenticatable)
  })

  return res.json({ user: { id: user.id, name: user.name, email: user.email } })
}, [authLimit])

// POST /api/auth/sign-in/email — login
Route.post('/api/auth/sign-in/email', async (req, res) => {
  const { email, password } = req.body as { email: string; password: string }
  if (!email || !password) return res.status(422).json({ message: 'Email and password are required.' })

  const manager = app().make<AuthManager>('auth.manager')
  let success = false
  await runWithAuth(manager, async () => {
    success = await Auth.attempt({ email, password })
  })

  if (!success) return res.status(401).json({ message: 'Invalid email or password.' })
  return res.json({ ok: true })
}, [authLimit])

// POST /api/auth/sign-out — logout
Route.post('/api/auth/sign-out', async (req, res) => {
  const manager = app().make<AuthManager>('auth.manager')
  await runWithAuth(manager, async () => {
    await Auth.logout()
  })
  return res.json({ ok: true })
})

// POST /api/auth/request-password-reset
const tokenRepo = new MemoryTokenRepository()
const passwordBroker = new PasswordBroker(
  tokenRepo,
  new EloquentUserProvider(User as any, (plain, hashed) => Hash.check(plain, hashed)),
  { expire: 60, throttle: 60 },
)

Route.post('/api/auth/request-password-reset', async (req, res) => {
  const { email } = req.body as { email: string }
  if (!email) return res.status(422).json({ message: 'Email is required.' })

  const status = await passwordBroker.sendResetLink({ email }, async (_user, token) => {
    const resetUrl = `${process.env['APP_URL'] ?? 'http://localhost:3001'}/reset-password?token=${token}&email=${email}`
    console.log(`[Auth] Password reset for ${email}: ${resetUrl}`)
  })

  return res.json({ status: status === 'RESET_LINK_SENT' ? 'sent' : 'sent' })
}, [authLimit])

// POST /api/auth/reset-password
Route.post('/api/auth/reset-password', async (req, res) => {
  const { token, email, newPassword } = req.body as { token: string; email?: string; newPassword: string }
  if (!token || !newPassword) return res.status(422).json({ message: 'Token and new password are required.' })

  const userEmail = email ?? ''
  if (!userEmail) return res.status(422).json({ message: 'Email is required.' })

  const status = await passwordBroker.reset(
    { email: userEmail, token, password: newPassword },
    async (user, password) => {
      const hashed = await Hash.make(password)
      await User.query().where('id', user.getAuthIdentifier()).update({ password: hashed })
    },
  )

  if (status === 'PASSWORD_RESET') return res.json({ ok: true })
  if (status === 'TOKEN_EXPIRED') return res.status(400).json({ message: 'Reset token has expired.' })
  return res.status(400).json({ message: 'Invalid or expired token.' })
}, [authLimit])

// Catch-all: any unmatched /api/* route returns 404 instead of falling through to Vike
Route.all('/api/*', (_req, res) => res.status(404).json({ message: 'Route not found.' }))
