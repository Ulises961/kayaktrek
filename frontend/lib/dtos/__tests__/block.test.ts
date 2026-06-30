import { describe, it, expect } from "vitest"
import { BlockSchema } from "../block"

const BLOCK_FIXTURE = {
  id: "01952f1a-0000-7000-8000-0000000000bb",
  created: "2026-06-28T10:00:00",
  blocked: {
    id: "01952f1a-0000-7000-8000-000000000002",
    username: "bob",
    name: "Bob",
    surname: null,
    avatarUrl: null,
  },
}

describe("BlockSchema", () => {
  it("parses a block fixture", () => {
    expect(BlockSchema.safeParse(BLOCK_FIXTURE).success).toBe(true)
  })

  it("requires the blocked party", () => {
    const { blocked: _blocked, ...withoutBlocked } = BLOCK_FIXTURE
    void _blocked
    expect(BlockSchema.safeParse(withoutBlocked).success).toBe(false)
  })
})
