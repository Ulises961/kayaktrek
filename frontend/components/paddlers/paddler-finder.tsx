"use client"

import { useEffect, useState, useTransition } from "react"
import { SearchIcon } from "lucide-react"
import { Input } from "@/components/ui/input"
import { PaddlerResultCard } from "./paddler-result-card"
import { searchPaddlers } from "@/lib/connections/actions"
import { useDebouncedValue } from "@/lib/utils/debounce"
import type { PaddlerSearchResult } from "@/lib/dtos/paddler-search"

// Command-style paddler finder. Debounces the term and queries the public,
// block-filtered, relationship-annotated search endpoint. An empty term shows
// nothing (the backend never returns the whole directory).
export function PaddlerFinder() {
  const [term, setTerm] = useState("")
  const [results, setResults] = useState<PaddlerSearchResult[]>([])
  const [searched, setSearched] = useState(false)
  const [pending, startTransition] = useTransition()
  const debouncedTerm = useDebouncedValue(term.trim(), 300)

  useEffect(() => {
    startTransition(async () => {
      if (!debouncedTerm) {
        setResults([])
        setSearched(false)
        return
      }
      const page = await searchPaddlers(debouncedTerm)
      setResults(page.items)
      setSearched(true)
    })
  }, [debouncedTerm])

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <SearchIcon className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search by name or username…"
          className="pl-9"
          aria-label="Search paddlers"
        />
      </div>

      {pending && <p className="text-muted-foreground text-sm">Searching…</p>}

      {!pending && searched && results.length === 0 && (
        <p className="text-muted-foreground text-sm">No paddlers found.</p>
      )}

      {results.length > 0 && (
        <div className="flex flex-col gap-2">
          {results.map((paddler) => (
            <PaddlerResultCard key={paddler.id} paddler={paddler} />
          ))}
        </div>
      )}
    </div>
  )
}
