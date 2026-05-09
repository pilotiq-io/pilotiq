---
"@pilotiq/pilotiq": minor
---

Add `Step.beforeValidation()` / `afterValidation()` — async per-step hooks around the wizard validation gate. `beforeValidation((values, { record, user }) => …)` runs before validators (may mutate values in place; throw to halt); `afterValidation` runs after validators pass (cross-field invariants, computed-field stamps, side-effects on confirmed advance). Throwing returns 422 with the message stamped under the reserved `_step` error key. New `findWizardStep` helper exported alongside `findWizardStepFields` for callers that need the live Step instance (back-compat — the existing helper continues to return just the children).
