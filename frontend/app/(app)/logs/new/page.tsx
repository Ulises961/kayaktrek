import { LogForm } from "@/components/logs/log-form"

export default function NewLogPage() {
  return (
    <div className="flex flex-col gap-6 max-w-lg">
      <h1 className="text-2xl font-semibold">Add paddling log</h1>
      <LogForm />
    </div>
  )
}
