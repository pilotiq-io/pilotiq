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
    ],
  },
  optimizeDeps: {
    include: [
      'reflect-metadata',
      'vike/abort',
      'vike-react/useConfig',
    ],
    exclude: [
      // Keep as workspace-link runtime imports so a single instance is shared
      // with the playground's own imports. `@pilotiq/pilotiq` in particular must
      // not be pre-bundled — it transitively imports `@rudderjs/core` which
      // touches `node:fs` and would break client builds.
      '@pilotiq/pilotiq',
      // CLI-only — server-side, must not be pre-bundled
      '@clack/prompts',
      '@clack/core',
    ],
  },
})
