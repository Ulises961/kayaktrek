import { Page } from "@playwright/test"

/**
 * Run a UI action that triggers a trip mutation and resolve only once the
 * server action's POST round-trip has completed.
 *
 * Every trip mutation is a Next.js `"use server"` action that calls
 * `revalidatePath`, so the action's POST response (identified by the
 * `Next-Action` request header) already carries the revalidated RSC payload.
 * Waiting for that response is the deterministic signal that the mutation
 * finished and the refreshed tree is on its way — regardless of backend latency.
 *
 * The response wait is armed *before* the click via `Promise.all`, so we never
 * miss a request that completes between the click and the wait, and never assert
 * against the stale, in-flight tree. This replaces the earlier
 * `waitForLoadState("networkidle")` approach, which could resolve in the
 * 500ms-quiet window *before* React's transition even dispatched the POST,
 * leaving the assertion racing the un-refreshed view (ADR-030: the residual
 * flakiness that survived the gunicorn fix).
 */
export async function mutateAndSettle(page: Page, trigger: () => Promise<void>): Promise<void> {
  await Promise.all([
    page.waitForResponse(
      (res) =>
        res.request().method() === "POST" &&
        res.request().headers()["next-action"] !== undefined,
      { timeout: 15_000 },
    ),
    trigger(),
  ])
}
