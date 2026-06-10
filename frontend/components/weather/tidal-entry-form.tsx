"use client"
import { useState, useTransition } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { deriveCorrectedTide } from "@/lib/weather/tidal"
import { updateDaySea } from "@/lib/weather/actions"
import { TidalEntryFieldsSchema, type TidalEntryFields, type Sea } from "@/lib/dtos/sea"

interface TidalEntryFormProps {
  dayId: string
  sea: Sea | null
  isLeader: boolean
  onSaved: (sea: Sea) => void
}

const numberOpts = {
  setValueAs: (v: unknown) => (v === "" || v == null ? undefined : Number(v)),
}

function timeOrUndefined(v: string | undefined): string | undefined {
  return v && /^\d{2}:\d{2}$/.test(v) ? v : undefined
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-md border border-border/60">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-2.5 py-1.5 text-xs font-medium text-foreground"
      >
        {title}
        <ChevronDown className={cn("size-3.5 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && <div className="flex flex-col gap-2 border-t border-border/60 px-2.5 py-2">{children}</div>}
    </div>
  )
}

function ReadOnlyTidal({ sea }: { sea: Sea | null }) {
  const hw = sea?.highTide ?? "—"
  const lw = sea?.lowTide ?? "—"
  const range = sea?.tidalRangeM != null ? `${sea.tidalRangeM} m` : "—"
  return (
    <dl className="grid grid-cols-3 gap-2 text-xs" data-testid="tidal-readonly">
      <div><dt className="text-muted-foreground">High water</dt><dd className="font-medium">{hw}</dd></div>
      <div><dt className="text-muted-foreground">Low water</dt><dd className="font-medium">{lw}</dd></div>
      <div><dt className="text-muted-foreground">Range</dt><dd className="font-medium">{range}</dd></div>
    </dl>
  )
}

export function TidalEntryForm({ dayId, sea, isLeader, onSaved }: TidalEntryFormProps) {
  const [isPending, startTransition] = useTransition()
  const [saveError, setSaveError] = useState<string | null>(null)

  const { register, handleSubmit, control, setValue, formState: { errors } } = useForm<TidalEntryFields>({
    resolver: zodResolver(TidalEntryFieldsSchema),
    defaultValues: {
      highTide: sea?.highTide ?? "",
      lowTide: sea?.lowTide ?? "",
      tidalRangeM: sea?.tidalRangeM ?? undefined,
      referencePortName: sea?.referencePortName ?? "",
      hwTimeOffsetMinutes: sea?.hwTimeOffsetMinutes ?? undefined,
      lwTimeOffsetMinutes: sea?.lwTimeOffsetMinutes ?? undefined,
      hwHeightRatio: sea?.hwHeightRatio ?? undefined,
      lwHeightRatio: sea?.lwHeightRatio ?? undefined,
      floodDirectionDegrees: sea?.floodDirectionDegrees ?? undefined,
      ebbDirectionDegrees: sea?.ebbDirectionDegrees ?? undefined,
      maxSpringRateKnots: sea?.maxSpringRateKnots ?? undefined,
      maxNeapRateKnots: sea?.maxNeapRateKnots ?? undefined,
    },
  })

  const watched = useWatch({ control })
  const derived = deriveCorrectedTide({
    baseHighTide: watched.baseHighTide,
    baseLowTide: watched.baseLowTide,
    baseHwHeightM: watched.baseHwHeightM,
    baseLwHeightM: watched.baseLwHeightM,
    hwTimeOffsetMinutes: watched.hwTimeOffsetMinutes,
    lwTimeOffsetMinutes: watched.lwTimeOffsetMinutes,
    hwHeightRatio: watched.hwHeightRatio,
    lwHeightRatio: watched.lwHeightRatio,
  })

  function applyDerived() {
    if (derived.highTide) setValue("highTide", derived.highTide)
    if (derived.lowTide) setValue("lowTide", derived.lowTide)
    if (derived.tidalRangeM != null) setValue("tidalRangeM", derived.tidalRangeM)
  }

  const onSubmit = handleSubmit((data) => {
    setSaveError(null)
    const hasCorrection =
      !!(data.referencePortName && data.referencePortName.trim()) ||
      data.hwTimeOffsetMinutes != null ||
      data.lwTimeOffsetMinutes != null ||
      data.hwHeightRatio != null ||
      data.lwHeightRatio != null

    startTransition(async () => {
      const result = await updateDaySea(dayId, {
        highTide: timeOrUndefined(data.highTide),
        lowTide: timeOrUndefined(data.lowTide),
        tidalRangeM: data.tidalRangeM,
        referencePortName: data.referencePortName?.trim() || undefined,
        hwTimeOffsetMinutes: data.hwTimeOffsetMinutes,
        lwTimeOffsetMinutes: data.lwTimeOffsetMinutes,
        hwHeightRatio: data.hwHeightRatio,
        lwHeightRatio: data.lwHeightRatio,
        tidalSource: hasCorrection ? "manual_corrected" : "manual",
        floodDirectionDegrees: data.floodDirectionDegrees,
        ebbDirectionDegrees: data.ebbDirectionDegrees,
        maxSpringRateKnots: data.maxSpringRateKnots,
        maxNeapRateKnots: data.maxNeapRateKnots,
      })
      if (result.success) onSaved(result.data)
      else setSaveError(result.error)
    })
  })

  if (!isLeader) return <ReadOnlyTidal sea={sea} />

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
      {/* Quick entry */}
      <div className="grid grid-cols-3 gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="highTide" className="text-xs">High water</Label>
          <Input id="highTide" type="time" className="h-8" disabled={isPending} {...register("highTide")} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="lowTide" className="text-xs">Low water</Label>
          <Input id="lowTide" type="time" className="h-8" disabled={isPending} {...register("lowTide")} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="tidalRangeM" className="text-xs">Range (m)</Label>
          <Input id="tidalRangeM" type="number" step="0.1" min={0} className="h-8" disabled={isPending} {...register("tidalRangeM", numberOpts)} />
        </div>
      </div>

      {/* Port-referenced correction */}
      <Section title="Port-referenced correction">
        <div className="flex flex-col gap-1">
          <Label htmlFor="referencePortName" className="text-xs">Reference port</Label>
          <Input id="referencePortName" className="h-8" placeholder="e.g. Milford Haven" disabled={isPending} {...register("referencePortName")} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="baseHighTide" className="text-xs">Std HW time</Label>
            <Input id="baseHighTide" type="time" className="h-8" disabled={isPending} {...register("baseHighTide")} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="hwTimeOffsetMinutes" className="text-xs">HW offset (min)</Label>
            <Input id="hwTimeOffsetMinutes" type="number" step="1" className="h-8" disabled={isPending} {...register("hwTimeOffsetMinutes", numberOpts)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="baseLowTide" className="text-xs">Std LW time</Label>
            <Input id="baseLowTide" type="time" className="h-8" disabled={isPending} {...register("baseLowTide")} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="lwTimeOffsetMinutes" className="text-xs">LW offset (min)</Label>
            <Input id="lwTimeOffsetMinutes" type="number" step="1" className="h-8" disabled={isPending} {...register("lwTimeOffsetMinutes", numberOpts)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="baseHwHeightM" className="text-xs">Std HW height (m)</Label>
            <Input id="baseHwHeightM" type="number" step="0.1" min={0} className="h-8" disabled={isPending} {...register("baseHwHeightM", numberOpts)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="hwHeightRatio" className="text-xs">HW height ratio</Label>
            <Input id="hwHeightRatio" type="number" step="0.01" min={0} className="h-8" disabled={isPending} {...register("hwHeightRatio", numberOpts)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="baseLwHeightM" className="text-xs">Std LW height (m)</Label>
            <Input id="baseLwHeightM" type="number" step="0.1" min={0} className="h-8" disabled={isPending} {...register("baseLwHeightM", numberOpts)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="lwHeightRatio" className="text-xs">LW height ratio</Label>
            <Input id="lwHeightRatio" type="number" step="0.01" min={0} className="h-8" disabled={isPending} {...register("lwHeightRatio", numberOpts)} />
          </div>
        </div>
        <div className="flex items-center justify-between rounded-md bg-muted/50 px-2 py-1.5 text-xs" data-testid="derived-tide">
          <span className="text-muted-foreground">
            Derived: HW {derived.highTide ?? "—"} · LW {derived.lowTide ?? "—"} · range{" "}
            {derived.tidalRangeM != null ? `${derived.tidalRangeM} m` : "—"}
          </span>
          <Button type="button" variant="ghost" size="sm" className="h-6 text-xs" onClick={applyDerived} disabled={isPending}>
            Apply
          </Button>
        </div>
      </Section>

      {/* Stream data */}
      <Section title="Stream data (from atlas / local knowledge)">
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="floodDirectionDegrees" className="text-xs">Flood dir (°)</Label>
            <Input id="floodDirectionDegrees" type="number" step="1" min={0} max={360} className="h-8" disabled={isPending} {...register("floodDirectionDegrees", numberOpts)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="ebbDirectionDegrees" className="text-xs">Ebb dir (°)</Label>
            <Input id="ebbDirectionDegrees" type="number" step="1" min={0} max={360} className="h-8" disabled={isPending} {...register("ebbDirectionDegrees", numberOpts)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="maxSpringRateKnots" className="text-xs">Max spring (kn)</Label>
            <Input id="maxSpringRateKnots" type="number" step="0.1" min={0} className="h-8" disabled={isPending} {...register("maxSpringRateKnots", numberOpts)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="maxNeapRateKnots" className="text-xs">Max neap (kn)</Label>
            <Input id="maxNeapRateKnots" type="number" step="0.1" min={0} className="h-8" disabled={isPending} {...register("maxNeapRateKnots", numberOpts)} />
          </div>
        </div>
      </Section>

      {errors.tidalRangeM && <p className="text-xs text-destructive">{errors.tidalRangeM.message}</p>}
      {saveError && <p className="text-xs text-destructive">{saveError}</p>}

      <Button type="submit" size="sm" className="self-start" disabled={isPending}>
        {isPending ? "Saving…" : "Save tidal data"}
      </Button>
    </form>
  )
}
