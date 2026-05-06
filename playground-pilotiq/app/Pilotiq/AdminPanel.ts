import {
  Pilotiq, Global, TextField,
  Form,
  UserMenuItem,
  Alert, Heading,
} from '@pilotiq/pilotiq'
import { themeEditor } from '@pilotiq/pilotiq/plugins'
import { registerIcons } from '@pilotiq/pilotiq/icons'
import { lucideIcons } from '@pilotiq/pilotiq/icons/lucide'
import { app } from '@rudderjs/core'
import { ArticleResource } from './Articles/ArticleResource.js'
import { UserResource }    from './Users/UserResource.js'
import { PostResource }    from './Posts/PostResource.js'
import { TagResource }     from './Tags/TagResource.js'
import { VideoResource }   from './Videos/VideoResource.js'
import { CommentResource } from './Comments/CommentResource.js'
import { ContentCluster }  from './Content/ContentCluster.js'
import { SimplePage } from './pages/SimplePage.js'
import { ElementsShowcase } from './pages/ElementsShowcase.js'
import { ReactiveDemo } from './pages/ReactiveDemo.js'
import { FieldTypesDemo } from './pages/FieldTypesDemo.js'
import { LayoutsDemo } from './pages/LayoutsDemo.js'
import { RepeaterDemo } from './pages/RepeaterDemo.js'
import { BuilderDemo } from './pages/BuilderDemo.js'
import { MyDashboard } from './pages/MyDashboard.js'
import { ProfilePage } from './pages/ProfilePage.js'
import { NotificationsDemo } from './pages/NotificationsDemo.js'

// Register the curated lucide baseline so string-typed icons
// (Action.icon('check'), Column.icon('star'), etc.) resolve at render time.
// Runs at module load — both server (provider boot) and client (auto-gen
// _components.ts re-imports this file).
registerIcons(lucideIcons)

function prisma(): any {
  return app().make('prisma')
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
      ])
      .loadRecord(async () => {
        const row = await prisma().panelGlobal.findUnique({ where: { slug: 'pilotiq-admin__site' } })
        return row?.data ? JSON.parse(row.data) : {}
      })
      .save(async (data) => {
        await prisma().panelGlobal.upsert({
          where:  { slug: 'pilotiq-admin__site' },
          update: { data: JSON.stringify(data) },
          create: { slug: 'pilotiq-admin__site', data: JSON.stringify(data) },
        })
        return data
      })
  }
}

export const pilotiqAdmin = Pilotiq.make('Pilotiq Admin')
  .path('/new-admin')
  .branding({ title: 'Pilotiq' })
  .use(themeEditor())
  // Plan #10 demo — pretend everyone is an admin so the canDelete()
  // check on `ArticleResource` shows the Delete row action. Real apps
  // would pass `req => Auth.user()` (from `@rudderjs/auth`). The `id`
  // matters for `Notification.sendToDatabase(user)` — the bell scopes
  // every read/write through `String(user.id)`.
  .user(() => ({
    id:    1,
    role:  'admin',
    name:  'Demo Admin',
    email: 'admin@example.com',
  }))
  .userMenuItems([
    UserMenuItem.make('docs')
      .label('Documentation')
      .icon('book-open')
      .url('https://pilotiq.io/docs')
      .openUrlInNewTab(),
  ])
  .signOut('/logout')
  // Bell-icon dropdown — reads from the `notification` table shipped by
  // `@rudderjs/notification`'s `NotificationProvider` (already in the
  // playground's providers list). Author rows via
  // `Notification.make('…').sendToDatabase(user)` from any action handler.
  .databaseNotifications({ polling: 30 })
  // Note: `.uploads(...)` is wired in `bootstrap/providers.ts` (server-only)
  // because `localUpload` imports `node:fs/promises` and the panel module
  // is read on the client through the auto-gen `_components.ts` manifest.
  .clusters([ContentCluster])
  .resources([ArticleResource, UserResource, PostResource, TagResource, VideoResource, CommentResource])
  .globals([SiteSettings])
  .pages([MyDashboard, SimplePage, ElementsShowcase, ReactiveDemo, FieldTypesDemo, LayoutsDemo, RepeaterDemo, BuilderDemo, NotificationsDemo])
  // Plan #15 — mark MyDashboard as the panel's root page. The custom
  // root replaces the previous `.schema(async () => [...])` placeholder;
  // panel.dashboard() registers MyDashboard, collapses its nav URL to
  // `${base}`, and routes `${base}` to its schema.
  .dashboard(MyDashboard)
  // User-menu auto-injects "Edit profile" pointing at this page.
  .profile(ProfilePage)
  // Render-hook smoke — chrome (Day 1) + page-role (Day 2):
  // - body.start banner sits at the top of every page chrome
  // - sidebar.footer label
  // - list-records.table.before splices an Alert above the Articles list table
  .renderHook('panels::body.start', () => [
    Alert.make('Render-hook demo: this banner is mounted via panel.renderHook(\'panels::body.start\').').info(),
  ])
  .renderHook('panels::sidebar.footer', () => [
    Heading.make('Pilotiq playground').level(6),
  ])
  .renderHook(
    'panels::resource.pages.list-records.table.before',
    () => [Alert.make('Tip: scoped page-role hook — this Alert is only on the Articles list.').info()],
    { resource: ArticleResource },
  )
  .renderHook('panels::global-search.results.before', () => [
    Alert.make('Tip: press ESC to close the palette, or click any result to navigate.').info(),
  ])

export const pilotiqSimple = Pilotiq.make('Pilotiq simple')
  .path('/simple')
  .layout('topbar')
  .branding({ title: 'Simple' })
  .resources([ArticleResource])
