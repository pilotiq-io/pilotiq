---
'@pilotiq/pilotiq': patch
---

Form values now reach fields nested inside layout containers (Section / Grid / Split / Group / Fieldset / Tabs). `FormBody` only enriched the form's direct field children — a structured edit form (e.g. fields in a `Split` aside) rendered every nested field empty unless the form happened to be live/controlled. `FormRenderer` now provides a `FormValuesContext` and the generic field recursion consumes it via `NestedFormField`, which also surfaces inline validation errors for nested fields.
