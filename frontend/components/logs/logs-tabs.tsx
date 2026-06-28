"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { LogCard } from "./log-card"
import type { Log } from "@/lib/dtos/log"

interface LogsTabsProps {
  myLogs: Log[]
  endorsedLogs: Log[]
  currentUserId?: string
}

export function LogsTabs({ myLogs, endorsedLogs, currentUserId }: LogsTabsProps) {
  return (
    <Tabs defaultValue="mine">
      <TabsList>
        <TabsTrigger value="mine">My logs ({myLogs.length})</TabsTrigger>
        <TabsTrigger value="endorsed">Endorsed ({endorsedLogs.length})</TabsTrigger>
      </TabsList>

      <TabsContent value="mine" className="mt-4 flex flex-col gap-2">
        {myLogs.length === 0 ? (
          <p className="text-muted-foreground text-sm">No logs yet. Record your first session.</p>
        ) : (
          myLogs.map((log) => <LogCard key={log.id} log={log} currentUserId={currentUserId} />)
        )}
      </TabsContent>

      <TabsContent value="endorsed" className="mt-4 flex flex-col gap-2">
        {endorsedLogs.length === 0 ? (
          <p className="text-muted-foreground text-sm">No endorsed logs yet.</p>
        ) : (
          endorsedLogs.map((log) => <LogCard key={log.id} log={log} variant="endorsed" />)
        )}
      </TabsContent>
    </Tabs>
  )
}
