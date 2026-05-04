import {
  Page, Heading,
  Form, TextField, SelectField, ToggleField,
  Notification,
} from '@pilotiq/pilotiq'

/**
 * Plan #5 reactive-fields demo.
 *
 * Exercises every reactive surface end-to-end:
 *   - `live()` on a TextField with debounce + `afterStateUpdated` that
 *     `$set`s a sibling (auto-slug from title).
 *   - `live()` on a SelectField — `country` change triggers the State
 *     dropdown to re-resolve via `options(({ $get }) => …)`.
 *   - Conditional `Section.visible(({ $get }) => …)` — shipping address
 *     fields appear only when "Has shipping" toggle is on.
 *   - Tier-2 follow-up: `afterStateUpdatedJs(string)` — client-only
 *     reactivity. The "Heading" field's slug populates instantly with
 *     no roundtrip; compare against the title→slug above which waits
 *     for the 350 ms debounce + server roundtrip.
 *
 * No DB required; the form's save handler echoes data back to the toast.
 */

const COUNTRIES: Array<{ value: string; label: string }> = [
  { value: 'US', label: 'United States' },
  { value: 'CA', label: 'Canada'        },
  { value: 'JO', label: 'Jordan'        },
]

const STATES: Record<string, Array<{ value: string; label: string }>> = {
  US: [
    { value: 'CA', label: 'California' },
    { value: 'NY', label: 'New York'   },
    { value: 'TX', label: 'Texas'      },
  ],
  CA: [
    { value: 'ON', label: 'Ontario'  },
    { value: 'QC', label: 'Quebec'   },
    { value: 'BC', label: 'British Columbia' },
  ],
  JO: [
    { value: 'AM', label: 'Amman'    },
    { value: 'IR', label: 'Irbid'    },
    { value: 'AQ', label: 'Aqaba'    },
  ],
}

function slugify(s: string): string {
  return s.trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export class ReactiveDemo extends Page {
  static slug  = 'reactive-demo'
  static label = 'Reactive demo'
  static icon  = 'sparkles'

  static override navigationGroup = 'Demos'
  static override navigationSort  = 10

  static schema() {
    return [
      Heading.make('Reactive fields')
        .description('Plan #5 — `live()`, `afterStateUpdated`, dependent options, conditional sections.'),

      Form.make()
        .formId('reactive-demo')
        .schema([
          // Auto-slug from title (immediate trigger with a small debounce
          // so we don't roundtrip on every keystroke).
          TextField.make('title')
            .label('Title')
            .placeholder('Enter a title')
            .live({ debounce: 350 })
            .afterStateUpdated((value, { $get, $set }) => {
              const current = String($get('slug') ?? '')
              const next    = slugify(String(value ?? ''))
              // Only overwrite the slug if it looks auto-generated — leave
              // user-typed slugs alone. Heuristic: empty, or matches the
              // previous title's slug.
              if (current === '' || current === slugify(String($get('_titlePrev') ?? ''))) {
                $set('slug', next)
              }
              $set('_titlePrev', value)
            }),

          TextField.make('slug')
            .label('Slug')
            .placeholder('auto-generated from title'),

          // Client-only reactivity counterpart — `afterStateUpdatedJs`
          // compiles the body via `new Function` and runs it on every
          // keystroke without a server roundtrip. Notice there is no
          // `live()` on this field — the JS hook is independent.
          TextField.make('heading')
            .label('Heading')
            .placeholder('Type and watch headingSlug update instantly')
            .afterStateUpdatedJs(`
              const slug = String($state ?? '')
                .trim().toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '')
              $set('headingSlug', slug)
            `),

          TextField.make('headingSlug')
            .label('Heading slug (instant)')
            .placeholder('updates as you type — no server roundtrip'),

          // Dependent select — country drives the state options.
          SelectField.make('country')
            .label('Country')
            .options(COUNTRIES)
            .live(),

          SelectField.make('state')
            .label('State / region')
            .options(({ $get }) => {
              const country = String($get?.('country') ?? '')
              return STATES[country] ?? []
            }),

          // Toggle gates the conditional shipping fields below.
          ToggleField.make('hasShipping')
            .label('Use a separate shipping address')
            .live(),

          TextField.make('shippingStreet')
            .label('Shipping street')
            .placeholder('123 Main St')
            .showWhen(({ $get }) => $get?.('hasShipping') === true),

          TextField.make('shippingCity')
            .label('Shipping city')
            .placeholder('Springfield')
            .showWhen(({ $get }) => $get?.('hasShipping') === true),
        ])
        .save(async (data) => {
          // Demo only — echo the submitted data into the toast title.
          console.log('[reactive-demo] saved', data)
          return data
        })
        .savedNotification(
          Notification.make('Submitted')
            .body('Form posted — check console for the saved data.')
            .success(),
        )
        .redirectAfterSave(() => '/new-admin/reactive-demo'),
    ]
  }
}
