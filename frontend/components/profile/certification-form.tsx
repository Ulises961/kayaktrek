"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { CertificationFieldsSchema, type CertificationFields } from "@/lib/dtos/certification"
import type { Certification } from "@/lib/dtos/certification"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface CertificationFormProps {
  /** When provided, the form edits an existing cert; otherwise it adds a new one. */
  cert?: Certification
  onSubmit: (fields: CertificationFields) => void
  onCancel: () => void
  isPending: boolean
  error?: string | null
}

export function CertificationForm({
  cert,
  onSubmit,
  onCancel,
  isPending,
  error,
}: CertificationFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CertificationFields>({
    resolver: zodResolver(CertificationFieldsSchema),
    defaultValues: {
      organization: cert?.organization ?? "",
      award: cert?.award ?? "",
      membershipNumber: cert?.membershipNumber ?? "",
      awardedAt: cert?.awardedAt ?? "",
      validUntil: cert?.validUntil ?? "",
    },
  })

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="organization">Organization</Label>
        <Input
          id="organization"
          placeholder="e.g. British Canoeing"
          disabled={isPending}
          {...register("organization")}
        />
        {errors.organization && (
          <p className="text-destructive text-xs">{errors.organization.message}</p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="award">Award</Label>
        <Input
          id="award"
          placeholder="e.g. Sea Kayak Leader"
          disabled={isPending}
          {...register("award")}
        />
        {errors.award && <p className="text-destructive text-xs">{errors.award.message}</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="membershipNumber">Membership number (optional)</Label>
        <Input id="membershipNumber" disabled={isPending} {...register("membershipNumber")} />
        {errors.membershipNumber && (
          <p className="text-destructive text-xs">{errors.membershipNumber.message}</p>
        )}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="awardedAt">Awarded</Label>
          <Input id="awardedAt" type="date" disabled={isPending} {...register("awardedAt")} />
          {errors.awardedAt && (
            <p className="text-destructive text-xs">{errors.awardedAt.message}</p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="validUntil">Valid until</Label>
          <Input id="validUntil" type="date" disabled={isPending} {...register("validUntil")} />
          {errors.validUntil && (
            <p className="text-destructive text-xs">{errors.validUntil.message}</p>
          )}
        </div>
      </div>
      {error && <p className="text-destructive text-sm">{error}</p>}
      <div className="flex gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : cert ? "Save changes" : "Add certification"}
        </Button>
        <Button type="button" variant="outline" disabled={isPending} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
