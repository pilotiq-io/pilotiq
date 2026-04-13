import { Route } from '@rudderjs/router'
import { registerPilotiqRoutes } from '@pilotiq/pilotiq'
import { pilotiqAdmin } from '../app/Pilotiq/AdminPanel.js'

// Web routes — reserved for server-side redirects, auth guards, etc.

registerPilotiqRoutes(Route, pilotiqAdmin)
