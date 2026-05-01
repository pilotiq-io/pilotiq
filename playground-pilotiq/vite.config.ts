import { defineConfig } from 'vite'
import rudderjs from '@rudderjs/vite'
import { pilotiq } from '@pilotiq/pilotiq/vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    pilotiq(),
    rudderjs(),
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
