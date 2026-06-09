---
"@pilotiq/tiptap": patch
---

Relax the exact `3.22.4` pins on the ten `@tiptap/extension-*` peer (and dev) dependencies to `^3.22.4`. The exact pins were an accident of pinning the installed version when each extension feature landed, not an intentional ceiling — and because Tiptap extensions peer-pin `@tiptap/core` exactly per release train, the pins made it impossible for consumers to align on core ≥3.23 (required by `@tiptap/extension-collaboration@^3.23`), producing unavoidable `unmet peer` warnings. Consumers should keep their whole `@tiptap/*` set on one release train.
