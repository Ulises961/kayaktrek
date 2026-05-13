"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AnchorIcon, MapPinIcon, PackageIcon, UsersIcon } from "lucide-react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { CrewTab } from "@/components/trips/tabs/crew-tab"
import { LogisticsTab } from "@/components/trips/tabs/logistics-tab"
import { ItineraryTab } from "@/components/trips/tabs/itinerary-tab"
import { ItemsTab } from "@/components/trips/tabs/items-tab"
import type { Trip } from "@/lib/dtos/trip"
import type { Logistics } from "@/lib/dtos/logistics"
import type { TravelDocument } from "@/lib/dtos/travel-document"
import type { ShuttleVehicle } from "@/lib/dtos/shuttle-vehicle"
import type { TripMember } from "@/lib/dtos/trip-member"

const TABS = ["crew", "logistics", "itinerary", "items"] as const
type TabId = (typeof TABS)[number]

interface TripDetailTabsProps {
  tripId: string
  trip: Trip
  logistics: Logistics | null
  travelDocuments: TravelDocument[]
  shuttleVehicles: ShuttleVehicle[]
  today: string
  isLeader: boolean
  isMember: boolean
  currentMember?: TripMember
  currentMemberId?: string
  currentUserId?: string
  leaderId?: string
}

export function TripDetailTabs({
  tripId,
  trip,
  logistics,
  travelDocuments,
  shuttleVehicles,
  today,
  isLeader,
  isMember,
  currentMember,
  currentMemberId,
  currentUserId,
  leaderId,
}: TripDetailTabsProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState<TabId>(
    (searchParams.get("tab") ?? "crew") as TabId
  )

  function handleTabChange(value: string) {
    setActiveTab(value as TabId)
    const params = new URLSearchParams(searchParams.toString())
    params.set("tab", value)
    router.replace(`?${params.toString()}`, { scroll: false })
  }

  const members = trip.travellers ?? []

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange}>
      <TabsList variant="underline" className="w-full justify-start overflow-x-auto px-6 mb-0 border-b border-border rounded-none">
        <TabsTrigger value="crew" variant="underline" className="whitespace-nowrap">
          <UsersIcon className="size-3.5 mr-1.5" />
          Crew
        </TabsTrigger>
        <TabsTrigger value="logistics" variant="underline" className="whitespace-nowrap">
          <AnchorIcon className="size-3.5 mr-1.5" />
          Logistics
        </TabsTrigger>
        <TabsTrigger value="itinerary" variant="underline" className="whitespace-nowrap">
          <MapPinIcon className="size-3.5 mr-1.5" />
          Itinerary
        </TabsTrigger>
        <TabsTrigger value="items" variant="underline" className="whitespace-nowrap">
          <PackageIcon className="size-3.5 mr-1.5" />
          Items
        </TabsTrigger>
      </TabsList>

      <TabsContent value="crew" className="p-6 pt-5">
        <CrewTab
          tripId={tripId}
          trip={trip}
          isLeader={isLeader}
          leaderId={leaderId}
          currentMember={currentMember}
        />
      </TabsContent>

      <TabsContent value="logistics" className="p-6 pt-5">
        <LogisticsTab
          tripId={tripId}
          logistics={logistics}
          travelDocuments={travelDocuments}
          shuttleVehicles={shuttleVehicles}
          members={members}
          today={today}
          isLeader={isLeader}
          isMember={isMember}
          currentMemberId={currentMemberId}
          currentUserId={currentUserId}
          leaderId={leaderId}
        />
      </TabsContent>

      <TabsContent value="itinerary" className="p-6 pt-5">
        <ItineraryTab />
      </TabsContent>

      <TabsContent value="items" className="p-6 pt-5">
        <ItemsTab />
      </TabsContent>
    </Tabs>
  )
}
