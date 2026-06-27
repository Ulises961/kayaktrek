import { API_URL, API_PREFIX } from "@/lib/api/config"
import { NextResponse } from "next/server"

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const upstream = await fetch(`${API_URL}${API_PREFIX}/user/me/data-export/${token}`)

  if (!upstream.ok) {
    return new NextResponse("Download link is invalid or has already been used.", {
      status: upstream.status,
    })
  }

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") ?? "application/json",
      "Content-Disposition":
        upstream.headers.get("Content-Disposition") ??
        'attachment; filename="kayak-planner-export.json"',
    },
  })
}
