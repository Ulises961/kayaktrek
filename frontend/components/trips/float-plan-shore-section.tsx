"use client"

import Link from "next/link"
import { AnchorIcon, ChevronDownIcon, FileTextIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { FloatPlanPanel } from "@/components/trips/float-plan-panel"
import { FloatPlanShareSection } from "@/components/trips/float-plan-share-section"
import { ShoreContactForm } from "@/components/trips/float-plan-shore-contact-form"
import type { Logistics } from "@/lib/dtos/logistics"

interface FloatPlanShoreSectionProps {
  tripId: string
  /** The trip's logistics record, which holds the shore contact and the share link. */
  logistics: Logistics | null
}

// The leader's side of the float plan: who on shore receives it, the link and email that
// send it, and the printable page. It is done once before departure, so it starts folded,
// with a line saying where it stands.
export function FloatPlanShoreSection({ tripId, logistics }: FloatPlanShoreSectionProps) {
  const contact = logistics?.shoreContactName || "No shore contact yet"
  const link = logistics?.shareToken ? "link live" : "no link yet"

  return (
    <FloatPlanPanel aria-label="Shore" className="gap-0">
      <Collapsible className="group flex flex-col">
        <h2>
          <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 text-left">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <AnchorIcon className="text-muted-foreground size-4 shrink-0" />
              Shore
            </span>
            <span className="flex min-w-0 items-center gap-2">
              <span className="text-muted-foreground truncate text-xs font-normal">
                {contact}, {link}
              </span>
              <ChevronDownIcon className="text-muted-foreground size-4 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
            </span>
          </CollapsibleTrigger>
        </h2>

        <CollapsibleContent className="flex flex-col gap-5 pt-4">
          <section aria-label="Shore contact" className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">Contact</h3>
            <p className="text-muted-foreground text-xs">
              Person who receives this float plan before departure.
            </p>
            <ShoreContactForm tripId={tripId} logistics={logistics} />
          </section>

          <section aria-label="Share and print" className="flex flex-col gap-3 border-t pt-4">
            <h3 className="text-sm font-medium">Share and print</h3>
            <p className="text-muted-foreground text-xs">
              A read-only link for your shore contact. It holds vessel descriptions and emergency
              contacts.
            </p>
            <FloatPlanShareSection tripId={tripId} logistics={logistics} />
            <Button variant="outline" size="sm" className="w-fit" asChild>
              <Link href={`/trips/float-plan/${tripId}`}>
                <FileTextIcon className="size-3.5" />
                Printable float plan
              </Link>
            </Button>
          </section>
        </CollapsibleContent>
      </Collapsible>
    </FloatPlanPanel>
  )
}
