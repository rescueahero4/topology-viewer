import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 2,
  timeout: 45_000,
  reporter: [["list"]],
  use: { viewport: { width: 1280, height: 900 } },
  projects: [
    { name: "dev", use: { baseURL: "http://127.0.0.1:4601" } },
    {
      name: "prod",
      use: { baseURL: "http://127.0.0.1:4602" },
      grep: /@prod/,
    },
  ],
  webServer: [
    {
      command: "node server/api.mjs",
      url: "http://127.0.0.1:4600/api/graphs",
      reuseExistingServer: true,
    },
    {
      command: "npx vite --host 127.0.0.1 --port 4601 --strictPort",
      url: "http://127.0.0.1:4601/",
      reuseExistingServer: false,
    },
    {
      command: "npx vite preview --host 127.0.0.1 --port 4602 --strictPort",
      url: "http://127.0.0.1:4602/",
      reuseExistingServer: false,
    },
  ],
});
