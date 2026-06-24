import { Page } from "@playwright/test"

interface MutateOptions {
  /**
   * Set when the triggering component calls `router.refresh()` *after* the
   * server action resolves. That refresh issues a **separate** RSC `GET` for
   * the current route which the action-POST wait below does not cover — so the
   * assertion would otherwise race the un-applied refresh. When `true`, we also
   * await that trailing RSC `GET` before resolving.
   *
   * Leave unset for revalidate-only flows (the action calls `revalidatePath`
   * and the refreshed RSC is streamed back *inside* the action POST response,
   * so there is no trailing GET to wait for — waiting for one would hang).
   */
  refresh?: boolean
}

/**
 * Run a UI action that triggers a trip mutation and resolve only once the
 * refreshed RSC tree is on its way to the client.
 *
 * Every trip/inventory mutation is a Next.js `"use server"` action. Two refresh
 * shapes exist and this helper covers both:
 *
 *  1. **revalidate-only** — the action calls `revalidatePath`; Next streams the
 *     re-rendered RSC back *in the action POST response* (identified by the
 *     `Next-Action` request header). Awaiting that POST is sufficient.
 *  2. **client refresh** — the component additionally calls `router.refresh()`
 *     once the action resolves, which fires a *separate* RSC `GET` for the
 *     current route. Pass `{ refresh: true }` so we also await that GET.
 *
 * All waits are armed *before* the click via `Promise.all`, so we never miss a
 * request that completes between the click and the wait, and never assert
 * against the stale, in-flight tree. This replaces the earlier
 * `waitForLoadState("networkidle")` approach, which could resolve in the
 * 500ms-quiet window *before* React's transition even dispatched the POST,
 * leaving the assertion racing the un-refreshed view (ADR-030: the residual
 * flakiness that survived the gunicorn fix).
 */
export async function mutateAndSettle(
  page: Page,
  trigger: () => Promise<void>,
  options: MutateOptions = {},
): Promise<void> {
  const waits: Promise<unknown>[] = [
    page.waitForResponse(
      (res) =>
        res.request().method() === "POST" &&
        res.request().headers()["next-action"] !== undefined,
      { timeout: 30_000 },
    ),
  ]

  if (options.refresh) {
    waits.push(
      page.waitForResponse(
        (res) =>
          res.request().method() === "GET" &&
          res.request().headers()["rsc"] === "1" &&
          // Exclude route prefetches (hover/viewport) — they also carry `RSC: 1`
          // but are not the refresh we triggered, and would resolve the wait early.
          res.request().headers()["next-router-prefetch"] === undefined,
        { timeout: 30_000 },
      ),
    )
  }

  await Promise.all([...waits, trigger()])
}
