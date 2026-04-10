import { defineConfig } from 'vite'
import rudderjs from '@rudderjs/vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    rudderjs(),
    tailwindcss(),
    react(),
  ],
  server: {
    allowedHosts: true,
    port: 3001,
    strictPort: true,
    hmr: {
      port: 24679,
    },
  },
  resolve: {
    // Dedupe React + the open-core panel packages so a single instance is
    // shared between the app and `@pilotiq/panels`'s own internals. Without
    // dedupe, Vite's optimizeDeps would pre-bundle them with their own React
    // copies, breaking context lookups across the boundary.
    //
    // No yjs dedupe block — this playground does not install
    // `@pilotiq-pro/collab`, so there is only one yjs instance (the one
    // pulled in transitively by `@pilotiq/lexical`) and the "Yjs was already
    // imported" warning never fires.
    dedupe: [
      'react', 'react-dom',
      '@pilotiq/panels', '@pilotiq/lexical',
    ],
  },
  optimizeDeps: {
    include: [
      // Panels — UI primitives
      '@dnd-kit/core',
      '@dnd-kit/sortable',
      '@dnd-kit/utilities',
      'sonner',
      'recharts',
      'shiki',
      'motion/react',
      '@formkit/auto-animate',

      // Base UI
      '@base-ui/react/collapsible',
      '@base-ui/react/separator',
      '@base-ui/react/merge-props',
      '@base-ui/react/use-render',
      '@base-ui/react/avatar',
      '@base-ui/react/tooltip',
      '@base-ui/react/menu',
      '@base-ui/react/dialog',
      '@base-ui/react/alert-dialog',
      '@base-ui-components/react/tabs',
      '@base-ui-components/react/checkbox',
      '@base-ui-components/react/select',
      '@base-ui-components/react/switch',
      '@base-ui-components/react/dialog',

      // Vike
      'vike-react/useConfig',

      // Lexical (local-only, no @lexical/yjs)
      'lexical',
      '@lexical/react/LexicalComposerContext',
      '@lexical/react/LexicalComposer',
      '@lexical/react/LexicalContentEditable',
      '@lexical/react/LexicalErrorBoundary',
      '@lexical/react/LexicalPlainTextPlugin',
      '@lexical/react/LexicalTypeaheadMenuPlugin',
      '@lexical/react/LexicalRichTextPlugin',
      '@lexical/react/LexicalHistoryPlugin',
      '@lexical/react/LexicalListPlugin',
      '@lexical/react/LexicalLinkPlugin',
      '@lexical/react/LexicalDraggableBlockPlugin',
      '@lexical/react/LexicalHorizontalRuleNode',
      '@lexical/link',
      '@lexical/utils',
      '@lexical/rich-text',
      '@lexical/list',
      '@lexical/code',
      '@floating-ui/dom',
    ],
    exclude: [
      // Keep as workspace-link runtime imports so a single instance is shared
      // with the playground's own imports.
      '@pilotiq/panels',
      '@pilotiq/lexical',
    ],
  },
  ssr: {
    // Framework `@rudderjs/ai` may import these on the server side; keep
    // them external so Vite doesn't try to bundle them.
    external: ['@anthropic-ai/sdk', 'openai', '@google/generative-ai'],
  },
})
