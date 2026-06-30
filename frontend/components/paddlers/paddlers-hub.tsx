"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PaddlerFinder } from "./paddler-finder"
import { BuddiesList } from "./buddies-list"
import { BlockedList } from "./blocked-list"
import type { Connection } from "@/lib/dtos/connection"
import type { Block } from "@/lib/dtos/block"

interface PaddlersHubProps {
  connections: Connection[]
  blocks: Block[]
  currentUserId: string
}

export function PaddlersHub({ connections, blocks, currentUserId }: PaddlersHubProps) {
  const pendingIncoming = connections.filter(
    (c) => c.status === "pending" && c.addressee.id === currentUserId,
  ).length
  const buddyCount = connections.filter((c) => c.status === "accepted").length

  return (
    <Tabs defaultValue="find">
      <TabsList>
        <TabsTrigger value="find">Find</TabsTrigger>
        <TabsTrigger value="buddies">
          Buddies{buddyCount > 0 ? ` (${buddyCount})` : ""}
          {pendingIncoming > 0 && (
            <span className="bg-primary text-primary-foreground ml-1.5 rounded-full px-1.5 text-[10px] leading-4">
              {pendingIncoming}
            </span>
          )}
        </TabsTrigger>
        <TabsTrigger value="blocked">
          Blocked{blocks.length > 0 ? ` (${blocks.length})` : ""}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="find" className="mt-4">
        <PaddlerFinder />
      </TabsContent>
      <TabsContent value="buddies" className="mt-4">
        <BuddiesList connections={connections} currentUserId={currentUserId} />
      </TabsContent>
      <TabsContent value="blocked" className="mt-4">
        <BlockedList blocks={blocks} />
      </TabsContent>
    </Tabs>
  )
}
