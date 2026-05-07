import {
  Page, Heading, Text,
  Form, TextField, EmailField, TextareaField, SelectField, ToggleField,
  Section, Fieldset, Group, Split, Grid, Wizard, Step,
  Notification,
} from '@pilotiq/pilotiq'

/**
 * Plan #8 schema-layouts demo.
 *
 * Exercises every layout primitive end-to-end:
 *   - `Wizard` + `Step` — three-step form with cross-step `$get` so step 3's
 *     summary reads values from step 1.
 *   - `Split` — main + aside Section layout.
 *   - `Section` polish — icon, badge, compact, persistCollapsed.
 *   - `Fieldset` — grouped Address fields with a thin border + legend.
 *   - `Group` — chrome-less container used for visibility gating.
 *   - `Grid` + `columnSpan` — title spans both columns of a 2-col grid.
 *
 * Pinned `formId('layouts-demo')` because the wizard-validate endpoint
 * (Plan #8) matches by formId — same constraint as the partial-resolve
 * endpoint from Plan #5.
 */
export class LayoutsDemo extends Page {
  static slug  = 'layouts-demo'
  static label = 'Layouts demo'
  static icon  = 'layout-grid'

  static override navigationGroup = 'Demos'
  static override navigationSort  = 30

  static schema() {
    return [
      Heading.make('Schema layouts')
        .description('Plan #8 — Wizard, Split, Fieldset, Group, columnSpan, Section polish.'),

      // Outer Split — primary form on the main side, helper text in the
      // aside. Aside Section is marked `aside()` so the renderer pins it
      // to the right rail at @md and stacks under the main on small.
      Split.make().schema([
        Section.make('Onboarding wizard')
          .description('Three steps with per-step server validation.')
          .icon('user-plus')
          .schema([
            Form.make()
              .formId('layouts-demo')
              .schema([
                Wizard.make().steps([
                  Step.make('Account')
                    .icon('user')
                    .description('Login details — email + password are required to advance.')
                    .schema([
                      Fieldset.make('Sign-in').columns(2).schema([
                        EmailField.make('email').label('Email').required(),
                        TextField.make('password').label('Password').required(),
                      ]),
                      ToggleField.make('marketing').label('Send me product updates'),
                    ]),

                  Step.make('Profile')
                    .icon('id-card')
                    .description('Tell us about yourself.')
                    .schema([
                      // Grid with columnSpan on the bio so it takes both columns.
                      Grid.make().columns(2).schema([
                        TextField.make('firstName').label('First name').required(),
                        TextField.make('lastName').label('Last name').required(),
                        TextareaField.make('bio').label('Short bio').columnSpan(2),
                      ]),

                      // Group used purely for visibility gating — no chrome.
                      Group.make()
                        .visible(({ values }) => values?.['marketing'] === true)
                        .schema([
                          SelectField.make('preferredTopic')
                            .label('Preferred topic for updates')
                            .options([
                              { value: 'product',  label: 'Product news' },
                              { value: 'guides',   label: 'Guides + how-tos' },
                              { value: 'releases', label: 'Release notes only' },
                            ])
                            .default('product'),
                        ]),
                    ]),

                  Step.make('Confirm')
                    .icon('check')
                    .description('Review then submit. The Save button is the form\'s native submit.')
                    .schema([
                      Text.make('Submit the form when you\'re ready — earlier steps still post their values.'),
                    ]),
                ]).skippable(),
              ])
              .save(async (data) => {
                console.log('[layouts-demo] submitted', data)
                return data
              })
              .savedNotification(
                Notification.make('Submitted')
                  .body('Form posted — check console for the saved data.')
                  .success(),
              )
              .redirectAfterSave(() => '/new-admin/layouts-demo'),
          ]),

        Section.make('Layout primitives at a glance')
          .description('How the chrome composes.')
          .badge('Plan #8')
          .compact()
          .aside()
          .collapsible()
          .persistCollapsed()
          .schema([
            Text.make('Split places this card on the right at @md — try resizing.'),
            Text.make('Section.persistCollapsed remembers your choice across navigations.'),
            Text.make('Fieldset wraps fields under a thin labeled border.'),
            Text.make('Group is invisible chrome, useful for visibility gating.'),
          ]),
      ]),
    ]
  }
}
