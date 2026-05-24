/** Re-export of the package-root `applyColumnFormat`.
 *
 *  The implementation moved to `src/columnFormat.ts` so server resolve
 *  code (`dispatchTable`, `Entry.toMeta`) can stamp formatted values into
 *  `_formatted` without importing across the `react/` boundary. This
 *  shim keeps the existing client-renderer import paths stable. */
export { applyColumnFormat } from '../../columnFormat.js'
