import { redirect } from "next/navigation"
import { LandingExplore } from "@/components/landing/landing-explore"
import { hasLiveSession } from "@/lib/user/me"
import { searchPublicItineraries } from "@/lib/itinerary/actions"

export default async function LandingPage() {
  // hasLiveSession, not a cookie check: credentials the API can no longer use — a revoked
  // device, an expired refresh token — must render as anonymous here, or the visitor is
  // sent to /dashboard, which gates straight to /login. /explore reads the same predicate
  // and redirects back here, so the two must agree or a visitor ricochets between them.
  if (await hasLiveSession()) redirect("/dashboard")

  // The root IS the route library for a signed-out visitor (M23 §2). It used to render a
  // decorative map that linked nowhere, while /explore — the surface that actually works
  // — was reachable only by typing the URL, since nothing anonymous ever linked to it.
  const initial = await searchPublicItineraries({ perPage: 20 })

  return <LandingExplore initial={initial} />
}
