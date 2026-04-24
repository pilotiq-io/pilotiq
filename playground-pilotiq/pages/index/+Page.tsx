export default function Page() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100svh', gap: '1rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: '2.5rem', fontWeight: 700, letterSpacing: '-0.025em', margin: 0 }}>Pilotiq Playground</h1>
      <p style={{ color: '#666', margin: 0 }}>View-based admin panel demo</p>
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
        <a href="/new-admin" style={{ padding: '0.5rem 1rem', background: '#d97757', color: 'white', borderRadius: '0.5rem', textDecoration: 'none', fontWeight: 500 }}>Open /new-admin</a>
        <a href="/simple" style={{ padding: '0.5rem 1rem', background: 'transparent', color: '#1a1a1a', border: '1px solid #ccc', borderRadius: '0.5rem', textDecoration: 'none', fontWeight: 500 }}>Open /simple</a>
      </div>
    </div>
  )
}
