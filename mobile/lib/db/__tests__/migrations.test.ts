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

  it("has a migration step creating cached_requirements at v6", () => {
    const v6 = migrations.sortedMigrations.find((migration) => migration.toVersion === 6)
    expect(v6).toBeDefined()

    const createdTables = v6!.steps
      .filter((step) => step.type === "create_table")
      .map((step) => (step.type === "create_table" ? step.schema.name : ""))

    expect(createdTables).toEqual(["cached_requirements"])
  })

  // Both kit tables land in ONE version bump on purpose: every bump is a
  // chance for a device to end up stamped at a version whose migration step
  // was still being written, which has already cost one `adb shell pm clear`.
  it("has migration steps creating both gear and kit tables at v7", () => {
    const v7 = migrations.sortedMigrations.find((migration) => migration.toVersion === 7)
    expect(v7).toBeDefined()

    const createdTables = v7!.steps
      .filter((step) => step.type === "create_table")
      .map((step) => (step.type === "create_table" ? step.schema.name : ""))

    expect(createdTables.sort()).toEqual(["cached_gear", "cached_packing_items"].sort())
  })

  it("has a migration step creating cache_freshness at v8", () => {
    const v8 = migrations.sortedMigrations.find((migration) => migration.toVersion === 8)
    expect(v8).toBeDefined()

    const createdTables = v8!.steps
      .filter((step) => step.type === "create_table")
      .map((step) => (step.type === "create_table" ? step.schema.name : ""))

    expect(createdTables).toEqual(["cache_freshness"])
  })

  it("adds the Gear screen's two columns at v9", () => {
    const v9 = migrations.sortedMigrations.find((migration) => migration.toVersion === 9)
    expect(v9).toBeDefined()

    const added = v9!.steps
      .filter((step) => step.type === "add_columns")
      .flatMap((step) => (step.type === "add_columns" ? step.columns.map((c) => c.name) : []))

    expect(added.sort()).toEqual(["category_name", "default_pack"])
  })

  // The guard that would have caught the original v4 -> v5 miss, stated once
  // for every version rather than as one test per bump.
  it("has a migration for every version schema.ts has reached", () => {
    const covered = migrations.sortedMigrations.map((migration) => migration.toVersion).sort()
    const expected = Array.from(
      { length: appDatabaseSchema.version - 4 },
      (_unused, index) => index + 5,
    )

    expect(covered).toEqual(expected)
  })

  // Stronger than the version check above, which only proves *a* migration
  // exists at each version — not that it creates the table the bump actually
  // added. A bump carrying a migration for the wrong table would pass that
  // test and still throw "no such table" on every already-installed device.
  it("can build every table in the schema from the v4 baseline plus migrations", () => {
    // The tables that predate migrations.ts — anything installed before v5 got
    // these from a from-scratch schema build, so no migration step creates them.
    const v4Baseline = [
      "trips",
      "days",
      "route_meta",
      "points",
      "trip_members",
      "requirement_contributions",
      "weather",
      "weather_states",
      "sea",
      "sea_states",
    ]
    const migrated = migrations.sortedMigrations.flatMap((migration) =>
      migration.steps
        .filter((step) => step.type === "create_table")
        .map((step) => (step.type === "create_table" ? step.schema.name : "")),
    )

    expect([...v4Baseline, ...migrated].sort()).toEqual(Object.keys(appDatabaseSchema.tables).sort())
  })
})
