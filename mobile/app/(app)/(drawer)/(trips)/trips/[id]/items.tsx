import { Stack as RouterStack, useLocalSearchParams } from "expo-router"
import { PackageCheckIcon, PackageIcon } from "lucide-react-native"
import { useEffect, useRef, useState } from "react"
import { Alert, ScrollView } from "react-native"

import type { Item } from "@shared/dtos/item"
import type { ItemCategory } from "@shared/dtos/item-category"
import type { TripRequirement } from "@shared/dtos/inventory"
import type { PersonalPackingItem } from "@shared/dtos/personal-packing"
import { bucketByCategory } from "@shared/inventory/format"
import { palette } from "@shared/tokens"

import { Badge } from "@mobile/components/ui/badge"
import { Button } from "@mobile/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@mobile/components/ui/card"
import { Chip } from "@mobile/components/ui/chip"
import { Input } from "@mobile/components/ui/input"
import { Row, Screen, Stack } from "@mobile/components/ui/layout"
import { OfflineNotice } from "@mobile/components/ui/offline-notice"
import { SectionLabel } from "@mobile/components/ui/section-label"
import { Text } from "@mobile/components/ui/text"
import { getSession } from "@mobile/lib/auth/session"
import { loadGearCache, saveGearCache } from "@mobile/lib/db/gear-cache"
import { loadKitCache, saveKitCache } from "@mobile/lib/db/kit-cache"
import { loadRequirementsCache, saveRequirementsCache } from "@mobile/lib/db/requirements-cache"
import { CACHE_KEY } from "@mobile/lib/db/cache-freshness"
import { MUTATION_ENTITY, MUTATION_OPERATION } from "@mobile/lib/db/mutation-queue"
import { useLiveCache } from "@mobile/lib/db/use-live-cache"
import { useTripChanges } from "@mobile/lib/live/use-trip-changes"
import {
  queueContribution,
  queuePackingAdd,
  queuePackingRemove,
  queuePackingToggle,
} from "@mobile/lib/inventory/offline-inventory"
import { useIsOffline } from "@mobile/lib/network/use-is-offline"
import { useQueuedChanges } from "@mobile/lib/network/queued-changes"
import {
  addRequirement,
  contributeItem,
  getItemCategories,
  getMyItems,
  removeRequirement,
  unclaimRequirement,
} from "@mobile/lib/inventory/actions"
import {
  addPackingItem,
  getPackingItems,
  removePackingItem,
  togglePackingItem,
} from "@mobile/lib/inventory/personal-packing-actions"
import { getTrip } from "@mobile/lib/trips/actions"

const header = <RouterStack.Screen options={{ title: "Inventory" }} />

// Wire names (TripChange.t) of everything this screen shows.
const INVENTORY_CHANGE_TABLES = [
  "inventory",
  "trip_requirement",
  "requirement_contribution",
  "personal_packing_item",
  "trip_member",
]

type Tab = "group" | "kit"

// The fields this screen reads off a piece of gear. Both the live `Item` DTO and
// gear-cache.ts's GearCardData satisfy it, so the render below doesn't branch on
// source — same idiom as float-plan.tsx's CrewMemberView.
type GearView = {
  id?: string
  name?: string | null
  status?: string | null
}

// Sovereignty rule (M6b): you may remove only what you proposed, and act only on
// your own contribution — no leader-override branch, mirroring the backend exactly.
export default function InventoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [tab, setTab] = useState<Tab>("group")
  const [userId, setUserId] = useState<string | null>(null)

  const [inventoryId, setInventoryId] = useState<string | null>(null)

  const [newRequirementName, setNewRequirementName] = useState("")
  // The slug the next requirement is filed under — chosen from the item categories, never typed.
  const [newRequirementCategory, setNewRequirementCategory] = useState<string | null>(null)
  // A requirement stores its category as a slug; these name the groups and fill the chips. They
  // only label, so a failed fetch leaves them empty and costs the headings, not the checklist.
  // The ref is what the cache save reads, since it runs before the next render.
  const [categories, setCategories] = useState<ItemCategory[]>([])
  const categoriesRef = useRef<ItemCategory[]>([])
  const [coveringId, setCoveringId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  // Live-first, cache-fallback for the "Group" tab's requirement checklist —
  // same wholesale-replace shape as logs/buddies (M9c WP6), extracted into
  // useLiveCache. Only name/status survive offline (see requirements-cache.ts's
  // RequirementCardData); who's covering what, and every mutation
  // (add/remove/cover/withdraw), need a connection regardless, so `isOffline`
  // disables them below. inventoryId/userId are set as a side effect of
  // fetchLive and simply keep their last value offline, same as logs.tsx's
  // stats/requests.
  //
  const requirementsCache = useLiveCache<TripRequirement[]>({
    fetchLive: async () => {
      const [session, trip, fetchedCategories] = await Promise.all([
        getSession(),
        getTrip(id),
        getItemCategories().catch(() => []),
      ])
      setUserId(session?.userId ?? null)
      setInventoryId(trip.inventory?.id ?? null)
      categoriesRef.current = fetchedCategories
      setCategories(fetchedCategories)
      return trip.inventory?.requirements ?? []
    },
    loadCache: async () => {
      const session = await getSession()
      setUserId(session?.userId ?? null)
      const cached = await loadRequirementsCache(id)
      // The cache saved each heading's name, so the groups need no category list offline.
      return cached.map((r) => ({
        id: r.id,
        name: r.name,
        status: r.status as never,
        category: r.category,
      }))
    },
    saveCache: (reqs) => saveRequirementsCache(id, reqs, categoriesRef.current),
    isCacheEmpty: (reqs) => reqs.length === 0,
    cacheKey: CACHE_KEY.tripRequirements(id),
  })
  const requirements = requirementsCache.data
  const error = requirementsCache.error
  // Two different facts, same split as the Gear screen. Each cache's
  // `isOffline` says the data on screen came from the cache and drives its
  // notice; the device's connectivity says whether acting on it can work.
  // Only the first used to disable anything, so a screen opened with signal
  // kept every action live after airplane mode went on.
  const isDeviceOffline = useIsOffline()
  const isOffline = requirementsCache.isOffline || isDeviceOffline
  const load = requirementsCache.reload

  // Gear gets its own cache rather than riding along with the requirements
  // fetch, because it is the one thing on this screen that is NOT trip-scoped:
  // `Item` is the user's own closet, referenced by a trip only through a
  // requirement contribution or a packing entry. Folding it in gave it no
  // offline state of its own, so a device with cached gear but no cached
  // requirements showed the gear with its actions still enabled — and tapping
  // one failed against the network.
  const gearCache = useLiveCache<GearView[]>({
    fetchLive: () => getMyItems(),
    loadCache: () => loadGearCache(),
    saveCache: (items) => saveGearCache(items as Item[]),
    isCacheEmpty: (items) => items.length === 0,
    cacheKey: CACHE_KEY.gear,
  })
  const myItems = gearCache.data ?? []
  const isGearOffline = gearCache.isOffline || isDeviceOffline
  const loadGear = gearCache.reload

  // The kit resolves independently of the requirements above: it is a different
  // endpoint (personal packing, not the trip inventory), so one can be cached
  // while the other is live.
  const kitCache = useLiveCache<PersonalPackingItem[]>({
    fetchLive: () => getPackingItems(id),
    loadCache: async () => {
      const cached = await loadKitCache(id)
      // Rebuilt into the DTO shape the render below already reads, same as the
      // requirement cache does — keeps one render path for both sources.
      return cached.map((entry) => ({
        id: entry.id,
        checked: entry.checked,
        item: { id: entry.itemId ?? undefined, name: entry.itemName },
      })) as PersonalPackingItem[]
    },
    saveCache: (entries) => saveKitCache(id, entries),
    isCacheEmpty: (entries) => entries.length === 0,
    cacheKey: CACHE_KEY.tripKit(id),
  })
  const packingItems = kitCache.data
  const kitError = kitCache.error
  const isKitOffline = kitCache.isOffline || isDeviceOffline
  const loadKit = kitCache.reload
  const setPackingItems = kitCache.setData
  const setKitError = kitCache.setError

  // Group slots this paddler covered offline, not yet sent (M9d WP6).
  const { pending, dismiss } = useQueuedChanges()
  const queuedContributions = pending.filter(
    (change) =>
      change.entityType === MUTATION_ENTITY.CONTRIBUTION &&
      change.operation === MUTATION_OPERATION.CREATE &&
      change.payload.tripId === id,
  )

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    void loadGear()
  }, [loadGear])

  // Loaded on mount, not on first tab press. The kit used to be fetched only
  // when its tab was opened, which made its cache lazy too: a device that never
  // tapped "My kit" while connected had nothing to show once it went offline —
  // and "did I pack the spare paddle" is asked at the put-in, not at home.
  useEffect(() => {
    void loadKit()
  }, [loadKit])

  // Someone else changed the trip's requirements, a contribution, or the crew who cover
  // them (M36). The paddler's own gear closet is not trip-scoped, so it is left alone.
  useTripChanges(
    id,
    () => {
      void load()
      void loadKit()
    },
    { tables: INVENTORY_CHANGE_TABLES },
  )

  function selectTab(next: Tab) {
    setTab(next)
  }

  async function handleAddRequirement() {
    if (!inventoryId || !newRequirementName.trim()) return
    try {
      const created = await addRequirement(inventoryId, {
        name: newRequirementName.trim(),
        category: newRequirementCategory ?? undefined,
      })
      requirementsCache.setData((prev) => [...(prev ?? []), created])
      setNewRequirementName("")
      setNewRequirementCategory(null)
    } catch (err) {
      requirementsCache.setError(err instanceof Error ? err.message : "Failed to add requirement.")
    }
  }

  async function handleRemoveRequirement(requirement: TripRequirement) {
    if (!inventoryId || !requirement.id) return
    setBusyId(requirement.id)
    try {
      await removeRequirement(inventoryId, requirement.id)
      requirementsCache.setData((prev) => prev?.filter((r) => r.id !== requirement.id) ?? null)
    } catch (err) {
      requirementsCache.setError(
        err instanceof Error ? err.message : "Failed to remove requirement.",
      )
    } finally {
      setBusyId(null)
    }
  }

  function confirmRemoveRequirement(requirement: TripRequirement) {
    Alert.alert(
      "Remove this requirement?",
      "Any contributions to it will be lost.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => void handleRemoveRequirement(requirement),
        },
      ],
    )
  }

  // M9d WP6: offline, kit changes and covering a group slot are queued and shown
  // at once. The kit is also written back to its cache, so reopening the screen
  // offline still shows the change before it has been sent.
  function showKitOffline(next: PersonalPackingItem[]) {
    setPackingItems(next)
    void saveKitCache(id, next).catch(() => undefined)
  }

  async function handleContribute(requirement: TripRequirement, item: GearView) {
    if (!requirement.id || !item.id) return
    if (isOffline) {
      await queueContribution(id, requirement.id, item.id)
      setCoveringId(null)
      return
    }
    if (!inventoryId) return
    setBusyId(requirement.id)
    try {
      const updated = await contributeItem(inventoryId, requirement.id, item.id)
      requirementsCache.setData(
        (prev) => prev?.map((r) => (r.id === requirement.id ? updated : r)) ?? null,
      )
      setCoveringId(null)
    } catch (err) {
      requirementsCache.setError(err instanceof Error ? err.message : "Failed to contribute item.")
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
      requirementsCache.setError(
        err instanceof Error ? err.message : "Failed to withdraw contribution.",
      )
    } finally {
      setBusyId(null)
    }
  }

  async function handleTogglePacking(entry: PersonalPackingItem) {
    if (!entry.id) return
    if (isKitOffline) {
      await queuePackingToggle(entry.id, !entry.checked)
      showKitOffline(
        (packingItems ?? []).map((p) => (p.id === entry.id ? { ...p, checked: !entry.checked } : p)),
      )
      return
    }
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
    if (isKitOffline) {
      await queuePackingRemove(entry.id)
      showKitOffline((packingItems ?? []).filter((p) => p.id !== entry.id))
      return
    }
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

  function confirmRemovePacking(entry: PersonalPackingItem) {
    Alert.alert("Remove from your kit?", undefined, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => void handleRemovePacking(entry) },
    ])
  }

  async function handleAddPacking(item: GearView) {
    if (!item.id) return
    if (isKitOffline || isGearOffline) {
      const entryId = await queuePackingAdd(id, item.id)
      showKitOffline([
        ...(packingItems ?? []),
        { id: entryId, checked: false, item: { id: item.id, name: item.name } } as PersonalPackingItem,
      ])
      return
    }
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
          <OfflineNotice
            visible={requirementsCache.isOffline}
            cachedAt={requirementsCache.cachedAt}
            onRetry={() => void requirementsCache.reload()}
          >
            Covering an item is sent when you have signal. Adding, removing and withdrawing need a
            connection.
          </OfflineNotice>
          <Row className="gap-2">
            <Input
              className="flex-1"
              placeholder="Add a requirement"
              value={newRequirementName}
              onChangeText={setNewRequirementName}
              editable={!isOffline}
              onSubmitEditing={() => void handleAddRequirement()}
            />
            <Button
              size="sm"
              variant="cta"
              disabled={isOffline}
              onPress={() => void handleAddRequirement()}
            >
              Add
            </Button>
          </Row>
          {categories.length > 0 && (
            <Row className="flex-wrap gap-2">
              {categories.map((category) => (
                <Chip
                  key={category.slug}
                  active={newRequirementCategory === category.slug}
                  disabled={isOffline}
                  onPress={() =>
                    setNewRequirementCategory(
                      newRequirementCategory === category.slug ? null : category.slug,
                    )
                  }
                >
                  {category.name}
                </Chip>
              ))}
            </Row>
          )}
          {error && <Text className="text-sm text-destructive">{error}</Text>}
          {bucketByCategory(requirements ?? [], (r) => r.category, categories).flatMap((bucket) => [
            <SectionLabel
              key={`group-${bucket.key}`}
              testID="requirement-group"
              className="pt-1"
            >
              {bucket.label}
            </SectionLabel>,
            ...bucket.entries.map((requirement) => {
              const myContribution = requirement.contributions?.find(
                (c) => c.member?.user?.id === userId,
              )
              const queuedContribution = queuedContributions.find(
                (change) => change.entityId === requirement.id,
              )
              return (
                <Card key={requirement.id}>
                  <CardHeader>
                    <Row className="justify-between">
                      <CardTitle className="flex-1" numberOfLines={1}>
                        {requirement.name}
                      </CardTitle>
                      <Row className="items-center gap-1.5">
                        {requirement.status === "covered" ? (
                          <PackageCheckIcon size={12} color={palette.ocean500} />
                        ) : (
                          <PackageIcon size={12} color={palette.ocean500} />
                        )}
                        <Badge variant={requirement.status === "covered" ? "default" : "secondary"}>
                          {requirement.status === "covered" ? "Covered" : "Needed"}
                        </Badge>
                      </Row>
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
                          disabled={busyId === requirement.id || isOffline}
                          onPress={() => confirmRemoveRequirement(requirement)}
                        >
                          Remove
                        </Button>
                      )}
                      {queuedContribution ? (
                        <Stack className="flex-1 gap-1">
                          <Text className="text-xs text-muted-foreground">
                            {`You're bringing ${
                              myItems.find((item) => item.id === queuedContribution.payload.itemId)?.name ??
                              "an item"
                            } (not sent yet)`}
                          </Text>
                          <Button
                            size="sm"
                            variant="outline"
                            className="self-start"
                            onPress={() => void dismiss(queuedContribution.mutationId)}
                          >
                            Undo
                          </Button>
                        </Stack>
                      ) : myContribution ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === requirement.id || isOffline}
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
            }),
          ])}
        </ScrollView>
      )}

      {tab === "kit" && (
        <ScrollView contentContainerClassName="gap-3 p-4">
          <OfflineNotice
            visible={kitCache.isOffline}
            cachedAt={kitCache.cachedAt}
            onRetry={() => void kitCache.reload()}
          >
            Packing, adding and removing are saved here and sent when you have signal.
          </OfflineNotice>
          {kitError && <Text className="text-sm text-destructive">{kitError}</Text>}
          {/* Same shape as a Group requirement card: the name as the title, the
              state as an icon and a labelled badge, the actions in a row below.
              The packed state used to live only in the name button's variant,
              which nobody could read as "packed" without already knowing. */}
          {(packingItems ?? []).map((entry) => (
            <Card key={entry.id}>
              <CardHeader>
                <Row className="justify-between">
                  <CardTitle className="flex-1" numberOfLines={1}>
                    {entry.item?.name ?? "Item"}
                  </CardTitle>
                  <Row className="items-center gap-1.5">
                    {entry.checked ? (
                      <PackageCheckIcon size={12} color={palette.ocean500} />
                    ) : (
                      <PackageIcon size={12} color={palette.ocean500} />
                    )}
                    <Badge variant={entry.checked ? "default" : "secondary"}>
                      {entry.checked ? "Packed" : "To pack"}
                    </Badge>
                  </Row>
                </Row>
              </CardHeader>
              <CardContent>
                <Row className="gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === entry.id}
                    onPress={() => confirmRemovePacking(entry)}
                  >
                    Remove
                  </Button>
                  <Button
                    size="sm"
                    variant={entry.checked ? "outline" : "default"}
                    disabled={busyId === entry.id}
                    onPress={() => void handleTogglePacking(entry)}
                  >
                    {entry.checked ? "Unpack" : "Pack"}
                  </Button>
                </Row>
              </CardContent>
            </Card>
          ))}
          {unpackedOwnedItems.length > 0 && (
            <Stack className="gap-2 pt-2">
              {/* Kept working offline on purpose: "what do I own that isn't in
                  this trip's kit" is exactly the question asked at a put-in. */}
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
