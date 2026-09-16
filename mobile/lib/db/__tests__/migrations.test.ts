import { migrations } from "../migrations"
import { appDatabaseSchema } from "../schema"

// Real device installs already sit on old schema versions with a real local
// DB (M9c shipped weeks before this migrations file existed) — a `version`
// bump with no matching migration step throws "no such table" the moment the
// app reads from whatever the bump added. This guards the specific mismatch
// that actually happened: v4 -> v5 added four tables to schema.ts without a
// migration, so real installs never got them.
describe("migrations", () => {
  it("is valid against the current schema version", () => {
    expect(migrations.maxVersion).toBe(appDatabaseSchema.version)
  })

  it("has a migration step creating every table schema.ts added at v5", () => {
    const v5 = migrations.sortedMigrations.find((migration) => migration.toVersion === 5)
    expect(v5).toBeDefined()

    const createdTables = v5!.steps
      .filter((step) => step.type === "create_table")
      .map((step) => (step.type === "create_table" ? step.schema.name : ""))

    expect(createdTables.sort()).toEqual(
      ["cached_blocks", "cached_connections", "cached_logs", "sync_cursors"].sort(),
    )
  })
})
