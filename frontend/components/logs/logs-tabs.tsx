"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { LogCard } from "./log-card"
import type { Log } from "@/lib/dtos/log"

interface LogsTabsProps {
  myLogs: Log[]
  endorsedLogs: Log[]
}

export function LogsTabs({ myLogs, endorsedLogs }: LogsTabsProps) {
  return (
    <Tabs defaultValue="mine">
      <TabsList>
        <TabsTrigger value="mine">My logs ({myLogs.length})</TabsTrigger>
        <TabsTrigger value="endorsed">Endorsed ({endorsedLogs.length})</TabsTrigger>
      </TabsList>

      <TabsContent value="mine" className="flex flex-col gap-2 mt-4">
        {myLogs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No logs yet. Record your first session.</p>
        ) : (
          myLogs.map((log) => <LogCard key={log.id} log={log} />)
        )}
      </TabsContent>

      <TabsContent value="endorsed" className="flex flex-col gap-2 mt-4">
        {endorsedLogs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No endorsed logs yet.</p>
        ) : (
          endorsedLogs.map((log) => <LogCard key={log.id} log={log} />)
        )}
      </TabsContent>
    </Tabs>
  )
}
