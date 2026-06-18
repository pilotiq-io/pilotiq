import { Pilotiq, Section, Heading, Text, TextField } from '@pilotiq/pilotiq'
import { tiptap }     from '@pilotiq/tiptap'
import { codeEditor } from '@pilotiq/codemirror'
import { recharts }   from '@pilotiq/recharts'
import { media, Media } from '@pilotiq/media'
import { html } from '@codemirror/lang-html'
import { PostResource }     from './Posts/PostResource.js'
import { PageResource }     from './SitePages/PageResource.js'
import { CategoryResource } from './Categories/CategoryResource.js'
import { CommentResource }  from './Comments/CommentResource.js'

// The no-login counterpart to AdminPanel.ts — no `.guard()`, no
// `.user()`, so every visitor is a guest: `resolveUser` returns null and
// the default `can*` predicates all pass. Policies that DO check the
// user still bite (PostResource.canDelete wants role === 'admin', so
// guests never see the delete action). Shares the admin panel's
// resource classes — only the base path and chrome differ. Icons come
// from AdminPanel.ts's registerIcons() call (a global registry; both
// panel modules load together).
export const pilotiqGuest = Pilotiq.make('Pilotiq Guest')
  .path('/guest')
  .branding({ title: 'Pilotiq Guest' })
  .locale('en')
  // Same brand defaults as /admin, but a blue accent so it's obvious at
  // a glance which panel you're in.
  .theme({
    preset:     'vega',
    baseColor:  'taupe',
    themeColor: 'blue',
    chartColor: 'blue',
    radius:     'default',
    spacing:    'default',
    fonts:      { heading: 'Satoshi', body: 'Satoshi' },
  })
  .layout('sidebar', { variant: 'sidebar', collapsible: 'offcanvas' })
  .plugins([
    tiptap(),
    codeEditor({ languages: { html } }),
    recharts(),
    // Mirror /admin's media library so the MediaField (on PostResource)
    // works here too — and the unguarded /guest panel doubles as a test
    // surface for the `_media` routes (no login needed).
    // metaFields mirror AdminPanel — the media library registry is keyed by
    // library name across panels (one shared `default`), so both must declare
    // the same custom fields to stay consistent.
    media({
      conversions: [{ name: 'thumb', width: 320, height: 320, crop: true, format: 'webp' }],
      metaFields: [
        TextField.make('credit').label('Credit'),
        TextField.make('license').label('License'),
      ],
    }),
  ])
  .resources([PostResource, PageResource, CategoryResource, CommentResource])
  // Dashboard at /guest — the builder-level schema renders when no
  // dashboard page is registered.
  .schema([
    Heading.make('Guest panel'),
    Section.make('No sign-in required')
      .schema([
        Text.make('This panel has no guard and no user resolver — everyone browses as a guest. Compare with /admin, which redirects signed-out visitors to /login.'),
        Text.make('User-aware policies still apply: guests can browse and edit demo content, but actions gated on a role (like deleting posts) stay hidden.').color('muted'),
      ]),
    // @pilotiq/media — the library browser embedded directly in a page
    // schema (the `Media` element), distinct from the global /guest/media
    // route. Same browser, mounted inline.
    Section.make('Media library (embedded)')
      .schema([
        Media.make('embedded-library').height(420),
      ]),
  ])
