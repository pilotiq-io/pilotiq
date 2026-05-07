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

## Inline create-from-select

`SelectField.createOptionForm([…])` adds a "+" trigger next to the Select.
Click it to open a modal with the supplied sub-form; submit creates the
new option, appends it to the dropdown, and selects it — without leaving
the parent form.

```ts filename="app/Pilotiq/Resources/PostResource.ts"
import {
  Resource, Form,
  SelectField, TextField, EmailField,
  email, minLength,
} from '@pilotiq/pilotiq'
import { User } from '../../Models/User.js'

export class PostResource extends Resource {
  static override form(form: Form): Form {
    return form.schema([
      SelectField.make('authorId')
        .label('Author')
        .required()
        .options(async () => {
          const users = await User.query().paginate(1, 100)
          return users.data.map((u) => ({
            value: u.id,
            label: `${u.name} (${u.email})`,
          }))
        })
        .createOptionForm([
          TextField.make('name').required().validate(minLength(2)),
          EmailField.make('email').required().validate(email()),
        ])
        .createOptionUsing(async ({ name, email }) => {
          const user = await User.create({ name: String(name), email: String(email) })
          return { value: user.id, label: `${user.name} (${user.email})` }
        }),
    ])
  }
}
```

### Three method surface

| Method | Required? | Purpose |
|---|---|---|
| `createOptionForm(fields[])` | yes | Sub-schema rendered inside the modal. Same field types, validators, conditional visibility, and `$get` access as a regular form. |
| `createOptionUsing(handler)` | yes | Server-side handler receiving the modal's coerced + validated values. Returns `{ value, label }` for the new option. Throwing surfaces as a 500 to the modal. |
| `createOptionAuthorize(rule)` | no | Visibility gate on the "+" trigger. Default: visible. Server re-runs the same predicate so URL access cannot bypass. **Does not auto-inherit `Resource.canCreate`** — the option being created is rarely the same model as the parent form's record. |

Pair with `Resource`-level policy when the model the sub-form creates
has its own gate. For example, only let admins create new authors:

```ts
SelectField.make('authorId')
  .createOptionForm([…])
  .createOptionUsing(handler)
  .createOptionAuthorize(({ user }) => user?.role === 'admin')
```

### Validation, errors, and reactive state

The sub-form runs `coerceFormValues` + `validateSchema` against the
sub-schema before the handler is called. Validation errors come back as
`{ ok: false, status: 422, errors: { fieldName: [msg, …] } }` and stamp
inline beneath the matching field in the modal — same renderer as the
parent form's error display.

Dependent options resolve against the **parent form's** `RenderContext`,
so a `country` Select on the parent can drive a `region` Select inside
the modal:

```ts
SelectField.make('regionId')
  .options([...])
  .createOptionForm([
    TextField.make('name').required(),
    SelectField.make('country')
      .options(({ $get }) => listRegionsFor($get('country'))),
  ])
  .createOptionUsing(({ name, country }) =>
    Region.create({ name, country })
      .then(r => ({ value: r.id, label: r.name })),
  ),
```

`live()` *inside* the modal is deferred to v2 — modal lifecycles are
short, and round-tripping a sub-form's state mid-modal is rarely worth
the complexity. File a request when you hit a case that needs it.

### Where the new option lives

After a successful create the option is appended to the rendered Select's
local options state and selected. The change round-trips on submit via
the standard hidden input. If the parent SelectField's `options(fn)`
resolver re-runs on the next request (`live()`, full submit), the
canonical resolver is the source of truth — the temporary local-state
addition naturally fades out as the freshly persisted row gets picked
up by the resolver.

If you need cross-tab option propagation (a newly created author should
be selectable by every editor on every open form right now), reach for
a broadcast pattern outside this surface — pilotiq does not push option
list updates between open tabs in v1.

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
