import type { CSSProperties } from 'react'
import { usePageContext } from 'vike-react/usePageContext'

// Demo sign-in for the guarded /admin panel. Plain full-page form post
// to POST /login (routes/web.ts) — no SPA wiring needed, the 303 lands
// back on the panel (or here with ?error=1). The guard stamps the
// originally-requested URL as ?redirect=, carried through the hidden
// input so sign-in bounces back where the user was headed.

const inputStyle: CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '0.55rem 0.75rem',
  border: '1px solid #d4d0cb', borderRadius: '0.5rem', fontSize: '0.9rem',
  fontFamily: 'inherit', outline: 'none', background: '#fff', color: '#1a1a1a',
}

const labelStyle: CSSProperties = {
  display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#444',
  marginBottom: '0.3rem',
}

export default function Page() {
  const ctx = usePageContext() as { urlParsed?: { search?: Record<string, string> } }
  const search = ctx.urlParsed?.search ?? {}
  const failed = search.error === '1'
  const redirect = search.redirect ?? ''

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100svh', background: 'oklch(0.979 0.008 78)',
      fontFamily: 'system-ui, sans-serif', padding: '1rem',
    }}>
      <main style={{
        width: '100%', maxWidth: '22rem', background: '#fff',
        border: '1px solid #e5e1dc', borderRadius: '0.75rem',
        padding: '2rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.025em', margin: '0 0 0.25rem', color: '#1a1a1a' }}>
          Sign in to Pilotiq
        </h1>
        <p style={{ color: '#666', fontSize: '0.85rem', margin: '0 0 1.5rem' }}>
          The <code>/admin</code> panel requires a signed-in user.
        </p>

        {failed && (
          <p style={{
            background: '#fdf1ef', border: '1px solid #f0c8bd', color: '#a3361d',
            borderRadius: '0.5rem', padding: '0.5rem 0.75rem', fontSize: '0.85rem',
            margin: '0 0 1rem',
          }}>
            Invalid email or password.
          </p>
        )}

        <form method="post" action="/login">
          {redirect && <input type="hidden" name="redirect" value={redirect} />}
          <div style={{ marginBottom: '1rem' }}>
            <label htmlFor="email" style={labelStyle}>Email</label>
            <input id="email" name="email" type="email" required autoFocus
              defaultValue="admin@example.com" autoComplete="username" style={inputStyle} />
          </div>
          <div style={{ marginBottom: '1.5rem' }}>
            <label htmlFor="password" style={labelStyle}>Password</label>
            <input id="password" name="password" type="password" required
              autoComplete="current-password" style={inputStyle} />
          </div>
          <button type="submit" style={{
            width: '100%', padding: '0.6rem 1rem', background: '#d97757', color: '#fff',
            border: 'none', borderRadius: '0.5rem', fontWeight: 600, fontSize: '0.9rem',
            cursor: 'pointer', fontFamily: 'inherit',
          }}>
            Sign in
          </button>
        </form>

        <p style={{ color: '#999', fontSize: '0.75rem', margin: '1.25rem 0 0', textAlign: 'center' }}>
          Demo credentials: <code>admin@example.com</code> / <code>password</code>
          <br />
          No login needed for the <a href="/guest" style={{ color: '#d97757' }}>/guest</a> panel.
        </p>
      </main>
    </div>
  )
}
