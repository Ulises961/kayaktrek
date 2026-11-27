import { useState } from "react"

import type { TripFields } from "@shared/dtos/trip"

import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import { Stack } from "../ui/layout"
import { Text } from "../ui/text"

type TripFormValues = {
  destination: string
  description: string
  dateFrom: string
  dateTo: string
}

const EMPTY: TripFormValues = { destination: "", description: "", dateFrom: "", dateTo: "" }

// Blank strings become absent, not "": TripFieldsSchema's optional branches see
// nothing rather than an empty value, as the log form does. The schema itself
// (createTrip parses it) is the validation; this only trims and drops blanks.
function toTripFields(values: TripFormValues): TripFields {
  return {
    destination: values.destination.trim() || undefined,
    description: values.description.trim() || undefined,
    dateFrom: values.dateFrom.trim() || undefined,
    dateTo: values.dateTo.trim() || undefined,
  }
}

// The trip's own details: where, when and a note. Difficulty is derived from the
// itinerary on the server, and the route is built on the itinerary screen, so
// neither is asked for here.
export function TripForm({
  submitLabel,
  submitting,
  error,
  onSubmit,
}: {
  submitLabel: string
  submitting: boolean
  error: string | null
  onSubmit: (fields: TripFields) => void
}) {
  const [values, setValues] = useState<TripFormValues>(EMPTY)

  function set<K extends keyof TripFormValues>(key: K, value: TripFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <Stack className="gap-4">
      <Stack className="gap-1.5">
        <Label>Destination</Label>
        <Input
          value={values.destination}
          onChangeText={(v) => set("destination", v)}
          placeholder="e.g. Shetland"
          maxLength={200}
        />
      </Stack>
      <Stack className="gap-1.5">
        <Label>Start date</Label>
        <Input
          value={values.dateFrom}
          onChangeText={(v) => set("dateFrom", v)}
          placeholder="YYYY-MM-DD"
          autoCapitalize="none"
        />
      </Stack>
      <Stack className="gap-1.5">
        <Label>End date</Label>
        <Input
          value={values.dateTo}
          onChangeText={(v) => set("dateTo", v)}
          placeholder="YYYY-MM-DD"
          autoCapitalize="none"
        />
      </Stack>
      <Stack className="gap-1.5">
        <Label>Description</Label>
        <Input
          value={values.description}
          onChangeText={(v) => set("description", v)}
          placeholder="Optional"
          multiline
          numberOfLines={4}
          maxLength={2000}
          className="h-24 py-2"
        />
      </Stack>
      {error && (
        <Text className="text-sm text-destructive" testID="trip-form-error">
          {error}
        </Text>
      )}
      <Button
        variant="cta"
        disabled={submitting}
        onPress={() => onSubmit(toTripFields(values))}
        testID="trip-form-submit"
      >
        {submitting ? "Saving…" : submitLabel}
      </Button>
    </Stack>
  )
}
