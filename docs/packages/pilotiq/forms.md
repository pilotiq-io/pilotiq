# Forms

Schema-driven forms in `@pilotiq/pilotiq` are built with the same vocabulary
as Resources and Pages — `Form.make().schema([Field, Field, ...])`. Every
field is a typed builder with validators, conditional visibility, reactive
state, and a wire-format that round-trips through `FormData` or JSON.

> [!NOTE]
> The new pilotiq Forms API replaces `@pilotiq/panels`' form pipeline.
> See [Migrating from `@pilotiq/panels`](../migrating-from-panels) for the
> field-by-field renaming map.

## Quick example

```ts filename="app/Pilotiq/Resources/PostResource.ts"
import { Resource, Form, TextField, Textarea, Section } from '@pilotiq/pilotiq'

export class PostResource extends Resource {
  static slug() { return 'posts' }

  static form(form: Form) {
    return form.schema([
      Section.make('Content').schema([
        TextField.make('title').required().maxLength(120),
        Textarea.make('body').rows(8),
      ]),
    ])
  }
}
```

## Topics

- **[Fields](./fields)** — every built-in field type (Text, Select, Toggle,
  Checkbox, Radio, Slider, ColorPicker, Repeater, Builder, …) with their
  setters and validation contracts.
- **[Layouts](./layouts)** — `Section`, `Group`, `Fieldset`, `Split`,
  `Wizard`, `Grid`. The chrome you wrap fields in.
- **[Validation](./validation)** — `required()`, `email()`, `unique()`,
  `distinct()`, custom `validate(fn)` callbacks, async pipelines.
- **[Reactive fields](./reactive)** — `live()`, `$get`/`$set`,
  `afterStateUpdated`, dependent options.
