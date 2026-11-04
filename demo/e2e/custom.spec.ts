import { expect, test, type Page } from "@playwright/test";

const open = (page: Page, query: string) => page.goto(`/cases.html?case=${query}`);
const ready = (page: Page) =>
  expect(page.locator(".a g.qt-node").first()).toBeAttached();
const log = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { tvCustom: { name: string; value: any }[] }).tvCustom,
  );
const logged = async (page: Page, name: string) =>
  (await log(page)).filter((one) => one.name === name).map((one) => one.value);

// Selects the node with this label, by a click on its group.
async function pick(page: Page, label: string, viewer = "a") {
  const node = page.locator(`.${viewer} g.qt-node`, { hasText: label }).first();
  await page.waitForTimeout(900);
  const box = await node.boundingBox();
  if (box === null) throw new Error(`no node ${label}`);
  await page.mouse.click(box.x + box.width / 2, box.y + 8);
}

const css = (page: Page, selector: string, name: string) =>
  page.locator(selector).first().evaluate((el, key) => getComputedStyle(el).getPropertyValue(key), name);

const openTable = (page: Page) => page.locator(".a .ctl-btn", { hasText: "Dataset" }).click();

async function editFirstName(page: Page, value: string) {
  const cell = page.locator(".a .wb-table tbody tr.row td:not(.sel)", { hasText: "API Gateway" }).first();
  await cell.dblclick();
  const input = page.locator(".a .cell-edit input").first();
  await input.fill(value);
  await input.press("Enter");
}

let errors: string[];
test.beforeEach(({ page }) => {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().startsWith("Failed to load"))
      errors.push(message.text());
  });
});
test.afterEach(({}, info) => {
  if (info.status === "passed") expect(errors).toEqual([]);
});

test.describe("style", () => {
  test("the default frame has square corners", async ({ page }) => {
    await open(page, "url&path=/graphs/services");
    await ready(page);
    expect(await css(page, ".a .shell", "border-top-left-radius")).toBe("0px");
  });

  test("every element of the shell has a public part name", async ({ page }) => {
    await open(page, "url&path=/graphs/services");
    await ready(page);
    await pick(page, "API Gateway");
    await openTable(page);
    await expect(page.locator(".a .wb-table")).toBeVisible();
    const missing = await page.evaluate(() => {
      const root = (document.querySelector(".a") as HTMLElement).shadowRoot as ShadowRoot;
      const out = new Set<string>();
      for (const el of root.querySelectorAll(".shell, .shell *")) {
        if (el.closest("svg:not(.qt-svg)") !== null && el.tagName.toLowerCase() !== "svg") continue;
        if (el.closest(".qt-root") !== null) continue;
        if (el.tagName === "SLOT") continue;
        if (!el.hasAttribute("part")) out.add(`${el.tagName} ${el.className}`);
      }
      return [...out];
    });
    expect(missing).toEqual([]);
  });

  test("the canvas elements have public part names", async ({ page }) => {
    await open(page, "c-keys");
    await ready(page);
    await expect(page.locator(".a g.qt-node").first()).toHaveAttribute("part", /\bnode\b/);
    await expect(page.locator(".a path.qt-edge").first()).toHaveAttribute("part", /\bedge\b/);
    await expect(page.locator(".a text.qt-name").first()).toHaveAttribute("part", "node-label");
  });

  test("a theme, ::part, a class with `styles` and an inline style all apply", async ({ page }) => {
    await open(page, "c-style");
    await ready(page);
    await pick(page, "API Gateway");
    expect(await css(page, ".a .shell", "border-top-left-radius")).toBe("14px");
    expect(await css(page, ".a .shell", "outline-color")).toBe("rgb(0, 128, 0)");
    expect(await css(page, ".a .shell", "font-family")).toContain("Courier New");
    expect(await css(page, ".a .fam-tab", "letter-spacing")).toBe("3px");
    expect(await css(page, ".a .fam-tab", "border-top-left-radius")).not.toBe("");
    expect(await css(page, ".a .insp-title", "letter-spacing")).toBe("2px");
    expect(await css(page, ".a .triple", "padding-top")).toBe("9px");
    expect(await css(page, ".a .float-card", "--tv-surface")).toBe("rgb(250, 240, 230)");
  });

  test("the dark theme of the developer changes the colours and keeps the chart", async ({ page }) => {
    await open(page, "c-dark");
    await ready(page);
    await pick(page, "API Gateway");
    await expect(page.locator(".a .insp-title")).toContainText("API Gateway");
    const light = await css(page, ".a .shell", "background-color");
    await page.click("#mode");
    await expect.poll(() => css(page, ".a .shell", "background-color")).toBe("rgb(16, 16, 20)");
    expect(light).not.toBe("rgb(16, 16, 20)");
    expect(await css(page, ".a .inspector", "color")).toBe("rgb(212, 212, 216)");
    await expect(page.locator(".a .shell")).toHaveAttribute("data-theme", "dark");
    expect(await css(page, ".a .shell", "color-scheme")).toBe("dark");
    // The selection stays: a new theme is not new data.
    await expect(page.locator(".a .insp-title")).toContainText("API Gateway");
    await page.click("#mode");
    await expect.poll(() => css(page, ".a .shell", "background-color")).toBe(light);
  });

  test("with pageStyles a utility class wins, and the reset of the page does not", async ({ page }) => {
    await open(page, "c-page-styles");
    await ready(page);
    await expect.poll(() => css(page, ".a .fam-tab", "color")).toBe("rgb(1, 2, 3)");
    // A rule of a lower layer stays under the viewer.
    expect(await css(page, ".a .fam-tab", "background-color")).not.toBe("rgb(255, 0, 255)");
  });

  test("a sheet by a link also takes its place under and over the viewer", async ({ page }) => {
    await open(page, "c-page-link");
    await ready(page);
    // The rule of the viewer for this property is more specific; a utility still wins by its layer.
    await expect.poll(() => css(page, ".a .fam-tab", "color")).toBe("rgb(1, 2, 3)");
    expect(await css(page, ".a .ctl-btn", "color")).not.toBe("rgb(255, 0, 255)");
    expect(await css(page, ".a .ctl-btn", "padding-top")).not.toBe("0px");
  });

  test("with no option the styles of the page stay out", async ({ page }) => {
    await open(page, "url&path=/graphs/services");
    await ready(page);
    expect(await css(page, ".a .btn, .a button", "background-color")).not.toBe("rgb(255, 0, 0)");
    const adopted = await page.evaluate(
      () => (document.querySelector(".a") as HTMLElement).shadowRoot?.querySelectorAll("link").length,
    );
    expect(adopted).toBe(0);
  });
});

test.describe("full screen", () => {
  const button = (page: Page) => page.locator(".a .display-btn");
  const fills = (page: Page) =>
    page.locator(".a .shell").evaluate((el) => {
      const box = el.getBoundingClientRect();
      return Math.abs(box.width - innerWidth) < 1 && Math.abs(box.height - innerHeight) < 1 && box.x === 0 && box.y === 0;
    });

  test("by default it fills the browser view with no browser API", async ({ page }) => {
    await open(page, "c-full");
    await ready(page);
    await pick(page, "API Gateway");
    const before = await page.locator(".a").boundingBox();
    await button(page).click();
    await expect(button(page)).toHaveAttribute("aria-pressed", "true");
    expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
    expect(await fills(page)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe("hidden");
    // The page does not move, the chart stays, and the canvas takes the new size.
    expect(await page.locator(".a").boundingBox()).toEqual(before);
    await expect(page.locator(".a .insp-title")).toContainText("API Gateway");
    expect((await logged(page, "mode")).at(-1)).toBe("fullscreen");
  });

  test("a parent that traps the view gets a warning", async ({ page }) => {
    const warnings: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "warning") warnings.push(message.text());
    });
    await open(page, "c-full&trap");
    await ready(page);
    await button(page).click();
    await expect(button(page)).toHaveAttribute("aria-pressed", "true");
    expect(warnings.join()).toContain("does not fill the browser view");
  });

  test("Escape closes a menu first, then the full view, and keeps the selection", async ({ page }) => {
    await open(page, "c-full");
    await ready(page);
    await pick(page, "API Gateway");
    await button(page).click();
    await expect(button(page)).toHaveAttribute("aria-pressed", "true");
    await page.locator(".a .ctl-btn", { hasText: "Layout" }).or(page.locator(".a .ctl-btn").nth(2)).first().click();
    await expect(page.locator(".a .menu:not([hidden])")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(".a .menu:not([hidden])")).toHaveCount(0);
    await expect(button(page)).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Escape");
    await expect(button(page)).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator(".a .insp-title")).toContainText("API Gateway");
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe("");
    expect(await fills(page)).toBe(false);
  });

  test("the native mode uses the browser API", async ({ page }) => {
    await open(page, "c-full&how=native");
    await ready(page);
    await button(page).click();
    await expect(button(page)).toHaveAttribute("aria-pressed", "true");
    expect(await page.evaluate(() => document.fullscreenElement?.className)).toBe("a");
    await button(page).click();
    await expect(button(page)).toHaveAttribute("aria-pressed", "false");
  });

  test("a custom strategy runs instead", async ({ page }) => {
    await open(page, "c-full&how=custom");
    await ready(page);
    await button(page).click();
    await expect(button(page)).toHaveAttribute("aria-pressed", "true");
    expect(await logged(page, "enter")).toHaveLength(1);
    expect(await fills(page)).toBe(false);
    await button(page).click();
    await expect(button(page)).toHaveAttribute("aria-pressed", "false");
    expect(await logged(page, "exit")).toHaveLength(1);
  });

  test("off: no button", async ({ page }) => {
    await open(page, "c-full&how=off");
    await ready(page);
    await expect(button(page)).toHaveCount(0);
  });

  test("controlled: only the prop changes the mode", async ({ page }) => {
    await open(page, "c-full&how=controlled");
    await ready(page);
    await button(page).click();
    await expect(button(page)).toHaveAttribute("aria-pressed", "false");
    expect(await logged(page, "mode")).toEqual(["fullscreen"]);
    await page.click("#ctl");
    await expect(button(page)).toHaveAttribute("aria-pressed", "true");
    expect(await fills(page)).toBe(true);
  });

  test("Expand table takes the same way", async ({ page }) => {
    await open(page, "c-full");
    await ready(page);
    await openTable(page);
    await page.locator('.a .wb-bar [aria-label="Expand table"]').click();
    await expect(button(page)).toHaveCount(1);
    expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
    expect((await logged(page, "mode")).at(-1)).toBe("fullscreen");
  });
});

test.describe("save", () => {
  const save = (page: Page) => page.locator(".a .change-bar .primary");

  test("each save sends only the new changes", async ({ page }) => {
    await open(page, "c-save");
    await ready(page);
    await openTable(page);
    await editFirstName(page, "First");
    await save(page).click();
    await expect(page.locator(".a .change-bar")).toHaveCount(0);
    const cell = page.locator(".a .wb-table tbody tr.row td:not(.sel)", { hasText: "First" }).first();
    await cell.dblclick();
    await page.locator(".a .cell-edit input").first().fill("Second");
    await page.locator(".a .cell-edit input").first().press("Enter");
    await save(page).click();
    await expect(page.locator(".a .change-bar")).toHaveCount(0);
    const saves = await logged(page, "save");
    expect(saves).toHaveLength(2);
    expect(saves[0].changes).toHaveLength(1);
    expect(saves[0].changes[0].after).toBe("First");
    expect(saves[1].changes).toHaveLength(1);
    expect(saves[1].changes[0].after).toBe("Second");
    expect(saves[1].all.length).toBeGreaterThan(1);
    expect(await logged(page, "dirty")).toContain(true);
  });

  test("the bar waits for a promise, and the table takes no edit meanwhile", async ({ page }) => {
    await open(page, "c-save&save=slow");
    await ready(page);
    await openTable(page);
    await editFirstName(page, "Later");
    await save(page).click();
    await expect(save(page)).toBeDisabled();
    await expect(save(page)).toContainText("Saving");
    await expect(page.locator(".a .change-bar")).toHaveCount(0);
  });

  for (const how of ["reject", "thrown"]) {
    test(`a failure keeps the edits and hides the server text: ${how}`, async ({ page }) => {
      await open(page, `c-save&save=${how}`);
      await ready(page);
      await openTable(page);
      await editFirstName(page, "Kept");
      await save(page).click();
      await expect(page.locator(".a .change-error")).toHaveText("The changes could not be saved.");
      await expect(page.locator(".a .change-bar")).toBeVisible();
      await expect(save(page)).toBeEnabled();
      await expect(page.locator(".a .wb-table")).toContainText("Kept");
    });
  }

  test("the developer can choose the text of a failure", async ({ page }) => {
    await open(page, "c-save&save=text");
    await ready(page);
    await openTable(page);
    await editFirstName(page, "Kept");
    await save(page).click();
    await expect(page.locator(".a .change-error")).toHaveText("The server is busy.");
  });
});

test.describe("table", () => {
  test("columns, validation, cells, filters and the toolbar", async ({ page }) => {
    await open(page, "c-table");
    await ready(page);
    await openTable(page);
    const head = page.locator(".a .wb-table thead");
    await expect(head).toContainText("Display name");
    await expect(head).toContainText("Lang");
    await expect(head).toContainText("Shout");
    await expect(head).not.toContainText("Kind");
    await expect(page.locator(".a .wb-table")).toContainText("API GATEWAY");
    await expect(page.locator(".custom-cell").first()).toContainText("!");
    await expect(page.locator("#export")).toBeVisible();
    await expect(page.locator(".a .wb-bar")).not.toContainText("Nodes");
    // The order of the toolbar is the order of the items.
    const place = async (selector: string) => (await page.locator(selector).first().boundingBox())?.x ?? -1;
    expect(await place(".a .wb-count")).toBeLessThan(await place("#export"));
    await expect(page.locator(".a .wb-search")).toHaveCount(0);
    await editFirstName(page, "nope");
    await expect(page.locator(".a .form-error")).toHaveText("Not that value.");
    const input = page.locator(".a .cell-edit input").first();
    await input.fill("fine");
    await input.press("Enter");
    await expect(page.locator(".a .cell-edit")).toHaveCount(0);
    await expect(page.locator("#bar-after")).toHaveText("dirty");
    // An ID column that the developer locks takes no editor.
    await page.locator(".a .wb-table tbody tr.row td code").first().dblclick();
    await expect(page.locator(".a .cell-edit")).toHaveCount(0);
  });

  test("read only", async ({ page }) => {
    await open(page, "c-readonly");
    await ready(page);
    await openTable(page);
    await page.locator(".a .wb-table tbody tr.row td:not(.sel)", { hasText: "API Gateway" }).first().dblclick();
    await expect(page.locator(".a .cell-edit")).toHaveCount(0);
  });
});

test.describe("search", () => {
  const box = (page: Page) => page.locator(".a .search input");

  test("a match function, a limit, a placeholder, a result part", async ({ page }) => {
    await open(page, "c-search");
    await ready(page);
    await expect(box(page)).toHaveAttribute("placeholder", "Find a thing");
    await box(page).fill("Go");
    await expect(page.locator(".my-hit").first()).toContainText("Hit ");
    await expect(page.locator(".my-hit")).toHaveCount(1);
    await expect(page.locator(".a .search-results")).toContainText("more");
  });

  test("the pick is the developer's to stop", async ({ page }) => {
    await open(page, "c-search&stop");
    await ready(page);
    await box(page).fill("Go");
    await page.locator(".my-hit").first().click();
    expect(await logged(page, "pick")).toHaveLength(1);
    await expect(page.locator(".a .insp-title")).toHaveCount(0);
  });

  test("a source of hits, with its states", async ({ page }) => {
    await open(page, "c-search&remote");
    await ready(page);
    await box(page).fill("gate");
    await expect(page.locator(".my-hit")).toContainText("API Gateway");
    expect(await logged(page, "source")).toContain("gate");
    await box(page).fill("boom");
    await expect(page.locator(".a .search-results")).toContainText("The search failed.");
  });

  test("the key of the search can change", async ({ page }) => {
    await open(page, "c-search");
    await ready(page);
    await page.locator(".a g.qt-node").first().hover();
    await page.keyboard.press("/");
    await expect(box(page)).not.toBeFocused();
    await page.keyboard.press("Control+k");
    await expect(box(page)).toBeFocused();
  });
});

test.describe("slots", () => {
  test("custom content keeps React context and page CSS, at its place in the shell", async ({ page }) => {
    await open(page, "c-slots");
    await ready(page);
    await pick(page, "API Gateway");
    const notes = page.locator("#my-notes");
    await expect(notes).toContainText("Notes of API Gateway");
    await expect(notes).toBeVisible();
    expect(await css(page, "#my-notes", "color")).toBe("rgb(9, 8, 7)");
    // It lays out inside the inspector.
    const inside = await page.locator(".a .inspector").boundingBox();
    const box = await notes.boundingBox();
    expect(box?.x).toBeGreaterThanOrEqual(inside?.x as number);
    expect((box?.y as number) + (box?.height as number)).toBeLessThanOrEqual((inside?.y as number) + (inside?.height as number) + 1);
    const brand = page.locator("#brand");
    await expect(brand).toHaveText("from context 0");
    await brand.click();
    await expect(brand).toHaveText("from context 1");
    await expect(page.locator(".before-triple").first()).toBeVisible();
    await expect(page.locator(".after-row").first()).toBeVisible();
  });

  test("items order a container; fields change the attributes", async ({ page }) => {
    await open(page, "c-slots");
    await ready(page);
    await pick(page, "API Gateway");
    const y = async (selector: string) => (await page.locator(selector).first().boundingBox())?.y ?? -1;
    expect(await y(".a .triples")).toBeLessThan(await y(".a .facts"));
    const x = async (selector: string) => (await page.locator(selector).first().boundingBox())?.x ?? -1;
    expect(await x("#mine")).toBeGreaterThan(0);
    await expect(page.locator(".a .controls .ctl-btn")).toHaveCount(2);
    await page.locator(".a .facts-more").click().catch(() => undefined);
    const facts = page.locator(".a .facts");
    await expect(facts).toContainText("Written in");
    await expect(facts).toContainText("<Go>");
    await expect(facts).toContainText("owner of API Gateway");
    await expect(facts).not.toContainText("Replicas");
    await expect(page.locator("#legend")).toBeVisible();
  });

  test("without React, a function gets an element and a cleanup runs", async ({ page }) => {
    await open(page, "c-dom");
    await ready(page);
    await pick(page, "API Gateway");
    await expect(page.locator("#dom-notes")).toContainText("DOM notes of API Gateway");
    await expect(page.locator("#dom-notes")).toBeVisible();
  });
});

test.describe("canvas nodes", () => {
  test("a React component is a node: it moves with the canvas, and a press selects", async ({ page }) => {
    await open(page, "c-nodes");
    await ready(page);
    const node = page.locator(".react-node").first();
    await expect(node).toBeVisible();
    await page.waitForTimeout(900);
    const box = await node.boundingBox();
    expect(box?.width).toBeGreaterThan(0);
    // The group of the node holds the slot.
    await expect(page.locator(".a g.qt-node foreignObject slot").first()).toBeAttached();
    await node.click({ position: { x: 4, y: 4 } });
    await expect(node).toHaveAttribute("data-selected", "true");
    await expect(page.locator(".a .insp-title")).toHaveCount(1);
    // A control in the node works, with its own state, and does not select.
    await node.locator(".node-button").click();
    await expect(node.locator(".node-button")).toHaveText("1");
    // Zoom moves it with the canvas.
    await page.waitForTimeout(700);
    const start = await node.boundingBox();
    const stage = await page.locator(".a .qt-svg").boundingBox();
    await page.mouse.move((stage?.x as number) + 20, (stage?.y as number) + 300);
    await page.mouse.wheel(0, -600);
    await page.waitForTimeout(700);
    const zoomed = await node.boundingBox();
    expect(zoomed?.width).not.toBe(start?.width);
    // A type that does not match keeps the default mark.
    await expect(page.locator(".a g.qt-node use").first()).toBeAttached();
  });

  test("the layout makes room by the size that the developer gives", async ({ page }) => {
    await open(page, "c-nodes");
    await ready(page);
    const box = page.locator(".a g.qt-node foreignObject").first();
    await expect(box).toHaveAttribute("width", "120");
    await expect(box).toHaveAttribute("height", "44");
  });

  test("double press, tooltip and edge style are the developer's", async ({ page }) => {
    await open(page, "c-nodes");
    await ready(page);
    const node = page.locator(".react-node").first();
    await page.waitForTimeout(900);
    await node.hover({ position: { x: 4, y: 4 } });
    await expect(page.locator("#my-tip")).toContainText("node");
    await node.dblclick({ position: { x: 4, y: 4 } });
    await expect.poll(async () => (await logged(page, "activate")).length).toBeGreaterThan(0);
    expect(await css(page, ".a path.qt-edge", "stroke-width")).toBe("4px");
  });
});

test.describe("filters and display options", () => {
  test("a custom filter takes nodes off the canvas", async ({ page }) => {
    await open(page, "c-filters");
    await ready(page);
    await page.waitForTimeout(600);
    const before = await page.locator(".a g.qt-node").count();
    await page.locator(".a .custom-filter", { hasText: "Only Go" }).click();
    await expect.poll(() => page.locator(".a g.qt-node").count()).toBeLessThan(before);
    await expect(page.locator(".a .custom-filter", { hasText: "Only Go" })).toHaveAttribute("aria-pressed", "true");
    expect((await logged(page, "filters")).at(-1).custom).toContain("go");
    await page.locator(".a .custom-filter", { hasText: "Only Go" }).click();
    await expect.poll(() => page.locator(".a g.qt-node").count()).toBe(before);
  });

  test("a family can start off", async ({ page }) => {
    await open(page, "c-filters");
    await ready(page);
    await expect(page.locator(".a .fam-tab", { hasText: "Ownership" })).toHaveAttribute("aria-pressed", "false");
  });

  test("budgets, layouts, a custom layout and a hidden menu", async ({ page }) => {
    await open(page, "c-display");
    await ready(page);
    await expect(page.locator(".a g.qt-node")).toHaveCount(3);
    await page.waitForTimeout(900);
    // The custom layout is the start: a line.
    const ys = await page.locator(".a g.qt-node").evaluateAll((all) =>
      all.map((el) => (el as SVGGElement).getAttribute("transform")?.match(/,(-?[\d.]+)\)/)?.[1]),
    );
    expect(new Set(ys).size).toBe(1);
    // Scope, types, layout and the table button; the grouping menu is hidden.
    await expect(page.locator(".a .controls .ctl-btn")).toHaveCount(4);
    const buttons = page.locator(".a .controls .ctl-btn");
    await buttons.nth(0).click();
    await expect(page.locator(".a .scope-menu")).toContainText("7");
    await page.keyboard.press("Escape");
    await buttons.nth(2).click();
    const menu = page.locator(".a .menu:not([hidden])").last();
    await expect(menu).toContainText("In a line");
    await expect(menu).not.toContainText("Atomic");
    await expect(buttons.nth(2)).toContainText("In a line");
    await page.keyboard.press("Escape");
  });
});

test.describe("commands and events", () => {
  test("a ref drives each piece and reads the state", async ({ page }) => {
    await open(page, "c-commands");
    await ready(page);
    await page.click("#c-focus");
    await expect(page.locator(".a .insp-title")).toContainText("API Gateway");
    await page.click("#c-layout");
    await page.click("#c-table");
    await expect(page.locator(".a .wb-table")).toBeVisible();
    await page.click("#c-sort");
    await page.click("#c-search");
    await expect(page.locator(".a .search-results")).toBeVisible();
    await page.keyboard.press("Escape");
    await page.click("#c-inspector");
    await expect(page.locator(".a .inspector")).toHaveAttribute("data-state", "collapsed");
    // The state is the state of the settled chart, so it follows a move when the move ends.
    const read = async () => {
      await page.click("#c-state");
      return JSON.parse((await page.locator("#state").textContent()) as string);
    };
    await expect.poll(async () => (await read()).layout).toBe("tree-v");
    const state = await read();
    expect(state.selection).toEqual({ node: "gw" });
    expect(state.table.open).toBe(true);
    expect(state.table.filters.rowType).toBe("edges");
    expect(state.inspectorOpen).toBe(false);
    expect(await logged(page, "state")).toContain("tree-v");
    expect(await logged(page, "action")).toContain("focus");
  });

  test("a handler sees the source part, and can stop the action", async ({ page }) => {
    await open(page, "c-commands&stop");
    await ready(page);
    const tab = page.locator(".a .fam-tab").first();
    const pressed = await tab.getAttribute("aria-pressed");
    await tab.click();
    const seen = await logged(page, "family");
    expect(seen[0].part).toBe("family-tab");
    expect(await tab.getAttribute("aria-pressed")).toBe(pressed);
    expect(await logged(page, "press-tab")).toHaveLength(1);
  });

  test("a press on a node can be stopped", async ({ page }) => {
    await open(page, "c-commands&noSelect");
    await ready(page);
    await pick(page, "API Gateway");
    expect(await logged(page, "node-select")).toContain("gw");
    await expect(page.locator(".a .insp-title")).toHaveCount(0);
  });
});

test.describe("keys", () => {
  test("a key can change or go", async ({ page }) => {
    await open(page, "c-keys");
    await ready(page);
    await page.locator(".a g.qt-node").first().hover();
    await page.keyboard.press("/");
    await expect(page.locator(".a .search input")).not.toBeFocused();
    await expect(page.locator(".a .search kbd")).toHaveCount(0);
    await page.keyboard.press("Control+.");
    await expect(page.locator(".a .wb-table")).toHaveCount(0);
    await page.keyboard.press("Control+j");
    await expect(page.locator(".a .wb-table")).toBeVisible();
  });

  test("all keys can go", async ({ page }) => {
    await open(page, "c-keys&off");
    await ready(page);
    await page.locator(".a g.qt-node").first().hover();
    await page.keyboard.press("Control+.");
    await expect(page.locator(".a .wb-table")).toHaveCount(0);
  });
});

test.describe("profile", () => {
  test("defineProfile makes types, icons and families; a bad icon is an error", async ({ page }) => {
    await open(page, "c-profile");
    await ready(page);
    const [rejected] = await logged(page, "rejected");
    expect(rejected[0]).toContain("<script> is not allowed");
    expect(rejected[1]).toContain("onclick");
    await expect(page.locator(".a g.qt-node", { hasText: "R2" })).toBeAttached();
    await expect(page.locator(".a symbol circle")).toHaveAttribute("stroke", "#123456");
    const tab = page.locator(".a .fam-tab", { hasText: "Traffic" });
    await expect(tab).toBeVisible();
    expect(await tab.evaluate((el) => getComputedStyle(el).getPropertyValue("--main"))).toBe("#ff0000");
  });
});

test.describe("reuse", () => {
  test("a preset is the default, and props win by key", async ({ page }) => {
    await open(page, "c-presets");
    await ready(page);
    await expect(page.locator(".a .controls .ctl-btn")).toHaveCount(4);
    await expect(page.locator(".b .controls .ctl-btn")).toHaveCount(5);
    expect(await css(page, ".a .ctl-btn:last-child, .a .controls > button", "outline-style")).toBeDefined();
    expect(await page.locator(".a").evaluate((el) => (el as HTMLElement).shadowRoot?.adoptedStyleSheets.length)).toBeGreaterThan(1);
  });
});
