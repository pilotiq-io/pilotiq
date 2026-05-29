// The render entry point for component tests. Wraps the UI in the context
// providers most pilotiq components read, with test defaults and per-call
// overrides. Build this out as new providers become necessary — each phase
// of `docs/plans/client-component-tests.md` audits what its targets need.
//
// Importing this module registers an `afterEach(cleanup)` so RTL unmounts
// between cases (RTL only auto-registers cleanup for vitest/jest/mocha, not
// `node:test`). Render tests must still `import '../__test__/dom.js'` FIRST
// so the DOM exists before React Testing Library loads here.
import { afterEach } from 'node:test'
import React from 'react'
import { render, cleanup, type RenderResult } from '@testing-library/react'
import { FormStateProvider } from '../react/FormStateContext.js'
import { NavigateProvider, type NavigateFn } from '../react/navigate.js'
import type { ElementMeta } from '../schema/Element.js'
import { fakeFormMeta } from './fakes.js'

afterEach(cleanup)

export interface RenderProvidersOptions {
  /** Form meta supplying field defaults to the `FormStateProvider`. Defaults
   *  to an empty form. The provider's presence puts fields on the controlled
   *  path (`useFieldState().controlled === true`). */
  formMeta?: ElementMeta
  /** Initial server-side validation errors, keyed by field name. */
  errors?: Record<string, string[]>
  /** Test fetch stub for live-resolve POSTs — see `jsonFetch` in `fakes.ts`. */
  fetchImpl?: typeof fetch
  /** Skip the `FormStateProvider` entirely to exercise the uncontrolled path,
   *  or to test a component (like `FormRenderer`) that mounts its own. */
  withoutFormState?: boolean
  /** Provide a spy to capture SPA navigation. Without it, `useNavigate` falls
   *  back to `window.location` (a real navigation under happy-dom). */
  navigate?: NavigateFn
}

/** Render `ui` inside the standard provider stack. Returns RTL's result. */
export function renderWithProviders(
  ui: React.ReactElement,
  opts: RenderProvidersOptions = {},
): RenderResult {
  const { formMeta, errors = {}, fetchImpl, withoutFormState, navigate } = opts

  let tree = ui
  if (!withoutFormState) {
    tree = (
      <FormStateProvider
        initialMeta={formMeta ?? fakeFormMeta()}
        initialErrors={errors}
        {...(fetchImpl ? { fetchImpl } : {})}
      >
        {tree}
      </FormStateProvider>
    )
  }
  if (navigate) {
    tree = <NavigateProvider navigate={navigate}>{tree}</NavigateProvider>
  }
  return render(tree)
}
