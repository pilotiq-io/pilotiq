import * as React from 'react'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { DayPicker, getDefaultClassNames } from 'react-day-picker'

import { cn } from '../utils.js'

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  const defaults = getDefaultClassNames()

  return (
    <DayPicker
      data-slot="calendar"
      showOutsideDays={showOutsideDays}
      className={cn('p-3', className)}
      classNames={{
        months: cn(defaults.months, 'flex flex-col sm:flex-row gap-2'),
        month: cn(defaults.month, 'flex flex-col gap-4'),
        month_caption: cn(defaults.month_caption, 'flex justify-center pt-1 relative items-center'),
        caption_label: cn(defaults.caption_label, 'text-sm font-medium'),
        nav: cn(defaults.nav, 'absolute inset-x-0 top-1 flex items-center justify-between px-1'),
        button_previous: cn(
          defaults.button_previous,
          'inline-flex h-7 w-7 items-center justify-center rounded-md border border-input bg-transparent text-muted-foreground shadow-xs hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50',
        ),
        button_next: cn(
          defaults.button_next,
          'inline-flex h-7 w-7 items-center justify-center rounded-md border border-input bg-transparent text-muted-foreground shadow-xs hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50',
        ),
        month_grid: cn(defaults.month_grid, 'w-full border-collapse space-y-1'),
        weekdays: cn(defaults.weekdays, 'flex'),
        weekday: cn(defaults.weekday, 'text-muted-foreground rounded-md w-8 font-normal text-[0.8rem]'),
        week: cn(defaults.week, 'flex w-full mt-2'),
        day: cn(
          defaults.day,
          'relative h-8 w-8 p-0 text-center text-sm focus-within:relative focus-within:z-20',
        ),
        day_button: cn(
          defaults.day_button,
          'inline-flex size-8 items-center justify-center rounded-md p-0 font-normal aria-selected:opacity-100 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        ),
        selected: cn(
          defaults.selected,
          '[&>button]:bg-primary [&>button]:text-primary-foreground [&>button:hover]:bg-primary [&>button:hover]:text-primary-foreground',
        ),
        today: cn(defaults.today, '[&>button]:bg-accent [&>button]:text-accent-foreground'),
        outside: cn(defaults.outside, 'text-muted-foreground/50 aria-selected:text-muted-foreground'),
        disabled: cn(defaults.disabled, 'text-muted-foreground opacity-50'),
        hidden: cn(defaults.hidden, 'invisible'),
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === 'left'
            ? <ChevronLeftIcon className="size-4" />
            : <ChevronRightIcon className="size-4" />,
      }}
      {...props}
    />
  )
}

export { Calendar }
