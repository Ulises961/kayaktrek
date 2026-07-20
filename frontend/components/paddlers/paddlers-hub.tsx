"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { SearchIcon } from "lucide-react"
import { Input } from "@/components/ui/input"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { BuddiesList } from "./buddies-list"
import { BlockedList } from "./blocked-list"
import { PaddlerResultCard } from "./paddler-result-card"
import { searchPaddlers } from "@/lib/connections/actions"
import { useDebouncedValue } from "@/lib/utils/debounce"
import type { Connection } from "@/lib/dtos/connection"
import type { Block } from "@/lib/dtos/block"
import type { PaddlerSearchResult } from "@/lib/dtos/paddler-search"

interface PaddlersHubProps {
  connections: Connection[]
  blocks: Block[]
  currentUserId: string
  /** Pre-fills the search field — arrives via ?q= from the crew tab's buddy picker
   * "Can't find them? Find paddlers" link on a miss. */
  initialQuery?: string
}

function matchesTerm(
  name: string | null | undefined,
  surname: string | null | undefined,
  username: string,
  term: string,
): boolean {
  const haystack = [name, surname, username].filter(Boolean).join(" ").toLowerCase()
  return haystack.includes(term.toLowerCase())
}

// The page body IS the (filterable) buddy list — Find and Buddies are merged into
// one view (M12 §N). A single search field live-filters `connections` client-side
// (no network call) and, once non-empty, also debounces a community search
// rendered beneath it. Blocked collapses into a disclosure rather than a co-equal
// tab, since it's a secondary, low-traffic concern.
export function PaddlersHub({
  connections,
  blocks,
  currentUserId,
  initialQuery = "",
}: PaddlersHubProps) {
  const [term, setTerm] = useState(initialQuery)
  const trimmedTerm = term.trim()
  const debouncedTerm = useDebouncedValue(trimmedTerm, 300)

  const [communityResults, setCommunityResults] = useState<PaddlerSearchResult[]>([])
  const [isSearching, startSearch] = useTransition()
  const latestRequest = useRef(0)

  useEffect(() => {
    const requestId = ++latestRequest.current
    startSearch(async () => {
      if (!debouncedTerm) {
        if (requestId !== latestRequest.current) return
        setCommunityResults([])
        return
      }
      const page = await searchPaddlers(debouncedTerm)
      if (requestId !== latestRequest.current) return
      setCommunityResults(page.items)
    })
  }, [debouncedTerm])

  const filteredConnections = trimmedTerm
    ? connections.filter((c) => {
        const other = c.requester.id === currentUserId ? c.addressee : c.requester
        return matchesTerm(other.name, other.surname, other.username, trimmedTerm)
      })
    : connections

  return (
    <div className="flex flex-col gap-6">
      <div className="relative max-w-sm">
        <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search your buddies…"
          className="pl-9"
          aria-label="Search paddlers"
        />
      </div>

      <BuddiesList
        connections={filteredConnections}
        currentUserId={currentUserId}
        searchTerm={trimmedTerm || undefined}
      />

      {trimmedTerm && (
        <div className="flex flex-col gap-2">
          <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Search the community for &ldquo;{trimmedTerm}&rdquo;
          </h2>
          {isSearching ? (
            <p className="text-muted-foreground text-sm">Searching…</p>
          ) : communityResults.length === 0 ? (
            <p className="text-muted-foreground text-sm">No paddlers found.</p>
          ) : (
            <div className="flex flex-col">
              {communityResults.map((paddler) => (
                <PaddlerResultCard key={paddler.id} paddler={paddler} />
              ))}
            </div>
          )}
        </div>
      )}

      <Accordion type="single" collapsible>
        <AccordionItem value="blocked" className="border-none">
          <AccordionTrigger className="text-muted-foreground w-fit gap-1.5 text-xs hover:no-underline">
            Blocked{blocks.length > 0 ? ` (${blocks.length})` : ""}
          </AccordionTrigger>
          <AccordionContent>
            <BlockedList blocks={blocks} />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  )
}
