---
'@pilotiq/pilotiq': minor
---

feat(wizard): nav-button customizers + URL-state persistence

`Wizard.submitAction(a => …) / .nextAction(...) / .previousAction(...)`
let consumers customize the chrome of the built-in nav buttons. The
customizer receives a framework-built default `Action` (Submit / Next /
Back) and returns a customized clone (or a fresh `Action` outright);
chrome (label / icon / color / size / outlined / iconOnly / tooltip /
disabled rules) carries through to the rendered button while click
behavior stays hardwired to advance / recede / submit-form.

`submitAction` is the opt-in case: by default the wizard renders a hint
pointing at the surrounding form's Save button. Setting `submitAction`
mounts a real `<button type="submit">` inside the wizard chrome on the
final step, making the wizard self-contained — pair with
`CreatePage.getFormActions(R) → []` to suppress the page-level Save when
you don't want two submits on the same page.

`Wizard.persistStepInQueryString(key='step' | true | false)` mirrors the
active step to the URL as `?<key>=N` (1-based for human-friendly URLs)
via `history.replaceState` — purely client-side state sync with no SSR
re-fetch. URL wins over localStorage on initial mount so deep-linking
to a specific step works. Multi-wizard pages should use distinct keys
to avoid collisions on the same query string.
