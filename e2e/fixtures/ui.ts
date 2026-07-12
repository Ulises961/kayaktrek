import { Page } from "@playwright/test"

interface MutateOptions {
  /**
   * Set when the assertion needs the *server-rendered* post-mutation view: the
   * page is reloaded after the action POST completes.
   *
   * Why a reload and not waiting for the `router.refresh()` RSC GET (the
   * pre-2026-07 behaviour of this option, then named `refresh`): on Next
   * 16.2.10 the client router intermittently drops the apply of a *streamed*
   * action/refresh response on large pages (~50% on the trip-detail tree in
   * this repo, reproduced outside Playwright; buffered delivery of the same
   * bytes always applies). The server is provably fresh — revalidation runs
   * and the response body contains the new data — so reloading renders the
   * correct view deterministically. Revisit when a Next release fixes the
   * streamed-apply drop; the repro lives in the 2026-07-10 e2e-alignment
   * notes (docs/reviews/2026-07-10-e2e-alignment.md).
   *
   * NOTE: a reload resets client-only state (open dialogs, accordion sections
   * expanded via click) — the trip-detail tabs are real route segments now
   * (M12 §R), so a reload naturally lands back on whichever segment the spec
   * navigated to; no URL bookkeeping needed for that specifically.
   *
   * Leave unset for revalidate-only flows asserted against the action
   * response itself (the refreshed RSC streams back *inside* the action POST
   * response); those assertions tolerate the occasional dropped apply only
   * because their specs re-assert within the expect timeout on small trees —
   * if one starts flapping, switch it to `reload: true`.
   */
  reload?: boolean
}

/**
 * Run a UI action that triggers a trip mutation and resolve only once the
 * mutation has reached the server.
 *
 * Every trip/inventory mutation is a Next.js `"use server"` action, so the
 * helper arms a wait for the action POST (identified by the `Next-Action`
 * request header) *before* the click via `Promise.all` — we never miss a
 * request that completes between the click and the wait. This replaces the
 * earlier `waitForLoadState("networkidle")` approach, which could resolve in
 * the 500ms-quiet window *before* React's transition even dispatched the POST
 * (ADR-030: the residual flakiness that survived the gunicorn fix).
 *
 * With `reload: true` the page is additionally reloaded once the POST has
 * resolved, so the following assertions read a fresh server render instead of
 * racing the client router's apply of the streamed action response (broken on
 * Next 16.2.10 — see MutateOptions.reload).
 */
export async function mutateAndSettle(
  page: Page,
  trigger: () => Promise<void>,
  options: MutateOptions = {},
): Promise<void> {
  const [actionResponse] = await Promise.all([
    page.waitForResponse(
      (res) =>
        res.request().method() === "POST" &&
        res.request().headers()["next-action"] !== undefined,
      { timeout: 30_000 },
    ),
    trigger(),
  ])
  // waitForResponse resolves on response HEADERS, but a server action STREAMS its
  // body — reloading at headers-time can interrupt the action mid-flight and race
  // a page render against the not-yet-committed mutation (observed: the buddy
  // invite's reload rendering the pre-invite trip). So wait for the body — but
  // bounded: when Next 16.2's router drops the apply of a streamed action response
  // (see MutateOptions.reload), it abandons the stream unconsumed and finished()
  // never resolves (observed: every reload-settled spec hanging to test timeout).
  // The grace period only needs to cover headers→commit — the action function
  // (and its backend mutation) has run to completion before any revalidated-tree
  // bytes stream — not the full body.
  try {
    await Promise.race([
      // body() resolves only once the FULL body arrived — unlike finished(), it
      // REJECTS when the router aborted the stream, letting us tell "action done"
      // from "action still executing server-side after a dropped apply".
      actionResponse.body(),
      new Promise((resolve) => setTimeout(resolve, 5_000)),
    ])
  } catch {
    // Aborted mid-stream: the server keeps executing the action after the client
    // drops it — give the mutation the full grace window to commit before any
    // reload reads the backend.
    await page.waitForTimeout(5_000)
  }

  if (options.reload) {
    await page.reload()
  }
}
