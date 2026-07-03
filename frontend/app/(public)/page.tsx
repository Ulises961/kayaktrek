import { redirect } from "next/navigation"
import { LandingHero } from "@/components/landing/landing-hero"
import { getSession } from "@/lib/auth/session"
import { fetchLandingRoutes } from "@/lib/landing/fetch-routes"

export default async function LandingPage() {
  const session = await getSession()
  if (session) redirect("/dashboard")

  const routes = await fetchLandingRoutes()

  return <LandingHero routes={routes} />
}
