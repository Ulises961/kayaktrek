import { useEffect } from "react"
import type { UseEmblaCarouselType } from "embla-carousel-react"

type CarouselApi = UseEmblaCarouselType[1]

export function useCarouselHour(
  api: CarouselApi,
  states: Array<{ time?: string | null }>,
  selectedHour: number | null,
  onHourChange: (hour: number) => void,
) {
  // Sync carousel to external selectedHour changes
  useEffect(() => {
    if (!api || states.length === 0 || selectedHour === null) return

    const targetIndex = states.findIndex((s) => {
      const hour = parseInt(s.time.split(":")[0], 10)
      return hour === selectedHour
    })

    if (targetIndex >= 0) {
      api.scrollSnapList().forEach((_, index) => {
        if (index === targetIndex) {
          api.scrollTo(index, false)
        }
      })
    }
  }, [api, states, selectedHour])

  // Listen for carousel changes and report back
  useEffect(() => {
    if (!api || states.length === 0) return

    const onSelect = () => {
      const selectedIndex = api.selectedScrollSnap()
      const selectedState = states[selectedIndex]
      if (selectedState) {
        const hour = parseInt(selectedState.time.split(":")[0], 10)
        onHourChange(hour)
      }
    }

    api.on("select", onSelect)
    api.on("reInit", onSelect)

    return () => {
      api.off("select", onSelect)
      api.off("reInit", onSelect)
    }
  }, [api, states, onHourChange])
}
