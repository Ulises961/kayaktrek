import { useState } from "react"

import type { Log, LogFields } from "@shared/dtos/log"
import { formatDistanceForInput } from "@shared/itinerary/distance"

import { Button, type ButtonProps } from "../ui/button"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import { Stack } from "../ui/layout"
import { Text } from "../ui/text"

type LogFormInitial = Partial<Pick<Log, "date" | "hours" | "avgSea" | "distance" | "notes">>

export type LogFormValues = {
  date: string
  hours: string
  avgSea: string
  distance: string
  notes: string
}

const EMPTY: LogFormValues = { date: "", hours: "", avgSea: "", distance: "", notes: "" }

export function toFormValues(fields?: LogFormInitial): LogFormValues {
  if (!fields) return EMPTY
  return {
    date: fields.date ?? "",
    hours: fields.hours != null ? String(fields.hours) : "",
    avgSea: fields.avgSea != null ? String(fields.avgSea) : "",
    // Not String() like the fields above: a log generated from an expedition
    // carries the haversine sum's full float, which reached the input as
    // "0.6568740073199207".
    distance: fields.distance != null ? formatDistanceForInput(fields.distance) : "",
    notes: fields.notes ?? "",
  }
}

// Numeric parsing only — LogFieldsSchema.parse (called by the actions layer) is
// the actual validation; this just turns blank strings into `undefined` rather
// than NaN so the schema's `.optional()` branches see absence, not garbage.
function toLogFields(values: LogFormValues): LogFields {
  return {
    date: values.date || undefined,
    hours: values.hours ? Number(values.hours) : undefined,
    avgSea: values.avgSea ? Number(values.avgSea) : undefined,
    distance: values.distance ? Number(values.distance) : undefined,
    notes: values.notes || undefined,
  }
}

// No trip picker — a log created here is standalone (non-endorsable) until a
// future WP wires this form into a trip context. `tripId` is deliberately left
// untouched by this form (create/update payloads never send it), matching
// LogFieldsSchema not needing one for a manual entry (the M9i plan WP1).
export function LogForm({
  initial,
  submitLabel,
  submitting,
  error,
  onSubmit,
  // "default" (structure blue) for editing a log that already exists — creating one
  // is the only path that gets the CTA (M30 identity pass; button-roles.ts's "not for:
  // saving edits to something that already exists" rule).
  variant = "default",
}: {
  initial?: LogFormInitial
  submitLabel: string
  submitting: boolean
  error: string | null
  onSubmit: (fields: LogFields) => void
  variant?: ButtonProps["variant"]
}) {
  const [values, setValues] = useState<LogFormValues>(() => toFormValues(initial))

  function set<K extends keyof LogFormValues>(key: K, value: LogFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <Stack className="gap-4">
      <Stack className="gap-1.5">
        <Label>Date</Label>
        <Input
          value={values.date}
          onChangeText={(v) => set("date", v)}
          placeholder="YYYY-MM-DD"
          autoCapitalize="none"
        />
      </Stack>
      <Stack className="gap-1.5">
        <Label>Hours on the water</Label>
        <Input
          value={values.hours}
          onChangeText={(v) => set("hours", v)}
          keyboardType="decimal-pad"
          placeholder="e.g. 3.5"
        />
      </Stack>
      <Stack className="gap-1.5">
        <Label>Distance (km)</Label>
        <Input
          value={values.distance}
          onChangeText={(v) => set("distance", v)}
          keyboardType="decimal-pad"
          placeholder="e.g. 18"
        />
      </Stack>
      <Stack className="gap-1.5">
        <Label>Average sea state (Beaufort 0–12)</Label>
        <Input
          value={values.avgSea}
          onChangeText={(v) => set("avgSea", v)}
          keyboardType="number-pad"
          placeholder="e.g. 3"
        />
      </Stack>
      <Stack className="gap-1.5">
        <Label>Notes</Label>
        <Input
          value={values.notes}
          onChangeText={(v) => set("notes", v)}
          placeholder="Conditions, route, anything worth remembering"
          multiline
          numberOfLines={4}
          className="h-24 py-2"
        />
      </Stack>
      {error && <Text className="text-sm text-destructive">{error}</Text>}
      <Button variant={variant} disabled={submitting} onPress={() => onSubmit(toLogFields(values))}>
        {submitting ? "Saving…" : submitLabel}
      </Button>
    </Stack>
  )
}
