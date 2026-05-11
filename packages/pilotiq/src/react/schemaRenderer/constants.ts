// Tailwind-class lookup tables shared across SchemaRenderer's element
// dispatchers. Pure data — no React, no DOM.

export const TEXT_COLOR_CLASSES: Record<string, string> = {
  default:     '',
  muted:       'text-muted-foreground',
  primary:     'text-primary',
  destructive: 'text-destructive',
  success:     'text-emerald-600 dark:text-emerald-400',
  warning:     'text-amber-600 dark:text-amber-400',
  info:        'text-blue-600 dark:text-blue-400',
}

export const TEXT_SIZE_CLASSES: Record<string, string> = {
  xs:   'text-xs',
  sm:   'text-sm',
  base: 'text-base',
  lg:   'text-lg',
  xl:   'text-xl',
}

export const TEXT_WEIGHT_CLASSES: Record<string, string> = {
  normal:   'font-normal',
  medium:   'font-medium',
  semibold: 'font-semibold',
  bold:     'font-bold',
}

// Map ColumnColor → tailwind text-color class. Used by TextColumn and
// IconColumn alike.
export const COLUMN_COLOR_CLASSES: Record<string, string> = {
  default:     '',
  muted:       'text-muted-foreground',
  primary:     'text-primary',
  destructive: 'text-destructive',
  success:     'text-emerald-600 dark:text-emerald-400',
  warning:     'text-amber-600 dark:text-amber-400',
  info:        'text-blue-600 dark:text-blue-400',
}

export const COLUMN_WEIGHT_CLASSES: Record<string, string> = {
  normal:   'font-normal',
  medium:   'font-medium',
  semibold: 'font-semibold',
  bold:     'font-bold',
}

export const BADGE_COLOR_CLASSES: Record<string, string> = {
  gray:        'bg-muted text-muted-foreground',
  primary:     'bg-primary/10 text-primary',
  success:     'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  warning:     'bg-amber-100  text-amber-800  dark:bg-amber-900/40  dark:text-amber-200',
  destructive: 'bg-destructive/10 text-destructive',
  info:        'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
}

export const alertStyles: Record<string, string> = {
  info:    'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200',
  warning: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200',
  success: 'border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200',
  danger:  'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200',
}
