import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

const DIST = path.join(import.meta.dirname, "..", "dist");

// Every page that the site built, from its own sitemap.
const sitemap = readFileSync(path.join(DIST, "sitemap-0.xml"), "utf8");
const pages = [...sitemap.matchAll(/<loc>[^<]*\/topology-viewer\/([^<]*)<\/loc>/g)].map(
  (one) => one[1] as string,
);

function watch(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("response", (answer) => {
    if (answer.status() >= 400) errors.push(`${answer.status()}: ${answer.url()}`);
  });
  return errors;
}

const demo = (page: Page, name: string) => page.locator(`[data-demo="${name}"]`);
const viewerIn = (where: Locator) => where.locator(".shell").first();
const nodes = (where: Locator) => where.locator("g.qt-node");

async function ready(where: Locator) {
  await where.scrollIntoViewIfNeeded();
  await expect(nodes(where).first()).toBeAttached({ timeout: 30_000 });
}

test("the site has every page", () => {
  expect(pages.length).toBeGreaterThan(35);
});

for (const slug of pages)
  test(`page /${slug} loads, and each of its demos runs with no error`, async ({ page }) => {
    const errors = watch(page);
    await page.goto(slug);
    await expect(page.locator("h1").first()).toBeVisible();
    const demos = page.locator("[data-demo]");
    for (const one of await demos.all()) {
      await one.scrollIntoViewIfNeeded();
      await expect(one.locator(".tv-demo-error")).toHaveCount(0);
      // A viewer has a real size: a viewer with no height is the most common failure.
      await expect(viewerIn(one)).toBeVisible({ timeout: 30_000 });
      await expect(nodes(one).first()).toBeAttached({ timeout: 30_000 });
      const box = await viewerIn(one).boundingBox();
      expect(box?.height).toBeGreaterThan(250);
      // The code shown is the code that runs.
      await expect(one.locator("details")).toContainText("export default function Demo");
    }
    expect(errors).toEqual([]);
  });

test("the source shown is the file, and it can be copied", async ({ page }) => {
  await page.goto("start/quick-start/");
  const one = demo(page, "quick-start");
  await expect(one.locator("details")).toContainText('from "topology-viewer/react"');
  await expect(one.locator('details button[data-code]')).toBeAttached();
});

test("the site search finds a page", async ({ page }) => {
  await page.goto("start/introduction/");
  await page.locator("site-search button").first().click();
  await page.locator("site-search input").fill("onSave");
  await expect(page.locator(".pagefind-ui__result").first()).toBeVisible({ timeout: 15_000 });
});

test("demos follow the light and dark switch of the site", async ({ page }) => {
  await page.goto("start/quick-start/");
  const one = demo(page, "quick-start");
  await ready(one);
  const colour = () =>
    viewerIn(one).evaluate((el) => getComputedStyle(el).backgroundColor);
  const set = (theme: string) =>
    page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
  await set("light");
  await expect.poll(colour).toBe("rgb(244, 244, 245)");
  await set("dark");
  await expect.poll(colour).toBe("rgb(16, 16, 20)");
  await ready(one);
});

test("no control of a demo comes over the header of the site", async ({ page }) => {
  await page.goto("components/canvas/");
  const one = demo(page, "custom-nodes");
  await ready(one);
  const under = await one.locator(".fam-tab").first().evaluate((el) => {
    window.scrollTo(0, scrollY + el.getBoundingClientRect().top - 20);
    const box = el.getBoundingClientRect();
    const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return top?.closest("header") !== null;
  });
  expect(under).toBe(true);
});

test("the theme playground changes the viewer and writes the code", async ({ page }) => {
  await page.goto("customize/themes/");
  const tool = page.locator('[data-tool="playground"]');
  await ready(tool);
  await tool.locator("select").first().selectOption("Paper");
  const code = tool.locator("[data-playground-code]");
  await expect(code).toContainText('frameRadius: "12px"');
  await expect(code).toContainText("Georgia");
  await expect
    .poll(() => viewerIn(tool).evaluate((el) => getComputedStyle(el).borderTopLeftRadius))
    .toBe("12px");
  await tool.getByRole("slider", { name: "Frame radius" }).fill("20");
  await expect(code).toContainText('frameRadius: "20px"');
  await expect
    .poll(() => viewerIn(tool).evaluate((el) => getComputedStyle(el).borderTopLeftRadius))
    .toBe("20px");
  await tool.locator("select").first().selectOption("Default");
  await expect(code).toHaveText("<TopologyViewer data={graph} />");
});

test("the parts explorer names what is under the pointer", async ({ page }) => {
  await page.goto("reference/parts/");
  const tool = page.locator('[data-tool="explorer"]');
  await ready(tool);
  await tool.locator(".fam-tab").first().hover();
  await expect(tool.locator("[data-explorer-name]").first()).toHaveAttribute(
    "data-explorer-name",
    "family-tab",
  );
  await expect(tool).toContainText("stable");
  await expect(tool).toContainText("Inside: family-tab");
  await expect(page.locator(".explorer-box")).toBeVisible();
});

test("custom nodes are real React on the canvas", async ({ page }) => {
  await page.goto("components/canvas/");
  const one = demo(page, "custom-nodes");
  await ready(one);
  const button = one.getByRole("button", { name: /replicas \+/ }).first();
  await button.scrollIntoViewIfNeeded();
  const before = await button.innerText();
  await button.click();
  await expect(button).not.toHaveText(before);
});

test("full screen covers the header of the site", async ({ page }) => {
  await page.goto("components/fullscreen/");
  const one = demo(page, "fullscreen");
  await ready(one);
  await one.locator(".display-btn").click();
  await expect(one.locator(".display-btn")).toHaveAttribute("aria-pressed", "true");
  const fills = await viewerIn(one).evaluate((el) => {
    const box = el.getBoundingClientRect();
    const top = document.elementsFromPoint(innerWidth / 2, 20)[0];
    return {
      size: box.width === innerWidth && box.height === innerHeight,
      inFront: top?.closest("header") === null,
    };
  });
  expect(fills).toEqual({ size: true, inFront: true });
  await page.keyboard.press("Escape");
  await expect(one.locator(".display-btn")).toHaveAttribute("aria-pressed", "false");
});

test("saving: the demo shows pending, new changes only, and a failure", async ({ page }) => {
  await page.goto("components/saving/");
  const one = demo(page, "save-backend");
  await ready(one);
  await one.getByRole("button", { name: "Open the table" }).click();
  const edit = async (from: string, to: string) => {
    await one.locator(".wb-table tbody tr.row td:not(.sel)", { hasText: from }).first().dblclick();
    const input = one.locator(".cell-edit input").first();
    await input.fill(to);
    await input.press("Enter");
  };
  await edit("API Gateway", "Gateway");
  await one.locator(".change-bar .primary").click();
  await expect(one.locator(".change-bar .primary")).toContainText("Saving");
  await expect(one.locator(".change-bar")).toHaveCount(0, { timeout: 5_000 });
  await one.getByRole("button", { name: "says no" }).click();
  await edit("Gateway", "Gateway 2");
  await one.locator(".change-bar .primary").click();
  await expect(one.locator(".change-error")).toHaveText("Orders is locked by Ana.");
  const log = await one.locator(".demo-log").innerText();
  expect(log.split("\n")[0]).toContain('"after":"Gateway 2"');
  expect(log.split("\n")[0]).not.toContain('"after":"Gateway"');
});

test("the example form validates and submits", async ({ page }) => {
  await page.goto("examples/admin-table/");
  const one = demo(page, "example-admin-table");
  await ready(one);
  await expect(one.locator(".wb-table")).toBeVisible();
  await expect(one).toContainText("All changes saved.");
  await one.locator(".wb-table tbody tr.row td:not(.sel)", { hasText: /^5$/ }).first().dblclick();
  const input = one.locator(".cell-edit input").first();
  await input.fill("99");
  await input.press("Enter");
  await expect(one.locator(".form-error")).toHaveText("The plan allows 10 seats.");
  await input.fill("7");
  await input.press("Enter");
  await expect(one).toContainText("You have unsaved changes.");
  await one.getByRole("button", { name: "Submit to backend" }).click();
  await expect(one.locator(".demo-log")).toContainText('"after": 7');
  await expect(one).toContainText("All changes saved.");
});

test("the inspector demo shows the mapped fields at once", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("components/inspector/");
  const one = demo(page, "inspector-fields");
  await ready(one);
  const facts = one.locator(".facts");
  await expect(facts).toContainText("Owner");
  await expect(facts).toContainText("ana@example.com");
  await expect(facts).toContainText("$1240");
  await expect(facts).toContainText("example.com");
  await expect(facts).not.toContainText("9f3a");
});

test("the reference is generated", async ({ page }) => {
  await page.goto("reference/commands/");
  await expect(page.locator("#topologycommands-focus")).toContainText("(id: string) => void");
  await expect(page.locator("#topologycommands-focus")).toContainText("centres the chart");
  await page.goto("reference/props/");
  // A description is Markdown, so no raw backtick shows.
  await expect(page.locator("#topologyoptions-data td").last().locator("code").first()).toHaveText("url");
  await page.goto("reference/tokens/");
  await expect(page.locator("table")).not.toHaveCount(0);
  await expect(page.locator("code", { hasText: /^--tv-frame-radius$/ })).toBeVisible();
  await page.goto("reference/parts/");
  await expect(page.locator("#part-triple-row")).toBeVisible();
});
