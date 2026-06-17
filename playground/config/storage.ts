import type { StorageConfig } from '@rudderjs/storage'

/**
 * Storage disks (`@rudderjs/storage`). The `public` disk backs `@pilotiq/media`
 * — files land under `public/media/…` (the demo serves `public/` at the web
 * root, so `baseUrl: ''` resolves them at `/media/…`).
 */
export default {
  default: 'public',

  disks: {
    public: {
      driver:  'local',
      root:    'public',
      baseUrl: '',
    },
  },
} satisfies StorageConfig
