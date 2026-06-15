import { LogForm } from "@/components/logs/log-form"

export default function NewLogPage() {
  return (
    <div className="flex max-w-lg flex-col gap-6">
      <h1 className="text-2xl font-semibold">Add paddling log</h1>
      <LogForm />
    </div>
  )
}
