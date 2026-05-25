import { defineConfig, type Plugin } from 'vite'
import rudderjs from '@rudderjs/vite'
import vike from 'vike/plugin'
import { pilotiq } from '@pilotiq/pilotiq/vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

// `@rudderjs/core` is the server framework. Its main entry eval-references the
// Node `process` global (and `node:fs`) and re-exports the `@rudderjs/console`
// → `@clack/prompts` CLI chain. The panel schema files (`app/Pilotiq/**`) import
// `app` from it purely to call `app().make('prisma')` inside SERVER-side data
// callbacks — but those same files are also pulled into the CLIENT bundle by the
// generated `pages/(pilotiq)/_components.ts` (it imports AdminPanel to harvest
// component-typed icons). Bundling core for the browser throws
// `process is not defined` at module eval → React never hydrates → Vike's client
// router never attaches → every navigation becomes a full page reload.
//
// Fix: stub `@rudderjs/core` in the CLIENT build only. The SSR build keeps the
// real module, so server-side `app()` works untouched. The stub's `app()` (etc.)
// throws if it is ever actually invoked on the client — it never is, because the
// callbacks that call it only run server-side. If a panel file starts importing a
// new core export, add it to the stub (a missing named export surfaces as a clear
// build error). See memory: optimizeDeps.include — @rudderjs/core trips @clack.
function stubServerCoreOnClient(): Plugin {
  const VIRTUAL = '\0rudderjs-core-client-stub'
  return {
    name: 'pilotiq:stub-rudderjs-core-on-client',
    enforce: 'pre',
    resolveId(id, _importer, opts) {
      if (id === '@rudderjs/core' && !opts?.ssr) return VIRTUAL
      return null
    },
    load(id) {
      if (id !== VIRTUAL) return null
      return [
        "const serverOnly = (name) => () => { throw new Error('@rudderjs/core ' + name + '() is server-only and was reached on the client') }",
        "export const app = serverOnly('app')",
        "export const resolve = serverOnly('resolve')",
        "export const appendToGroup = serverOnly('appendToGroup')",
        "export const resetGroupMiddleware = serverOnly('resetGroupMiddleware')",
        "export const defaultProviders = serverOnly('defaultProviders')",
        "export const defineConfig = (c) => c",
        "export const Env = serverOnly('Env')",
        "export class Application {}",
        "export class RudderJS {}",
        "export class ServiceProvider {}",
        "export default {}",
      ].join('\n')
    },
  }
}

export default defineConfig({
  plugins: [
    stubServerCoreOnClient(),
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
  // `@rudderjs/orm@1.12.x` reads `process.env['RUDDER_ORM_TRACE']` at MODULE
  // top-level (dist/index.js). orm is pulled into the CLIENT bundle via panel
  // Models (which `extends Model` + use orm decorators, so the client must eval
  // the orm module to define those classes). The browser has no `process`, so
  // the bare read throws `process is not defined` at eval → React never hydrates
  // → Vike's client router never attaches → every navigation becomes a full page
  // reload. Folding the flag to a literal removes the only top-level `process`
  // reference (verified: it's the sole one in orm's index). Harmless on SSR — it
  // just disables orm's debug trace there too. Proper fix is upstream: orm should
  // guard `typeof process !== 'undefined'`; rudder plan filed.
  define: {
    'process.env.RUDDER_ORM_TRACE': 'undefined',
  },
  optimizeDeps: {
    // orm is pre-bundled (it's in `include`), so the define above must also be
    // applied during dep optimization — otherwise the pre-bundled chunk keeps the
    // raw `process.env[...]` read and still crashes the client.
    esbuildOptions: {
      define: {
        'process.env.RUDDER_ORM_TRACE': 'undefined',
      },
    },
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
      // DO NOT add '@rudderjs/core' or '@rudderjs/router' here. They re-export
      // '@rudderjs/console', whose `await import('@clack/prompts')` pulls a
      // CLI lib that references the Node `process` global. Pre-bundling them
      // into the CLIENT bundle therefore throws `process is not defined` on
      // mount → React never hydrates → Vike's client router never attaches →
      // every link becomes a full page reload. Neither is client-reachable
      // from pilotiq, so omitting them simply keeps them out of the browser
      // graph. Only '@rudderjs/orm' is safe (its chain ends at @rudderjs/contracts).
      '@rudderjs/orm',
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
      'codemirror',
      // y-codemirror.next bridges the CodeEditor field to the collab Y.Doc.
      'y-codemirror.next',
    ],
    exclude: [
      // Keep as workspace-link runtime imports so a single instance is shared
      // with the playground's own imports. `@pilotiq/pilotiq` in particular must
      // not be pre-bundled — it transitively imports `@rudderjs/core` which
      // touches `node:fs` and would break client builds.
      '@pilotiq/pilotiq',
      '@pilotiq/tiptap',
      // Server framework — stubbed on the client by stubServerCoreOnClient().
      // Excluded here so the client dep-optimizer never tries to pre-bundle the
      // real module (which would re-introduce the `process is not defined` crash).
      '@rudderjs/core',
      // CLI-only — server-side, must not be pre-bundled
      '@clack/prompts',
      '@clack/core',
    ],
  },
})
