import { manualSync, registerManualSync } from "../manual-sync"

describe("manualSync", () => {
  it("does nothing, and resolves, until something has registered a sync", async () => {
    registerManualSync(null)

    await expect(manualSync()).resolves.toBeUndefined()
  })

  it("runs the registered sync and waits for it", async () => {
    let finished = false
    registerManualSync(async () => {
      await Promise.resolve()
      finished = true
    })

    await manualSync()

    expect(finished).toBe(true)
  })

  it("never rejects, since the paddler's button has nothing to do with a failure but show it", async () => {
    registerManualSync(async () => {
      throw new Error("Could not reach the server.")
    })

    await expect(manualSync()).resolves.toBeUndefined()
  })
})
