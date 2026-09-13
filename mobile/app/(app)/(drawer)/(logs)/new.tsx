import { Stack as RouterStack, useRouter } from "expo-router"
import { useState } from "react"

import type { LogFields } from "@shared/dtos/log"

import { Screen } from "@mobile/components/ui/layout"
import { LogForm } from "@mobile/components/logs/log-form"
import { createLog } from "@mobile/lib/logs/actions"

const header = <RouterStack.Screen options={{ title: "New log" }} />

export default function NewLogScreen() {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(fields: LogFields) {
    setSubmitting(true)
    setError(null)
    try {
      await createLog(fields)
      router.back()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create log.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Screen edges={["bottom"]} className="p-4">
      {header}
      <LogForm
        submitLabel="Create log"
        submitting={submitting}
        error={error}
        onSubmit={(fields) => void handleSubmit(fields)}
      />
    </Screen>
  )
}
