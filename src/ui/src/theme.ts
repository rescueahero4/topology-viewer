// why: PRD NF-9 addendum 0.18.1, SA §2 Styling addendum — dark mode is switched off, not removed;
// this is the one switch, and a later release sets it to true in one change
export const DARK_MODE: boolean = false;

// why: SA §2 Styling addendum — the only theme function; each host or browser theme value goes
// through it, so the look is light while the switch is off
export function effectiveTheme(requested: unknown): "light" | "dark" {
  return DARK_MODE && requested === "dark" ? "dark" : "light";
}
