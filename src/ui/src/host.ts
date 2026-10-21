// why: SA §3 Rules, §4.6 (rule 3) — the shell names the narrow port that it needs; `apps/widget`
// implements it with the `HostBridge` (EPIC-006), so `ui` imports nothing from `apps`
export type ShellHost = {
  copyForAi(text: string): Promise<"sent" | "copied" | "failed">;
  openLink(url: string): Promise<void>;
  requestDisplayMode(mode: "inline" | "fullscreen"): Promise<void>;
};
