"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { UploadIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { importGpx } from "@/lib/itinerary/actions"

const schema = z.object({
  file: z
    .custom<FileList>()
    .refine((f) => f instanceof FileList && f.length > 0, "Please select a GPX file.")
    .refine(
      (f) => !(f instanceof FileList) || (f[0]?.size ?? 0) <= 5 * 1024 * 1024,
      "File must be under 5 MB.",
    ),
  epsilon: z.number().min(0.00001).max(0.001),
})

type FormValues = z.infer<typeof schema>

export function ImportGpxButton() {
  const [open, setOpen] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { epsilon: 0.0001 },
  })

  const epsilon = useWatch({ control, name: "epsilon" })

  function onOpen() {
    setOpen(true)
    setServerError(null)
    reset({ epsilon: 0.0001 })
  }

  function onClose() {
    setOpen(false)
    reset()
  }

  function onSubmit(values: FormValues) {
    const file = (values.file as FileList)[0]
    const formData = new FormData()
    formData.append("file", file)
    formData.append("epsilon", String(values.epsilon))

    startTransition(async () => {
      const result = await importGpx(formData)
      if (result.success) {
        router.push(`/itinerary/${result.itineraryId}`)
        onClose()
      } else {
        setServerError(result.error)
      }
    })
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={onOpen}>
        <UploadIcon className="mr-2 size-4" />
        Import GPX
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import GPX file</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="gpx-file">GPX file</Label>
              <input
                id="gpx-file"
                type="file"
                accept=".gpx"
                className="file:bg-muted file:text-foreground hover:file:bg-muted/80 cursor-pointer text-sm file:mr-3 file:rounded file:border-0 file:px-3 file:py-1.5 file:text-sm file:font-medium"
                {...register("file")}
              />
              {errors.file && (
                <p className="text-destructive text-sm">{errors.file.message as string}</p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="gpx-epsilon">
                Simplification (ε = {Number(epsilon).toFixed(4)}°)
              </Label>
              <input
                id="gpx-epsilon"
                type="range"
                min={0.00001}
                max={0.001}
                step={0.00001}
                className="accent-primary w-full"
                {...register("epsilon", { valueAsNumber: true })}
              />
              <p className="text-muted-foreground text-xs">
                Only applies to recorded tracks. Higher values = fewer points.
              </p>
            </div>

            {serverError && <p className="text-destructive text-sm">{serverError}</p>}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                Import
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
