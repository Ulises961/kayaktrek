"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { AnchorIcon, ShieldAlertIcon } from "lucide-react"
import { FloatPlanFormSchema, type FloatPlanFormValues, type TripMember } from "@/lib/dtos/trip-member"
import { updateMyFloatPlan } from "@/lib/trip-member/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"

interface FloatPlanEditFormProps {
  tripId: string
  membership: TripMember
}

export function FloatPlanEditForm({ tripId, membership: m }: FloatPlanEditFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const { register, handleSubmit, setError, formState: { errors } } = useForm<FloatPlanFormValues>({
    resolver: zodResolver(FloatPlanFormSchema),
    defaultValues: {
      vesselMake: m.vesselMake ?? "",
      vesselModel: m.vesselModel ?? "",
      vesselLengthCm: m.vesselLengthCm != null ? String(m.vesselLengthCm) : "",
      vesselColorPrimary: m.vesselColorPrimary ?? "",
      vesselColorSecondary: m.vesselColorSecondary ?? "",
      emergencyContactName: m.emergencyContactName ?? "",
      emergencyContactPhone: m.emergencyContactPhone ?? "",
      emergencyContactRelationship: m.emergencyContactRelationship ?? "",
    },
  })

  const onSubmit = handleSubmit((data) => {
    startTransition(async () => {
      const result = await updateMyFloatPlan(tripId, data)
      if (result.success) {
        router.push(`/trips/${tripId}?tab=crew`)
      } else {
        setError("root", { message: result.error })
      }
    })
  })

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-8">

      <div className="flex flex-col gap-4">
        <p className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
          <AnchorIcon className="size-4" /> Vessel
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vesselMake">Make</Label>
            <Input id="vesselMake" placeholder="e.g. Wilderness Systems" disabled={isPending} {...register("vesselMake")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vesselModel">Model</Label>
            <Input id="vesselModel" placeholder="e.g. Tempest 170" disabled={isPending} {...register("vesselModel")} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vesselLengthCm">Length (cm)</Label>
            <Input id="vesselLengthCm" type="number" min={1} disabled={isPending} {...register("vesselLengthCm")} />
            {errors.vesselLengthCm && <p className="text-xs text-destructive">{errors.vesselLengthCm.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vesselColorPrimary">Primary colour</Label>
            <Input id="vesselColorPrimary" placeholder="e.g. Red" disabled={isPending} {...register("vesselColorPrimary")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vesselColorSecondary">Secondary colour</Label>
            <Input id="vesselColorSecondary" placeholder="e.g. White" disabled={isPending} {...register("vesselColorSecondary")} />
          </div>
        </div>
      </div>

      <Separator />

      <div className="flex flex-col gap-4">
        <p className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
          <ShieldAlertIcon className="size-4" /> Emergency contact
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="emergencyContactName">Contact name</Label>
            <Input id="emergencyContactName" disabled={isPending} {...register("emergencyContactName")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="emergencyContactRelationship">Relationship</Label>
            <Input id="emergencyContactRelationship" placeholder="e.g. Partner" disabled={isPending} {...register("emergencyContactRelationship")} />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="emergencyContactPhone">Contact phone</Label>
          <Input id="emergencyContactPhone" type="tel" disabled={isPending} {...register("emergencyContactPhone")} />
        </div>
      </div>

      {errors.root && <p className="text-sm text-destructive">{errors.root.message}</p>}

      <div className="flex gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Save float plan"}
        </Button>
        <Button type="button" variant="outline" disabled={isPending} onClick={() => router.push(`/trips/${tripId}?tab=crew`)}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
