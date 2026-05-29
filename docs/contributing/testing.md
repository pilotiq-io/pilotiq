# Testing

Pilotiq runs tests with **`node:test`** — no vitest. The `test` script compiles
the package through `tsconfig.test.json` into `dist-test/`, then runs
`node --test` over the compiled `.js`:

```bash
pnpm test            # from packages/pilotiq — compile + run everything
```

To iterate on a subset, compile once then point `node --test` at the file(s):

```bash
npx tsc -p tsconfig.test.json
node --test "dist-test/react/fields/TextLikeInput.test.js"
```

## Two kinds of test

- **Pure-logic tests (`*.test.ts`)** — the default. Extract logic into a pure
  helper and assert on it with `node:assert`. Most of the suite is this. No DOM,
  fast. Example: `src/react/fields/RepeaterInput.test.ts` tests the exported
  `reorderRows` function, not the component.
- **Render tests (`*.test.tsx`)** — for behavior that only exists once a
  component is mounted: event handling, context wiring, conditional rendering,
  async fetch-and-replace. These use a DOM (happy-dom) + React Testing Library.

Prefer pure-logic tests. Reach for a render test only when the behavior needs a
mounted tree.

## Writing a render test

Three rules:

1. **Import the DOM setup FIRST**, before any React / Testing Library import:

   ```ts
   import '../../__test__/dom.js'        // registers happy-dom — MUST be first
   import { describe, it } from 'node:test'
   import assert from 'node:assert/strict'
   import { screen } from '@testing-library/react'
   import { userEvent } from '@testing-library/user-event'
   ```

   ESM evaluates imports in source order, so `dom.js` registers the DOM globals
   before `react-dom` loads. Get the order wrong and the render throws.

2. **Render through `renderWithProviders`** — it wraps the UI in the context
   providers components expect (currently `FormStateProvider`) and registers the
   RTL `cleanup()` afterEach for you:

   ```ts
   import { renderWithProviders } from '../../__test__/renderWithProviders.js'
   import { fakeFormMeta, fakeFieldMeta } from '../../__test__/fakes.js'

   renderWithProviders(<MyField name="title" … />, {
     formMeta: fakeFormMeta([fakeFieldMeta('title', { defaultValue: 'hi' })]),
   })
   ```

   Options: `formMeta`, `errors`, `fetchImpl` (a test fetch stub — see
   `jsonFetch` in `fakes.ts`), `withoutFormState` (uncontrolled path).

3. **Query by role/label, drive with `user-event`.** Assert on what the user
   sees, not internal state. See `src/react/fields/TextLikeInput.test.tsx` for a
   worked example.

For a provider-free component you may use RTL's raw `render` directly — but
then **register `cleanup` yourself** in an `afterEach`, or renders pile up
across cases and queries throw "found multiple elements". `renderWithProviders`
does this for you; raw `render` does not. See `src/react/cells/EditableCell.test.tsx`.

## Harness internals (`src/__test__/`)

- **`dom.ts`** — registers happy-dom into the Node process and stubs the few
  browser APIs happy-dom lacks (e.g. `matchMedia`). Add stubs here as gaps
  surface, with a comment saying why.
- **`renderWithProviders.tsx`** — the provider-wrapping `render`. Grows as new
  providers become necessary; audit each component's context needs before
  testing it.
- **`fakes.ts`** — shared fake builders (`fakeFieldMeta`, `fakeFormMeta`,
  `fakeRecord`) and the `jsonFetch` stub.

`node --test` runs each file in its own process, so the DOM registered in a
render test never leaks into the DOM-free pure tests.

## Rollout

Render-test coverage is being built out in phases — see
[`docs/plans/client-component-tests.md`](../plans/client-component-tests.md) for
the harness rationale and the prioritized component list.
