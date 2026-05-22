---
'@pilotiq/pilotiq': patch
---

feat(pilotiq): warn once per Resource that declares `relations()` without a static model

`registerRelationRoutes` falls back to `'hasMany'` as the safe default when `R.model` is missing during late binding — which is correct for the framework but masks misconfiguration. M2M (`belongsToMany` / `morphToMany` / `morphedByMany`) and polymorphic (`morphMany` / `morphTo`) relations silently misbehave with the fallback.

The warning fires once per offending Resource (deduped via a module-level `Set<string>`) on first route registration:

```
[@pilotiq/pilotiq] PostsResource: declares relations() without a static model — every relation
will default to 'hasMany'. M2M (belongsToMany / morphToMany / morphedByMany) and polymorphic
(morphMany / morphTo) relations will misbehave. Set 'static model = …' on the Resource to fix.
```

Pure diagnostic — no behavior change for correctly-configured panels. Apps that were silently relying on the `hasMany` fallback get a clear pointer to the fix.
