"use client"

import { CarIcon, FileIcon, PhoneIcon, ShieldAlertIcon, UserIcon } from "lucide-react"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { EditShoreContactDialog } from "@/components/logistics/edit-logistics-dialog"
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

function ShoreContactDisplay({ logistics }: { logistics: Logistics | null }) {
  const hasContact = !!(
    logistics?.shoreContactName ||
    logistics?.shoreContactPhone ||
    logistics?.shoreContactEmail
  )

  if (!hasContact) {
    return <p className="text-sm text-muted-foreground">No shore contact set yet.</p>
  }

  return (
    <div className="rounded-lg border border-amber-200/60 bg-amber-50/50 dark:border-amber-800/30 dark:bg-amber-950/20 p-3 flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <ShieldAlertIcon className="size-3.5 text-amber-600 dark:text-amber-400" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-700 dark:text-amber-400">
          Float plan contact
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
        {logistics?.shoreContactName && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Name
            </span>
            <span className="text-sm">{logistics.shoreContactName}</span>
          </div>
        )}
        {logistics?.shoreContactRelationship && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Relationship
            </span>
            <span className="text-xs text-muted-foreground">{logistics.shoreContactRelationship}</span>
          </div>
        )}
        {logistics?.shoreContactPhone && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground flex items-center gap-0.5">
              <PhoneIcon className="size-2.5" />Phone
            </span>
            <span className="text-sm">{logistics.shoreContactPhone}</span>
          </div>
        )}
        {logistics?.shoreContactEmail && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Email
            </span>
            <a
              href={`mailto:${logistics.shoreContactEmail}`}
              className="text-sm text-primary hover:underline truncate block"
            >
              {logistics.shoreContactEmail}
            </a>
          </div>
        )}
      </div>
    </div>
  )
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

        {/* Shore contact */}
        <AccordionItem value="shore-contact">
          <AccordionTrigger className="text-sm font-medium hover:no-underline">
            <span className="flex items-center gap-2">
              <UserIcon className="size-3.5 text-muted-foreground shrink-0" />
              Shore contact
              {logistics?.shoreContactName && (
                <span className="hidden sm:inline text-xs font-normal text-muted-foreground">
                  {logistics.shoreContactName}
                </span>
              )}
            </span>
          </AccordionTrigger>
          <AccordionContent className="pb-4">
            <div className="flex flex-col gap-3">
              {isLeader && (
                <div className="flex justify-end">
                  <EditShoreContactDialog tripId={tripId} logistics={logistics} />
                </div>
              )}
              <ShoreContactDisplay logistics={logistics} />
            </div>
          </AccordionContent>
        </AccordionItem>

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
