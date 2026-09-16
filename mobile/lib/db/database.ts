import { Database } from "nitromelondb"
import SQLiteAdapter from "nitromelondb/adapters/sqlite"

import { migrations } from "./migrations"
import { modelClasses } from "./models"
import { appDatabaseSchema } from "./schema"

const adapter = new SQLiteAdapter({
  schema: appDatabaseSchema,
  migrations,
  dbName: "kayaktrek",
  jsi: true,
})

export const database = new Database({ adapter, modelClasses })
