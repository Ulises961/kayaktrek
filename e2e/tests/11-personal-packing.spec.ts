import { test, expect } from "@playwright/test";
import { LEADER, CREW } from "../fixtures/auth";
import {
  apiGetAccessToken,
  apiCreateTrip,
  apiDeleteTrip,
  apiInviteByEmail,
  apiAcceptInvitation,
} from "../fixtures/trips";
import { apiCreateItem, apiAddPacking } from "../fixtures/inventory";
import { mutateAndSettle } from "../fixtures/ui";

// One of the seeded DEFAULT_PERSONAL_KIT items (seeded into each member's kit).
const KIT_SEED = "PFD (buoyancy aid)";

test.describe("Personal packing — private kit", () => {
  let tripId: string;
  let leaderToken: string;

  test.beforeEach(async ({ request }) => {
    leaderToken = await apiGetAccessToken(request, LEADER.mail, LEADER.pwd);
    const trip = await apiCreateTrip(request, leaderToken, {
      destination: "E2E Packing Test",
    });
    tripId = trip.id as string;
  });

  test.afterEach(async ({ request }) => {
    await apiDeleteTrip(request, leaderToken, tripId);
  });

  test("member sees their seeded private kit", async ({ page }) => {
    await page.goto(`/trips/${tripId}/items/kit`);
    // "My kit" is now its own route segment (M12 §P) — the sub-nav link is lit.
    await expect(page.getByRole("link", { name: "My kit" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.getByRole("checkbox", { name: KIT_SEED })).toBeVisible();
  });

  test("member adds an owned item to their kit", async ({ page, request }) => {
    await apiCreateItem(request, leaderToken, {
      name: "E2E Headtorch",
      status: "owned",
    });
    await page.goto(`/trips/${tripId}/items/kit`);

    await mutateAndSettle(
      page,
      () =>
        page
          .getByLabel("Add to your kit")
          .selectOption({ label: "E2E Headtorch" }),
      { reload: true },
    );
    await expect(
      page.getByRole("checkbox", { name: "E2E Headtorch" }),
    ).toBeVisible();
  });

  test("toggling packed persists across reload", async ({ page, request }) => {
    const item = await apiCreateItem(request, leaderToken, {
      name: "E2E Spray Deck",
      status: "owned",
    });
    await apiAddPacking(request, leaderToken, tripId, item.id);
    await page.goto(`/trips/${tripId}/items/kit`);

    const box = page.getByRole("checkbox", { name: "E2E Spray Deck" });
    await expect(box).not.toBeChecked();
    // The checkbox is server-controlled (`checked={entry.checked}`) and goes
    // `disabled` during the transition, so Playwright's `check()` — which clicks
    // then synchronously verifies the checked state — throws under a slow
    // round-trip. Use `click()` (no post-state assertion) + settle on the POST;
    // persistence is then verified after reload.
    await mutateAndSettle(page, () => box.click(), { reload: true });

    await page.reload();
    await expect(
      page.getByRole("checkbox", { name: "E2E Spray Deck" }),
    ).toBeChecked();
  });

  test("member removes an item from their kit", async ({ page, request }) => {
    const item = await apiCreateItem(request, leaderToken, {
      name: "E2E Bivvy",
      status: "owned",
    });
    await apiAddPacking(request, leaderToken, tripId, item.id);
    await page.goto(`/trips/${tripId}/items/kit`);

    await expect(
      page.getByRole("checkbox", { name: "E2E Bivvy" }),
    ).toBeVisible();
    await mutateAndSettle(
      page,
      () =>
        page
          .getByRole("button", { name: "Remove E2E Bivvy from your kit" })
          .click(),
      { reload: true },
    );
    await expect(page.getByRole("checkbox", { name: "E2E Bivvy" })).toHaveCount(
      0,
    );
  });

  test("a member's kit is private — not visible to other members", async ({
    page,
    request,
  }) => {
    // Crew joins and adds a private item to their own kit.
    const crewToken = await apiGetAccessToken(request, CREW.mail, CREW.pwd);
    await apiInviteByEmail(request, leaderToken, tripId, CREW.mail);
    await apiAcceptInvitation(request, crewToken, tripId);
    const crewItem = await apiCreateItem(request, crewToken, {
      name: "E2E Crew Secret Kit",
      status: "owned",
    });
    await apiAddPacking(request, crewToken, tripId, crewItem.id);

    // The leader's kit shows their own seeded gear but never the crew member's item.
    await page.goto(`/trips/${tripId}/items/kit`);
    await expect(page.getByRole("checkbox", { name: KIT_SEED })).toBeVisible();
    await expect(
      page.getByRole("checkbox", { name: "E2E Crew Secret Kit" }),
    ).toHaveCount(0);
  });
});
