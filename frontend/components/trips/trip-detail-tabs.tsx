"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AnchorIcon, ClipboardListIcon, MapPinIcon, PackageIcon, UsersIcon } from "lucide-react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { CrewTab } from "@/components/trips/tabs/crew-tab"
import { FloatPlanTab } from "@/components/trips/tabs/float-plan-tab"
import { LogisticsTab } from "@/components/trips/tabs/logistics-tab"
import { ItineraryTab } from "@/components/trips/tabs/itinerary-tab"
import { ItemsTab } from "@/components/trips/tabs/items-tab"
import type { Trip } from "@/lib/dtos/trip"
import type { Logistics } from "@/lib/dtos/logistics"
import type { TravelDocument } from "@/lib/dtos/travel-document"
import type { ShuttleVehicle } from "@/lib/dtos/shuttle-vehicle"
import type { TripMember } from "@/lib/dtos/trip-member"

type TabId = "crew" | "float-plan" | "logistics" | "itinerary" | "items"

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
  /** Current user's medical-notes reset flag — drives the re-entry prompt on the float-plan tab. */
  medicalNotesResetAt?: string | null
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
  medicalNotesResetAt,
}: TripDetailTabsProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState<TabId>(
    (searchParams.get("tab") ?? "itinerary") as TabId,
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
      <TabsList className="border-border mb-0 w-full justify-start overflow-x-auto rounded-none border-b px-6">
        <TabsTrigger value="crew" className="whitespace-nowrap">
          <UsersIcon className="mr-1.5 size-3.5" />
          Crew
        </TabsTrigger>
        {currentMember && (
          <TabsTrigger value="float-plan" className="whitespace-nowrap">
            <ClipboardListIcon className="mr-1.5 size-3.5" />
            Float plan
          </TabsTrigger>
        )}
        <TabsTrigger value="logistics" className="whitespace-nowrap">
          <AnchorIcon className="mr-1.5 size-3.5" />
          Logistics
        </TabsTrigger>
        <TabsTrigger value="itinerary" className="whitespace-nowrap">
          <MapPinIcon className="mr-1.5 size-3.5" />
          Itinerary
        </TabsTrigger>
        <TabsTrigger value="items" className="whitespace-nowrap">
          <PackageIcon className="mr-1.5 size-3.5" />
          Items
        </TabsTrigger>
      </TabsList>

      <TabsContent value="crew" className="p-6 pt-5">
        <CrewTab tripId={tripId} trip={trip} isLeader={isLeader} leaderId={leaderId} />
      </TabsContent>

      {currentMember && (
        <TabsContent value="float-plan" className="p-6 pt-5">
          <FloatPlanTab
            tripId={tripId}
            currentMember={currentMember}
            medicalNotesResetAt={medicalNotesResetAt}
          />
        </TabsContent>
      )}

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
        <ItineraryTab
          tripId={tripId}
          itinerary={trip.itinerary}
          isLeader={isLeader}
          tripName={trip.destination ?? ""}
        />
      </TabsContent>

      <TabsContent value="items" className="p-6 pt-5">
        <ItemsTab tripId={tripId} inventory={trip.inventory} isLeader={isLeader} />
      </TabsContent>
    </Tabs>
  )
}
