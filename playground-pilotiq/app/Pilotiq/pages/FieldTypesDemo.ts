import {
  Page, Heading, Section,
  Form,
  TextField, NumberField,
  Hidden, Checkbox, Radio, CheckboxList, ToggleButtons,
  Slider, ColorPicker, KeyValue,
  DateTimePicker, FileUpload,
  Notification,
} from '@pilotiq/pilotiq'

/**
 * Plan #6 field-types demo. One page exercising every new input plus
 * the cross-field plumbing (prefix, suffix, helperText, default,
 * dehydrated). Live-form-state is on for the dependent options story.
 */
export class FieldTypesDemo extends Page {
  static slug  = 'field-types-demo'
  static label = 'Field types'
  static icon  = 'shapes'

  static override navigationGroup = 'Demos'
  static override navigationSort  = 20

  static schema() {
    return [
      Heading.make('Field types')
        .description('Plan #6 — Hidden / Checkbox / Radio / CheckboxList / Slider / ColorPicker / KeyValue / DateTimePicker / FileUpload + cross-field plumbing (prefix, suffix, helperText, default, dehydrated, formatStateUsing).'),

      Form.make()
        .formId('field-types-demo')
        .schema([
          // Hidden — round-trips a value the user can't edit.
          Hidden.make('source').default('admin-import'),

          Section.make('Cross-field plumbing')
            .schema([
              TextField.make('price')
                .label('Price')
                .prefix('$')
                .helperText('Enter a USD amount.')
                .placeholder('0.00'),

              TextField.make('domain')
                .label('Domain')
                .suffix('.example.com')
                .helperText('Subdomain only — we add the rest.'),

              TextField.make('username')
                .label('Username')
                .prefix({ icon: 'at-sign' })
                .helperText('Letters, numbers, and underscores only.'),

              TextField.make('computed')
                .label('Computed display field')
                .default('This shows but never saves.')
                .dehydrated(false)
                .helperText('dehydrated(false) — value is dropped on submit.'),
            ]),

          Section.make('Choice fields')
            .schema([
              Checkbox.make('agreedToTerms')
                .label('I agree to the demo terms')
                .live(),

              Radio.make('plan')
                .label('Plan')
                .options([
                  { value: 'free',  label: 'Free'  },
                  { value: 'pro',   label: 'Pro'   },
                  { value: 'team',  label: 'Team'  },
                ])
                .default('free')
                .live(),

              Radio.make('billing')
                .label('Billing cycle')
                .inline()
                .options([
                  { value: 'monthly', label: 'Monthly' },
                  { value: 'yearly',  label: 'Yearly'  },
                ])
                .default('monthly'),

              ToggleButtons.make('priority')
                .label('Priority')
                .helperText('Sugar over Radio with chip rendering.')
                .options([
                  { value: 'low',    label: 'Low'    },
                  { value: 'medium', label: 'Medium' },
                  { value: 'high',   label: 'High'   },
                ])
                .default('medium'),

              CheckboxList.make('categories')
                .label('Categories')
                .columns(2)
                .options([
                  { value: 'news',    label: 'News'    },
                  { value: 'guides',  label: 'Guides'  },
                  { value: 'reviews', label: 'Reviews' },
                  { value: 'tutorial', label: 'Tutorials' },
                ]),
            ]),

          Section.make('Numeric & color')
            .schema([
              Slider.make('rating')
                .label('Rating')
                .min(0)
                .max(10)
                .step(1)
                .default(5)
                .showValue(),

              NumberField.make('quantity')
                .label('Quantity')
                .min(1)
                .max(99)
                .default(1)
                .suffix('items'),

              ColorPicker.make('accent')
                .label('Accent color')
                .default('#d97757'),
            ]),

          Section.make('Structured & temporal')
            .schema([
              KeyValue.make('headers')
                .label('HTTP headers')
                .keyLabel('Header')
                .valueLabel('Value')
                .addLabel('Add header')
                .reorderable(),

              DateTimePicker.make('scheduledAt')
                .label('Scheduled at')
                .helperText('When should this go live?'),
            ]),

          Section.make('Uploads')
            .schema([
              FileUpload.make('coverImage')
                .label('Cover image')
                .accept(['image/png', 'image/jpeg', 'image/webp'])
                .maxSize(5 * 1024 * 1024)
                .directory('field-types-demo')
                .helperText('PNG / JPEG / WebP, up to 5 MB.'),

              FileUpload.make('attachments')
                .label('Attachments')
                .multiple()
                .maxSize(10 * 1024 * 1024)
                .directory('field-types-demo/attachments'),
            ]),
        ])
        .save(async (data) => {
          // Demo only — log the submitted data and surface a toast.
          console.log('[field-types-demo] saved', data)
          return data
        })
        .savedNotification(
          Notification.make('Submitted')
            .body('Form posted — check console for the saved data.')
            .success(),
        )
        .redirectAfterSave(() => '/new-admin/field-types-demo'),
    ]
  }
}
