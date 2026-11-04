import type { TopologyOptions, TopologyTheme } from "../../types/index";

// A theme is a list of public tokens. A key in camel case names the token `--tv-<kebab case>`; a key
// that starts with `--` is a token as it stands. The tokens go on the host of the Shadow DOM.

const SAFE_VALUE = /^[^;{}<>]*$/;

const tokenOf = (key: string) =>
  key.startsWith("--")
    ? key
    : `--tv-${key
        .replace(/[A-Z]/g, (one) => `-${one.toLowerCase()}`)
        .replace(/([a-z])(\d)/g, "$1-$2")}`;

type Resolved = {
  name: string;
  tokens: Readonly<TopologyTheme>;
};

const dark = (doc: Document) =>
  doc.defaultView?.matchMedia?.("(prefers-color-scheme: dark)").matches === true;

/** The theme that shows: `theme`, then the theme of the colour mode over it. */
export function themeOf(options: TopologyOptions, doc: Document): Resolved {
  const { theme, themes, colorMode = "light" } = options;
  const name = colorMode === "system" ? (dark(doc) ? "dark" : "light") : colorMode;
  const own =
    themes !== undefined && Object.hasOwn(themes, name) ? themes[name] : undefined;
  return { name, tokens: { ...theme, ...own } };
}

export function themeCss({ name, tokens }: Resolved): string {
  const lines = Object.entries(tokens).flatMap(([key, value]) => {
    if (value === undefined || key === "colorScheme") return [];
    const text = String(value);
    // A token is one value. A value that could end the rule is left out.
    return SAFE_VALUE.test(text) ? [`${tokenOf(key)}: ${text};`] : [];
  });
  const given = tokens.colorScheme;
  const scheme =
    typeof given === "string" && SAFE_VALUE.test(given)
      ? given
      : name === "dark"
        ? "dark"
        : "light";
  return `:host {\n${lines.join("\n")}\ncolor-scheme: ${scheme};\n}`;
}

/** The colour of the canvas: from the theme, or from a token that the page sets by CSS. */
export function canvasOf(
  tokens: Readonly<TopologyTheme>,
  host: HTMLElement,
): string | undefined {
  const given = tokens.canvas;
  if (typeof given === "string") return given;
  const view = host.ownerDocument.defaultView;
  const value = view?.getComputedStyle(host).getPropertyValue("--tv-canvas").trim();
  return value === undefined || value === "" ? undefined : value;
}

/** Calls back when the system colour mode changes. */
export function useSystemMode(doc: Document, changed: () => void): () => void {
  const query = doc.defaultView?.matchMedia?.("(prefers-color-scheme: dark)");
  query?.addEventListener("change", changed);
  return () => query?.removeEventListener("change", changed);
}
