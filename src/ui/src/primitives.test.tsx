// @vitest-environment jsdom
// @vitest-environment-options {"runScripts":"outside-only"}
import type { OnCanvas } from "@qdic-topology/engine";
import { render, type ComponentChildren } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { Checkbox } from "./Checkbox";
import { EyeIcon } from "./EyeIcon";
import { Menu, MenuItem } from "./Menu";
import { Radio } from "./Radio";
import { lang } from "./state";
import { t } from "./strings/index";
import { Tooltip } from "./Tooltip";
import { UiIcon } from "./UiIcon";

let root: HTMLElement;
function mount(node: ComponentChildren): HTMLElement {
  root = document.createElement("div");
  document.body.appendChild(root);
  void act(() => render(node, root));
  return root;
}
afterEach(() => {
  void act(() => render(null, root));
  root.remove();
  lang.value = "en";
});

const fire = (el: Element, type: string, init: object = {}) =>
  void act(() => {
    el.dispatchEvent(new Event(type, { bubbles: true, ...init }));
  });
const key = (el: Element, value: string) =>
  void act(() => {
    el.dispatchEvent(
      new KeyboardEvent("keydown", { key: value, bubbles: true }),
    );
  });

describe("S10 Checkbox, Radio and EyeIcon", () => {
  it("gives aria-checked true, false and mixed, and Space toggles", () => {
    const seen: boolean[] = [];
    const el = mount(
      <>
        <Checkbox checked label="a" onChange={(v) => seen.push(v)} />
        <Checkbox checked={false} label="b" onChange={(v) => seen.push(v)} />
        <Checkbox
          checked={false}
          partial
          label="c"
          onChange={(v) => seen.push(v)}
        />
      </>,
    );
    const boxes = [...el.querySelectorAll('[role="checkbox"]')];
    expect(boxes.map((b) => b.getAttribute("aria-checked"))).toEqual([
      "true",
      "false",
      "mixed",
    ]);
    expect(boxes[2].querySelector(".cb path")?.getAttribute("d")).toBe(
      "M4 8h8",
    );
    expect(boxes[0].querySelector(".cb path")?.getAttribute("d")).not.toBe(
      "M4 8h8",
    );
    expect(boxes[1].querySelector(".cb svg")).toBeNull();
    (boxes[1] as HTMLElement).focus();
    key(boxes[1], " ");
    key(boxes[0], " ");
    key(boxes[2], " ");
    expect(seen).toEqual([true, false, true]);
  });

  it("gives a radio its state and selects it with Space", () => {
    let picked = 0;
    const el = mount(
      <>
        <Radio checked label="one" onSelect={() => (picked += 1)} />
        <Radio checked={false} label="two" onSelect={() => (picked += 10)} />
      </>,
    );
    const radios = [...el.querySelectorAll('[role="radio"]')];
    expect(radios.map((r) => r.getAttribute("aria-checked"))).toEqual([
      "true",
      "false",
    ]);
    key(radios[1], " ");
    expect(picked).toBe(10);
  });

  it("draws three glyphs for drawn, not-drawn and hidden with names from the tables", () => {
    const states: OnCanvas[] = ["drawn", "not-drawn", "hidden"];
    const el = mount(states.map((s) => <EyeIcon key={s} state={s} />));
    const icons = [...el.querySelectorAll('[role="img"]')];
    const glyphs = icons.map((i) => i.innerHTML);
    expect(new Set(glyphs).size).toBe(2);
    expect(icons.map((i) => i.getAttribute("class"))).toEqual([
      "oc on",
      "oc",
      "oc hid",
    ]);
    expect(icons.map((i) => i.getAttribute("aria-label"))).toEqual(
      ["eye.drawn", "eye.notDrawn", "eye.hidden"].map((k) =>
        t("en", k as "eye.drawn"),
      ),
    );
  });
});

describe("S25 the faded eye", () => {
  it.each(["en", "ja"] as const)(
    "in %s has the drawn glyph and its own name and tip",
    (l) => {
      lang.value = l;
      const el = mount(
        <>
          <EyeIcon state="drawn" />
          <EyeIcon state="faded" />
        </>,
      );
      const [drawn, faded] = [...el.querySelectorAll('[role="img"]')];
      const paths = (i: Element) =>
        [...i.querySelectorAll("path, circle")].map((p) => p.outerHTML);
      expect(paths(faded)).toEqual(paths(drawn));
      expect(faded.getAttribute("class")).toBe(drawn.getAttribute("class"));
      const name = faded.getAttribute("aria-label") ?? "";
      expect(name).toBe(t(l, "eye.faded"));
      expect(name).not.toBe(drawn.getAttribute("aria-label"));
      expect(name).not.toContain(l === "en" ? "hidden" : "非表示");
      if (l === "en") expect(name).toBe("Faded by Group around root");
      void act(() => (faded as HTMLElement).focus());
      expect(el.querySelector('[role="tooltip"]')?.textContent).toBe(
        t(l, "eye.fadedTip"),
      );
      if (l === "en")
        expect(el.querySelector('[role="tooltip"]')?.textContent).toBe("faded");
    },
  );
});

describe("S11 Menu", () => {
  function two() {
    return mount(
      <>
        <Menu label="First" buttonClass="b1">
          <p class="menu-label">Head</p>
          <MenuItem kind="radio" checked onSelect={() => {}}>
            One
          </MenuItem>
          <hr />
          <MenuItem kind="check" checked={false} onSelect={() => {}}>
            Two
          </MenuItem>
          <MenuItem kind="action" onSelect={() => {}}>
            Three
          </MenuItem>
        </Menu>
        <Menu label="Second" buttonClass="b2">
          <MenuItem kind="action" onSelect={() => {}}>
            Other
          </MenuItem>
        </Menu>
        <p id="outside">x</p>
      </>,
    );
  }
  const menus = (el: Element) => [
    ...el.querySelectorAll<HTMLElement>('[role="menu"]'),
  ];
  const click = (el: Element | null) =>
    void act(() => (el as HTMLElement).click());

  it("focuses the first item, closes on Escape, keeps one open, closes on a press outside", () => {
    const el = two();
    const [b1, b2] = [el.querySelector(".b1"), el.querySelector(".b2")];
    click(b1);
    expect(menus(el).map((m) => m.hidden)).toEqual([false, true]);
    expect(document.activeElement?.textContent).toBe("One");
    expect(b1?.getAttribute("aria-expanded")).toBe("true");
    key(document.activeElement as Element, "Escape");
    expect(menus(el)[0].hidden).toBe(true);
    expect(document.activeElement).toBe(b1);
    click(b1);
    click(b2);
    expect(menus(el).map((m) => m.hidden)).toEqual([true, false]);
    click(el.querySelector("#outside"));
    expect(menus(el).map((m) => m.hidden)).toEqual([true, true]);
  });

  it("gives each item its role and state on one line", () => {
    const el = two();
    const items = [...el.querySelectorAll(".menu-item")];
    expect(items.map((i) => i.getAttribute("role"))).toEqual([
      "menuitemradio",
      "menuitemcheckbox",
      "menuitem",
      "menuitem",
    ]);
    expect(items.map((i) => i.getAttribute("aria-checked"))).toEqual([
      "true",
      "false",
      null,
      null,
    ]);
  });
});

describe("S12 Tooltip", () => {
  it("shows its text node on hover and focus and hides on Escape", () => {
    const el = mount(
      <Tooltip tip="Free-form, clusters by connection" class="info ic">
        <UiIcon name="info" />
      </Tooltip>,
    );
    const anchor = el.querySelector(".info") as HTMLElement;
    const tip = () => el.querySelector('[role="tooltip"]');
    expect(tip()).toBeNull();
    fire(anchor, "mouseenter", { bubbles: false });
    expect(tip()?.textContent).toBe("Free-form, clusters by connection");
    fire(anchor, "mouseleave", { bubbles: false });
    expect(tip()).toBeNull();
    void act(() => anchor.focus());
    expect(tip()?.firstChild?.nodeType).toBe(Node.TEXT_NODE);
    key(anchor, "Escape");
    expect(tip()).toBeNull();
    void act(() => anchor.focus());
    for (const node of [el, ...el.querySelectorAll("*")])
      for (const attr of node.attributes)
        expect(attr.value).not.toContain("Free-form");
  });
});
