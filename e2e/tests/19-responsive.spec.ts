import { test, expect, type Page } from "@playwright/test"
import { API_URL } from "../playwright.config"
import { LEADER } from "../fixtures/auth"
import {
  apiGetAccessToken,
  apiCreateTrip,
  apiDeleteTrip,
  apiTransitionState,
  apiSetShoreContact,
  apiSetVessel,
} from "../fixtures/trips"
import { apiCreateLog, apiClearLogs } from "../fixtures/connections"
import {
  apiSeedEditableItinerary,
  apiSeedPublicItinerary,
  apiDeleteItinerary,
  type EditablePointSpec,
  type SeededRoute,
} from "../fixtures/itinerary"

// M18 §1 — the responsive canary.
//
// One assertion, every route: the page must not scroll horizontally. That turns
// "is the app responsive" from a judgement call into a pass/fail check, and it
// keeps working for free on every route added after this milestone.
//
// It runs in the `mobile-320` project (playwright.config.ts), which supplies the
// 320px viewport and the leader storageState. 320 is M18's floor and sits below
// Tailwind's smallest breakpoint (sm, 640), so base styles ARE the phone styles;
// 640 is checked as the first step up, where rules that were given a `md:` but
// skipped `sm:` show themselves.
//
// Two things this deliberately does NOT do:
//
// - It does not assert the map builder is usable. That surface fails by silent
//   collapse, not overflow: `map-builder.tsx` lays 368px of fixed panes against
//   the viewport and the map, being `min-w-0 flex-1`, shrinks to nothing rather
//   than pushing the page wide. Nothing here would catch it. §4 adds an explicit
//   "the map has a usable width" assertion instead.
// - It does not police overflow *inside* a scroll container nested below the
//   measured root. A wide table or a nav strip in its own `overflow-x: auto` is
//   correct — the rule is that the page's scrolling root must not scroll
//   sideways, not that nothing may ever be wider than the viewport. The offender
//   walk below skips anything living inside a nested scroller.
//
// On authenticated routes the measured root is `main`, not the document, because
// the `(app)` shell gives `main` `overflow-auto` for its vertical scroll and that
// covers both axes — see `measureOverflow`.

// Playwright's touchscreen can tap but not drag, so a touch drag goes through CDP.
// Worth the ceremony: `.click()` dispatches MOUSE events even in a touch-enabled
// project, so every assertion in this file before 2026-08-21 was made with a
// mouse — and both bugs the tests below cover only appear under a real finger.
async function touchDrag(page: Page, x: number, fromY: number, toY: number, steps = 14) {
  const cdp = await page.context().newCDPSession(page)
  const at = (y: number) => [{ x, y, radiusX: 10, radiusY: 10, force: 1 }]
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: at(fromY),
  })
  for (let i = 1; i <= steps; i++) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: at(fromY + ((toY - fromY) * i) / steps),
    })
    await page.waitForTimeout(16)
  }
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  })
  await cdp.detach()
}

const WIDTHS = [320, 640] as const

// Static routes only — anything needing a seeded trip/itinerary id belongs in the
// phase that fixes that surface, where the fixture already exists.
const ANONYMOUS_ROUTES = [
  "/",
  "/login",
  "/register",
  "/terms",
  "/forgot-password",
  "/resend-verification",
]

const AUTHENTICATED_ROUTES = [
  "/dashboard",
  "/trips",
  "/logs",
  "/paddlers",
  "/profile",
  "/profile/edit",
  "/settings",
  "/settings/change-password",
  "/explore",
  "/invitations",
  "/gear",
  "/gear/templates",
  "/itinerary",
]

type Offender = { tag: string; cls: string; width: number; right: number }

/**
 * Horizontal overflow of the page's scrolling root, plus the innermost elements
 * responsible for it.
 *
 * The scrolling root is `main` when the app shell is present, and the document
 * otherwise. That distinction is the whole assertion on authenticated routes:
 * `app/(app)/layout.tsx` gives `main` `overflow-auto` so the content area scrolls
 * under a fixed sidebar, and `overflow-auto` sets *both* axes — so content wider
 * than the viewport scrolls `main` and leaves `documentElement.scrollWidth` equal
 * to its `clientWidth`. Measuring the document alone therefore cannot fail on any
 * `(app)` route, whatever the page does.
 *
 * `main` is named explicitly rather than inferred from computed style, because a
 * deliberate horizontal scroller (a wide table, a nav strip) reports the same
 * `overflow-x: auto` and those are legitimate. The rule is that the shell's own
 * content area must never scroll sideways; anything nested inside its own
 * scroller still may.
 *
 * The offender list is what makes a failure actionable: `scrollWidth` alone says
 * "something is too wide", which is the same information for all 20 routes. The
 * walk keeps only elements that contain no other offender (a parent is wide
 * *because* its child is) and skips anything inside a scroll container nested
 * below the root.
 */
async function measureOverflow(page: Page): Promise<{ overflow: number; offenders: Offender[] }> {
  return page.evaluate(() => {
    const shell = document.querySelector("main")
    const root: Element = shell ?? document.documentElement
    const overflow = root.scrollWidth - root.clientWidth
    if (overflow <= 0) return { overflow, offenders: [] }

    const limit = root.getBoundingClientRect().right
    const insideScroller = (el: Element): boolean => {
      let node = el.parentElement
      while (node && node !== document.body && node !== root) {
        const overflowX = getComputedStyle(node).overflowX
        if (overflowX === "auto" || overflowX === "scroll" || overflowX === "hidden") return true
        node = node.parentElement
      }
      return false
    }

    const wide = Array.from(document.body.querySelectorAll("*")).filter((el) => {
      const rect = el.getBoundingClientRect()
      // A 1px tolerance absorbs sub-pixel layout rounding, which is not a bug.
      return rect.width > 0 && rect.right > limit + 1 && !insideScroller(el)
    })

    const innermost = wide.filter((el) => !wide.some((other) => other !== el && el.contains(other)))

    return {
      overflow,
      offenders: innermost.slice(0, 6).map((el) => {
        const rect = el.getBoundingClientRect()
        return {
          tag: el.tagName.toLowerCase(),
          cls: (el.getAttribute("class") ?? "").slice(0, 120),
          width: Math.round(rect.width),
          right: Math.round(rect.right),
        }
      }),
    }
  })
}

function describeFailure(
  route: string,
  width: number,
  result: Awaited<ReturnType<typeof measureOverflow>>,
) {
  const lines = result.offenders.map(
    (o) => `    <${o.tag} class="${o.cls}"> w=${o.width} right=${o.right}`,
  )
  return [
    `${route} overflows by ${result.overflow}px at ${width}px wide.`,
    result.offenders.length
      ? "  Innermost elements past the viewport edge:"
      : "  (no element identified — check a fixed width on a layout wrapper)",
    ...lines,
  ].join("\n")
}

async function expectNoHorizontalScroll(page: Page, route: string, width: number) {
  await page.setViewportSize({ width, height: 640 })
  await page.goto(route)
  // The canary reads layout, so it must not race the first paint. domcontentloaded
  // is not enough — a client-rendered panel that arrives late can be the offender.
  await page.waitForLoadState("networkidle")

  // Prove we are measuring the page we asked for. Without this the whole spec is
  // self-deceiving: an expired storageState redirects every authenticated route to
  // /login, which is a narrow centred card that cannot overflow, so all 13 of them
  // "pass" while measuring the same login form thirteen times. The first full run of
  // this spec did exactly that and came back 36/36 green.
  expect(
    new URL(page.url()).pathname,
    `${route} redirected to ${new URL(page.url()).pathname} — nothing was measured. ` +
      `If this is /login the auth state is stale; run with the setup project.`,
  ).toBe(route)

  const result = await measureOverflow(page)
  expect(result.overflow, describeFailure(route, width, result)).toBeLessThanOrEqual(0)
}

test.describe("Responsive — anonymous routes", () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  for (const route of ANONYMOUS_ROUTES) {
    for (const width of WIDTHS) {
      test(`${route} does not scroll horizontally at ${width}px`, async ({ page }) => {
        await expectNoHorizontalScroll(page, route, width)
      })
    }
  }
})

test.describe("Responsive — authenticated routes", () => {
  for (const route of AUTHENTICATED_ROUTES) {
    for (const width of WIDTHS) {
      test(`${route} does not scroll horizontally at ${width}px`, async ({ page }) => {
        await expectNoHorizontalScroll(page, route, width)
      })
    }
  }
})

test.describe("Responsive — the log card's actions", () => {
  // The card's edit/delete controls change *place*, not just size: from `sm` they
  // ride at the end of the metrics line, and at base they drop into a section of
  // their own beneath it. Both halves are asserted here because neither is
  // reachable from a unit test — jsdom resolves no media queries and measures
  // every box as zero — and because the layout is a single flex container that
  // reflows, so getting one breakpoint right is no evidence about the other.
  //
  // The log is created and removed through the UI: /logs has no seeded fixture,
  // and a card is the thing under test, so there has to be one on screen.
  //
  // An unusual hours value is what identifies it afterwards. The card renders
  // date, hours, distance and sea state and nothing else — notes are not on it —
  // so there is no free-text handle to tag the row with. It has to be a multiple
  // of 0.5: the field carries `step="0.5"`, and a value off the step is refused by
  // native constraint validation, which blocks the submit without a word.
  const HOURS = "6.5"

  test("ride with the metrics from sm, and drop below them at base", async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 900 })
    await page.goto("/logs")
    await page.waitForLoadState("networkidle")

    await page.getByRole("button", { name: "New log" }).click()
    const dialog = page.getByRole("dialog", { name: "New log" })
    // No date: it is optional (`LogFieldsSchema`) and its control is a popover
    // calendar, which is a lot of interaction to buy a field this test never reads.
    const hours = dialog.getByLabel("Hours paddled")
    await hours.fill(HOURS)
    // React must have taken the value before the submit: a `fill` immediately
    // followed by a click can outrun the controlled input's state update, and the
    // submit then no-ops with nothing to tell you why.
    await expect(hours).toHaveValue(HOURS)
    await dialog.getByLabel("Notes").fill("responsive layout probe")
    await dialog.getByRole("button", { name: "Create log" }).click()
    // The dialog closes from the action's own success branch, so this is the
    // mutation landing rather than a guess at how long it takes. The reload then
    // gets the list from the server: Next 16.2.10 drops the apply of a streamed
    // action response often enough that the new card otherwise never appears
    // (the root conventions doc, E2E section).
    await expect(dialog).toBeHidden()
    await page.reload()

    const card = page
      .locator('[data-slot="card"]')
      .filter({ hasText: `${HOURS}h` })
      .first()
    const metrics = card.getByText(`${HOURS}h`)
    const edit = card.getByRole("button", { name: "Edit log" })
    await expect(edit).toBeVisible()

    const onSameLine = async () => {
      const [metricsBox, editBox] = await Promise.all([metrics.boundingBox(), edit.boundingBox()])
      if (!metricsBox || !editBox) throw new Error("card is not laid out")
      const metricsMiddle = metricsBox.y + metricsBox.height / 2
      return {
        sameLine: metricsMiddle > editBox.y && metricsMiddle < editBox.y + editBox.height,
        below: editBox.y >= metricsBox.y + metricsBox.height,
        boxes: `metrics y=${Math.round(metricsBox.y)} h=${Math.round(metricsBox.height)}, edit y=${Math.round(editBox.y)} h=${Math.round(editBox.height)}`,
      }
    }

    const wide = await onSameLine()
    expect(
      wide.sameLine,
      `at 640 the edit button should sit on the metrics line — ${wide.boxes}`,
    ).toBe(true)

    await page.setViewportSize({ width: 320, height: 900 })
    const narrow = await onSameLine()
    expect(
      narrow.below,
      `at 320 the edit button should sit below the metrics — ${narrow.boxes}`,
    ).toBe(true)

    await card.getByRole("button", { name: "Delete log" }).click()
    const confirm = page.getByRole("alertdialog")
    await confirm.getByRole("button", { name: "Delete" }).click()
    await expect(confirm).toBeHidden()
    await page.reload()
    await expect(card).toBeHidden()
  })
})

test.describe("Responsive — touch targets", () => {
  // M18 §6: a 44px hit box on coarse pointers, with the control's visual size left
  // alone. Asserted on the rendered pseudo-element and then on a real hit test just
  // outside the button's own box, because the computed style only proves the rule
  // matched — it says nothing about whether the area it draws is reachable.
  test("a header icon button reaches 44px without growing", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 })
    await page.goto("/dashboard")
    await page.waitForLoadState("networkidle")

    const button = page.getByRole("button", { name: "Account menu" })
    const box = await button.boundingBox()
    if (!box) throw new Error("the account button is not laid out")

    const hitBox = await button.evaluate((el) => {
      const style = getComputedStyle(el, "::before")
      return {
        width: style.width,
        height: style.height,
        // Reported so a failure distinguishes "the rule is wrong" from "this
        // browser context is not a touch device", which are unrelated problems.
        coarse: matchMedia("(pointer: coarse)").matches,
        noHover: matchMedia("(hover: none)").matches,
      }
    })
    expect(
      { width: hitBox.width, height: hitBox.height },
      `hit box is ${hitBox.width}×${hitBox.height} (pointer:coarse=${hitBox.coarse}, hover:none=${hitBox.noHover})`,
    ).toEqual({ width: "44px", height: "44px" })

    // Unchanged on screen: `size="icon"` is `size-9`, which is 40.5px at the 112.5%
    // root — so the box must still measure itself, not the 44 the finger gets.
    expect(Math.round(box.height), `button rendered ${box.height}px tall`).toBeLessThan(44)

    // A tap just past the visual edge still belongs to the button. Compared against
    // the element itself rather than a `data-slot` query: this button is wrapped in
    // a Radix `asChild` trigger, which overwrites the slot `button.tsx` sets.
    const reached = await button.evaluate(
      (el, point) => {
        const hit = document.elementFromPoint(point.x, point.y)
        return !!hit && (hit === el || el.contains(hit))
      },
      { x: box.x + box.width / 2, y: box.y + box.height + 1 },
    )
    expect(reached, "a tap 1px below the button's visual edge missed it").toBe(true)
  })
})

test.describe("Responsive — control labels", () => {
  // Controls that keep their icon and drop their wording on a phone use `sr-only
  // sm:not-sr-only`, so the label leaves the *layout* without leaving the
  // accessibility tree. That distinction is the whole point of the pattern and it
  // is invisible in the class name alone — `hidden sm:inline` reads almost the
  // same and takes the name away with it. Measured, therefore, not grepped.
  test("Import GPX shows its icon alone at 320 and its label from sm", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 })
    await page.goto("/itinerary")
    await page.waitForLoadState("networkidle")

    const button = page.getByRole("button", { name: "Import GPX" })
    await expect(button).toBeVisible()
    const label = button.getByText("Import GPX")

    // sr-only collapses the label to a clipped 1px box: off the layout, still named.
    const narrow = await label.boundingBox()
    expect(
      narrow?.width ?? 0,
      `label still occupies ${narrow?.width}px at 320`,
    ).toBeLessThanOrEqual(1)

    await page.setViewportSize({ width: 640, height: 640 })
    const wide = await label.boundingBox()
    expect(wide?.width ?? 0, `label is only ${wide?.width}px wide at 640`).toBeGreaterThan(20)
  })
})

test.describe("Overlays over a map", () => {
  // Leaflet's panes are positioned and z-indexed into the hundreds, and a map is
  // not inside a stacking context that contains them, so every floating surface
  // the app owns has to clear them explicitly. The app chrome and the nav drawer
  // each had to learn this separately; this asserts it for the menu layer, which
  // is the one that appears on a map route without any backdrop of its own.
  //
  // /explore is the cheapest map route to check it on: anonymous, no fixture, and
  // the account menu is in the header of every `(app)` page including this one.
  test("the account menu paints above the tiles on /explore", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 })
    await page.goto("/explore")
    await page.waitForLoadState("networkidle")
    // `.first()`: the page carries several maps — the discovery map plus a route
    // thumbnail per result. The z-index scan below reads all of them.
    await expect(page.locator(".leaflet-container").first()).toBeVisible()

    await page.getByRole("button", { name: "Account menu" }).click()
    const menu = page.locator('[data-slot="dropdown-menu-content"]')
    await expect(menu).toBeVisible()

    // Compared against the map rather than against a fixed number: what matters
    // is the order, and Leaflet's pane values are its business, not ours.
    const stacking = await menu.evaluate((el) => {
      const panes = Array.from(document.querySelectorAll(".leaflet-pane, .leaflet-container"))
      return {
        menu: Number(getComputedStyle(el).zIndex),
        map: Math.max(...panes.map((pane) => Number(getComputedStyle(pane).zIndex) || 0)),
      }
    })
    expect(
      stacking.menu,
      `account menu z-index ${stacking.menu} vs the map's ${stacking.map} — the tiles paint over it.`,
    ).toBeGreaterThan(stacking.map)

    await menu.getByRole("menuitem", { name: "Profile" }).click()
    await expect(page).toHaveURL(/\/profile$/)
  })
})

test.describe("Responsive — public and anonymous surfaces (M18 §5)", () => {
  // The canary above covers only routes with no id in them. These five need a
  // seeded trip, a public itinerary, two share tokens and an opted-in public
  // profile, which is why they were left out of §1 and had never been measured at
  // any width. Two of them turned out to be broken in exactly the way the canary
  // cannot see — see the map-size assertions below.
  let leaderToken: string
  let seeded: SeededRoute
  let storyToken: string
  let planToken: string
  let username: string
  let userId: string
  let wasProfilePublic: boolean

  test.beforeAll(async ({ request }) => {
    leaderToken = await apiGetAccessToken(request, LEADER.mail, LEADER.pwd)

    seeded = await apiSeedPublicItinerary(request, leaderToken, {
      name: `E2E Responsive Public ${Date.now()}`,
      totalMiles: 6,
      days: [
        {
          dayNumber: 1,
          date: "2026-07-15",
          points: [
            {
              latitude: 48.4,
              longitude: -123.35,
              name: "Launch beach",
              type: "stop",
            },
            {
              latitude: 48.45,
              longitude: -123.3,
              name: "Overnight camp",
              type: "stop",
            },
          ],
        },
      ],
    })

    const story = await request.post(
      `${API_URL}/api/v1/itinerary/${seeded.itineraryId}/story-share`,
      { headers: { Authorization: `Bearer ${leaderToken}` } },
    )
    expect(story.ok(), "could not mint a story share token").toBeTruthy()
    storyToken = (await story.json()).storyShareToken

    const plan = await request.post(`${API_URL}/api/v1/logistics/${seeded.tripId}/share`, {
      headers: { Authorization: `Bearer ${leaderToken}` },
    })
    expect(plan.ok(), "could not mint a float-plan share token").toBeTruthy()
    planToken = (await plan.json()).shareToken

    // /paddlers/<username> renders an empty shell unless the profile is opted in.
    // Both calls check their status. Neither did, and that hid a real failure: when
    // /user/me answers with an error body, `account.id` is undefined, the PATCH below goes
    // to /user/undefined, and the ownership check rejects it as someone else's record —
    // silently, because nothing read the response. The tests that then depend on `userId`
    // fail much later with a 403 that points at the wrong thing entirely.
    const me = await request.get(`${API_URL}/api/v1/user/me`, {
      headers: { Authorization: `Bearer ${leaderToken}` },
    })
    if (!me.ok()) throw new Error(`GET /user/me failed: ${me.status()} ${await me.text()}`)
    const account = await me.json()
    username = account.username
    userId = account.id
    wasProfilePublic = !!account.profileIsPublic
    if (!userId) throw new Error(`/user/me returned no id: ${JSON.stringify(account)}`)

    const madePublic = await request.patch(`${API_URL}/api/v1/user/${userId}`, {
      headers: { Authorization: `Bearer ${leaderToken}` },
      data: { profileIsPublic: true },
    })
    if (!madePublic.ok()) {
      throw new Error(
        `making the profile public failed: ${madePublic.status()} ${await madePublic.text()}`,
      )
    }
  })

  test.afterAll(async ({ request }) => {
    // Guarded so a failed beforeAll surfaces its own error rather than a cleanup one.
    if (seeded?.itineraryId) await apiDeleteItinerary(request, leaderToken, seeded.itineraryId)
    if (seeded?.tripId) await apiDeleteTrip(request, leaderToken, seeded.tripId)
    // LEADER is shared with every other spec in the suite, and profile visibility is
    // account state rather than per-trip fixture data — left flipped it would follow
    // them into runs that never asked for it.
    if (userId && !wasProfilePublic) {
      await request.patch(`${API_URL}/api/v1/user/${userId}`, {
        headers: { Authorization: `Bearer ${leaderToken}` },
        data: { profileIsPublic: false },
      })
    }
  })

  test.describe("anonymous", () => {
    test.use({ storageState: { cookies: [], origins: [] } })

    test("the four share surfaces do not scroll horizontally", async ({ page }) => {
      for (const route of [
        `/routes/${seeded.itineraryId}`,
        `/story/${storyToken}`,
        `/float-plan/${planToken}`,
        `/paddlers/${username}`,
      ]) {
        for (const width of WIDTHS) {
          await expectNoHorizontalScroll(page, route, width)
        }
      }
    })

    test("the shared route and story pages keep their map at 320", async ({ page }) => {
      // Both pages lay the map and the detail panel as flex siblings. The panel is
      // `w-full shrink-0` until its breakpoint, so as a row it took the whole
      // viewport and the map — `min-w-0 flex-1` — collapsed to zero width. Nothing
      // overflowed, so every assertion in the test above passed on a route page
      // with no route on it. Same failure shape as the builder's (§4).
      for (const route of [`/routes/${seeded.itineraryId}`, `/story/${storyToken}`]) {
        await page.setViewportSize({ width: 320, height: 700 })
        await page.goto(route)
        await page.waitForLoadState("networkidle")
        expect(new URL(page.url()).pathname).toBe(route)

        const map = page.locator(".leaflet-container").first()
        await expect(map).toBeVisible()
        const box = (await map.boundingBox())!
        expect(
          Math.round(box.width),
          `${route}: the map is ${Math.round(box.width)}px wide — the detail panel has taken the viewport.`,
        ).toBeGreaterThanOrEqual(280)
        expect(
          Math.round(box.height),
          `${route}: the map is only ${Math.round(box.height)}px tall.`,
        ).toBeGreaterThanOrEqual(180)
      }
    })

    test("opens the route panel over a full-bleed map at 320, and slides it away on request", async ({
      page,
    }) => {
      // The panel is a right-hand panel at every width — the same control on the
      // same edge on a phone as on a desktop, open on arrival at both. At 320 it
      // cannot dock (it is wider than the viewport on its own), so it lies over a
      // full-bleed map instead of taking the map's width away.
      await page.setViewportSize({ width: 320, height: 700 })
      await page.goto(`/story/${storyToken}`)
      await page.waitForLoadState("networkidle")

      const drawer = page.getByTestId("route-detail-drawer")
      const toggle = page.getByTestId("route-detail-toggle")
      const map = page.locator(".leaflet-container").first()
      await expect(map).toBeVisible()

      const open = (await drawer.boundingBox())!
      expect(Math.round(open.x + open.width), "the panel should sit flush to the right edge").toBe(
        320,
      )
      expect(
        Math.round(open.width),
        `the panel is ${Math.round(open.width)}px of a 320px viewport — it should leave the map showing.`,
      ).toBeLessThan(320)
      // It overlays rather than squeezing, so the map keeps every pixel either way.
      expect(Math.round((await map.boundingBox())!.width)).toBe(320)

      // The toggle rides on the panel's left edge, which is what advertises the map
      // underneath — and what keeps the control on screen once the panel is not.
      const handle = (await toggle.boundingBox())!
      expect(handle.x).toBeGreaterThanOrEqual(0)
      expect(Math.round(handle.x + handle.width)).toBeLessThanOrEqual(320)

      // Polled on the settled edge rather than on "has it started moving": the
      // slide is a 200ms transition, and a first reading past 320 is mid-gesture.
      await toggle.click()
      await expect
        .poll(async () => Math.round((await drawer.boundingBox())!.x), {
          message: "the panel never settled off the right edge",
        })
        .toBe(320)

      const parked = (await toggle.boundingBox())!
      expect(
        Math.round(parked.x + parked.width),
        "the toggle left the viewport with the panel it collapsed",
      ).toBeLessThanOrEqual(320)
    })

    test("gives the daily breakdown the panel's leftover height on a tall viewport", async ({
      page,
      request,
    }) => {
      // The list used to be capped at a fixed `max-h-40` (180px, since rem is
      // 1.125×) with its own scrollbar. On a viewport taller than it is wide —
      // a browser's phone emulation, or a phone in a tall aspect — that left the
      // list scrolling inside a small box with most of the panel empty below it.
      // It is now sized by what the panel has left.
      const CAPPED_HEIGHT = 180
      const many = await apiSeedPublicItinerary(request, leaderToken, {
        name: `E2E Responsive Days ${Date.now()}`,
        totalMiles: 30,
        days: Array.from({ length: 10 }, (_, index) => ({
          dayNumber: index + 1,
          date: `2026-07-${String(index + 10).padStart(2, "0")}`,
          points: [
            {
              latitude: 48 + index / 10,
              longitude: -123.3,
              name: `Camp ${index}`,
              type: "stop",
            },
          ],
        })),
      })
      try {
        await page.setViewportSize({ width: 390, height: 1200 })
        await page.goto(`/routes/${many.itineraryId}`)
        await page.waitForLoadState("networkidle")

        const panel = page.getByTestId("route-detail-panel")
        const list = panel.getByRole("list").first()
        const listBox = (await list.boundingBox())!
        const panelBox = (await panel.boundingBox())!

        expect(
          Math.round(listBox.height),
          `the breakdown is ${Math.round(listBox.height)}px tall in a ${Math.round(panelBox.height)}px ` +
            `panel — it is still on the fixed cap with the rest of the panel empty.`,
        ).toBeGreaterThan(CAPPED_HEIGHT)
        // Within the panel, not spilling past it — the growth has to come out of
        // the space that was going to waste, not out of the panel's bounds.
        expect(Math.round(listBox.y + listBox.height)).toBeLessThanOrEqual(
          Math.round(panelBox.y + panelBox.height) + 1,
        )
      } finally {
        await apiDeleteItinerary(request, leaderToken, many.itineraryId)
        await apiDeleteTrip(request, leaderToken, many.tripId)
      }
    })

    test("docks the panel beside the map at md, and hands the width back when collapsed", async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1024, height: 700 })
      await page.goto(`/routes/${seeded.itineraryId}`)
      await page.waitForLoadState("networkidle")

      const drawer = page.getByTestId("route-detail-drawer")
      const toggle = page.getByTestId("route-detail-toggle")
      const map = page.locator(".leaflet-container").first()

      const docked = (await drawer.boundingBox())!
      const beside = (await map.boundingBox())!
      expect(Math.round(docked.width), "the panel is collapsed by default at md").toBeGreaterThan(0)
      expect(
        beside.x + beside.width,
        `the map runs to x=${Math.round(beside.x + beside.width)} but the panel starts at ` +
          `${Math.round(docked.x)} — it is covering the route it describes.`,
      ).toBeLessThanOrEqual(docked.x + 1)

      // The toggle sits over the map here. Leaflet's panes reach z-index 1000 and a
      // map makes no stacking context to contain them, so a control floated over it
      // without clearance is visible and dead — twice already in this milestone.
      const reached = await toggle.evaluate((el) => {
        const r = el.getBoundingClientRect()
        const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
        return !!top && (top === el || el.contains(top))
      })
      expect(reached, "a click at the centre of the toggle lands on the tiles").toBe(true)

      await toggle.click()
      // Collapsing gives the space to the map rather than merely hiding the panel.
      await expect.poll(async () => Math.round((await map.boundingBox())!.width)).toBe(1024)

      const handle = (await toggle.boundingBox())!
      expect(
        Math.round(handle.x + handle.width),
        "the toggle left the viewport with the panel it collapsed",
      ).toBeLessThanOrEqual(1024)
    })
  })

  test("the printable float plan does not scroll horizontally", async ({ page, request }) => {
    // Authenticated, and deliberately outside the trip-detail tab layout (M8), so
    // it is the one print surface with a shell of its own.
    //
    // Seeded with a shore contact and vessel details first, because every row on
    // this page comes from a `FieldRow` that renders nothing for an empty value.
    // Against a bare trip the page has a heading and no rows, and asserting that
    // *that* fits in 320px measures nothing about the layout under test.
    await apiSetShoreContact(request, leaderToken, seeded.tripId, {
      shoreContactName: "Marguerite Vandersteen",
      shoreContactEmail: "marguerite.vandersteen@harbourwatch.example.com",
      shoreContactPhone: "+39 011 555 0142",
      shoreContactRelationship: "Harbour master",
    })
    await apiSetVessel(request, leaderToken, userId, {
      vesselMake: "Valley Sea Kayaks",
      vesselModel: "Nordkapp Forti RM",
      vesselLengthCm: 545,
      vesselColorPrimary: "Fluorescent orange",
    })

    for (const width of WIDTHS) {
      await expectNoHorizontalScroll(page, `/trips/float-plan/${seeded.tripId}`, width)
    }

    // Overflow is not this page's failure mode, which is why the check above passed
    // while the page was unusable. Its rows put a fixed-width label beside a value in a
    // flex row, so a value too wide for the space left over *wraps* — the row keeps its
    // width, the page never scrolls, and the value renders as a ragged column a few
    // characters across. The canary cannot see that by construction (M18 §2), so assert
    // the value has room instead: stacked under its label at 320, beside it from sm.
    await page.setViewportSize({ width: 320, height: 640 })
    await page.goto(`/trips/float-plan/${seeded.tripId}`)
    await page.waitForLoadState("networkidle")

    const email = page.getByText("marguerite.vandersteen@harbourwatch.example.com")
    await expect(email).toBeVisible()
    const stacked = (await email.boundingBox())!
    expect(
      Math.round(stacked.width),
      `the shore contact's email column is only ${Math.round(stacked.width)}px wide at 320`,
    ).toBeGreaterThan(200)

    await page.setViewportSize({ width: 640, height: 640 })
    const label = page.getByText("Email", { exact: true }).first()
    const labelBox = (await label.boundingBox())!
    const valueBox = (await email.boundingBox())!
    expect(
      Math.round(valueBox.x),
      "the value should sit beside its label from sm, not under it",
    ).toBeGreaterThan(Math.round(labelBox.x))

    // The crew manifest's own header is measured by box, not by scroll width, and that
    // is not a stylistic choice. Each section is a Radix Collapsible, whose content
    // clips on screen — the print stylesheet resets it with `overflow: visible
    // !important` for exactly that reason. Clipped content does not extend any
    // ancestor's scrollWidth, so a member row that runs past the card edge is invisible
    // to the overflow canary *and* cut off on screen. A bounding box still reports the
    // element's real layout, clipped or not.
    await page.setViewportSize({ width: 320, height: 640 })
    await page.goto(`/trips/float-plan/${seeded.tripId}`)
    await page.waitForLoadState("networkidle")

    const memberMail = page.getByText(LEADER.mail, { exact: true }).first()
    await expect(memberMail).toBeVisible()
    const mailBox = (await memberMail.boundingBox())!
    expect(
      Math.round(mailBox.x + mailBox.width),
      `the crew member's email reaches ${Math.round(mailBox.x + mailBox.width)}px at a 320px viewport`,
    ).toBeLessThanOrEqual(320)

    // And it stacked rather than merely wrapped: the address sits below the name at base.
    const name = page.getByText("E2E Leader", { exact: true }).first()
    const nameBox = (await name.boundingBox())!
    expect(
      Math.round(mailBox.y),
      "the email should sit under the name at 320, not beside it",
    ).toBeGreaterThan(Math.round(nameBox.y))
  })

  test("keeps the account card's email row inside the viewport at 320", async ({ page }) => {
    // /settings is already in the canary's route list, so this is not about the page
    // overflowing — it is about the one row whose content cannot wrap. An email
    // address has no break opportunity, and it sits in a flex row opposite a button
    // that must keep its full width, so the row is where a narrow viewport shows.
    await page.setViewportSize({ width: 320, height: 640 })
    await page.goto("/settings")
    await page.waitForLoadState("networkidle")

    const email = page.getByText(LEADER.mail, { exact: false }).first()
    const button = page.getByRole("button", { name: "Change email" })
    await expect(email).toBeVisible()
    await expect(button).toBeVisible()

    // Measured by box rather than by page overflow, because a Card can clip its own
    // content: a control that runs past the card edge is cut off on screen without ever
    // widening anything the overflow canary reads.
    //
    // CardContent is px-6, which is 27px a side at the 112.5% root — so of a 320px
    // viewport these controls have about 257px, and the ones checked here each wanted
    // close to all of it. ("Download my data" and "Sign out everywhere" measure ~182px
    // and ~204px, so they are not in this list.)
    const controls = [
      ["the current email", email],
      ["the Change email button", button],
      ["the Change password button", page.getByRole("link", { name: "Change password" })],
      ["the account deletion button", page.getByRole("button", { name: /deletion/i })],
    ] as const

    for (const [label, locator] of controls) {
      await expect(locator).toBeVisible()
      const box = (await locator.boundingBox())!
      expect(
        Math.round(box.x + box.width),
        `${label} reaches ${Math.round(box.x + box.width)}px at a 320px viewport`,
      ).toBeLessThanOrEqual(320)
    }

    // The deletion control drops a word at base and keeps its full name for a screen
    // reader — `sr-only`, not `hidden`, so this must stay true rather than the label
    // simply being shortened.
    await expect(page.getByRole("button", { name: "Request account deletion" })).toBeVisible()
  })

  test("keeps the profile stat tiles uniform and the month bars readable at 320", async ({
    page,
    request,
  }) => {
    // Stats only render with logs behind them — without one the page shows an EmptyState,
    // and measuring that proves nothing about the dashboard.
    await apiClearLogs(request, leaderToken)
    await apiCreateLog(request, leaderToken, { tripId: seeded.tripId, distance: 24, hours: 5 })
    await apiCreateLog(request, leaderToken, {
      tripId: seeded.tripId,
      date: "2026-05-11",
      distance: 8,
      hours: 2,
    })

    await page.setViewportSize({ width: 320, height: 640 })
    await page.goto("/profile")
    await page.waitForLoadState("networkidle")

    // Every tile in a `grid-cols-2` row stretches to the tallest, so one label wrapping to
    // a second line pads the tile beside it with empty space. Uniform heights are the
    // assertion; "Endorsements" is the longest label and the one that wrapped.
    const tiles = page.locator("div.bg-muted\\/40.rounded-lg")
    const count = await tiles.count()
    expect(count, "no stat tiles rendered — did the seeded logs land?").toBeGreaterThan(1)

    const heights: number[] = []
    for (let i = 0; i < count; i++)
      heights.push(Math.round((await tiles.nth(i).boundingBox())!.height))
    expect(
      new Set(heights).size,
      `stat tiles have uneven heights (${heights.join(", ")}) — a label is wrapping`,
    ).toBe(1)

    // Both chart lists put fixed-width columns and their gaps against a flex-1 bar. If
    // those take the row the bar is left with a few pixels and the chart stops being a
    // comparison at all, so every bar has to keep a width you can read a length off.
    //
    // Every bar, not the first: the first match is the Sea conditions list, whose columns
    // are sized differently from the month rows below it. Measuring one and calling it
    // "the chart" is how the narrower of the two went unnoticed.
    const bars = page.locator("ul li span.bg-muted.h-2")
    const barCount = await bars.count()
    expect(barCount, "no chart bars rendered").toBeGreaterThan(0)

    for (let i = 0; i < barCount; i++) {
      const box = (await bars.nth(i).boundingBox())!
      expect(
        Math.round(box.width),
        `chart bar ${i + 1} of ${barCount} is only ${Math.round(box.width)}px wide at 320`,
      ).toBeGreaterThan(60)
    }

    // The avatar sits above the name rather than stealing width from it.
    const avatar = page.locator("[data-slot='avatar']").first()
    const heading = page.getByRole("heading", { level: 1 }).first()
    const avatarBox = (await avatar.boundingBox())!
    const headingBox = (await heading.boundingBox())!
    expect(
      Math.round(headingBox.y),
      "the name should sit below the avatar at 320, not beside it",
    ).toBeGreaterThanOrEqual(Math.round(avatarBox.y + avatarBox.height))

    // And the edit control is down to its icon while keeping its name.
    const edit = page.getByRole("link", { name: "Edit profile" })
    await expect(edit).toBeVisible()
    const editBox = (await edit.boundingBox())!
    expect(
      Math.round(editBox.width),
      `the edit control is ${Math.round(editBox.width)}px wide — the label has not collapsed`,
    ).toBeLessThan(60)
  })

  test("keeps the Import GPX dialog inside the viewport at 320", async ({ page }) => {
    // The existing GPX test measures the trigger's label and never opens anything.
    // The dialog is its own layout problem: a native file input sizes itself from
    // its button plus the chosen filename and does not shrink to its container.
    await page.setViewportSize({ width: 320, height: 640 })
    await page.goto("/itinerary")
    await page.waitForLoadState("networkidle")

    await page.getByRole("button", { name: "Import GPX" }).click()
    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible()

    const box = (await dialog.boundingBox())!
    expect(
      Math.round(box.x + box.width),
      `the dialog reaches ${Math.round(box.x + box.width)}px at a 320px viewport`,
    ).toBeLessThanOrEqual(320)

    // The file input is the widest thing in it and the part that does not shrink.
    const file = dialog.locator('input[type="file"]')
    const fileBox = (await file.boundingBox())!
    expect(
      Math.round(fileBox.x + fileBox.width),
      `the file input reaches ${Math.round(fileBox.x + fileBox.width)}px, past the dialog's ${Math.round(box.x + box.width)}px`,
    ).toBeLessThanOrEqual(Math.round(box.x + box.width))
  })
})

test.describe("Responsive — the itinerary builder at 320 (M18 §4)", () => {
  // The builder is the one surface the canary above structurally cannot judge.
  // It failed by *collapse*, not overflow: DayRail (126px) and FeatureDrawer
  // (288px) were flex siblings of the map at every width, and since the map is
  // `min-w-0 flex-1` it shrank to exactly 0px wide rather than pushing the page
  // past the viewport. Every assertion in the file above passed on a page whose
  // entire reason to exist had disappeared. So these measure boxes instead.
  //
  // A 3-point, 2-day route is the smallest seed that exercises all of it: two
  // day-rail entries to scroll between, and a Route list with a leg on it.
  const POINTS: EditablePointSpec[] = [
    { latitude: 44.0, longitude: 8.9, type: "stop", name: "Launch" },
    { latitude: 44.02, longitude: 8.92, type: "stop", name: "Turn" },
    { latitude: 44.04, longitude: 8.94, type: "stop", name: "Camp" },
  ]
  const DAY_END_INDICES = [1, 2]

  let leaderToken: string

  test.beforeAll(async ({ request }) => {
    leaderToken = await apiGetAccessToken(request, LEADER.mail, LEADER.pwd)
  })

  // The map's own width and height, which is what "map-first" actually means
  // here. A floor rather than an exact figure: the point is that the map is a
  // usable surface, not that it is any particular size.
  const MIN_MAP_WIDTH = 280
  const MIN_MAP_HEIGHT = 180

  async function boxOf(page: Page, testId: string) {
    const box = await page.getByTestId(testId).boundingBox()
    if (!box) throw new Error(`${testId} is not laid out`)
    return box
  }

  test("keeps a usable map with the day sheet open, and stacks strip · map · sheet", async ({
    page,
    request,
  }) => {
    const seeded = await apiSeedEditableItinerary(request, leaderToken, {
      destination: `E2E Responsive Builder ${Date.now()}`,
      points: POINTS,
      dayEndIndices: DAY_END_INDICES,
    })
    try {
      await page.setViewportSize({ width: 320, height: 700 })
      await page.goto(`/itinerary/${seeded.itineraryId}`)
      await page.waitForLoadState("networkidle")
      expect(new URL(page.url()).pathname).toBe(`/itinerary/${seeded.itineraryId}`)

      const map = page.locator(".leaflet-container")
      await expect(map).toBeVisible()

      // Open the day sheet. This is the exact state that used to leave the map at
      // zero width: rail + drawer together were 414px against a 320px viewport.
      await page.getByTestId("day-rail-entry").first().click()
      await expect(page.getByTestId("feature-drawer")).toBeVisible()

      const mapBox = (await map.boundingBox())!
      expect(
        Math.round(mapBox.width),
        `map is ${Math.round(mapBox.width)}px wide with the day sheet open — ` +
          `the panes are taking the viewport back.`,
      ).toBeGreaterThanOrEqual(MIN_MAP_WIDTH)
      expect(
        Math.round(mapBox.height),
        `map is only ${Math.round(mapBox.height)}px tall — the sheet's height cap is not holding.`,
      ).toBeGreaterThanOrEqual(MIN_MAP_HEIGHT)

      // Stacked, in order. Measured against each other rather than against
      // absolute coordinates, which would only restate the viewport size.
      const strip = await boxOf(page, "day-rail")
      const sheet = await boxOf(page, "feature-drawer")
      expect(strip.y + strip.height, "the day strip should sit above the map").toBeLessThanOrEqual(
        mapBox.y + 1,
      )
      expect(
        mapBox.y + mapBox.height,
        "the day sheet should sit below the map",
      ).toBeLessThanOrEqual(sheet.y + 1)
      // Both span the column: a stacked pane that kept a fixed width would leave
      // a dead gutter beside it and still satisfy the ordering above.
      expect(Math.round(strip.width)).toBe(Math.round(mapBox.width))
      expect(Math.round(sheet.width)).toBe(Math.round(mapBox.width))
    } finally {
      await apiDeleteTrip(request, leaderToken, seeded.tripId)
    }
  })

  test("drags the sheet up to the day strip, and does not carry that height to md", async ({
    page,
    request,
  }) => {
    const seeded = await apiSeedEditableItinerary(request, leaderToken, {
      destination: `E2E Responsive Sheet Drag ${Date.now()}`,
      points: POINTS,
      dayEndIndices: DAY_END_INDICES,
    })
    try {
      await page.setViewportSize({ width: 320, height: 700 })
      await page.goto(`/itinerary/${seeded.itineraryId}`)
      await page.waitForLoadState("networkidle")

      await page.getByTestId("day-rail-entry").first().click()
      await expect(page.getByTestId("feature-drawer")).toBeVisible()

      const strip = await boxOf(page, "day-rail")
      const atRest = await boxOf(page, "feature-drawer")

      // A pointer-capture gesture, so it is driven with raw mouse events and moved
      // in steps — a single jump delivers one pointermove, which is not a drag.
      const handle = page.getByTestId("sheet-resize-handle")
      const grip = (await handle.boundingBox())!
      const fromY = grip.y + grip.height / 2
      // Aim above the strip on purpose: the ceiling has to be the clamp's doing,
      // not the gesture stopping in the right place by arrangement.
      const toY = strip.y - 100
      await page.mouse.move(grip.x + grip.width / 2, fromY)
      await page.mouse.down()
      for (let i = 1; i <= 12; i++) {
        await page.mouse.move(grip.x + grip.width / 2, fromY + ((toY - fromY) * i) / 12)
      }
      await page.mouse.up()

      const expanded = await boxOf(page, "feature-drawer")
      expect(
        expanded.height,
        `the sheet did not grow: ${Math.round(atRest.height)}px before, ${Math.round(expanded.height)}px after`,
      ).toBeGreaterThan(atRest.height)
      expect(
        Math.round(expanded.y),
        `the sheet stopped at y=${Math.round(expanded.y)} but the strip ends at ` +
          `${Math.round(strip.y + strip.height)} — it should reach the strip and no further.`,
      ).toBe(Math.round(strip.y + strip.height))

      // The dragged height is published as a custom property consumed by a base-only
      // class, precisely so it cannot follow the pane into the side-by-side layout.
      // An inline `height` would have beaten `md:h-auto` and survived here.
      await page.setViewportSize({ width: 768, height: 700 })
      const map = await boxOf(page, "map-column")
      const sidePane = await boxOf(page, "feature-drawer")
      expect(
        Math.round(sidePane.height),
        `the drawer is ${Math.round(sidePane.height)}px tall at md but the map column is ` +
          `${Math.round(map.height)}px — the dragged height leaked past the breakpoint.`,
      ).toBe(Math.round(map.height))
    } finally {
      await apiDeleteTrip(request, leaderToken, seeded.tripId)
    }
  })

  test("returns to side-by-side panes at md", async ({ page, request }) => {
    const seeded = await apiSeedEditableItinerary(request, leaderToken, {
      destination: `E2E Responsive Builder MD ${Date.now()}`,
      points: POINTS,
      dayEndIndices: DAY_END_INDICES,
    })
    try {
      await page.setViewportSize({ width: 768, height: 700 })
      await page.goto(`/itinerary/${seeded.itineraryId}`)
      await page.waitForLoadState("networkidle")

      await page.getByTestId("day-rail-entry").first().click()
      await expect(page.getByTestId("feature-drawer")).toBeVisible()

      const mapBox = (await page.locator(".leaflet-container").boundingBox())!
      const strip = await boxOf(page, "day-rail")
      const sheet = await boxOf(page, "feature-drawer")

      // The `md` half of the same contract, asserted because a one-sided fix is
      // indistinguishable from a broken one until you check the other side.
      expect(strip.x + strip.width, "the day rail should sit left of the map").toBeLessThanOrEqual(
        mapBox.x + 1,
      )
      expect(mapBox.x + mapBox.width, "the drawer should sit right of the map").toBeLessThanOrEqual(
        sheet.x + 1,
      )
    } finally {
      await apiDeleteTrip(request, leaderToken, seeded.tripId)
    }
  })

  test("shows the point summary as a segment of the sheet at 320, floating at md", async ({
    page,
    request,
  }) => {
    const seeded = await apiSeedEditableItinerary(request, leaderToken, {
      destination: `E2E Responsive Point ${Date.now()}`,
      points: POINTS,
      dayEndIndices: DAY_END_INDICES,
    })
    try {
      await page.setViewportSize({ width: 320, height: 700 })
      await page.goto(`/itinerary/${seeded.itineraryId}`)
      await page.waitForLoadState("networkidle")

      await page.getByTestId("day-rail-entry").first().click()
      const sheet = page.getByTestId("feature-drawer")
      await expect(sheet).toBeVisible()

      // No Point segment until there is a point to show.
      const pointTab = sheet.getByRole("button", { name: "Point" })
      await expect(pointTab).toHaveCount(0)

      await page.getByTestId("route-waypoint").last().click()
      await expect(pointTab).toBeVisible()

      // The card is inside the sheet, not floating over the map — that is the
      // whole "one sheet, segmented" decision, and it is a containment claim, so
      // it is asserted by containment rather than by coordinates.
      const inSheet = sheet.getByTestId("point-detail-sheet")
      await expect(inSheet).toBeVisible()
      await expect(page.getByTestId("map-column").getByTestId("point-detail-sheet")).toBeHidden()

      // And at md it is the other way round: the floating card is over the map,
      // and the sheet has no Point segment at all. Both cards are in the DOM at
      // both widths — one of the two is always display:none — so each assertion
      // has to name which one it means by where it lives.
      await page.setViewportSize({ width: 768, height: 700 })
      await expect(pointTab).toBeHidden()
      await expect(inSheet).toBeHidden()
      await expect(page.getByTestId("map-column").getByTestId("point-detail-sheet")).toBeVisible()
    } finally {
      await apiDeleteTrip(request, leaderToken, seeded.tripId)
    }
  })

  test("shares one top row between Navigate's chip and the Annotate FAB at 320", async ({
    page,
    request,
  }) => {
    // Every floating control used to open at the top edge, and at 320 they piled
    // up: the chip ran under the Annotate pill, which painted over the middle of
    // its text, and dropping the chip to a band of its own cost a second row over
    // a ~209px map. They now share one row. Navigate only exists while a trip is
    // happening.
    const seeded = await apiSeedEditableItinerary(request, leaderToken, {
      destination: `E2E Responsive Navigate ${Date.now()}`,
      points: POINTS,
      dayEndIndices: DAY_END_INDICES,
    })
    try {
      await apiTransitionState(request, leaderToken, seeded.tripId, "happening")

      await page.setViewportSize({ width: 320, height: 700 })
      // Not networkidle: Navigate holds an SSE connection open, so this page is
      // never idle by design and waiting for it times out.
      await page.goto(`/itinerary/${seeded.itineraryId}?navigate=1`)
      // Scoped to `main`, and that is the whole fix for a flake this test carried for a
      // while (#172). During load the page subtree is briefly present *twice*: once inside
      // the app shell, and once on a bare `<div>` hanging directly off `<body>`, with no
      // sidebar wrapper and no `main` above it. Both are visible, and they run independent
      // effects — the two copies were caught showing different geolocation states in the
      // same frame. No application path produces that second copy: one route renders
      // MapBuilder and it renders through `(app)/layout.tsx`, so the stray copy is a
      // framework-level streaming/hydration artifact, not a double mount of ours.
      //
      // Earlier attempts tried to *wait out* the window — settle the text, then check the
      // count, then visibility. That cannot work, because the second copy appears after
      // the first has reached a terminal status: the count is momentarily 1 and then 2 one
      // assertion later, which is exactly how this failed. Scoping to `main` sidesteps the
      // race entirely rather than timing it, and it also says what the test means: the chip
      // *in the page*.
      const chrome = page.locator('main [data-testid="navigate-chrome"]')

      // Settle before measuring — this is a layout assertion, and an unsettled layout is
      // not the one under test.
      await expect(chrome).toContainText(/Location denied|Location unavailable|Sharing/)
      await expect(chrome).toHaveCount(1)
      await expect(chrome).toBeVisible()

      // Both elements, not just the chip. This assertion compares two boxes, so both have
      // to exist before either is measured — and `boundingBox()` answers null for one that
      // does not, which the old `!` turned into a bare "Cannot read properties of null"
      // pointing at the arithmetic rather than at the element that was missing.
      const fabLocator = page.getByTestId("add-button")
      await expect(fabLocator).toBeVisible()

      const chromeBox = await chrome.boundingBox()
      const fab = await fabLocator.boundingBox()
      expect(chromeBox, "the Navigate chip has no box to measure").not.toBeNull()
      expect(fab, "the Annotate FAB has no box to measure").not.toBeNull()
      if (!chromeBox || !fab) throw new Error("unreachable — asserted non-null above")

      // Same row: their vertical spans overlap. Asserted as overlap rather than
      // equal `y`, since the chip and the FAB are different heights.
      const sharesRow = chromeBox.y < fab.y + fab.height && fab.y < chromeBox.y + chromeBox.height
      expect(
        sharesRow,
        `chip y=${Math.round(chromeBox.y)}..${Math.round(chromeBox.y + chromeBox.height)} vs ` +
          `FAB y=${Math.round(fab.y)}..${Math.round(fab.y + fab.height)} — separate rows.`,
      ).toBe(true)

      // Side by side rather than layered: the chip must stop before the FAB starts.
      expect(
        chromeBox.x + chromeBox.width,
        `the chip runs to x=${Math.round(chromeBox.x + chromeBox.width)} but the FAB starts at ` +
          `${Math.round(fab.x)} — it is underneath the FAB again.`,
      ).toBeLessThanOrEqual(fab.x)

      // Below the day strip, which is what §4's plan asked to verify.
      const strip = await boxOf(page, "day-rail")
      expect(chromeBox.y).toBeGreaterThanOrEqual(strip.y + strip.height)

      // Reachable, not merely on screen. The Annotate wrapper is as tall as its
      // closed panel and sits at z-[1001] over the map; a transparent div still
      // hit-tests, so it swallowed every tap on Close day while leaving it fully
      // visible. Playwright's own actionability check would pass a covered button
      // if the cover were an ancestor, so the topmost element is read directly.
      const closeDay = page.getByRole("button", { name: "Close day" })
      const reached = await closeDay.evaluate((el) => {
        const r = el.getBoundingClientRect()
        const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
        return !!top && (top === el || el.contains(top))
      })
      expect(reached, "a tap at the centre of Close day lands on something else").toBe(true)

      // And the consequence, which is what actually matters.
      await closeDay.click()
      await expect(page.getByRole("alertdialog")).toBeVisible()
    } finally {
      await apiDeleteTrip(request, leaderToken, seeded.tripId)
    }
  })

  test("keeps the map's bottom edge tappable, with the credits behind a badge", async ({
    page,
    request,
  }) => {
    // Leaflet sizes its credit line to the space available, so at 320 it wrapped
    // into a 311×38 strip across a 288px-tall map — 13% of the map, edge to edge.
    // Every tap there missed the map, and one landing on the OpenStreetMap link
    // navigated out of the builder, taking an unsaved day draft with it. Only
    // reachable with a real finger: `.click()` is a mouse event even here.
    const seeded = await apiSeedEditableItinerary(request, leaderToken, {
      destination: `E2E Responsive Credits ${Date.now()}`,
      points: POINTS,
      dayEndIndices: DAY_END_INDICES,
    })
    try {
      await page.setViewportSize({ width: 320, height: 700 })
      await page.goto(`/itinerary/${seeded.itineraryId}`)
      await page.waitForLoadState("networkidle")
      await page.getByRole("button", { name: "Edit", exact: true }).tap()
      await expect(page.getByTestId("point-list-pane")).toBeVisible()

      const credits = page.locator(".leaflet-control-attribution")
      const badge = (await credits.boundingBox())!
      const map = (await page.locator(".leaflet-container").boundingBox())!
      expect(
        Math.round(badge.width),
        `the credit line is ${Math.round(badge.width)}px of a ${Math.round(map.width)}px map — ` +
          `it is a strip again, and the map's bottom edge is dead to taps.`,
      ).toBeLessThan(map.width / 2)

      // The licence is still one tap away, which is the whole reason it may be
      // collapsed rather than removed.
      await credits.tap()
      await expect(credits).toHaveAttribute("aria-expanded", "true")
      await expect(credits.getByRole("link", { name: /OpenStreetMap/i })).toBeVisible()
      // Closed by a tap elsewhere, not by tapping it again: opened, the line is
      // wall-to-wall links and its own centre is the OpenStreetMap link, so a
      // second tap on it leaves the app. That is what this test caught first.
      await page.touchscreen.tap(map.x + map.width / 2, map.y + 60)
      await expect(credits).toHaveAttribute("aria-expanded", "false")

      // And a tap where the strip used to be now reaches the map and drops a pin.
      const markers = page.locator(".leaflet-marker-pane .leaflet-marker-icon")
      const before = await markers.count()
      await page.touchscreen.tap(map.x + map.width / 2, map.y + map.height - 19)
      await expect(markers).toHaveCount(before + 1)
      expect(new URL(page.url()).pathname, "the tap navigated out of the builder").toBe(
        `/itinerary/${seeded.itineraryId}`,
      )
    } finally {
      await apiDeleteTrip(request, leaderToken, seeded.tripId)
    }
  })

  test("drags a day boundary with a finger without the list running away", async ({
    page,
    request,
  }) => {
    // Dragging a boundary is the only gesture that arms "Save days". The drag
    // auto-scrolls the list near its edges, and that band was a flat 48px — of a
    // pane 656px tall on a desktop but 171px in the bottom sheet at 320, where it
    // claimed 56% of the list and the last boundary starts inside it. The list
    // scrolled out from under the finger and the day could never be saved.
    const seeded = await apiSeedEditableItinerary(request, leaderToken, {
      destination: `E2E Responsive Boundary ${Date.now()}`,
      points: POINTS,
      dayEndIndices: DAY_END_INDICES,
    })
    try {
      await page.setViewportSize({ width: 320, height: 700 })
      await page.goto(`/itinerary/${seeded.itineraryId}`)
      await page.waitForLoadState("networkidle")
      await page.getByRole("button", { name: "Edit", exact: true }).tap()
      await expect(page.getByTestId("point-list-pane")).toBeVisible()

      const save = page.getByRole("button", { name: "Save days" })
      await expect(save, "Save days should start disabled, with no draft yet").toBeDisabled()

      const grip = page.getByTestId("boundary-grip").first()
      await grip.scrollIntoViewIfNeeded()
      const box = (await grip.boundingBox())!
      const scrollTopOf = () =>
        page.evaluate(
          () =>
            (document.querySelector('[data-point-list="true"]') as HTMLElement | null)?.scrollTop ??
            0,
        )
      const scrollBefore = await scrollTopOf()

      await touchDrag(page, box.x + box.width / 2, box.y + box.height / 2, box.y - 60)

      await expect(save, "the drag did not register as a day-boundary change").toBeEnabled()
      const drift = Math.abs((await scrollTopOf()) - scrollBefore)
      expect(
        drift,
        `the list scrolled ${drift}px during the drag — the row is moving out from under the finger.`,
      ).toBeLessThan(40)
    } finally {
      await apiDeleteTrip(request, leaderToken, seeded.tripId)
    }
  })

  test("spreads the map's controls to opposite corners at 320", async ({ page, request }) => {
    const seeded = await apiSeedEditableItinerary(request, leaderToken, {
      destination: `E2E Responsive Controls ${Date.now()}`,
      points: POINTS,
      dayEndIndices: DAY_END_INDICES,
    })
    try {
      await page.setViewportSize({ width: 320, height: 700 })
      await page.goto(`/itinerary/${seeded.itineraryId}`)
      await page.waitForLoadState("networkidle")
      await page.getByTestId("day-rail-entry").first().click()
      await expect(page.getByTestId("feature-drawer")).toBeVisible()

      const map = (await page.locator(".leaflet-container").boundingBox())!
      const zoom = (await page.locator(".leaflet-control-zoom").boundingBox())!
      const layers = (await page.getByTestId("layers-button").boundingBox())!
      const fab = (await page.getByTestId("add-button").boundingBox())!
      const credits = (await page.locator(".leaflet-control-attribution").boundingBox())!

      // Each toggle is tucked into a corner rather than adrift in the middle. This
      // is the real regression guard: each wrapper is as wide as its hidden panel
      // (180px and 198px), so without an explicit cross-axis alignment the button
      // renders at the wrapper's leading edge — which put Overlays at x≈109 on a
      // 311px map, on top of the Annotate pill.
      const rightGap = (box: { x: number; width: number }) =>
        map.x + map.width - (box.x + box.width)
      expect(
        rightGap(fab),
        `the add FAB is ${Math.round(rightGap(fab))}px from the right edge`,
      ).toBeLessThan(20)
      expect(
        rightGap(layers),
        `layers is ${Math.round(rightGap(layers))}px from the right edge`,
      ).toBeLessThan(20)
      expect(zoom.x - map.x, "zoom is not against the left edge").toBeLessThan(20)

      // Top and bottom, not all in one band — the distribution itself. Compared on
      // each control's centre, not its top edge: the zoom stack is 64px tall, so at
      // 320 its top sits a few px above the midpoint while the control as a whole is
      // plainly in the bottom half.
      const midpoint = map.y + map.height / 2
      const centreY = (box: { y: number; height: number }) => box.y + box.height / 2
      expect(centreY(fab), "the add FAB should be in the map's top half").toBeLessThan(midpoint)
      expect(centreY(layers), "layers should be in the map's bottom half").toBeGreaterThan(midpoint)
      expect(centreY(zoom), "zoom should be in the map's bottom half").toBeGreaterThan(midpoint)

      // And both bottom controls clear the credits. Leaflet's own stylesheet is
      // imported unlayered, so it beats any Tailwind utility no matter how
      // specific — the zoom offset has to be an unlayered rule in globals.css, and
      // a class on the map would silently do nothing.
      expect(
        Math.max(zoom.y + zoom.height, layers.y + layers.height),
        `a bottom control runs past y=${Math.round(credits.y)}, where the credits start.`,
      ).toBeLessThanOrEqual(credits.y)
    } finally {
      await apiDeleteTrip(request, leaderToken, seeded.tripId)
    }
  })
})

test.describe("Responsive — the mobile nav drawer", () => {
  // Below `md` the sidebar is the only navigation there is, and it is the one
  // surface a z-index mistake can disable outright rather than merely uglify:
  // its own backdrop covers the whole viewport, so if the drawer paints under
  // it the app has no reachable links at all. That shipped once — the rule in
  // globals.css raising overlays above Leaflet matched `sheet-overlay` but not
  // the drawer, which carries `data-slot="sidebar"` rather than
  // `sheet-content` — and no test noticed, because asserting the CSS selector
  // is not the same as opening the thing.
  test("opens above its own backdrop and can navigate", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 })
    await page.goto("/dashboard")
    await page.waitForLoadState("networkidle")

    await page.getByRole("button", { name: "Toggle Sidebar" }).click()

    const drawer = page.locator('[data-slot="sidebar"][data-mobile="true"]')
    await expect(drawer).toBeVisible()

    // Paints above the scrim. Read rather than assumed: a drawer that is
    // "visible" to Playwright can still be buried, since visibility is
    // box-and-opacity, not stacking.
    const stacking = await drawer.evaluate((el) => {
      const overlay = document.querySelector('[data-slot="sheet-overlay"]')
      return {
        drawer: Number(getComputedStyle(el).zIndex),
        overlay: overlay ? Number(getComputedStyle(overlay).zIndex) : null,
      }
    })
    expect(
      stacking.drawer,
      `drawer z-index ${stacking.drawer} vs backdrop ${stacking.overlay} — ` +
        `the drawer is behind its own scrim, so nothing in it can be tapped.`,
    ).toBeGreaterThan(stacking.overlay ?? 0)

    // And the consequence, which is the part that actually matters: a nav entry
    // in the drawer takes you somewhere. Playwright's actionability check fails
    // this click if the scrim intercepts the pointer, so this alone would have
    // caught the bug even without the assertion above. The entries are buttons
    // that `router.push`, not links — `navigation-items.tsx`.
    await drawer.getByRole("button", { name: "Trips" }).click()
    await expect(page).toHaveURL(/\/trips$/)
  })
})

test.describe("Responsive — the shuttle vehicle form (M20 §3)", () => {
  // The canary structurally cannot see this one. A `grid-cols-1` whose children ask
  // for `col-span-2` makes CSS add an implicit second column, and implicit columns
  // are `auto`-sized — so Seats and Kayak spots sat side by side at 320 with Seats
  // squeezed to nothing by the number input's max-content width. Columns shrink;
  // they do not overflow, so the page scrolled no wider than it should and the
  // whole thing was canary-green. It has to be measured.
  let leaderToken: string
  let tripId: string

  test.beforeAll(async ({ request }) => {
    leaderToken = await apiGetAccessToken(request, LEADER.mail, LEADER.pwd)
    const trip = await apiCreateTrip(request, leaderToken, {
      destination: `E2E Responsive Shuttle ${Date.now()}`,
    })
    tripId = trip.id
  })

  test.afterAll(async ({ request }) => {
    if (tripId) await apiDeleteTrip(request, leaderToken, tripId)
  })

  test("stacks the seats and kayak-spot fields at 320, side by side from sm", async ({ page }) => {
    await page.goto(`/trips/${tripId}/logistics`)
    await page.waitForLoadState("networkidle")
    // Shuttle is one item of a `type="multiple"` accordion with nothing open by
    // default, so its Add vehicle button is not in the DOM until the section is.
    await page.getByRole("button", { name: /^Shuttle/ }).click()
    await page.getByRole("button", { name: "Add vehicle" }).click()

    const dialog = page.getByRole("dialog", { name: "Add vehicle" })
    const seats = dialog.getByLabel("Seats available")
    const kayaks = dialog.getByLabel("Kayak spots")
    await expect(seats).toBeVisible()

    const boxes = async () => {
      const [seatsBox, kayaksBox] = await Promise.all([seats.boundingBox(), kayaks.boundingBox()])
      if (!seatsBox || !kayaksBox) throw new Error("the vehicle form is not laid out")
      return { seatsBox, kayaksBox }
    }

    const { seatsBox, kayaksBox } = await boxes()
    // Stacked, and each field wide enough to read the number typed into it. The
    // failure was not subtle — Seats collapsed to a sliver while Kayak spots took
    // the row — so a generous floor still catches it.
    expect(
      kayaksBox.y >= seatsBox.y + seatsBox.height,
      `at 320 kayak spots should sit below seats — seats y=${Math.round(seatsBox.y)} h=${Math.round(seatsBox.height)}, kayaks y=${Math.round(kayaksBox.y)}`,
    ).toBe(true)
    expect(
      seatsBox.width,
      `at 320 the seats field collapsed to ${Math.round(seatsBox.width)}px`,
    ).toBeGreaterThan(150)

    await page.setViewportSize({ width: 640, height: 900 })
    const wide = await boxes()
    const seatsMiddle = wide.seatsBox.y + wide.seatsBox.height / 2
    expect(
      seatsMiddle > wide.kayaksBox.y && seatsMiddle < wide.kayaksBox.y + wide.kayaksBox.height,
      `from sm the two fields should share a row — seats y=${Math.round(wide.seatsBox.y)}, kayaks y=${Math.round(wide.kayaksBox.y)}`,
    ).toBe(true)
  })
})
