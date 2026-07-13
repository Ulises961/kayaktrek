"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { LogsList } from "./logs-list"
import type { LogPage } from "@/lib/dtos/log"

interface LogsTabsProps {
  initialMine: LogPage
  initialEndorsed: LogPage
  currentUserId?: string
}

export function LogsTabs({ initialMine, initialEndorsed, currentUserId }: LogsTabsProps) {
  return (
    <Tabs defaultValue="mine">
      <TabsList>
        <TabsTrigger value="mine">My logs ({initialMine.total})</TabsTrigger>
        <TabsTrigger value="endorsed">Endorsed ({initialEndorsed.total})</TabsTrigger>
      </TabsList>

      <TabsContent value="mine" className="mt-4">
        <LogsList initial={initialMine} kind="mine" currentUserId={currentUserId} />
      </TabsContent>

      <TabsContent value="endorsed" className="mt-4">
        <LogsList initial={initialEndorsed} kind="endorsed" currentUserId={currentUserId} />
      </TabsContent>
    </Tabs>
  )
}
