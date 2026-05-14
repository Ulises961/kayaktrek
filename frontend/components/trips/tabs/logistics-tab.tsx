"use client"

import { CarIcon, FileIcon } from "lucide-react"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { TravelDocumentsSection } from "@/components/logistics/travel-documents-section"
import { ShuttleSection } from "@/components/logistics/shuttle-section"
import type { Logistics } from "@/lib/dtos/logistics"
import type { TravelDocument } from "@/lib/dtos/travel-document"
import type { ShuttleVehicle } from "@/lib/dtos/shuttle-vehicle"
import type { TripMember } from "@/lib/dtos/trip-member"

interface LogisticsTabProps {
  tripId: string
  logistics: Logistics | null
  travelDocuments: TravelDocument[]
  shuttleVehicles: ShuttleVehicle[]
  members: TripMember[]
  today: string
  isLeader: boolean
  isMember: boolean
  currentMemberId?: string
  currentUserId?: string
  leaderId?: string
}

export function LogisticsTab({
  tripId,
  logistics,
  travelDocuments,
  shuttleVehicles,
  members,
  today,
  isLeader,
  isMember,
  currentMemberId,
  currentUserId,
  leaderId,
}: LogisticsTabProps) {
  return (
    <div>
      <Accordion type="multiple">

        {/* Travel documents */}
        <AccordionItem value="travel-documents">
          <AccordionTrigger className="text-sm font-medium hover:no-underline">
            <span className="flex items-center gap-2">
              <FileIcon className="size-3.5 text-muted-foreground shrink-0" />
              Travel documents
              {travelDocuments.length > 0 && (
                <span className="text-xs font-normal text-muted-foreground">
                  {travelDocuments.length}
                </span>
              )}
            </span>
          </AccordionTrigger>
          <AccordionContent className="pb-4">
            <TravelDocumentsSection
              documents={travelDocuments}
              today={today}
              tripId={isMember ? tripId : undefined}
              currentUserId={currentUserId}
              leaderId={leaderId}
              isMember={isMember}
            />
          </AccordionContent>
        </AccordionItem>

        {/* Shuttle */}
        <AccordionItem value="shuttle">
          <AccordionTrigger className="text-sm font-medium hover:no-underline">
            <span className="flex items-center gap-2">
              <CarIcon className="size-3.5 text-muted-foreground shrink-0" />
              Shuttle
              {shuttleVehicles.length > 0 && (
                <span className="text-xs font-normal text-muted-foreground">
                  {shuttleVehicles.length}
                </span>
              )}
            </span>
          </AccordionTrigger>
          <AccordionContent className="pb-4">
            <ShuttleSection
              logistics={logistics}
              vehicles={shuttleVehicles}
              members={members}
              tripId={isMember ? tripId : undefined}
              currentUserId={currentUserId}
              currentMemberId={currentMemberId}
              leaderId={leaderId}
              isMember={isMember}
            />
          </AccordionContent>
        </AccordionItem>

      </Accordion>
    </div>
  )
}
