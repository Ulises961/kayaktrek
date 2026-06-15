"use client"

import { AnchorIcon, CarIcon, PhoneIcon, ShieldAlertIcon } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { EditShoreContactDialog } from "./edit-logistics-dialog"
import type { Logistics } from "@/lib/dtos/logistics"

interface LogisticsCardProps {
  logistics: Logistics | null
  isLeader: boolean
  isMember?: boolean
  tripId?: string
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-muted-foreground text-[10px] font-semibold tracking-[0.08em] uppercase">
      {children}
    </span>
  )
}

function FieldValue({ children, dim }: { children: React.ReactNode; dim?: boolean }) {
  return (
    <span className={dim ? "text-muted-foreground/60 text-sm italic" : "text-foreground text-sm"}>
      {children}
    </span>
  )
}

export function LogisticsCard({ logistics, isLeader, tripId }: LogisticsCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <AnchorIcon className="size-4" />
            Logistics
          </CardTitle>
          {isLeader && tripId && <EditShoreContactDialog tripId={tripId} logistics={logistics} />}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {!logistics ? (
          <p className="text-muted-foreground text-sm">
            Logistics not yet set up — shore contact and shuttle details will appear here.
          </p>
        ) : (
          <>
            {/* Shore contact */}
            {(logistics.shoreContactName ||
              logistics.shoreContactEmail ||
              logistics.shoreContactPhone) && (
              <div className="flex flex-col gap-2 rounded-lg border border-amber-200/60 bg-amber-50/50 p-3 dark:border-amber-800/30 dark:bg-amber-950/20">
                <div className="flex items-center gap-1.5">
                  <ShieldAlertIcon className="size-3.5 text-amber-600 dark:text-amber-400" />
                  <FieldLabel>Shore contact</FieldLabel>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                  {logistics.shoreContactName && (
                    <div className="col-span-2 flex flex-col gap-0.5">
                      <FieldLabel>Name</FieldLabel>
                      <FieldValue>{logistics.shoreContactName}</FieldValue>
                      {logistics.shoreContactRelationship && (
                        <span className="text-muted-foreground text-xs">
                          {logistics.shoreContactRelationship}
                        </span>
                      )}
                    </div>
                  )}
                  {logistics.shoreContactPhone && (
                    <div className="flex flex-col gap-0.5">
                      <FieldLabel>
                        <PhoneIcon className="-mt-px mr-0.5 inline size-3" />
                        Phone
                      </FieldLabel>
                      <FieldValue>{logistics.shoreContactPhone}</FieldValue>
                    </div>
                  )}
                  {logistics.shoreContactEmail && (
                    <div className="flex flex-col gap-0.5">
                      <FieldLabel>Email</FieldLabel>
                      <a
                        href={`mailto:${logistics.shoreContactEmail}`}
                        className="text-primary text-sm hover:underline"
                      >
                        {logistics.shoreContactEmail}
                      </a>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Shuttle notes hint */}
            {(logistics.shuttleMeetingTime || logistics.shuttleNotes) && (
              <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
                <CarIcon className="size-3.5" />
                <span>Shuttle meeting at {logistics.shuttleMeetingTime ?? "TBD"}</span>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
