import { Stack as RouterStack } from "expo-router"
import { DrawerToggleButton } from "expo-router/drawer"
import { CheckIcon, PlusIcon, PocketKnifeIcon, Trash2Icon } from "lucide-react-native"
import { useCallback, useEffect, useMemo, useState } from "react"
import { ActivityIndicator, Alert, RefreshControl, ScrollView } from "react-native"

import type { Item } from "@shared/dtos/item"
import type { ItemCategory } from "@shared/dtos/item-category"
import { lightTokens, palette } from "@shared/tokens"

import { Button } from "@mobile/components/ui/button"
import { Card, CardContent } from "@mobile/components/ui/card"
import { Chip } from "@mobile/components/ui/chip"
import { EmptyPanel } from "@mobile/components/ui/empty-panel"
import { Input } from "@mobile/components/ui/input"
import { Row, Screen, Stack } from "@mobile/components/ui/layout"
import { SectionLabel } from "@mobile/components/ui/section-label"
import { Text } from "@mobile/components/ui/text"
import {
  createItem,
  deleteItem,
  getItemCategories,
  getMyItems,
  setDefaultPack,
} from "@mobile/lib/inventory/actions"

// headerLeft: see (drawer)/(trips)/index.tsx's comment — this is the "Gear" drawer
// item's root screen, so it supplies its own menu button.
const header = (
  <RouterStack.Screen options={{ title: "Gear", headerLeft: () => <DrawerToggleButton /> }} />
)

const UNCATEGORISED = "Uncategorised"
const UNCATEGORISED_SLUG = "uncategorised"

// Mobile's cut of web's gear closet (frontend/components/inventory/gear-closet.tsx):
// the paddler's own kit, grouped by category, with M10's default-pack flag on each
// item. Items are personal and never tied to an inventory — a trip requirement points
// at one, it does not own it.
export default function GearScreen() {
  const [items, setItems] = useState<Item[] | null>(null)
  const [categories, setCategories] = useState<ItemCategory[]>([])
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  // Multi-select, mirroring Explore's season chips: "paddling and camping" is a real
  // question to ask of a kit list, and a single-select row cannot answer it.
  const [activeSlugs, setActiveSlugs] = useState<string[]>([])

  const [addOpen, setAddOpen] = useState(false)
  const [name, setName] = useState("")
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      setItems(await getMyItems())
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.")
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
    // Categories only label and group; a failure here must not fail the closet.
    void getItemCategories()
      .then(setCategories)
      .catch(() => {})
  }, [load])

  // Built from the gear on hand rather than the full category list: a chip that
  // filters down to an empty closet is a dead control. Uncategorised earns a chip only
  // when something is actually unfiled.
  const filters = useMemo(() => {
    const seen = new Map<string, string>()
    for (const item of items ?? []) {
      if (item.category?.slug) seen.set(item.category.slug, item.category.name)
      else seen.set(UNCATEGORISED_SLUG, UNCATEGORISED)
    }
    return [...seen.entries()]
      .map(([slug, name]) => ({ slug, name }))
      .sort((a, b) =>
        a.slug === UNCATEGORISED_SLUG
          ? 1
          : b.slug === UNCATEGORISED_SLUG
            ? -1
            : a.name.localeCompare(b.name),
      )
  }, [items])

  const visible = useMemo(() => {
    if (activeSlugs.length === 0) return items ?? []
    return (items ?? []).filter((item) =>
      activeSlugs.includes(item.category?.slug ?? UNCATEGORISED_SLUG),
    )
  }, [items, activeSlugs])

  // Grouped by category name, with uncategorised gear kept rather than dropped —
  // `category` is nullish on the DTO, and an item vanishing from the closet because
  // nobody filed it is worse than a catch-all heading.
  const grouped = useMemo(() => {
    const groups = new Map<string, Item[]>()
    for (const item of visible) {
      const key = item.category?.name ?? UNCATEGORISED
      groups.set(key, [...(groups.get(key) ?? []), item])
    }
    return [...groups.entries()].sort(([a], [b]) =>
      a === UNCATEGORISED ? 1 : b === UNCATEGORISED ? -1 : a.localeCompare(b),
    )
  }, [visible])

  function toggleFilter(slug: string) {
    setActiveSlugs((current) =>
      current.includes(slug) ? current.filter((entry) => entry !== slug) : [...current, slug],
    )
  }

  async function submitNewItem() {
    if (!name.trim()) return
    setAdding(true)
    setError(null)
    try {
      await createItem({ name: name.trim(), categoryId })
      setName("")
      setCategoryId(null)
      setAddOpen(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add gear.")
    } finally {
      setAdding(false)
    }
  }

  async function toggleDefault(item: Item) {
    if (!item.id) return
    setBusyId(item.id)
    try {
      await setDefaultPack(item.id, !item.defaultPack)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update gear.")
    } finally {
      setBusyId(null)
    }
  }

  function confirmDelete(item: Item) {
    Alert.alert("Delete this gear?", `${item.name} will be removed from your closet.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void deleteItem(item.id as string)
            .then(load)
            .catch((err) =>
              setError(err instanceof Error ? err.message : "Failed to delete gear."),
            )
        },
      },
    ])
  }

  if (items === null && !error) {
    return (
      <Screen edges={["bottom"]} className="items-center justify-center">
        {header}
        <ActivityIndicator />
      </Screen>
    )
  }

  return (
    <Screen edges={["bottom"]}>
      {header}

      <ScrollView
        contentContainerClassName="gap-4 p-4"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true)
              void load()
            }}
          />
        }
      >
        {error && <Text className="text-sm text-destructive">{error}</Text>}
        {error && items === null && (
          <Button
            onPress={() => void load()}
            testID="gear-retry"
            className="self-start"
          >
            Try again
          </Button>
        )}

        {/* Same idiom as Explore's sort row: a horizontal chip rail that is visible at
            rest rather than hidden behind a filter sheet. A kit list is short enough
            that the filter belongs on screen beside what it filters. */}
        {filters.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-2 pr-4"
            className="max-h-11 grow-0"
          >
            <Chip
              active={activeSlugs.length === 0}
              onPress={() => setActiveSlugs([])}
              testID="filter-all"
            >
              All
            </Chip>
            {filters.map((filter) => (
              <Chip
                key={filter.slug}
                active={activeSlugs.includes(filter.slug)}
                onPress={() => toggleFilter(filter.slug)}
                testID={`filter-${filter.slug}`}
              >
                {filter.name}
              </Chip>
            ))}
          </ScrollView>
        )}

        {addOpen ? (
          <Card>
            <CardContent className="gap-3">
              <SectionLabel>Add gear</SectionLabel>
              <Input
                value={name}
                onChangeText={setName}
                placeholder="What is it?"
                testID="gear-name"
              />
              {categories.length > 0 && (
                <Row className="flex-wrap gap-2">
                  {categories.map((category) => (
                    <Chip
                      key={category.id}
                      active={categoryId === category.id}
                      onPress={() => setCategoryId(category.id ?? null)}
                      testID={`gear-category-${category.slug}`}
                    >
                      {category.name}
                    </Chip>
                  ))}
                </Row>
              )}
              <Row className="gap-2">
                <Button
                  variant="cta"
                  disabled={adding}
                  onPress={() => void submitNewItem()}
                  testID="gear-add-submit"
                >
                  {adding ? "Adding…" : "Add to closet"}
                </Button>
                <Button variant="outline" onPress={() => setAddOpen(false)}>
                  Cancel
                </Button>
              </Row>
            </CardContent>
          </Card>
        ) : (
          <Button
            variant="cta"
            className="self-start"
            onPress={() => setAddOpen(true)}
            testID="gear-add-open"
            icon={<PlusIcon size={16} color={palette.sand} />}
          >
            Add gear
          </Button>
        )}

        {items !== null && items.length === 0 ? (
          <EmptyPanel
            icon={PocketKnifeIcon}
            title="No gear yet"
            description="Add the kit you own and it can be suggested onto future trips automatically."
          />
        ) : visible.length === 0 ? (
          // Not "No gear yet" — the kit is there, the filter is hiding it, and telling
          // someone their closet is empty when it is not is the worse error.
          <EmptyPanel
            icon={PocketKnifeIcon}
            title="Nothing in those categories"
            description="Clear a filter to see the rest of your closet."
          />
        ) : (
          grouped.map(([category, categoryItems]) => (
            <Stack key={category} className="gap-2">
              {/* testID because a category name now appears twice on screen — once as a
                  filter chip, once as this heading — so a by-text query is ambiguous. */}
              <SectionLabel testID={`section-${category}`}>{category}</SectionLabel>
              {categoryItems.map((item) => (
                <Card key={item.id}>
                  <CardContent className="gap-2">
                    <Row className="justify-between gap-2">
                      <Text className="flex-1 text-sm font-medium" numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        accessibilityLabel={`Delete ${item.name}`}
                        onPress={() => confirmDelete(item)}
                        testID={`delete-${item.id}`}
                        icon={<Trash2Icon size={14} color={lightTokens.destructive} />}
                      />
                    </Row>

                    {/* M10's cross-trip personalisation, and the only thing on this
                        screen that changes what a future trip looks like — so it is a
                        labelled control rather than a bare icon. */}
                    <Chip
                      active={!!item.defaultPack}
                      disabled={busyId === item.id}
                      onPress={() => void toggleDefault(item)}
                      testID={`default-pack-${item.id}`}
                      className="self-start"
                    >
                      <Row className="items-center gap-1.5">
                        {item.defaultPack && (
                          <CheckIcon size={12} color={lightTokens.primaryForeground} />
                        )}
                        <Text
                          className={
                            item.defaultPack
                              ? "text-sm text-primary-foreground"
                              : "text-sm text-foreground"
                          }
                        >
                          Pack by default
                        </Text>
                      </Row>
                    </Chip>
                  </CardContent>
                </Card>
              ))}
            </Stack>
          ))
        )}
      </ScrollView>
    </Screen>
  )
}
