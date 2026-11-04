import { useEffect, useState } from "react";
import { DARK_THEME } from "../demos/data/dark-theme";

const current = (): "light" | "dark" =>
  document.documentElement.dataset.theme === "dark" ? "dark" : "light";

/** Follows the light and dark switch of the site. */
export function useSiteTheme(): "light" | "dark" {
  const [theme, setTheme] = useState(current);
  useEffect(() => {
    const watch = new MutationObserver(() => setTheme(current()));
    watch.observe(document.documentElement, { attributeFilter: ["data-theme"] });
    return () => watch.disconnect();
  }, []);
  return theme;
}

const kebab = (key: string) =>
  key
    .replace(/[A-Z]/g, (one) => `-${one.toLowerCase()}`)
    .replace(/([a-z])(\d)/g, "$1-$2");

// The tokens inherit into the viewer, so a demo follows the site with no code of its own.
export const darkTokens: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(DARK_THEME)
    .filter(([key]) => key !== "colorScheme")
    .map(([key, value]) => [`--tv-${kebab(key)}`, value]),
);
