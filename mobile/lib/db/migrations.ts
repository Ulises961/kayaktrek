import { addColumns, createTable, schemaMigrations } from "nitromelondb/Schema/migrations"

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
    {
      toVersion: 6,
      steps: [
        createTable({
          name: "cached_requirements",
          columns: [
            { name: "trip_id", type: "string", isIndexed: true },
            { name: "name", type: "string" },
            { name: "status", type: "string", isOptional: true },
          ],
        }),
      ],
    },
    {
      // Both kit tables in ONE bump on purpose. Every version bump is a window
      // in which a device can end up stamped at a version whose migration step
      // was still being written — WatermelonDB never re-runs a migration once
      // its target version is recorded, so such a device never picks the step
      // up, even after the code catches up. That cost one `adb shell pm clear`
      // already; batching related tables into a single bump narrows the window.
      toVersion: 7,
      steps: [
        createTable({
          name: "cached_gear",
          columns: [
            { name: "name", type: "string" },
            { name: "status", type: "string", isOptional: true },
          ],
        }),
        createTable({
          name: "cached_packing_items",
          columns: [
            { name: "trip_id", type: "string", isIndexed: true },
            { name: "item_id", type: "string", isOptional: true },
            { name: "item_name", type: "string" },
            { name: "checked", type: "boolean", isOptional: true },
          ],
        }),
      ],
    },
    {
      // M9c WP7's age indicator. One table serving every cached surface, so
      // this is a single bump rather than one per surface — the same batching
      // argument as v7 above.
      toVersion: 8,
      steps: [
        createTable({
          name: "cache_freshness",
          columns: [
            { name: "key", type: "string", isIndexed: true },
            { name: "cached_at", type: "number" },
          ],
        }),
      ],
    },
    {
      // M30 WP5's Gear screen became a second offline reader of `cached_gear`,
      // and needs two fields the original cache dropped as having no reader.
      // Both nullable, so existing rows survive the migration and simply read
      // as unfiled/not-default until the next sweep refills them.
      toVersion: 9,
      steps: [
        addColumns({
          table: "cached_gear",
          columns: [
            { name: "category_name", type: "string", isOptional: true },
            { name: "default_pack", type: "boolean", isOptional: true },
          ],
        }),
      ],
    },
    {
      // Logistics — travel documents and shuttle vehicles — had no cache, so
      // the screen showed nothing offline. A new table, so existing installs
      // lose nothing and simply fill it on the next sweep.
      toVersion: 10,
      steps: [
        createTable({
          name: "cached_logistics",
          columns: [
            { name: "trip_id", type: "string", isIndexed: true },
            { name: "kind", type: "string" },
            { name: "position", type: "number" },
            { name: "payload", type: "string" },
          ],
        }),
      ],
    },
    {
      // Tier 4 — the paddler's own profile and log stats. Profile, Settings
      // and the drawer header had no cache. A new table, like v10.
      toVersion: 11,
      steps: [
        createTable({
          name: "cached_profile",
          columns: [
            { name: "kind", type: "string", isIndexed: true },
            { name: "payload", type: "string" },
          ],
        }),
      ],
    },
  ],
})
