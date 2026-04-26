/** Build the static preview skeleton — config-independent so the iframe loads once. */
export function buildStaticPreviewHTML(): string {
  // Calendar — current month grid with a few highlighted dates.
  const today = new Date()
  const year = today.getFullYear()
  const monthIdx = today.getMonth()
  const monthName = today.toLocaleString('en-US', { month: 'long' })
  const firstDay = new Date(year, monthIdx, 1).getDay()
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate()
  const todayDate = today.getDate()
  const calendarCells: string[] = []
  for (let i = 0; i < firstDay; i++) calendarCells.push('<div class="cal-cell empty"></div>')
  for (let d = 1; d <= daysInMonth; d++) {
    const isToday = d === todayDate
    const isHighlight = [4, 12, 18, 24].includes(d)
    const cls = isToday ? 'cal-cell today' : isHighlight ? 'cal-cell highlight' : 'cal-cell'
    calendarCells.push(`<div class="${cls}">${d}</div>`)
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  /* Fallback vars so the very first paint isn't blank when applyConfigToDoc
     hasn't run yet — replaced by the <style id="pilotiq-theme"> we inject. */
  :root {
    --background: oklch(1 0 0);
    --foreground: oklch(0.15 0 0);
    --muted: oklch(0.97 0 0);
    --muted-foreground: oklch(0.55 0 0);
    --border: oklch(0.9 0 0);
    --card: oklch(1 0 0);
    --card-foreground: oklch(0.15 0 0);
    --primary: oklch(0.55 0 0);
    --primary-foreground: oklch(1 0 0);
    --secondary: oklch(0.97 0 0);
    --accent: oklch(0.97 0 0);
    --accent-foreground: oklch(0.15 0 0);
    --input: oklch(0.9 0 0);
    --chart-1: oklch(0.6 0.1 30);
    --chart-2: oklch(0.6 0.1 60);
    --chart-3: oklch(0.6 0.1 90);
    --chart-4: oklch(0.6 0.1 120);
    --chart-5: oklch(0.6 0.1 150);
    --radius: 0.5rem;
    --spacing: 0.25rem;
  }
  /* Spacing values use Tailwind v4's --spacing convention: calc(var(--spacing) * N)
     where N matches the equivalent Tailwind utility step (p-4 maps to * 4).
     One token drives all density — Mira compact, Lyra default,
     Vega/Nova/Maia/Luma/Sera comfortable. Font sizes and line-heights stay
     literal so type scale doesn't depend on density. */
  * { box-sizing: border-box; margin: 0; padding: 0; border: 0 solid; }
  /* Light mode: --muted (recessed look against white card surfaces).
     Dark mode: --background (deep page color — cards already use --card,
     which is one step lighter, so the page sits behind them). Mirrors
     Tailwind's bg-muted dark:bg-background pattern. */
  body {
    font-family: var(--default-font-family, 'Geist Variable', sans-serif);
    background: var(--muted);
    color: var(--foreground);
    padding: calc(var(--spacing) * 6);
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }
  .dark body { background: var(--background); }
  h1, h2, h3, h4, h5, h6 { font-family: var(--font-heading, var(--default-font-family, 'Geist Variable', sans-serif)); }
  .grid { display: grid; gap: calc(var(--spacing) * 4); }
  .grid-cols-3 { grid-template-columns: repeat(3, 1fr); }
  /* grid-main uses the same 3-col base as the stat-cards row so the right
     column (calendar / activity) lines up exactly with the third stat card. */
  .grid-main { grid-template-columns: repeat(3, 1fr); }
  .col-span-2 { grid-column: span 2; }
  .flex { display: flex; }
  .flex-col { flex-direction: column; }
  .items-center { align-items: center; }
  .justify-between { justify-content: space-between; }
  .gap-2 { gap: calc(var(--spacing) * 2); }
  .gap-3 { gap: calc(var(--spacing) * 3); }
  .gap-4 { gap: calc(var(--spacing) * 4); }
  .text-xs { font-size: 0.75rem; }
  .text-sm { font-size: 0.875rem; }
  .text-2xl { font-size: 1.5rem; }
  .text-3xl { font-size: 1.875rem; line-height: 1.1; }
  .font-medium { font-weight: 500; }
  .font-semibold { font-weight: 600; }
  .font-bold { font-weight: 700; }
  .tracking-tight { letter-spacing: -0.025em; }
  .text-muted { color: var(--muted-foreground); }
  .mt-1 { margin-top: calc(var(--spacing) * 1); }
  .mt-2 { margin-top: calc(var(--spacing) * 2); }
  .mt-3 { margin-top: calc(var(--spacing) * 3); }
  .mt-4 { margin-top: calc(var(--spacing) * 4); }
  /* Mirrors shadcn/ui/create's .style-vega .cn-card: 1.4x radius, 10%-foreground
     hairline ring (instead of a solid --border), subtle shadow, and overflow:
     hidden so child overflow is clipped against the rounded corner. Padding
     stays symmetric here because our cards don't have a separate inner section
     pattern like shadcn's .cn-card-content. */
  .card {
    border-radius: calc(var(--radius) * 1.4);
    background: var(--card);
    color: var(--card-foreground);
    padding: calc(var(--spacing) * 6);
    font-size: 0.875rem;
    line-height: 1.25rem;
    box-shadow:
      0 0 0 1px color-mix(in oklab, var(--foreground) 10%, transparent),
      0 1px 2px 0 rgb(0 0 0 / 0.05);
    overflow: hidden;
  }
  .card-header { display: flex; justify-content: space-between; align-items: flex-start; }
  /* Card titles use the heading font (visually display-weight even though
     rendered as <span>). Stat values stay in the body font — numbers read
     as data, not headings, and most heading faces look awkward at large
     numeric weights. */
  .card-label { font-family: var(--font-heading, var(--default-font-family, 'Geist Variable', sans-serif)); font-size: 0.8125rem; color: var(--muted-foreground); font-weight: 500; }
  .card-value { font-size: 1.875rem; font-weight: 700; letter-spacing: -0.025em; margin-top: calc(var(--spacing) * 1); }
  .delta { display: inline-flex; align-items: center; gap: calc(var(--spacing) * 1); font-size: 0.75rem; font-weight: 500; padding: calc(var(--spacing) * 0.5) calc(var(--spacing) * 2); border-radius: 9999px; border: 1px solid var(--border); }
  .delta-up { color: var(--primary); }
  .badge { padding: calc(var(--spacing) * 0.5) calc(var(--spacing) * 2.5); font-size: 0.75rem; font-weight: 500; border-radius: 9999px; display: inline-flex; align-items: center; gap: calc(var(--spacing) * 1); border: 1px solid var(--border); }
  .badge-primary { background: color-mix(in oklch, var(--primary) 12%, transparent); color: var(--primary); border-color: color-mix(in oklch, var(--primary) 30%, transparent); }
  .badge-muted { background: var(--muted); color: var(--muted-foreground); }
  .btn { padding: calc(var(--spacing) * 2) calc(var(--spacing) * 3.5); font-size: 0.8125rem; font-weight: 500; border-radius: calc(var(--radius) - 2px); cursor: pointer; display: inline-flex; align-items: center; gap: calc(var(--spacing) * 1.5); border: 1px solid transparent; }
  .btn-primary { background: var(--primary); color: var(--primary-foreground); }
  .btn-outline { background: var(--card); color: var(--foreground); border-color: var(--border); }
  .input { width: 100%; border: 1px solid var(--input); border-radius: calc(var(--radius) - 2px); background: var(--background); padding: calc(var(--spacing) * 2) calc(var(--spacing) * 3); font-size: 0.875rem; color: var(--foreground); outline: none; }
  table { width: 100%; font-size: 0.8125rem; border-collapse: collapse; }
  th { text-align: left; padding: calc(var(--spacing) * 2.5) calc(var(--spacing) * 3.5); font-weight: 500; color: var(--muted-foreground); font-size: 0.75rem; }
  td { padding: calc(var(--spacing) * 2.5) calc(var(--spacing) * 3.5); border-top: 1px solid var(--border); }
  thead tr { border-bottom: 1px solid var(--border); }
  .avatar { width: 1.75rem; height: 1.75rem; border-radius: 9999px; display: inline-flex; align-items: center; justify-content: center; font-size: 0.6875rem; font-weight: 600; color: var(--primary-foreground); background: var(--primary); flex-shrink: 0; }
  .dot { display: inline-block; width: 0.5rem; height: 0.5rem; border-radius: 9999px; }
  .legend { display: flex; gap: calc(var(--spacing) * 4); align-items: center; font-size: 0.75rem; color: var(--muted-foreground); }
  /* Calendar */
  .cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; margin-top: calc(var(--spacing) * 3); }
  .cal-head { font-size: 0.6875rem; color: var(--muted-foreground); text-align: center; padding: calc(var(--spacing) * 1.5) 0; font-weight: 500; }
  .cal-cell { aspect-ratio: 1; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; border-radius: calc(var(--radius) - 4px); cursor: pointer; }
  .cal-cell:hover:not(.empty) { background: var(--accent); }
  .cal-cell.empty { visibility: hidden; }
  .cal-cell.highlight { background: var(--accent); color: var(--accent-foreground); font-weight: 500; }
  .cal-cell.today { background: var(--primary); color: var(--primary-foreground); font-weight: 600; }
  /* Activity */
  .activity { display: flex; align-items: flex-start; gap: calc(var(--spacing) * 3); padding: calc(var(--spacing) * 2.5) 0; }
  .activity + .activity { border-top: 1px solid var(--border); }
  .activity-text { font-size: 0.8125rem; flex: 1; }
  .activity-time { font-size: 0.6875rem; color: var(--muted-foreground); margin-top: calc(var(--spacing) * 0.5); }
  /* Token swatch row — fixed 34×34 boxes in a wrapping flex row, mirroring
     the reference design. Each swatch has a monospace label beneath it,
     truncated with ellipsis if the variable name overflows the box width. */
  .swatch-row { display: flex; flex-wrap: wrap; gap: calc(var(--spacing) * 2.5); margin-top: calc(var(--spacing) * 3); }
  .swatch-cell { display: flex; flex-direction: column; align-items: flex-start; gap: calc(var(--spacing) * 1); width: 34px; }
  .swatch { width: 34px; height: 34px; border-radius: calc(var(--radius) - 2px); border: 1px solid var(--border); }
  .swatch-label { font-family: ui-monospace, 'JetBrains Mono', 'Geist Mono', monospace; font-size: 0.625rem; color: var(--muted-foreground); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
  .preview-h { font-size: 1.375rem; font-weight: 700; letter-spacing: -0.025em; line-height: 1.15; }
  .preview-p { font-size: 0.8125rem; color: var(--muted-foreground); margin-top: calc(var(--spacing) * 2); line-height: 1.5; }
</style>
</head>
<body>

<!-- Header row -->
<div class="flex justify-between items-center" style="margin-bottom:calc(var(--spacing) * 5)">
  <div>
    <h1 class="text-2xl font-bold tracking-tight">Dashboard</h1>
    <p class="text-sm text-muted mt-1">Welcome back — here's what's happening today.</p>
  </div>
  <div class="flex gap-2">
    <button class="btn btn-outline">Export</button>
    <button class="btn btn-primary">New report</button>
  </div>
</div>

<!-- Stat cards row -->
<div class="grid grid-cols-3">
  <div class="card">
    <div class="card-header">
      <span class="card-label">Total Revenue</span>
      <span class="delta delta-up">↑ 12.5%</span>
    </div>
    <div class="card-value">$45,231.89</div>
    <p class="text-xs text-muted mt-2">Trending up this month</p>
    <!-- Mini sparkline -->
    <svg viewBox="0 0 200 40" style="width:100%;height:40px;margin-top:calc(var(--spacing) * 3)" preserveAspectRatio="none">
      <defs>
        <linearGradient id="grad1" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="var(--chart-1)" stop-opacity="0.4"/>
          <stop offset="100%" stop-color="var(--chart-1)" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="M0,30 L20,28 L40,32 L60,22 L80,24 L100,18 L120,15 L140,20 L160,12 L180,8 L200,5 L200,40 L0,40 Z" fill="url(#grad1)"/>
      <path d="M0,30 L20,28 L40,32 L60,22 L80,24 L100,18 L120,15 L140,20 L160,12 L180,8 L200,5" fill="none" stroke="var(--chart-1)" stroke-width="1.5"/>
    </svg>
  </div>
  <div class="card">
    <div class="card-header">
      <span class="card-label">New Customers</span>
      <span class="delta delta-up">↑ 8.2%</span>
    </div>
    <div class="card-value">1,234</div>
    <p class="text-xs text-muted mt-2">Strong user retention</p>
    <svg viewBox="0 0 200 40" style="width:100%;height:40px;margin-top:calc(var(--spacing) * 3)" preserveAspectRatio="none">
      <defs>
        <linearGradient id="grad2" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="var(--chart-2)" stop-opacity="0.4"/>
          <stop offset="100%" stop-color="var(--chart-2)" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="M0,32 L20,30 L40,28 L60,30 L80,22 L100,25 L120,20 L140,18 L160,22 L180,15 L200,10 L200,40 L0,40 Z" fill="url(#grad2)"/>
      <path d="M0,32 L20,30 L40,28 L60,30 L80,22 L100,25 L120,20 L140,18 L160,22 L180,15 L200,10" fill="none" stroke="var(--chart-2)" stroke-width="1.5"/>
    </svg>
  </div>
  <div class="card">
    <div class="card-header">
      <span class="card-label">Active Accounts</span>
      <span class="delta delta-up">↑ 4.1%</span>
    </div>
    <div class="card-value">8,492</div>
    <p class="text-xs text-muted mt-2">Above target this week</p>
    <svg viewBox="0 0 200 40" style="width:100%;height:40px;margin-top:calc(var(--spacing) * 3)" preserveAspectRatio="none">
      <defs>
        <linearGradient id="grad3" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="var(--chart-3)" stop-opacity="0.4"/>
          <stop offset="100%" stop-color="var(--chart-3)" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="M0,28 L20,25 L40,30 L60,20 L80,22 L100,16 L120,20 L140,14 L160,18 L180,12 L200,14 L200,40 L0,40 Z" fill="url(#grad3)"/>
      <path d="M0,28 L20,25 L40,30 L60,20 L80,22 L100,16 L120,20 L140,14 L160,18 L180,12 L200,14" fill="none" stroke="var(--chart-3)" stroke-width="1.5"/>
    </svg>
  </div>
</div>

<!-- Main grid: chart + calendar -->
<div class="grid grid-main" style="margin-top:calc(var(--spacing) * 4)">
  <div class="card col-span-2">
    <div class="card-header">
      <div>
        <span class="card-label">Total Visitors</span>
        <p class="text-xs text-muted mt-1">Last 3 months</p>
      </div>
      <div class="legend">
        <span class="flex items-center gap-2"><span class="dot" style="background:var(--chart-1)"></span>Desktop</span>
        <span class="flex items-center gap-2"><span class="dot" style="background:var(--chart-2)"></span>Mobile</span>
      </div>
    </div>
    <!-- Bar chart -->
    <svg viewBox="0 0 600 200" style="width:100%;height:200px;margin-top:calc(var(--spacing) * 4)">
      ${(() => {
        const data = [
          [120, 80], [95, 70], [140, 90], [110, 85], [160, 100], [130, 95],
          [180, 120], [150, 110], [170, 130], [200, 140], [185, 135], [220, 160],
        ]
        const barWidth = 38
        const gap = 12
        return data.map((pair, i) => {
          const x = i * (barWidth + gap) + 10
          const h1 = pair[0]
          const h2 = pair[1]
          return `
            <rect x="${x}" y="${190 - h1!}" width="${barWidth / 2 - 1}" height="${h1}" fill="var(--chart-1)" rx="2"/>
            <rect x="${x + barWidth / 2 + 1}" y="${190 - h2!}" width="${barWidth / 2 - 1}" height="${h2}" fill="var(--chart-2)" rx="2"/>
          `
        }).join('')
      })()}
      <line x1="0" y1="190" x2="600" y2="190" stroke="var(--border)" stroke-width="1"/>
    </svg>
    <div class="flex justify-between text-xs text-muted" style="margin-top:calc(var(--spacing) * 2);padding:0 calc(var(--spacing) * 2)">
      <span>Jan</span><span>Feb</span><span>Mar</span><span>Apr</span><span>May</span><span>Jun</span><span>Jul</span><span>Aug</span><span>Sep</span><span>Oct</span><span>Nov</span><span>Dec</span>
    </div>
  </div>

  <div class="card">
    <div class="flex justify-between items-center">
      <div>
        <span class="card-label">${monthName} ${year}</span>
        <p class="text-xs text-muted mt-1">Schedule</p>
      </div>
      <div class="flex gap-2">
        <button class="btn btn-outline" style="padding:calc(var(--spacing) * 1) calc(var(--spacing) * 2)">‹</button>
        <button class="btn btn-outline" style="padding:calc(var(--spacing) * 1) calc(var(--spacing) * 2)">›</button>
      </div>
    </div>
    <div class="cal-grid">
      <div class="cal-head">S</div><div class="cal-head">M</div><div class="cal-head">T</div><div class="cal-head">W</div><div class="cal-head">T</div><div class="cal-head">F</div><div class="cal-head">S</div>
    </div>
    <div class="cal-grid" style="margin-top:0">
      ${calendarCells.join('')}
    </div>
  </div>
</div>

<!-- Bottom grid: table + activity -->
<div class="grid grid-main" style="margin-top:calc(var(--spacing) * 4)">
  <div class="card col-span-2" style="padding:0;overflow:hidden">
    <div style="padding:calc(var(--spacing) * 5) calc(var(--spacing) * 5) calc(var(--spacing) * 3)">
      <div class="flex justify-between items-center">
        <div>
          <span class="card-label" style="font-size:0.9375rem;color:var(--foreground);font-weight:600">Recent Transactions</span>
          <p class="text-xs text-muted mt-1">Latest activity from your customers</p>
        </div>
        <button class="btn btn-outline">View all</button>
      </div>
    </div>
    <table>
      <thead>
        <tr><th>Customer</th><th>Status</th><th>Method</th><th style="text-align:right">Amount</th></tr>
      </thead>
      <tbody>
        <tr>
          <td><div class="flex items-center gap-3"><span class="avatar" style="background:var(--chart-1)">AJ</span><span class="font-medium">Alice Johnson</span></div></td>
          <td><span class="badge badge-primary"><span class="dot" style="background:currentColor"></span>Paid</span></td>
          <td class="text-muted">Credit Card</td>
          <td style="text-align:right" class="font-medium">$1,250.00</td>
        </tr>
        <tr>
          <td><div class="flex items-center gap-3"><span class="avatar" style="background:var(--chart-2)">BS</span><span class="font-medium">Bob Smith</span></div></td>
          <td><span class="badge badge-muted">Pending</span></td>
          <td class="text-muted">Bank Transfer</td>
          <td style="text-align:right" class="font-medium">$840.50</td>
        </tr>
        <tr>
          <td><div class="flex items-center gap-3"><span class="avatar" style="background:var(--chart-3)">CW</span><span class="font-medium">Carol Williams</span></div></td>
          <td><span class="badge badge-primary"><span class="dot" style="background:currentColor"></span>Paid</span></td>
          <td class="text-muted">PayPal</td>
          <td style="text-align:right" class="font-medium">$2,100.00</td>
        </tr>
        <tr>
          <td><div class="flex items-center gap-3"><span class="avatar" style="background:var(--chart-4)">DM</span><span class="font-medium">Dan Murphy</span></div></td>
          <td><span class="badge badge-muted">Refunded</span></td>
          <td class="text-muted">Credit Card</td>
          <td style="text-align:right" class="font-medium">$420.00</td>
        </tr>
        <tr>
          <td><div class="flex items-center gap-3"><span class="avatar" style="background:var(--chart-5)">EK</span><span class="font-medium">Emma King</span></div></td>
          <td><span class="badge badge-primary"><span class="dot" style="background:currentColor"></span>Paid</span></td>
          <td class="text-muted">Apple Pay</td>
          <td style="text-align:right" class="font-medium">$675.20</td>
        </tr>
        <tr>
          <td><div class="flex items-center gap-3"><span class="avatar" style="background:var(--chart-1)">FH</span><span class="font-medium">Frank Hayes</span></div></td>
          <td><span class="badge badge-primary"><span class="dot" style="background:currentColor"></span>Paid</span></td>
          <td class="text-muted">Stripe</td>
          <td style="text-align:right" class="font-medium">$1,840.00</td>
        </tr>
        <tr>
          <td><div class="flex items-center gap-3"><span class="avatar" style="background:var(--chart-2)">GP</span><span class="font-medium">Grace Park</span></div></td>
          <td><span class="badge badge-muted">Pending</span></td>
          <td class="text-muted">ACH</td>
          <td style="text-align:right" class="font-medium">$310.75</td>
        </tr>
        <tr>
          <td><div class="flex items-center gap-3"><span class="avatar" style="background:var(--chart-3)">HL</span><span class="font-medium">Henry Lee</span></div></td>
          <td><span class="badge badge-primary"><span class="dot" style="background:currentColor"></span>Paid</span></td>
          <td class="text-muted">Credit Card</td>
          <td style="text-align:right" class="font-medium">$925.00</td>
        </tr>
        <tr>
          <td><div class="flex items-center gap-3"><span class="avatar" style="background:var(--chart-4)">IR</span><span class="font-medium">Iris Romero</span></div></td>
          <td><span class="badge badge-muted">Failed</span></td>
          <td class="text-muted">Wire</td>
          <td style="text-align:right" class="font-medium">$2,540.00</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="flex flex-col gap-4">
    <div class="card">
      <span class="card-label" style="font-size:0.9375rem;color:var(--foreground);font-weight:600">Activity</span>
      <p class="text-xs text-muted mt-1">Recent updates from your team</p>
      <div style="margin-top:calc(var(--spacing) * 3)">
        <div class="activity">
          <span class="avatar" style="background:var(--chart-1)">AJ</span>
          <div class="activity-text">
            <div><span class="font-medium">Alice</span> approved invoice <span class="font-medium">#1042</span></div>
            <div class="activity-time">2 minutes ago</div>
          </div>
        </div>
        <div class="activity">
          <span class="avatar" style="background:var(--chart-2)">BS</span>
          <div class="activity-text">
            <div><span class="font-medium">Bob</span> commented on <span class="font-medium">Project Atlas</span></div>
            <div class="activity-time">14 minutes ago</div>
          </div>
        </div>
        <div class="activity">
          <span class="avatar" style="background:var(--chart-3)">CW</span>
          <div class="activity-text">
            <div><span class="font-medium">Carol</span> shipped a new release</div>
            <div class="activity-time">1 hour ago</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Tokens swatch — sits under Activity in the 1/3 right column so the
         resolved theme variables stay inspectable without dominating the
         preview area. Heading + body sentence preview the resolved fonts;
         34×34 swatches wrap into rows mirroring the reference design. -->
    <div class="card">
      <h3 class="preview-h" id="preset-fingerprint">Vega - Satoshi</h3>
      <p class="preview-p">Designers love packing quirky glyphs into test phrases. This is a preview of the resolved theme tokens.</p>
      <div class="swatch-row">
        <div class="swatch-cell"><div class="swatch" style="background:var(--background)"></div><span class="swatch-label">--backgr…</span></div>
        <div class="swatch-cell"><div class="swatch" style="background:var(--foreground)"></div><span class="swatch-label">--foregr…</span></div>
        <div class="swatch-cell"><div class="swatch" style="background:var(--primary)"></div><span class="swatch-label">--primary</span></div>
        <div class="swatch-cell"><div class="swatch" style="background:var(--secondary)"></div><span class="swatch-label">--second…</span></div>
        <div class="swatch-cell"><div class="swatch" style="background:var(--muted)"></div><span class="swatch-label">--muted</span></div>
        <div class="swatch-cell"><div class="swatch" style="background:var(--accent)"></div><span class="swatch-label">--accent</span></div>
      </div>
      <div class="swatch-row">
        <div class="swatch-cell"><div class="swatch" style="background:var(--border)"></div><span class="swatch-label">--border</span></div>
        <div class="swatch-cell"><div class="swatch" style="background:var(--chart-1)"></div><span class="swatch-label">--chart-1</span></div>
        <div class="swatch-cell"><div class="swatch" style="background:var(--chart-2)"></div><span class="swatch-label">--chart-2</span></div>
        <div class="swatch-cell"><div class="swatch" style="background:var(--chart-3)"></div><span class="swatch-label">--chart-3</span></div>
        <div class="swatch-cell"><div class="swatch" style="background:var(--chart-4)"></div><span class="swatch-label">--chart-4</span></div>
        <div class="swatch-cell"><div class="swatch" style="background:var(--chart-5)"></div><span class="swatch-label">--chart-5</span></div>
      </div>
    </div>
  </div>
</div>

</body>
</html>`
}
