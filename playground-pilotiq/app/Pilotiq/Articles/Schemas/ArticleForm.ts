import { TextField, type Form } from '@pilotiq/pilotiq'

export const ArticleForm = {
  configure(form: Form): Form {
    return form.schema([
      TextField.make('title').label('Title').required().placeholder('Article title…'),
      TextField.make('slug').label('Slug').required(),
    ])
  },
}
