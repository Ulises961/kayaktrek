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
    <div className="flex flex-col gap-6 max-w-lg">
      <h1 className="text-2xl font-semibold">Edit log</h1>
      <LogForm log={log} />
      <div className="flex flex-col gap-3 border border-destructive/30 rounded-lg p-4">
        <p className="text-sm font-medium text-destructive">Danger zone</p>
        <DeleteLogButton logId={id} />
      </div>
    </div>
  )
}
