import { Stack as RouterStack, useLocalSearchParams } from "expo-router"
import { useCallback, useEffect, useState } from "react"
import { ScrollView } from "react-native"

import type { Item } from "@shared/dtos/item"
import type { TripRequirement } from "@shared/dtos/inventory"
import type { PersonalPackingItem } from "@shared/dtos/personal-packing"

import { Badge } from "../../../../../../components/ui/badge"
import { Button } from "../../../../../../components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "../../../../../../components/ui/card"
import { Chip } from "../../../../../../components/ui/chip"
import { Input } from "../../../../../../components/ui/input"
import { Row, Screen, Stack } from "../../../../../../components/ui/layout"
import { Text } from "../../../../../../components/ui/text"
import { getSession } from "../../../../../../lib/auth/session"
import {
  addRequirement,
  contributeItem,
  getMyItems,
  removeRequirement,
  unclaimRequirement,
} from "../../../../../../lib/inventory/actions"
import {
  addPackingItem,
  getPackingItems,
  removePackingItem,
  togglePackingItem,
} from "../../../../../../lib/inventory/personal-packing-actions"
import { getTrip } from "../../../../../../lib/trips/actions"

const header = <RouterStack.Screen options={{ title: "Inventory" }} />

type Tab = "group" | "kit"

// Sovereignty rule (M6b): you may remove only what you proposed, and act only on
// your own contribution — no leader-override branch, mirroring the backend exactly.
export default function InventoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [tab, setTab] = useState<Tab>("group")
  const [userId, setUserId] = useState<string | null>(null)

  const [inventoryId, setInventoryId] = useState<string | null>(null)
  const [requirements, setRequirements] = useState<TripRequirement[] | null>(null)
  const [myItems, setMyItems] = useState<Item[]>([])
  const [error, setError] = useState<string | null>(null)

  const [newRequirementName, setNewRequirementName] = useState("")
  const [coveringId, setCoveringId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const [packingItems, setPackingItems] = useState<PersonalPackingItem[] | null>(null)
  const [kitError, setKitError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [session, trip, items] = await Promise.all([getSession(), getTrip(id), getMyItems()])
      setUserId(session?.userId ?? null)
      setInventoryId(trip.inventory?.id ?? null)
      setRequirements(trip.inventory?.requirements ?? [])
      setMyItems(items)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.")
    }
  }, [id])

  const loadKit = useCallback(async () => {
    setKitError(null)
    try {
      setPackingItems(await getPackingItems(id))
    } catch (err) {
      setKitError(err instanceof Error ? err.message : "Something went wrong. Please try again.")
    }
  }, [id])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  function selectTab(next: Tab) {
    setTab(next)
    if (next === "kit" && packingItems === null) void loadKit()
  }

  async function handleAddRequirement() {
    if (!inventoryId || !newRequirementName.trim()) return
    try {
      const created = await addRequirement(inventoryId, { name: newRequirementName.trim() })
      setRequirements((prev) => [...(prev ?? []), created])
      setNewRequirementName("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add requirement.")
    }
  }

  async function handleRemoveRequirement(requirement: TripRequirement) {
    if (!inventoryId || !requirement.id) return
    setBusyId(requirement.id)
    try {
      await removeRequirement(inventoryId, requirement.id)
      setRequirements((prev) => prev?.filter((r) => r.id !== requirement.id) ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove requirement.")
    } finally {
      setBusyId(null)
    }
  }

  async function handleContribute(requirement: TripRequirement, item: Item) {
    if (!inventoryId || !requirement.id || !item.id) return
    setBusyId(requirement.id)
    try {
      const updated = await contributeItem(inventoryId, requirement.id, item.id)
      setRequirements(
        (prev) => prev?.map((r) => (r.id === requirement.id ? updated : r)) ?? null,
      )
      setCoveringId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to contribute item.")
    } finally {
      setBusyId(null)
    }
  }

  async function handleUnclaim(requirement: TripRequirement) {
    if (!inventoryId || !requirement.id) return
    setBusyId(requirement.id)
    try {
      await unclaimRequirement(inventoryId, requirement.id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to withdraw contribution.")
    } finally {
      setBusyId(null)
    }
  }

  async function handleTogglePacking(entry: PersonalPackingItem) {
    if (!entry.id) return
    setBusyId(entry.id)
    try {
      const updated = await togglePackingItem(entry.id, !entry.checked)
      setPackingItems((prev) => prev?.map((p) => (p.id === entry.id ? updated : p)) ?? null)
    } catch (err) {
      setKitError(err instanceof Error ? err.message : "Failed to update your kit.")
    } finally {
      setBusyId(null)
    }
  }

  async function handleRemovePacking(entry: PersonalPackingItem) {
    if (!entry.id) return
    setBusyId(entry.id)
    try {
      await removePackingItem(entry.id)
      setPackingItems((prev) => prev?.filter((p) => p.id !== entry.id) ?? null)
    } catch (err) {
      setKitError(err instanceof Error ? err.message : "Failed to remove from your kit.")
    } finally {
      setBusyId(null)
    }
  }

  async function handleAddPacking(item: Item) {
    if (!item.id) return
    setBusyId(item.id)
    try {
      const created = await addPackingItem(id, item.id)
      setPackingItems((prev) => [...(prev ?? []), created])
    } catch (err) {
      setKitError(err instanceof Error ? err.message : "Failed to add to your kit.")
    } finally {
      setBusyId(null)
    }
  }

  const packedItemIds = new Set((packingItems ?? []).map((p) => p.item?.id).filter(Boolean))
  const unpackedOwnedItems = myItems.filter(
    (item) => item.status === "owned" && item.id && !packedItemIds.has(item.id),
  )

  return (
    <Screen edges={["bottom"]}>
      {header}
      <Row className="gap-2 px-4 pt-3">
        <Chip active={tab === "group"} onPress={() => selectTab("group")}>
          Group
        </Chip>
        <Chip active={tab === "kit"} onPress={() => selectTab("kit")}>
          My kit
        </Chip>
      </Row>

      {tab === "group" && (
        <ScrollView contentContainerClassName="gap-3 p-4">
          <Row className="gap-2">
            <Input
              className="flex-1"
              placeholder="Add a requirement"
              value={newRequirementName}
              onChangeText={setNewRequirementName}
              onSubmitEditing={() => void handleAddRequirement()}
            />
            <Button size="sm" variant="cta" onPress={() => void handleAddRequirement()}>
              Add
            </Button>
          </Row>
          {error && <Text className="text-sm text-destructive">{error}</Text>}
          {(requirements ?? []).map((requirement) => {
            const myContribution = requirement.contributions?.find(
              (c) => c.member?.user?.id === userId,
            )
            return (
              <Card key={requirement.id}>
                <CardHeader>
                  <Row className="justify-between">
                    <CardTitle className="flex-1" numberOfLines={1}>
                      {requirement.name}
                    </CardTitle>
                    <Badge variant={requirement.status === "covered" ? "default" : "secondary"}>
                      {requirement.status === "covered" ? "Covered" : "Needed"}
                    </Badge>
                  </Row>
                </CardHeader>
                <CardContent className="gap-2">
                  {!!requirement.contributions?.length && (
                    <Stack className="gap-1">
                      {requirement.contributions.map((c) => (
                        <Text key={c.id} className="text-sm text-muted-foreground">
                          {c.member?.user?.username ?? "Someone"} · {c.item?.name ?? "an item"}
                        </Text>
                      ))}
                    </Stack>
                  )}
                  <Row className="gap-2">
                    {requirement.proposedBy?.user?.id === userId && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === requirement.id}
                        onPress={() => void handleRemoveRequirement(requirement)}
                      >
                        Remove
                      </Button>
                    )}
                    {myContribution ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === requirement.id}
                        onPress={() => void handleUnclaim(requirement)}
                      >
                        Withdraw
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        disabled={busyId === requirement.id}
                        onPress={() =>
                          setCoveringId(coveringId === requirement.id ? null : (requirement.id ?? null))
                        }
                      >
                        Cover
                      </Button>
                    )}
                  </Row>
                  {coveringId === requirement.id && (
                    <Stack className="gap-1 pt-1">
                      {myItems.length === 0 ? (
                        <Text className="text-sm text-muted-foreground">
                          No owned gear to contribute yet.
                        </Text>
                      ) : (
                        myItems.map((item) => (
                          <Button
                            key={item.id}
                            size="sm"
                            variant="outline"
                            onPress={() => void handleContribute(requirement, item)}
                          >
                            {item.name}
                          </Button>
                        ))
                      )}
                    </Stack>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </ScrollView>
      )}

      {tab === "kit" && (
        <ScrollView contentContainerClassName="gap-3 p-4">
          {kitError && <Text className="text-sm text-destructive">{kitError}</Text>}
          {(packingItems ?? []).map((entry) => (
            <Card key={entry.id}>
              <CardContent>
                <Row className="justify-between">
                  <Button
                    variant={entry.checked ? "secondary" : "outline"}
                    disabled={busyId === entry.id}
                    onPress={() => void handleTogglePacking(entry)}
                  >
                    {entry.item?.name ?? "Item"}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={busyId === entry.id}
                    onPress={() => void handleRemovePacking(entry)}
                  >
                    Remove
                  </Button>
                </Row>
              </CardContent>
            </Card>
          ))}
          {unpackedOwnedItems.length > 0 && (
            <Stack className="gap-2 pt-2">
              <Text className="text-sm font-semibold text-foreground">Add from your gear</Text>
              {unpackedOwnedItems.map((item) => (
                <Button
                  key={item.id}
                  size="sm"
                  variant="outline"
                  disabled={busyId === item.id}
                  onPress={() => void handleAddPacking(item)}
                >
                  Add {item.name}
                </Button>
              ))}
            </Stack>
          )}
        </ScrollView>
      )}
    </Screen>
  )
}
