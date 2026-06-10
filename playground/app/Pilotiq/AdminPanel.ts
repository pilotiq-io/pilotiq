import {
  Pilotiq, Global, TextField,
  Form,
  UserMenuItem,
} from '@pilotiq/pilotiq'
import { themeEditor, databaseThemeStorage } from '@pilotiq/pilotiq/plugins'
import { registerIcons } from '@pilotiq/pilotiq/icons'
import {
  BookOpen, ChartBar, Check, CheckCircle2, Circle, FileText, Folder,
  LayoutDashboard, MessageSquare, Newspaper, Palette, Send, Settings,
  TrendingUp, UserCircle, Users,
} from 'lucide-react'
import { tiptap }     from '@pilotiq/tiptap'
import { codeEditor, CodeEditorField } from '@pilotiq/codemirror'
import { recharts }   from '@pilotiq/recharts'
import { html } from '@codemirror/lang-html'
import { app } from '@rudderjs/core/client'
import { PostResource }     from './Posts/PostResource.js'
import { PageResource }     from './SitePages/PageResource.js'
import { CategoryResource } from './Categories/CategoryResource.js'
import { CommentResource }  from './Comments/CommentResource.js'
import { UserResource }     from './Users/UserResource.js'
import { MyDashboard } from './pages/MyDashboard.js'
import { ProfilePage } from './pages/ProfilePage.js'

// Register ONLY the string-typed icons this panel actually uses
// (resource/page nav icons, action icons, framework defaults like
// BooleanColumn's 'circle'/'check-circle-2') instead of the full
// ~150-icon lucide baseline — keeps the client bundle lean. Runs at
// module load on both server (provider boot) and client (the auto-gen
// `_components.ts` re-imports this file).
registerIcons({
  'book-open':        BookOpen,
  'chart-bar':        ChartBar,
  'check':            Check,
  'check-circle-2':   CheckCircle2,   // BooleanColumn "true" default
  'circle':           Circle,         // BooleanColumn "false" default
  'file-text':        FileText,
  'folder':           Folder,
  'layout-dashboard': LayoutDashboard,
  'message-square':   MessageSquare,
  'newspaper':        Newspaper,
  'palette':          Palette,        // theme-editor nav link
  'send':             Send,
  'settings':         Settings,
  'trending-up':      TrendingUp,
  'user-circle':      UserCircle,
  'users':            Users,
})

// Native-engine ORM adapter — the `'db'` binding the auto-discovered
// NativeDatabaseProvider registers. Lazy so the panel module stays
// client-safe (it's re-imported in the browser via `_components.ts`).
function db(): any {
  return app().make('db')
}

class SiteSettings extends Global {
  static override label         = 'Site Settings'
  static override labelSingular = 'Site Settings'
  static override slug          = 'site-settings'
  static override icon          = 'settings'

  static override form(form: Form): Form {
    return form
      .schema([
        TextField.make('siteName').label('Site name').required().placeholder('Pilotiq Demo'),
        TextField.make('tagline').label('Tagline').placeholder('Optional…'),
        CodeEditorField.make('headSnippet')
          .label('Head snippet')
          .language('html')
          .height('160px')
          .placeholder('<!-- analytics / meta tags injected into <head> -->')
          .helperText('Raw HTML injected into every public page’s <head>.'),
      ])
      .loadRecord(async () => {
        const row = await db().query('panelGlobal').where('slug', 'pilotiq-admin__site').first()
        return row?.data ? JSON.parse(row.data) : {}
      })
      .save(async (data) => {
        // ISO string, not a Date — better-sqlite3 can't bind Date objects.
        const payload = { data: JSON.stringify(data), updatedAt: new Date().toISOString() }
        const updated = await db().query('panelGlobal')
          .where('slug', 'pilotiq-admin__site').updateAll(payload)
        if (updated === 0) {
          await db().query('panelGlobal').insertMany([{ slug: 'pilotiq-admin__site', ...payload }])
        }
        return data
      })
  }
}

export const pilotiqAdmin = Pilotiq.make('Pilotiq Admin')
  .path('/admin')
  .branding({ title: 'Pilotiq' })
  // App locale for built-in dateTime/money/numeric formatting. Keep in sync
  // with config/localization.ts (APP_LOCALE). A literal — not Env.get() —
  // because this panel module is also bundled for the client.
  .locale('en')
  // Pilotiq brand defaults — also what the theme editor's "Reset to
  // Defaults" snaps back to.
  .theme({
    preset:     'vega',
    baseColor:  'taupe',
    themeColor: 'terracotta',
    chartColor: 'terracotta',
    radius:     'default',
    spacing:    'default',
    fonts:      { heading: 'Satoshi', body: 'Satoshi' },
  })
  .layout('sidebar', { variant: 'sidebar', collapsible: 'offcanvas' })
  // Adapter packages register through the panel module — each plugin's
  // `register()` runs in both SSR + the browser. Idempotent.
  .plugins([
    tiptap(),
    codeEditor({ languages: { html } }),
    recharts(),
    // Theme persistence over the native engine's `'db'` adapter. Lazy
    // thunk keeps the panel module client-safe.
    themeEditor({
      storage: databaseThemeStorage(() => db(), { slug: 'Pilotiq Admin__theme' }),
    }),
  ])
  // Demo auth — session-backed. POST /login (routes/web.ts) stashes the
  // user id under the session's `userId` key; the guard turns every
  // signed-out request away to the login page (carrying the original URL
  // as ?redirect= so sign-in bounces back). The matching user resolver
  // lives in bootstrap/providers.ts (server-only — it reads the User
  // model). Real apps pass `req => Auth.user()` (from `@rudderjs/auth`)
  // and guard on the same. The /guest panel (GuestPanel.ts) is the
  // no-login counterpart.
  .guard(
    (req) => Boolean((req as { session?: { get?: (k: string) => unknown } })?.session?.get?.('userId')),
    { redirectTo: '/login' },
  )
  .userMenuItems([
    UserMenuItem.make('docs')
      .label('Documentation')
      .icon('book-open')
      .url('https://pilotiq.io/docs')
      .openUrlInNewTab(),
  ])
  .signOut('/logout')
  // Bell-icon dropdown — rows authored via
  // `Notification.make('…').sendToDatabase(user)` (see the Publish
  // action on PostResource).
  .databaseNotifications({ polling: 30 })
  // Note: `.uploads(...)` is wired in `bootstrap/providers.ts` (server-only)
  // because `localUpload` imports `node:fs/promises`.
  .resources([PostResource, PageResource, CategoryResource, CommentResource, UserResource])
  .globals([SiteSettings])
  .pages([MyDashboard])
  .dashboard(MyDashboard)
  // User-menu auto-injects "Edit profile" pointing at this page.
  .profile(ProfilePage)
