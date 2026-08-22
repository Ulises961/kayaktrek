"use client"
import { useTransition } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { updateItinerary } from "@/lib/itinerary/actions"
import { ItineraryPitchSchema, type ItineraryPitch } from "@/lib/dtos/itinerary"
import { DIFFICULTIES, DIFFICULTY_LABELS, type Difficulty } from "@/lib/dtos/difficulty"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { FieldLabel, FieldError, NativeSelect } from "@/components/common/form-field"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export type ItineraryPitchDialogProps = {
  itineraryId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  description?: string | null
  difficulty?: Difficulty | null
  /** Publish in the same request as the pitch, so a route is never briefly public with nothing on it. */
  publishOnSave?: boolean
  onSaved?: () => void
}

export function ItineraryPitchDialog({
  itineraryId,
  open,
  onOpenChange,
  description,
  difficulty,
  publishOnSave = false,
  onSaved,
}: ItineraryPitchDialogProps) {
  const [isPending, startTransition] = useTransition()
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ItineraryPitch>({
    resolver: zodResolver(ItineraryPitchSchema),
    values: { description: description ?? "", difficulty: difficulty ?? "" },
  })

  function onSubmit(fields: ItineraryPitch) {
    startTransition(async () => {
      const result = await updateItinerary(itineraryId, {
        description: fields.description?.trim() || null,
        difficulty: fields.difficulty || null,
        ...(publishOnSave ? { isPublic: true } : {}),
      })
      if (!result.success) {
        // Kept open deliberately — closing would discard what the author just wrote.
        toast.error(result.error)
        return
      }
      onSaved?.()
      onOpenChange(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{publishOnSave ? "Publish this route" : "Route details"}</DialogTitle>
          <DialogDescription>
            {publishOnSave
              ? "Say what the route is like. Anyone browsing the library will see this."
              : "What paddlers see when they find this route."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <FieldLabel htmlFor="itinerary-pitch">Description</FieldLabel>
            <Textarea
              id="itinerary-pitch"
              rows={4}
              placeholder="Where you launch, what the water does, what makes it worth paddling."
              {...register("description")}
            />
            <FieldError message={errors.description?.message} />
          </div>

          <div className="flex flex-col gap-1.5">
            <FieldLabel htmlFor="itinerary-difficulty">Difficulty</FieldLabel>
            <NativeSelect id="itinerary-difficulty" {...register("difficulty")}>
              <option value="">Not graded</option>
              {DIFFICULTIES.map((level) => (
                <option key={level} value={level}>
                  {DIFFICULTY_LABELS[level]}
                </option>
              ))}
            </NativeSelect>
            <FieldError message={errors.difficulty?.message} />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {publishOnSave ? "Publish" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
