import { Route } from '@rudderjs/router'
import { registerAuthRoutes } from '@rudderjs/auth/routes'

// Auth UI pages — /login, /register, /forgot-password, /reset-password
registerAuthRoutes(Route, { allowAuthenticated: true })
