import { defineConfig } from 'vite'
import rudderjs from '@rudderjs/vite'
import vike from 'vike/plugin'
import { pilotiq } from '@pilotiq/pilotiq/vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

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
      '@rudderjs/core',
      '@rudderjs/router',
      '@rudderjs/orm',
      'sanitize-html',
      'react-image-crop',
      'recharts',
      '@uiw/react-codemirror',
      '@codemirror/language',
      '@codemirror/state',
      '@codemirror/lang-json',
      '@codemirror/lang-sql',
    ],
    exclude: [
      // Keep as workspace-link runtime imports so a single instance is shared
      // with the playground's own imports. `@pilotiq/pilotiq` in particular must
      // not be pre-bundled — it transitively imports `@rudderjs/core` which
      // touches `node:fs` and would break client builds.
      '@pilotiq/pilotiq',
      '@pilotiq/tiptap',
      // CLI-only — server-side, must not be pre-bundled
      '@clack/prompts',
      '@clack/core',
    ],
  },
})
