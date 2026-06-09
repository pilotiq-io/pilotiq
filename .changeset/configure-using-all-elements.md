---
"@pilotiq/pilotiq": minor
---

`Element.configureUsing()` now works on **every Element primitive**, not just `Field` and `Column`. Register an app-wide default once and it applies to every instance made afterward:

```ts
Action.configureUsing(a => a.icon('plus'))
Section.configureUsing(s => s.compact())
TextEntry.configureUsing(e => e.weight('semibold'))
SelectFilter.configureUsing(f => f.searchable())
```

Wired across all entries, filters (including the stateful `make()`s that install a default query — the configurator runs after, Filament order), `Action` / `ActionGroup`, every schema layout/display element (`Section`/`Card`/`Grid`/`Group`/`Fieldset`/`Split`/`Tabs`/`Tab`/`Wizard`/`Step`/`Text`/`Heading`/`Alert`/`Divider`/`Image`/`Icon`/`Markdown`/`Html`/`UnorderedList`/`EmptyState`/`SlotComponent`/head-tags), the dashboard widgets (`StatsOverview`/`View`/`TableWidget`), and `ListTabs`/`Breadcrumbs`/`RelationTabs`. The polymorphic `make(this: …)` factories (component entry + widgets) resolve registrations off the instance's prototype chain, so subclass-made instances pick up ancestor-class defaults too.

Value-objects that aren't Elements remain excluded (set their defaults inline): table `Summarizer`s, query-builder `Constraint`s, `Stat`, builder `Block`, `TableGroup`, `RowButton`.
