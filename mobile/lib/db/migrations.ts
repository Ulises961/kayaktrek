import { createTable, schemaMigrations } from "nitromelondb/Schema/migrations"

// database.ts's SQLiteAdapter never had `migrations` wired ("acceptable while
// this hasn't shipped to a real device" — schema.ts's own comment, written
// before the app was on a real device with a real local DB). It now is: a
// bare `version` bump alone does not create new tables on an existing
// database — WatermelonDB only ever runs a schema from scratch, or a
// migration, never a version-number diff — so every version bump from here on
// needs a matching step here, or every device that already has a local DB
// starts throwing "no such table" on whatever the bump added.
export const migrations = schemaMigrations({
  migrations: [
    {
      toVersion: 5,
      steps: [
        createTable({
          name: "sync_cursors",
          columns: [
            { name: "trip_id", type: "string", isIndexed: true },
            { name: "last_pulled_at", type: "number" },
          ],
        }),
        createTable({
          name: "cached_connections",
          columns: [
            { name: "status", type: "string" },
            { name: "requester_id", type: "string", isOptional: true },
            { name: "requester_username", type: "string" },
            { name: "requester_name", type: "string" },
            { name: "requester_surname", type: "string", isOptional: true },
            { name: "addressee_id", type: "string", isOptional: true },
            { name: "addressee_username", type: "string" },
            { name: "addressee_name", type: "string" },
            { name: "addressee_surname", type: "string", isOptional: true },
          ],
        }),
        createTable({
          name: "cached_blocks",
          columns: [
            { name: "blocked_id", type: "string", isOptional: true },
            { name: "blocked_username", type: "string" },
            { name: "blocked_name", type: "string" },
            { name: "blocked_surname", type: "string", isOptional: true },
          ],
        }),
        createTable({
          name: "cached_logs",
          columns: [
            { name: "kind", type: "string", isIndexed: true },
            { name: "date", type: "string", isOptional: true },
            { name: "hours", type: "number", isOptional: true },
            { name: "distance", type: "number", isOptional: true },
            { name: "avg_sea", type: "number", isOptional: true },
            { name: "endorsement_count", type: "number", isOptional: true },
          ],
        }),
      ],
    },
  ],
})
