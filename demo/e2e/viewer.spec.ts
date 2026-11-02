import { readdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const API = "http://127.0.0.1:4600";
const DATA = path.join(import.meta.dirname, "..", "server", "data");

type Watch = { errors: string[]; hosts: Set<string> };

function watch(page: Page): Watch {
  const seen: Watch = { errors: [], hosts: new Set() };
  page.on("pageerror", (error) => seen.errors.push(error.message));
  page.on("console", (message) => {
    const text = message.text();
    if (message.type() === "error" && !text.startsWith("Failed to load resource"))
      seen.errors.push(text);
  });
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol.startsWith("http")) seen.hosts.add(url.origin);
  });
  return seen;
}

const events = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { tvEvents: { name: string; value: any }[] })
        .tvEvents,
  );

const open = (page: Page, query: string) => page.goto(`/cases.html?${query}`);
const name = (page: Page, viewer: string, text: string) =>
  page.locator(`.${viewer} .qt-name`, { hasText: text }).first();

// A label takes no pointer events. The icon of a node is at the top of its group.
async function pressNode(page: Page, viewer: string, text: string) {
  const node = page.locator(`.${viewer} g.qt-node`, { hasText: text }).first();
  // The node moves to its place for 0.6 s after a Show press.
  await page.waitForTimeout(900);
  const label = await node.locator(".qt-name").boundingBox();
  if (label === null) throw new Error(`no node ${text}`);
  await page.mouse.click(label.x + label.width / 2, label.y - 14);
}

let seen: Watch;
test.beforeEach(({ page }) => {
  seen = watch(page);
});
test.afterEach(({}, info) => {
  if (info.status === "passed") expect(seen.errors).toEqual([]);
});

test.describe("connect to an API", () => {
  test("a url renders the payload @prod", async ({ page, baseURL }) => {
    await open(page, "case=url&path=/graphs/catalog");
    await expect(page.locator(".a .qt-name").first()).toBeVisible();
    await expect(page.locator(".a .catbar")).toBeVisible();
    // Only the page itself and the configured API get a request.
    expect([...seen.hosts].sort()).toEqual([API, baseURL as string].sort());
  });

  test("shows a loading state until the slow answer comes", async ({ page }) => {
    await open(page, "case=url&path=/slow/catalog?ms=1500");
    await expect(page.locator(".a .overlay")).toHaveText("Loading the data");
    await expect(page.locator(".a .qt-name").first()).toBeVisible();
    await expect(page.locator(".a .overlay")).toHaveCount(0);
  });

  test("load reads the payload out of an envelope", async ({ page }) => {
    await open(page, "case=envelope");
    await expect(page.locator(".a .qt-name").first()).toBeVisible();
  });

  test("load sends the auth header", async ({ page }) => {
    await open(page, "case=auth");
    await expect(page.locator(".a .qt-name").first()).toBeVisible();
  });

  test("a 401 shows the status and no server text", async ({ page }) => {
    await open(page, "case=url&path=/auth/catalog");
    const overlay = page.locator(".a .overlay");
    await expect(overlay).toContainText("The data did not load");
    await expect(overlay).toContainText("status 401");
    await expect(overlay).not.toContainText("secret");
    expect(await events(page)).toContainEqual({
      name: "error",
      value: { kind: "http", status: 401 },
    });
  });

  test("Try again loads after a failure", async ({ page }) => {
    let healthy = false;
    await page.route("**/api/graphs/services", (route) =>
      healthy ? route.continue() : route.fulfill({ status: 500, body: "{}" }),
    );
    await open(page, "case=url&path=/graphs/services");
    await expect(page.locator(".a .overlay")).toContainText("status 500");
    healthy = true;
    await page.locator(".a .overlay button", { hasText: "Try again" }).click();
    await expect(name(page, "a", "API Gateway")).toBeVisible();
  });

  test("an answer that is not JSON shows a notice", async ({ page }) => {
    await open(page, "case=url&path=/fail/notjson");
    await expect(page.locator(".a .overlay")).toContainText("not valid JSON");
  });

  test("a closed port shows a notice", async ({ page }) => {
    await page.route("**/api/graphs/catalog", (route) => route.abort());
    await open(page, "case=url&path=/graphs/catalog");
    await expect(page.locator(".a .overlay")).toContainText("cannot be reached");
  });

  test("a data prop renders, and a new prop replaces it", async ({ page }) => {
    await open(page, "case=data");
    await expect(name(page, "a", "From a prop")).toBeVisible();
    await page.click("#new-data");
    await expect(name(page, "a", "New prop data")).toBeVisible();
  });

  test("a late answer of the old url does not replace the new url", async ({
    page,
  }) => {
    await open(page, "case=switch");
    await page.click("#to-fast");
    await expect(name(page, "a", "API Gateway")).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(name(page, "a", "API Gateway")).toBeVisible();
    expect(await page.locator(".a .qt-name").count()).toBeLessThan(5);
  });

  test("a render does not load again; the ref does", async ({
    page,
  }) => {
    let count = 0;
    page.on("request", (request) => {
      if (request.method() === "GET" && request.url().endsWith("/api/graphs/services"))
        count += 1;
    });
    const calls = () => count;
    await open(page, "case=reload");
    await expect(name(page, "a", "API Gateway")).toBeVisible();
    // StrictMode mounts the viewer two times in development; a production app has one.
    const first = calls();
    await page.click("#rerender");
    await page.click("#rerender");
    await page.waitForTimeout(300);
    expect(calls()).toBe(first);
    await page.click("#ref");
    await expect.poll(calls).toBe(first + 1);
  });
});

test.describe("mock data of the MCP widget", () => {
  const files = readdirSync(DATA).map((file) => file.replace(/\.json$/, ""));
  for (const file of files)
    test(`${file} renders or gives a notice`, async ({ page }) => {
      await open(page, `case=url&path=/graphs/${file}&profile=qdic`);
      await expect(
        page.locator(".a .graph-canvas svg, .a .overlay").first(),
      ).toBeVisible();
      await open(page, `case=url&path=/graphs/${file}`);
      await expect(
        page.locator(".a .graph-canvas svg, .a .overlay").first(),
      ).toBeVisible();
    });

  const nodes = (count: number) =>
    JSON.stringify({
      nodes: Array.from({ length: count }, (_, i) => ({
        id: `n${i}`,
        type: "item",
        label: `Node ${i}`,
        attrs: { text: "x".repeat(400) },
      })),
    });

  test("a payload of 600 KB renders", async ({ page }) => {
    const body = nodes(1400);
    expect(body.length).toBeGreaterThan(600_000);
    await page.route("**/api/graphs/big", (route) => route.fulfill({ body }));
    await open(page, "case=url&path=/graphs/big");
    await expect(page.locator(".a .qt-name").first()).toBeVisible();
    await expect(page.locator(".a .overlay")).toHaveCount(0);
  });

  test("a payload over the node limit gives a notice", async ({ page }) => {
    const body = nodes(2001);
    await page.route("**/api/graphs/big", (route) => route.fulfill({ body }));
    await open(page, "case=url&path=/graphs/big");
    await expect(page.locator(".a .overlay")).toContainText("limit of 2,000 nodes");
  });

  test("a payload with a bad shape gives a notice with neutral words", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await open(page, "case=url&path=/fail/badshape");
    const notice = page.locator(".a .notice");
    await expect(notice).toContainText("data provider");
    for (const word of ["AI client", "QDIC", "Quollio", "chat"])
      await expect(notice).not.toContainText(word);
    await notice.locator("button", { hasText: "Copy details" }).click();
    await expect(notice.locator("button", { hasText: "Copied" })).toBeVisible();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain("The topology chart");
    expect(copied).not.toContain("Quollio");
  });
});

test.describe("vocabulary", () => {
  test("the default gives no meaning to a type name", async ({ page }) => {
    await open(page, "case=url&path=/graphs/catalog");
    await page.locator(".a .controls button", { hasText: "Types" }).click();
    const menu = page.locator(".a .menu:visible");
    await expect(menu).toBeVisible();
    await expect(menu).toContainText("Table");
    await expect(menu).not.toContainText("Catalog structure");
    await expect(menu.locator(".prov").first()).toBeHidden();
    await expect(page.locator(".a .data-notice")).toHaveCount(0);
  });

  test("the QDIC preset gives its groups and icons", async ({ page }) => {
    await open(page, "case=url&path=/graphs/catalog&profile=qdic");
    await page.locator(".a .controls button", { hasText: "Types" }).click();
    await expect(page.locator(".a .menu:visible")).toContainText("Catalog structure");
  });

  test("a payload with its own types shows them", async ({ page }) => {
    await open(page, "case=url&path=/graphs/services");
    await expect(name(page, "a", "API Gateway")).toBeVisible();
    await page.locator(".a .controls button", { hasText: "Types" }).click();
    const menu = page.locator(".a .menu:visible");
    await expect(menu).toContainText("Service");
    await expect(menu).toContainText("Data store");
  });
});

test("a payload with its own types renders with no warning", async ({ page }) => {
  await open(page, "case=url&path=/graphs/services");
  await expect(name(page, "a", "API Gateway")).toBeVisible();
  await expect(page.locator(".a .data-notice")).toHaveCount(0);
});

test.describe("page integration", () => {
  test("the page CSS and the viewer CSS do not touch each other @prod", async ({
    page,
  }) => {
    await open(page, "case=url&path=/graphs/services");
    await expect(name(page, "a", "API Gateway")).toBeVisible();
    const found = await page.evaluate(() => {
      const css = (el: Element, key: string) =>
        getComputedStyle(el).getPropertyValue(key).trim();
      const root = (document.querySelector(".a") as HTMLElement).shadowRoot as ShadowRoot;
      const shell = root.querySelector(".shell") as HTMLElement;
      const button = root.querySelector("button") as HTMLElement;
      return {
        probeColour: css(document.querySelector(".host-probe") as Element, "color"),
        splitDisplay: css(document.getElementById("probe-split") as Element, "display"),
        hostButton: css(document.getElementById("probe-button") as Element, "background-color"),
        shellInk: css(shell, "--ink"),
        shellCanvas: css(shell, "--canvas"),
        viewerButton: css(button, "background-color"),
        shellFont: css(shell, "font-family"),
      };
    });
    expect(found.probeColour).toBe("rgb(255, 0, 255)");
    expect(found.splitDisplay).toBe("inline");
    expect(found.hostButton).toBe("rgb(255, 0, 0)");
    expect(found.shellInk).toBe("#0f172a");
    expect(found.shellCanvas).toBe("#f4f4f5");
    expect(found.viewerButton).not.toBe("rgb(255, 0, 0)");
    expect(found.shellFont).not.toContain("Georgia");
  });

  test("two viewers on one page do not share state @prod", async ({ page }) => {
    await open(page, "case=two");
    await expect(name(page, "b", "API Gateway")).toBeVisible();
    await expect(page.locator(".a .qt-name").first()).toBeVisible();
    const titleInA = (text: string) =>
      page.locator(".a .insp-title", { hasText: text });
    const inspectorB = page.locator(".b .insp-title");
    await expect(inspectorB).toContainText("API Gateway");
    await expect(titleInA("API Gateway")).toHaveCount(0);

    const typesA = page.locator(".a .controls button", { hasText: "Types" });
    await typesA.click();
    await expect(page.locator(".a .menu:visible")).toBeVisible();
    await expect(page.locator(".b .menu:visible")).toHaveCount(0);
    await page.keyboard.press("Escape");

    // The second viewer is below the fold of the page.
    await page.locator(".b .inspector button", { hasText: "Show" }).click();
    await expect(name(page, "b", "Orders")).toBeVisible();
    await page.locator(".b .graph-canvas").scrollIntoViewIfNeeded();
    await pressNode(page, "b", "Orders");
    await expect(inspectorB).toContainText("Orders");
    await expect(titleInA("Orders")).toHaveCount(0);
  });

  test("menus open and close in the Shadow DOM", async ({ page }) => {
    await open(page, "case=url&path=/graphs/services");
    const types = page.locator(".a .controls button", { hasText: "Types" });
    await types.click();
    await expect(page.locator(".a .menu:visible")).toHaveCount(1);
    await expect(types).toHaveAttribute("aria-expanded", "true");
    await page.locator(".a .menu:visible").locator(".name").first().hover();
    await page.keyboard.press("Escape");
    await expect(page.locator(".a .menu:visible")).toHaveCount(0);
    await types.click();
    await page.locator("h1").click();
    await expect(page.locator(".a .menu:visible")).toHaveCount(0);
  });

  test("the shortcuts work only in the viewer", async ({ page }) => {
    await open(page, "case=url&path=/graphs/services");
    await expect(name(page, "a", "API Gateway")).toBeVisible();
    const search = page.locator(".a").getByPlaceholder("Search nodes");

    await page.locator("#host-input").click();
    await page.keyboard.type("a/b");
    await expect(page.locator("#host-input")).toHaveValue("a/b");

    await page.locator("h1").click();
    await page.keyboard.press("/");
    await expect(search).not.toBeFocused();

    await page.locator(".a .graph-canvas").hover();
    await page.keyboard.press("/");
    await expect(search).toBeFocused();
    await page.keyboard.type("Pay/");
    await expect(search).toHaveValue("Pay/");
  });

  test("unmount and mount again leave nothing behind", async ({ page }) => {
    await open(page, "case=toggle");
    await expect(name(page, "a", "API Gateway")).toBeVisible();
    await page.click("#toggle");
    await expect(page.locator(".a")).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.body.querySelectorAll(":scope > *:not(#root):not(script)").length,
      ),
    ).toBe(0);
    await page.click("#toggle");
    await expect(name(page, "a", "API Gateway")).toBeVisible();
    await expect(page.locator(".a .shell")).toHaveCount(1);
  });

  test("the widget look has a working full-screen button @prod", async ({ page }) => {
    await open(page, "case=url&path=/graphs/services&variant=widget");
    await expect(page.locator(".a .shell")).toHaveAttribute("data-host", "embedded");
    const toggle = page.locator(".a .display-btn");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(
      await page.evaluate(() => document.fullscreenElement?.className),
    ).toBe("a");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
  });

  test("text can change by key and by language", async ({ page }) => {
    await open(page, "case=strings");
    await expect(page.locator(".a .controls")).toContainText("Kinds of thing");
    await open(page, "case=url&path=/graphs/services&lang=ja");
    await expect(page.locator(".a").getByPlaceholder("ノードを検索")).toBeVisible();
  });
});

test.describe("events", () => {
  test("onSelect gives the node, and onSave gives the changes @prod", async ({
    page,
  }) => {
    await open(page, "case=url&path=/graphs/services");
    await expect(name(page, "a", "API Gateway")).toBeVisible();
    await page.locator(".a .inspector button", { hasText: "Show" }).click();
    await expect(name(page, "a", "Orders")).toBeVisible();
    await pressNode(page, "a", "Orders");
    await expect
      .poll(async () =>
        (await events(page)).filter((e) => e.name === "select").at(-1)?.value,
      )
      .toMatchObject({
        kind: "node",
        id: "orders",
        label: "Orders",
        type: "service",
        attrs: { language: "Kotlin" },
      });

    await page.locator(".a .controls button[aria-controls]").first().click();
    const row = page.locator(".a .wb-table tbody tr:not(.wb-pad)").first();
    await row.locator("td").nth(5).dblclick();
    await page.locator(".a td.editing input").first().fill("Edge Gateway");
    await page.keyboard.press("Enter");
    await expect(name(page, "a", "Edge Gateway")).toBeVisible();
    await expect
      .poll(async () =>
        (await events(page)).filter((e) => e.name === "save").length,
      )
      .toBe(0);

    await page.locator(".a .change-bar button", { hasText: "Save changes" }).click();
    await expect
      .poll(async () =>
        (await events(page)).filter((e) => e.name === "save").at(-1)?.value,
      )
      .toMatchObject([{ before: "API Gateway", after: "Edge Gateway" }]);
  });
});

test.describe("hostile payload", () => {
  test("no payload text becomes markup, script or a link @prod", async ({ page }) => {
    await open(page, "case=hostile");
    await expect(page.locator(".a .graph-canvas svg")).toBeVisible();
    await page.locator(".a .controls button[aria-controls]").first().click();
    await expect(page.locator(".a .wb-table tbody tr").first()).toBeVisible();
    await page.waitForTimeout(500);
    const found = await page.evaluate(() => {
      const root = (document.querySelector(".a") as HTMLElement).shadowRoot as ShadowRoot;
      return {
        hacked: (window as unknown as { tvHacked?: number }).tvHacked ?? null,
        images: root.querySelectorAll("img").length,
        scriptLinks: [...root.querySelectorAll("a")].filter((a) =>
          a.getAttribute("href")?.toLowerCase().startsWith("javascript"),
        ).length,
        handlers: [...root.querySelectorAll("*")].filter((el) =>
          [...el.attributes].some((attr) => attr.name.startsWith("on")),
        ).length,
      };
    });
    expect(found).toEqual({ hacked: null, images: 0, scriptLinks: 0, handlers: 0 });
  });
});

test.describe("strict CSP", () => {
  test("the viewer renders with no unsafe-eval and no unsafe-inline @prod", async ({
    page,
  }, info) => {
    test.skip(info.project.name !== "prod", "Vite dev injects inline code");
    const violations: string[] = [];
    await page.exposeFunction("noteViolation", (text: string) => violations.push(text));
    await page.addInitScript(() => {
      document.addEventListener("securitypolicyviolation", (event) => {
        (window as unknown as { noteViolation(text: string): void }).noteViolation(
          `${event.violatedDirective} ${event.blockedURI}`,
        );
      });
    });
    await page.goto("/csp.html");
    await expect(page.locator(".a .qt-name").first()).toBeVisible();
    await page.locator(".a .controls button", { hasText: "Types" }).click();
    await expect(page.locator(".a .menu:visible")).toBeVisible();
    expect(violations).toEqual([]);
  });
});
