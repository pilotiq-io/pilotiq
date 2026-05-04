import {
  TextField,
  TextareaField,
  SelectField,
  ToggleField,
  DateField,
  type Form,
} from '@pilotiq/pilotiq'
import { RichTextField, Block, MentionProvider } from '@pilotiq/tiptap'
import { CodeEditorField }                       from '@pilotiq/codemirror'

export const ArticleForm = {
  configure(form: Form): Form {
    return form.schema([
      TextField.make('title').label('Title').required().placeholder('Article title…'),
      TextField.make('slug').label('Slug').required(),
      TextareaField.make('excerpt').label('Excerpt').rows(3).placeholder('Short summary…'),
      SelectField.make('status').label('Status').required().options([
        { value: 'draft',     label: 'Draft' },
        { value: 'published', label: 'Published' },
        { value: 'archived',  label: 'Archived' },
      ]),
      ToggleField.make('featured').label('Featured'),
      DateField.make('publishedAt').label('Published at'),
      RichTextField.make('body').label('Body').placeholder('Start writing…')
        .enableToolbarButtons(['attachFiles', 'table'])
        .resizableImages()
        .fileAttachmentsAcceptedFileTypes(['image/*'])
        .fileAttachmentsMaxSize(2_000_000)
        .fileAttachmentsDirectory('articles')
        .mergeTags(['firstName', 'company', 'unsubscribeUrl'])
        .mentions([
          MentionProvider.make('@').items([
            { id: 'sleman', label: 'Sleman' },
            { id: 'admin',  label: 'Admin'  },
          ]),
          MentionProvider.make('#').items([
            { id: 'general', label: 'general', group: 'Channels' },
            { id: 'random',  label: 'random',  group: 'Channels' },
          ]),
        ])
        .blocks([
          Block.make('callout').label('Callout').icon('💡').schema([
            TextField.make('title').label('Title').placeholder('Callout title'),
            TextareaField.make('content').label('Content').required(),
            SelectField.make('tone').label('Tone').options([
              { value: 'info',    label: 'Info' },
              { value: 'warning', label: 'Warning' },
              { value: 'success', label: 'Success' },
            ]),
          ]),
        ]),
      CodeEditorField.make('metadata')
        .label('Metadata (JSON)')
        .language('json')
        .height('220px')
        .placeholder('{ "schema": "json" }')
        .helperText('Free-form JSON blob. CodeMirror provides highlight + bracket matching.'),
    ])
  },
}
