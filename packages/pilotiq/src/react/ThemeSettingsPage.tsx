'use client'

import { useState, useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { Sparkles, Rows2, Rows3, Rows4 } from 'lucide-react'
import { resolveTheme } from '../theme/resolve.js'
import { radiusMap } from '../theme/radius.js'

import { generateThemeCSS } from '../theme/generate-css.js'
import type { ThemeConfig, BaseColor } from '../theme/types.js'
import { useTheme } from './ThemeProvider.js'
import {
  Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger,
} from './ui/select.js'

// ─── Constants ──────────────────────────────────────────────

import { colors, BASE_COLOR_NAMES, HUE_NAMES } from '../theme/colors.js'
import { PRESET_FONTS, PRESET_RADIUS, PRESET_SPACING } from '../theme/presets.js'
import { spacingMap } from '../theme/spacing.js'
import type { StylePreset } from '../theme/types.js'

const PRESETS = ['vega', 'nova', 'maia', 'lyra', 'mira', 'luma', 'sera'] as const
const BASE_COLORS = BASE_COLOR_NAMES
const THEME_COLORS = ['base', ...HUE_NAMES] as const
const CHART_COLORS = ['base', ...HUE_NAMES] as const
// Order: 'default' first (= medium semantically) so it's the leading option.
const RADII = ['default', 'none', 'small', 'medium', 'large'] as const
// Spacing density — `'default'` is a sentinel that resolves through
// PRESET_SPACING; the explicit values drive Tailwind's `--spacing` directly.
const SPACINGS = ['default', 'compact', 'comfortable'] as const
const ICON_LIBRARIES = ['lucide', 'tabler', 'phosphor', 'remix'] as const

// Fonts grouped by type. Renders inside the Heading/Font picker dropdown
// with each group's name as a non-selectable label, mirroring shadcn/ui/create.
const FONT_GROUPS: Record<string, string[]> = {
  Sans: [
    'Satoshi', 'Inter', 'Geist', 'Space Grotesk', 'Plus Jakarta Sans', 'DM Sans',
    'Manrope', 'Outfit', 'Sora', 'Figtree', 'Poppins',
    'Nunito', 'Raleway', 'Open Sans', 'Lato', 'Roboto', 'Noto Sans',
  ],
  Serif: ['Playfair Display'],
  Mono:  ['JetBrains Mono', 'Geist Mono'],
}

// Swatch preview color for each picker option — pulls from the canonical
// scale at step 600 so swatches stay in sync if a hue is retuned in colors.ts.
const HUE_SWATCHES: Record<string, string> = Object.fromEntries(
  HUE_NAMES.map(name => [name, colors[name][600]]),
)

// ─── Helpers ────────────────────────────────────────────────

function randomPick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!
}

/** Apply theme to parent page immediately — updates the <style> tag AND inline styles. */
function applyToParent(config: Partial<ThemeConfig>) {
  const merged: ThemeConfig = { preset: 'vega', ...config }
  const resolved = resolveTheme(merged)
  const css = generateThemeCSS(resolved)

  // Update the ThemeProvider's <style> tag so both light and dark mode vars are current
  const id = 'pilotiq-theme'
  let style = document.getElementById(id) as HTMLStyleElement | null
  if (!style) {
    style = document.createElement('style')
    style.id = id
    document.head.appendChild(style)
  }
  style.textContent = css

  // Also set inline styles for immediate visual feedback (overrides @layer)
  const root = document.documentElement
  const isDark = root.classList.contains('dark')
  const vars = isDark ? resolved.dark : resolved.light

  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value)
  }
  root.style.setProperty('--radius', resolved.radius)
  root.style.setProperty('--spacing', resolved.spacing)
  if (resolved.fontFamily?.body) {
    root.style.setProperty('--font-sans', resolved.fontFamily.body)
    root.style.setProperty('--default-font-family', resolved.fontFamily.body)
  }
  if (resolved.fontFamily?.heading) {
    root.style.setProperty('--font-heading', resolved.fontFamily.heading)
  }
}

// Fontshare overrides for fonts not on Google Fonts.
const FONTSHARE_URLS: Record<string, string> = {
  Satoshi: 'https://api.fontshare.com/v2/css?f[]=satoshi@300,500,700&display=swap',
}

function fontStylesheetUrl(family: string): string {
  return FONTSHARE_URLS[family]
    ?? `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}:wght@400;500;600;700&display=swap`
}

/**
 * Apply config changes to a live preview document — patches CSS vars, font
 * links, mode class, and preset fingerprint text WITHOUT reloading the iframe.
 * Called on every config/mode change so the user's scroll position survives.
 */
function applyConfigToDoc(doc: Document, config: Partial<ThemeConfig>, mode: 'light' | 'dark') {
  const merged: ThemeConfig = { preset: 'vega', ...config }
  const resolved = resolveTheme(merged)
  const themeCSS = generateThemeCSS(resolved)

  // Light/dark switch — generateThemeCSS emits `.dark { ... }`, so toggling
  // the class on <html> picks up the right var set without a re-render.
  doc.documentElement.className = mode

  // Theme CSS — single <style id="pilotiq-theme"> we keep refilling.
  let style = doc.getElementById('pilotiq-theme') as HTMLStyleElement | null
  if (!style) {
    style = doc.createElement('style')
    style.id = 'pilotiq-theme'
    doc.head.appendChild(style)
  }
  style.textContent = themeCSS

  // Font links — diff against current set so the browser doesn't re-fetch
  // already-loaded stylesheets (avoids the brief FOIT on every config change).
  const wanted = new Set<string>()
  if (resolved.fonts?.body) wanted.add(resolved.fonts.body)
  if (resolved.fonts?.heading) wanted.add(resolved.fonts.heading)
  const existing = doc.querySelectorAll<HTMLLinkElement>('link[data-pilotiq-font]')
  const haveSet = new Set<string>()
  existing.forEach(link => {
    const family = link.dataset.pilotiqFont ?? ''
    if (!wanted.has(family)) link.remove()
    else haveSet.add(family)
  })
  for (const family of wanted) {
    if (haveSet.has(family)) continue
    const link = doc.createElement('link')
    link.rel = 'stylesheet'
    link.href = fontStylesheetUrl(family)
    link.dataset.pilotiqFont = family
    doc.head.appendChild(link)
  }

  // Preset fingerprint heading — only piece of body text that depends on config.
  const fp = doc.getElementById('preset-fingerprint')
  if (fp) fp.textContent = `${cap(config.preset ?? 'vega')} - ${resolved.fonts?.heading ?? 'System'}`
}

/** Build the static preview skeleton — config-independent so the iframe loads once. */
function buildStaticPreviewHTML(): string {
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
  body {
    font-family: var(--default-font-family, 'Geist Variable', sans-serif);
    background: var(--muted);
    color: var(--foreground);
    padding: calc(var(--spacing) * 6);
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }
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
  .card {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--card);
    color: var(--card-foreground);
    padding: calc(var(--spacing) * 5);
    box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.04);
  }
  .card-header { display: flex; justify-content: space-between; align-items: flex-start; }
  .card-label { font-size: 0.8125rem; color: var(--muted-foreground); font-weight: 500; }
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

// ─── Preview Iframe ─────────────────────────────────────────

function PreviewIframe({ config, mode }: { config: Partial<ThemeConfig>; mode: 'light' | 'dark' }) {
  const [mounted, setMounted] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  // Refs so the onLoad handler always patches with the freshest values
  // (handler is bound once, but config/mode change between mount and load).
  const configRef = useRef(config)
  const modeRef = useRef(mode)
  configRef.current = config
  modeRef.current = mode

  useEffect(() => setMounted(true), [])

  // Static skeleton — config-independent so srcDoc never changes.
  // Memoized so the iframe doesn't reload (which would lose scroll position).
  const staticHTML = useMemo(() => buildStaticPreviewHTML(), [])

  // Patch the live document on every config / mode change. No reload, no
  // flicker, no scroll loss — only CSS vars + font links + class change.
  useEffect(() => {
    if (!loaded) return
    const doc = iframeRef.current?.contentDocument
    if (doc) applyConfigToDoc(doc, config, mode)
  }, [config, mode, loaded])

  const handleLoad = () => {
    const doc = iframeRef.current?.contentDocument
    if (doc) applyConfigToDoc(doc, configRef.current, modeRef.current)
    if (!loaded) setLoaded(true)
  }

  if (!mounted) return <div className="w-full h-full rounded-lg border border-border bg-muted" />

  return (
    <div className="relative w-full h-full">
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center rounded-lg border border-border bg-muted z-10">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
        </div>
      )}
      <iframe
        ref={iframeRef}
        srcDoc={staticHTML}
        onLoad={handleLoad}
        className={`w-full h-full rounded-lg border border-border bg-muted transition-opacity duration-150 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        title="Theme Preview"
      />
    </div>
  )
}

// ─── Component ─────────────────────────────────��────────────

interface ThemeSettingsPageProps {
  panelPath: string
  initialConfig?: Partial<ThemeConfig>
  /** Called after save/reset to force Vike to re-fetch server data. Provided by generated page. */
  onNavigate?: (url: string) => Promise<void>
}

export function ThemeSettingsPage({ panelPath, initialConfig, onNavigate }: ThemeSettingsPageProps) {
  const codeDefaults = initialConfig ?? {}
  const [config, setConfig] = useState<Partial<ThemeConfig>>({ ...codeDefaults })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const { resolved: contextMode } = useTheme()
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => setHydrated(true), [])
  // Before hydration, useTheme defaults to 'light' — read DOM class instead (FOUC script sets it).
  // After hydration, useTheme is reactive and tracks toggle changes.
  const previewMode: 'light' | 'dark' = hydrated
    ? contextMode
    : (typeof document !== 'undefined' && document.documentElement.classList.contains('dark') ? 'dark' : 'light')

  const update = useCallback((key: string, value: unknown) => {
    setConfig(prev => ({ ...prev, [key]: value }))
    setSaved(false)
  }, [])

  const updateFont = useCallback((key: 'heading' | 'body', value: string) => {
    setConfig(prev => ({
      ...prev,
      fonts: { ...prev.fonts, [key]: value || undefined },
    }))
    setSaved(false)
  }, [])

  const reNavigate = async () => {
    if (!onNavigate) return
    const scrollY = window.scrollY
    await onNavigate(`${panelPath}/theme`)
    requestAnimationFrame(() => window.scrollTo(0, scrollY))
  }

  const handleSave = async () => {
    setSaving(true)
    applyToParent(config)
    try {
      await fetch(`${panelPath}/api/_theme`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      await reNavigate()
    } catch { /* visual update already applied */ }
    setSaved(true)
    setSaving(false)
  }

  const handleReset = async () => {
    // Snap state to truly empty (NOT `codeDefaults`, which is `initialConfig`
    // = code .theme() defaults merged with whatever DB overrides existed at
    // page-load time). With config = {}, the preview resolves the bare
    // `vega` preset — i.e. the package's factory default.
    setConfig({})
    applyToParent({})
    try {
      await fetch(`${panelPath}/api/_theme`, { method: 'DELETE' })
      await reNavigate()
    } catch { /* visual update already applied */ }
    setSaved(false)
  }

  const handleShuffle = () => {
    const next: Partial<ThemeConfig> = {
      preset: randomPick(PRESETS),
      baseColor: randomPick(BASE_COLORS),
      themeColor: randomPick(THEME_COLORS),
      chartColor: randomPick(CHART_COLORS),
      radius: randomPick(RADII),
      spacing: randomPick(SPACINGS),
    }
    if (config.fonts) next.fonts = config.fonts
    if (config.iconLibrary) next.iconLibrary = config.iconLibrary
    setConfig(next)
    setSaved(false)
  }

  // ── Indicator helpers ──────────────────────────────────
  // Each control's trigger and items show a leading visual cue. Defined here
  // so the picker components below can stay declarative.

  // Resolved active style + its preset font pair. Pulled up here so the
  // RadiusGlyph and font pickers below can both reference them.
  const presetName = (config.preset ?? 'vega') as StylePreset
  const presetFonts = PRESET_FONTS[presetName]

  const baseName: BaseColor = config.baseColor ?? 'neutral'
  const baseSwatch = colors[baseName][600]
  const themeSwatch = config.themeColor && config.themeColor !== 'base' && config.themeColor in HUE_SWATCHES
    ? HUE_SWATCHES[config.themeColor]
    : baseSwatch
  const chartSwatch = config.chartColor && config.chartColor !== 'base' && config.chartColor in HUE_SWATCHES
    ? HUE_SWATCHES[config.chartColor]
    : baseSwatch

  // Dot renders inside the dark sidebar — use a translucent white border for
  // contrast against both light dots (e.g. cream) and dark dots (e.g. neutral 600).
  // `block` is required so `size-3` (width/height) actually applies — inline
  // <span> ignores width/height by default.
  const Dot = ({ color }: { color: string | undefined }) => (
    <span className="block size-3 rounded-full border border-white/30 ring-1 ring-black/20" style={{ backgroundColor: color }} />
  )
  const AaGlyph = () => <span className="text-[12px] font-semibold tracking-tight">Aa</span>
  // `block` so `size-3` actually applies — inline <span> ignores width/height.
  // Resolve through PRESET_RADIUS so the preview corner matches what
  // resolve.ts will actually render (e.g. Maia + Default → large).
  // Only top + end borders are drawn so the rendered corner reads as a single
  // rounded quadrant (matches shadcn/ui/create's radius indicator). The radius
  // is resolved through PRESET_RADIUS so the glyph reflects what resolve.ts
  // will actually emit (e.g. Maia + Default → large).
  const RadiusGlyph = () => {
    const key = config.radius && config.radius !== 'default' ? config.radius : PRESET_RADIUS[presetName]
    return (
      <span
        className="block size-3 border-t border-e border-current"
        style={{ borderTopRightRadius: radiusMap[key] }}
      />
    )
  }

  // Density indicator — fewer rows = roomier, more rows = tighter.
  // Mirrors the resolved spacing value (compact / default / comfortable).
  // `strokeWidth` is passed as a prop (not via className) because Lucide
  // writes it as an SVG presentation attribute that wins over inherited CSS,
  // so `stroke-[1.5]` alone would be a no-op against the default `2`.
  const SpacingGlyph = ({ value, className = 'size-3.5 text-white' }: { value: string | undefined; className?: string }) => {
    const key = value && value !== 'default' ? value : PRESET_SPACING[presetName]
    const props = { className, strokeWidth: 1.5 }
    if (key === 'compact')     return <Rows4 {...props} />
    if (key === 'comfortable') return <Rows2 {...props} />
    return <Rows3 {...props} />
  }

  // Each Style gets its own geometric glyph so the preset has a distinct
  // visual identity — the shape hints at the preset's personality
  // (Maia → circle, Lyra → hexagon, Sera → sharp square, Luma → horizontal
  // pill, Mira → rotated rounded square, etc.).
  //
  // Inner shapes deliberately omit a `stroke-width` attribute so they inherit
  // the SVG's CSS `stroke-width` (set via Tailwind `stroke-[1.5]` at the call
  // site). A presentation attribute would override the inherited value and
  // make the className tweak a no-op.
  const StyleGlyph = ({ preset, className = 'size-3' }: { preset: StylePreset; className?: string }) => {
    const common = { fill: 'none', stroke: 'currentColor', strokeLinejoin: 'round' as const }
    return (
      <svg viewBox="0 0 16 16" className={className} aria-hidden="true">
        {preset === 'vega' && <rect x="2.5" y="2.5" width="11" height="11" rx="3.5" {...common} />}
        {preset === 'nova' && <rect x="2"   y="3.5" width="12" height="9"  rx="3"   {...common} />}
        {preset === 'maia' && <circle cx="8" cy="8" r="5.5" {...common} />}
        {preset === 'lyra' && <polygon points="8,2 13.2,5 13.2,11 8,14 2.8,11 2.8,5" {...common} />}
        {preset === 'mira' && <rect x="2.5" y="2.5" width="11" height="11" rx="3.5" transform="rotate(45 8 8)" {...common} />}
        {preset === 'luma' && <rect x="1.5" y="4.5" width="13" height="7" rx="3.5" {...common} />}
        {preset === 'sera' && <rect x="2.5" y="2.5" width="11" height="11" rx="0" {...common} />}
      </svg>
    )
  }

  // Build option lists. Theme + Chart pin the `'base'` sentinel at the top
  // (separator below), labeled with the current base color name.
  const styleOptions = PRESETS.map(p => ({ value: p, label: cap(p), indicator: <StyleGlyph preset={p} className="size-3.5" /> }))
  const baseOptions = BASE_COLORS.map(c => ({ value: c, label: cap(c), indicator: <Dot color={colors[c][600]} /> }))
  const themeOptions = [
    { value: 'base', label: cap(baseName), indicator: <Dot color={baseSwatch} /> },
    ...HUE_NAMES.map(c => ({ value: c, label: cap(c), indicator: <Dot color={HUE_SWATCHES[c]} /> })),
  ]
  const chartOptions = [
    { value: 'base', label: cap(baseName), indicator: <Dot color={baseSwatch} /> },
    ...HUE_NAMES.map(c => ({ value: c, label: cap(c), indicator: <Dot color={HUE_SWATCHES[c]} /> })),
  ]
  // Pin each picker's preset default at the top with a separator below, then
  // list the rest of the fonts grouped by type (Sans / Serif / Mono) with
  // a non-selectable header per group. Mirrors shadcn/ui/create's font menu.
  // Heading and body get separate lists so each can pin its own preset font
  // (which may differ — e.g. Sera = Playfair Display + Noto Sans).
  const headingFontOptions = buildFontOptions(presetFonts.heading)
  const bodyFontOptions = buildFontOptions(presetFonts.body)
  const iconOptions = ICON_LIBRARIES.map(l => ({ value: l, label: cap(l), indicator: <Sparkles className="size-3" /> }))
  const radiusOptions = RADII.map(r => ({
    value: r,
    label: cap(r),
    indicator: (
      <span
        className="block size-3 border-t border-e border-current"
        style={{ borderTopRightRadius: radiusMap[r] }}
      />
    ),
  }))
  const spacingOptions = SPACINGS.map(s => ({
    value: s,
    label: cap(s),
    indicator: <SpacingGlyph value={s} />,
  }))

  return (
    <div className="flex items-start h-full gap-6">
      {/* Controls Sidebar — frosted-glass card on top of the page surface,
          matching shadcn's customizer panel. `dark` scopes the inner
          `bg-card/90`, `text-card-foreground`, etc. to the dark variants. */}
      <div
        className="dark isolate z-10 overflow-hidden flex flex-col gap-2 w-48 shrink-0 self-start min-h-0 rounded-xl bg-card/90 text-sm text-card-foreground ring-1 ring-foreground/10 shadow-xl backdrop-blur-xl"
        style={{ maxHeight: 'calc(100vh - 106px)' }}
      >
        <div className='h-full overflow-y-auto flex flex-col gap-3 p-3'>
          <PickerCard
            label="Style"
            value={config.preset ?? 'vega'}
            options={styleOptions}
            onValueChange={v => update('preset', v)}
            triggerIcon={<StyleGlyph preset={presetName} className="size-3.5 text-white" />}
            keepOpenOnSelect
          />

          <PickerCard
            label="Base Color"
            value={config.baseColor ?? 'neutral'}
            options={baseOptions}
            onValueChange={v => update('baseColor', v)}
            triggerIcon={<Dot color={baseSwatch} />}
            keepOpenOnSelect
          />

          <PickerCard
            label="Theme"
            value={config.themeColor ?? 'base'}
            options={themeOptions}
            separatorAfter="base"
            onValueChange={v => update('themeColor', v)}
            triggerIcon={<Dot color={themeSwatch} />}
            formatTriggerValue={v => v === 'base' ? cap(baseName) : cap(v)}
            keepOpenOnSelect
          />

          <PickerCard
            label="Chart Color"
            value={config.chartColor ?? 'base'}
            options={chartOptions}
            separatorAfter="base"
            onValueChange={v => update('chartColor', v)}
            triggerIcon={<Dot color={chartSwatch} />}
            formatTriggerValue={v => v === 'base' ? cap(baseName) : cap(v)}
            keepOpenOnSelect
          />

          <PickerCard
            label="Heading"
            value={config.fonts?.heading ?? presetFonts.heading}
            options={headingFontOptions}
            separatorAfter={presetFonts.heading}
            onValueChange={v => updateFont('heading', v)}
            triggerIcon={<AaGlyph />}
            keepOpenOnSelect
          />

          <PickerCard
            label="Font"
            value={config.fonts?.body ?? presetFonts.body}
            options={bodyFontOptions}
            separatorAfter={presetFonts.body}
            onValueChange={v => updateFont('body', v)}
            triggerIcon={<AaGlyph />}
            keepOpenOnSelect
          />

          <PickerCard
            label="Icon Library"
            value={config.iconLibrary ?? 'lucide'}
            options={iconOptions}
            onValueChange={v => update('iconLibrary', v)}
            triggerIcon={<Sparkles className="stroke-[1.5] text-white" />}
          />

          <PickerCard
            label="Radius"
            value={config.radius ?? 'default'}
            options={radiusOptions}
            separatorAfter="default"
            onValueChange={v => update('radius', v)}
            triggerIcon={<RadiusGlyph />}
            keepOpenOnSelect
          />

          <PickerCard
            label="Spacing"
            value={config.spacing ?? 'default'}
            options={spacingOptions}
            separatorAfter="default"
            onValueChange={v => update('spacing', v)}
            triggerIcon={<SpacingGlyph value={config.spacing} />}
            keepOpenOnSelect
          />
        </div>
        {/* Actions */}
        <div className="p-3 space-y-2 bg-muted/50 border-t">
          <button
            onClick={handleShuffle}
            className="w-full px-3 py-1.5 text-xs rounded-md border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
          >
            Shuffle
          </button>
          <button
            onClick={handleReset}
            className="w-full px-3 py-1.5 text-xs rounded-md border border-white/10 bg-white/5 hover:bg-white/10 transition-colors opacity-70"
          >
            Reset to Defaults
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full px-3 py-1.5 text-xs rounded-md bg-zinc-100 text-zinc-900 hover:bg-white transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Theme'}
          </button>
        </div>
      </div>

      {/* Preview Area — isolated iframe, syncs with panel dark/light toggle */}
      <div className="flex-1 overflow-hidden h-full">
        <PreviewIframe config={config} mode={previewMode} />
      </div>
    </div>
  )
}

// ─── Sub-components ─────────────────────────────────────────

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

interface PickerOption {
  value: string
  label: string
  indicator?: ReactNode
  /** Render this row as a non-selectable group header (no value, no check). */
  header?: boolean
}

/**
 * Build a flat option list from `FONT_GROUPS`, with the pinned font at top
 * and a separator after, then each group introduced by a header row. The
 * pinned font is filtered out of its own group so it doesn't appear twice.
 */
function buildFontOptions(pinnedFont: string): PickerOption[] {
  const items: PickerOption[] = [
    { value: pinnedFont, label: pinnedFont, indicator: <AaGlyphStatic /> },
  ]
  for (const [groupName, fonts] of Object.entries(FONT_GROUPS)) {
    const filtered = fonts.filter(f => f !== pinnedFont)
    if (filtered.length === 0) continue
    items.push({ value: `__header_${groupName}`, label: groupName, header: true })
    for (const f of filtered) {
      items.push({ value: f, label: f, indicator: <AaGlyphStatic /> })
    }
  }
  return items
}

// Standalone glyph (no closure over component state) so `buildFontOptions`
// can run outside the component scope.
function AaGlyphStatic() {
  return <span className="text-[11px] font-semibold tracking-tight">Aa</span>
}

interface PickerCardProps {
  label: string
  value: string
  options: PickerOption[]
  onValueChange: (value: string) => void
  triggerIcon?: ReactNode
  /** Insert a `<SelectSeparator />` after the option whose `value` matches this. */
  separatorAfter?: string
  /** Custom formatter for the value displayed in the trigger (e.g. `'base'` → current base name). */
  formatTriggerValue?: (value: string) => string
  /**
   * Keep the popup open after selecting an item — lets the user click through
   * options and watch the live preview update without re-opening each time.
   * Outside-press, Escape, and trigger-press still close normally.
   */
  keepOpenOnSelect?: boolean
}

function PickerCard({
  label, value, options, onValueChange, triggerIcon, separatorAfter, formatTriggerValue, keepOpenOnSelect,
}: PickerCardProps) {
  const current = options.find(o => o.value === value)
  const triggerLabel = formatTriggerValue ? formatTriggerValue(value) : (current?.label ?? value)
  const [open, setOpen] = useState(false)

  return (
    <Select
      value={value}
      onValueChange={(v) => onValueChange(v as string)}
      open={open}
      onOpenChange={(nextOpen, details) => {
        // Suppress the auto-close that follows an item press for browseable
        // pickers (Style / Base / Theme / Chart). The popup stays mounted;
        // we render the checkmark ourselves below from `opt.value === value`
        // so we don't depend on Base UI's `selectedIndex`, which only re-syncs
        // when the popup closes.
        if (keepOpenOnSelect && !nextOpen && details?.reason === 'item-press') return
        setOpen(nextOpen)
      }}
    >
      <SelectTrigger
        hideIcon
        className="w-full !h-auto items-start py-2 px-3 rounded-lg border-white/10 --bg-white/5 hover:bg-white/10 text-left shadow-none transition-colors"
      >
        <div className="flex items-center justify-between gap-2 w-full">
          <div className="flex flex-col min-w-0">
            <span className="text-[11px] text-white/50">{label}</span>
            <span className="text-sm font-medium truncate">{triggerLabel}</span>
          </div>
          {triggerIcon && <span className="shrink-0 mt-0.5">{triggerIcon}</span>}
        </div>
      </SelectTrigger>
      {/* Anchor to the right of the trigger so users can click through items
          and watch the preview update beside the dropdown — matches the
          shadcn/ui/create flow. Larger sideOffset (16px) and frosted-glass
          surface (semi-transparent + backdrop-blur) match shadcn's menu look. */}
      <SelectContent
        side="right"
        align="start"
        sideOffset={24}
        className="dark min-w-[200px] rounded-xl border-0 bg-card/80 text-sm text-card-foreground ring-1 ring-foreground/10 backdrop-blur-xl shadow-2xl"
      >
        {options.map((opt, i) => (
          <PickerOptionItem
            key={opt.value || `__empty_${i}`}
            opt={opt}
            selected={opt.value === value}
            separator={opt.value === separatorAfter}
          />
        ))}
      </SelectContent>
    </Select>
  )
}

// Item rendering: text label + a trailing check rendered manually based on
// the controlled `selected` flag (NOT Base UI's SelectItemIndicator). This
// keeps the popup state in lockstep with React state even when we suppress
// the auto-close on item-press.
function PickerOptionItem({ opt, selected, separator }: { opt: PickerOption; selected: boolean; separator?: boolean }) {
  if (opt.header) {
    return (
      <div className="px-2 pt-2 pb-1 text-sm text-white/50 select-none">
        {opt.label}
      </div>
    )
  }
  return (
    <>
      <SelectItem className="rounded-lg" value={opt.value} hideIndicator selected={selected}>
        <span>{opt.label}</span>
      </SelectItem>
      {separator && <SelectSeparator className='bg-input/50 dark:bg-input/50' />}
    </>
  )
}
