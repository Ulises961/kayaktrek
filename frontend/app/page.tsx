import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import MapLoader from "@/components/map/map-loader"

export default function LandingPage() {
  return (
    <div className="relative w-full h-screen overflow-hidden">
      {/* Full-screen map */}
      <div className="absolute inset-0">
        <MapLoader />
      </div>

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-[1001] flex items-center justify-between px-6 py-4 bg-white/80 backdrop-blur-sm border-b border-slate-200">
        <span className="font-semibold text-slate-900 tracking-tight">
          Kayak Expedition Planner
        </span>
        <div className="flex items-center gap-2">
          <Button variant="ghost" asChild>
            <Link href="/login">Log in</Link>
          </Button>
          <Button asChild>
            <Link href="/register">Sign up</Link>
          </Button>
        </div>
      </div>

      {/* Search bar overlay */}
      <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[1001] w-full max-w-md px-4">
        <div className="flex items-center gap-2 bg-white rounded-lg shadow-md border border-slate-200 px-3 py-2">
          <Input
            placeholder="Search public expeditions…"
            className="border-0 shadow-none focus-visible:ring-0 bg-transparent"
          />
        </div>
      </div>
    </div>
  )
}
