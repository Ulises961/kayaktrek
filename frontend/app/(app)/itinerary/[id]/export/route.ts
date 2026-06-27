import { type NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { API_URL, API_PREFIX } from "@/lib/api/config"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const cookieStore = await cookies()
  const token = cookieStore.get("access_token")?.value

  const upstream = await fetch(`${API_URL}${API_PREFIX}/itinerary/${id}/export?format=gpx`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })

  if (!upstream.ok) {
    return new NextResponse(null, { status: upstream.status })
  }

  const contentDisposition =
    upstream.headers.get("Content-Disposition") ?? `attachment; filename="${id}.gpx"`

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": "application/gpx+xml",
      "Content-Disposition": contentDisposition,
    },
  })
}
