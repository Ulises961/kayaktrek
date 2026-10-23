"use client"

import Link from "next/link"
import { FileTextIcon, LifeBuoyIcon } from "lucide-react"
import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { FloatPlanShareSection } from "@/components/trips/float-plan-share-section"
import { ShoreContactForm } from "@/components/trips/float-plan-shore-contact-form"
import type { Logistics } from "@/lib/dtos/logistics"

interface FloatPlanSafetySectionProps {
  tripId: string
  /** The trip's logistics record, which holds the shore contact and the share link. */
  logistics: Logistics | null
}

// The leader's side of the float plan: who on shore receives it, the link and email that
// send it, and the printable page. It is done once before departure, so it starts folded,
// with a line saying where it stands.
export function FloatPlanSafetySection({ tripId, logistics }: FloatPlanSafetySectionProps) {
  const contact = logistics?.shoreContactName || "No shore contact yet"
  const link = logistics?.shareToken ? "link live" : "no link yet"

  return (
    <AccordionItem value="safety">
      <AccordionTrigger className="text-sm font-medium hover:no-underline">
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          <LifeBuoyIcon className="text-muted-foreground size-3.5 shrink-0" />
          Safety and rescue information
          <span className="text-muted-foreground text-xs font-normal">
            {contact}, {link}
          </span>
        </span>
      </AccordionTrigger>
      <AccordionContent className="flex flex-col gap-5">
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
      </AccordionContent>
    </AccordionItem>
  )
}
