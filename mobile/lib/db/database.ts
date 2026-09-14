import { Database } from "nitromelondb"
import SQLiteAdapter from "nitromelondb/adapters/sqlite"

import { modelClasses } from "./models"
import { appDatabaseSchema } from "./schema"

const adapter = new SQLiteAdapter({
  schema: appDatabaseSchema,
  dbName: "kayaktrek",
  jsi: true,
})

export const database = new Database({ adapter, modelClasses })
