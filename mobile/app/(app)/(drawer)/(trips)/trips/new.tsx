import { Stack as RouterStack, useRouter } from "expo-router"
import { useState } from "react"
import { ScrollView } from "react-native"
import { ZodError } from "zod"

import type { TripFields } from "@shared/dtos/trip"

import { TripForm } from "@mobile/components/trips/trip-form"
import { Screen } from "@mobile/components/ui/layout"
import { createTrip } from "@mobile/lib/trips/actions"

const header = <RouterStack.Screen options={{ title: "New trip" }} />

export default function NewTripScreen() {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(fields: TripFields) {
    setSubmitting(true)
    setError(null)
    try {
      const tripId = await createTrip(fields)
      // Replace, not push: back from the new trip's hub should reach the list, not
      // an already-submitted form.
      router.replace(`/trips/${tripId}`)
    } catch (err) {
      if (err instanceof ZodError) {
        setError(err.issues[0]?.message ?? "Check the trip's details.")
      } else {
        setError(err instanceof Error ? err.message : "Failed to create the trip.")
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Screen edges={["bottom"]}>
      {header}
      <ScrollView
        testID="trip-form-scroll"
        contentContainerClassName="p-4"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <TripForm
          submitLabel="Create trip"
          submitting={submitting}
          error={error}
          onSubmit={(fields) => void handleSubmit(fields)}
        />
      </ScrollView>
    </Screen>
  )
}
