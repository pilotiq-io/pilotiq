import { Route } from '@rudderjs/router'

// Catch-all: any unmatched /api/* route returns 404 instead of falling
// through to Vike.
Route.all('/api/*', (_req, res) => res.status(404).json({ message: 'Route not found.' }))
