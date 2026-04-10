'use client'

import { Component, type ReactNode } from 'react'
import { usePageContext } from 'vike-react/usePageContext'
import { AdminLayout }    from '../_components/AdminLayout.js'
import { I18nProvider }   from '../_hooks/useI18n.js'
import { generateThemeCSS } from '@pilotiq/panels'
import type { PanelNavigationMeta } from '@pilotiq/panels'
// Auto-discover plugin registrations (fields, lazy elements, etc.)
// Plugins publish _register-{name}.ts files that call registerField/registerLazyElement.
import.meta.glob('../_register-*.ts', { eager: true })
// Lexical uses registerField — only register on client to avoid SSR/client hydration mismatch
if (typeof window !== 'undefined') {
  import('@pilotiq/lexical').then(({ registerLexical }) => registerLexical()).catch(() => {})
}

// ── Optional pro providers — app responsibility ─────────────────────────────
//
// Earlier iterations of this Layout tried to dynamic-import `@pilotiq-pro/
// collab` and `@pilotiq-pro/ai` from a `useEffect` so apps without the pro
// packages installed would not crash at dev startup. Phase 4.8 browser smoke
// (2026-04-10) proved that pattern only works on the SSR/Node side: Vite's
// runtime dynamic-import helper does NOT resolve bare specifiers, only its
// static analyzer does. So in the browser the import always failed silently
// and pro's `<AiUiProvider>` / `<CollabProvider>` never mounted regardless of
// whether the package was installed.
//
// The supported integration pattern is now **app-side static imports**:
//
//   1. App installs `@pilotiq-pro/ai` (and/or `@pilotiq-pro/collab`).
//   2. App's `vite.config.ts` adds:
//        resolve.dedupe:        ['react', 'react-dom', '@pilotiq/panels',
//                                '@pilotiq/lexical']
//        optimizeDeps.include:  ['@pilotiq-pro/ai', '@pilotiq-pro/collab']
//        optimizeDeps.exclude:  ['@pilotiq/panels', '@pilotiq/lexical']
//      The dedupe + exclude entries are load-bearing — without them Vite
//      pre-bundles pro with its own copies of `@pilotiq/panels` and React,
//      which creates duplicate `AiUiContext` / React instances and silently
//      breaks every context lookup at hydration time.
//   3. App vendors this file (`pnpm rudder vendor:publish --tag=pilotiq-pages
//      --force`) and replaces the rendered tree below with a static import of
//      whichever pro providers it wants:
//
//        import { AiUiProvider } from '@pilotiq-pro/ai'
//        import { CollabProvider } from '@pilotiq-pro/collab'
//
//        return (
//          <AiUiProvider panelPath={data.panelMeta.path}>
//            <CollabProvider>
//              <I18nProvider …>…</I18nProvider>
//            </CollabProvider>
//          </AiUiProvider>
//        )
//
// Apps that do NOT install pro can vendor this file unchanged — the panel
// tree renders without the chat sidebar / `✦` field actions / Yjs collab,
// and the open-core `useAiUi()` slot bag returns its empty default.
//
// See `~/Projects/rudderjs/playground/pages/(panels)/@panel/+Layout.tsx` for
// the canonical "app installs pro" reference and `playground/vite.config.ts`
// for the Vite config it depends on.

// ── Error Boundary ──────────────────────────────────────────────────────────

interface ErrorBoundaryState {
  error: Error | null
}

class PanelErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    const isSerializationError = error.message?.includes('pageContext.data') || error.message?.includes('serializ')

    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6 text-center">
        <p className="text-7xl font-black tracking-tighter text-red-500/20 select-none">Error</p>
        <div className="flex flex-col gap-2 max-w-lg">
          <h1 className="text-xl font-semibold tracking-tight text-red-600 dark:text-red-400">Panel failed to render</h1>
          <pre className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-4 text-left overflow-auto max-h-48 whitespace-pre-wrap">
            {error.message}
          </pre>
          {isSerializationError && (
            <p className="text-sm text-muted-foreground mt-2">
              This usually means a schema element returned non-serializable data (function, class instance, Date).
              Check the server console for <code className="text-xs bg-muted px-1 py-0.5 rounded">[panels] Non-serializable values</code> warnings.
            </p>
          )}
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="px-4 py-2 text-sm font-medium rounded-md border border-border hover:bg-accent transition-colors"
          >
            Retry
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
          >
            Reload page
          </button>
        </div>
      </div>
    )
  }
}

// ── Layout ──────────────────────────────────────────────────────────────────

export default function PanelLayout({ children }: { children: ReactNode }) {
  let data: { panelMeta: PanelNavigationMeta; slug?: string; sessionUser?: { name?: string; email?: string; image?: string } }

  try {
    const ctx = usePageContext() as { data: typeof data }
    data = ctx.data
  } catch (e) {
    // pageContext.data access can throw if not serializable
    return (
      <PanelErrorBoundary>
        <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6 text-center">
          <p className="text-7xl font-black tracking-tighter text-red-500/20 select-none">Error</p>
          <div className="flex flex-col gap-2 max-w-lg">
            <h1 className="text-xl font-semibold tracking-tight text-red-600 dark:text-red-400">Panel data failed to load</h1>
            <pre className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-4 text-left overflow-auto max-h-48 whitespace-pre-wrap">
              {e instanceof Error ? e.message : String(e)}
            </pre>
            <p className="text-sm text-muted-foreground mt-2">
              Check the server console for <code className="text-xs bg-muted px-1 py-0.5 rounded">[panels] Non-serializable values</code> warnings.
            </p>
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
          >
            Reload page
          </button>
        </div>
      </PanelErrorBoundary>
    )
  }

  // SSR: inject theme CSS inline to prevent FOUC
  const themeCss = data.panelMeta.theme ? generateThemeCSS(data.panelMeta.theme) : null

  // Apps that install pro packages should vendor this file and statically
  // wrap the tree below in `<AiUiProvider panelPath={data.panelMeta.path}>`
  // and/or `<CollabProvider>`. See the long comment block at the top of this
  // file for the integration recipe + Vite config requirements.
  return (
    <PanelErrorBoundary>
      {themeCss && <style dangerouslySetInnerHTML={{ __html: themeCss }} />}
      <I18nProvider i18n={data.panelMeta.i18n} locale={data.panelMeta.locale}>
        <AdminLayout panelMeta={data.panelMeta} currentSlug={data.slug ?? ''} {...(data.sessionUser !== undefined ? { initialUser: data.sessionUser } : {})}>
          {children}
        </AdminLayout>
      </I18nProvider>
    </PanelErrorBoundary>
  )
}
