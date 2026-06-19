"use client"
import { useForm, useFieldArray, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  TidalDiamondFormSchema,
  DIAMOND_HOURS,
  type TidalDiamondForm as TidalDiamondFormValues,
} from "@/lib/dtos/tidal-station"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"

// Empty string ↔ null so a cleared numeric field round-trips as "no value"
// rather than NaN, which the Zod schema would reject.
const asNumber = { setValueAs: (v: string) => (v === "" || v == null ? null : Number(v)) }

function emptyEntries() {
  return DIAMOND_HOURS.map((h) => ({ hoursFromHw: h }))
}

function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <Label
      htmlFor={htmlFor}
      className="text-muted-foreground text-[10px] font-semibold tracking-[0.08em] uppercase"
    >
      {children}
    </Label>
  )
}

export type TidalDiamondFormProps = {
  submitLabel?: string
  isPending?: boolean
  error?: string | null
  // Prefill for editing an existing diamond; omitted for a fresh create.
  values?: TidalDiamondFormValues
  onSubmit: (fields: TidalDiamondFormValues) => void
  onCancel?: () => void
}

export function TidalDiamondForm({
  submitLabel = "Save diamond",
  isPending = false,
  error = null,
  values,
  onSubmit,
  onCancel,
}: TidalDiamondFormProps) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    control,
    formState: { errors },
  } = useForm<TidalDiamondFormValues>({
    resolver: zodResolver(TidalDiamondFormSchema),
    defaultValues: {
      name: "",
      entryMode: "simple",
      radiusM: 500,
      tidalStreamEntries: emptyEntries(),
    },
    values,
  })

  const { fields } = useFieldArray({ control, name: "tidalStreamEntries" })
  const entryMode = useWatch({ control, name: "entryMode" })

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="diamond-name">Name</FieldLabel>
        <Input
          id="diamond-name"
          placeholder="e.g. The Race"
          disabled={isPending}
          {...register("name")}
        />
        {errors.name && <p className="text-destructive text-xs">{errors.name.message}</p>}
      </div>

      <Tabs value={entryMode} onValueChange={(v) => setValue("entryMode", v as "simple" | "atlas")}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="simple">Simple</TabsTrigger>
          <TabsTrigger value="atlas">Advanced</TabsTrigger>
        </TabsList>

        <TabsContent value="simple" className="mt-3">
          <p className="text-muted-foreground mb-3 text-xs">
            Enter the peak rate and stream directions; hourly rates are filled in by the rule of
            thirds (slack at HW/LW, peak mid-tide).
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <FieldLabel htmlFor="max-spring">Peak spring rate (kn)</FieldLabel>
              <Input
                id="max-spring"
                type="number"
                step="0.1"
                min={0}
                disabled={isPending}
                {...register("maxSpringRateKnots", asNumber)}
              />
              {errors.maxSpringRateKnots && (
                <p className="text-destructive text-xs">{errors.maxSpringRateKnots.message}</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <FieldLabel htmlFor="max-neap">Peak neap rate (kn)</FieldLabel>
              <Input
                id="max-neap"
                type="number"
                step="0.1"
                min={0}
                placeholder="optional"
                disabled={isPending}
                {...register("maxNeapRateKnots", asNumber)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <FieldLabel htmlFor="flood-dir">Flood direction (°)</FieldLabel>
              <Input
                id="flood-dir"
                type="number"
                min={0}
                max={360}
                disabled={isPending}
                {...register("floodDirectionDegrees", asNumber)}
              />
              {errors.floodDirectionDegrees && (
                <p className="text-destructive text-xs">{errors.floodDirectionDegrees.message}</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <FieldLabel htmlFor="ebb-dir">Ebb direction (°)</FieldLabel>
              <Input
                id="ebb-dir"
                type="number"
                min={0}
                max={360}
                disabled={isPending}
                {...register("ebbDirectionDegrees", asNumber)}
              />
              {errors.ebbDirectionDegrees && (
                <p className="text-destructive text-xs">{errors.ebbDirectionDegrees.message}</p>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="atlas" className="mt-3">
          <p className="text-muted-foreground mb-2 text-xs">
            Enter the documented rate and set for each hour relative to HW (from an atlas or diamond
            table).
          </p>
          <div className="max-h-56 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground bg-background sticky top-0 text-left">
                <tr>
                  <th className="py-1 font-medium">HW</th>
                  <th className="py-1 font-medium">Spring (kn)</th>
                  <th className="py-1 font-medium">Neap (kn)</th>
                  <th className="py-1 font-medium">Set (°)</th>
                </tr>
              </thead>
              <tbody>
                {fields.map((field, i) => (
                  <tr key={field.id} data-testid="diamond-hour-row">
                    <td className="py-0.5 pr-2 tabular-nums">
                      {field.hoursFromHw > 0 ? `+${field.hoursFromHw}` : field.hoursFromHw}
                      <input
                        type="hidden"
                        defaultValue={field.hoursFromHw}
                        {...register(`tidalStreamEntries.${i}.hoursFromHw`, {
                          valueAsNumber: true,
                        })}
                      />
                    </td>
                    <td className="py-0.5 pr-1">
                      <Input
                        type="number"
                        step="0.1"
                        min={0}
                        className="h-7"
                        disabled={isPending}
                        {...register(`tidalStreamEntries.${i}.springRateKnots`, asNumber)}
                      />
                    </td>
                    <td className="py-0.5 pr-1">
                      <Input
                        type="number"
                        step="0.1"
                        min={0}
                        className="h-7"
                        disabled={isPending}
                        {...register(`tidalStreamEntries.${i}.neapRateKnots`, asNumber)}
                      />
                    </td>
                    <td className="py-0.5">
                      <Input
                        type="number"
                        min={0}
                        max={360}
                        className="h-7"
                        disabled={isPending}
                        {...register(`tidalStreamEntries.${i}.directionDegrees`, asNumber)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {errors.tidalStreamEntries && (
            <p className="text-destructive mt-1 text-xs">
              {/* A superRefine issue on the array itself lands on `.root` for a
                  useFieldArray field; per-row issues carry their own `.message`. */}
              {errors.tidalStreamEntries.root?.message ??
                errors.tidalStreamEntries.message ??
                "Check the hourly table."}
            </p>
          )}
        </TabsContent>
      </Tabs>

      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="radius">Validity radius (m)</FieldLabel>
        <Input
          id="radius"
          type="number"
          min={1}
          disabled={isPending}
          {...register("radiusM", asNumber)}
        />
        {errors.radiusM && <p className="text-destructive text-xs">{errors.radiusM.message}</p>}
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isPending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
