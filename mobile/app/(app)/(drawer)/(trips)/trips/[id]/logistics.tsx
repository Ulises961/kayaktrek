import { Stack as RouterStack, useLocalSearchParams } from "expo-router"
import { CarIcon, FileIcon, PlusIcon, TrashIcon, UserIcon } from "lucide-react-native"
import { useCallback, useEffect, useState } from "react"
import { ActivityIndicator, ScrollView } from "react-native"

import {
  TRAVEL_DOCUMENT_TYPES,
  type TravelDocument,
  type TravelDocumentType,
} from "@shared/dtos/travel-document"
import type { ShuttleVehicle } from "@shared/dtos/shuttle-vehicle"
import type { Trip } from "@shared/dtos/trip"
import { formatDayDate } from "@shared/utils/date"
import { lightTokens } from "@shared/tokens"

import { getSession } from "@mobile/lib/auth/session"
import {
  addShuttlePassenger,
  createShuttleVehicle,
  createTravelDocument,
  deleteShuttleVehicle,
  deleteTravelDocument,
  getShuttleVehicles,
  getTravelDocuments,
  removeShuttlePassenger,
} from "@mobile/lib/logistics/actions"
import { getTrip } from "@mobile/lib/trips/actions"
import { Badge } from "@mobile/components/ui/badge"
import { Button } from "@mobile/components/ui/button"
import { Card, CardContent } from "@mobile/components/ui/card"
import { Chip } from "@mobile/components/ui/chip"
import { EmptyPanel } from "@mobile/components/ui/empty-panel"
import { Input } from "@mobile/components/ui/input"
import { Row, Screen, Stack } from "@mobile/components/ui/layout"
import { SectionLabel } from "@mobile/components/ui/section-label"
import { Text } from "@mobile/components/ui/text"

const header = <RouterStack.Screen options={{ title: "Logistics" }} />

const TYPE_LABEL: Record<TravelDocumentType, string> = {
  accommodation: "Accommodation",
  transport: "Transport",
  insurance: "Insurance",
  permit: "Permit",
  other: "Other",
}

// Mobile port of frontend/components/trips/tabs/logistics-tab.tsx — travel documents
// and shuttle vehicles, matching the web `/trips/[id]/logistics` tab's own scope
// exactly (it doesn't render shore contact either; that's Float plan's job on both
// platforms). File-attachment upload/download is out of scope (see
// lib/logistics/actions.ts's comment); every other field is full parity.
export default function LogisticsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [trip, setTrip] = useState<Trip | null>(null)
  const [documents, setDocuments] = useState<TravelDocument[] | null>(null)
  const [vehicles, setVehicles] = useState<ShuttleVehicle[] | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [t, docs, vehs, session] = await Promise.all([
        getTrip(id),
        getTravelDocuments(id),
        getShuttleVehicles(id),
        getSession(),
      ])
      setTrip(t)
      setDocuments(docs)
      setVehicles(vehs)
      setCurrentUserId(session?.userId ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.")
    }
  }, [id])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const travellers = trip?.travellers ?? []
  const leader = travellers.find((m) => m.role === "leader")
  const isLeader = !!currentUserId && !!leader && leader.user.id === currentUserId
  const currentMember = travellers.find((m) => m.user.id === currentUserId)
  const isMember = !!currentMember

  // ── Travel documents ──────────────────────────────────────────────────────
  const [docFormOpen, setDocFormOpen] = useState(false)
  const [docType, setDocType] = useState<TravelDocumentType>("accommodation")
  const [docName, setDocName] = useState("")
  const [docConfirmation, setDocConfirmation] = useState("")
  const [docUrl, setDocUrl] = useState("")

  async function submitDocument() {
    if (!docName.trim()) return
    setBusyId("new-document")
    try {
      const doc = await createTravelDocument(id, {
        type: docType,
        name: docName.trim(),
        confirmationNumber: docConfirmation.trim() || undefined,
        url: docUrl.trim() || undefined,
      })
      setDocuments((prev) => (prev ? [...prev, doc] : [doc]))
      setDocName("")
      setDocConfirmation("")
      setDocUrl("")
      setDocFormOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add document.")
    } finally {
      setBusyId(null)
    }
  }

  async function removeDocument(documentId: string) {
    setBusyId(documentId)
    try {
      await deleteTravelDocument(documentId)
      setDocuments((prev) => (prev ? prev.filter((d) => d.id !== documentId) : prev))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete document.")
    } finally {
      setBusyId(null)
    }
  }

  // ── Shuttle vehicles ──────────────────────────────────────────────────────
  const [vehicleFormOpen, setVehicleFormOpen] = useState(false)
  const [vehicleDescription, setVehicleDescription] = useState("")
  const [driverName, setDriverName] = useState("")
  const [seatsAvailable, setSeatsAvailable] = useState("")
  const [kayakSpots, setKayakSpots] = useState("")
  const [pickupPoint, setPickupPoint] = useState("")

  async function submitVehicle() {
    setBusyId("new-vehicle")
    try {
      await createShuttleVehicle(id, {
        vehicleDescription: vehicleDescription.trim() || undefined,
        driverName: driverName.trim() || undefined,
        seatsAvailable: seatsAvailable ? Number(seatsAvailable) : undefined,
        kayakSpots: kayakSpots ? Number(kayakSpots) : undefined,
        pickupPoint: pickupPoint.trim() || undefined,
      })
      const fresh = await getShuttleVehicles(id)
      setVehicles(fresh)
      setVehicleDescription("")
      setDriverName("")
      setSeatsAvailable("")
      setKayakSpots("")
      setPickupPoint("")
      setVehicleFormOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add vehicle.")
    } finally {
      setBusyId(null)
    }
  }

  async function removeVehicle(vehicleId: string) {
    setBusyId(vehicleId)
    try {
      await deleteShuttleVehicle(vehicleId)
      setVehicles((prev) => (prev ? prev.filter((v) => v.id !== vehicleId) : prev))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete vehicle.")
    } finally {
      setBusyId(null)
    }
  }

  async function joinVehicle(vehicleId: string) {
    if (!currentMember?.id) return
    setBusyId(vehicleId)
    try {
      await addShuttlePassenger(vehicleId, currentMember.id)
      const fresh = await getShuttleVehicles(id)
      setVehicles(fresh)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join vehicle.")
    } finally {
      setBusyId(null)
    }
  }

  async function leaveVehicle(vehicleId: string, memberId: string) {
    setBusyId(vehicleId)
    try {
      await removeShuttlePassenger(vehicleId, memberId)
      const fresh = await getShuttleVehicles(id)
      setVehicles(fresh)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to leave vehicle.")
    } finally {
      setBusyId(null)
    }
  }

  if (!trip || documents === null || vehicles === null) {
    if (error) {
      return (
        <Screen edges={["bottom"]} className="items-center justify-center gap-4 p-6">
          {header}
          <Text className="text-center text-muted-foreground">{error}</Text>
        </Screen>
      )
    }
    return (
      <Screen edges={["bottom"]} className="items-center justify-center">
        {header}
        <ActivityIndicator />
      </Screen>
    )
  }

  const memberById = new Map(travellers.map((m) => [m.id, m]))

  return (
    <Screen edges={["bottom"]}>
      {header}
      <ScrollView contentContainerClassName="gap-5 p-4">
        {error && <Text className="text-center text-destructive">{error}</Text>}

        {/* Travel documents */}
        <Stack className="gap-3">
          <Row className="items-center justify-between">
            <SectionLabel>Travel documents ({documents.length})</SectionLabel>
            {isMember && (
              <Button
                variant="ghost"
                size="icon-sm"
                accessibilityLabel="Add travel document"
                onPress={() => setDocFormOpen((v) => !v)}
              >
                <PlusIcon size={16} />
              </Button>
            )}
          </Row>

          {docFormOpen && (
            <Card>
              <CardContent className="gap-3">
                <Row className="flex-wrap gap-2">
                  {TRAVEL_DOCUMENT_TYPES.map((t) => (
                    <Chip key={t} active={docType === t} onPress={() => setDocType(t)}>
                      {TYPE_LABEL[t]}
                    </Chip>
                  ))}
                </Row>
                <Input placeholder="Name (e.g. Ferry booking)" value={docName} onChangeText={setDocName} />
                <Input
                  placeholder="Confirmation number (optional)"
                  value={docConfirmation}
                  onChangeText={setDocConfirmation}
                />
                <Input placeholder="Booking link (optional)" value={docUrl} onChangeText={setDocUrl} />
                <Row className="gap-2">
                  <Button
                    className="flex-1"
                    disabled={!docName.trim() || busyId === "new-document"}
                    onPress={() => void submitDocument()}
                  >
                    Add document
                  </Button>
                  <Button variant="outline" onPress={() => setDocFormOpen(false)}>
                    Cancel
                  </Button>
                </Row>
              </CardContent>
            </Card>
          )}

          {documents.length === 0 ? (
            <EmptyPanel
              icon={FileIcon}
              title="No travel documents yet"
              description="Bookings, permits and insurance for this trip go here."
            />
          ) : (
            <Stack className="gap-2">
              {documents.map((doc) => (
                <Card key={doc.id}>
                  <CardContent className="gap-1">
                    <Row className="items-center justify-between gap-2">
                      <Text className="flex-1 font-medium" numberOfLines={1}>
                        {doc.name}
                      </Text>
                      <Badge variant="outline">{TYPE_LABEL[doc.type]}</Badge>
                    </Row>
                    {(doc.date || doc.expiryDate) && (
                      <Text className="text-xs text-muted-foreground">
                        {doc.date ? formatDayDate(doc.date) : `until ${formatDayDate(doc.expiryDate!)}`}
                      </Text>
                    )}
                    {doc.confirmationNumber && (
                      <Text className="text-xs text-muted-foreground">
                        Confirmation: {doc.confirmationNumber}
                      </Text>
                    )}
                    {(doc.ownerId === currentUserId || isLeader) && doc.id && (
                      <Row className="justify-end pt-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          accessibilityLabel={`Delete ${doc.name}`}
                          disabled={busyId === doc.id}
                          onPress={() => void removeDocument(doc.id!)}
                        >
                          <TrashIcon size={14} color={lightTokens.destructive} />
                        </Button>
                      </Row>
                    )}
                  </CardContent>
                </Card>
              ))}
            </Stack>
          )}
        </Stack>

        {/* Shuttle */}
        <Stack className="gap-3">
          <Row className="items-center justify-between">
            <SectionLabel>Shuttle ({vehicles.length})</SectionLabel>
            {isMember && (
              <Button
                variant="ghost"
                size="icon-sm"
                accessibilityLabel="Add vehicle"
                onPress={() => setVehicleFormOpen((v) => !v)}
              >
                <PlusIcon size={16} />
              </Button>
            )}
          </Row>

          {vehicleFormOpen && (
            <Card>
              <CardContent className="gap-3">
                <Input
                  placeholder="Vehicle (e.g. Silver van)"
                  value={vehicleDescription}
                  onChangeText={setVehicleDescription}
                />
                <Input placeholder="Driver name (optional)" value={driverName} onChangeText={setDriverName} />
                <Row className="gap-2">
                  <Input
                    className="flex-1"
                    placeholder="Seats"
                    keyboardType="number-pad"
                    value={seatsAvailable}
                    onChangeText={setSeatsAvailable}
                  />
                  <Input
                    className="flex-1"
                    placeholder="Kayak spots"
                    keyboardType="number-pad"
                    value={kayakSpots}
                    onChangeText={setKayakSpots}
                  />
                </Row>
                <Input placeholder="Pickup point (optional)" value={pickupPoint} onChangeText={setPickupPoint} />
                <Row className="gap-2">
                  <Button
                    className="flex-1"
                    disabled={busyId === "new-vehicle"}
                    onPress={() => void submitVehicle()}
                  >
                    Add vehicle
                  </Button>
                  <Button variant="outline" onPress={() => setVehicleFormOpen(false)}>
                    Cancel
                  </Button>
                </Row>
              </CardContent>
            </Card>
          )}

          {vehicles.length === 0 ? (
            <EmptyPanel
              icon={CarIcon}
              title="No vehicles yet"
              description="Cars used for the shuttle appear here, with who drives and how many seats and boats each takes."
            />
          ) : (
            <Stack className="gap-2">
              {vehicles.map((vehicle) => {
                const canManage =
                  isLeader ||
                  (!!currentMember?.id && vehicle.arrangedById === currentMember.id)
                const alreadyIn = vehicle.passengers.some(
                  (p) => p.tripMemberId === currentMember?.id,
                )
                const isFull =
                  vehicle.seatsAvailable != null &&
                  vehicle.passengers.length >= vehicle.seatsAvailable
                const canJoin =
                  isMember && !alreadyIn && vehicle.id && currentMember?.id && !isFull

                return (
                  <Card key={vehicle.id}>
                    <CardContent className="gap-1.5">
                      <Row className="items-center justify-between gap-2">
                        <Text className="flex-1 font-medium" numberOfLines={1}>
                          {vehicle.vehicleDescription ?? "Vehicle"}
                        </Text>
                        {canManage && vehicle.id && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            disabled={busyId === vehicle.id}
                            onPress={() => void removeVehicle(vehicle.id!)}
                          >
                            <TrashIcon size={14} color={lightTokens.destructive} />
                          </Button>
                        )}
                      </Row>
                      <Text className="text-xs text-muted-foreground">
                        Driver: {vehicle.driverName ?? "Not set"}
                      </Text>
                      <Text className="text-xs text-muted-foreground">
                        {vehicle.passengers.length}
                        {vehicle.seatsAvailable != null ? `/${vehicle.seatsAvailable}` : ""} seats
                        {vehicle.kayakSpots != null ? ` · ${vehicle.kayakSpots} kayak spots` : ""}
                      </Text>
                      {vehicle.pickupPoint && (
                        <Text className="text-xs text-muted-foreground">
                          Pickup: {vehicle.pickupPoint}
                        </Text>
                      )}
                      {vehicle.passengers.length > 0 && (
                        <Row className="flex-wrap gap-1 pt-1">
                          {vehicle.passengers.map((p) => {
                            const m = memberById.get(p.tripMemberId)
                            const canRemove =
                              p.tripMemberId === currentMember?.id || canManage
                            return (
                              <Badge key={p.tripMemberId} variant="secondary">
                                <Row className="items-center gap-1">
                                  <UserIcon size={10} />
                                  <Text className="text-xs text-secondary-foreground">
                                    {m ? [m.user.name, m.user.surname].filter(Boolean).join(" ") : "Member"}
                                  </Text>
                                  {canRemove && vehicle.id && (
                                    <Text
                                      onPress={() => void leaveVehicle(vehicle.id!, p.tripMemberId)}
                                      className="text-xs text-secondary-foreground"
                                    >
                                      {" ✕"}
                                    </Text>
                                  )}
                                </Row>
                              </Badge>
                            )
                          })}
                        </Row>
                      )}
                      {canJoin && (
                        <Row className="justify-end pt-1">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busyId === vehicle.id}
                            onPress={() => void joinVehicle(vehicle.id!)}
                          >
                            Join
                          </Button>
                        </Row>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </Stack>
          )}
        </Stack>
      </ScrollView>
    </Screen>
  )
}
