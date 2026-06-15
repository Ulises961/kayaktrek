import { notFound } from "next/navigation"
import { apiGet } from "@/lib/api/client"
import { LogSchema } from "@/lib/dtos/log"
import { LogForm } from "@/components/logs/log-form"
import { DeleteLogButton } from "@/components/logs/delete-log-button"

export default async function EditLogPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  let log
  try {
    const raw = await apiGet(`/api/log/${id}`)
    log = LogSchema.parse(raw)
  } catch {
    notFound()
  }

  return (
    <div className="flex max-w-lg flex-col gap-6">
      <h1 className="text-2xl font-semibold">Edit log</h1>
      <LogForm log={log} />
      <div className="border-destructive/30 flex flex-col gap-3 rounded-lg border p-4">
        <p className="text-destructive text-sm font-medium">Danger zone</p>
        <DeleteLogButton logId={id} />
      </div>
    </div>
  )
}
