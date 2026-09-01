import { redirect } from "next/navigation"
import { LandingExplore } from "@/components/landing/landing-explore"
import { getSession } from "@/lib/auth/session"
import { searchPublicItineraries } from "@/lib/itinerary/actions"

export default async function LandingPage() {
  const session = await getSession()
  if (session) redirect("/dashboard")

  // The root IS the route library for a signed-out visitor (M23 §2). It used to render a
  // decorative map that linked nowhere, while /explore — the surface that actually works
  // — was reachable only by typing the URL, since nothing anonymous ever linked to it.
  const initial = await searchPublicItineraries({ perPage: 20 })

  return <LandingExplore initial={initial} />
}
