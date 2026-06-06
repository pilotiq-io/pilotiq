import { defineConfig } from 'vite'
import rudderjs from '@rudderjs/vite'
import vike from 'vike/plugin'
import { pilotiq } from '@pilotiq/pilotiq/vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

// `@rudderjs/core`'s main entry eval-references the Node `process` global (and
// `node:fs`) and re-exports the `@rudderjs/console` → `@clack/prompts` CLI chain,
// so it must never reach the browser bundle (`process is not defined` at module
// eval → React never hydrates → Vike's client router never attaches → every
// navigation becomes a full page reload).
//
// The panel schema files (`app/Pilotiq/**`) call `app().make('prisma')` inside
// SERVER-side data callbacks, but those files are also pulled into the CLIENT
// bundle by the generated `pages/(pilotiq)/_components.ts` (it imports AdminPanel
// to harvest component-typed icons). They therefore import `app` from the
// client-safe `@rudderjs/core/client` subpath (core@1.4.0+) — real on the server,
// browser-safe on the client. Server-only files (bootstrap, providers, config/**)
// keep importing the main `@rudderjs/core` entry via the SSR build. This replaced
// an earlier CLIENT-build stub of the whole module.

export default defineConfig({
  plugins: [
    pilotiq(),
    rudderjs(),
    vike(),
    tailwindcss(),
    react(),
  ],
  server: {
    allowedHosts: true,
    port: 3003,
    strictPort: true,
    hmr: {
      port: 24680,
    },
  },
  resolve: {
    dedupe: [
      'react', 'react-dom',
      '@pilotiq/pilotiq',
      '@pilotiq/tiptap',
      // Tiptap keeps state on module-level singletons — multiple copies
      // of @tiptap/core / @tiptap/pm break the editor.
      '@tiptap/core', '@tiptap/pm', '@tiptap/react',
    ],
  },
  optimizeDeps: {
    include: [
      'reflect-metadata',
      'vike/abort',
      'vike-react/useConfig',
      // Pre-bundle tiptap + its peers up-front so the first edit-page visit
      // doesn't trigger a multi-second "new dependencies optimized" stall.
      // Without this Vite discovers them lazily on import.
      '@tiptap/core',
      '@tiptap/pm/state',
      '@tiptap/pm/view',
      '@tiptap/pm/model',
      'prosemirror-changeset',
      '@tiptap/react',
      '@tiptap/starter-kit',
      '@tiptap/extension-placeholder',
      '@tiptap/suggestion',
      '@tiptap/extension-underline',
      '@tiptap/extension-subscript',
      '@tiptap/extension-superscript',
      '@tiptap/extension-text-align',
      '@tiptap/extension-text-style',
      '@tiptap/extension-color',
      '@tiptap/extension-highlight',
      '@tiptap/extension-image',
      '@tiptap/extension-table',
      '@tiptap/extension-details',
      'marked',
      // Base UI sub-paths — each import is a separate optimizeDeps entry,
      // so listing them up-front avoids one-by-one discovery stalls.
      '@base-ui/react/input',
      '@base-ui/react/select',
      '@base-ui/react/switch',
      '@base-ui/react/checkbox',
      '@base-ui/react/popover',
      '@base-ui/react/dialog',
      '@base-ui/react/tooltip',
      '@base-ui/react/tabs',
      '@base-ui/react/menu',
      '@base-ui/react/separator',
      '@base-ui/react/slider',
      '@base-ui/react/button',
      'react-day-picker',
      'lucide-react',
      '@base-ui/react/merge-props',
      '@base-ui/react/use-render',
      'clsx',
      'tailwind-merge',
      'class-variance-authority',
      'zod',
      'vike/server',
      // Pre-bundle pilotiq runtime peers + adapter deps. `@pilotiq/pilotiq`
      // is in `optimizeDeps.exclude` below so Vite doesn't crawl its
      // imports during the initial scan; without these listed explicitly,
      // each gets discovered the first time a page renders something that
      // uses it, triggering a "new dependencies optimized" reload mid-nav.
      //
      // DO NOT add the main '@rudderjs/core' entry or '@rudderjs/router' here.
      // They re-export '@rudderjs/console', whose `await import('@clack/prompts')`
      // pulls a CLI lib that references the Node `process` global. Pre-bundling
      // them into the CLIENT bundle throws `process is not defined` on mount →
      // React never hydrates → Vike's client router never attaches → every link
      // becomes a full page reload. Neither is client-reachable from pilotiq.
      // Client code uses the '@rudderjs/core/client' subpath instead (below).
      // '@rudderjs/orm' is safe (its chain ends at @rudderjs/contracts).
      '@rudderjs/orm',
      // Client-safe core subpath (app / Env / config / DI / validation) — imported
      // by the panel schema files that get pulled into the browser bundle.
      '@rudderjs/core/client',
      // Collab editor surface (record-room Y.Doc, CollabRoomManager) — its
      // React entry is pulled the first time a collab-enabled page mounts.
      '@rudderjs/sync/react',
      // 'sanitize-html' is server-only (lazy `import()` in schema/sanitize.ts);
      // listing it here forces it into the client pre-bundle for nothing.
      'react-image-crop',
      'recharts',
      '@uiw/react-codemirror',
      '@codemirror/language',
      '@codemirror/state',
      '@codemirror/view',
      '@codemirror/commands',
      '@codemirror/lang-json',
      '@codemirror/lang-sql',
      // AdminPanel.ts imports this directly for the page-content editor; the
      // schema files reach the client via the excluded '@pilotiq/pilotiq', so
      // the initial scan misses it → lazy discovery → mid-session re-optimize
      // reload that 404s every already-hashed dep chunk.
      '@codemirror/lang-html',
      'codemirror',
      // y-codemirror.next bridges the CodeEditor field to the collab Y.Doc.
      'y-codemirror.next',
      // @dnd-kit powers smooth row reordering in pilotiq's table renderer.
      '@dnd-kit/core',
      '@dnd-kit/sortable',
      '@dnd-kit/modifiers',
      '@dnd-kit/utilities',
    ],
    exclude: [
      // Keep as workspace-link runtime imports so a single instance is shared
      // with the playground's own imports. `@pilotiq/pilotiq` in particular must
      // not be pre-bundled — it transitively imports `@rudderjs/core` which
      // touches `node:fs` and would break client builds.
      '@pilotiq/pilotiq',
      '@pilotiq/tiptap',
      // Server framework main entry (CLI chain + Node-only). Not client-reachable
      // — browser code uses '@rudderjs/core/client'. Excluded so the dep-optimizer
      // never tries to pre-bundle the real module (which would re-introduce the
      // `process is not defined` crash); server-only files import it via the SSR build.
      '@rudderjs/core',
      // CLI-only — server-side, must not be pre-bundled
      '@clack/prompts',
      '@clack/core',
    ],
  },
})
