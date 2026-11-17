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
  // the count follows the collection (it grew from 12 to 18 with re-ingests)
  await expect(page.getByText(/\d+ works/)).toBeVisible();

  await page.getByRole("button", { name: /enter the museum/i }).click();
  await page.waitForURL(/\/museum\/caravaggio/, { timeout: 20000 });
  await expect(page.locator("canvas")).toBeVisible();
});

// Click into the gallery until a painting's inspect lightbox opens; returns it.
async function openAPainting(page: Page) {
  await page.goto("/museum/caravaggio");
  await expect(page.locator("canvas")).toBeVisible({ timeout: 20000 });
  await expect(page.getByText("Baroque")).toBeVisible();
  await page.waitForTimeout(4500); // let proxied textures stream in

  const canvas = page.locator("canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("no canvas box");

  // The hall recedes from the entrance with paintings on both walls. Sweep the
  // left two-thirds at picture height until the raycast hits a frame — clear of
  // the docent's "?" trigger at the right edge, mid-height (clicking it opens a
  // panel over the view). Probes are spaced past the gallery's 320ms
  // double-click window, so two never pair into a full-screen double-click.
  const inspect = page.getByTestId("inspect");
  let opened = false;
  sweep: for (const fy of [0.42, 0.36, 0.5]) {
    for (let fx = 0.06; fx <= 0.66; fx += 0.05) {
      await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
      await page.waitForTimeout(350);
      if (await inspect.isVisible().catch(() => false)) {
        opened = true;
        break sweep;
      }
    }
  }
  expect(opened, "inspect lightbox opened on a painting click").toBeTruthy();
  return inspect;
}

test("museum renders and a painting opens the inspect lightbox", async ({
  page,
}) => {
  const inspect = await openAPainting(page);
  // The lightbox carries a title heading and a Commons source link.
  await expect(inspect.locator("h2")).toBeVisible();
  await expect(inspect.getByRole("link", { name: "Commons" })).toBeVisible();
});

test("the docent is told which painting is in view", async ({ page }) => {
  // text-only docent (no microphone path), and a canned answer — no model call
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    delete w.webkitSpeechRecognition;
    delete w.SpeechRecognition;
  });
  const asked: { body?: { work?: string; workId?: unknown } } = {};
  await page.route("**/api/ask", async (r) => {
    asked.body = r.request().postDataJSON();
    await r.fulfill({ json: { answer: "A canned answer.", sources: [] } });
  });

  const inspect = await openAPainting(page);
  const title = (await inspect.locator("h2").textContent())?.trim();
  await inspect.getByRole("button", { name: "Full screen" }).click(); // deep-zoom
  await page.getByRole("button", { name: "Ask the docent" }).first().click();
  const box = page.getByPlaceholder(/ask about art/i);
  await box.fill("Who painted this?");
  await box.press("Enter");

  await expect(page.getByText("A canned answer.")).toBeVisible();
  // the title for the prompt, and the id the server reads its notes by
  expect(asked.body?.work).toBe(title);
  expect(typeof asked.body?.workId).toBe("number");
});

test("docent falls back to the browser voice when Ava is unavailable", async ({
  page,
}) => {
  // Record what the page asks the browser to say (no real audio here), and
  // provide a recognizer so the voice-conversation path is taken.
  await page.addInitScript(() => {
    const said: string[] = [];
    Object.assign(window, { __said: said });
    window.speechSynthesis.speak = (u: SpeechSynthesisUtterance) => {
      said.push(u.text);
      setTimeout(() => u.dispatchEvent(new Event("end")), 0);
    };
    class FakeRecognition {
      start() {}
      stop() {}
      abort() {}
    }
    Object.assign(window, { webkitSpeechRecognition: FakeRecognition });
  });
  // the neural voice is down, as when Microsoft rotated its endpoint's auth
  await page.route("**/api/speak", (r) =>
    r.fulfill({ status: 502, body: "tts failed" }),
  );

  await page.goto("/museum/caravaggio");
  await expect(page.locator("canvas")).toBeVisible({ timeout: 20000 });
  await page.getByRole("button", { name: "Ask the docent" }).first().click();

  // the spoken greeting still happens — in the browser's own voice
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { __said: string[] }).__said),
    )
    .toHaveLength(1);
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
