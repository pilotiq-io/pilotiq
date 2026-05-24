---
'@pilotiq/pilotiq': patch
---

refactor(pilotiq): route dialog / action-group / inline-create buttons through the shadcn `<Button>`

The remaining hand-rolled `h-9` buttons that bypassed the shared component now use `<Button>`, so they pick up the shadcn chrome (`h-8`, `rounded-lg`, focus ring, active-press) and stay consistent with the rest of the panel: the confirm/cancel buttons in `ActionModalDialog` and `ConfirmActionDialog`, the confirm dialog inside `ActionGroup`, and the `SelectField` inline-create trigger/cancel/submit. Modal confirm CTAs keep their intentional **solid-red** styling (a className override on the default variant) rather than the soft inline `destructive` variant.
