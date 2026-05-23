---
'@pilotiq/pilotiq': patch
---

fix(pilotiq): resolve the live panel in the reactive form POST endpoints too — dev edits reflect without a restart

Follow-up to the SSR/render-data `livePanel()` fix. The four interactive form builders (`formStateData`, `formWizardData`, `formCreateOptionData`, `mentionResolveData`) still passed their registration-time `Pilotiq` closure straight through, so editing a `live()` field's `options(fn)`, an `afterStateUpdated` hook, a wizard step's validators, an inline-create form, or a mention resolver reflected on the initial SSR render but not on the subsequent partial-resolve / step-validate / create-option / mention roundtrip until a server restart. Each now re-resolves via `livePanel()` at request time, matching the chrome and render-data builders.
