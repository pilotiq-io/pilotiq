# Changesets

This directory holds [changesets](https://github.com/changesets/changesets) — the
release-management tool that drives version bumps and the changelog for every
package under `packages/*`.

## Adding a changeset

When you make a change worth shipping (fix, feature, breaking change), run:

```bash
pnpm changeset
```

Pick the affected packages, pick a bump (patch / minor / major), and write a
short summary. The CLI writes a markdown file into this directory; commit it
alongside your PR.

## Release flow

On every push to `main`, the **Release** GitHub Actions workflow runs
`changesets/action`:

1. **Version mode** — if there are unreleased changeset files, the action
   opens (or updates) a "chore: version packages" PR that bumps versions and
   updates each package's `CHANGELOG.md`.
2. **Publish mode** — once the version PR merges, the next push to `main`
   has no pending changesets, so the action runs `pnpm release` (which
   builds and runs `pnpm changeset publish`) to publish to npm under the
   `@pilotiq/*` scope.

The `pilotiq-playground` workspace is ignored — it's a demo app, not
a published package.

## Quick reference

| What | Command |
|---|---|
| Add a changeset | `pnpm changeset` |
| Bump versions locally | `pnpm changeset version` |
| Publish (CI does this) | `pnpm release` |
