---
"@pilotiq/pilotiq": minor
---

RelationManager learns morphToMany + morphedByMany — the `belongsToMany` pivot-mutation gate (attach / detach / sync via `relationAttach / Detach / BulkDetach`) now extends to both polymorphic many-to-many sides shipped in @rudderjs/orm v1.6, closing the M2M-polymorphic gate.
