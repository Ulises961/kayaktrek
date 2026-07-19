"use client"

import * as React from "react"
import { format, parseISO, isValid } from "date-fns"
import { CalendarIcon } from "lucide-react"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface DatePickerProps {
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
  disabled?: boolean
  id?: string
  /** Override the trigger button styling (e.g. for compact inline use). */
  className?: string
  size?: React.ComponentProps<typeof Button>["size"]
  /** ISO date (YYYY-MM-DD) — calendar days before this are disabled. */
  minDate?: string
  /** ISO date (YYYY-MM-DD) — calendar days after this are disabled. */
  maxDate?: string
  /** Optional content rendered below the calendar grid, inside the popover
   * (e.g. a caller-specific "extend the allowed range" affordance). */
  footer?: React.ReactNode
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  disabled,
  id,
  className,
  size,
  minDate,
  maxDate,
  footer,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false)

  const selected = value && isValid(parseISO(value)) ? parseISO(value) : undefined
  const minDateParsed = minDate && isValid(parseISO(minDate)) ? parseISO(minDate) : undefined
  const maxDateParsed = maxDate && isValid(parseISO(maxDate)) ? parseISO(maxDate) : undefined

  function handleSelect(date: Date | undefined) {
    onChange?.(date ? format(date, "yyyy-MM-dd") : "")
    setOpen(false)
  }

  const disabledMatchers = [
    ...(minDateParsed ? [{ before: minDateParsed }] : []),
    ...(maxDateParsed ? [{ after: maxDateParsed }] : []),
  ]

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          size={size}
          disabled={disabled}
          className={cn(
            "w-full justify-start overflow-hidden text-left font-normal",
            !selected && "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon className="mr-2 size-4 shrink-0" />
          <span className="truncate">
            {selected ? format(selected, "d MMM yyyy") : placeholder}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        {/* Open on the selected date's month; if there's no value yet, anchor on
            the nearest bound (minDate, else maxDate) instead of today's month —
            otherwise the first actually-pickable date can be many months away
            from where the calendar opens. */}
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected ?? minDateParsed ?? maxDateParsed}
          onSelect={handleSelect}
          disabled={disabledMatchers.length > 0 ? disabledMatchers : undefined}
          initialFocus
        />
        {footer}
      </PopoverContent>
    </Popover>
  )
}
