import type { Database } from "nitromelondb"

import type { Block } from "@shared/dtos/block"
import type { Connection } from "@shared/dtos/connection"

import { CACHE_KEY, markCacheFresh } from "./cache-freshness"
import { database as productionDatabase } from "./database"
import { CachedBlock, CachedConnection } from "./models"

export async function saveConnectionsCache(
  connections: Connection[],
  database: Database = productionDatabase,
): Promise<void> {
  const collection = database.collections.get<CachedConnection>("cached_connections")
  await database.write(async () => {
    const stale = await collection.query().fetch()
    await database.batch(...stale.map((row) => row.prepareDestroyPermanently()))
    await database.batch(
      ...connections
        .filter((connection): connection is Connection & { id: string } => Boolean(connection.id))
        .map((connection) =>
          collection.prepareCreateFromDirtyRaw({
            id: connection.id,
            status: connection.status,
            requester_id: connection.requester.id ?? null,
            requester_username: connection.requester.username,
            requester_name: connection.requester.name,
            requester_surname: connection.requester.surname ?? null,
            addressee_id: connection.addressee.id ?? null,
            addressee_username: connection.addressee.username,
            addressee_name: connection.addressee.name,
            addressee_surname: connection.addressee.surname ?? null,
          }),
        ),
    )
  })
  await markCacheFresh(CACHE_KEY.connections, database)
}

export async function loadConnectionsCache(database: Database = productionDatabase): Promise<Connection[]> {
  const collection = database.collections.get<CachedConnection>("cached_connections")
  const rows = await collection.query().fetch()
  return rows.map((row) => ({
    id: row.id,
    status: row.status as Connection["status"],
    requester: {
      id: row.requesterId ?? undefined,
      username: row.requesterUsername,
      name: row.requesterName,
      surname: row.requesterSurname,
    },
    addressee: {
      id: row.addresseeId ?? undefined,
      username: row.addresseeUsername,
      name: row.addresseeName,
      surname: row.addresseeSurname,
    },
  }))
}

export async function saveBlocksCache(blocks: Block[], database: Database = productionDatabase): Promise<void> {
  const collection = database.collections.get<CachedBlock>("cached_blocks")
  await database.write(async () => {
    const stale = await collection.query().fetch()
    await database.batch(...stale.map((row) => row.prepareDestroyPermanently()))
    await database.batch(
      ...blocks
        .filter((block): block is Block & { id: string } => Boolean(block.id))
        .map((block) =>
          collection.prepareCreateFromDirtyRaw({
            id: block.id,
            blocked_id: block.blocked.id ?? null,
            blocked_username: block.blocked.username,
            blocked_name: block.blocked.name,
            blocked_surname: block.blocked.surname ?? null,
          }),
        ),
    )
  })
  await markCacheFresh(CACHE_KEY.blocks, database)
}

export async function loadBlocksCache(database: Database = productionDatabase): Promise<Block[]> {
  const collection = database.collections.get<CachedBlock>("cached_blocks")
  const rows = await collection.query().fetch()
  return rows.map((row) => ({
    id: row.id,
    blocked: {
      id: row.blockedId ?? undefined,
      username: row.blockedUsername,
      name: row.blockedName,
      surname: row.blockedSurname,
    },
  }))
}
