import { test, expect, type Page } from "@playwright/test";

async function waitForConstellation(page: Page) {
  await page.goto("/");
  await expect(page.locator(".galaxy-core").first()).toBeVisible({
    timeout: 20000,
  });
}

test("constellation renders all 17 movements", async ({ page }) => {
  await waitForConstellation(page);
  await expect(page.locator(".galaxy-core")).toHaveCount(17);
  await expect(page.getByText("Atlas of Art History")).toBeVisible();
  await expect(page.getByText("Medieval & Gothic")).toBeVisible();
  await expect(page.getByText("Contemporary")).toBeVisible();
});

test("explore filter swaps movements/artists and searches", async ({ page }) => {
  await waitForConstellation(page);
  await page.getByRole("button", { name: /explore/i }).click();
  await expect(page.getByPlaceholder(/search movements/i)).toBeVisible();

  await page.getByRole("button", { name: /^artists$/i }).click();
  const search = page.getByPlaceholder(/search artists/i);
  await expect(search).toBeVisible();
  await search.fill("monet");
  await expect(
    page.getByRole("button", { name: /Claude Monet/i }),
  ).toBeVisible();
});

test("movement → artist star → card → enter the museum", async ({ page }) => {
  await waitForConstellation(page);

  await page.locator('.galaxy-core[aria-label="Zoom into Baroque"]').click();
  await page.waitForTimeout(1500); // fly-in settles

  const star = page.locator('.artist-star[aria-label="Caravaggio"]');
  await expect(star).toBeVisible({ timeout: 10000 });
  await star.click();

  await expect(
    page.getByRole("heading", { name: "Caravaggio" }),
  ).toBeVisible();
  await expect(page.getByText(/12 works/)).toBeVisible();

  await page.getByRole("button", { name: /enter the museum/i }).click();
  await page.waitForURL(/\/museum\/caravaggio/, { timeout: 20000 });
  await expect(page.locator("canvas")).toBeVisible();
});

test("museum renders and a painting opens the inspect lightbox", async ({
  page,
}) => {
  await page.goto("/museum/caravaggio");
  await expect(page.locator("canvas")).toBeVisible({ timeout: 20000 });
  await expect(page.getByText("Baroque")).toBeVisible();
  await page.waitForTimeout(4500); // let proxied textures stream in

  const canvas = page.locator("canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("no canvas box");

  // Side-wall paintings sit at mid-height near the left/right edges. Probe a
  // few spots until the raycast hits a frame and the lightbox opens.
  const credit = page.getByText("Wikimedia Commons");
  const probes: [number, number][] = [];
  for (const fx of [0.92, 0.96, 0.88, 0.82, 0.76, 0.1, 0.06, 0.14]) {
    for (const fy of [0.42, 0.47, 0.52]) probes.push([fx, fy]);
  }
  let opened = false;
  for (const [fx, fy] of probes) {
    await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
    if (await credit.isVisible().catch(() => false)) {
      opened = true;
      break;
    }
    await page.waitForTimeout(250);
  }
  expect(opened, "inspect lightbox opened on a painting click").toBeTruthy();
  // The lightbox carries a title heading and a Commons source link.
  await expect(page.getByTestId("inspect")).toBeVisible();
  await expect(page.getByTestId("inspect").locator("h2")).toBeVisible();
  await expect(
    page.getByTestId("inspect").getByRole("link", { name: "Commons" }),
  ).toBeVisible();
});

test("dragging looks around without opening a painting", async ({ page }) => {
  await page.goto("/museum/caravaggio");
  await expect(page.locator("canvas")).toBeVisible({ timeout: 20000 });
  await page.waitForTimeout(2500);

  const box = await page.locator("canvas").boundingBox();
  if (!box) throw new Error("no canvas box");
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 220, cy + 10, { steps: 12 });
  await page.mouse.up();

  // A drag must not be treated as a painting click.
  await expect(page.getByTestId("inspect")).toHaveCount(0);
});
