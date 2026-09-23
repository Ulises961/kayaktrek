import { Model } from "nitromelondb"
import { field } from "nitromelondb/decorators"

export class CachedProfileEntry extends Model {
  static table = "cached_profile"

  @field("kind") kind!: string
  @field("payload") payload!: string
}
