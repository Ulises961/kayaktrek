import { Stack as RouterStack, useRouter } from "expo-router"
import { useState } from "react"
import { ScrollView } from "react-native"

import type { LogFields } from "@shared/dtos/log"

import { Screen } from "@mobile/components/ui/layout"
import { LogForm } from "@mobile/components/logs/log-form"
import { createLogAnywhere } from "@mobile/lib/logs/offline-logs"

const header = <RouterStack.Screen options={{ title: "New log" }} />

export default function NewLogScreen() {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(fields: LogFields) {
    setSubmitting(true)
    setError(null)
    try {
      // With no signal the log is queued and shows in the list at once (M9d).
      await createLogAnywhere(fields)
      router.back()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create log.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Screen edges={["bottom"]}>
      {header}
      {/* Scrollable, and keyboard-dismissing on drag: the form is five fields, a
          four-line notes box and a submit. With the keyboard up on a phone the
          last field and the button sit underneath it, and a fixed Screen gives no
          way to reach them. */}
      <ScrollView
        testID="log-form-scroll"
        contentContainerClassName="p-4"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <LogForm
          submitLabel="Create log"
          submitting={submitting}
          error={error}
          onSubmit={(fields) => void handleSubmit(fields)}
          variant="cta"
        />
      </ScrollView>
    </Screen>
  )
}
