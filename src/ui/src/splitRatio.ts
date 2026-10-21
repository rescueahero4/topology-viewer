// why: SA §11 Data minimisation (ddr-0004), rule 11 — the only shell module that touches
// `localStorage` (lint exemption in scripts/eslint-shell.mjs); it keeps the canvas share only,
// never model data, and each access is in `try`/`catch`, because a host sandbox can refuse storage
const KEY = "qt.splitRatio";
export const DEFAULT_RATIO = 0.6;
export const MIN_RATIO = 0.2;
export const MAX_RATIO = 0.8;

const validRatio = (value: number) =>
  Number.isFinite(value) && value >= MIN_RATIO && value <= MAX_RATIO;

export function readRatio(): number {
  try {
    const text = localStorage.getItem(KEY);
    const value = text === null ? Number.NaN : Number(text);
    return validRatio(value) ? value : DEFAULT_RATIO;
  } catch {
    return DEFAULT_RATIO;
  }
}

export function writeRatio(value: number): void {
  try {
    localStorage.setItem(KEY, String(value));
  } catch {
    // why: rule 11 — a refused write changes nothing; the share stays for this mount only
  }
}
