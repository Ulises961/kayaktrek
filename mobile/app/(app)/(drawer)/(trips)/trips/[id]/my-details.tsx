import { Stack as RouterStack, useLocalSearchParams, useRouter } from "expo-router"
import { useEffect, useState } from "react"
import { ActivityIndicator, ScrollView } from "react-native"

import { Button } from "@mobile/components/ui/button"
import { Input } from "@mobile/components/ui/input"
import { Label } from "@mobile/components/ui/label"
import { Screen, Stack } from "@mobile/components/ui/layout"
import { SectionLabel } from "@mobile/components/ui/section-label"
import { Text } from "@mobile/components/ui/text"
import { getSession } from "@mobile/lib/auth/session"
import {
  MUTATION_ENTITY,
  MUTATION_OPERATION,
  enqueueMutation,
  pushQueuedMutations,
} from "@mobile/lib/db/mutation-queue"
import { loadOfflineCrew } from "@mobile/lib/db/offline-float-plan"
import { useQueuedChanges } from "@mobile/lib/network/queued-changes"
import { type FloatPlanField, applyPendingFloatPlan } from "@mobile/lib/trips/pending-float-plan"
import { getTrip } from "@mobile/lib/trips/actions"

const header = <RouterStack.Screen options={{ title: "My details" }} />

type Details = Partial<Record<FloatPlanField, string | number | null>> & { id?: string | null }

type FormValues = Record<FloatPlanField, string>

const FIELDS: { field: FloatPlanField; label: string; keyboard?: "numeric" | "phone-pad" }[] = [
  { field: "vesselMake", label: "Make" },
  { field: "vesselModel", label: "Model" },
  { field: "vesselLengthCm", label: "Length (cm)", keyboard: "numeric" },
  { field: "vesselColorPrimary", label: "Main colour" },
  { field: "vesselColorSecondary", label: "Second colour" },
  { field: "emergencyContactName", label: "Name" },
  { field: "emergencyContactPhone", label: "Phone", keyboard: "phone-pad" },
  { field: "emergencyContactRelationship", label: "Relationship" },
]

function toForm(details: Details): FormValues {
  return Object.fromEntries(
    FIELDS.map(({ field }) => [field, details[field] == null ? "" : String(details[field])]),
  ) as FormValues
}

// M9d WP7: the paddler's own float-plan details for this trip — vessel and
// emergency contact — edited with or without signal. The change is queued and
// sent at once when there is signal; the float plan shows it straight away.
export default function MyDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { pending } = useQueuedChanges()
  const [mine, setMine] = useState<Details | null>(null)
  const [values, setValues] = useState<FormValues | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const session = await getSession()
      const crew = await getTrip(id)
        .then((trip) => (trip.travellers ?? []) as (Details & { user?: { id?: string | null } })[])
        .catch(() => loadOfflineCrew(id) as Promise<(Details & { user?: { id?: string | null } })[]>)
      const own = crew.find((member) => member.user?.id === session?.userId) ?? null
      if (cancelled) return
      if (!own) {
        setError("You're not on this trip's crew.")
        return
      }
      const [current] = applyPendingFloatPlan(id, [own], pending)
      setMine(current)
      setValues(toForm(current))
    }
    void load()
    return () => {
      cancelled = true
    }
    // Loaded once: the queue changing under an open form must not reset it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function save() {
    if (!values || !mine?.id) return
    const length = values.vesselLengthCm.trim()
    if (length && !/^\d+$/.test(length)) {
      setError("Length is in whole centimetres.")
      return
    }
    setSaving(true)
    setError(null)
    try {
      const payload: Record<string, unknown> = { tripId: id }
      for (const { field } of FIELDS) {
        const text = values[field].trim()
        payload[field] = field === "vesselLengthCm" ? (text ? Number(text) : null) : text || null
      }
      await enqueueMutation({
        entityType: MUTATION_ENTITY.TRIP_MEMBER,
        operation: MUTATION_OPERATION.UPDATE,
        entityId: mine.id,
        payload,
      })
      // Best effort: offline it fails, and the next sweep sends it.
      void pushQueuedMutations().catch(() => undefined)
      router.back()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save your details.")
    } finally {
      setSaving(false)
    }
  }

  if (!values) {
    return (
      <Screen edges={["bottom"]} className="items-center justify-center p-6">
        {header}
        {error ? <Text className="text-center text-muted-foreground">{error}</Text> : <ActivityIndicator />}
      </Screen>
    )
  }

  function field(name: FloatPlanField, label: string, keyboard?: "numeric" | "phone-pad") {
    return (
      <Stack key={name} className="gap-1">
        <Label>{label}</Label>
        <Input
          value={values?.[name] ?? ""}
          onChangeText={(text) => setValues((current) => (current ? { ...current, [name]: text } : current))}
          keyboardType={keyboard}
          testID={`details-${name}`}
        />
      </Stack>
    )
  }

  return (
    <Screen edges={["bottom"]}>
      {header}
      <ScrollView contentContainerClassName="gap-4 p-4" keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <SectionLabel>Vessel</SectionLabel>
        {FIELDS.slice(0, 5).map(({ field: name, label, keyboard }) => field(name, label, keyboard))}
        <SectionLabel>Emergency contact</SectionLabel>
        {FIELDS.slice(5).map(({ field: name, label, keyboard }) => field(name, label, keyboard))}
        {error && <Text className="text-sm text-destructive">{error}</Text>}
        <Button onPress={() => void save()} disabled={saving} testID="details-save">
          {saving ? "Saving…" : "Save my details"}
        </Button>
      </ScrollView>
    </Screen>
  )
}
