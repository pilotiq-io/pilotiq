'use client'

import { useState, useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { Sparkles, Rows2, Rows3, Rows4 } from 'lucide-react'
import { radiusMap } from '../theme/radius.js'

import type { ThemeConfig, BaseColor } from '../theme/types.js'
import { useTheme } from './ThemeProvider.js'
import {
  Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger,
} from './ui/select.js'
import { applyToParent, applyConfigToDoc } from './theme-preview/apply.js'
import { buildStaticPreviewHTML } from './theme-preview/build-html.js'

// ─── Constants ──────────────────────────────────────────────

import { colors, BASE_COLOR_NAMES, HUE_NAMES } from '../theme/colors.js'
import { PRESET_FONTS, PRESET_RADIUS, PRESET_SPACING } from '../theme/presets.js'
import type { StylePreset } from '../theme/types.js'

const PRESETS = ['vega', 'nova', 'maia', 'lyra', 'mira', 'luma', 'sera'] as const
const BASE_COLORS = BASE_COLOR_NAMES
const THEME_COLORS = ['base', ...HUE_NAMES] as const
const CHART_COLORS = ['base', ...HUE_NAMES] as const
// Order: 'default' first (= medium semantically) so it's the leading option.
const RADII = ['default', 'none', 'small', 'medium', 'large', 'xlarge'] as const
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

  return (
    <div className="relative w-full h-full">
      {(!mounted || !loaded) && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
        </div>
      )}
      {mounted && (
        <iframe
          ref={iframeRef}
          srcDoc={staticHTML}
          onLoad={handleLoad}
          className={`w-full h-full transition-opacity duration-150 ${loaded ? 'opacity-100' : 'opacity-0'}`}
          title="Theme Preview"
        />
      )}
    </div>
  )
}

// ─── Component ─────────────────────────────────��────────────

interface ThemeSettingsPageProps {
  panelPath: string
  initialConfig?: Partial<ThemeConfig>
  /** Pure code-level defaults (the panel's `.theme()` config, sans DB
   *  overrides). "Reset to Defaults" restores these — falling back to an
   *  empty config (the bare factory preset) when the panel declared no theme. */
  codeTheme?: Partial<ThemeConfig>
  /** Called after save/reset to force Vike to re-fetch server data. Provided by generated page. */
  onNavigate?: (url: string) => Promise<void>
}

export function ThemeSettingsPage({ panelPath, initialConfig, codeTheme, onNavigate }: ThemeSettingsPageProps) {
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
    // Snap state back to the panel's PURE code defaults (its `.theme()`
    // config), NOT to `codeDefaults`/`initialConfig` — that's the code
    // defaults already merged with whatever DB overrides existed at
    // page-load time. DELETEing the stored overrides makes the server
    // re-resolve to exactly `cfg.theme`, so the editor state and the
    // rendered panel stay in lockstep. Falls back to `{}` (bare factory
    // preset) when the panel declared no `.theme()`.
    const defaults = codeTheme ?? {}
    setConfig({ ...defaults })
    applyToParent(defaults)
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
        className="dark isolate z-10 overflow-hidden flex flex-col gap-2 shrink-0 self-start min-h-0 rounded-lg bg-card/90 text-sm text-card-foreground ring-1 ring-foreground/10 shadow-xl backdrop-blur-xl"
        style={{ maxHeight: 'calc(100vh - 106px)', width: '14rem' }}
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
      <div className="flex-1 overflow-hidden h-full ring ring-foreground/10 md:ring-muted bg-muted dark:bg-background rounded-xl">
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
        className="w-full h-auto! items-start py-2 px-3 rounded-md border-white/10 --bg-white/5 hover:bg-white/10 text-left shadow-none transition-colors"
      >
        <div className="flex items-center justify-between gap-2 w-full">
          <div className="flex flex-col min-w-0">
            <span className="text-[11px] text-white/50">{label}</span>
            <span className="text-sm font-medium truncate">{triggerLabel}</span>
          </div>
          {triggerIcon && <span className="shrink-0 mt-0.5">{triggerIcon}</span>}
        </div>
      </SelectTrigger>
      {/* Open to the right of the trigger so users can click through items
          and watch the preview update beside the dropdown — matches the
          shadcn/ui/create flow. `align: 'none'` disables Base UI's vertical
          shift so the popup's top edge stays anchored to the trigger's top
          edge even when the list overflows. Max-height + overflow live on
          the inner List (in select.tsx), not here, to avoid iOS clipping. */}
      <SelectContent
        side="right"
        align="start"
        sideOffset={24}
        collisionAvoidance={{ side: 'flip', align: 'none' }}
        className="dark min-w-[200px] rounded-lg border-0 bg-card/80 text-sm text-card-foreground ring-1 ring-foreground/10 backdrop-blur-xl shadow-2xl"
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
      <SelectItem className="rounded-md" value={opt.value} hideIndicator selected={selected}>
        <span>{opt.label}</span>
      </SelectItem>
      {separator && <SelectSeparator className='bg-input'/>}
    </>
  )
}
