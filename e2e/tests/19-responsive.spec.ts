import { test, expect, type Page } from "@playwright/test"

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
// - It does not police overflow *inside* a scroll container. A wide table or a
//   nav strip in its own `overflow-x: auto` is correct — the rule is that the
//   page body must not scroll, not that nothing may ever be wider than the
//   viewport. The offender walk below skips anything living inside one.

const WIDTHS = [320, 640] as const

// Static routes only — anything needing a seeded trip/itinerary id belongs in the
// phase that fixes that surface, where the fixture already exists.
const ANONYMOUS_ROUTES = ["/", "/login", "/register", "/terms", "/forgot-password"]

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
 * Page-level horizontal overflow, plus the innermost elements responsible for it.
 *
 * The offender list is what makes a failure actionable: `scrollWidth` alone says
 * "something is too wide", which is the same information for all 20 routes. The
 * walk keeps only elements that contain no other offender (a parent is wide
 * *because* its child is) and skips anything inside a scroll container.
 */
async function measureOverflow(page: Page): Promise<{ overflow: number; offenders: Offender[] }> {
  return page.evaluate(() => {
    const doc = document.documentElement
    const overflow = doc.scrollWidth - doc.clientWidth
    if (overflow <= 0) return { overflow, offenders: [] }

    const limit = doc.clientWidth
    const insideScroller = (el: Element): boolean => {
      let node = el.parentElement
      while (node && node !== document.body) {
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
    // (root CLAUDE.md, E2E section).
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
