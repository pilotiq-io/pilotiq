---
"@pilotiq/pilotiq": minor
---

Add `FieldLabelSlotRegistry` — a generic plugin seam that lets external packages inject a ReactNode next to any field label. `registerFieldLabelSlot(Component)` stores the slot component; `getFieldLabelSlot()` reads it. Both exported from `@pilotiq/pilotiq/react`. `FieldShell` gains a `labelSlot?: ReactNode` prop; `SchemaRenderer.renderField` populates it when the field has `aiActions` + `_agentRunBase` on its meta. `tagFieldAiUrls(elements, agentBase)` (exported from `@pilotiq/pilotiq`) stamps `_agentRunBase` on every resolved field that opted into AI actions, called in `resourceEditData` after `applyRoleHooks`. Used by `@pilotiq-pro/ai` to render the ✦ quick-action button.
