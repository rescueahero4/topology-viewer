import { configDefaults, defineConfig } from "vitest/config";

// Timing tests run after the unit tests, one file at a time, so that the load of other test files
// cannot make them fail.
const TIMING = ["src/**/bounded.test.ts", "src/**/*.perf.test.ts"];

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["src/**/*.test.{ts,tsx}"],
          exclude: [...configDefaults.exclude, ...TIMING],
          sequence: { groupOrder: 0 },
        },
      },
      {
        test: {
          name: "timing",
          include: TIMING,
          fileParallelism: false,
          sequence: { groupOrder: 1 },
        },
      },
    ],
  },
});
